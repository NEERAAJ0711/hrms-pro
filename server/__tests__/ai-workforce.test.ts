// Phase 6 — pure-function checks for the Workforce decision-support engines.
// Every engine is fed synthetic WorkforceSignals (no DB / network) and we assert
// the DETERMINISTIC facts: scoring, categories, dedupe, ordering, confidence,
// and graceful no-data handling. Also covers Phase 6 intent detection and the
// strategic-topic classifier, plus RBAC role allowlists.
// Run with:  node_modules/.bin/tsx --test server/__tests__/ai-workforce.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import type { EmployeeSignal, WorkforceSignals } from "../ai/workforce/signals";
import { computePerformance } from "../ai/workforce/performance";
import { computePromotion } from "../ai/workforce/promotion";
import { computeIncrement } from "../ai/workforce/increment";
import { computeAttrition } from "../ai/workforce/attrition";
import { computeSuccession } from "../ai/workforce/succession";
import { computeLearning } from "../ai/workforce/learning";
import { computeOrgHealth } from "../ai/workforce/health";
import { computeLeadershipReport } from "../ai/workforce/executive";
import { classifyStrategicTopic, strategyTopicModules, STRATEGY_TOPIC_MODULES } from "../ai/workforce/copilot";
import { INTENT_REQUIRED_MODULES } from "../ai/intents/context";
import {
  confidenceFrom,
  completenessOf,
  score100,
  band,
} from "../ai/decision/types";
import { detectIntent } from "../ai/intents/detector";

// ── Synthetic signal builders ────────────────────────────────────────────────

function emp(over: Partial<EmployeeSignal> = {}): EmployeeSignal {
  // Spread AFTER defaults so explicit `null`/`0`/`false` overrides are respected
  // (a `??`-based builder would wrongly replace an explicit null with the default).
  return {
    employeeId: "e1",
    name: "Test Person",
    department: "Engineering",
    designation: "Engineer",
    status: "active",
    isManager: false,
    hasManager: true,
    tenureMonths: 24,
    grossSalary: 50000,
    attendanceRatePct: 95,
    attendanceRatePrevPct: 95,
    attendanceTrendPct: 0,
    absencesCurrent: 0,
    lateCurrent: 0,
    otHoursCurrent: 0,
    leaveDaysYtd: 4,
    leavePending: 0,
    performanceScore: 80,
    performancePrevScore: 75,
    performanceTrend: 5,
    reviewsCount: 3,
    ...over,
  };
}

function signalsFrom(employees: EmployeeSignal[]): WorkforceSignals {
  const byDept = new Map<string, EmployeeSignal[]>();
  for (const e of employees) {
    const arr = byDept.get(e.department) ?? [];
    arr.push(e);
    byDept.set(e.department, arr);
  }
  const departments = Array.from(byDept.entries()).map(([department, members]) => {
    const perfs = members.map((m) => m.performanceScore).filter((v): v is number => v != null);
    const atts = members.map((m) => m.attendanceRatePct).filter((v): v is number => v != null);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      department,
      headcount: members.length,
      avgPerformance: avg(perfs),
      avgAttendanceRatePct: avg(atts),
      totalGrossMonthly: members.reduce((a, m) => a + (m.grossSalary ?? 0), 0),
      withPerformance: perfs.length,
    };
  });
  return {
    period: { month: 6, year: 2026, label: "June 2026" },
    headcount: employees.length,
    employees,
    departments,
    coverage: {
      employees: employees.length,
      withPerformance: employees.filter((e) => e.performanceScore != null).length,
      withAttendance: employees.filter((e) => e.attendanceRatePct != null).length,
      withSalary: employees.filter((e) => e.grossSalary != null).length,
      withTenure: employees.filter((e) => e.tenureMonths != null).length,
    },
  };
}

// ── Decision-framework helpers ────────────────────────────────────────────────

test("confidenceFrom buckets completeness into low/medium/high", () => {
  assert.equal(confidenceFrom(0.9), "high");
  assert.equal(confidenceFrom(0.5), "medium");
  assert.equal(confidenceFrom(0.1), "low");
});

test("completenessOf is the fraction of present flags", () => {
  assert.equal(completenessOf([true, true, false, false]), 0.5);
  assert.equal(completenessOf([]), 0);
});

