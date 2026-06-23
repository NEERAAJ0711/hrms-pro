// Phase 2 — Enterprise AI Core Integration: shared types for the intent layer.
// Kept dependency-free (no DB / express imports) so detector, handlers, tests,
// and the orchestrator can all import without circular references.

export type Language = "english" | "hindi";

// The authenticated identity the AI acts on behalf of. Built once per request
// from req.user (+ the linked employee) and threaded through every handler so
// RBAC, company isolation, and ownership are enforced in one place.
export interface AiActor {
  userId: string;
  role: string;
  companyId: string | null;
  userName: string;
  // The employee record linked to this user, when one exists. Self-service
  // intents require it; pure-admin users may not have one.
  employeeId: string | null;
  employeeName: string | null;
  language: Language;
}

// Every HRMS surface the AI may touch. Mirrors the module names used by the
// RBAC layer (userHasAccess) where one exists; "self" marks employee
// self-service intents that need ownership rather than a module grant.
export type AiModule =
  | "employees"
  | "attendance"
  | "leave"
  | "payroll"
  | "recruitment"
  | "settings"
  | "masters"
  | "self";

// What a handler intends to do — read-only lookups vs. state changes. Action
// intents (approve/reject) get the strictest checks + audit emphasis.
export type AiActionKind = "read" | "action";

// A single recognized intent + any parameters the detector pulled from the
// message (employee name, mobile, PAN, etc.). Parameters are best-effort; a
// handler validates what it actually needs.
export interface DetectedIntent {
  intent: string;
  module: AiModule;
  kind: AiActionKind;
  // "self" → employee asking about their own data; "admin" → company-wide.
  scope: "self" | "admin";
  params: Record<string, string>;
  // Confidence is coarse (1 = explicit keyword match). The orchestrator only
  // acts on detected intents; everything else falls through to the LLM chat.
  confidence: number;
}

// The result a handler returns. `text` is the user-facing, masked, bilingual
// reply. `dataFound` distinguishes "here is your data" from an honest "no
// records" so the orchestrator/audit can tell them apart.
export interface IntentResult {
  text: string;
  success: boolean;
  dataFound: boolean;
}

// What the orchestrator returns to the route. `handled` is false when no intent
// matched and the caller should fall back to the existing LLM chat reply.
export interface AiQueryResult {
  handled: boolean;
  text: string | null;
  intent: string | null;
  module: AiModule | null;
  success: boolean;
  dataFound: boolean;
}
