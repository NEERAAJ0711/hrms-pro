// Phase 6 — Strategic HR Copilot (read-only, explainable).
// A thin strategic router: classify a leadership question to the right decision
// engine, run that engine over a single signals pass, and phrase a grounded
// answer. It never invents data — if a topic has no signals, the engine returns
// its own graceful "no data" facts.

import type { WorkforceSignals } from "./signals";
import type { DecisionFacts, AiResult, AiNarrative } from "../decision/types";
import { computePerformance } from "./performance";
import { computePromotion } from "./promotion";
import { computeIncrement } from "./increment";
import { computeAttrition } from "./attrition";
import { computeSuccession } from "./succession";
import { computeLearning } from "./learning";
import { computeMobility } from "./mobility";
import { computeOrgHealth } from "./health";
import { computeLeadershipReport } from "./executive";
import { buildCopilotPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

export type StrategyTopic =
  | "performance" | "promotion" | "increment" | "attrition"
  | "succession" | "learning" | "mobility" | "org_health" | "leadership";

// RBAC: which app modules a copilot answer for each topic actually reads. The
// copilot can route into salary-sensitive (increment → payroll) or
// recruitment-sensitive (mobility → job postings) data, so the caller MUST
// clear EVERY module the chosen topic surfaces — not just attendance/leave —
// or a user with a revoked payroll/recruitment permission could read those
// insights through the copilot. "leadership" composes the signals-only engines.
export const STRATEGY_TOPIC_MODULES: Record<StrategyTopic, string[]> = {
  performance: ["employees"],
  promotion: ["employees"],
  increment: ["payroll"],
  attrition: ["attendance", "leave"],
  succession: ["employees"],
  learning: ["employees"],
  mobility: ["employees", "recruitment"],
  org_health: ["attendance", "leave"],
  leadership: ["employees", "attendance", "leave"],
};

export function strategyTopicModules(topic: StrategyTopic): string[] {
  return STRATEGY_TOPIC_MODULES[topic] ?? ["attendance", "leave"];
}

// Deterministic keyword classifier (first strong match wins). Defaults to a
// leadership overview when nothing specific matches.
export function classifyStrategicTopic(text: string): StrategyTopic {
  const t = text.toLowerCase();
  if (/(attrition|churn|quit|resign|leav(e|ing) (the )?(company|org)|retention|flight risk|turnover)/.test(t)) return "attrition";
  if (/(promot|ready for (a )?promotion|next level|elevate)/.test(t)) return "promotion";
  if (/(increment|raise|hike|salary review|appraisal pay|pay revision|compensation)/.test(t)) return "increment";
  if (/(success(ion)?|bench|backup|replace.*manager|key person|leadership pipeline)/.test(t)) return "succession";
  if (/(learn|train|upskill|reskill|develop(ment)?|course|skill gap)/.test(t)) return "learning";
  if (/(mobility|internal (move|hire|fit|candidate)|open (role|position)|transfer)/.test(t)) return "mobility";
  if (/(org(ani[sz]ational)? health|health score|engagement|morale|wellbeing|department health)/.test(t)) return "org_health";
  if (/(perform|top performer|kra|kpi|appraisal score|under.?perform)/.test(t)) return "performance";
  return "leadership";
}

export async function computeStrategyFacts(
  topic: StrategyTopic,
  signals: WorkforceSignals,
  companyId: string,
): Promise<DecisionFacts> {
  switch (topic) {
    case "performance": return computePerformance(signals);
    case "promotion": return computePromotion(signals);
    case "increment": return computeIncrement(signals);
    case "attrition": return computeAttrition(signals);
    case "succession": return computeSuccession(signals);
    case "learning": return computeLearning(signals);
    case "mobility": return await computeMobility(signals, companyId);
    case "org_health": return computeOrgHealth(signals);
    case "leadership":
    default: return computeLeadershipReport(signals);
  }
}

export async function answerCopilot(
  question: string,
  facts: DecisionFacts,
  companyId?: string | null,
): Promise<AiResult<AiNarrative>> {
  const payload = { question, ...compact(facts, 10) };
  return explainDecisions("hr_copilot", buildCopilotPrompt(), payload, "answer the strategic question", companyId);
}
