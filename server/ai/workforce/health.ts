// Phase 6 — Organizational Health Engine (read-only, explainable).
// Composite company + per-department health from attendance, performance and
// retention-risk signals, with the factors behind each score and priority
// actions. Deterministic scoring; LLM only phrases.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, score100, band } from "../decision/types";
import { computeAttrition } from "./attrition";
import { buildOrgHealthPrompt } from "./prompts";
import { explainDecisions, compact, round1 } from "./shared";

function avg(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

// Health = attendance 35%, performance 40%, retention 25%. Missing dimensions
// are dropped and the remaining weights renormalized, so the score never
// depends on fabricated values.
function healthScore(att: number | null, perf: number | null, retention: number | null): { score: number | null; used: number } {
  const parts: Array<[number, number]> = [];
  if (att != null) parts.push([att, 0.35]);
  if (perf != null) parts.push([perf, 0.4]);
  if (retention != null) parts.push([retention, 0.25]);
  if (!parts.length) return { score: null, used: 0 };
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  const s = parts.reduce((a, [v, w]) => a + v * (w / wsum), 0);
  return { score: score100(s), used: parts.length };
}

function retentionFor(members: EmployeeSignal[], highRiskIds: Set<string>): number | null {
  if (!members.length) return null;
  const atRisk = members.filter((m) => highRiskIds.has(m.employeeId)).length;
  return score100(100 - (atRisk / members.length) * 100);
}

export function computeOrgHealth(signals: WorkforceSignals): DecisionFacts {
  const attrition = computeAttrition(signals);
  const highRiskIds = new Set(
    attrition.decisions.filter((d) => d.category === "high").map((d) => String(d.subjectId)),
  );

  const decisions: Decision[] = [];

  for (const dept of signals.departments) {
    const members = signals.employees.filter((e) => e.department === dept.department);
    const att = dept.avgAttendanceRatePct;
    const perf = dept.avgPerformance;
    const retention = retentionFor(members, highRiskIds);
    const { score, used } = healthScore(att, perf, retention);
    if (score == null) continue;
    const category = band(score, 50, 75); // low / medium / high

    const reasons: string[] = [];
    if (att != null) reasons.push(`Avg attendance ${att}%.`);
    if (perf != null) reasons.push(`Avg performance ${perf}/100.`);
    if (retention != null) reasons.push(`Retention index ${retention}/100.`);

    const actions: string[] = [];
    if (att != null && att < 80) actions.push("Investigate attendance drivers in this team");
    if (perf != null && perf < 60) actions.push("Performance support / capability building");
    if (retention != null && retention < 70) actions.push("Targeted retention plan for at-risk members");

    decisions.push({
      subject: dept.department,
      subjectId: null,
      recommendation: category === "high" ? "Healthy" : category === "medium" ? "Watch" : "At risk",
      score,
      category,
      confidence: confidenceFrom(used / 3),
      reasons,
      supportingData: {
        healthScore: score,
        avgAttendanceRatePct: att,
        avgPerformance: perf,
        retentionIndex: retention,
        headcount: dept.headcount,
        monthlyCost: dept.totalGrossMonthly,
      },
      businessImpact: category === "low" ? "This team is a priority for leadership attention." : null,
      risks: used < 3 ? ["Some health dimensions missing for this team."] : [],
      alternatives: actions.length ? actions : ["Maintain current practices"],
    });
  }
  decisions.sort((a, b) => (a.score ?? 0) - (b.score ?? 0)); // weakest first

  // Company-level overall health as the headline decision.
  const compAtt = avg(signals.employees.filter((e) => e.attendanceRatePct != null).map((e) => e.attendanceRatePct!));
  const compPerf = avg(signals.employees.filter((e) => e.performanceScore != null).map((e) => e.performanceScore!));
  const compRetention = retentionFor(signals.employees, highRiskIds);
  const company = healthScore(compAtt, compPerf, compRetention);
  const anomalies: Anomaly[] = [];
  if (company.score != null) {
    const cat = band(company.score, 50, 75);
    decisions.unshift({
      subject: "Company (overall)",
      subjectId: null,
      recommendation: `Overall organizational health: ${company.score}/100 (${cat})`,
      score: company.score,
      category: cat,
      confidence: confidenceFrom(company.used / 3),
      reasons: [
        ...(compAtt != null ? [`Company attendance ${compAtt}%.`] : []),
        ...(compPerf != null ? [`Company performance ${compPerf}/100.`] : []),
        ...(compRetention != null ? [`Retention index ${compRetention}/100.`] : []),
        `${highRiskIds.size} employee(s) at high attrition risk.`,
      ],
      supportingData: {
        overallHealth: company.score,
        avgAttendanceRatePct: compAtt,
        avgPerformance: compPerf,
        retentionIndex: compRetention,
        highRiskCount: highRiskIds.size,
        headcount: signals.headcount,
      },
      businessImpact: cat === "low" ? "Organizational health needs immediate leadership focus." : null,
      risks: company.used < 3 ? ["Some health dimensions missing company-wide."] : [],
      alternatives: ["Review weakest departments first", "Track health monthly"],
    });
    if (cat === "low") anomalies.push({ code: "low_org_health", severity: "critical", message: `Overall organizational health is ${company.score}/100.`, value: company.score });
  } else {
    anomalies.push({ code: "no_health_data", severity: "info", message: "Not enough attendance/performance data to compute health." });
  }

  return {
    engine: "org_health",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainOrgHealth(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("org_health", buildOrgHealthPrompt(), compact(facts), "explain organizational health", companyId);
}
