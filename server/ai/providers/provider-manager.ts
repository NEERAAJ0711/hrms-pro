import { AI_CONFIG, type AiProvider } from "../config";
import { getOpenAI, setOpenAIKeyOverride } from "./openai";
import { getGeminiKey, setGeminiKeyOverride } from "./gemini";
import { getAnthropicKey, setAnthropicKeyOverride } from "./anthropic";

// Central place that owns provider key loading, configuration status, and live
// diagnostics. The individual call shapes live in openai.ts / gemini.ts; this
// module is the single entry point ops/admins go through.

// ── Startup loader — pulls both keys from DB ────────────────────────────────────
export async function loadAllApiKeysFromDB(): Promise<void> {
  try {
    const { db: dbInst } = await import("../../db");
    const { settings: settingsTable } = await import("../../../shared/schema");
    const { isNull } = await import("drizzle-orm");

    const rows = await dbInst
      .select()
      .from(settingsTable)
      .where(isNull(settingsTable.companyId));

    for (const row of rows) {
      if (row.key === "openai_api_key" && row.value) setOpenAIKeyOverride(row.value);
      if (row.key === "gemini_api_key" && row.value) setGeminiKeyOverride(row.value);
      if (row.key === "anthropic_api_key" && row.value) setAnthropicKeyOverride(row.value);
    }
  } catch {
    // DB may not be ready yet — safe to skip
  }
}

/** @deprecated use loadAllApiKeysFromDB */
export async function loadOpenAIKeyFromDB(): Promise<void> {
  return loadAllApiKeysFromDB();
}

// ─── Provider status & live diagnostics ───────────────────────────────────────
// Lets admins/ops see exactly which AI provider is active and whether the
// configured key actually works — instead of silently falling back to the
// rule-based engine (which makes every reply look the same).

export function getAiProviderStatus(): {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  anthropicConfigured: boolean;
} {
  return {
    openaiConfigured: !!getOpenAI(),
    geminiConfigured: !!getGeminiKey(),
    anthropicConfigured: !!getAnthropicKey(),
  };
}

export interface AiProviderTest {
  configured: boolean;
  ok: boolean;
  error?: string;
}

// Runs a tiny live request against each configured provider and reports the
// real error (invalid key, deprecated model, network/firewall block, quota…).
export async function testAiProviders(): Promise<{
  openai: AiProviderTest;
  gemini: AiProviderTest;
  anthropic: AiProviderTest;
  activeProvider: AiProvider;
}> {
  const openai: AiProviderTest = { configured: false, ok: false };
  const gemini: AiProviderTest = { configured: false, ok: false };
  const anthropic: AiProviderTest = { configured: false, ok: false };

  const TEST_TIMEOUT_MS = AI_CONFIG.timeouts.providerTestMs; // keep diagnostics snappy even if a firewall blocks the API

  const client = getOpenAI();
  if (client) {
    openai.configured = true;
    try {
      const r = await client.chat.completions.create(
        {
          model: AI_CONFIG.models.openaiChat,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: AI_CONFIG.maxTokens.test,
        },
        { timeout: TEST_TIMEOUT_MS },
      );
      openai.ok = !!r.choices?.[0]?.message;
      if (!openai.ok) openai.error = "OpenAI returned an empty response.";
    } catch (err: any) {
      openai.error = err?.message || String(err);
    }
  }

  if (getGeminiKey()) {
    gemini.configured = true;
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(getGeminiKey()!);
      const model = genAI.getGenerativeModel(
        { model: AI_CONFIG.models.geminiChat },
        { timeout: TEST_TIMEOUT_MS },
      );
      const result = await model.generateContent("ping");
      gemini.ok = !!result.response.text();
      if (!gemini.ok) gemini.error = "Gemini returned an empty response.";
    } catch (err: any) {
      gemini.error = err?.message || String(err);
    }
  }

  if (getAnthropicKey()) {
    anthropic.configured = true;
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: getAnthropicKey()!, timeout: TEST_TIMEOUT_MS });
      const r = await client.messages.create({
        model: AI_CONFIG.models.anthropicChat,
        max_tokens: AI_CONFIG.maxTokens.test,
        messages: [{ role: "user", content: "ping" }],
      });
      anthropic.ok = Array.isArray(r.content) && r.content.length > 0;
      if (!anthropic.ok) anthropic.error = "Anthropic returned an empty response.";
    } catch (err: any) {
      anthropic.error = err?.message || String(err);
    }
  }

  const activeProvider: AiProvider = openai.ok
    ? "openai"
    : gemini.ok
    ? "gemini"
    : anthropic.ok
    ? "anthropic"
    : "rule-based";
  return { openai, gemini, anthropic, activeProvider };
}
