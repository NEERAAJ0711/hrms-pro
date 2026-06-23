// Phase 6 — Succession Planning (read-only, explainable).
// Identifies high-potential employees who could step into leadership/critical
// roles, with a readiness view and gaps, and flags key-person risk where a
// department depends on a single manager. Deterministic; LLM only phrases.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf, score100, band } from "../decision/types";
import { buildSuccessionPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

const MIN_HIPO_PERF = 78;
const MIN_HIPO_TENURE = 18;

function hipoConfidence(e: EmployeeSignal): Confidence {
  return confidenceFrom(completenessOf([
    e.performanceScore != null,
    e.reviewsCount > 1,
    e.tenureMonths != null,
    e.attendanceRatePct != null,
  ]));
}

export function computeSuccession(signals: WorkforceSignals): DecisionFacts {
  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    if (e.performanceScore == null || e.tenureMonths == null) continue;
    if (e.performanceScore < MIN_HIPO_PERF || e.tenureMonths < MIN_HIPO_TENURE) continue;

    // Potential = performance 55%, tenure depth 20%, attendance 15%, upward
    // trajectory 10%.
    const tenureRatio = Math.min(1, e.tenureMonths / 36);
    const att = e.attendanceRatePct ?? 0;
    const trend = e.performanceTrend != null && e.performanceTrend >= 0 ? 1 : 0;
    const potential = score100(e.performanceScore * 0.55 + tenureRatio * 100 * 0.2 + att * 0.15 + trend * 100 * 0.1);
    const category = band(potential, 60, 80);

    const gaps: string[] = [];
    if (!e.isManager) gaps.push("No direct-report experience yet.");
    if (e.attendanceRatePct != null && e.attendanceRatePct < 90) gaps.push(`Attendance ${e.attendanceRatePct}% — aim higher for a leadership role.`);
    if (e.reviewsCount <= 1) gaps.push("Limited review history to confirm consistency.");

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation: e.isManager ? "Leadership successor candidate" : "High-potential bench candidate",
      score: potential,
      category,
      confidence: hipoConfidence(e),
      reasons: [
        `Performance ${e.performanceScore}/100.`,
        `${e.tenureMonths} month(s) tenure.`,
        ...(e.attendanceRatePct != null ? [`Attendance ${e.attendanceRatePct}%.`] : []),
        ...(trend ? ["Stable or improving trajectory."] : []),
      ],
      supportingData: {
        potentialScore: potential,
        performanceScore: e.performanceScore,
        tenureMonths: e.tenureMonths,
        attendanceRatePct: e.attendanceRatePct,
        department: e.department,
        currentRole: e.designation,
        isManager: e.isManager ? "yes" : "no",
      },
      businessImpact: "Strengthens the leadership bench and reduces key-person risk.",
      risks: e.reviewsCount <= 1 ? ["Single review; potential not yet proven over time."] : [],
      alternatives: gaps.length ? gaps : ["Enroll in a leadership-development track"],
    });
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Key-person risk: departments led by a single manager with no bench.
  const anomalies: Anomaly[] = [];
  const benchByDept = new Map<string, number>();
  for (const d of decisions) {
    const dept = String(d.supportingData.department ?? "");
    benchByDept.set(dept, (benchByDept.get(dept) || 0) + 1);
  }
  for (const dept of signals.departments) {
    const managers = signals.employees.filter((e) => e.department === dept.department && e.isManager).length;
    if (dept.headcount >= 3 && managers <= 1 && (benchByDept.get(dept.department) || 0) === 0) {
      anomalies.push({ code: "key_person_risk", severity: "warning", message: `${dept.department} relies on one manager with no identified successor.` });
    }
  }
  if (!decisions.length) anomalies.push({ code: "no_hipo", severity: "info", message: "No high-potential candidates met the succession thresholds." });

  return {
    engine: "succession",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainSuccession(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("succession_plan", buildSuccessionPrompt(), compact(facts), "explain succession planning", companyId);
}
