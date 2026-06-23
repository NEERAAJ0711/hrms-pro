import type {
  ParsedResume,
  CandidateScore,
  JdMatch,
  CandidateSummary,
  InterviewQuestions,
  RankedCandidate,
  AiResult,
} from "./types";
import {
  buildCandidateScorePrompt,
  buildJdMatchPrompt,
  buildCandidateSummaryPrompt,
  buildInterviewQuestionsPrompt,
} from "./prompts";
import { callRecruitmentJson } from "./ai-json";
import { createHash } from "crypto";

// Phase 3 — Recruitment AI service. Scoring, JD matching, candidate summary and
// interview-question generation sit on top of the provider/prompt/cache layer.
// Ranking is deterministic (score-based, explained) and never random.

export interface JobContext {
  title: string;
  department?: string | null;
  location?: string | null;
  employmentType?: string | null;
  description: string;
  requirements?: string | null;
  salaryRange?: string | null;
}

export interface CandidateContext {
  name?: string | null;
  parsed?: ParsedResume | null;
  resumeText?: string | null;
  skills?: string | null;
  currentSalary?: string | null;
  expectedSalary?: string | null;
  location?: string | null;
}

function jobBlock(job: JobContext): string {
  const parts = [
    `Title: ${job.title}`,
    job.department ? `Department: ${job.department}` : "",
    job.location ? `Location: ${job.location}` : "",
    job.employmentType ? `Employment type: ${job.employmentType}` : "",
    job.salaryRange ? `Salary range: ${job.salaryRange}` : "",
    `Description: ${job.description}`,
    job.requirements ? `Requirements: ${job.requirements}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function candidateBlock(c: CandidateContext): string {
  const parts: string[] = [];
  if (c.name) parts.push(`Name: ${c.name}`);
  if (c.location) parts.push(`Location: ${c.location}`);
  if (c.currentSalary) parts.push(`Current salary: ${c.currentSalary}`);
  if (c.expectedSalary) parts.push(`Expected salary: ${c.expectedSalary}`);
  if (c.skills) parts.push(`Skills: ${c.skills}`);
  if (c.parsed) parts.push(`Parsed profile: ${JSON.stringify(c.parsed)}`);
  if (c.resumeText) parts.push(`Resume text:\n${c.resumeText.slice(0, 8000)}`);
  return parts.join("\n");
}

function hasCandidateEvidence(c: CandidateContext): boolean {
  return !!(c.parsed || (c.resumeText && c.resumeText.trim()) || (c.skills && c.skills.trim()));
}

function stableKey(feature: string, ...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("||")).digest("hex").slice(0, 16);
  return `${feature}:${h}`;
}

const noKey = (action: string) =>
  ({
    available: false as const,
    reason: "no_ai_key",
    message: `AI is not configured. Add an OpenAI or Gemini API key in Settings → API Keys to ${action}.`,
  });

const noData = (msg: string) => ({ available: false as const, reason: "no_data", message: msg });
const aiError = (msg: string) => ({ available: false as const, reason: "ai_error", message: msg });

function clampScore(n: any): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function strArr(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// ── Candidate scoring (0–100) against a job ───────────────────────────────────
export async function scoreCandidate(job: JobContext, c: CandidateContext, companyId?: string | null): Promise<AiResult<CandidateScore>> {
  if (!hasCandidateEvidence(c)) return noData("No resume or skills on file for this candidate to score.");
  const system = buildCandidateScorePrompt();
  const user = `JOB:\n${jobBlock(job)}\n\nCANDIDATE:\n${candidateBlock(c)}`;
  const outcome = await callRecruitmentJson({
    feature: "candidate_score",
    system,
    user,
    cacheKey: stableKey("candidate_score", user),
    companyId,
  });
  if (!outcome.ok) return outcome.reason === "no_ai_key" ? noKey("score candidates") : aiError("Could not score the candidate.");
  const d = outcome.data;
  const rec = ["strong_hire", "hire", "maybe", "no_hire"].includes(d.recommendation) ? d.recommendation : "maybe";
  return {
    available: true,
    data: {
      score: clampScore(d.score),
      recommendation: rec,
      strengths: strArr(d.strengths),
      weaknesses: strArr(d.weaknesses),
      missingSkills: strArr(d.missingSkills),
      rationale: String(d.rationale ?? "").trim(),
    },
  };
}

// ── Resume vs JD match ────────────────────────────────────────────────────────
export async function matchJd(job: JobContext, c: CandidateContext, companyId?: string | null): Promise<AiResult<JdMatch>> {
  if (!hasCandidateEvidence(c)) return noData("No resume or skills on file for this candidate to compare.");
  const system = buildJdMatchPrompt();
  const user = `JOB DESCRIPTION:\n${jobBlock(job)}\n\nCANDIDATE:\n${candidateBlock(c)}`;
  const outcome = await callRecruitmentJson({
    feature: "jd_match",
    system,
    user,
    cacheKey: stableKey("jd_match", user),
    companyId,
  });
  if (!outcome.ok) return outcome.reason === "no_ai_key" ? noKey("match resumes to a job") : aiError("Could not compare the resume to the job.");
  const d = outcome.data;
  return {
    available: true,
    data: {
      matchPercent: clampScore(d.matchPercent),
      matchingSkills: strArr(d.matchingSkills),
      missingSkills: strArr(d.missingSkills),
      extraSkills: strArr(d.extraSkills),
      experienceGap: String(d.experienceGap ?? "").trim(),
      qualificationGap: String(d.qualificationGap ?? "").trim(),
      locationFit: String(d.locationFit ?? "").trim(),
      salaryFit: String(d.salaryFit ?? "").trim(),
      summary: String(d.summary ?? "").trim(),
    },
  };
}

// ── Candidate summary ─────────────────────────────────────────────────────────
export async function summarizeCandidate(c: CandidateContext, companyId?: string | null): Promise<AiResult<CandidateSummary>> {
  if (!hasCandidateEvidence(c)) return noData("No resume or skills on file for this candidate to summarize.");
  const system = buildCandidateSummaryPrompt();
  const user = `CANDIDATE:\n${candidateBlock(c)}`;
  const outcome = await callRecruitmentJson({
    feature: "candidate_summary",
    system,
    user,
    cacheKey: stableKey("candidate_summary", user),
    companyId,
  });
  if (!outcome.ok) return outcome.reason === "no_ai_key" ? noKey("summarize candidates") : aiError("Could not summarize the candidate.");
  const d = outcome.data;
  return {
    available: true,
    data: {
      summary: String(d.summary ?? "").trim(),
      careerProgression: String(d.careerProgression ?? "").trim(),
      strengths: strArr(d.strengths),
      concerns: strArr(d.concerns),
      riskFactors: strArr(d.riskFactors),
      recommendation: String(d.recommendation ?? "").trim(),
    },
  };
}

// ── Interview question generation ─────────────────────────────────────────────
export async function generateInterviewQuestions(job: JobContext, c: CandidateContext, companyId?: string | null): Promise<AiResult<InterviewQuestions>> {
  if (!hasCandidateEvidence(c)) return noData("No resume or skills on file for this candidate to tailor interview questions.");
  const system = buildInterviewQuestionsPrompt();
  const user = `JOB:\n${jobBlock(job)}\n\nCANDIDATE:\n${candidateBlock(c)}`;
  const outcome = await callRecruitmentJson({
    feature: "interview_questions",
    system,
    user,
    cacheKey: stableKey("interview_questions", user),
    companyId,
  });
  if (!outcome.ok) return outcome.reason === "no_ai_key" ? noKey("generate interview questions") : aiError("Could not generate interview questions.");
  const d = outcome.data;
  return {
    available: true,
    data: {
      technical: strArr(d.technical),
      behavioural: strArr(d.behavioural ?? d.behavioral),
      situational: strArr(d.situational),
      leadership: strArr(d.leadership),
      problemSolving: strArr(d.problemSolving),
      communication: strArr(d.communication),
    },
  };
}

// ── Deterministic ranking ─────────────────────────────────────────────────────
// Pure function: orders already-scored candidates by score (desc), tie-broken by
// recommendation strength then name. Never random; explains each rank.
const REC_WEIGHT: Record<string, number> = { strong_hire: 3, hire: 2, maybe: 1, no_hire: 0 };

export interface ScoredInput {
  applicationId: string;
  candidateName: string;
  score: number;
  recommendation: string;
  rationale?: string;
}

export function rankCandidates(scored: ScoredInput[]): RankedCandidate[] {
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const rw = (REC_WEIGHT[b.recommendation] ?? 0) - (REC_WEIGHT[a.recommendation] ?? 0);
    if (rw !== 0) return rw;
    return a.candidateName.localeCompare(b.candidateName);
  });
  return sorted.map((s, i) => ({
    applicationId: s.applicationId,
    candidateName: s.candidateName,
    score: s.score,
    recommendation: s.recommendation,
    rank: i + 1,
    rationale: s.rationale || `Ranked #${i + 1} with a fit score of ${s.score}/100 (${s.recommendation.replace("_", " ")}).`,
  }));
}