test("score100 clamps and rounds; band buckets a score", () => {
  assert.equal(score100(120), 100);
  assert.equal(score100(-5), 0);
  assert.equal(score100(72.6), 73);
  assert.equal(band(20), "low");
  assert.equal(band(60), "medium");
  assert.equal(band(90), "high");
});

// ── Performance ───────────────────────────────────────────────────────────────

test("performance categorizes top vs needs-improvement and sorts by score", () => {
  const facts = computePerformance(
    signalsFrom([
      emp({ employeeId: "a", name: "Ace", performanceScore: 92 }),
      emp({ employeeId: "b", name: "Beth", performanceScore: 45 }),
    ]),
  );
  assert.equal(facts.engine.length > 0, true);
  // Highest score first.
  assert.equal(facts.decisions[0].subject, "Ace");
  assert.equal(facts.decisions[0].category, "top");
  const beth = facts.decisions.find((d) => d.subject === "Beth")!;
  assert.equal(beth.category, "needs_improvement");
  assert.equal(beth.alternatives.length > 0, true); // suggests a check-in
});

test("performance skips employees with no review and flags no-data", () => {
  const facts = computePerformance(
    signalsFrom([emp({ performanceScore: null, reviewsCount: 0 })]),
  );
  assert.equal(facts.decisions.length, 0);
  assert.equal(facts.anomalies.some((a) => a.code === "no_reviews"), true);
});

// ── Promotion ─────────────────────────────────────────────────────────────────

test("promotion rates a strong tenured performer higher than a weak junior", () => {
  const facts = computePromotion(
    signalsFrom([
      emp({ employeeId: "s", name: "Senior", performanceScore: 90, tenureMonths: 48, attendanceRatePct: 98 }),
      emp({ employeeId: "j", name: "Junior", performanceScore: 50, tenureMonths: 3, attendanceRatePct: 80 }),
    ]),
  );
  const senior = facts.decisions.find((d) => d.subject === "Senior")!;
  const junior = facts.decisions.find((d) => d.subject === "Junior")!;
  assert.equal((senior.score ?? 0) > (junior.score ?? 0), true);
});

// ── Increment ─────────────────────────────────────────────────────────────────

test("increment produces a justified suggestion for a top performer", () => {
  const facts = computeIncrement(
    signalsFrom([emp({ name: "Star", performanceScore: 95, grossSalary: 60000 })]),
  );
  assert.equal(facts.decisions.length, 1);
  const d = facts.decisions[0];
  assert.equal(d.reasons.length > 0, true);
  assert.equal(Object.keys(d.supportingData).length > 0, true);
});

// ── Attrition ─────────────────────────────────────────────────────────────────

test("attrition flags high risk for falling attendance + declining performance", () => {
  const facts = computeAttrition(
    signalsFrom([
      emp({
        employeeId: "r", name: "Risky",
        attendanceRatePct: 60, attendanceRatePrevPct: 90, attendanceTrendPct: -30,
        performanceScore: 45, performancePrevScore: 70, performanceTrend: -25,
        leaveDaysYtd: 25,
      }),
      emp({ employeeId: "h", name: "Happy", attendanceRatePct: 98, performanceScore: 88, performanceTrend: 6 }),
    ]),
  );
  const risky = facts.decisions.find((d) => d.subject === "Risky")!;
  const happy = facts.decisions.find((d) => d.subject === "Happy");
  assert.ok(risky, "expected a decision for the at-risk employee");
  assert.equal(risky.reasons.length > 0, true);
  // The clearly at-risk employee must score above the healthy one (if the
  // engine emits a low-risk decision at all) and rank ahead of them.
  if (happy) assert.equal((risky.score ?? 0) > (happy.score ?? 0), true);
  assert.equal(facts.decisions[0].subject, "Risky"); // highest risk first
});

// ── Succession ────────────────────────────────────────────────────────────────

test("succession surfaces high-potential candidates without throwing on empty", () => {
  const facts = computeSuccession(
    signalsFrom([
      emp({ employeeId: "m", name: "Mgr", isManager: true, designation: "Engineering Manager", performanceScore: 88, tenureMonths: 60 }),
      emp({ employeeId: "p", name: "Potential", performanceScore: 86, tenureMonths: 36 }),
    ]),
  );
  assert.equal(Array.isArray(facts.decisions), true);
  // Empty org must not throw and yields no candidates.
  const empty = computeSuccession(signalsFrom([]));
  assert.equal(empty.decisions.length, 0);
});

