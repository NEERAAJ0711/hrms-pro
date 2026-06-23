import { registerPrompt } from "../prompts/registry";

// Phase 3 — Recruitment AI prompt builders. All prompt text lives here (never
// inline in business logic) and is registered in the central prompt registry so
// it can be audited. Every prompt forbids fabrication and demands strict JSON.

const NO_FABRICATION =
  "Use ONLY information present in the provided text. Never invent, assume, or infer values that are not stated. " +
  "If something is not present, omit it or use an empty value. Return ONLY a valid JSON object, no prose.";

export function buildResumeParsePrompt(): string {
  return (
    "You are an expert technical recruiter parsing a candidate resume. Extract the candidate's details into JSON with these keys: " +
    "fullName (string), email (string), phone (string), location (string), currentCompany (string), currentDesignation (string), " +
    "totalExperienceYears (number), skills (string array), education (string array), " +
    "experience (array of objects with company, designation, duration), certifications (string array), languages (string array), " +
    "projects (string array), links (string array), noticePeriod (string), currentSalary (string), expectedSalary (string), " +
    "preferredLocation (string), summary (a 1-2 sentence neutral profile summary). " +
    NO_FABRICATION
  );
}

export function buildCandidateScorePrompt(): string {
  return (
    "You are a hiring evaluator. Given a JOB and a CANDIDATE, score how well the candidate fits the job. Return JSON with keys: " +
    "score (integer 0-100), recommendation (one of: strong_hire, hire, maybe, no_hire), " +
    "strengths (string array), weaknesses (string array), missingSkills (string array), rationale (string, 1-3 sentences). " +
    "Base the score strictly on the candidate's evidence against the job's requirements. " +
    NO_FABRICATION
  );
}

export function buildJdMatchPrompt(): string {
  return (
    "You compare a CANDIDATE resume to a JOB DESCRIPTION. Return JSON with keys: " +
    "matchPercent (integer 0-100), matchingSkills (string array), missingSkills (string array), extraSkills (string array), " +
    "experienceGap (string), qualificationGap (string), locationFit (string), salaryFit (string), summary (string). " +
    NO_FABRICATION
  );
}

export function buildCandidateSummaryPrompt(): string {
  return (
    "You write a concise recruiter-facing candidate summary. Return JSON with keys: " +
    "summary (string), careerProgression (string), strengths (string array), concerns (string array), " +
    "riskFactors (string array), recommendation (string). Be neutral and factual. " +
    NO_FABRICATION
  );
}

export function buildInterviewQuestionsPrompt(): string {
  return (
    "You generate interview questions tailored to a specific JOB and CANDIDATE. Return JSON with keys: " +
    "technical (string array), behavioural (string array), situational (string array), leadership (string array), " +
    "problemSolving (string array), communication (string array). Provide 3-5 focused questions per category, " +
    "relevant to the candidate's background and the role. " +
    NO_FABRICATION
  );
}

registerPrompt("recruitment.resumeParse", () => buildResumeParsePrompt());
registerPrompt("recruitment.candidateScore", () => buildCandidateScorePrompt());
registerPrompt("recruitment.jdMatch", () => buildJdMatchPrompt());
registerPrompt("recruitment.candidateSummary", () => buildCandidateSummaryPrompt());
registerPrompt("recruitment.interviewQuestions", () => buildInterviewQuestionsPrompt());
