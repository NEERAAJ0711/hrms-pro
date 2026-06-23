// Phase 4 — Attendance, Leave & Payroll AI shared types & helpers.
//
// Design rule (no hallucination): every number shown to the user is computed
// DETERMINISTICALLY from live DB data and lives in a `*Facts` object. The LLM is
// only ever asked to phrase a plain-language NARRATIVE (explanation + insights +
// recommendations) over those already-computed facts — it never produces or
// alters a figure. So a missing/invalid AI key degrades to "facts only" with a
// graceful message, and the facts remain fully usable on their own.

// Reuse the Phase 2/3 result envelope so the whole AI surface is consistent.
export type { AiResult } from "../recruitment/types";

// Graceful, non-fabricating outcomes (mirror the recruitment service helpers).
export const noKey = (action: string) => ({
  available: false as const,
  reason: "no_ai_key",
  message: `AI is not configured. Add an OpenAI or Gemini API key in Settings → API Keys to ${action}.`,
});

export const noData = (msg: string) => ({ available: false as const, reason: "no_data", message: msg });
export const aiError = (msg: string) => ({ available: false as const, reason: "ai_error", message: msg });

// The narrative the LLM returns over computed facts. Intentionally simple and
// permissive — never carries numbers the facts object doesn't already hold.
export interface AiNarrative {
  explanation: string;
  insights: string[];
  recommendations: string[];
}

// ── Severity used by deterministic anomaly detection ─────────────────────────
export type AnomalySeverity = "info" | "warning" | "critical";

export interface Anomaly {
  code: string;
  severity: AnomalySeverity;
  message: string;
  // Optional supporting figures (already computed, never AI-sourced).
  value?: number | string | null;
}