// ── Learning ──────────────────────────────────────────────────────────────────

test("learning recommends development for a low performer", () => {
  const facts = computeLearning(
    signalsFrom([emp({ name: "Learner", performanceScore: 40, performanceTrend: -10 })]),
  );
  assert.equal(facts.decisions.length >= 1, true);
  assert.equal(facts.decisions[0].alternatives.length > 0 || facts.decisions[0].reasons.length > 0, true);
});

// ── Org health ────────────────────────────────────────────────────────────────

test("org-health scores a weak department lower and lists weakest first", () => {
  const facts = computeOrgHealth(
    signalsFrom([
      emp({ employeeId: "g1", name: "G1", department: "Good", attendanceRatePct: 97, performanceScore: 90 }),
      emp({ employeeId: "g2", name: "G2", department: "Good", attendanceRatePct: 96, performanceScore: 88 }),
      emp({ employeeId: "w1", name: "W1", department: "Weak", attendanceRatePct: 65, performanceScore: 45 }),
      emp({ employeeId: "w2", name: "W2", department: "Weak", attendanceRatePct: 60, performanceScore: 40 }),
    ]),
  );
  const weakIdx = facts.decisions.findIndex((d) => d.subject === "Weak");
  const goodIdx = facts.decisions.findIndex((d) => d.subject === "Good");
  const weak = facts.decisions[weakIdx];
  const good = facts.decisions[goodIdx];
  assert.ok(weak && good, "expected a health decision per department");
  assert.equal((weak.score ?? 100) < (good.score ?? 0), true);
  // Among departments, the weakest is surfaced before the healthy one.
  assert.equal(weakIdx < goodIdx, true);
});

// ── Executive / leadership ────────────────────────────────────────────────────

test("leadership report composes a company-scoped read without throwing", () => {
  const facts = computeLeadershipReport(
    signalsFrom([
      emp({ employeeId: "a", name: "A", performanceScore: 80 }),
      emp({ employeeId: "b", name: "B", department: "Sales", performanceScore: 60, attendanceRatePct: 70 }),
    ]),
  );
  assert.equal(facts.engine.length > 0, true);
  assert.equal(Array.isArray(facts.decisions), true);
});

// ── No-data graceful handling across engines ──────────────────────────────────

test("every engine handles an empty workforce without throwing", () => {
  const empty = signalsFrom([]);
  assert.doesNotThrow(() => computePerformance(empty));
  assert.doesNotThrow(() => computePromotion(empty));
  assert.doesNotThrow(() => computeIncrement(empty));
  assert.doesNotThrow(() => computeAttrition(empty));
  assert.doesNotThrow(() => computeSuccession(empty));
  assert.doesNotThrow(() => computeLearning(empty));
  assert.doesNotThrow(() => computeOrgHealth(empty));
  assert.doesNotThrow(() => computeLeadershipReport(empty));
});

// ── Decisions are unique per subject (no duplicates) ──────────────────────────

test("performance emits exactly one decision per employee (no dupes)", () => {
  const facts = computePerformance(
    signalsFrom([
      emp({ employeeId: "a", name: "A", performanceScore: 80 }),
      emp({ employeeId: "b", name: "B", performanceScore: 70 }),
      emp({ employeeId: "c", name: "C", performanceScore: 60 }),
    ]),
  );
  const ids = facts.decisions.map((d) => d.subjectId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 3);
});

// ── Strategic-topic classifier ────────────────────────────────────────────────

test("classifyStrategicTopic routes strategy questions to the right topic", () => {
  assert.equal(classifyStrategicTopic("what should I do about attrition?"), "attrition");
  assert.equal(classifyStrategicTopic("who is ready for promotion"), "promotion");
  assert.equal(classifyStrategicTopic("salary hike planning"), "increment");
  assert.equal(classifyStrategicTopic("leadership pipeline / succession"), "succession");
  assert.equal(classifyStrategicTopic("upskilling and training needs"), "learning");
  assert.equal(classifyStrategicTopic("internal mobility for open roles"), "mobility");
  assert.equal(classifyStrategicTopic("organizational health"), "org_health");
  // Unmatched defaults to a leadership overview.
  assert.equal(classifyStrategicTopic("tell me about the workforce"), "leadership");
});

