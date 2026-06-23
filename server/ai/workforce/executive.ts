// Phase 6 — Executive Decision Support (read-only, explainable).
// Composes the individual engines (computed from ONE signals pass) into a
// concise leadership briefing: the few workforce decisions that matter most for
// a CEO/CHRO, each with rationale and confidence. Deterministic synthesis; the
// LLM only phrases the briefing.

import type { WorkforceSignals } from "./signals";
import type { Decision, DecisionFacts, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf } from "../decision/types";
import { computePerformance } from "./performance";
import { computeAttrition } from "./attrition";
import { computePromotion } from "./promotion";
import { computeSuccession } from "./succession";
import { computeOrgHealth } from "./health";
import { buildLeadershipReportPrompt } from "./prompts";
import { explainDecisions, compact, round1 } from "./shared";

function avg(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function computeLeadershipReport(signals: WorkforceSignals): DecisionFacts {
  const performance = computePerformance(signals);
  const attrition = computeAttrition(signals);
  const promotion = computePromotion(signals);
  const succession = computeSuccession(signals);
  const health = computeOrgHealth(signals);

  const highRisk = attrition.decisions.filter((d) => d.category === "high");
  const promotionReady = promotion.decisions.filter((d) => d.category === "high");
  const topPerformers = performance.decisions.filter((d) => d.category === "top");
  const hipo = succession.decisions.length;
  const companyHealth = health.decisions[0]; // unshifted overall headline

  const compPerf = avg(signals.employees.filter((e) => e.performanceScore != null).map((e) => e.performanceScore!));
  const compAtt = avg(signals.employees.filter((e) => e.attendanceRatePct != null).map((e) => e.attendanceRatePct!));
  const conf = confidenceFrom(completenessOf([
    signals.coverage.withPerformance > 0,
    signals.coverage.withAttendance > 0,
    signals.headcount > 0,
    signals.coverage.withPerformance >= signals.headcount * 0.5,
  ]));

  const decisions: Decision[] = [];

  if (companyHealth) {
    decisions.push({ ...companyHealth, subject: "Organizational health", confidence: companyHealth.confidence });
  }

  decisions.push({
    subject: "Retention priority",
    subjectId: null,
    recommendation: highRisk.length ? `${highRisk.length} employee(s) at high attrition risk` : "Attrition risk is contained",
    score: null,
    category: highRisk.length >= 5 ? "high" : highRisk.length > 0 ? "medium" : "low",
    confidence: conf,
    reasons: highRisk.length
      ? [`Top at-risk: ${highRisk.slice(0, 5).map((d) => d.subject).join(", ")}.`]
      : ["No employees crossed the high-risk threshold this period."],
    supportingData: { highRiskCount: highRisk.length, headcount: signals.headcount },
    businessImpact: highRisk.length ? "Proactive retention is cheaper than rehiring and protects delivery." : null,
    risks: signals.coverage.withAttendance < signals.headcount ? ["Attendance data incomplete for some staff."] : [],
    alternatives: highRisk.length ? ["Prioritize retention 1:1s for the highest-risk names"] : ["Maintain monitoring"],
  });

  decisions.push({
    subject: "Talent strength",
    subjectId: null,
    recommendation: `${topPerformers.length} top performer(s), ${promotionReady.length} promotion-ready, ${hipo} succession candidate(s)`,
    score: compPerf,
    category: (compPerf ?? 0) >= 70 ? "high" : (compPerf ?? 0) >= 50 ? "medium" : "low",
    confidence: conf,
    reasons: [
      ...(compPerf != null ? [`Company average performance ${compPerf}/100.`] : ["No performance reviews on record."]),
      ...(promotionReady.length ? [`Promotion-ready: ${promotionReady.slice(0, 5).map((d) => d.subject).join(", ")}.`] : []),
    ],
    supportingData: {
      topPerformers: topPerformers.length,
      promotionReady: promotionReady.length,
      successionCandidates: hipo,
      avgPerformance: compPerf,
    },
    businessImpact: "A visible pipeline supports retention and reduces external hiring.",
    risks: signals.coverage.withPerformance < signals.headcount ? ["Performance coverage is partial."] : [],
    alternatives: ["Confirm promotions/recognition in the next cycle"],
  });

  decisions.push({
    subject: "Workforce snapshot",
    subjectId: null,
    recommendation: `${signals.headcount} active employees across ${signals.departments.length} department(s)`,
    score: null,
    category: null,
    confidence: conf,
    reasons: [
      ...(compAtt != null ? [`Company attendance ${compAtt}%.`] : []),
      ...(compPerf != null ? [`Company performance ${compPerf}/100.`] : []),
    ],
    supportingData: {
      headcount: signals.headcount,
      departments: signals.departments.length,
      avgAttendanceRatePct: compAtt,
      avgPerformance: compPerf,
    },
    businessImpact: null,
    risks: [],
    alternatives: [],
  });

  const anomalies: Anomaly[] = [
    ...health.anomalies,
    ...attrition.anomalies.filter((a) => a.severity === "critical"),
  ];

  return {
    engine: "leadership_report",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainLeadershipReport(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("leadership_report", buildLeadershipReportPrompt(), compact(facts, 8), "write the leadership briefing", companyId);
}
