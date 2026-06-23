// Phase 4 — Payroll intelligence (read-only).
//
// computePayrollFacts() builds a deterministic, fully-itemized breakdown of ONE
// payslip straight from the stored payroll record (earnings, statutory
// deductions, attendance impact, net pay) plus plain statutory context notes
// derived only from the figures already on the slip. explainPayroll() then asks
// the LLM to narrate it. No figure is ever AI-generated, so nothing can drift.
//
// Access control (owner vs. payroll-privileged) is enforced by the route layer;
// this service returns full figures and the caller applies masking as needed.

import { payrollService, employeeService } from "../../services";
import { buildPayrollExplainPrompt, buildPayrollInsightPrompt } from "../analytics/prompts";
import { explainFacts } from "../analytics/narrative";
import type { AiResult, AiNarrative, Anomaly } from "../analytics/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface PayrollScope {
  companyId: string;
  employeeId: string;
  month?: string | null; // text month, e.g. "January"
  year?: number | null;
}

export interface PayrollFacts {
  scope: "payslip";
  found: boolean;
  period: { month: string | null; year: number | null };
  employee: { id: string; name: string };
  earnings: {
    basic: number; hra: number; conveyance: number; medical: number; special: number;
    other: number; bonus: number; otAmount: number; total: number;
  };
  deductions: {
    pfEmployee: number; vpf: number; esi: number; professionalTax: number; lwf: number;
    tds: number; otherDeductions: number; loanDeduction: number; total: number;
  };
  attendance: { workingDays: number; presentDays: number; payDays: number; leaveDays: number; otHours: number };
  netSalary: number;
  status: string;
  statutoryNotes: string[];
  anomalies: Anomaly[];
}

function num(value: any): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function latestOf(records: any[]): any | undefined {
  if (!records.length) return undefined;
  return [...records].sort((a, b) => {
    const ga = String(a.generatedAt || "");
    const gb = String(b.generatedAt || "");
    if (ga !== gb) return gb.localeCompare(ga);
    if (num(b.year) !== num(a.year)) return num(b.year) - num(a.year);
    return String(b.month || "").localeCompare(String(a.month || ""));
  })[0];
}

function statutoryNotes(p: any): string[] {
  const notes: string[] = [];
  if (num(p.pfEmployee) > 0) notes.push("Provident Fund (PF) is deducted at 12% of basic wage, subject to the ₹15,000 wage ceiling.");
  else notes.push("No PF was deducted for this payslip.");
  if (num(p.esi) > 0) notes.push("ESIC is deducted at 0.75% of gross because the employee is within the ₹21,000 ESIC wage limit.");
  else notes.push("No ESIC was deducted (employee is outside the ₹21,000 wage limit or not enrolled).");
  if (num(p.professionalTax) > 0) notes.push(`Professional Tax of ₹${round2(num(p.professionalTax))} applies per the state slab (capped at ₹200/month).`);
  if (num(p.tds) > 0) notes.push("TDS (income tax) is withheld per the employee's tax declaration and slab.");
  if (num(p.loanDeduction) > 0) notes.push(`A loan/advance recovery of ₹${round2(num(p.loanDeduction))} was applied this month.`);
  const working = num(p.workingDays);
  const pay = num(p.payDays);
  if (working > 0 && pay > 0 && pay < working) notes.push(`Pay was prorated for ${round2(working - pay)} loss-of-pay day(s) (${pay} of ${working} working days paid).`);
  return notes;
}

function payslipAnomalies(f: PayrollFacts): Anomaly[] {
  const out: Anomaly[] = [];
  if (f.netSalary <= 0) out.push({ code: "non_positive_net", severity: "critical", message: "Net pay is zero or negative — review deductions and pay days.", value: f.netSalary });
  if (f.attendance.workingDays > 0 && f.attendance.payDays < f.attendance.workingDays) {
    out.push({ code: "loss_of_pay", severity: "info", message: `Loss of pay applied: ${round2(f.attendance.payDays)} of ${round2(f.attendance.workingDays)} working days paid.` });
  }
  if (f.earnings.total > 0 && f.deductions.total / f.earnings.total > 0.5) {
    out.push({ code: "high_deductions", severity: "warning", message: `Deductions are ${Math.round((f.deductions.total / f.earnings.total) * 100)}% of total earnings.` });
  }
  if (String(f.status).toLowerCase() === "draft") out.push({ code: "draft_status", severity: "info", message: "This payroll is still in draft and not yet finalized." });
  return out;
}

