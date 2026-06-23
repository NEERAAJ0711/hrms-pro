import * as fs from "fs";
import type { KycExtractionResult } from "../types";
import { getOpenAI } from "../providers/openai";
import { getGeminiKey, callGeminiJson } from "../providers/gemini";
import { getAnthropicKey, callAnthropicJson } from "../providers/anthropic";
import { AI_CONFIG } from "../config";
import { recordUsage } from "../metrics/usage";
import {
  KYC_EXTRACTION_SPEC,
  buildKycSystemPrompt,
  buildKycUserText,
} from "../prompts/extraction";

// ─── KYC Document Vision Extraction ───────────────────────────────────────────
// Reads an uploaded KYC image (JPEG/PNG/WebP) with a vision model and returns the
// structured fields found on the document so the employee can verify them before
// they are saved to the master record. Works with either provider: tries OpenAI
// first, then falls back to Gemini, so a single configured key is enough.

export function isKycExtractable(docType: string): boolean {
  return docType in KYC_EXTRACTION_SPEC;
}

export async function extractKycDocument(
  absFilePath: string,
  mimeType: string,
  docType: string,
): Promise<KycExtractionResult> {
  const spec = KYC_EXTRACTION_SPEC[docType];
  if (!spec) return { available: false, reason: "unsupported_doc_type" };
  if (!/^image\//i.test(mimeType)) return { available: false, reason: "not_an_image" };

  const openai = getOpenAI();
  const geminiAvailable = !!getGeminiKey();
  const anthropicAvailable = !!getAnthropicKey();
  if (!openai && !geminiAvailable && !anthropicAvailable) return { available: false, reason: "no_ai_key" };

  const systemPrompt = buildKycSystemPrompt(spec);
  const userText = buildKycUserText(spec);

  let parsed: Record<string, any> | null = null;
  let providerResponded = false;
  try {
    const buf = fs.readFileSync(absFilePath);
    const base64 = buf.toString("base64");
    const dataUri = `data:${mimeType};base64,${base64}`;

    // 1. Try OpenAI vision (if an OpenAI key is configured)
    if (openai) {
      const started = Date.now();
      try {
        const response = await openai.chat.completions.create({
          model: AI_CONFIG.models.openaiChat,
          temperature: AI_CONFIG.temperatures.extraction,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: dataUri } },
              ] as any,
            },
          ],
        });
        providerResponded = true;
        recordUsage({
          feature: "kyc_extraction",
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
        console.warn("[AI] OpenAI KYC extraction failed, trying Gemini:", err?.message);
      }
    }

    // 2. Fall back to Gemini vision (if OpenAI is absent or failed)
    if (!parsed && geminiAvailable) {
      parsed = await callGeminiJson(systemPrompt, userText, { mimeType, base64 });
      if (parsed) {
        providerResponded = true;
        recordUsage({ feature: "kyc_extraction", provider: "gemini", model: AI_CONFIG.models.geminiChat });
      }
    }

    // 3. Fall back to Anthropic Claude vision (if both above are absent or failed)
    if (!parsed && anthropicAvailable) {
      parsed = await callAnthropicJson(systemPrompt, userText, { mimeType, base64 });
      if (parsed) {
        providerResponded = true;
        recordUsage({ feature: "kyc_extraction", provider: "anthropic", model: AI_CONFIG.models.anthropicChat });
      }
    }
  } catch (err: any) {
    console.warn("[AI] KYC extraction failed:", err?.message);
    return { available: false, reason: "extraction_error" };
  }

  // A provider answered but returned unparseable JSON → treat as no fields found
  // (preserves prior behavior) rather than a hard error.
  if (!parsed) {
    if (providerResponded) return { available: true, reason: "no_fields_found", fields: {} };
    return { available: false, reason: "extraction_error" };
  }

  const fields: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = parsed[f];
    if (v != null && String(v).trim()) fields[f] = String(v).trim();
  }

  if (Object.keys(fields).length === 0) {
    return { available: true, reason: "no_fields_found", fields: {} };
  }
  return { available: true, fields };
}
