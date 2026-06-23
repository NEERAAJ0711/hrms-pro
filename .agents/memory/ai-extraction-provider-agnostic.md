---
name: AI extraction must be provider-agnostic
description: KYC/profile extraction has to work with EITHER OpenAI or Gemini, like chat does
---

Both KYC document extraction (image/vision) and profile-from-text extraction must
try OpenAI first, then fall back to Gemini — using whichever key is configured.

**Why:** The chat path always had OpenAI→Gemini fallback, but the extraction paths
were OpenAI-only and returned "no_ai_key" when only a Gemini key was set. On the VPS
the user configured a Gemini key, so chat worked but document/profile extraction
silently produced nothing → HR "Verify KYC" modal showed "No value on record yet".

**How to apply:** Any new AI capability must gate on the FULL provider set, not
OpenAI alone. The chain is now OpenAI → Gemini → Anthropic (Claude) → rule-based,
mirrored everywhere (chat, compliance, recruitment JSON, KYC + profile extraction).
Gate availability on `(getOpenAI() || getGeminiKey() || getAnthropicKey())` and add a
Claude fallback step after the Gemini step. Use the shared `call*Json(...)` helpers
(`callGeminiJson` / `callAnthropicJson`) for JSON/vision fallback. When a provider call
succeeds but returns unparseable JSON, return `no_fields_found` (available:true), not
`extraction_error` — only treat a true call failure / no provider as `extraction_error`.

**Wiring a new provider — don't forget the diagnostics path:** when adding a provider,
the easy-to-miss spot is the STARTUP status log + no-key warning in
`server/routes/index.ts` (separate from `getAiProviderStatus()`/`testAiProviders`).
If you only wire the services + provider-manager, an "only-new-provider configured"
setup will still log "No AI provider key found" and confuse operators. Anthropic key
resolves from `ANTHROPIC_API_KEY` || `CLAUDE_API_KEY` || DB row `anthropic_api_key`.
Claude has no native JSON mode — `callAnthropicJson` uses a system instruction + `"{"`
assistant prefill + fence stripping.

## Gemini model name
Use `gemini-2.0-flash` (not `gemini-1.5-flash`). Newer Google AI Studio keys return
404 "models/gemini-1.5-flash is not found for API version v1beta" — the 1.5 models
are no longer served to recently-created keys. All getGenerativeModel() calls in
server/ai-service.ts (chat, callGeminiJson extraction, test-connection) must use a
currently-served model. If a 404 model-not-found reappears, bump to the next current
flash model (e.g. gemini-2.5-flash / gemini-flash-latest).
