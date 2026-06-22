---
name: AI HR Assistant silent fallback
description: Why the AI assistant appears to give the same answer to every query, and how to diagnose it
---

# AI HR Assistant — "same answer for every query"

The HR Assistant (Priya) provider chain is **OpenAI → Gemini → rule-based** (`server/ai-service.ts`, `generateAiReply`). When no LLM key works, it silently falls back to `buildRuleBasedResponse`, whose catch-all default returns one generic message — so every non-keyword query looks identical. This reads to users as a bug, but it is a missing/invalid-key symptom.

**Why this is easy to misdiagnose:** failures are swallowed. A missing key, a wrong key name, an invalid/quota'd key, a deprecated model, or a firewall blocking the API all collapse into the same generic reply with (historically) no log.

## Key sources (any one works)
- Env: `OPENAI_API_KEY`, and `GOOGLE_GEMINI_API_KEY` **or** `GEMINI_API_KEY` (alias added).
- DB settings table, `companyId IS NULL`, keys `openai_api_key` / `gemini_api_key`, loaded at startup by `loadAllApiKeysFromDB` and applied live when saved via Settings → API Keys.
- `server/load-env.ts` only fills env from a `.env` at the process CWD and never overwrites — so a VPS key only reaches the app if it's in that `.env` with the exact name AND the process was restarted.

## How to diagnose
- Startup log: `[AI] Provider status — OpenAI: …, Gemini: …`.
- Super-admin endpoint `GET /api/settings/api-keys/test` → `testAiProviders()` does a real tiny call per provider and returns `{configured, ok, error}` + `activeProvider`. Surfaced as a "Test connection" button in Settings → API Keys.
- `generateAiReply` now logs *why* it fell back (no key vs all providers failed).

**How to apply:** if a user reports identical answers, do NOT assume a chat-flow code bug — the route already passes the real message. Check provider status / run the Test first; the real fix is almost always a key/network/model config issue, not code.
