# HRMS AI Implementation Audit

> Read-only audit of the current AI implementation. No application code was modified to produce this report.

## 1. AI Overview

- **Providers used:** OpenAI (primary), Google Gemini (fallback), plus a built-in **rule-based engine** (final fallback when no key works).
- **Models configured:**
  - OpenAI **`gpt-4o-mini`** — chat replies, KYC vision OCR, profile text extraction, compliance Q&A, job-error analysis.
  - Google **`gemini-2.0-flash`** — same tasks via fallback (text + vision).
- **Where AI is initialized:** `server/ai-service.ts` — `getOpenAI()` (L50), `getGeminiKey()` (L70), `callGemini()` (L~80), `callGeminiJson()` (L112). Keys are pulled from the `settings` DB table at startup via `loadAllApiKeysFromDB()` (L140, called in `server/routes/index.ts`) and can be set live from **Settings → API Keys** (`server/routes/settings-routes.ts`).
- **Modules that actually use AI:** Only the **AI HR module** (`server/ai-hr-routes.ts`) and the **Settings test endpoint**. All other route files (recruitment, payroll, leave, attendance, etc.) import *only* the key-management helpers (`setOpenAIKeyOverride`, `loadAllApiKeysFromDB`) — they make **no AI calls**.

---

## 2. AI Features Already Implemented

| Feature | Status | Location | API / Model | DB Tables |
|---|---|---|---|---|
| **HR Chat Assistant** (employee self-service Q&A, bilingual EN/Hindi) | Working | `generateAiReply` ai-service.ts L1301; route `POST /api/ai-hr/conversations/:id/messages` L545 | OpenAI→Gemini→rules | `ai_conversations`, `ai_messages` |
| **KYC Document OCR / Vision Extraction** (Aadhaar, PAN, bank/cheque) | Working (recently fixed to be provider-agnostic) | `extractKycDocument` L256; route `POST /…/upload` L648 | gpt-4o-mini vision / gemini-2.0-flash | `ai_messages` (attachments), `kyc_submission_status`, `employees` |
| **Profile-from-Text Extraction** (auto-detect UAN, DOB, address, etc. typed in chat) | Working | `extractProfileFromText` L374; triggered in messages route L608 | OpenAI→Gemini JSON | `employees` (via apply-extraction) |
| **Apply Extracted Data to Profile** (verify-then-save) | Working | `POST /…/apply-extraction` L806 | n/a (DB write) | `employees`, `ai_messages` |
| **Compliance Q&A Assistant** (Indian statutory rules for HR/Admin) | Working | `generateComplianceReply` L1756; route `POST /api/ai-hr/compliance-chat` L1284 | OpenAI→Gemini→rules | none (stateless) |
| **Automation Job-Error Analysis** (diagnose EPFO/ESIC failures) | Working / Partial | `analyzeJobError` L1795; route `POST /api/ai-hr/analyze-job-error` L1301 | gpt-4o-mini / gemini | none |
| **AI Follow-up Scheduler** (auto KYC reminders + escalation) | Working | `startAiFollowUpScheduler` L1604, `createFollowUpTask` L1626 | n/a (timed job + email/notify) | `ai_follow_up_tasks` |
| **KYC Status / HR Dashboard / Verify-KYC modal** | Working | routes L893–L1441 | n/a | `kyc_submission_status`, `employees`, `ai_messages` |
| **Provider Diagnostics ("Test connection")** | Working | `testAiProviders` L182; route in settings-routes | OpenAI + Gemini ping | `settings` |
| **Rule-Based Fallback Engine** (salary, loan, KRA, profile answers without a key) | Working | `buildRuleBasedResponse` L826 | none (regex/string match) | reads live context |

---

## 3. AI Features Partially Implemented

- **Job-Error Analysis (`analyzeJobError`)** — Completed: it sends the job type, error message, and logs to the model and returns a diagnosis. Missing: quality depends entirely on the logs the automation worker captures; there's no structured remediation/auto-retry loop. Blocker: the EPFO/ESIC worker logs are free-text, so diagnoses are advisory only.
- **"Resume / Document Parser"** — There is **no dedicated resume/PDF parser**. The only document intelligence is (a) image KYC OCR and (b) free-text profile extraction in chat. PDFs are explicitly rejected by the extractor (`not_an_image`). So resume parsing is effectively *missing*, not partial.
- **Compliance Assistant** — Working but **stateless beyond the passed history** and has no grounding/knowledge base (no RAG); answers rely on the model's training plus a small hardcoded rule fallback.