export async function computePayrollFacts(scope: PayrollScope): Promise<PayrollFacts> {
  let record: any | undefined;
  if (scope.month && scope.year != null) {
    record = await payrollService.getPayrollByEmployeeMonth(scope.employeeId, scope.month, scope.year);
  } else {
    const all = (await payrollService.getPayrollByEmployee(scope.employeeId)) as any[];
    record = latestOf(all);
  }

  const employees = (await employeeService.getEmployeesByCompany(scope.companyId)) as any[];
  const emp = employees.find((e) => e.id === scope.employeeId);
  const name = emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || "Employee" : "Employee";

  if (!record) {
    return {
      scope: "payslip",
      found: false,
      period: { month: scope.month ?? null, year: scope.year ?? null },
      employee: { id: scope.employeeId, name },
      earnings: { basic: 0, hra: 0, conveyance: 0, medical: 0, special: 0, other: 0, bonus: 0, otAmount: 0, total: 0 },
      deductions: { pfEmployee: 0, vpf: 0, esi: 0, professionalTax: 0, lwf: 0, tds: 0, otherDeductions: 0, loanDeduction: 0, total: 0 },
      attendance: { workingDays: 0, presentDays: 0, payDays: 0, leaveDays: 0, otHours: 0 },
      netSalary: 0,
      status: "none",
      statutoryNotes: [],
      anomalies: [{ code: "no_payslip", severity: "info", message: "No payslip was found for the requested period." }],
    };
  }

  const facts: PayrollFacts = {
    scope: "payslip",
    found: true,
    period: { month: record.month ?? null, year: record.year != null ? num(record.year) : null },
    employee: { id: scope.employeeId, name },
    earnings: {
      basic: num(record.basicSalary),
      hra: num(record.hra),
      conveyance: num(record.conveyance),
      medical: num(record.medicalAllowance),
      special: num(record.specialAllowance),
      other: round2(num(record.otherAllowances)),
      bonus: num(record.bonus),
      otAmount: num(record.otAmount),
      total: num(record.totalEarnings),
    },
    deductions: {
      pfEmployee: num(record.pfEmployee),
      vpf: num(record.vpfAmount),
      esi: num(record.esi),
      professionalTax: num(record.professionalTax),
      lwf: num(record.lwfEmployee),
      tds: num(record.tds),
      otherDeductions: num(record.otherDeductions),
      loanDeduction: num(record.loanDeduction),
      total: num(record.totalDeductions),
    },
    attendance: {
      workingDays: num(record.workingDays),
      presentDays: num(record.presentDays),
      payDays: num(record.payDays),
      leaveDays: num(record.leaveDays),
      otHours: num(record.otHours),
    },
    netSalary: num(record.netSalary),
    status: String(record.status || "draft"),
    statutoryNotes: statutoryNotes(record),
    anomalies: [],
  };
  facts.anomalies = payslipAnomalies(facts);
  return facts;
}

export async function explainPayroll(facts: PayrollFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainFacts({
    feature: "payroll_explain",
    system: buildPayrollExplainPrompt(),
    facts,
    action: "explain payroll",
    companyId,
  });
}

// ── Company / department payroll insights (read-only) ─────────────────────────
// Aggregates one month of payroll for the whole company: total cost, department-
// wise cost split, average net, payslip status mix, and anomalies (duplicate
// payslips, non-positive net, high deductions). Every figure is summed from the
// stored payroll records — nothing is AI-generated.

export interface PayrollInsightScope {
  companyId: string;
  month: number; // 1–12
  year: number;
}

export interface DepartmentCost {
  department: string;
  payslips: number;
  totalEarnings: number;
  totalDeductions: number;
  totalNet: number;
}

export interface PayrollInsightFacts {
  scope: "payroll_insights";
  period: { month: string; year: number };
  totals: {
    payslips: number; draft: number; processed: number; paid: number;
    totalEarnings: number; totalDeductions: number; totalNet: number; avgNet: number;
  };
  byDepartment: DepartmentCost[];
  topCost: { name: string; department: string | null; net: number }[];
  anomalies: Anomaly[];
}

