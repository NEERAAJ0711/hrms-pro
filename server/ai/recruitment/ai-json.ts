import { getOpenAI } from "../providers/openai";
import { getGeminiKey, callGeminiJson } from "../providers/gemini";
import { getAnthropicKey, callAnthropicJson } from "../providers/anthropic";
import { AI_CONFIG, type AiFeature } from "../config";
import { recordUsage } from "../metrics/usage";
import { aiResponseCache, isCacheEnabled } from "../cache/ai-cache";

// Shared strict-JSON caller for the recruitment AI features. Mirrors the
// established extraction pattern (OpenAI first, Gemini fallback) so a single
// configured key is enough, records usage for observability, and optionally
// reuses the AI cache by a stable key to avoid duplicate calls.

export interface AiJsonOptions {
  feature: AiFeature;
  system: string;
  user: string;
  cacheKey?: string;
  companyId?: string | null;
}

export type AiJsonOutcome =
  | { ok: true; data: Record<string, any> }
  | { ok: false; reason: "no_ai_key" | "ai_error" | "bad_json" };

export async function callRecruitmentJson(opts: AiJsonOptions): Promise<AiJsonOutcome> {
  const { feature, system, user, cacheKey, companyId } = opts;

  // 1. Cache (disabled by default; only used when AI_CACHE_ENABLED).
  if (cacheKey && isCacheEnabled()) {
    const cached = aiResponseCache.get<Record<string, any>>(cacheKey);
    if (cached) return { ok: true, data: cached };
  }

  const openai = getOpenAI();
  const geminiAvailable = !!getGeminiKey();
  const anthropicAvailable = !!getAnthropicKey();
  if (!openai && !geminiAvailable && !anthropicAvailable) return { ok: false, reason: "no_ai_key" };

  let parsed: Record<string, any> | null = null;
  let providerResponded = false;

  // 2. OpenAI (if configured).
  if (openai) {
    const started = Date.now();
    try {
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.models.openaiChat,
        temperature: AI_CONFIG.temperatures.recruitment,
        max_tokens: AI_CONFIG.maxTokens.recruitment,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      providerResponded = true;
      recordUsage({
        feature,
        provider: "openai",
        model: AI_CONFIG.models.openaiChat,
        usage: response.usage,
        latencyMs: Date.now() - started,
        companyId: companyId ?? null,
      });
      const txt = response.choices?.[0]?.message?.content ?? "{}";
      try {
        parsed = JSON.parse(txt);
      } catch {
        parsed = null;
      }
    } catch (err: any) {
      console.warn(`[AI] OpenAI ${feature} failed, trying Gemini:`, err?.message);
    }
  }

  // 3. Gemini fallback.
  if (!parsed && geminiAvailable) {
    parsed = await callGeminiJson(system, user);
    if (parsed) {
      providerResponded = true;
      recordUsage({
        feature,
        provider: "gemini",
        model: AI_CONFIG.models.geminiChat,
        companyId: companyId ?? null,
      });
    }
  }

  // 4. Anthropic Claude fallback.
  if (!parsed && anthropicAvailable) {
    parsed = await callAnthropicJson(system, user, undefined, AI_CONFIG.maxTokens.recruitment);
    if (parsed) {
      providerResponded = true;
      recordUsage({
        feature,
        provider: "anthropic",
        model: AI_CONFIG.models.anthropicChat,
        companyId: companyId ?? null,
      });
    }
  }

  if (!parsed) {
    return { ok: false, reason: providerResponded ? "bad_json" : "ai_error" };
  }

  if (cacheKey && isCacheEnabled()) aiResponseCache.set(cacheKey, parsed);
  return { ok: true, data: parsed };
}
