// Phase 2 — employee self-service intent handlers.
//
// All answers come from LIVE data: the prefetched EmployeeContext / employee
// record (reused from the route) or a direct service call. Sensitive values are
// masked; nothing is fabricated — when data is absent we say so plainly.

import { employeeService, settingsService } from "../../../services";
import { maskAadhaar, maskPan, maskBank } from "../../security/masking";
import type { HandlerContext, IntentHandler } from "./shared";
import { t, ok, fail, money, noData } from "./shared";

function needEmployee(ctx: HandlerContext): string | null {
  if (!ctx.employee || !ctx.actor.employeeId) {
    return t(
      ctx.actor.language,
      "Your login isn't linked to an employee profile yet, so I can't look this up. Please ask HR to link your account.",
      "आपका अकाउंट अभी किसी एम्प्लॉयी प्रोफ़ाइल से लिंक नहीं है, इसलिए मैं यह नहीं दिखा सकता। कृपया HR से अकाउंट लिंक करवाएँ।",
    );
  }
  return null;
}

export const myAttendance: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const a = ctx.empCtx?.currentMonthAttendance;
  const lang = ctx.actor.language;
  if (!a || a.totalRecords === 0) return noData(lang, "attendance recorded this month", "इस महीने की कोई हाज़िरी");
  return ok(
    t(
      lang,
      `Your attendance for ${a.month}:\n• Present: ${a.presentDays} day(s)\n• Absent: ${a.absentDays}\n• Half-days: ${a.halfDays}\n• On leave: ${a.leaveDays}`,
      `${a.month} की आपकी हाज़िरी:\n• उपस्थित: ${a.presentDays} दिन\n• अनुपस्थित: ${a.absentDays}\n• आधे दिन: ${a.halfDays}\n• छुट्टी पर: ${a.leaveDays}`,
    ),
  );
};

export const myLeaveBalance: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const ls = ctx.empCtx?.leaveSummary || [];
  if (ls.length === 0) return noData(lang, "leave balance configured", "कोई छुट्टी बैलेंस");
  const lines = ls.map(
    (l) => `• ${l.leaveTypeName}: ${l.daysAvailable} ${t(lang, "available", "उपलब्ध")} (${t(lang, "used", "इस्तेमाल")} ${l.daysUsed}${l.daysPending ? `, ${t(lang, "pending", "लंबित")} ${l.daysPending}` : ""})`,
  );
  return ok(t(lang, `Your leave balance:\n${lines.join("\n")}`, `आपका छुट्टी बैलेंस:\n${lines.join("\n")}`));
};

export const applyLeave: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const ls = ctx.empCtx?.leaveSummary || [];
  const balance = ls.length
    ? "\n" + ls.map((l) => `• ${l.leaveTypeName}: ${l.daysAvailable} ${t(lang, "available", "उपलब्ध")}`).join("\n")
    : "";
  return ok(
    t(
      lang,
      `To apply for leave, open Leave → Apply, pick the leave type and dates, and submit — your manager/HR will approve it.${balance ? `\n\nYour current balance:${balance}` : ""}`,
      `छुट्टी के लिए Leave → Apply खोलें, प्रकार और तारीख़ चुनकर सबमिट करें — आपके मैनेजर/HR मंज़ूरी देंगे।${balance ? `\n\nआपका मौजूदा बैलेंस:${balance}` : ""}`,
    ),
    false,
  );
};

export const cancelLeave: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  return ok(
    t(
      lang,
      "You can cancel a pending leave request from Leave → My Requests. Only requests that aren't approved yet can be withdrawn.",
      "लंबित छुट्टी अनुरोध को आप Leave → My Requests से रद्द कर सकते हैं। केवल बिना मंज़ूरी वाले अनुरोध ही वापस लिए जा सकते हैं।",
    ),
    false,
  );
};

export const myShift: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId;
  if (!companyId) return noData(lang, "shift configured", "कोई शिफ्ट");
  const policies = await settingsService.getTimeOfficePoliciesByCompany(companyId);
  const empPolicyId = (ctx.employee as any)?.timeOfficePolicyId;
  const policy = policies.find((p: any) => p.id === empPolicyId) || policies.find((p: any) => p.isDefault) || policies[0];
  if (!policy) return noData(lang, "shift/duty timing set up", "कोई शिफ्ट/ड्यूटी समय");
  return ok(
    t(
      lang,
      `Your shift (${(policy as any).policyName}):\n• Duty: ${(policy as any).dutyStartTime || "—"} to ${(policy as any).dutyEndTime || "—"}\n• Weekly off: ${(policy as any).weeklyOff1 || "—"}${(policy as any).weeklyOff2 ? `, ${(policy as any).weeklyOff2}` : ""}`,
      `आपकी शिफ्ट (${(policy as any).policyName}):\n• ड्यूटी: ${(policy as any).dutyStartTime || "—"} से ${(policy as any).dutyEndTime || "—"}\n• साप्ताहिक अवकाश: ${(policy as any).weeklyOff1 || "—"}${(policy as any).weeklyOff2 ? `, ${(policy as any).weeklyOff2}` : ""}`,
    ),
  );
};

