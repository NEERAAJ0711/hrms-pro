// Phase 2 — context engine + authorization for the AI intent layer.
//
// Builds the AiActor (identity threaded through every handler) and centralizes
// RBAC for detected intents. Self-service intents require a linked employee +
// ownership (enforced in handlers); admin intents require the right role/module
// access. Authorization reuses the existing userHasAccess RBAC helper where the
// module maps cleanly, and an explicit allowed-roles table elsewhere so we never
// silently widen access.

import type { AiActor, DetectedIntent, Language } from "./types";

export function normalizeLanguage(lang: string | null | undefined): Language {
  return String(lang || "").toLowerCase().startsWith("hi") || String(lang).toLowerCase() === "hindi"
    ? "hindi"
    : "english";
}

// "Today" in India (the app stores attendance/holiday dates as IST YYYY-MM-DD).
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentMonthIST(): { month: number; year: number; monthName: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const month = Number(parts.find((p) => p.type === "month")?.value || "1");
  const year = Number(parts.find((p) => p.type === "year")?.value || "1970");
  const monthName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "long" }).format(new Date());
  return { month, year, monthName };
}

export interface BuildActorInput {
  userId: string;
  role: string;
  companyId: string | null;
  userName: string;
  employeeId?: string | null;
  employeeName?: string | null;
  language?: string | null;
}

export function buildActor(input: BuildActorInput): AiActor {
  return {
    userId: input.userId,
    role: input.role,
    companyId: input.companyId ?? null,
    userName: input.userName || "User",
    employeeId: input.employeeId ?? null,
    employeeName: input.employeeName ?? null,
    language: normalizeLanguage(input.language),
  };
}

// Roles allowed for each admin intent (super_admin always allowed). Mirrors the
// spirit of MODULE_ACCESS but is explicit so recruitment/exit intents (which
// have no MODULE_ACCESS row) don't accidentally fail closed for HR.
const HR = ["company_admin", "hr_admin"];
const HR_MGR = ["company_admin", "hr_admin", "manager"];
const HR_REC = ["company_admin", "hr_admin", "recruiter"];

const ADMIN_INTENT_ROLES: Record<string, string[]> = {
  approve_leave: HR_MGR,
  reject_leave: HR_MGR,
  find_employee: HR_MGR,
  absentees_today: HR_MGR,
  late_employees: HR_MGR,
  on_leave_today: HR_MGR,
  attendance_summary: HR_MGR,
  missing_kyc: HR,
  expiring_documents: HR,
  probation_ending: HR_MGR,
  contract_expiry: HR_MGR,
  birthdays_today: HR_MGR,
  anniversaries_today: HR_MGR,
  department_strength: HR_MGR,
  gender_ratio: HR_MGR,
  location_wise: HR_MGR,
  company_wise: [], // super_admin only (cross-company)
  employee_count: HR_MGR,
  recruitment_status: HR_REC,
  recruitment_dashboard: HR_REC,
  candidate_search: HR_REC,
  pending_interviews: HR_REC,
  pending_approvals: HR_MGR,
  pending_onboarding: HR,
  pending_resignations: HR,
  pending_payroll: HR,
  quick_summary: HR_MGR,
  // Phase 4 — AI analytics. Self intents (explain_my_*) need no row (scope self).
  attendance_insights: HR_MGR,
  leave_insights: HR_MGR,
  team_insights: HR_MGR,
  payroll_insights: HR, // payroll-privileged only (company_admin/hr_admin + super)
  executive_summary: HR, // leadership-level, company-wide
};

// Cross-domain admin intents whose RESPONSE composes data from more than one
// module. The orchestrator must verify the caller has module access to EVERY
// listed module (honoring per-user revokes), not just the intent's primary
// `module`. Without this, e.g. a user with attendance access but a revoked leave
// permission could still read leave aggregates via team_insights. Intents not
// listed here fall back to a single-module check on `detected.module`.
export const INTENT_REQUIRED_MODULES: Record<string, string[]> = {
  team_insights: ["attendance", "leave"], // computeManagerInsights = attendance + leave
  payroll_insights: ["payroll"], // company/department payroll aggregates
  executive_summary: ["attendance", "leave", "payroll"], // company-wide incl. payroll totals
};

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Authorize a detected intent for an actor. Self intents only need a linked
 * employee; admin intents need an allowed role (super_admin always passes).
 */
export function authorizeIntent(actor: AiActor, detected: DetectedIntent): AuthResult {
  if (actor.role === "super_admin") return { ok: true };

  if (detected.scope === "self") {
    if (!actor.employeeId) {
      return { ok: false, reason: "no_employee_link" };
    }
    return { ok: true };
  }

  // Admin scope — must have a company and an allowed role.
  if (!actor.companyId) return { ok: false, reason: "no_company" };
  const allowed = ADMIN_INTENT_ROLES[detected.intent] ?? HR;
  if (!allowed.includes(actor.role)) return { ok: false, reason: "role_denied" };
  return { ok: true };
}
