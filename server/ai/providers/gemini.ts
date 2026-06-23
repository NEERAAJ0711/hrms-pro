import { AI_CONFIG } from "../config";

// Google Gemini provider — key resolution plus the two low-level call shapes
// used across the module: free-form chat and strict-JSON (optionally with an
// image) for KYC/profile extraction.

let _geminiKey: string | null = null;

export function setGeminiKeyOverride(key: string | null): void {
  _geminiKey = key || null;
}

export function getGeminiKeyOverride(): string | null {
  return _geminiKey;
}

export function getGeminiKey(): string | null {
  return process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || _geminiKey || null;
}

export async function callGemini(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string | null> {
  const key = getGeminiKey();
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: AI_CONFIG.models.geminiChat,
      systemInstruction: systemPrompt,
    });

    // Gemini requires alternating user/model turns; convert our history
    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    return result.response.text() || null;
  } catch (err: any) {
    console.warn("[AI] Gemini call failed:", err?.message);
    return null;
  }
}

/**
 * Ask Gemini for a strict JSON object (optionally about an image). Used as the
 * extraction fallback so KYC/profile reading works whether the configured key is
 * OpenAI or Gemini. Returns the parsed object, or null if unavailable/failed.
 */
export async function callGeminiJson(
  systemPrompt: string,
  userText: string,
  image?: { mimeType: string; base64: string },
): Promise<Record<string, any> | null> {
  const key = getGeminiKey();
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: AI_CONFIG.models.geminiChat,
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    });
    const parts: any[] = [{ text: userText }];
    if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    const result = await model.generateContent(parts);
    const txt = result.response.text() || "{}";
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch (err: any) {
    console.warn("[AI] Gemini JSON extraction failed:", err?.message);
    return null;
  }
}
