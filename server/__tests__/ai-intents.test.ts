// Phase 2 — pure-function checks for the AI intent layer: intent detection,
// parameter extraction, sensitive-value masking, and the RBAC authorization
// gate. No DB / network needed.
// Run with:  node_modules/.bin/tsx --test server/__tests__/ai-intents.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectIntent,
  extractMobile,
  extractPan,
  extractAadhaar,
  extractEmployeeCode,
  extractPersonName,
} from "../ai/intents/detector";
import {
  maskAadhaar,
  maskPan,
  maskBank,
  maskMobile,
  canSeeSalary,
  maskSalary,
} from "../ai/security/masking";
import { authorizeIntent, buildActor } from "../ai/intents/context";
import type { DetectedIntent } from "../ai/intents/types";

// ── Param extraction ─────────────────────────────────────────────────────────

test("extractMobile pulls a 10-digit Indian mobile (with/without prefix)", () => {
  assert.equal(extractMobile("find by mobile 9876543210"), "9876543210");
  assert.equal(extractMobile("number is +91 98765 43210"), "9876543210");
  assert.equal(extractMobile("no digits here"), null);
});

test("extractPan matches a valid PAN, case-insensitive", () => {
  assert.equal(extractPan("his pan is abcde1234f"), "ABCDE1234F");
  assert.equal(extractPan("AAAAA0000A please"), "AAAAA0000A");
  assert.equal(extractPan("no pan"), null);
});

test("extractAadhaar matches a 12-digit number, not a 10-digit mobile", () => {
  assert.equal(extractAadhaar("aadhaar 1234 5678 9012"), "123456789012");
  assert.equal(extractAadhaar("9876543210"), null);
});

test("extractEmployeeCode reads an employee code token", () => {
  assert.equal(extractEmployeeCode("find employee code EMP123"), "EMP123");
  assert.equal(extractEmployeeCode("employee id A-100"), "A-100");
});

test("extractPersonName pulls the name from approve/reject phrasing", () => {
  assert.equal(extractPersonName("approve Rahul's leave"), "Rahul");
  assert.equal(extractPersonName("reject leave request of Amit Kumar"), "Amit Kumar");
});

// ── Intent detection ──────────────────────────────────────────────────────────

test("detects employee self-service intents (English + Hindi)", () => {
  assert.equal(detectIntent("show my attendance")?.intent, "my_attendance");
  assert.equal(detectIntent("meri chhutti ka balance batao")?.intent, "my_leave_balance");
  assert.equal(detectIntent("show my latest payslip")?.intent, "my_payslip");
  assert.equal(detectIntent("holiday list dikhao")?.intent, "holiday_list");
});

test("detects HR/admin intents", () => {
  assert.equal(detectIntent("who is absent today")?.intent, "absentees_today");
  assert.equal(detectIntent("total employees count")?.intent, "employee_count");
  assert.equal(detectIntent("department wise strength")?.intent, "department_strength");
  assert.equal(detectIntent("pending leave approvals")?.intent, "pending_approvals");
});

test("detects action intents with params", () => {
  const approve = detectIntent("approve Rahul's leave");
  assert.equal(approve?.intent, "approve_leave");
  assert.equal(approve?.kind, "action");
  assert.equal(approve?.params.name, "Rahul");

  const find = detectIntent("find employee by mobile 9876543210");
  assert.equal(find?.intent, "find_employee");
  assert.equal(find?.params.by, "mobile");
  assert.equal(find?.params.value, "9876543210");
});

test("self intents are scoped self, admin intents scoped admin", () => {
  assert.equal(detectIntent("show my attendance")?.scope, "self");
  assert.equal(detectIntent("who is absent today")?.scope, "admin");
});

test("returns null for unrecognized chatter (LLM fallback)", () => {
  assert.equal(detectIntent("hello how are you"), null);
  assert.equal(detectIntent("tell me a joke"), null);
  assert.equal(detectIntent(""), null);
});

// ── Masking ───────────────────────────────────────────────────────────────────

test("masking reveals only the safe tail of each value", () => {
  assert.equal(maskAadhaar("1234 5678 9012"), "XXXX XXXX 9012");
  assert.equal(maskPan("ABCDE1234F"), "AB•••••••F");
  assert.equal(maskBank("123456789012"), "••••9012");
  assert.ok(maskMobile("9876543210").endsWith("3210"));
  assert.equal(maskAadhaar(null), "—");
});

test("salary is visible only to owner or privileged roles", () => {
  assert.equal(canSeeSalary("employee", true), true); // own salary
  assert.equal(canSeeSalary("employee", false), false); // someone else's
  assert.equal(canSeeSalary("hr_admin", false), true);
  assert.equal(canSeeSalary("manager", false), false);
  assert.equal(maskSalary(50000, false), "••••• (hidden)");
  assert.equal(maskSalary(50000, true), "₹50,000");
});

// ── Authorization gate ─────────────────────────────────────────────────────────

function di(intent: string, scope: "self" | "admin", module: any = "self"): DetectedIntent {
  return { intent, module, kind: "read", scope, params: {}, confidence: 1 };
}

test("self intent requires a linked employee", () => {
  const noLink = buildActor({ userId: "u1", role: "employee", companyId: "c1", userName: "A", employeeId: null });
  assert.equal(authorizeIntent(noLink, di("my_attendance", "self")).ok, false);

  const linked = buildActor({ userId: "u1", role: "employee", companyId: "c1", userName: "A", employeeId: "e1" });
  assert.equal(authorizeIntent(linked, di("my_attendance", "self")).ok, true);
});

test("admin intent denied for plain employee, allowed for HR", () => {
  const emp = buildActor({ userId: "u1", role: "employee", companyId: "c1", userName: "A", employeeId: "e1" });
  assert.equal(authorizeIntent(emp, di("employee_count", "admin", "employees")).ok, false);

  const hr = buildActor({ userId: "u2", role: "hr_admin", companyId: "c1", userName: "B", employeeId: null });
  assert.equal(authorizeIntent(hr, di("employee_count", "admin", "employees")).ok, true);
});

test("super_admin passes every gate", () => {
  const sa = buildActor({ userId: "u0", role: "super_admin", companyId: null, userName: "S", employeeId: null });
  assert.equal(authorizeIntent(sa, di("company_wise", "admin", "employees")).ok, true);
  assert.equal(authorizeIntent(sa, di("my_attendance", "self")).ok, true);
});

test("manager can approve leave but cannot run payroll-only intents", () => {
  const mgr = buildActor({ userId: "u3", role: "manager", companyId: "c1", userName: "M", employeeId: "e3" });
  assert.equal(authorizeIntent(mgr, di("approve_leave", "admin", "leave")).ok, true);
  assert.equal(authorizeIntent(mgr, di("pending_payroll", "admin", "payroll")).ok, false);
});
