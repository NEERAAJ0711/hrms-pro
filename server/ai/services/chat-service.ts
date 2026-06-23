import { db } from "../../db";
import { aiMessages } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import type { EmployeeContext, KycStatus } from "../types";
import { AI_CONFIG } from "../config";
import { getOpenAI } from "../providers/openai";
import { getGeminiKey, callGemini } from "../providers/gemini";
import { buildRuleBasedResponse } from "../providers/rule-engine";
import { buildSystemPrompt } from "../prompts/hr-chat";
import { recordUsage } from "../metrics/usage";

// ─── Main AI Reply Generator ────────────────────────────────────────────────

export async function generateAiReply(
  conversationId: string,
  userMessage: string,
  employeeName: string,
  kyc: KycStatus,
  language: string,
  ctx?: EmployeeContext | null,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(employeeName, kyc, language, ctx);

  // Load conversation history (last 12 messages) — shared by all providers
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(aiMessages.createdAt)
    .limit(AI_CONFIG.history.fetchLimit);
  const recentHistory = history.slice(-AI_CONFIG.history.chatWindow);

  // ── 1. Try OpenAI ───────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    const started = Date.now();
    try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...recentHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: userMessage },
      ];
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.models.openaiChat,
        messages,
        max_tokens: AI_CONFIG.maxTokens.chat,
        temperature: AI_CONFIG.temperatures.chat,
      });
      const text = response.choices[0]?.message?.content;
      if (text) {
        recordUsage({
          feature: "hr_chat",
          provider: "openai",
          model: AI_CONFIG.models.openaiChat,
          usage: response.usage,
          latencyMs: Date.now() - started,
        });
        return text;
      }
    } catch (err: any) {
      console.warn("[AI] OpenAI call failed, trying Gemini:", err?.message);
    }
  }

  // ── 2. Try Google Gemini ────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const geminiReply = await callGemini(
      systemPrompt,
      recentHistory.map((m) => ({ role: m.role, content: m.content })),
      userMessage,
    );
    if (geminiReply) {
      recordUsage({ feature: "hr_chat", provider: "gemini", model: AI_CONFIG.models.geminiChat });
      return geminiReply;
    }
    console.warn("[AI] Gemini also failed — falling back to rule-based.");
  }

  // ── 3. Rule-based fallback ──────────────────────────────────────────────────
  if (!getOpenAI() && !getGeminiKey()) {
    console.warn(
      "[AI] No OpenAI/Gemini key configured — using rule-based fallback (replies will be generic). " +
        "Set OPENAI_API_KEY or GOOGLE_GEMINI_API_KEY, or save a key under Settings → API Keys.",
    );
  } else {
    console.warn(
      "[AI] A provider key is configured but every provider failed — using rule-based fallback. " +
        "Check the [AI] warnings above (or Settings → API Keys → Test) for the real error.",
    );
  }
  recordUsage({ feature: "hr_chat", provider: "rule-based", success: true });
  return buildRuleBasedResponse(userMessage, employeeName, kyc, language, ctx);
}
