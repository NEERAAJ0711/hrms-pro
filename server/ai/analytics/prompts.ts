import { registerPrompt } from "../prompts/registry";

// Phase 4 — Attendance/Leave/Payroll AI prompt builders. All prompt text lives
// here (never inline in business logic) and is registered centrally so it can be
// audited. Every prompt is fed already-computed FACTS (JSON) and may only phrase
// them — it must never invent or change a number, and must never imply it took
// any action (the AI is read-only; it explains and recommends only).

const NARRATIVE_RULES =
  "You are given FACTS as JSON that were computed from live records. " +
  "Use ONLY the numbers and values present in FACTS. Never invent, estimate, or change any figure. " +
  "You are a read-only assistant: never claim to have made, approved, processed, or changed anything — only explain and recommend. " +
  "Write in clear, simple language for an Indian HR/payroll audience (INR). " +
  'Return ONLY a valid JSON object with keys: "explanation" (string, 2-4 plain sentences), ' +
  '"insights" (string array, 2-5 short observations grounded in the facts), ' +
  '"recommendations" (string array, 1-4 concrete, optional next steps a human can take). ' +
  "If the facts are sparse, return fewer items rather than padding. No prose outside the JSON.";

export function buildAttendanceInsightPrompt(): string {
  return (
    "You explain a team/employee attendance summary to an HR manager. " +
    "Focus on presence, absence, half-days, leave, late arrivals, overtime and any flagged anomalies. " +
    NARRATIVE_RULES
  );
}

export function buildLeaveInsightPrompt(): string {
  return (
    "You explain leave usage and balances to an HR manager. " +
    "Focus on consumption vs. entitlement, leave-type mix, pending approvals, low balances and any flagged anomalies. " +
    NARRATIVE_RULES
  );
}

export function buildPayrollExplainPrompt(): string {
  return (
    "You explain a payroll/payslip breakdown in plain language. " +
    "Walk through earnings, statutory deductions (PF, ESIC, PT, LWF, TDS), loan recovery, LOP/pay-days impact and net pay. " +
    "Explain WHY each deduction applies at a high level, using only the provided figures. " +
    NARRATIVE_RULES
  );
}

export function buildManagerInsightPrompt(): string {
  return (
    "You brief a people manager on their team across attendance, leave and (where present) payroll signals. " +
    "Highlight what needs attention this week and who, grounded strictly in the facts. " +
    NARRATIVE_RULES
  );
}

export function buildExecutiveSummaryPrompt(): string {
  return (
    "You write a concise executive summary for company leadership covering workforce attendance, leave and payroll health. " +
    "Be high-level, neutral and decision-oriented, grounded strictly in the facts. " +
    NARRATIVE_RULES
  );
}

registerPrompt("analytics.attendanceInsight", () => buildAttendanceInsightPrompt());
registerPrompt("analytics.leaveInsight", () => buildLeaveInsightPrompt());
registerPrompt("analytics.payrollExplain", () => buildPayrollExplainPrompt());
registerPrompt("analytics.managerInsight", () => buildManagerInsightPrompt());
registerPrompt("analytics.executiveSummary", () => buildExecutiveSummaryPrompt());
