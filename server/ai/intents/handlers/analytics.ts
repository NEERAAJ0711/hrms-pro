// Phase 4 — Attendance / Leave / Payroll AI intent handlers (read-only).
//
// Each handler computes DETERMINISTIC facts from live, company-isolated data
// (manager handlers respect allowedEmployeeIds) and renders a plain-language
// answer that works with NO AI key. When a key is configured it appends an AI
// narrative over those same facts. Numbers always come from the facts, never the
// LLM, so there is nothing to hallucinate.

import { computeAttendanceFacts, explainAttendance } from "../../attendance/service";
import { computeLeaveFacts, explainLeave } from "../../leave/service";
import { computePayrollFacts, explainPayroll, computePayrollInsights, explainPayrollInsights } from "../../payroll/service";
import {
  computeManagerInsights, explainManagerInsights,
  computeExecutiveSummary, explainExecutiveSummary,
} from "../../insights/service";
import { currentMonthIST } from "../context";
import type { HandlerContext, IntentHandler } from "./shared";
import { t, ok, fail, money, noData } from "./shared";
import type { AiResult, AiNarrative, Anomaly } from "../../analytics/types";
import type { Language } from "../types";

function notLinked(ctx: HandlerContext): string {
  return t(
    ctx.actor.language,
    "Your login isn't linked to an employee profile yet, so I can't analyze your records. Please ask HR to link your account.",
    "आपका अकाउंट अभी किसी एम्प्लॉयी प्रोफ़ाइल से लिंक नहीं है, इसलिए मैं विश्लेषण नहीं कर सकता। कृपया HR से अकाउंट लिंक करवाएँ।",
  );
}

function anomalyLines(lang: Language, anomalies: Anomaly[]): string {
  if (!anomalies.length) return "";
  const icon = (s: string) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🔵");
  return "\n\n" + t(lang, "Flags:", "ध्यान देने योग्य:") + "\n" + anomalies.map((a) => `${icon(a.severity)} ${a.message}`).join("\n");
}

function appendNarrative(lang: Language, baseText: string, ai: AiResult<AiNarrative>): string {
  if (!ai.available) return baseText;
  const d = ai.data;
  const parts: string[] = [];
  if (d.explanation) parts.push(d.explanation);
  if (d.insights.length) parts.push(t(lang, "Insights:", "मुख्य बातें:") + "\n" + d.insights.map((s) => `• ${s}`).join("\n"));
  if (d.recommendations.length) parts.push(t(lang, "Recommendations:", "सुझाव:") + "\n" + d.recommendations.map((s) => `• ${s}`).join("\n"));
  if (!parts.length) return baseText;
  return `${baseText}\n\n🤖 ${t(lang, "AI analysis", "AI विश्लेषण")}:\n${parts.join("\n\n")}`;
}

