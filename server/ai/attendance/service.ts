// Phase 4 — Attendance intelligence (read-only).
//
// computeAttendanceFacts() derives a deterministic month summary + anomalies
// straight from live attendance records (company-isolated, optionally team- or
// employee-scoped). explainAttendance() then asks the LLM to phrase those facts
// in plain language. The AI never sees raw PII beyond names and never produces a
// number — every figure here is computed, so there is nothing to hallucinate.

import { attendanceService, employeeService } from "../../services";
import { buildAttendanceInsightPrompt } from "../analytics/prompts";
import { explainFacts } from "../analytics/narrative";
import type { AiResult, AiNarrative, Anomaly } from "../analytics/types";

export interface AttendanceScope {
  companyId: string;
  // When set, scope is a single employee; otherwise the whole company.
  employeeId?: string | null;
  // Manager/limited-role team restriction for company scope (null = all).
  allowedEmployeeIds?: Set<string> | null;
  month: number; // 1–12
  year: number;
}

export interface AttendanceTotals {
  records: number;
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  holiday: number;
  weekend: number;
  late: number;
  totalOtHours: number;
  totalWorkHours: number;
}

export interface AttendancePerEmployee {
  employeeId: string;
  name: string;
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  late: number;
  otHours: number;
}

export interface AttendanceFacts {
  scope: "employee" | "company";
  period: { month: number; year: number; label: string; from: string; to: string };
  headcount: number | null;
  totals: AttendanceTotals;
  attendanceRatePct: number | null;
  perEmployee: AttendancePerEmployee[];
  anomalies: Anomaly[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthWindow(month: number, year: number): { from: string; to: string; label: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

function num(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function statusOf(r: any): string {
  return String(r.status || "").toLowerCase();
}

function isLate(r: any): boolean {
  const s = statusOf(r);
  if (s.includes("late")) return true;
  const notes = String(r.notes || "").toLowerCase();
  return notes.includes("late");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyTotals(): AttendanceTotals {
  return {
    records: 0, present: 0, absent: 0, halfDay: 0, onLeave: 0, holiday: 0,
    weekend: 0, late: 0, totalOtHours: 0, totalWorkHours: 0,
  };
}

function tally(totals: AttendanceTotals, r: any): void {
  totals.records += 1;
  const s = statusOf(r);
  if (s === "present" || s.includes("present")) totals.present += 1;
  else if (s.includes("half")) totals.halfDay += 1;
  else if (s.includes("leave")) totals.onLeave += 1;
  else if (s === "holiday") totals.holiday += 1;
  else if (s === "weekend") totals.weekend += 1;
  else if (s === "absent") totals.absent += 1;
  if (isLate(r)) totals.late += 1;
  totals.totalOtHours += num(r.otHours);
  totals.totalWorkHours += num(r.workHours);
}

// ── Deterministic anomaly detection ──────────────────────────────────────────
function employeeAnomalies(t: AttendanceTotals): Anomaly[] {
  const out: Anomaly[] = [];
  if (t.records === 0) {
    out.push({ code: "no_records", severity: "info", message: "No attendance was recorded for this period." });
    return out;
  }
  if (t.absent >= 5) out.push({ code: "high_absence", severity: "critical", message: `High absenteeism: ${t.absent} absent day(s) this month.`, value: t.absent });
  else if (t.absent >= 3) out.push({ code: "elevated_absence", severity: "warning", message: `Elevated absenteeism: ${t.absent} absent day(s) this month.`, value: t.absent });
  if (t.late >= 5) out.push({ code: "frequent_late", severity: "warning", message: `Frequent late arrivals: ${t.late} time(s) this month.`, value: t.late });
  else if (t.late >= 3) out.push({ code: "some_late", severity: "info", message: `${t.late} late arrival(s) this month.`, value: t.late });
  if (t.totalOtHours >= 40) out.push({ code: "high_ot", severity: "warning", message: `High overtime: ${round1(t.totalOtHours)} OT hour(s) this month.`, value: round1(t.totalOtHours) });
  return out;
}

function companyAnomalies(facts: { totals: AttendanceTotals; attendanceRatePct: number | null; perEmployee: AttendancePerEmployee[]; headcount: number | null }): Anomaly[] {
  const out: Anomaly[] = [];
  if (facts.totals.records === 0) {
    out.push({ code: "no_records", severity: "info", message: "No attendance was recorded for this period." });
    return out;
  }
  if (facts.attendanceRatePct != null) {
    if (facts.attendanceRatePct < 50) out.push({ code: "low_attendance", severity: "critical", message: `Low overall attendance rate: ${facts.attendanceRatePct}%.`, value: facts.attendanceRatePct });
    else if (facts.attendanceRatePct < 70) out.push({ code: "below_target_attendance", severity: "warning", message: `Attendance rate below target: ${facts.attendanceRatePct}%.`, value: facts.attendanceRatePct });
  }
  const highAbsence = facts.perEmployee.filter((e) => e.absent >= 3).length;
  if (highAbsence > 0) out.push({ code: "employees_high_absence", severity: highAbsence >= 5 ? "warning" : "info", message: `${highAbsence} employee(s) with 3+ absent days this month.`, value: highAbsence });
  const highOt = facts.perEmployee.filter((e) => e.otHours >= 40).length;
  if (highOt > 0) out.push({ code: "employees_high_ot", severity: "info", message: `${highOt} employee(s) with 40+ OT hours this month.`, value: highOt });
  return out;
}

export async function computeAttendanceFacts(scope: AttendanceScope): Promise<AttendanceFacts> {
  const period = monthWindow(scope.month, scope.year);
  const inWindow = (d: any) => String(d) >= period.from && String(d) <= period.to;

  if (scope.employeeId) {
    const records = (await attendanceService.getAttendanceByEmployee(scope.employeeId)) as any[];
    const month = records.filter((r) => inWindow(r.date));
    const totals = emptyTotals();
    for (const r of month) tally(totals, r);
    return {
      scope: "employee",
      period: { month: scope.month, year: scope.year, ...period },
      headcount: null,
      totals,
      attendanceRatePct: null,
      perEmployee: [],
      anomalies: employeeAnomalies(totals),
    };
  }

  // Company scope — pull live attendance, isolate by company + period, and apply
  // the manager's team restriction when present.
  const all = (await attendanceService.getAllAttendance()) as any[];
  let month = all.filter((r) => r.companyId === scope.companyId && inWindow(r.date));
  if (scope.allowedEmployeeIds) month = month.filter((r) => scope.allowedEmployeeIds!.has(r.employeeId));

  const employees = (await employeeService.getEmployeesByCompany(scope.companyId)) as any[];
  const scopedEmployees = scope.allowedEmployeeIds
    ? employees.filter((e) => scope.allowedEmployeeIds!.has(e.id))
    : employees;
  const activeEmployees = scopedEmployees.filter((e) => (e.status ?? "active") === "active" || e.status === "Active");
  const nameById = new Map(employees.map((e) => [e.id, `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee"]));

  const totals = emptyTotals();
  const perMap = new Map<string, AttendancePerEmployee>();
  for (const r of month) {
    tally(totals, r);
    let pe = perMap.get(r.employeeId);
    if (!pe) {
      pe = { employeeId: r.employeeId, name: nameById.get(r.employeeId) || "Employee", present: 0, absent: 0, halfDay: 0, onLeave: 0, late: 0, otHours: 0 };
      perMap.set(r.employeeId, pe);
    }
    const s = statusOf(r);
    if (s === "present" || s.includes("present")) pe.present += 1;
    else if (s.includes("half")) pe.halfDay += 1;
    else if (s.includes("leave")) pe.onLeave += 1;
    else if (s === "absent") pe.absent += 1;
    if (isLate(r)) pe.late += 1;
    pe.otHours = round1(pe.otHours + num(r.otHours));
  }

  // Attendance rate = present-equivalent days / expected working records, using
  // present + half (0.5) over the records that represent a working expectation
  // (present + absent + half + leave). Holidays/weekends are excluded.
  const workingRecords = totals.present + totals.absent + totals.halfDay + totals.onLeave;
  const presentEquiv = totals.present + totals.halfDay * 0.5;
  const attendanceRatePct = workingRecords > 0 ? round1((presentEquiv / workingRecords) * 100) : null;

  const headcount = activeEmployees.length;
  const perEmployee = Array.from(perMap.values()).sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name));

  return {
    scope: "company",
    period: { month: scope.month, year: scope.year, ...period },
    headcount,
    totals: { ...totals, totalOtHours: round1(totals.totalOtHours), totalWorkHours: round1(totals.totalWorkHours) },
    attendanceRatePct,
    perEmployee,
    anomalies: companyAnomalies({ totals, attendanceRatePct, perEmployee, headcount }),
  };
}

export async function explainAttendance(facts: AttendanceFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  // Keep the LLM payload small: top movers only, not the full roster.
  const compact = {
    ...facts,
    perEmployee: facts.perEmployee.slice(0, 15),
  };
  return explainFacts({
    feature: "attendance_insight",
    system: buildAttendanceInsightPrompt(),
    facts: compact,
    action: "explain attendance",
    companyId,
  });
}
