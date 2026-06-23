// Phase 6 — Promotion Readiness Engine (read-only, explainable).
// Deterministic readiness score from performance, tenure, attendance and
// trajectory, plus the requirements still missing. Suggestions only — a human
// always decides.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf, score100, band } from "../decision/types";
import { buildPromotionPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

// Minimum tenure (months) we expect before a promotion is reasonable.
const MIN_TENURE_MONTHS = 18;

function readinessConfidence(e: EmployeeSignal): Confidence {
  return confidenceFrom(completenessOf([
    e.performanceScore != null,
    e.reviewsCount > 1,
    e.tenureMonths != null,
    e.attendanceRatePct != null,
  ]));
}

export function computePromotion(signals: WorkforceSignals): DecisionFacts {
  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    if (e.performanceScore == null && e.tenureMonths == null) continue;

    // Deterministic weighted readiness: performance 50%, tenure 25%,
    // attendance 15%, positive trajectory 10%.
    const perf = e.performanceScore ?? 0;
    const tenureRatio = e.tenureMonths != null ? Math.min(1, e.tenureMonths / MIN_TENURE_MONTHS) : 0;
    const att = e.attendanceRatePct ?? 0;
    const trendBonus = e.performanceTrend != null && e.performanceTrend > 0 ? 1 : 0;
    const raw = perf * 0.5 + tenureRatio * 100 * 0.25 + att * 0.15 + trendBonus * 100 * 0.1;
    const readiness = score100(raw);
    const category = band(readiness, 45, 70); // low / medium / high

    const missing: string[] = [];
    if (e.performanceScore == null) missing.push("No performance review on record.");
    else if (e.performanceScore < 75) missing.push(`Performance ${e.performanceScore}/100 is below the ~75 promotion bar.`);
    if (e.tenureMonths == null) missing.push("Joining date missing — tenure unknown.");
    else if (e.tenureMonths < MIN_TENURE_MONTHS) missing.push(`Tenure ${e.tenureMonths}m is under the ${MIN_TENURE_MONTHS}m guideline.`);
    if (e.attendanceRatePct != null && e.attendanceRatePct < 85) missing.push(`Attendance ${e.attendanceRatePct}% is below 85%.`);

    const recommendation = category === "high" ? "Promotion-ready" : category === "medium" ? "Approaching readiness" : "Not yet ready";
    const reasons: string[] = [];
    if (e.performanceScore != null) reasons.push(`Performance ${e.performanceScore}/100.`);
    if (e.tenureMonths != null) reasons.push(`${e.tenureMonths} month(s) tenure.`);
    if (e.attendanceRatePct != null) reasons.push(`Attendance ${e.attendanceRatePct}%.`);
    if (e.performanceTrend != null && e.performanceTrend > 0) reasons.push(`Performance trending up (+${e.performanceTrend}).`);

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation,
      score: readiness,
      category,
      confidence: readinessConfidence(e),
      reasons,
      supportingData: {
        readinessScore: readiness,
        performanceScore: e.performanceScore,
        tenureMonths: e.tenureMonths,
        attendanceRatePct: e.attendanceRatePct,
        department: e.department,
        designation: e.designation,
      },
      businessImpact: category === "high" ? "Ready for added responsibility; promoting retains and motivates strong talent." : null,
      risks: e.reviewsCount <= 1 ? ["Readiness based on a single review."] : [],
      alternatives: missing.length ? missing : ["Add to the next promotion review cycle"],
    });
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const anomalies: Anomaly[] = [];
  const ready = decisions.filter((d) => d.category === "high").length;
  if (ready > 0) anomalies.push({ code: "promotion_ready", severity: "info", message: `${ready} employee(s) appear promotion-ready.`, value: ready });
  if (!decisions.length) anomalies.push({ code: "insufficient_data", severity: "info", message: "Not enough performance/tenure data to assess promotion readiness." });

  return {
    engine: "promotion",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainPromotion(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("promotion_readiness", buildPromotionPrompt(), compact(facts), "explain promotion readiness", companyId);
}
