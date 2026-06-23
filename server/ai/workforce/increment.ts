// Phase 6 — Increment Intelligence (read-only, explainable).
// Suggests a salary-increment band per employee from performance, attendance,
// tenure and internal pay parity (vs department-designation peer median). These
// are suggestions for human review — nothing is applied to payroll.

import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Confidence, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf } from "../decision/types";
import { buildIncrementPrompt } from "./prompts";
import { explainDecisions, compact, median, round1 } from "./shared";

function incConfidence(e: EmployeeSignal, hasPeers: boolean): Confidence {
  return confidenceFrom(completenessOf([
    e.performanceScore != null,
    e.grossSalary != null,
    e.tenureMonths != null,
    hasPeers,
  ]));
}

// Base increment band (percentages) anchored to performance.
function baseBand(perf: number): { low: number; high: number } {
  if (perf >= 85) return { low: 10, high: 15 };
  if (perf >= 70) return { low: 7, high: 10 };
  if (perf >= 50) return { low: 4, high: 7 };
  return { low: 0, high: 3 };
}

export function computeIncrement(signals: WorkforceSignals): DecisionFacts {
  // Peer median salary by department + designation for parity.
  const peerKey = (e: EmployeeSignal) => `${e.department}||${e.designation ?? ""}`;
  const peerSalaries = new Map<string, number[]>();
  for (const e of signals.employees) {
    if (e.grossSalary == null) continue;
    const k = peerKey(e);
    const arr = peerSalaries.get(k) || [];
    arr.push(e.grossSalary);
    peerSalaries.set(k, arr);
  }

  const decisions: Decision[] = [];
  for (const e of signals.employees) {
    if (e.performanceScore == null) continue;
    const perf = e.performanceScore;
    const band = baseBand(perf);
    let { low, high } = band;

    const reasons: string[] = [`Performance ${perf}/100 anchors a ${low}–${high}% band.`];
    const peers = peerSalaries.get(peerKey(e)) || [];
    const peerMedian = peers.length >= 3 ? median(peers) : null;
    let parityNote: string | null = null;

    // Pay-parity nudge: clearly-below-peers gets +2pp, clearly-above gets -2pp.
    if (peerMedian != null && e.grossSalary != null && peerMedian > 0) {
      const ratio = e.grossSalary / peerMedian;
      if (ratio < 0.9) { low += 2; high += 2; parityNote = `Paid ~${Math.round((1 - ratio) * 100)}% below peer median (₹${peerMedian.toLocaleString("en-IN")}).`; }
      else if (ratio > 1.15) { low = Math.max(0, low - 2); high = Math.max(low, high - 2); parityNote = `Paid above peer median; smaller raise suggested.`; }
      if (parityNote) reasons.push(parityNote);
    }
    if (e.attendanceRatePct != null && e.attendanceRatePct < 80) {
      high = Math.max(low, high - 1);
      reasons.push(`Attendance ${e.attendanceRatePct}% tempers the upper band.`);
    }
    if (e.tenureMonths != null && e.tenureMonths < 12) {
      reasons.push(`Under 1 year tenure (${e.tenureMonths}m) — partial-year consideration.`);
    }

    const suggestedAmountLow = e.grossSalary != null ? Math.round(e.grossSalary * low / 100) : null;
    const suggestedAmountHigh = e.grossSalary != null ? Math.round(e.grossSalary * high / 100) : null;
    const category = high >= 10 ? "high" : high >= 5 ? "medium" : "low";

    decisions.push({
      subject: e.name,
      subjectId: e.employeeId,
      recommendation: `Suggested increment ${low}–${high}%`,
      score: high,
      category,
      confidence: incConfidence(e, peerMedian != null),
      reasons,
      supportingData: {
        performanceScore: perf,
        currentGrossSalary: e.grossSalary,
        suggestedPctLow: low,
        suggestedPctHigh: high,
        suggestedAmountMonthlyLow: suggestedAmountLow,
        suggestedAmountMonthlyHigh: suggestedAmountHigh,
        peerMedianSalary: peerMedian,
        attendanceRatePct: e.attendanceRatePct,
        tenureMonths: e.tenureMonths,
      },
      businessImpact: parityNote && parityNote.includes("below") ? "Closing a pay-equity gap reduces flight risk." : null,
      risks: [
        ...(e.grossSalary == null ? ["Current salary not on record — band is percentage-only."] : []),
        ...(peerMedian == null ? ["Too few peers for a reliable parity check."] : []),
      ],
      alternatives: ["Review against budget and finalize in the appraisal cycle"],
    });
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const anomalies: Anomaly[] = [];
  if (!decisions.length) anomalies.push({ code: "no_reviews", severity: "info", message: "No performance reviews on record to base increments on." });

  return {
    engine: "increment",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length },
  };
}

export async function explainIncrement(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("increment_reco", buildIncrementPrompt(), compact(facts), "explain increment recommendations", companyId);
}
