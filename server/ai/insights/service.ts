// Phase 4 — Manager insights & executive summaries (read-only).
//
// These compose the deterministic attendance/leave/payroll facts into a single
// briefing. Manager insights are team-scoped (allowedEmployeeIds); executive
// summaries are company-wide and add a payroll roll-up. As everywhere in Phase
// 4, the LLM only phrases pre-computed facts — it never produces a figure.

import { payrollService } from "../../services";
import { computeAttendanceFacts, type AttendanceFacts } from "../attendance/service";
import { computeLeaveFacts, type LeaveFacts } from "../leave/service";
import { buildManagerInsightPrompt, buildExecutiveSummaryPrompt } from "../analytics/prompts";
import { explainFacts } from "../analytics/narrative";
import type { AiResult, AiNarrative, Anomaly } from "../analytics/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function num(value: any): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface InsightScope {
  companyId: string;
  allowedEmployeeIds?: Set<string> | null;
  month: number; // 1–12
  year: number;
}

function compactAttendance(a: AttendanceFacts) {
  return {
    period: a.period,
    headcount: a.headcount,
    totals: a.totals,
    attendanceRatePct: a.attendanceRatePct,
    topAbsence: a.perEmployee.filter((e) => e.absent > 0).slice(0, 8),
    anomalies: a.anomalies,
  };
}

function compactLeave(l: LeaveFacts) {
  return {
    period: l.period,
    headcount: l.headcount,
    totals: l.totals,
    byType: l.byType,
    topConsumers: l.topConsumers.slice(0, 8),
    anomalies: l.anomalies,
  };
}

// ── Manager insights (team-scoped) ───────────────────────────────────────────
export interface ManagerInsightFacts {
  period: { month: number; year: number; label: string };
  attendance: ReturnType<typeof compactAttendance>;
  leave: ReturnType<typeof compactLeave>;
  anomalies: Anomaly[];
}

export async function computeManagerInsights(scope: InsightScope): Promise<ManagerInsightFacts> {
  const [attendance, leave] = await Promise.all([
    computeAttendanceFacts({ companyId: scope.companyId, allowedEmployeeIds: scope.allowedEmployeeIds, month: scope.month, year: scope.year }),
    computeLeaveFacts({ companyId: scope.companyId, allowedEmployeeIds: scope.allowedEmployeeIds, year: scope.year }),
  ]);
  const anomalies = [...attendance.anomalies, ...leave.anomalies];
  return {
    period: { month: scope.month, year: scope.year, label: attendance.period.label },
    attendance: compactAttendance(attendance),
    leave: compactLeave(leave),
    anomalies,
  };
}

export async function explainManagerInsights(facts: ManagerInsightFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainFacts({
    feature: "manager_insight",
    system: buildManagerInsightPrompt(),
    facts,
    action: "brief the team",
    companyId,
  });
}

// ── Executive summary (company-wide, adds payroll roll-up) ────────────────────
export interface PayrollRollup {
  month: string;
  year: number;
  payslips: number;
  draft: number;
  processed: number;
  paid: number;
  totalEarnings: number;
  totalDeductions: number;
  totalNet: number;
}

export interface ExecutiveSummaryFacts {
  period: { month: number; year: number; label: string };
  attendance: ReturnType<typeof compactAttendance>;
  leave: ReturnType<typeof compactLeave>;
  payroll: PayrollRollup;
  anomalies: Anomaly[];
}

async function computePayrollRollup(companyId: string, month: number, year: number): Promise<PayrollRollup> {
  const monthName = MONTH_NAMES[month - 1];
  const records = (await payrollService.getPayrollByMonth(companyId, monthName, year)) as any[];
  const rollup: PayrollRollup = {
    month: monthName, year, payslips: records.length, draft: 0, processed: 0, paid: 0,
    totalEarnings: 0, totalDeductions: 0, totalNet: 0,
  };
  for (const r of records) {
    const status = String(r.status || "").toLowerCase();
    if (status === "paid") rollup.paid += 1;
    else if (status === "processed") rollup.processed += 1;
    else rollup.draft += 1;
    rollup.totalEarnings += num(r.totalEarnings);
    rollup.totalDeductions += num(r.totalDeductions);
    rollup.totalNet += num(r.netSalary);
  }
  rollup.totalEarnings = round2(rollup.totalEarnings);
  rollup.totalDeductions = round2(rollup.totalDeductions);
  rollup.totalNet = round2(rollup.totalNet);
  return rollup;
}

function execAnomalies(payroll: PayrollRollup, base: Anomaly[]): Anomaly[] {
  const out = [...base];
  if (payroll.draft > 0 && payroll.payslips > 0) {
    out.push({ code: "payroll_in_draft", severity: payroll.draft === payroll.payslips ? "warning" : "info", message: `${payroll.draft} of ${payroll.payslips} payslip(s) still in draft for ${payroll.month} ${payroll.year}.`, value: payroll.draft });
  }
  return out;
}

export async function computeExecutiveSummary(scope: InsightScope): Promise<ExecutiveSummaryFacts> {
  const [attendance, leave, payroll] = await Promise.all([
    computeAttendanceFacts({ companyId: scope.companyId, month: scope.month, year: scope.year }),
    computeLeaveFacts({ companyId: scope.companyId, year: scope.year }),
    computePayrollRollup(scope.companyId, scope.month, scope.year),
  ]);
  const anomalies = execAnomalies(payroll, [...attendance.anomalies, ...leave.anomalies]);
  return {
    period: { month: scope.month, year: scope.year, label: attendance.period.label },
    attendance: compactAttendance(attendance),
    leave: compactLeave(leave),
    payroll,
    anomalies,
  };
}

export async function explainExecutiveSummary(facts: ExecutiveSummaryFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainFacts({
    feature: "executive_summary",
    system: buildExecutiveSummaryPrompt(),
    facts,
    action: "summarize for leadership",
    companyId,
  });
}
