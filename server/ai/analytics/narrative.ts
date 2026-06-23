import { createHash } from "crypto";
import type { AiFeature } from "../config";
import { callAnalyticsJson } from "./ai-json";
import type { AiResult, AiNarrative } from "./types";
import { noKey, aiError } from "./types";

// Phase 4 — shared narrative generator. Each analytics service computes its
// FACTS deterministically, then calls this to get a plain-language narrative
// over those facts. Centralizing it guarantees every module phrases facts the
// same way, parses the LLM output defensively, and degrades gracefully with no
// AI key. The LLM only ever sees pre-computed facts, so it cannot fabricate a
// figure.

function strArr(v: any, limit: number): string[] {
  let arr: string[] = [];
  if (Array.isArray(v)) arr = v.map((x) => String(x ?? "").trim()).filter(Boolean);
  else if (typeof v === "string" && v.trim()) arr = v.split(/\n/).map((s) => s.trim()).filter(Boolean);
  return arr.slice(0, limit);
}

function stableKey(feature: string, payload: string): string {
  const h = createHash("sha1").update(payload).digest("hex").slice(0, 16);
  return `${feature}:${h}`;
}

export interface ExplainOptions {
  feature: AiFeature;
  system: string;
  // The deterministic facts object the LLM must phrase (never alter).
  facts: unknown;
  // Human action phrase for the graceful no-key message, e.g. "explain attendance".
  action: string;
  companyId?: string | null;
}

export async function explainFacts(opts: ExplainOptions): Promise<AiResult<AiNarrative>> {
  const { feature, system, facts, action, companyId } = opts;
  const factsJson = JSON.stringify(facts);
  const user = `FACTS:\n${factsJson}`;
  const outcome = await callAnalyticsJson({
    feature,
    system,
    user,
    cacheKey: stableKey(feature, factsJson),
    companyId,
  });
  if (!outcome.ok) {
    return outcome.reason === "no_ai_key" ? noKey(action) : aiError(`Could not generate the ${action} narrative.`);
  }
  const d = outcome.data;
  return {
    available: true,
    data: {
      explanation: String(d.explanation ?? "").trim(),
      insights: strArr(d.insights, 5),
      recommendations: strArr(d.recommendations, 4),
    },
  };
}
