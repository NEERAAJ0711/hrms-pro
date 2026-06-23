// Phase 6 — Learning & Development recommendations (read-only, explainable).
// Derives focus areas from performance gaps, tenure stage and role. There is no
// training/course catalog table, so recommendations are role/competency themes
// a human can map to actual programs — never fabricated course names.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf } from "../decision/types";
import { buildLearningPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

function ldConfidence(e: EmployeeSignal): Confidence {
  return confidenceFrom(completenessOf([
    e.performanceScore != null,
    e.tenureMonths != null,
    e.attendanceRatePct != null,
    e.reviewsCount > 0,
  ]));
}

export function computeLearning(signals: WorkforceSignals): DecisionFacts {
  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    const focus: string[] = [];
    const reasons: string[] = [];

    if (e.tenureMonths != null && e.tenureMonths < 6) {
      focus.push("Onboarding & foundational role skills");
      reasons.push(`New joiner (${e.tenureMonths}m) — foundational ramp-up.`);
    }
    if (e.performanceScore != null) {
      if (e.performanceScore < 50) { focus.push("Core role competency / functional skills"); reasons.push(`Performance ${e.performanceScore}/100 indicates a skills gap.`); }
      else if (e.performanceScore < 70) { focus.push("Targeted upskilling in weak KPI areas"); reasons.push(`Performance ${e.performanceScore}/100 — room to grow.`); }
      else if (e.performanceScore >= 85) { focus.push("Leadership & mentoring development"); reasons.push(`High performer (${e.performanceScore}/100) — ready for stretch/leadership learning.`); }
    }
    if (e.performanceTrend != null && e.performanceTrend < 0) {
      focus.push("Refresher on recent performance dip areas");
      reasons.push(`Performance fell ${Math.abs(e.performanceTrend)} point(s).`);
    }
    if (e.attendanceRatePct != null && e.attendanceRatePct < 80) {
      focus.push("Time management & engagement");
      reasons.push(`Attendance ${e.attendanceRatePct}% suggests engagement support may help.`);
    }
    if (e.isManager) {
      focus.push("People-management & coaching skills");
      reasons.push("Manages a team — ongoing leadership development.");
    }

    if (!focus.length) continue; // nothing specific to recommend

    const priority = e.performanceScore != null && e.performanceScore < 50 ? "high" : e.performanceScore != null && e.performanceScore < 70 ? "medium" : "low";
    // De-duplicate focus areas while preserving order.
    const uniqueFocus = Array.from(new Set(focus));

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation: `Development focus: ${uniqueFocus[0]}`,
      score: null,
      category: priority,
      confidence: ldConfidence(e),
      reasons,
      supportingData: {
        performanceScore: e.performanceScore,
        performanceTrend: e.performanceTrend,
        attendanceRatePct: e.attendanceRatePct,
        tenureMonths: e.tenureMonths,
        department: e.department,
        role: e.designation,
        focusAreas: uniqueFocus.join("; "),
      },
      businessImpact: priority === "high" ? "Closing this gap directly lifts team output." : null,
      risks: e.reviewsCount === 0 ? ["No review on record; recommendation is role/tenure-based only."] : [],
      alternatives: uniqueFocus.slice(1),
    });
  }
  // Highest priority first.
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  decisions.sort((a, b) => (rank[a.category ?? "low"] ?? 2) - (rank[b.category ?? "low"] ?? 2));

  const anomalies: Anomaly[] = [];
  const highNeed = decisions.filter((d) => d.category === "high").length;
  if (highNeed > 0) anomalies.push({ code: "high_ld_need", severity: "info", message: `${highNeed} employee(s) have a high-priority development need.`, value: highNeed });

  return {
    engine: "learning",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainLearning(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("learning_reco", buildLearningPrompt(), compact(facts), "explain learning recommendations", companyId);
}
