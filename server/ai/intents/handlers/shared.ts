// Phase 2 — shared handler plumbing: the HandlerContext passed to every intent
// handler and small bilingual / formatting helpers used across handlers.

import type { Employee } from "@shared/schema";
import type { AiActor, DetectedIntent, IntentResult, Language } from "../types";
import type { EmployeeContext, KycStatus } from "../../types";

export interface HandlerContext {
  actor: AiActor;
  detected: DetectedIntent;
  // Prefetched live self-service data (assembled once by the route, reused here
  // so we never re-query or duplicate the EmployeeContext build logic).
  employee?: Employee | null;
  empCtx?: EmployeeContext | null;
  kyc?: KycStatus | null;
  // Employee-id scope for managers/limited roles (null = all employees in the
  // company). Computed once via getAllowedEmployeeIdsForUser and applied by
  // admin handlers so a manager only ever sees their own team's data.
  allowedEmployeeIds?: Set<string> | null;
}

export type IntentHandler = (ctx: HandlerContext) => Promise<IntentResult>;

/** Pick the right language string. */
export function t(lang: Language, en: string, hi: string): string {
  return lang === "hindi" ? hi : en;
}

export function ok(text: string, dataFound = true): IntentResult {
  return { text, success: true, dataFound };
}

export function fail(text: string): IntentResult {
  return { text, success: false, dataFound: false };
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

export function fullName(e: { firstName?: string | null; lastName?: string | null }): string {
  return `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee";
}

// Friendly "no data" reply — used everywhere instead of fabricating an answer.
export function noData(lang: Language, enWhat: string, hiWhat: string): IntentResult {
  return {
    text: t(
      lang,
      `I checked your records and there is no ${enWhat} on file right now.`,
      `मैंने आपका रिकॉर्ड देखा — अभी ${hiWhat} उपलब्ध नहीं है।`,
    ),
    success: true,
    dataFound: false,
  };
}
