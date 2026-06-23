// Phase 6 — Workforce signal aggregator (the deterministic backbone for every
// decision engine). It computes per-employee and per-department signals ONCE
// from live, company-isolated data and hands them to the engines so we never
// duplicate query logic or re-derive metrics inconsistently.
//
// Every value here is computed from stored records (employees, attendance,
// leave, KRA/KPI scores). Nothing is AI-generated — the engines turn these
// signals into explainable Decisions, and the LLM only phrases them.

import { employeeService, kraService, leaveService } from "../../services";
import { computeAttendanceFacts, type AttendancePerEmployee } from "../attendance/service";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface WorkforceScope {
  companyId: string;
  // Manager/limited-role team restriction (null = whole company).
  allowedEmployeeIds?: Set<string> | null;
  month: number; // 1–12 (current month for attendance trend)
  year: number;
}

export interface EmployeeSignal {
  employeeId: string;
  name: string;
  department: string;
  designation: string | null;
  status: string;
  isManager: boolean;
  hasManager: boolean;
  // Tenure in whole months from date of joining (null if unparseable).
  tenureMonths: number | null;
  grossSalary: number | null;
  // Attendance (current month) and previous-month comparison for trend.
  attendanceRatePct: number | null;
  attendanceRatePrevPct: number | null;
  attendanceTrendPct: number | null; // current - previous
  absencesCurrent: number;
  lateCurrent: number;
  otHoursCurrent: number;
  // Leave (year to date).
  leaveDaysYtd: number;
  leavePending: number;
  // Performance from latest KRA/appraisal review (0–100), plus prior for trend.
  performanceScore: number | null;
  performancePrevScore: number | null;
  performanceTrend: number | null; // latest - prior
  reviewsCount: number;
}

export interface DepartmentSignal {
  department: string;
  headcount: number;
  avgPerformance: number | null;
  avgAttendanceRatePct: number | null;
  totalGrossMonthly: number;
  withPerformance: number;
}

export interface SignalCoverage {
  employees: number;
  withPerformance: number;
  withAttendance: number;
  withSalary: number;
  withTenure: number;
}

export interface WorkforceSignals {
  period: { month: number; year: number; label: string };
  headcount: number;
  employees: EmployeeSignal[];
  departments: DepartmentSignal[];
  coverage: SignalCoverage;
}

function num(value: any): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isActive(e: any): boolean {
  const s = String(e.status ?? "active").toLowerCase();
  return s === "active";
}