export const holidayList: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId;
  if (!companyId) return noData(lang, "holiday list", "छुट्टियों की सूची");
  const holidays = await settingsService.getHolidaysByCompany(companyId);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (holidays as any[])
    .filter((h) => (h.status ?? "active") !== "inactive" && String(h.date) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 10);
  if (upcoming.length === 0) return noData(lang, "upcoming holidays", "आगामी छुट्टियाँ");
  const lines = upcoming.map((h) => `• ${h.date} — ${h.name}`);
  return ok(t(lang, `Upcoming holidays:\n${lines.join("\n")}`, `आगामी छुट्टियाँ:\n${lines.join("\n")}`));
};

export const myPayslip: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const slips = ctx.empCtx?.recentPayslips || [];
  if (slips.length === 0) return noData(lang, "payslip generated yet", "अभी कोई वेतन पर्ची");
  const s = slips[0];
  return ok(
    t(
      lang,
      `Your latest payslip (${s.month} ${s.year}):\n• Gross: ${money(s.grossSalary)}\n• Deductions: ${money(s.totalDeductions)}\n• Net pay: ${money(s.netSalary)}\n• Paid days: ${s.presentDays}/${s.workingDays}\n• Status: ${s.status}`,
      `आपकी नवीनतम वेतन पर्ची (${s.month} ${s.year}):\n• कुल (Gross): ${money(s.grossSalary)}\n• कटौती: ${money(s.totalDeductions)}\n• शुद्ध वेतन (Net): ${money(s.netSalary)}\n• भुगतान दिन: ${s.presentDays}/${s.workingDays}\n• स्थिति: ${s.status}`,
    ),
  );
};

export const myPf: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const e = ctx.employee as any;
  if (!e.pfApplicable) {
    return ok(t(lang, "PF is not applicable on your profile.", "आपकी प्रोफ़ाइल पर PF लागू नहीं है।"), false);
  }
  if (!e.uan) return noData(lang, "UAN/PF number assigned yet", "अभी कोई UAN/PF नंबर");
  return ok(t(lang, `Your UAN (PF number): ${e.uan}`, `आपका UAN (PF नंबर): ${e.uan}`));
};

export const myEsic: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const e = ctx.employee as any;
  if (!e.esiApplicable) {
    return ok(t(lang, "ESIC is not applicable on your profile.", "आपकी प्रोफ़ाइल पर ESIC लागू नहीं है।"), false);
  }
  if (!e.esiNumber) return noData(lang, "ESIC number assigned yet", "अभी कोई ESIC नंबर");
  return ok(t(lang, `Your ESIC number: ${e.esiNumber}`, `आपका ESIC नंबर: ${e.esiNumber}`));
};

export const myKyc: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const k = ctx.kyc;
  if (!k) return noData(lang, "KYC record", "कोई KYC रिकॉर्ड");
  const pending: string[] = [];
  if (!k.aadhaarSubmitted) pending.push(t(lang, "Aadhaar", "आधार"));
  if (!k.panSubmitted) pending.push("PAN");
  if (!k.bankDetailsSubmitted) pending.push(t(lang, "Bank details", "बैंक विवरण"));
  if (!k.photographSubmitted) pending.push(t(lang, "Photograph", "फ़ोटो"));
  if (pending.length === 0) {
    return ok(t(lang, `Your KYC is complete ✅ (status: ${k.overallStatus}).`, `आपका KYC पूरा है ✅ (स्थिति: ${k.overallStatus})।`));
  }
  return ok(
    t(
      lang,
      `Your KYC status: ${k.overallStatus}. Pending: ${pending.join(", ")}. You can upload these here using the 📎 button.`,
      `आपका KYC स्थिति: ${k.overallStatus}. लंबित: ${pending.join(", ")}. इन्हें 📎 बटन से अपलोड करें।`,
    ),
  );
};

export const updatePhone: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const cur = (ctx.employee as any)?.mobileNumber;
  return ok(
    t(
      lang,
      `Your phone on file: ${cur || "not set"}. To change it, go to Profile → Edit and submit the new number — the update needs HR approval before it's saved.`,
      `फ़ाइल पर आपका फ़ोन: ${cur || "सेट नहीं"}. बदलने के लिए Profile → Edit में नया नंबर डालें — सेव होने से पहले HR की मंज़ूरी ज़रूरी है।`,
    ),
    false,
  );
};

export const updateAddress: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  return ok(
    t(
      lang,
      "To update your address, go to Profile → Edit, enter the new address and submit. The change is applied after HR approval.",
      "पता बदलने के लिए Profile → Edit में नया पता डालकर सबमिट करें। HR की मंज़ूरी के बाद बदलाव लागू होगा।",
    ),
    false,
  );
};