---

## 4. AI Features Missing (relative to existing HRMS modules)

- **Recruitment AI** — no résumé parsing, candidate scoring/ranking, JD generation, or interview-question generation (recruitment module imports no AI).
- **Payroll AI** — no anomaly detection, payslip explanation, or natural-language payroll queries.
- **Attendance AI** — no anomaly/fraud detection or pattern insights (face/GPS logic is deterministic, client-side).
- **Leave AI** — no leave-pattern insights or auto-approval recommendations.
- **Analytics / Reporting AI** — no natural-language report querying or AI-generated summaries/insights.
- **AI Email Generator** — emails are template-based; no AI drafting.
- **Voice Assistant / STT** — none.
- **Semantic search / RAG over policies** — none; compliance answers are ungrounded.
- **PDF / multi-page document extraction** — none (images only).

---

## 5. Existing AI Prompts

All prompts are **hardcoded inline in `server/ai-service.ts`** — there are **no prompt files, templates, or a prompt-management system**.

- **Chat system prompt:** `buildSystemPrompt()` L760 (injects employee name, KYC status, language, live data context).
- **Compliance system prompt:** `buildComplianceSystemPrompt(portal)` L1667.
- **KYC extraction system prompt:** inline in `extractKycDocument` (OCR instructions, JSON-only, DD/MM/YYYY).
- **Profile extraction system prompt:** inline in `extractProfileFromText` (strict whitelist, "never guess", normalization rules).
- **Job-error analysis prompt:** inline in `analyzeJobError`.
- **Rule-based "prompts":** `buildRuleBasedResponse` L826 and `buildComplianceRuleResponse` L1733 (deterministic, not LLM prompts).
- **Live-data context builder:** `buildLiveDataSection()` L597 assembles payslip/leave/KRA data into the prompt.

---

## 6. AI Architecture

- **Core service:** `server/ai-service.ts` (~1,868 lines) — single module holding provider clients, key resolution, all extraction/generation functions, prompt builders, the rule-based engine, and the follow-up scheduler.
- **Helper / sibling module:** `server/ai-extraction.ts` — `mapExtractionToUpdates` (whitelist column mapping), `checkConversationAccess`, value normalizers (DOB/gender).
- **Controllers / routes:** `server/ai-hr-routes.ts` (19 endpoints) is the only AI consumer; `settings-routes.ts` exposes key save/test.
- **Provider fallback chain:** OpenAI → Gemini → rule-based, applied consistently in chat, compliance, and (now) extraction.
- **Database interactions:** `ai_conversations`, `ai_messages` (chat + JSONB attachments with extracted fields), `ai_follow_up_tasks` (reminder state machine), `kyc_submission_status` (per-doc flags), `settings` (API keys), and writes to `employees` on apply-extraction.
- **Background jobs:** `startAiFollowUpScheduler` polls `ai_follow_up_tasks` **hourly**, sends reminders, and escalates. The automation queue worker (EPFO/ESIC) is separate (Playwright) but routes failures through `analyzeJobError`.
- **Email / notifications:** follow-up scheduler triggers email + in-app notifications (Resend-based email pathway).
- **Summary:** A well-contained, single-service AI layer focused on **conversational KYC onboarding + compliance help**, with graceful degradation to deterministic responses.

---

## 7. AI Automation

- **KYC follow-up reminders & escalation** — hourly scheduler over `ai_follow_up_tasks`.
- **Auto profile-data capture** — chat messages are scanned and structured data is extracted automatically (pending user confirmation).
- **Auto KYC status computation** — `computeKycOverallStatus` updates pending/partial/complete and auto-dismisses tasks on completion.
- **Automation failure triage** — EPFO/ESIC job errors are auto-analyzed for HR.

---

## 8. Security

**Strengths**

- **Authentication:** every AI route uses `requireAuth` (23 auth/HR guards in `ai-hr-routes.ts`).
- **RBAC:** HR/admin-only endpoints use `requireHR`; chat/upload enforce **conversation ownership** (`conv.userId !== user.id` → 403) and `checkConversationAccess`.
- **Multi-tenancy:** cross-company access blocked via `company_id` checks (e.g., kyc-documents L1383).
- **Data privacy:** Aadhaar/bank values are **masked** in rule-based replies (`maskAadhaar`, `maskTail` — last 4 digits only).
- **Input validation:** extraction writes go through a **fixed column whitelist** (`mapExtractionToUpdates`), preventing arbitrary field writes; covered by unit tests.
- **Key handling:** API keys stored server-side in `settings`, never exposed to the client; key status reported as booleans.

