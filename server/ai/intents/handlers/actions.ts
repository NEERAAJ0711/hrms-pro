// Phase 2 — action intent handlers (state changes + identifier lookups).
//
// These are the most sensitive intents: find an employee by mobile/PAN/Aadhaar/
// code, or approve/reject a leave request. Every action enforces company
// isolation + role (already gated by authorizeIntent), masks sensitive output,
// refuses to guess when the target is ambiguous, and writes an audit-log entry.

import { employeeService, leaveService, auditService } from "../../../services";
import { maskAadhaar, maskPan, maskMobile } from "../../security/masking";
import type { HandlerContext, IntentHandler } from "./shared";
import { t, ok, fail, fullName } from "./shared";

function digits(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "");
}

async function companyEmployees(ctx: HandlerContext) {
  const emps = (await employeeService.getEmployeesByCompany(ctx.actor.companyId!)) as any[];
  return ctx.allowedEmployeeIds ? emps.filter((e) => ctx.allowedEmployeeIds!.has(e.id)) : emps;
}

export const findEmployee: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const by = ctx.detected.params.by;
  const value = ctx.detected.params.value;
  if (!by || !value) {
    return ok(
      t(
        lang,
        "Tell me how to search — by mobile number, PAN, Aadhaar, or employee code. e.g. \"find employee by mobile 9876543210\".",
        "खोज का तरीका बताएँ — मोबाइल, PAN, आधार या कर्मचारी कोड से। जैसे: \"मोबाइल 9876543210 से कर्मचारी खोजो\"।",
      ),
      false,
    );
  }
  const emps = await companyEmployees(ctx);
  const v = value.toLowerCase();
  const matches = emps.filter((e) => {
    switch (by) {
      case "mobile": return digits(e.mobileNumber) === digits(value) || digits(e.mobileNumber).endsWith(digits(value));
      case "pan": return String(e.pan || "").toLowerCase() === v;
      case "aadhaar": return digits(e.aadhaar) === digits(value);
      case "code": return String(e.employeeCode || "").toLowerCase() === v;
      default: return false;
    }
  });
  if (matches.length === 0) {
    return ok(
      t(lang, `No employee found matching that ${by}.`, `उस ${by} से मेल खाता कोई कर्मचारी नहीं मिला।`),
      false,
    );
  }
  const lines = matches.slice(0, 5).map((e) => {
    return [
      `• ${fullName(e)}${e.employeeCode ? ` [${e.employeeCode}]` : ""}`,
      `   ${t(lang, "Dept", "विभाग")}: ${e.department || "—"} | ${t(lang, "Desig", "पद")}: ${e.designation || "—"}`,
      `   ${t(lang, "Mobile", "मोबाइल")}: ${maskMobile(e.mobileNumber)} | PAN: ${maskPan(e.pan)} | ${t(lang, "Aadhaar", "आधार")}: ${maskAadhaar(e.aadhaar)}`,
      `   ${t(lang, "Status", "स्थिति")}: ${e.status || "—"}`,
    ].join("\n");
  });
  return ok(t(lang, `Found ${matches.length} match(es):\n${lines.join("\n")}`, `${matches.length} मेल मिले:\n${lines.join("\n")}`));
};