function fullName(e: any): string {
  return `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee";
}

// Whole months between a YYYY-MM-DD join date and the period end. Returns null
// if the date is missing/unparseable so callers can mark coverage gaps.
function tenureMonths(doj: any, year: number, month: number): number | null {
  const s = String(doj || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  if (!Number.isFinite(jy) || !Number.isFinite(jm)) return null;
  const months = (year - jy) * 12 + (month - jm);
  return months >= 0 ? months : 0;
}

// Per-employee attendance rate from the month's tallies (present + half-credit
// over working-expectation records). Mirrors the company rate formula.
function perEmployeeRate(pe: AttendancePerEmployee | undefined): number | null {
  if (!pe) return null;
  const working = pe.present + pe.absent + pe.halfDay + pe.onLeave;
  if (working <= 0) return null;
  return round1(((pe.present + pe.halfDay * 0.5) / working) * 100);
}

function prevMonth(month: number, year: number): { month: number; year: number } {
  return month <= 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export async function computeWorkforceSignals(scope: WorkforceScope): Promise<WorkforceSignals> {
  const { companyId, allowedEmployeeIds, month, year } = scope;
  const pm = prevMonth(month, year);

  const [allEmployees, attendanceCur, attendancePrev, kraAssignments, leaveRequests] = await Promise.all([
    employeeService.getEmployeesByCompany(companyId) as Promise<any[]>,
    computeAttendanceFacts({ companyId, allowedEmployeeIds, month, year }),
    computeAttendanceFacts({ companyId, allowedEmployeeIds, month: pm.month, year: pm.year }),
    kraService.getKraAssignmentsByCompany(companyId) as Promise<any[]>,
    leaveService.getLeaveRequestsByCompany(companyId) as Promise<any[]>,
  ]);

  const scoped = allowedEmployeeIds ? allEmployees.filter((e) => allowedEmployeeIds.has(e.id)) : allEmployees;
  const active = scoped.filter(isActive);
  const activeIds = new Set(active.map((e) => e.id));
  const managerIds = new Set(active.map((e) => e.reportingManager).filter(Boolean));

  // Attendance maps (current + previous month) keyed by employeeId.
  const curRate = new Map<string, AttendancePerEmployee>();
  for (const pe of attendanceCur.perEmployee) curRate.set(pe.employeeId, pe);
  const prevRate = new Map<string, number | null>();
  for (const pe of attendancePrev.perEmployee) prevRate.set(pe.employeeId, perEmployeeRate(pe));

  // Latest + prior performance score per employee from KRA reviews. Only
  // reviews with a recorded totalScore count; ordered by year then end date.
  const perfByEmp = new Map<string, number[]>();
  const reviewsByEmp = new Map<string, number>();
  const sortedKra = [...kraAssignments]
    .filter((k) => activeIds.has(k.employeeId) && k.totalScore != null)
    .sort((a, b) => (num(b.periodYear) - num(a.periodYear)) || String(b.endDate || "").localeCompare(String(a.endDate || "")));
  for (const k of sortedKra) {
    const arr = perfByEmp.get(k.employeeId) || [];
    arr.push(num(k.totalScore));
    perfByEmp.set(k.employeeId, arr);
    reviewsByEmp.set(k.employeeId, (reviewsByEmp.get(k.employeeId) || 0) + 1);
  }

  // Leave YTD (approved days) + pending count per employee for the year.
  const yearStr = String(year);
  const leaveDays = new Map<string, number>();
  const leavePend = new Map<string, number>();
  for (const r of leaveRequests) {
    if (!activeIds.has(r.employeeId)) continue;
    if (String(r.startDate || "").slice(0, 4) !== yearStr) continue;
    const status = String(r.status || "").toLowerCase();
    if (status === "approved") leaveDays.set(r.employeeId, (leaveDays.get(r.employeeId) || 0) + num(r.days));
    else if (status === "pending") leavePend.set(r.employeeId, (leavePend.get(r.employeeId) || 0) + 1);
  }

  const employees: EmployeeSignal[] = active.map((e) => {
    const pe = curRate.get(e.id);
    const rate = perEmployeeRate(pe);
    const prev = prevRate.has(e.id) ? prevRate.get(e.id)! : null;
    const perf = perfByEmp.get(e.id) || [];
    const performanceScore = perf.length ? round1(perf[0]) : null;
    const performancePrevScore = perf.length > 1 ? round1(perf[1]) : null;
    return {
      employeeId: e.id,
      name: fullName(e),
      department: e.department || "Unassigned",
      designation: e.designation || null,
      status: String(e.status ?? "active"),
      isManager: managerIds.has(e.id),
      hasManager: !!e.reportingManager,
      tenureMonths: tenureMonths(e.dateOfJoining, year, month),
      grossSalary: e.grossSalary != null ? num(e.grossSalary) : null,
      attendanceRatePct: rate,
      attendanceRatePrevPct: prev,
      attendanceTrendPct: rate != null && prev != null ? round1(rate - prev) : null,
      absencesCurrent: pe?.absent ?? 0,
      lateCurrent: pe?.late ?? 0,
      otHoursCurrent: pe?.otHours ?? 0,
      leaveDaysYtd: round1(leaveDays.get(e.id) || 0),
      leavePending: leavePend.get(e.id) || 0,
      performanceScore,
      performancePrevScore,
      performanceTrend: performanceScore != null && performancePrevScore != null ? round1(performanceScore - performancePrevScore) : null,
      reviewsCount: reviewsByEmp.get(e.id) || 0,
    };
  });

  // Department rollups.
  const deptMap = new Map<string, EmployeeSignal[]>();
  for (const s of employees) {
    const arr = deptMap.get(s.department) || [];
    arr.push(s);
    deptMap.set(s.department, arr);
  }
  const departments: DepartmentSignal[] = Array.from(deptMap.entries()).map(([department, members]) => {
    const perf = members.filter((m) => m.performanceScore != null).map((m) => m.performanceScore!);
    const att = members.filter((m) => m.attendanceRatePct != null).map((m) => m.attendanceRatePct!);
    const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      department,
      headcount: members.length,
      avgPerformance: avg(perf),
      avgAttendanceRatePct: avg(att),
      totalGrossMonthly: members.reduce((a, m) => a + (m.grossSalary || 0), 0),
      withPerformance: perf.length,
    };
  }).sort((a, b) => b.headcount - a.headcount);

  const coverage: SignalCoverage = {
    employees: employees.length,
    withPerformance: employees.filter((e) => e.performanceScore != null).length,
    withAttendance: employees.filter((e) => e.attendanceRatePct != null).length,
    withSalary: employees.filter((e) => e.grossSalary != null).length,
    withTenure: employees.filter((e) => e.tenureMonths != null).length,
  };

  return {
    period: { month, year, label: `${MONTH_NAMES[month - 1]} ${year}` },
    headcount: employees.length,
    employees,
    departments,
    coverage,
  };
}
