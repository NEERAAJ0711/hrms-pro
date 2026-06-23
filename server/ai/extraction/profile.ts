import type { KycExtractionResult } from "../types";
import { getOpenAI } from "../providers/openai";
import { getGeminiKey, callGeminiJson } from "../providers/gemini";
import { getAnthropicKey, callAnthropicJson } from "../providers/anthropic";
import { AI_CONFIG } from "../config";
import { recordUsage } from "../metrics/usage";
import { PROFILE_EXTRACTION_FIELDS, buildProfileSystemPrompt } from "../prompts/extraction";

// ─── Typed profile-info extraction (ESIC / EPFO / HRMS master fields) ──────────

// Cheap gate so we only spend an AI call when the message plausibly contains profile data.
const PROFILE_HINT_RE =
  /\d|@|\buan\b|\besic?\b|\bifsc\b|\baccount\b|\bpan\b|\baadh?aar\b|\bmobile\b|\bphone\b|\bemail\b|\baddress\b|\bdob\b|\bborn\b|\bfather\b|\bhusband\b|\bgender\b|\bmale\b|\bfemale\b|\bpin ?code\b|\bmarried\b|\bsingle\b|\bunmarried\b|\bspouse\b|\bmarital\b|\bmother\b|\bblood\b|\bnominee\b|\bnomination\b|\bemergency\b/i;

export function messageMayContainProfileInfo(text: string): boolean {
  return !!text && PROFILE_HINT_RE.test(text);
}

export async function extractProfileFromText(text: string): Promise<KycExtractionResult> {
  if (!messageMayContainProfileInfo(text)) return { available: false, reason: "no_hint" };

  const openai = getOpenAI();
  const geminiAvailable = !!getGeminiKey();
  const anthropicAvailable = !!getAnthropicKey();
  if (!openai && !geminiAvailable && !anthropicAvailable) return { available: false, reason: "no_ai_key" };

  const systemPrompt = buildProfileSystemPrompt();

  let parsed: Record<string, any> | null = null;
  let providerResponded = false;
  try {
    // 1. Try OpenAI (if an OpenAI key is configured)
    if (openai) {
      const started = Date.now();
      try {
        const response = await openai.chat.completions.create({
          model: AI_CONFIG.models.openaiChat,
          temperature: AI_CONFIG.temperatures.extraction,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        });
        providerResponded = true;
        recordUsage({
          feature: "profile_extraction",
          provider: "openai",
          model: AI_CONFIG.models.openaiChat,
          usage: response.usage,
          latencyMs: Date.now() - started,
        });
        const txt = response.choices?.[0]?.message?.content ?? "{}";
        try {
          parsed = JSON.parse(txt);
        } catch {
          parsed = null;
        }
      } catch (err: any) {
        console.warn("[AI] OpenAI profile extraction failed, trying Gemini:", err?.message);
      }
    }

    // 2. Fall back to Gemini (if OpenAI is absent or failed)
    if (!parsed && geminiAvailable) {
      parsed = await callGeminiJson(systemPrompt, text);
      if (parsed) {
        providerResponded = true;
        recordUsage({ feature: "profile_extraction", provider: "gemini", model: AI_CONFIG.models.geminiChat });
      }
    }

    // 3. Fall back to Anthropic Claude (if both above are absent or failed)
    if (!parsed && anthropicAvailable) {
      parsed = await callAnthropicJson(systemPrompt, text);
      if (parsed) {
        providerResponded = true;
        recordUsage({ feature: "profile_extraction", provider: "anthropic", model: AI_CONFIG.models.anthropicChat });
      }
    }
  } catch (err: any) {
    console.warn("[AI] Profile extraction failed:", err?.message);
    return { available: false, reason: "extraction_error" };
  }

  // A provider answered but returned unparseable JSON → treat as no fields found.
  if (!parsed) {
    if (providerResponded) return { available: true, reason: "no_fields_found", fields: {} };
    return { available: false, reason: "extraction_error" };
  }

  const fields: Record<string, string> = {};
  for (const f of PROFILE_EXTRACTION_FIELDS) {
    const v = parsed[f];
    if (v != null && String(v).trim()) fields[f] = String(v).trim();
  }

  if (Object.keys(fields).length === 0) {
    return { available: true, reason: "no_fields_found", fields: {} };
  }
  return { available: true, fields };
}
