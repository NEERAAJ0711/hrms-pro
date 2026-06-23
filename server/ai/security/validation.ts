import { AI_CONFIG } from "../config";

// Basic input validation / normalization for AI entry points. Non-destructive
// by default — callers decide whether to enforce the result.

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function clampLength(text: string, max: number = AI_CONFIG.security.maxInputChars): string {
  return text.length <= max ? text : text.slice(0, max);
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n");
}

export interface ValidationResult {
  ok: boolean;
  value: string;
  truncated: boolean;
  reason?: string;
}

export function validateUserMessage(raw: unknown): ValidationResult {
  if (!isNonEmptyString(raw)) {
    return { ok: false, value: "", truncated: false, reason: "empty" };
  }
  const normalized = normalizeWhitespace(raw);
  const truncated = normalized.length > AI_CONFIG.security.maxInputChars;
  return { ok: true, value: clampLength(normalized), truncated };
}
