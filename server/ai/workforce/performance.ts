// Phase 6 — Performance Intelligence (read-only, explainable).
// Turns deterministic KRA/appraisal + attendance + tenure signals into per-
// employee performance decisions and department rollups. The LLM only phrases.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf } from "../decision/types";
import { buildPerformancePrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

function perfConfidence(e: EmployeeSignal): Confidence {
  return confidenceFrom(completenessOf([
    e.performanceScore != null,
    e.reviewsCount > 1,
    e.attendanceRatePct != null,
    e.tenureMonths != null,
  ]));
}

export function computePerformance(signals: WorkforceSignals): DecisionFacts {
  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    if (e.performanceScore == null) continue;
    const s = e.performanceScore;
    const category = s >= 85 ? "top" : s >= 70 ? "strong" : s >= 50 ? "solid" : "needs_improvement";
    const recommendation =
      category === "top" ? "Top performer"
      : category === "strong" ? "Strong performer"
      : category === "solid" ? "Solid contributor"
      : "Needs improvement";

    const reasons: string[] = [`Latest review score ${s}/100.`];
    if (e.performanceTrend != null) {
      reasons.push(e.performanceTrend >= 0
        ? `Improved ${e.performanceTrend} point(s) vs the previous review.`
        : `Declined ${Math.abs(e.performanceTrend)} point(s) vs the previous review.`);
    }
    if (e.attendanceRatePct != null) reasons.push(`Attendance ${e.attendanceRatePct}% this month.`);
    if (e.tenureMonths != null) reasons.push(`${e.tenureMonths} month(s) tenure.`);

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation,
      score: s,
      category,
      confidence: perfConfidence(e),
      reasons,
      supportingData: {
        performanceScore: s,
        performanceTrend: e.performanceTrend,
        attendanceRatePct: e.attendanceRatePct,
        tenureMonths: e.tenureMonths,
        department: e.department,
        designation: e.designation,
      },
      businessImpact:
        category === "needs_improvement" ? "May need coaching to reach expected output."
        : category === "top" ? "Key talent worth recognizing and retaining."
        : null,
      risks: e.reviewsCount <= 1 ? ["Based on a single review; limited history."] : [],
      alternatives:
        category === "needs_improvement" ? ["Schedule a performance check-in", "Agree a focused improvement plan"]
        : category === "top" ? ["Consider recognition, a stretch project, or a promotion review"]
        : [],
    });
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const anomalies: Anomaly[] = [];
  for (const d of signals.departments) {
    if (d.avgPerformance != null && d.avgPerformance < 50 && d.withPerformance >= 2) {
      anomalies.push({ code: "low_dept_performance", severity: "warning", message: `${d.department} average performance is ${d.avgPerformance}/100.`, value: d.avgPerformance });
    }
  }
  if (!decisions.length) anomalies.push({ code: "no_reviews", severity: "info", message: "No performance reviews on record to analyze." });

  return {
    engine: "performance",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: {
      employees: signals.coverage.employees,
      analyzed: decisions.length,
      note: signals.coverage.withPerformance < signals.coverage.employees
        ? "Some employees have no review on record and are omitted." : undefined,
    },
  };
}

export async function explainPerformance(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("performance_insight", buildPerformancePrompt(), compact(facts), "explain performance", companyId);
}