export async function computePayrollInsights(scope: PayrollInsightScope): Promise<PayrollInsightFacts> {
  const monthName = MONTH_NAMES[scope.month - 1] || String(scope.month);
  const [records, employees] = await Promise.all([
    payrollService.getPayrollByMonth(scope.companyId, monthName, scope.year) as Promise<any[]>,
    employeeService.getEmployeesByCompany(scope.companyId) as Promise<any[]>,
  ]);
  const empById = new Map<string, any>(employees.map((e) => [e.id, e]));
  const nameOf = (id: string) => {
    const e = empById.get(id);
    return e ? `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee" : "Employee";
  };
  const deptOf = (id: string) => (empById.get(id)?.department || "Unassigned") as string;

  const totals = { payslips: records.length, draft: 0, processed: 0, paid: 0, totalEarnings: 0, totalDeductions: 0, totalNet: 0, avgNet: 0 };
  const deptMap = new Map<string, DepartmentCost>();
  const perEmployeeCount = new Map<string, number>();
  let nonPositiveNet = 0;
  let highDeduction = 0;

  for (const r of records) {
    const status = String(r.status || "").toLowerCase();
    if (status === "paid") totals.paid += 1;
    else if (status === "processed") totals.processed += 1;
    else totals.draft += 1;

    const earn = num(r.totalEarnings);
    const ded = num(r.totalDeductions);
    const net = num(r.netSalary);
    totals.totalEarnings += earn;
    totals.totalDeductions += ded;
    totals.totalNet += net;

    if (net <= 0) nonPositiveNet += 1;
    if (earn > 0 && ded / earn > 0.5) highDeduction += 1;

    const dept = deptOf(String(r.employeeId));
    const dc = deptMap.get(dept) || { department: dept, payslips: 0, totalEarnings: 0, totalDeductions: 0, totalNet: 0 };
    dc.payslips += 1;
    dc.totalEarnings += earn;
    dc.totalDeductions += ded;
    dc.totalNet += net;
    deptMap.set(dept, dc);

    const empId = String(r.employeeId);
    perEmployeeCount.set(empId, (perEmployeeCount.get(empId) || 0) + 1);
  }

  totals.totalEarnings = round2(totals.totalEarnings);
  totals.totalDeductions = round2(totals.totalDeductions);
  totals.totalNet = round2(totals.totalNet);
  totals.avgNet = totals.payslips > 0 ? round2(totals.totalNet / totals.payslips) : 0;

  const byDepartment = Array.from(deptMap.values())
    .map((d) => ({ ...d, totalEarnings: round2(d.totalEarnings), totalDeductions: round2(d.totalDeductions), totalNet: round2(d.totalNet) }))
    .sort((a, b) => b.totalNet - a.totalNet);

  const topCost = [...records]
    .sort((a, b) => num(b.netSalary) - num(a.netSalary))
    .slice(0, 8)
    .map((r) => ({ name: nameOf(String(r.employeeId)), department: deptOf(String(r.employeeId)), net: round2(num(r.netSalary)) }));

  const anomalies: Anomaly[] = [];
  if (totals.payslips === 0) {
    anomalies.push({ code: "no_payroll", severity: "info", message: `No payroll has been generated for ${monthName} ${scope.year}.` });
  }
  const duplicates = Array.from(perEmployeeCount.values()).filter((c) => c > 1);
  if (duplicates.length) {
    anomalies.push({ code: "duplicate_payslips", severity: "warning", message: `${duplicates.length} employee(s) have more than one payslip for ${monthName} ${scope.year}.`, value: duplicates.length });
  }
  if (nonPositiveNet > 0) {
    anomalies.push({ code: "non_positive_net", severity: "critical", message: `${nonPositiveNet} payslip(s) have zero or negative net pay.`, value: nonPositiveNet });
  }
  if (highDeduction > 0) {
    anomalies.push({ code: "high_deductions", severity: "warning", message: `${highDeduction} payslip(s) have deductions over 50% of earnings.`, value: highDeduction });
  }
  if (totals.draft > 0 && totals.payslips > 0) {
    anomalies.push({ code: "payroll_in_draft", severity: totals.draft === totals.payslips ? "warning" : "info", message: `${totals.draft} of ${totals.payslips} payslip(s) still in draft.`, value: totals.draft });
  }

  return {
    scope: "payroll_insights",
    period: { month: monthName, year: scope.year },
    totals,
    byDepartment,
    topCost,
    anomalies,
  };
}

export async function explainPayrollInsights(facts: PayrollInsightFacts, companyId?: string | null): Promise<AiResult<AiNarrative>> {
  return explainFacts({
    feature: "payroll_insight",
    system: buildPayrollInsightPrompt(),
    facts,
    action: "analyze payroll",
    companyId,
  });
}
