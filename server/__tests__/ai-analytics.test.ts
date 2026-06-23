// Phase 4 — pure-function checks for the Attendance/Leave/Payroll AI layer:
// intent detection for the new analytics asks, the RBAC gate for the new admin
// intents, and the graceful (non-fabricating) result helpers. No DB / network.
// Run with:  node_modules/.bin/tsx --test server/__tests__/ai-analytics.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectIntent } from "../ai/intents/detector";
import { authorizeIntent, buildActor, INTENT_REQUIRED_MODULES } from "../ai/intents/context";
import { noKey, noData, aiError } from "../ai/analytics/types";

// ── Composite RBAC: cross-domain intents must require EVERY surfaced module ────

test("cross-domain insights declare all the modules they surface", () => {
  // team_insights = attendance + leave; executive_summary = attendance + leave + payroll.
  // The orchestrator checks each of these via userHasAccess, so a revoke on ANY
  // one must block the whole response.
  assert.deepEqual([...INTENT_REQUIRED_MODULES.team_insights].sort(), ["attendance", "leave"]);
  assert.deepEqual(
    [...INTENT_REQUIRED_MODULES.executive_summary].sort(),
    ["attendance", "leave", "payroll"],
  );
});

// ── Intent detection (self) ───────────────────────────────────────────────────

test("detects self analytics intents (English + Hindi)", () => {
  assert.equal(detectIntent("explain my attendance")?.intent, "explain_my_attendance");
  assert.equal(detectIntent("analyze my leave")?.intent, "explain_my_leave");
  assert.equal(detectIntent("explain my payslip")?.intent, "explain_my_payslip");
  assert.equal(detectIntent("meri haaziri samjhao")?.intent, "explain_my_attendance");
});

test("self analytics intents carry scope self + module self", () => {
  const d = detectIntent("explain my attendance");
  assert.equal(d?.scope, "self");
  assert.equal(d?.module, "self");
});

// ── Intent detection (admin) ──────────────────────────────────────────────────

test("detects admin analytics intents", () => {
  assert.equal(detectIntent("show attendance insights")?.intent, "attendance_insights");
  assert.equal(detectIntent("leave analysis for the company")?.intent, "leave_insights");
  assert.equal(detectIntent("give me a team briefing")?.intent, "team_insights");
  // "my team ..." must still route to team_insights (no false !my guard).
  assert.equal(detectIntent("my team update")?.intent, "team_insights");
  assert.equal(detectIntent("how is my team")?.intent, "team_insights");
  assert.equal(detectIntent("executive summary")?.intent, "executive_summary");
  assert.equal(detectIntent("company health overview for leadership")?.intent, "executive_summary");
});

test("admin attendance/leave insights require the absence of 'my'", () => {
  // "my" must route to the self intent, never the company-wide admin one.
  assert.equal(detectIntent("explain my attendance")?.intent, "explain_my_attendance");
  assert.notEqual(detectIntent("explain my attendance")?.intent, "attendance_insights");
});

// ── RBAC gate ─────────────────────────────────────────────────────────────────

function actor(role: string, opts: { companyId?: string | null; employeeId?: string | null } = {}) {
  return buildActor({
    userId: "u1",
    role,
    companyId: opts.companyId === undefined ? "c1" : opts.companyId,
    userName: "Test",
    employeeId: opts.employeeId ?? null,
  });
}

test("self analytics intents need a linked employee", () => {
  const d = detectIntent("explain my attendance")!;
  assert.equal(authorizeIntent(actor("employee", { employeeId: "e1" }), d).ok, true);
  const denied = authorizeIntent(actor("employee", { employeeId: null }), d);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "no_employee_link");
});

test("attendance/leave/team insights allow HR + managers, deny plain employees", () => {
  for (const phrase of ["attendance insights", "leave analysis", "team briefing"]) {
    const d = detectIntent(phrase)!;
    assert.equal(authorizeIntent(actor("manager"), d).ok, true, `${phrase} manager`);
    assert.equal(authorizeIntent(actor("hr_admin"), d).ok, true, `${phrase} hr_admin`);
    assert.equal(authorizeIntent(actor("employee", { employeeId: "e1" }), d).ok, false, `${phrase} employee`);
  }
});

test("executive summary is leadership-only (managers denied)", () => {
  const d = detectIntent("executive summary")!;
  assert.equal(authorizeIntent(actor("company_admin"), d).ok, true);
  assert.equal(authorizeIntent(actor("hr_admin"), d).ok, true);
  assert.equal(authorizeIntent(actor("manager"), d).ok, false);
  assert.equal(authorizeIntent(actor("super_admin"), d).ok, true);
});

test("detects company/department payroll insights (not the self payslip)", () => {
  assert.equal(detectIntent("payroll cost insights")?.intent, "payroll_insights");
  assert.equal(detectIntent("department wise salary cost")?.intent, "payroll_insights");
  assert.equal(detectIntent("analyze payroll cost for the company")?.intent, "payroll_insights");
  // "my payslip" must still route to the self intent, never the admin insight.
  assert.equal(detectIntent("explain my payslip")?.intent, "explain_my_payslip");
  assert.notEqual(detectIntent("explain my payslip")?.intent, "payroll_insights");
});

test("payroll insights surface only the payroll module", () => {
  assert.deepEqual([...INTENT_REQUIRED_MODULES.payroll_insights].sort(), ["payroll"]);
});

test("payroll insights are payroll-privileged only (managers denied)", () => {
  const d = detectIntent("payroll cost insights")!;
  assert.equal(authorizeIntent(actor("company_admin"), d).ok, true);
  assert.equal(authorizeIntent(actor("hr_admin"), d).ok, true);
  assert.equal(authorizeIntent(actor("super_admin"), d).ok, true);
  assert.equal(authorizeIntent(actor("manager"), d).ok, false);
  assert.equal(authorizeIntent(actor("employee", { employeeId: "e1" }), d).ok, false);
});

test("admin analytics intents require a company context", () => {
  const d = detectIntent("attendance insights")!;
  const r = authorizeIntent(actor("hr_admin", { companyId: null }), d);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_company");
});

// ── Graceful, non-fabricating result helpers ──────────────────────────────────

test("noKey / noData / aiError are unavailable and never carry figures", () => {
  const k = noKey("explain attendance");
  assert.equal(k.available, false);
  assert.equal(k.reason, "no_ai_key");
  assert.match(k.message, /API key/i);

  const nd = noData("No attendance records found.");
  assert.equal(nd.available, false);
  assert.equal(nd.reason, "no_data");

  const e = aiError("Could not generate the narrative.");
  assert.equal(e.available, false);
  assert.equal(e.reason, "ai_error");
});
