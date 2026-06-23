# AI Module (`server/ai/`)

Modular home for the HRMS AI features. Replaces the former 1868-line
`server/ai-service.ts`, which is now a thin **backward-compatible facade** that
re-exports this module's public API. Existing imports (`from "./ai-service"` /
`"../ai-service"`) keep working unchanged; new code should import from
`server/ai` directly.

## Layout

```
ai/
├── index.ts                  Public API barrel (single import surface)
├── config.ts                 AI_CONFIG (models, limits, timeouts, flags) + AiFeature/AiProvider
├── types.ts                  Dependency-free domain types (KycStatus, EmployeeContext, …)
├── providers/
│   ├── openai.ts             Lazy OpenAI client + key override
│   ├── gemini.ts             Gemini key resolution + callGemini / callGeminiJson
│   ├── provider-manager.ts   Key loading, provider status, live diagnostics (testAiProviders)
│   └── rule-engine.ts        Deterministic, key-free fallback replies
├── prompts/
│   ├── registry.ts           Named prompt-builder registry
│   ├── hr-chat.ts            Employee HR-assistant system prompt
│   ├── compliance.ts         EPFO/ESIC system prompt + rule-based answers
│   ├── extraction.ts         KYC + profile extraction specs/builders
│   └── job-analysis.ts       Automation job-error analysis user message
├── extraction/
│   ├── kyc.ts                Document (image) extraction — OpenAI → Gemini
│   └── profile.ts            Free-text profile extraction + detection heuristic
├── services/
│   ├── chat-service.ts       generateAiReply (OpenAI → Gemini → rule-based)
│   ├── compliance-service.ts generateComplianceReply + analyzeJobError
│   └── scheduler-service.ts  KYC status, follow-up escalation engine + scheduler
├── metrics/
│   └── usage.ts              Best-effort usage recorder + in-memory summary (ai_usage_logs)
├── logging/ai-logger.ts
├── security/                 prompt-guard, validation (detect-only by default)
└── cache/ai-cache.ts         Optional response cache (disabled by default)
```

## Provider fallback

Every AI call tries **OpenAI → Gemini → rule-based**, so the assistant always
responds even with no key configured. Keys come from the environment
(`OPENAI_API_KEY` / `GOOGLE_GEMINI_API_KEY`) or admin-saved overrides
(Settings → API Keys), loaded at startup via `loadAllApiKeysFromDB()`.

## Usage logging

`recordUsage()` is called best-effort after each provider path and persists to
the additive `ai_usage_logs` table (no foreign keys). It never throws or blocks
the response; if the table is missing, the in-memory ring buffer still powers
`getUsageSummary()` / `getRecentUsage()`.
