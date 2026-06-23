// Phase 4 — Leave intelligence (read-only).
//
// computeLeaveFacts() derives a deterministic year summary: requests by status,
// per-type consumption vs. entitlement, balances, pending approvals, and (for
// company scope) the heaviest consumers — all from live data, company-isolated
// and optionally team/employee-scoped. explainLeave() phrases it in plain words.

import { leaveService, employeeService } from "../../services";
import { buildLeaveInsightPrompt } from "../analytics/prompts";
import { explainFacts } from "../analytics/narrative";
import type { AiResult, AiNarrative, Anomaly } from "../analytics/types";

export interface LeaveScope {
  companyId: string;
  employeeId?: string | null;
  allowedEmployeeIds?: Set<string> | null;
  year: number;
}

export interface LeaveTypeFact {
  code: string;
  name: string;
  entitlement: number | null;
  taken: number;
  pending: number;
  balance: number | null;
}

export interface LeaveConsumer {
  employeeId: string;
  name: string;
  daysTaken: number;
}

export interface LeaveFacts {
  scope: "employee" | "company";
  period: { year: number };
  headcount: number | null;
  totals: {
    requests: number;
    approved: number;
    pending: number;
    rejected: number;
    cancelled: number;
    daysApproved: number;
    daysPending: number;
  };
  byType: LeaveTypeFact[];
  topConsumers: LeaveConsumer[];
  anomalies: Anomaly[];
}

function num(value: any): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function yearOf(dateStr: any): string {
  return String(dateStr || "").slice(0, 4);
}

function emptyTotals() {
  return { requests: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0, daysApproved: 0, daysPending: 0 };
}

function tally(totals: ReturnType<typeof emptyTotals>, r: any): void {
  totals.requests += 1;
  const status = String(r.status || "").toLowerCase();
  const days = num(r.days);
  if (status === "approved") {
    totals.approved += 1;
    totals.daysApproved += days;
  } else if (status === "pending") {
    totals.pending += 1;
    totals.daysPending += days;
  } else if (status === "rejected") {
    totals.rejected += 1;
  } else if (status === "cancelled") {
    totals.cancelled += 1;
  }
}

function employeeAnomalies(facts: LeaveFacts): Anomaly[] {
  const out: Anomaly[] = [];
  if (facts.totals.requests === 0) {
    out.push({ code: "no_leave", severity: "info", message: "No leave requests recorded for this year." });
    return out;
  }
  if (facts.totals.pending >= 3) out.push({ code: "many_pending", severity: "warning", message: `${facts.totals.pending} leave request(s) awaiting approval.`, value: facts.totals.pending });
  for (const t of facts.byType) {
    if (t.entitlement != null && t.balance != null && t.entitlement > 0) {
      if (t.balance <= 0) out.push({ code: "exhausted_balance", severity: "warning", message: `${t.name} balance is exhausted (taken ${round1(t.taken)} of ${t.entitlement}).`, value: t.balance });
      else if (t.balance <= 1) out.push({ code: "low_balance", severity: "info", message: `${t.name} balance is low (${round1(t.balance)} day(s) left).`, value: round1(t.balance) });
    }
  }
  return out;
}

function companyAnomalies(facts: LeaveFacts): Anomaly[] {
  const out: Anomaly[] = [];
  if (facts.totals.requests === 0) {
    out.push({ code: "no_leave", severity: "info", message: "No leave requests recorded for this year." });
    return out;
  }
  if (facts.totals.pending >= 10) out.push({ code: "high_pending", severity: "critical", message: `${facts.totals.pending} leave requests are pending approval.`, value: facts.totals.pending });
  else if (facts.totals.pending >= 5) out.push({ code: "elevated_pending", severity: "warning", message: `${facts.totals.pending} leave requests are pending approval.`, value: facts.totals.pending });
  return out;
}