**Risks / gaps**

- **No prompt-injection protection** — user chat text and OCR'd document text flow into prompts with no sanitization or guardrails. Low blast radius today (the model only returns text/JSON, no tool execution), but worth noting.
- **No rate limiting on AI endpoints** — chat/upload/compliance can be called without throttling, allowing token/cost abuse (rate limiting exists only in `server/adms.ts`).
- **No per-company / per-user usage quotas** — a single tenant can consume the shared key budget.
- **Document storage** — uploaded KYC files live on disk under `/uploads/kyc-docs`; ensure that path is access-controlled at the web/server layer.

---

## 9. Performance

- **Duplicate/extra AI calls:** sending a chat message can trigger **two** model calls — one for `generateAiReply` and one for `extractProfileFromText` — when the hint regex matches. The hint gate (`messageMayContainProfileInfo`) mitigates this, but both can run on the same message.
- **No caching:** identical compliance questions or repeated extractions are recomputed every time; no response/embedding cache.
- **Vision payload size:** images are base64-inlined into the request; large photos increase latency/tokens (no client-side downscaling before upload).
- **Token optimization:** the chat system prompt embeds a full live-data section every turn; could be trimmed or summarized for long conversations.
- **Caching opportunities:** compliance Q&A (stable answers), provider-status checks, and KYC spec prompts are good candidates.

---

## 10. Code Quality

- **Large file:** `server/ai-service.ts` is ~1,868 lines — mixes provider clients, prompts, extraction, rule engine, and scheduler. **Should be split** (e.g., `providers.ts`, `extraction.ts`, `prompts.ts`, `rule-engine.ts`, `scheduler.ts`).
- **Some duplication:** the OpenAI-then-Gemini try/parse pattern is repeated across `extractKycDocument`, `extractProfileFromText`, `generateAiReply`, `generateComplianceReply`; could be unified into one helper.
- **Hardcoded values:** model names, the hourly scheduler interval, reminder cadence, and all prompts are inline — candidates for config/constants.
- **Dead/unused AI imports:** every non-AI route imports `setOpenAIKeyOverride/setGeminiKeyOverride/loadAllApiKeysFromDB` but most never call them — import noise worth cleaning.
- **Tests:** `server/__tests__/ai-extraction.test.ts` (10 tests) covers extraction whitelist, normalization, and conversation access — good. No tests for chat fallback, compliance, or scheduler.
- **Prompt management:** no central prompt store; changes require code edits.

---

## 11. AI Roadmap (suggested — not implemented)

**High priority**

- Rate limiting + per-tenant usage quotas on AI endpoints.
- Dedicated **resume/PDF parser** for recruitment (PDF → structured candidate data).
- Response caching for compliance Q&A and dedupe of the double chat/extraction call.
- Refactor `ai-service.ts` into smaller modules.

**Medium priority**

- Recruitment AI: candidate scoring/ranking, JD & interview-question generation.
- Payroll AI: payslip explainer + anomaly detection.
- Analytics: natural-language report querying and AI summaries.
- RAG/grounding for the compliance assistant over the company's actual policies.

**Low priority**

- Attendance/leave pattern insights.
- AI email drafting.
- Voice assistant / speech-to-text.
- Prompt-management UI and prompt versioning.

---

## 12. Final Summary

- **AI completion (relative to a full enterprise HRMS AI vision):** roughly **35–40%**. The conversational KYC-onboarding + compliance-help slice is solid; most other HR modules have **no AI**.
- **Production readiness:** **Moderate.** The implemented features are robust (graceful fallback, masking, RBAC, whitelisted writes, tests). Main blockers to "enterprise-ready": no rate limiting/quotas, no prompt-injection hardening, no caching, and reliance on external account billing (OpenAI quota) — partly de-risked by the Gemini fallback.
- **Strengths:** multi-provider fallback with deterministic safety net; strong tenant isolation & ownership checks; PII masking; whitelisted DB writes; bilingual support; clean route-level RBAC.
- **Weaknesses:** one oversized service file; duplicated provider logic; no caching/rate limiting; ungrounded compliance answers; images-only document support.
- **Missing enterprise features:** usage analytics & cost controls, prompt-injection defenses, RAG/knowledge grounding, recruitment/payroll/analytics AI, audit logging of AI decisions, and a prompt-management layer.
