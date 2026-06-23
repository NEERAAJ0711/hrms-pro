import { AI_CONFIG } from "../config";

// Anthropic Claude provider — key resolution plus the two low-level call shapes
// used across the module: free-form chat and strict-JSON (optionally with an
// image) for KYC/profile extraction. Mirrors the OpenAI/Gemini providers so a
// single configured key is enough.

let _anthropicKey: string | null = null;

export function setAnthropicKeyOverride(key: string | null): void {
  _anthropicKey = key || null;
}

export function getAnthropicKeyOverride(): string | null {
  return _anthropicKey;
}

export function getAnthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || _anthropicKey || null;
}

export async function callAnthropic(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  maxTokens: number = AI_CONFIG.maxTokens.chat,
): Promise<string | null> {
  const key = getAnthropicKey();
  if (!key) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });

    // Claude requires the conversation to start with a user turn and alternate.
    // Our history is already user/assistant; map roles and append the new turn.
    const messages = [
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await client.messages.create({
      model: AI_CONFIG.models.anthropicChat,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err: any) {
    console.warn("[AI] Anthropic call failed:", err?.message);
    return null;
  }
}

/**
 * Ask Claude for a strict JSON object (optionally about an image). Used as the
 * extraction fallback so KYC/profile reading works whether the configured key is
 * OpenAI, Gemini or Anthropic. Returns the parsed object, or null if
 * unavailable/failed.
 */
export async function callAnthropicJson(
  systemPrompt: string,
  userText: string,
  image?: { mimeType: string; base64: string },
  maxTokens: number = AI_CONFIG.maxTokens.recruitment,
): Promise<Record<string, any> | null> {
  const key = getAnthropicKey();
  if (!key) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });

    const content: any[] = [{ type: "text", text: userText }];
    if (image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mimeType, data: image.base64 },
      });
    }

    const response = await client.messages.create({
      model: AI_CONFIG.models.anthropicChat,
      max_tokens: maxTokens,
      // Claude has no native JSON mode; instruct it explicitly and prefill the
      // assistant turn with "{" so the reply is a bare JSON object.
      system: `${systemPrompt}\n\nRespond with ONLY a single valid JSON object. No prose, no code fences.`,
      messages: [
        { role: "user", content },
        { role: "assistant", content: "{" },
      ],
    });

    const raw = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    // Re-attach the prefill "{" and strip any accidental code fences.
    const txt = ("{" + raw).replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch (err: any) {
    console.warn("[AI] Anthropic JSON extraction failed:", err?.message);
    return null;
  }
}
