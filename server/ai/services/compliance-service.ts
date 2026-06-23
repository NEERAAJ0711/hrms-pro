import { AI_CONFIG } from "../config";
import { getOpenAI } from "../providers/openai";
import { getGeminiKey, callGemini } from "../providers/gemini";
import { getAnthropicKey, callAnthropic, callAnthropicJson } from "../providers/anthropic";
import { buildComplianceSystemPrompt, buildComplianceRuleResponse } from "../prompts/compliance";
import { buildJobErrorUserMessage } from "../prompts/job-analysis";
import { recordUsage } from "../metrics/usage";

// ─── Compliance AI Co-pilot ────────────────────────────────────────────────────

export async function generateComplianceReply(
  message: string,
  history: Array<{ role: string; content: string }>,
  portal = "both",
): Promise<string> {
  const systemPrompt = buildComplianceSystemPrompt(portal);

  // ── 1. Try OpenAI ────────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    const started = Date.now();
    try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.slice(-AI_CONFIG.history.complianceWindow).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ];
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.models.openaiChat,
        messages,
        max_tokens: AI_CONFIG.maxTokens.compliance,
        temperature: AI_CONFIG.temperatures.compliance,
      });
      const text = response.choices[0]?.message?.content;
      if (text) {
        recordUsage({
          feature: "compliance",
          provider: "openai",
          model: AI_CONFIG.models.openaiChat,
          usage: response.usage,
          latencyMs: Date.now() - started,
        });
        return text;
      }
    } catch (err: any) {
      console.warn("[ComplianceAI] OpenAI failed, trying Gemini:", err?.message);
    }
  }

  // ── 2. Try Gemini ────────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const reply = await callGemini(systemPrompt, history.slice(-AI_CONFIG.history.complianceWindow), message);
    if (reply) {
      recordUsage({ feature: "compliance", provider: "gemini", model: AI_CONFIG.models.geminiChat });
      return reply;
    }
  }

  // ── 3. Try Anthropic Claude ──────────────────────────────────────────────────
  if (getAnthropicKey()) {
    const reply = await callAnthropic(
      systemPrompt,
      history.slice(-AI_CONFIG.history.complianceWindow),
      message,
      AI_CONFIG.maxTokens.compliance,
    );
    if (reply) {
      recordUsage({ feature: "compliance", provider: "anthropic", model: AI_CONFIG.models.anthropicChat });
      return reply;
    }
  }

  // ── 4. Rule-based fallback ───────────────────────────────────────────────────
  recordUsage({ feature: "compliance", provider: "rule-based", success: true });
  return buildComplianceRuleResponse(message);
}

export async function analyzeJobError(
  jobType: string,
  errorMessage: string,
  logs: string[] = [],
): Promise<{ summary: string; likelyCause: string; suggestedFix: string; canRetry: boolean }> {
  const prompt = buildComplianceSystemPrompt("both");
  const userMsg = buildJobErrorUserMessage(jobType, errorMessage, logs);

  // ── 1. Try OpenAI ────────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    const started = Date.now();
    try {
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.models.openaiChat,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: AI_CONFIG.maxTokens.jobAnalysis,
        temperature: AI_CONFIG.temperatures.jobAnalysis,
        response_format: { type: "json_object" },
      });
      const text = response.choices[0]?.message?.content;
      if (text) {
        recordUsage({
          feature: "job_analysis",
          provider: "openai",
          model: AI_CONFIG.models.openaiChat,
          usage: response.usage,
          latencyMs: Date.now() - started,
        });
        return JSON.parse(text);
      }
    } catch (err: any) {
      console.warn("[JobErrorAI] OpenAI failed:", err?.message);
    }
  }

  // ── 2. Try Gemini ────────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const reply = await callGemini(prompt, [], userMsg);
    if (reply) {
      try {
        const cleaned = reply.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        recordUsage({ feature: "job_analysis", provider: "gemini", model: AI_CONFIG.models.geminiChat });
        return parsed;
      } catch {
        // fall through
      }
    }
  }

  // ── 3. Try Anthropic Claude ──────────────────────────────────────────────────
  if (getAnthropicKey()) {
    const parsed = await callAnthropicJson(prompt, userMsg, undefined, AI_CONFIG.maxTokens.jobAnalysis);
    if (parsed) {
      recordUsage({ feature: "job_analysis", provider: "anthropic", model: AI_CONFIG.models.anthropicChat });
      return parsed as { summary: string; likelyCause: string; suggestedFix: string; canRetry: boolean };
    }
  }

  // ── 4. Rule-based fallback ───────────────────────────────────────────────────
  const em = errorMessage.toLowerCase();
  const canRetry = !em.includes("invalid credentials") && !em.includes("aadhaar mismatch") && !em.includes("not found");
  recordUsage({ feature: "job_analysis", provider: "rule-based", success: true });
  return {
    summary: `The ${jobType.replace(/_/g, " ")} job failed.`,
    likelyCause: em.includes("timeout") || em.includes("network")
      ? "Portal network timeout — the EPFO/ESIC portal was temporarily unreachable."
      : em.includes("credential") || em.includes("password") || em.includes("login")
      ? "Invalid portal credentials — the stored username/password may be wrong or expired."
      : em.includes("otp") || em.includes("captcha")
      ? "Portal is waiting for OTP/CAPTCHA verification from a human operator."
      : "An unexpected portal error occurred.",
    suggestedFix: em.includes("credential") || em.includes("password")
      ? "Go to Portal Settings tab → update the username and password → retry the job."
      : em.includes("otp") || em.includes("captcha")
      ? "Go to the Paused Jobs tab → find this job → enter the OTP/CAPTCHA answer → click Resume."
      : "Check the portal for maintenance notices, then retry the job during off-peak hours (early morning).",
    canRetry,
  };
}