export async function computeLeaveFacts(scope: LeaveScope): Promise<LeaveFacts> {
  const yearStr = String(scope.year);
  const leaveTypes = (await leaveService.getLeaveTypesByCompany(scope.companyId)) as any[];
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]));

  if (scope.employeeId) {
    const requests = ((await leaveService.getLeaveRequestsByEmployee(scope.employeeId)) as any[])
      .filter((r) => yearOf(r.startDate) === yearStr);
    const totals = emptyTotals();
    const perType = new Map<string, { taken: number; pending: number }>();
    for (const r of requests) {
      tally(totals, r);
      const t = typeById.get(r.leaveTypeId);
      const code = t?.code || r.leaveTypeId;
      let pt = perType.get(code);
      if (!pt) { pt = { taken: 0, pending: 0 }; perType.set(code, pt); }
      const status = String(r.status || "").toLowerCase();
      if (status === "approved") pt.taken += num(r.days);
      else if (status === "pending") pt.pending += num(r.days);
    }
    const byType: LeaveTypeFact[] = leaveTypes.map((t) => {
      const pt = perType.get(t.code) || { taken: 0, pending: 0 };
      const entitlement = t.daysPerYear != null ? num(t.daysPerYear) : null;
      return {
        code: t.code,
        name: t.name,
        entitlement,
        taken: round1(pt.taken),
        pending: round1(pt.pending),
        balance: entitlement != null ? round1(entitlement - pt.taken) : null,
      };
    });
    const facts: LeaveFacts = {
      scope: "employee",
      period: { year: scope.year },
      headcount: null,
      totals: { ...totals, daysApproved: round1(totals.daysApproved), daysPending: round1(totals.daysPending) },
      byType,
      topConsumers: [],
      anomalies: [],
    };
    facts.anomalies = employeeAnomalies(facts);
    return facts;
  }

  // Company scope.
  let requests = ((await leaveService.getLeaveRequestsByCompany(scope.companyId)) as any[])
    .filter((r) => yearOf(r.startDate) === yearStr);
  if (scope.allowedEmployeeIds) requests = requests.filter((r) => scope.allowedEmployeeIds!.has(r.employeeId));

  const employees = (await employeeService.getEmployeesByCompany(scope.companyId)) as any[];
  const scopedEmployees = scope.allowedEmployeeIds ? employees.filter((e) => scope.allowedEmployeeIds!.has(e.id)) : employees;
  const nameById = new Map(employees.map((e) => [e.id, `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee"]));

  const totals = emptyTotals();
  const perTypeAgg = new Map<string, { name: string; taken: number; pending: number }>();
  const perEmp = new Map<string, number>();
  for (const r of requests) {
    tally(totals, r);
    const t = typeById.get(r.leaveTypeId);
    const code = t?.code || r.leaveTypeId;
    let pa = perTypeAgg.get(code);
    if (!pa) { pa = { name: t?.name || code, taken: 0, pending: 0 }; perTypeAgg.set(code, pa); }
    const status = String(r.status || "").toLowerCase();
    if (status === "approved") {
      pa.taken += num(r.days);
      perEmp.set(r.employeeId, (perEmp.get(r.employeeId) || 0) + num(r.days));
    } else if (status === "pending") {
      pa.pending += num(r.days);
    }
  }

  const byType: LeaveTypeFact[] = Array.from(perTypeAgg.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    entitlement: null,
    taken: round1(v.taken),
    pending: round1(v.pending),
    balance: null,
  }));
  const topConsumers: LeaveConsumer[] = Array.from(perEmp.entries())
    .map(([employeeId, daysTaken]) => ({ employeeId, name: nameById.get(employeeId) || "Employee", daysTaken: round1(daysTaken) }))
    .sort((a, b) => b.daysTaken - a.daysTaken)
    .slice(0, 15);

  const facts: LeaveFacts = {
    scope: "company",
    period: { year: scope.year },
    headcount: scopedEmployees.length,
    totals: { ...totals, daysApproved: round1(totals.daysApproved), daysPending: round1(totals.daysPending) },
    byType,
    topConsumers,
    anomalies: [],
  };
  facts.anomalies = companyAnomalies(facts);
  return facts;
}

export async function explainLeave(facts: LeaveFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainFacts({
    feature: "leave_insight",
    system: buildLeaveInsightPrompt(),
    facts,
    action: "explain leave",
    companyId,
  });
}
