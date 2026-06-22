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

**How to apply:** Any new AI capability must gate on `(getOpenAI() || getGeminiKey())`,
not OpenAI alone. Use the shared `callGeminiJson(systemPrompt, userText, image?)`
helper for JSON/vision fallback. When a provider call succeeds but returns
unparseable JSON, return `no_fields_found` (available:true), not `extraction_error` —
only treat a true call failure / no provider as `extraction_error`.
