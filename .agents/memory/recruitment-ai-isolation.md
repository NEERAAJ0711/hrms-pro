---
name: Recruitment AI tenant isolation + no-data gating
description: Cross-tenant job override risk and evidence gating in recruitment AI service/routes
---
server/routes/recruitment-ai-routes.ts lets a caller override the job to score/
match/question against via body.jobId. resolveJob() MUST verify the resolved
posting belongs to the same company as the application (super_admin excepted),
or a user can force AI work against another tenant's posting.

All four AI functions in server/ai/recruitment/service.ts (scoreCandidate,
matchJd, summarizeCandidate, generateInterviewQuestions) must call
hasCandidateEvidence() and return reason:"no_data" BEFORE any AI call — otherwise
they fabricate candidate-specific output from empty data, violating the
"live DB only / graceful no data" guarantee.

**Why:** architect review caught both gaps (questions fn missing the gate;
resolveJob unchecked).
**How to apply:** any new recruitment AI endpoint that resolves a posting by an
id from the request body must re-check company ownership.
