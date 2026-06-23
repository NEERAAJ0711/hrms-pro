// Phase 6 — Internal Mobility Engine (read-only, explainable).
// Matches current employees to OPEN internal job postings using deterministic
// signals (department/role affinity, performance, tenure readiness) plus a
// keyword overlap between the posting requirements and the employee's role.
// Suggests candidates for a human recruiter to consider — never auto-applies.

import { recruitmentService } from "../../services";
import type { WorkforceSignals, EmployeeSignal } from "./signals";
import type { Decision, DecisionFacts, Anomaly, AiResult, AiNarrative } from "../decision/types";
import { confidenceFrom, completenessOf, score100, band } from "../decision/types";
import { buildMobilityPrompt } from "./prompts";
import { explainDecisions, compact } from "./shared";

const OPEN_STATUSES = new Set(["active", "published", "open", "posted"]);

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    String(s || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  Array.from(a).forEach((w) => { if (b.has(w)) n++; });
  return n;
}

export async function computeMobility(signals: WorkforceSignals, companyId: string): Promise<DecisionFacts> {
  const postings = ((await recruitmentService.getJobPostingsByCompany(companyId)) as any[])
    .filter((p) => OPEN_STATUSES.has(String(p.status || "").toLowerCase()));

  const decisions: Decision[] = [];
  const anomalies: Anomaly[] = [];

  if (!postings.length) {
    anomalies.push({ code: "no_open_roles", severity: "info", message: "No open internal job postings to match against." });
    return {
      engine: "mobility",
      period: signals.period,
      scope: "company",
      decisions,
      anomalies,
      coverage: { employees: signals.coverage.employees, analyzed: 0 },
    };
  }

  for (const p of postings) {
    const reqTokens = tokens(`${p.title} ${p.requirements || ""} ${p.description || ""}`);
    const ranked: Array<{ e: EmployeeSignal; fit: number; reasons: string[]; gaps: string[] }> = [];

    for (const e of signals.employees) {
      // Don't suggest a move into the same role/department a person already holds.
      const sameRole = (e.designation || "").toLowerCase() === String(p.title || "").toLowerCase();
      if (sameRole) continue;

      const deptMatch = p.department && e.department && p.department.toLowerCase() === e.department.toLowerCase();
      const roleTokens = tokens(`${e.designation || ""} ${e.department || ""}`);
      const kw = overlap(reqTokens, roleTokens);
      const perf = e.performanceScore ?? 0;
      const tenureReady = e.tenureMonths != null && e.tenureMonths >= 12 ? 1 : 0;

      // Fit = role/keyword affinity 40%, performance 40%, tenure readiness 20%.
      const affinity = Math.min(1, (deptMatch ? 0.6 : 0) + Math.min(0.4, kw * 0.1));
      const fit = score100(affinity * 100 * 0.4 + perf * 0.4 + tenureReady * 100 * 0.2);
      if (fit < 45) continue;

      const reasons: string[] = [];
      if (deptMatch) reasons.push(`Already in the ${e.department} department.`);
      if (kw > 0) reasons.push(`${kw} requirement keyword(s) match their role.`);
      if (e.performanceScore != null) reasons.push(`Performance ${e.performanceScore}/100.`);
      if (e.tenureMonths != null) reasons.push(`${e.tenureMonths} month(s) tenure.`);

      const gaps: string[] = [];
      if (!deptMatch) gaps.push("Cross-department move — onboarding to new function needed.");
      if (kw === 0) gaps.push("No explicit requirement keyword overlap on record.");
      if (e.tenureMonths != null && e.tenureMonths < 12) gaps.push(`Short tenure (${e.tenureMonths}m).`);

      ranked.push({ e, fit, reasons, gaps });
    }

    ranked.sort((a, b) => b.fit - a.fit);
    for (const r of ranked.slice(0, 3)) {
      const category = band(r.fit, 55, 75);
      decisions.push({
        subject: `${r.e.name} → ${p.title}`,
        subjectId: r.e.employeeId,
        recommendation: category === "high" ? "Strong internal fit" : category === "medium" ? "Possible internal fit" : "Stretch internal fit",
        score: r.fit,
        category,
        confidence: confidenceFrom(completenessOf([r.e.performanceScore != null, r.e.tenureMonths != null, !!p.requirements, !!p.department])),
        reasons: r.reasons,
        supportingData: {
          fitScore: r.fit,
          role: p.title,
          targetDepartment: p.department,
          employeeDepartment: r.e.department,
          employeeRole: r.e.designation,
          performanceScore: r.e.performanceScore,
          tenureMonths: r.e.tenureMonths,
        },
        businessImpact: "Filling internally is faster and cheaper than external hiring and aids retention.",
        risks: r.e.performanceScore == null ? ["No performance review on record for this candidate."] : [],
        alternatives: r.gaps.length ? r.gaps : ["Discuss the move in a career conversation"],
      });
    }
  }
  decisions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (!decisions.length) anomalies.push({ code: "no_internal_fit", severity: "info", message: "No strong internal candidates matched the open roles." });

  return {
    engine: "mobility",
    period: signals.period,
    scope: "company",
    decisions,
    anomalies,
    coverage: { employees: signals.coverage.employees, analyzed: decisions.length, note: `${postings.length} open role(s) considered.` },
  };
}

export async function explainMobility(facts: DecisionFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainDecisions("internal_mobility", buildMobilityPrompt(), compact(facts), "explain internal mobility matches", companyId);
}
