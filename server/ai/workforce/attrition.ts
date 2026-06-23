// Phase 6 — Attrition Risk Intelligence (read-only, explainable).
// Deterministic risk score from attendance decline, absenteeism, leave pattern,
// performance change and tenure stage, plus the drivers and suggested
// retention interventions. Flags risk for human attention — never acts.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf, score100, band } from "../decision/types";
import { buildAttritionPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

function riskConfidence(e: EmployeeSignal): Confidence {
  return confidenceFrom(completenessOf([
    e.attendanceRatePct != null,
    e.attendanceTrendPct != null,
    e.performanceScore != null,
    e.tenureMonths != null,
  ]));
}

export function computeAttrition(signals: WorkforceSignals): DecisionFacts {
  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    let risk = 0;
    const reasons: string[] = [];
    const drivers: string[] = [];

    // Attendance decline (up to 25).
    if (e.attendanceTrendPct != null && e.attendanceTrendPct < 0) {
      const pts = Math.min(25, Math.abs(e.attendanceTrendPct));
      risk += pts;
      reasons.push(`Attendance dropped ${Math.abs(e.attendanceTrendPct)}pp vs last month.`);
      drivers.push("attendance_decline");
    }
    // Low absolute attendance (up to 20).
    if (e.attendanceRatePct != null && e.attendanceRatePct < 80) {
      risk += Math.min(20, (80 - e.attendanceRatePct) * 0.8);
      reasons.push(`Attendance ${e.attendanceRatePct}% is below 80%.`);
      drivers.push("low_attendance");
    }
    // Absences this month (up to 15).
    if (e.absencesCurrent >= 3) {
      risk += Math.min(15, e.absencesCurrent * 3);
      reasons.push(`${e.absencesCurrent} absent day(s) this month.`);
      drivers.push("absenteeism");
    }
    // Performance decline (up to 20).
    if (e.performanceTrend != null && e.performanceTrend < 0) {
      risk += Math.min(20, Math.abs(e.performanceTrend));
      reasons.push(`Performance fell ${Math.abs(e.performanceTrend)} point(s).`);
      drivers.push("performance_decline");
    }
    // Tenure stage: early (<12m) and long-plateau (>48m) both carry mild risk.
    if (e.tenureMonths != null) {
      if (e.tenureMonths < 12) { risk += 10; reasons.push(`Early tenure (${e.tenureMonths}m) — higher first-year attrition.`); drivers.push("early_tenure"); }
      else if (e.tenureMonths > 48 && (e.performanceTrend ?? 0) <= 0) { risk += 8; reasons.push(`Long tenure (${e.tenureMonths}m) without recent growth.`); drivers.push("plateau"); }
    }
    // High leave consumption (up to 10).
    if (e.leaveDaysYtd >= 15) { risk += Math.min(10, (e.leaveDaysYtd - 15) * 0.5 + 5); reasons.push(`High leave usage (${e.leaveDaysYtd} days YTD).`); drivers.push("high_leave"); }

    const riskScore = score100(risk);
    const category = band(riskScore, 30, 60); // low / medium / high
    if (category === "low" && reasons.length === 0) continue; // nothing notable

    const interventions: string[] =
      category === "high" ? ["Hold a 1:1 retention conversation", "Review compensation and growth path", "Address workload/attendance drivers"]
      : category === "medium" ? ["Manager check-in", "Clarify development opportunities"]
      : ["Routine monitoring"];

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation: category === "high" ? "High attrition risk" : category === "medium" ? "Moderate attrition risk" : "Low attrition risk",
      score: riskScore,
      category,
      confidence: riskConfidence(e),
      reasons: reasons.length ? reasons : ["No strong risk signals detected."],
      supportingData: {
        riskScore,
        drivers: drivers.join(", ") || "none",
        attendanceRatePct: e.attendanceRatePct,
        attendanceTrendPct: e.attendanceTrendPct,
        performanceTrend: e.performanceTrend,
        tenureMonths: e.tenureMonths,
        leaveDaysYtd: e.leaveDaysYtd,
        department: e.department,
      },
      businessImpact: category === "high" ? "Losing this person risks knowledge loss and rehiring cost." : null,
      risks: e.attendanceTrendPct == null || e.performanceScore == null ? ["Some signals missing; risk may be under/over-stated."] : [],
      alternatives: interventions,
    });
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const anomalies: Anomaly[] = [];
  const high = decisions.filter((d) => d.category === "high").length;
  if (high >= 5) anomalies.push({ code: "many_high_risk", severity: "critical", message: `${high} employees at high attrition risk.`, value: high });
  else if (high > 0) anomalies.push({ code: "high_risk", severity: "warning", message: `${high} employee(s) at high attrition risk.`, value: high });

  return {
    engine: "attrition",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length, note: "Low-risk employees with no notable signals are omitted." },
  };
}

export async function explainAttrition(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("attrition_risk", buildAttritionPrompt(), compact(facts), "explain attrition risk", companyId);
}