// ── Employee self-service ────────────────────────────────────────────────────
export const explainMyAttendance: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  if (!ctx.actor.employeeId || !ctx.actor.companyId) return fail(notLinked(ctx));
  const { month, year } = currentMonthIST();
  const facts = await computeAttendanceFacts({ companyId: ctx.actor.companyId, employeeId: ctx.actor.employeeId, month, year });
  if (facts.totals.records === 0) return noData(lang, "attendance recorded this month", "इस महीने की कोई हाज़िरी");
  const x = facts.totals;
  let base = t(
    lang,
    `Your attendance for ${facts.period.label}:\n• Present: ${x.present}\n• Absent: ${x.absent}\n• Half-days: ${x.halfDay}\n• On leave: ${x.onLeave}\n• Late arrivals: ${x.late}\n• OT hours: ${x.totalOtHours}`,
    `${facts.period.label} की आपकी हाज़िरी:\n• उपस्थित: ${x.present}\n• अनुपस्थित: ${x.absent}\n• आधे दिन: ${x.halfDay}\n• छुट्टी पर: ${x.onLeave}\n• देर से आए: ${x.late}\n• OT घंटे: ${x.totalOtHours}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainAttendance(facts, ctx.actor.companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const explainMyLeave: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  if (!ctx.actor.employeeId || !ctx.actor.companyId) return fail(notLinked(ctx));
  const { year } = currentMonthIST();
  const facts = await computeLeaveFacts({ companyId: ctx.actor.companyId, employeeId: ctx.actor.employeeId, year });
  if (facts.totals.requests === 0) return noData(lang, "leave activity this year", "इस वर्ष की कोई छुट्टी गतिविधि");
  const typeLines = facts.byType
    .filter((b) => b.taken > 0 || b.pending > 0 || (b.entitlement ?? 0) > 0)
    .map((b) => `• ${b.name}: ${t(lang, "taken", "ली")} ${b.taken}${b.entitlement != null ? `/${b.entitlement}` : ""}${b.balance != null ? `, ${t(lang, "balance", "शेष")} ${b.balance}` : ""}${b.pending ? `, ${t(lang, "pending", "लंबित")} ${b.pending}` : ""}`);
  let base = t(
    lang,
    `Your leave for ${facts.period.year}:\n• Requests: ${facts.totals.requests} (approved ${facts.totals.approved}, pending ${facts.totals.pending})\n• Days approved: ${facts.totals.daysApproved}\n${typeLines.join("\n")}`,
    `${facts.period.year} की आपकी छुट्टियाँ:\n• अनुरोध: ${facts.totals.requests} (मंज़ूर ${facts.totals.approved}, लंबित ${facts.totals.pending})\n• मंज़ूर दिन: ${facts.totals.daysApproved}\n${typeLines.join("\n")}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainLeave(facts, ctx.actor.companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const explainMyPayslip: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  if (!ctx.actor.employeeId || !ctx.actor.companyId) return fail(notLinked(ctx));
  const facts = await computePayrollFacts({ companyId: ctx.actor.companyId, employeeId: ctx.actor.employeeId });
  if (!facts.found) return noData(lang, "payslip generated yet", "अभी तक कोई पेस्लिप");
  const d = facts.deductions;
  let base = t(
    lang,
    `Your payslip for ${facts.period.month} ${facts.period.year}:\n• Gross earnings: ${money(facts.earnings.total)}\n• Total deductions: ${money(d.total)} (PF ${money(d.pfEmployee)}, ESIC ${money(d.esi)}, PT ${money(d.professionalTax)}, TDS ${money(d.tds)}${d.loanDeduction ? `, Loan ${money(d.loanDeduction)}` : ""})\n• Net pay: ${money(facts.netSalary)}\n• Pay days: ${facts.attendance.payDays}/${facts.attendance.workingDays}`,
    `${facts.period.month} ${facts.period.year} की आपकी पेस्लिप:\n• सकल आय: ${money(facts.earnings.total)}\n• कुल कटौती: ${money(d.total)} (PF ${money(d.pfEmployee)}, ESIC ${money(d.esi)}, PT ${money(d.professionalTax)}, TDS ${money(d.tds)}${d.loanDeduction ? `, लोन ${money(d.loanDeduction)}` : ""})\n• शुद्ध वेतन: ${money(facts.netSalary)}\n• वेतन दिन: ${facts.attendance.payDays}/${facts.attendance.workingDays}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainPayroll(facts, ctx.actor.companyId);
  return ok(appendNarrative(lang, base, ai));
};

// ── HR / admin / manager ─────────────────────────────────────────────────────
export const attendanceInsights: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const { month, year } = currentMonthIST();
  const facts = await computeAttendanceFacts({ companyId, allowedEmployeeIds: ctx.allowedEmployeeIds, month, year });
  if (facts.totals.records === 0) return noData(lang, "attendance recorded this month", "इस महीने की कोई हाज़िरी");
  const topAbs = facts.perEmployee.filter((e) => e.absent > 0).slice(0, 5).map((e) => `• ${e.name}: ${e.absent} ${t(lang, "absent", "अनुपस्थित")}`);
  let base = t(
    lang,
    `Attendance insights for ${facts.period.label}:\n• Headcount: ${facts.headcount ?? "—"}\n• Attendance rate: ${facts.attendanceRatePct ?? "—"}%\n• Present: ${facts.totals.present}, Absent: ${facts.totals.absent}, Half-days: ${facts.totals.halfDay}, On leave: ${facts.totals.onLeave}\n• Late arrivals: ${facts.totals.late}, OT hours: ${facts.totals.totalOtHours}${topAbs.length ? `\n${t(lang, "Most absences", "सबसे ज़्यादा अनुपस्थिति")}:\n${topAbs.join("\n")}` : ""}`,
    `${facts.period.label} की उपस्थिति जानकारी:\n• कर्मचारी: ${facts.headcount ?? "—"}\n• उपस्थिति दर: ${facts.attendanceRatePct ?? "—"}%\n• उपस्थित: ${facts.totals.present}, अनुपस्थित: ${facts.totals.absent}, आधे दिन: ${facts.totals.halfDay}, छुट्टी पर: ${facts.totals.onLeave}\n• देर से: ${facts.totals.late}, OT घंटे: ${facts.totals.totalOtHours}${topAbs.length ? `\n${t(lang, "Most absences", "सबसे ज़्यादा अनुपस्थिति")}:\n${topAbs.join("\n")}` : ""}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainAttendance(facts, companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const leaveInsights: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const { year } = currentMonthIST();
  const facts = await computeLeaveFacts({ companyId, allowedEmployeeIds: ctx.allowedEmployeeIds, year });
  if (facts.totals.requests === 0) return noData(lang, "leave activity this year", "इस वर्ष की कोई छुट्टी गतिविधि");
  const typeLines = facts.byType.map((b) => `• ${b.name}: ${t(lang, "taken", "ली")} ${b.taken}${b.pending ? `, ${t(lang, "pending", "लंबित")} ${b.pending}` : ""}`);
  const consumers = facts.topConsumers.slice(0, 5).map((c) => `• ${c.name}: ${c.daysTaken} ${t(lang, "days", "दिन")}`);
  let base = t(
    lang,
    `Leave insights for ${facts.period.year}:\n• Requests: ${facts.totals.requests} (approved ${facts.totals.approved}, pending ${facts.totals.pending})\n• Days approved: ${facts.totals.daysApproved}\n${typeLines.join("\n")}${consumers.length ? `\n${t(lang, "Top leave takers", "सबसे ज़्यादा छुट्टी")}:\n${consumers.join("\n")}` : ""}`,
    `${facts.period.year} की छुट्टी जानकारी:\n• अनुरोध: ${facts.totals.requests} (मंज़ूर ${facts.totals.approved}, लंबित ${facts.totals.pending})\n• मंज़ूर दिन: ${facts.totals.daysApproved}\n${typeLines.join("\n")}${consumers.length ? `\n${t(lang, "Top leave takers", "सबसे ज़्यादा छुट्टी")}:\n${consumers.join("\n")}` : ""}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainLeave(facts, companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const teamInsights: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const { month, year } = currentMonthIST();
  const facts = await computeManagerInsights({ companyId, allowedEmployeeIds: ctx.allowedEmployeeIds, month, year });
  const a = facts.attendance;
  const l = facts.leave;
  if (a.totals.records === 0 && l.totals.requests === 0) return noData(lang, "team activity this month", "इस महीने की कोई टीम गतिविधि");
  let base = t(
    lang,
    `Team briefing for ${facts.period.label}:\n• Attendance rate: ${a.attendanceRatePct ?? "—"}% (present ${a.totals.present}, absent ${a.totals.absent})\n• Leave: ${l.totals.approved} approved, ${l.totals.pending} pending`,
    `${facts.period.label} की टीम जानकारी:\n• उपस्थिति दर: ${a.attendanceRatePct ?? "—"}% (उपस्थित ${a.totals.present}, अनुपस्थित ${a.totals.absent})\n• छुट्टी: ${l.totals.approved} मंज़ूर, ${l.totals.pending} लंबित`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainManagerInsights(facts, companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const payrollInsights: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const { month, year } = currentMonthIST();
  const facts = await computePayrollInsights({ companyId, month, year });
  if (facts.totals.payslips === 0) return noData(lang, "payroll generated for this month", "इस महीने का कोई पेरोल");
  const t1 = facts.totals;
  const deptLines = facts.byDepartment
    .slice(0, 6)
    .map((d) => `• ${d.department}: ${money(d.totalNet)} (${d.payslips})`);
  let base = t(
    lang,
    `Payroll insights for ${facts.period.month} ${facts.period.year}:\n• Payslips: ${t1.payslips} (paid ${t1.paid}, processed ${t1.processed}, draft ${t1.draft})\n• Total net cost: ${money(t1.totalNet)} (gross ${money(t1.totalEarnings)}, deductions ${money(t1.totalDeductions)})\n• Average net: ${money(t1.avgNet)}\n${t(lang, "By department (net cost)", "विभाग अनुसार (शुद्ध लागत)")}:\n${deptLines.join("\n")}`,
    `${facts.period.month} ${facts.period.year} की पेरोल जानकारी:\n• पेस्लिप: ${t1.payslips} (भुगतान ${t1.paid}, संसाधित ${t1.processed}, ड्राफ़्ट ${t1.draft})\n• कुल शुद्ध लागत: ${money(t1.totalNet)} (सकल ${money(t1.totalEarnings)}, कटौती ${money(t1.totalDeductions)})\n• औसत शुद्ध: ${money(t1.avgNet)}\n${t(lang, "By department (net cost)", "विभाग अनुसार (शुद्ध लागत)")}:\n${deptLines.join("\n")}`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainPayrollInsights(facts, companyId);
  return ok(appendNarrative(lang, base, ai));
};

export const executiveSummary: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const { month, year } = currentMonthIST();
  const facts = await computeExecutiveSummary({ companyId, month, year });
  const a = facts.attendance;
  const l = facts.leave;
  const p = facts.payroll;
  let base = t(
    lang,
    `Executive summary — ${facts.period.label}:\n• Attendance rate: ${a.attendanceRatePct ?? "—"}% (headcount ${a.headcount ?? "—"})\n• Leave: ${l.totals.approved} approved, ${l.totals.pending} pending this year\n• Payroll: ${p.payslips} payslip(s) — net ${money(p.totalNet)} (paid ${p.paid}, processed ${p.processed}, draft ${p.draft})`,
    `कार्यकारी सारांश — ${facts.period.label}:\n• उपस्थिति दर: ${a.attendanceRatePct ?? "—"}% (कर्मचारी ${a.headcount ?? "—"})\n• छुट्टी: ${l.totals.approved} मंज़ूर, ${l.totals.pending} लंबित (इस वर्ष)\n• पेरोल: ${p.payslips} पेस्लिप — शुद्ध ${money(p.totalNet)} (भुगतान ${p.paid}, संसाधित ${p.processed}, ड्राफ़्ट ${p.draft})`,
  );
  base += anomalyLines(lang, facts.anomalies);
  const ai = await explainExecutiveSummary(facts, companyId);
  return ok(appendNarrative(lang, base, ai));
};
