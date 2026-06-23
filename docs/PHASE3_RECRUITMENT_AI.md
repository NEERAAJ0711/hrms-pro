# Phase 3 — Enterprise Recruitment AI Suite

The Recruitment module is now an AI-assisted hiring tool. It **extends** the
existing job-postings / job-applications / candidate flow — it replaces nothing —
and reuses the Phase 1/2 AI plumbing (provider manager, prompt registry, AI
cache, usage logger, masking, intent engine). Everything runs on **live database
data only**: it never invents candidate details, and when an AI key or candidate
data is missing it says so plainly.

## What it does

- **Resume parsing** — extract text from PDF / DOCX / TXT, then AI-parse into
  structured fields (name, contact, skills, education, experience, companies,
  designation, total experience, certifications, languages, projects, links,
  notice period, salary, preferred location). Review-before-save; never silently
  overwrites manually entered values.
- **Candidate scoring (0–100)** against a chosen job, with strengths,
  weaknesses, missing skills, and a hire/no-hire recommendation.
- **Resume ↔ JD match** — match %, matching/missing/extra skills, experience and
  qualification gaps, location/salary fit, summary.
- **Interview question generation** — technical, behavioural, situational,
  leadership, problem-solving, communication.
- **Candidate summary** — profile, career progression, strengths, concerns, risk
  factors, recommendation.
- **Duplicate detection** — deterministic match on email / phone / PAN /
  name+company / resume similarity, surfaced as a "merge?" suggestion.
- **Deterministic ranking** — orders scored candidates by score (tie-broken by
  recommendation then name); never random, explains each rank.
- **Natural-language candidate search** — "React developer 5 years in Pune".
- **Recruitment dashboard** — open positions, pipeline, interview conversion,
  offer acceptance, time-to-hire — all computed from live data.

## Security model (same guarantees as Phase 2)

- **RBAC.** AI endpoints require one of `super_admin`, `company_admin`,
  `hr_admin`, `recruiter`. The intent layer authorizes `recruitment_dashboard`
  and `candidate_search` through the role table (recruitment is **not** in
  `MODULE_ACCESS`, so authorization is role-table only).
- **Company isolation.** Every application/posting is scoped to the actor's
  company (super-admin excepted). A caller may override the job to score against
  via `body.jobId`, but the resolved posting **must belong to the same company**
  as the application — cross-tenant job context is refused.
- **No fabrication / graceful degradation.** Missing AI key returns
  `reason: "no_ai_key"` at HTTP 200; no candidate evidence returns
  `reason: "no_data"`. Scoring, matching, summary, and interview-question
  generation all gate on candidate evidence before any AI call.
- **Determinism.** Ranking, search, dedupe, and the dashboard are pure functions —
  identical inputs always produce identical output, with no AI involvement.

## Verify (run from project root)

```bash
# ── Type + boot ──────────────────────────────────────────────────────────────
1.  node_modules/.bin/tsc --noEmit | grep -c "error TS"          # 298 (baseline, no new)
2.  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/   # 200

# ── Tests (node:test + tsx) ──────────────────────────────────────────────────
3.  node_modules/.bin/tsx --test server/__tests__/ai-recruitment.test.ts
4.  node_modules/.bin/tsx --test server/__tests__/ai-intents.test.ts
5.  node_modules/.bin/tsx --test server/__tests__/ai-extraction.test.ts

# ── Resume extraction packages installed via package manager (not hand-edited) ─
6.  grep -E '"(mammoth|pdf-parse)"' package.json
7.  rg -n "RESUME_EXTENSIONS|isResumeExtractable" server/ai/extraction/resume.ts

# ── AI recruitment service (score/match/summary/questions/rank) ───────────────
8.  rg -n "export async function|export function" server/ai/recruitment/service.ts
9.  rg -n "hasCandidateEvidence" server/ai/recruitment/service.ts    # gate on all 4 AI fns
10. rg -n "stableKey|cacheKey" server/ai/recruitment/service.ts      # cached by stable key

# ── Deterministic helpers ────────────────────────────────────────────────────
11. rg -n "export function rankCandidates" server/ai/recruitment/service.ts
12. rg -n "export function findDuplicates|resumeSimilarity" server/ai/recruitment/dedupe.ts
13. rg -n "export function searchCandidates|parseSearchQuery" server/ai/recruitment/search.ts
14. rg -n "export function computeRecruitmentDashboard" server/ai/recruitment/dashboard.ts

# ── API endpoints (RBAC + company isolation) ─────────────────────────────────
15. rg -n "app.(post|get)\(" server/routes/recruitment-ai-routes.ts
16. rg -n "RECRUITMENT_ROLES|requireRole" server/routes/recruitment-ai-routes.ts
17. rg -n "loadOwnedApplication|resolveJob" server/routes/recruitment-ai-routes.ts
18. rg -n "posting.companyId !== application.companyId" server/routes/recruitment-ai-routes.ts
19. rg -n "resolveUploadPath" server/routes/recruitment-ai-routes.ts   # path-traversal guard
20. rg -n "registerRecruitmentAiRoutes" server/routes/index.ts        # wired in

# ── Intent engine wiring ─────────────────────────────────────────────────────
21. rg -n "recruitment_dashboard|candidate_search" server/ai/intents/detector.ts
22. rg -n "recruitment_dashboard|candidate_search" server/ai/intents/registry.ts
23. rg -n "recruitment_dashboard|candidate_search" server/ai/intents/handlers/hr-admin.ts
24. rg -n "recruitment" server/ai/intents/context.ts                  # ADMIN_INTENT_ROLES

# ── Schema + migration (nullable, back-compat) ───────────────────────────────
25. rg -n "parsedResume|aiScore|resumeText|aiQuestions" shared/schema.ts
26. cat migrations/024_recruitment_ai.sql | head -20
27. rg -n "024_recruitment_ai|recruitment" server/routes/startup-migrations.ts

# ── Frontend ─────────────────────────────────────────────────────────────────
28. ls client/src/components/recruitment-ai-*.tsx
29. rg -n "recruitment-ai-insights|recruitment-ai-panel" client/src/pages/job-applications.tsx
30. rg -n "/rank|ListOrdered" client/src/pages/job-postings.tsx
```

## Example assistant commands

1. recruitment dashboard
2. hiring funnel metrics
3. recruitment dashboard summary
4. show the hiring pipeline
5. find candidates with React and 5 years experience
6. search applicants in Pune
7. find candidates in pipeline
8. list candidates with MBA

## Files

- `server/ai/extraction/resume.ts` — PDF/DOCX/TXT text extraction + AI parse
- `server/ai/recruitment/service.ts` — score, match, summary, questions, rank
- `server/ai/recruitment/dedupe.ts` — deterministic duplicate detection
- `server/ai/recruitment/search.ts` — natural-language candidate search
- `server/ai/recruitment/dashboard.ts` — live recruitment metrics
- `server/ai/recruitment/types.ts` — recruitment AI types
- `server/routes/recruitment-ai-routes.ts` — AI endpoints (RBAC + isolation)
- `server/ai/intents/{detector,context,registry}.ts` + `handlers/hr-admin.ts`
  — `recruitment_dashboard` + `candidate_search` intents
- `shared/schema.ts` + `migrations/024_recruitment_ai.sql` — nullable AI columns
- `client/src/components/recruitment-ai-{panel,insights}.tsx` — per-application
  AI panel + dashboard/search insights
- `server/__tests__/ai-recruitment.test.ts` — pure-function + guard tests