// ── Phase 6 intent detection (admin decision-support) ─────────────────────────

test("detects Phase 6 workforce decision-support intents", () => {
  assert.equal(detectIntent("who are the top performers")?.intent, "performance_intelligence");
  assert.equal(detectIntent("salary increment recommendations")?.intent, "increment_intelligence");
  assert.equal(detectIntent("who is ready for promotion")?.intent, "promotion_readiness");
  assert.equal(detectIntent("which employees are a flight risk")?.intent, "attrition_risk");
  assert.equal(detectIntent("succession plan for managers")?.intent, "succession_planning");
  assert.equal(detectIntent("training needs and skill gaps")?.intent, "learning_development");
  assert.equal(detectIntent("internal mobility candidates")?.intent, "internal_mobility");
  assert.equal(detectIntent("department health score")?.intent, "org_health");
  assert.equal(detectIntent("leadership report on workforce strategy")?.intent, "leadership_report");
});

test("explicit copilot framing wins over a topic keyword", () => {
  assert.equal(detectIntent("hr copilot what should i do about attrition")?.intent, "hr_copilot");
  assert.equal(detectIntent("copilot, help me decide on promotions")?.intent, "hr_copilot");
});

test("Phase 6 admin intents never hijack employee self-service or Phase 1–5", () => {
  assert.equal(detectIntent("show my attendance")?.intent, "my_attendance");
  assert.equal(detectIntent("my latest payslip")?.intent, "my_payslip");
  assert.equal(detectIntent("my performance review")?.intent, "my_appraisal");
  assert.equal(detectIntent("company health summary")?.intent, "executive_summary");
});

test("possessive 'my top performers' is an admin performance ask, not self appraisal", () => {
  assert.equal(detectIntent("who are my top performers this quarter")?.intent, "performance_intelligence");
});

// ── RBAC role allowlists on Phase 6 intents ───────────────────────────────────

test("Phase 6 decision intents are scoped to admin (not employee)", () => {
  for (const q of [
    "top performers",
    "salary increment recommendations",
    "who is ready for promotion",
    "attrition risk",
    "succession plan",
    "leadership report",
  ]) {
    const det = detectIntent(q);
    assert.equal(det?.scope, "admin", `expected admin scope for "${q}"`);
  }
});

// ── Topic-aware copilot RBAC (privilege-escalation guard) ─────────────────────

test("copilot increment topic requires payroll module (not just attendance/leave)", () => {
  const topic = classifyStrategicTopic("plan salary increments for the team");
  assert.equal(topic, "increment");
  assert.deepEqual(strategyTopicModules(topic), ["payroll"]);
});

test("copilot mobility topic requires recruitment + employees modules", () => {
  const topic = classifyStrategicTopic("internal mobility for open roles");
  assert.equal(topic, "mobility");
  const mods = strategyTopicModules(topic);
  assert.ok(mods.includes("recruitment"), "mobility must require recruitment");
  assert.ok(mods.includes("employees"), "mobility must require employees");
});

test("every strategy topic maps to at least one module (fail-closed gate)", () => {
  for (const topic of Object.keys(STRATEGY_TOPIC_MODULES) as Array<keyof typeof STRATEGY_TOPIC_MODULES>) {
    assert.ok(STRATEGY_TOPIC_MODULES[topic].length > 0, `topic ${topic} must gate on a module`);
  }
  // Unknown/default still gates on something rather than nothing.
  assert.ok(strategyTopicModules("totally_unknown" as any).length > 0);
});

test("internal_mobility intent gate requires both employees and recruitment", () => {
  const mods = INTENT_REQUIRED_MODULES["internal_mobility"];
  assert.ok(Array.isArray(mods), "internal_mobility must have a composite module gate");
  assert.ok(mods.includes("employees"));
  assert.ok(mods.includes("recruitment"));
});

test("leadership/executive gate requires employees (composes named individuals)", () => {
  // Topic map and intent gate must agree: the briefing reads employee-derived data.
  assert.ok(strategyTopicModules("leadership").includes("employees"));
  const mods = INTENT_REQUIRED_MODULES["leadership_report"];
  assert.ok(Array.isArray(mods), "leadership_report must have a composite module gate");
  assert.ok(mods.includes("employees"), "leadership must require employees");
  assert.ok(mods.includes("attendance") && mods.includes("leave"));
});
