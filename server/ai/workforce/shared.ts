// Phase 6 — small shared plumbing for the decision engines: a single explain
// wrapper (so every engine phrases its deterministic decisions the same way and
// degrades gracefully without an AI key) and a payload compactor (so the LLM
// only ever sees the top decisions, never the full roster).

import type { AiFeature } from "../config";
import { explainFacts } from "../analytics/narrative";
import type { AiResult, AiNarrative, DecisionFacts } from "../decision/types";

export function compact(facts: DecisionFacts, n = 12): DecisionFacts {
  if (facts.decisions.length <= n) return facts;
  return { ...facts, decisions: facts.decisions.slice(0, n) };
}

export async function explainDecisions(
  feature: AiFeature,
  system: string,
  facts: DecisionFacts | unknown,
  action: string,
  companyId?: string | null,
): Promise<AiResult<AiNarrative>> {
  return explainFacts({ feature, system, facts, action, companyId });
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Median of a numeric list (deterministic; used for pay-parity comparisons).
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round1((s[mid - 1] + s[mid]) / 2);
}