export const myDocuments: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const docs = (await employeeService.getEmployeeDocuments(ctx.actor.employeeId!)) as unknown as any[];
  if (!docs || docs.length === 0) return noData(lang, "documents uploaded", "कोई दस्तावेज़ अपलोड");
  const lines = docs.slice(0, 15).map((d) => `• ${d.documentName || d.documentType || "Document"}`);
  return ok(
    t(
      lang,
      `Your documents (${docs.length}):\n${lines.join("\n")}\n\nYou can view/download them from Profile → Documents.`,
      `आपके दस्तावेज़ (${docs.length}):\n${lines.join("\n")}\n\nProfile → Documents से देखें/डाउनलोड करें।`,
    ),
  );
};

export const myKra: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const kras = ctx.empCtx?.kraAssignments || [];
  if (kras.length === 0) return noData(lang, "KRA assigned", "कोई KRA असाइन");
  const lines = kras.slice(0, 5).map(
    (k) => `• ${k.title} (${k.reviewPeriod} ${k.periodYear}) — ${t(lang, "status", "स्थिति")}: ${k.status}${k.totalScore != null ? `, ${t(lang, "score", "स्कोर")}: ${k.totalScore}` : ""}`,
  );
  return ok(t(lang, `Your KRAs:\n${lines.join("\n")}`, `आपके KRA:\n${lines.join("\n")}`));
};

export const myKpi: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const kras = ctx.empCtx?.kraAssignments || [];
  const kpis = kras.flatMap((k) => k.kpis || []);
  if (kpis.length === 0) return noData(lang, "KPI defined", "कोई KPI");
  const lines = kpis.slice(0, 8).map(
    (k) => `• ${k.kpiName} — ${t(lang, "weight", "भार")}: ${k.weightage}%${k.computedScore != null ? `, ${t(lang, "score", "स्कोर")}: ${k.computedScore}` : ""}`,
  );
  return ok(t(lang, `Your KPIs:\n${lines.join("\n")}`, `आपके KPI:\n${lines.join("\n")}`));
};

export const myAppraisal: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const kras = (ctx.empCtx?.kraAssignments || []).filter((k) => k.totalScore != null || k.status === "completed");
  if (kras.length === 0) return noData(lang, "completed appraisal on record", "कोई पूर्ण मूल्यांकन");
  const lines = kras.map(
    (k) => `• ${k.reviewPeriod} ${k.periodYear}: ${t(lang, "score", "स्कोर")} ${k.totalScore ?? "—"}${k.feedback ? ` — ${k.feedback}` : ""}`,
  );
  return ok(t(lang, `Your appraisal history:\n${lines.join("\n")}`, `आपका मूल्यांकन इतिहास:\n${lines.join("\n")}`));
};

export const myReimbursement: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const loans = ctx.empCtx?.loanAdvances || [];
  if (loans.length === 0) return noData(lang, "loan/advance/reimbursement record", "कोई लोन/अग्रिम/प्रतिपूर्ति");
  const lines = loans.map(
    (l) => `• ${l.type} — ${money(l.amount)} (${t(lang, "status", "स्थिति")}: ${l.status})${l.remainingBalance != null ? `, ${t(lang, "remaining", "शेष")}: ${money(l.remainingBalance)}` : ""}`,
  );
  return ok(t(lang, `Your loan/advance status:\n${lines.join("\n")}`, `आपके लोन/अग्रिम की स्थिति:\n${lines.join("\n")}`));
};

export const myProfile: IntentHandler = async (ctx) => {
  const guard = needEmployee(ctx);
  if (guard) return fail(guard);
  const lang = ctx.actor.language;
  const e = ctx.employee as any;
  const lines = [
    `• ${t(lang, "Name", "नाम")}: ${`${e.firstName || ""} ${e.lastName || ""}`.trim()}`,
    `• ${t(lang, "Employee code", "कर्मचारी कोड")}: ${e.employeeCode || "—"}`,
    `• ${t(lang, "Department", "विभाग")}: ${e.department || "—"}`,
    `• ${t(lang, "Designation", "पदनाम")}: ${e.designation || "—"}`,
    `• ${t(lang, "Date of joining", "नियुक्ति तिथि")}: ${e.dateOfJoining || "—"}`,
    `• ${t(lang, "Mobile", "मोबाइल")}: ${e.mobileNumber || "—"}`,
    `• ${t(lang, "Email", "ईमेल")}: ${e.officialEmail || "—"}`,
    `• PAN: ${maskPan(e.pan)}`,
    `• ${t(lang, "Aadhaar", "आधार")}: ${maskAadhaar(e.aadhaar)}`,
    `• ${t(lang, "Bank A/C", "बैंक खाता")}: ${maskBank(e.bankAccount)}`,
  ];
  return ok(t(lang, `Your profile:\n${lines.join("\n")}`, `आपकी प्रोफ़ाइल:\n${lines.join("\n")}`));
};
