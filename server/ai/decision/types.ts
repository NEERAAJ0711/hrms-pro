// Phase 6 — Decision Explanation Framework (reusable across every intelligence
// engine: performance, promotion, increment, attrition, succession, learning,
// mobility, org-health, executive).
//
// Design rule (same as Phase 4): every figure shown is computed DETERMINISTICALLY
// from live HRMS data and lives in a Decision/`*Facts` object. The LLM only ever
// phrases a narrative over these already-computed decisions — it never produces a
// score, a category, or a number, and never claims to have taken an action. So a
// missing/invalid AI key degrades to "decisions only" with a graceful message,
// and the decisions remain fully usable and explainable on their own.

import type { Anomaly } from "../analytics/types";

export type { AiResult } from "../recruitment/types";
export type { AiNarrative, Anomaly } from "../analytics/types";
export { noKey, noData, aiError } from "../analytics/types";

// Confidence reflects how complete the supporting data is — NOT model certainty.
export type Confidence = "low" | "medium" | "high";

// A single explainable recommendation. This is the shared shape the spec calls
// for: Reason, Supporting Data, Confidence, Business Impact, Potential Risks,
// Alternative Actions. Every engine emits Decision[] so the explanation
// framework is identical everywhere.
export interface Decision {
  // Who/what the decision is about (employee name, department, company…).
  subject: string;
  subjectId?: string | null;
  // Deterministic headline outcome, e.g. "Promotion-ready", "High attrition risk".
  recommendation: string;
  // Optional 0–100 deterministic score and/or a category bucket.
  score?: number | null;
  category?: string | null;
  // How complete the inputs were (drives trust, never fabricated).
  confidence: Confidence;
  // Why — deterministic, fact-grounded bullet reasons.
  reasons: string[];
  // The exact figures used to reach the recommendation.
  supportingData: Record<string, number | string | null>;
  // What this means for the business (deterministic, neutral).
  businessImpact?: string | null;
  // Deterministic caveats / what could be wrong.
  risks: string[];
  // Optional human next steps (never auto-executed).
  alternatives: string[];
}

// Map data completeness (0..1) to a confidence label. Used by every engine so
// confidence means the same thing across modules.
export function confidenceFrom(completeness: number): Confidence {
  if (completeness >= 0.75) return "high";
  if (completeness >= 0.4) return "medium";
  return "low";
}

// Completeness from a checklist of present/absent signals.
export function completenessOf(flags: boolean[]): number {
  if (!flags.length) return 0;
  return flags.filter(Boolean).length / flags.length;
}

// Clamp + round a 0–100 score deterministically.
export function score100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Bucket a 0–100 score into a low/medium/high band.
export function band(score: number, lowMax = 40, medMax = 70): "low" | "medium" | "high" {
  if (score <= lowMax) return "low";
  if (score <= medMax) return "medium";
  return "high";
}

// Standard envelope a decision-engine "facts" object shares: a period, the
// deterministic decisions, optional rollups, and anomalies.
export interface DecisionFacts {
  engine: string;
  period: { month: number; year: number; label: string };
  scope: "company" | "team" | "employee";
  decisions: Decision[];
  anomalies: Anomaly[];
  coverage: { employees: number; analyzed: number; note?: string };
}
