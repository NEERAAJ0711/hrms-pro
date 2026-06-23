// HRMS Pro — Phase 3 Recruitment AI routes (additive; does not modify the
// existing recruitment endpoints). All endpoints enforce auth + recruitment
// roles + company isolation, persist AI results on the live application rows,
// and degrade gracefully when no AI key or no candidate data is available.
import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { recruitmentService } from "../services";
import { requireAuth, requireRole } from "./shared";
import { docUpload } from "./shared";
import {
  extractResumeText,
  parseResumeText,
  isResumeExtractable,
  scoreCandidate,
  matchJd,
  summarizeCandidate,
  generateInterviewQuestions,
  rankCandidates,
  findDuplicates,
  computeRecruitmentDashboard,
  searchCandidates,
  type JobContext,
  type CandidateContext,
  type ParsedResume,
  type DedupeCandidate,
  type SearchableCandidate,
  type ScoredInput,
} from "../ai";
import { maskMobile } from "../ai/security/masking";

const RECRUITMENT_ROLES = ["super_admin", "company_admin", "hr_admin", "recruiter"] as const;

// Resolve a stored resumeUrl ("/uploads/...") to an absolute path, refusing any
// path that escapes the uploads directory (path-traversal guard).
function resolveUploadPath(resumeUrl: string | null | undefined): string | null {
  if (!resumeUrl) return null;
  const clean = resumeUrl.split("?")[0];
  const resolved = path.resolve(process.cwd(), "." + (clean.startsWith("/") ? clean : "/" + clean));
  const base = path.resolve(process.cwd(), "uploads");
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

function postingToJob(p: any): JobContext {
  return {
    title: p.title,
    department: p.department,
    location: p.location,
    employmentType: p.employmentType,
    description: p.description,
    requirements: p.requirements,
    salaryRange: p.salaryRange,
  };
}

function appToCandidate(app: any): CandidateContext {
  const parsed = (app.parsedResume || null) as ParsedResume | null;
  return {
    name: app.applicantName,
    parsed,
    resumeText: app.resumeText,
    skills: parsed?.skills?.join(", ") || null,
    currentSalary: parsed?.currentSalary || null,
    expectedSalary: parsed?.expectedSalary || null,
    location: parsed?.location || null,
  };
}

export async function registerRecruitmentAiRoutes(app: Express): Promise<void> {
  // Load an application and enforce company isolation. Returns null + sends the
  // response on failure so callers can `if (!app) return;`.
  async function loadOwnedApplication(req: Request, res: Response) {
    const user = (req as any).user;
    const application = await recruitmentService.getJobApplication(String(req.params.id));
    if (!application) {
      res.status(404).json({ error: "Application not found" });
      return null;
    }
    if (user.role !== "super_admin" && application.companyId !== user.companyId) {
      res.status(403).json({ error: "Access denied" });
      return null;
    }
    return application;
  }

  // Resolve the job posting to score/match against. A caller may override the
  // application's own posting via body.jobId, but the resolved posting must belong
  // to the same company as the application (super_admin excepted) — otherwise a
  // user could force scoring against another tenant's posting.
  async function resolveJob(req: Request, application: any) {
    const user = (req as any).user;
    const jobId = (req.body?.jobId as string) || application.jobPostingId;
    if (!jobId) return undefined;
    const posting = await recruitmentService.getJobPosting(jobId);
    if (!posting) return undefined;
    if (user.role !== "super_admin" && posting.companyId !== application.companyId) {
      return undefined;
    }
    return posting;
  }

  // ── Parse an uploaded resume file (review-before-save) ───────────────────────
  // Multipart: field "resume". Optionally persists to an application via body.applicationId.
  app.post(
    "/api/recruitment/parse-resume",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    docUpload.single("resume"),
    async (req: Request, res: Response) => {
      const file = (req as any).file;
      try {
        if (!file) return res.status(400).json({ error: "No resume file uploaded." });
        if (!isResumeExtractable(file.originalname)) {
          return res.status(400).json({ error: "Unsupported file type. Upload a PDF, DOCX, or TXT resume." });
        }
        const textResult = await extractResumeText(file.path, file.originalname);
        if (!textResult.ok || !textResult.text) {
          return res.status(422).json({ error: "Could not read text from this resume.", reason: textResult.reason });
        }
        const parsed = await parseResumeText(textResult.text, (req as any).user?.companyId);
        if (!parsed.available) {
          return res.status(parsed.reason === "no_ai_key" ? 200 : 422).json({
            available: false,
            reason: parsed.reason,
            message: parsed.message,
            resumeText: textResult.text,
          });
        }

        // Optionally persist onto an owned application.
        const applicationId = req.body?.applicationId as string | undefined;
        if (applicationId) {
          const user = (req as any).user;
          const application = await recruitmentService.getJobApplication(applicationId);
          if (application && (user.role === "super_admin" || application.companyId === user.companyId)) {
            await recruitmentService.updateJobApplication(applicationId, {
              resumeText: textResult.text,
              parsedResume: parsed.data as any,
            });
          }
        }

        res.json({ available: true, parsed: parsed.data, resumeText: textResult.text });
      } finally {
        // The uploaded file was only needed for text extraction.
        if (file?.path) fs.promises.unlink(file.path).catch(() => {});
      }
    },
  );

  // ── (Re)parse the resume already attached to an application ───────────────────
  app.post(
    "/api/recruitment/applications/:id/parse-resume",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const abs = resolveUploadPath(application.resumeUrl);
      if (!abs || !fs.existsSync(abs)) {
        return res.status(404).json({ error: "No resume file is attached to this application." });
      }
      if (!isResumeExtractable(abs)) {
        return res.status(400).json({ error: "Attached resume is not a supported type (PDF, DOCX, TXT)." });
      }
      const textResult = await extractResumeText(abs, abs);
      if (!textResult.ok || !textResult.text) {
        return res.status(422).json({ error: "Could not read text from the attached resume.", reason: textResult.reason });
      }
      const parsed = await parseResumeText(textResult.text, (req as any).user?.companyId);
      if (!parsed.available) {
        return res.status(parsed.reason === "no_ai_key" ? 200 : 422).json({
          available: false,
          reason: parsed.reason,
          message: parsed.message,
        });
      }
      const updated = await recruitmentService.updateJobApplication(application.id, {
        resumeText: textResult.text,
        parsedResume: parsed.data as any,
      });
      res.json({ available: true, parsed: parsed.data, application: updated });
    },
  );

  // ── Score a candidate against a job (persists score) ─────────────────────────
  app.post(
    "/api/recruitment/applications/:id/score",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const job = await resolveJob(req, application);
      if (!job) return res.status(404).json({ error: "Job posting not found for scoring." });

      const result = await scoreCandidate(postingToJob(job), appToCandidate(application), application.companyId);
      if (!result.available) {
        return res.status(result.reason === "no_ai_key" ? 200 : 422).json(result);
      }
      const updated = await recruitmentService.updateJobApplication(application.id, {
        aiScore: result.data.score,
        aiScoreBreakdown: result.data as any,
        aiScoredJobId: job.id,
        aiScoredAt: new Date().toISOString(),
      });
      res.json({ available: true, score: result.data, application: updated });
    },
  );

  // ── Match resume to a job description (ephemeral) ─────────────────────────────
  app.post(
    "/api/recruitment/applications/:id/match",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const job = await resolveJob(req, application);
      if (!job) return res.status(404).json({ error: "Job posting not found for matching." });
      const result = await matchJd(postingToJob(job), appToCandidate(application), application.companyId);
      res.status(result.available ? 200 : result.reason === "no_ai_key" ? 200 : 422).json(result);
    },
  );

  // ── Candidate summary (persists summary) ─────────────────────────────────────
  app.post(
    "/api/recruitment/applications/:id/summary",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const result = await summarizeCandidate(appToCandidate(application), application.companyId);
      if (!result.available) {
        return res.status(result.reason === "no_ai_key" ? 200 : 422).json(result);
      }
      const updated = await recruitmentService.updateJobApplication(application.id, {
        aiSummary: result.data.summary,
      });
      res.json({ available: true, summary: result.data, application: updated });
    },
  );

  // ── Interview question generation (persists questions) ───────────────────────
  app.post(
    "/api/recruitment/applications/:id/questions",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const job = await resolveJob(req, application);
      if (!job) return res.status(404).json({ error: "Job posting not found for question generation." });
      const result = await generateInterviewQuestions(postingToJob(job), appToCandidate(application), application.companyId);
      if (!result.available) {
        return res.status(result.reason === "no_ai_key" ? 200 : 422).json(result);
      }
      const updated = await recruitmentService.updateJobApplication(application.id, {
        aiQuestions: result.data as any,
      });
      res.json({ available: true, questions: result.data, application: updated });
    },
  );

  // ── Duplicate detection within the company ───────────────────────────────────
  app.get(
    "/api/recruitment/applications/:id/duplicates",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const application = await loadOwnedApplication(req, res);
      if (!application) return;
      const companyId = application.companyId;
      const all = await recruitmentService.getJobApplicationsByCompany(companyId);
      const toDedupe = (a: any): DedupeCandidate => {
        const parsed = (a.parsedResume || {}) as ParsedResume;
        return {
          applicationId: a.id,
          name: a.applicantName,
          email: a.applicantEmail || parsed.email,
          phone: a.applicantPhone || parsed.phone,
          pan: null,
          company: parsed.currentCompany,
          resumeText: a.resumeText,
        };
      };
      const matches = findDuplicates(toDedupe(application), all.map(toDedupe));
      res.json({ duplicates: matches });
    },
  );

  // ── Rank all candidates for a posting (deterministic, scored) ────────────────
  app.post(
    "/api/recruitment/postings/:id/rank",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      const posting = await recruitmentService.getJobPosting(String(req.params.id));
      if (!posting) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && posting.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const applications = await recruitmentService.getJobApplicationsByPosting(posting.id);
      const scorable = applications.filter((a: any) => a.parsedResume || a.resumeText);
      if (scorable.length === 0) {
        return res.json({ available: false, reason: "no_data", message: "No candidates with parsed resumes to rank yet.", ranked: [] });
      }

      const job = postingToJob(posting);
      const scored: ScoredInput[] = [];
      let noKey = false;
      for (const a of scorable) {
        const result = await scoreCandidate(job, appToCandidate(a), posting.companyId);
        if (!result.available) {
          if (result.reason === "no_ai_key") {
            noKey = true;
            break;
          }
          continue;
        }
        // Persist each score so the list view reflects it.
        await recruitmentService.updateJobApplication(a.id, {
          aiScore: result.data.score,
          aiScoreBreakdown: result.data as any,
          aiScoredJobId: posting.id,
          aiScoredAt: new Date().toISOString(),
        });
        scored.push({
          applicationId: a.id,
          candidateName: a.applicantName || "Unknown",
          score: result.data.score,
          recommendation: result.data.recommendation,
          rationale: result.data.rationale,
        });
      }

      if (noKey) {
        return res.status(200).json({
          available: false,
          reason: "no_ai_key",
          message: "AI is not configured. Add an OpenAI or Gemini API key in Settings → API Keys to rank candidates.",
          ranked: [],
        });
      }
      res.json({ available: true, ranked: rankCandidates(scored) });
    },
  );

  // ── Natural-language candidate search (deterministic) ────────────────────────
  app.post(
    "/api/recruitment/search",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      const query = String(req.body?.query || "").trim();
      if (!query) return res.status(400).json({ error: "Search query is required." });

      const applications =
        user.role === "super_admin"
          ? await recruitmentService.getAllJobApplications()
          : user.companyId
            ? await recruitmentService.getJobApplicationsByCompany(user.companyId)
            : [];

      const searchable: SearchableCandidate[] = applications.map((a: any) => {
        const parsed = (a.parsedResume || {}) as ParsedResume;
        return {
          applicationId: a.id,
          name: a.applicantName || "Unknown",
          status: a.status,
          location: parsed.location || null,
          skills: parsed.skills || null,
          experienceYears: parsed.totalExperienceYears ?? null,
          resumeText: a.resumeText,
          appliedAt: a.appliedAt,
        };
      });
      const results = searchCandidates(query, searchable);
      res.json({ query, count: results.length, results });
    },
  );

  // ── Recruitment dashboard (deterministic, live data) ─────────────────────────
  app.get(
    "/api/recruitment/dashboard",
    requireAuth,
    requireRole(...RECRUITMENT_ROLES),
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      const [postings, applications] =
        user.role === "super_admin"
          ? [await recruitmentService.getAllJobPostings(), await recruitmentService.getAllJobApplications()]
          : user.companyId
            ? [
                await recruitmentService.getJobPostingsByCompany(user.companyId),
                await recruitmentService.getJobApplicationsByCompany(user.companyId),
              ]
            : [[], []];

      const dashboard = computeRecruitmentDashboard(
        postings.map((p: any) => ({ status: p.status })),
        applications.map((a: any) => ({
          status: a.status,
          appliedAt: a.appliedAt,
          hiredAt: a.status === "hired" ? a.reviewedAt || a.updatedAt : null,
        })),
      );
      res.json(dashboard);
    },
  );
}

// Exported only so the test/intent layers can reuse the same masking decision.
export { maskMobile };