// Resolve a pending leave request for a named employee. Returns either the
// single request, or a disambiguation/empty message (never auto-picks).
async function resolvePendingLeave(ctx: HandlerContext) {
  const lang = ctx.actor.language;
  const name = (ctx.detected.params.name || "").trim();
  if (!name) {
    return { error: t(lang, "Whose leave should I action? Please include the employee's name.", "किसकी छुट्टी पर कार्रवाई करूँ? कृपया कर्मचारी का नाम बताएँ।") };
  }
  const emps = await companyEmployees(ctx);
  const lower = name.toLowerCase();
  const matchedEmps = emps.filter((e) => fullName(e).toLowerCase().includes(lower));
  if (matchedEmps.length === 0) {
    return { error: t(lang, `I couldn't find an employee named "${name}".`, `"${name}" नाम का कर्मचारी नहीं मिला।`) };
  }
  if (matchedEmps.length > 1) {
    const names = matchedEmps.slice(0, 6).map((e) => `• ${fullName(e)}${e.employeeCode ? ` [${e.employeeCode}]` : ""}`).join("\n");
    return { error: t(lang, `Multiple employees match "${name}":\n${names}\nPlease be more specific.`, `"${name}" से कई कर्मचारी मेल खाते हैं:\n${names}\nकृपया स्पष्ट करें।`) };
  }
  const emp = matchedEmps[0];
  const requests = (await leaveService.getLeaveRequestsByCompany(ctx.actor.companyId!)) as any[];
  const pending = requests.filter((r) => r.employeeId === emp.id && (r.status || "").toLowerCase() === "pending");
  if (pending.length === 0) {
    return { error: t(lang, `${fullName(emp)} has no pending leave request.`, `${fullName(emp)} का कोई लंबित छुट्टी अनुरोध नहीं है।`) };
  }
  if (pending.length > 1) {
    const list = pending.slice(0, 6).map((r) => `• ${r.startDate} → ${r.endDate} (${r.days || "?"} ${t(lang, "day(s)", "दिन")})`).join("\n");
    return { error: t(lang, `${fullName(emp)} has ${pending.length} pending requests:\n${list}\nPlease action them from the Leave screen to pick the exact one.`, `${fullName(emp)} के ${pending.length} लंबित अनुरोध हैं:\n${list}\nकृपया Leave स्क्रीन से सही चुनें।`) };
  }
  return { emp, request: pending[0] };
}

async function audit(ctx: HandlerContext, action: string, details: string) {
  try {
    await auditService.writeAuditLog({
      action,
      userId: ctx.actor.userId,
      userName: ctx.actor.userName,
      details,
    });
  } catch {
    // Audit is best-effort; never block the user action on a logging failure.
  }
}

export const approveLeave: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const res = await resolvePendingLeave(ctx);
  if ("error" in res) return fail(res.error as string);
  const emp: any = (res as any).emp;
  const request: any = (res as any).request;
  const updated = await leaveService.updateLeaveRequest(request.id, {
    status: "approved",
    approvedBy: ctx.actor.userId,
    approvedAt: new Date(),
  } as any);
  if (!updated) return fail(t(lang, "I couldn't update that leave request. Please try from the Leave screen.", "मैं वह छुट्टी अनुरोध अपडेट नहीं कर सका। कृपया Leave स्क्रीन से प्रयास करें।"));
  await audit(ctx, "ai_approve_leave", `AI: approved leave ${request.id} for ${fullName(emp)} (${request.startDate}→${request.endDate}) by ${ctx.actor.userName}`);
  return ok(
    t(
      lang,
      `✅ Approved ${fullName(emp)}'s leave (${request.startDate} → ${request.endDate}).`,
      `✅ ${fullName(emp)} की छुट्टी मंज़ूर की (${request.startDate} → ${request.endDate})।`,
    ),
  );
};

export const rejectLeave: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const res = await resolvePendingLeave(ctx);
  if ("error" in res) return fail(res.error as string);
  const emp: any = (res as any).emp;
  const request: any = (res as any).request;
  const updated = await leaveService.updateLeaveRequest(request.id, {
    status: "rejected",
    approvedBy: ctx.actor.userId,
    approvedAt: new Date(),
  } as any);
  if (!updated) return fail(t(lang, "I couldn't update that leave request. Please try from the Leave screen.", "मैं वह छुट्टी अनुरोध अपडेट नहीं कर सका। कृपया Leave स्क्रीन से प्रयास करें।"));
  await audit(ctx, "ai_reject_leave", `AI: rejected leave ${request.id} for ${fullName(emp)} (${request.startDate}→${request.endDate}) by ${ctx.actor.userName}`);
  return ok(
    t(
      lang,
      `❌ Rejected ${fullName(emp)}'s leave (${request.startDate} → ${request.endDate}).`,
      `❌ ${fullName(emp)} की छुट्टी अस्वीकृत की (${request.startDate} → ${request.endDate})।`,
    ),
  );
};
