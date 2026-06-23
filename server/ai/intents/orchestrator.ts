// Phase 2 — orchestrator. Single entry point the chat route calls before the
// LLM. Pipeline: detect → authorize (RBAC) → scope (manager team) → run handler
// → record usage + audit → return. The route falls back to the existing
// generateAiReply ONLY when no intent is detected (`handled: false`). Once an
// intent IS detected we always answer deterministically — a missing handler or
// a handler error returns an explicit message rather than handing the query to
// the LLM, so the "never hallucinate" guarantee holds for recognized intents.

import { recordUsage } from "../metrics/usage";
import { getAllowedEmployeeIdsForUser, userHasAccess } from "../../routes/shared";
import type { Employee } from "@shared/schema";
import type { AiActor, AiQueryResult } from "./types";
import type { EmployeeContext, KycStatus } from "../types";
import { detectIntent } from "./detector";
import { authorizeIntent } from "./context";
import { HANDLERS } from "./registry";
import type { HandlerContext } from "./handlers/shared";
import { t } from "./handlers/shared";

// Intent modules that map 1:1 to a MODULE_ACCESS row, so we can defer to the
// app's real RBAC (`userHasAccess`) and honor per-user permission overrides
// (explicit revokes). Modules without a MODULE_ACCESS row (recruitment, self)
// stay on the explicit role table in authorizeIntent.
const RBAC_COVERED_MODULES = new Set(["employees", "attendance", "leave", "payroll"]);

export interface AssistantQueryInput {
  // The raw authenticated user (for RBAC scoping helpers).
  user: any;
  actor: AiActor;
  message: string;
  // Optional prefetched live self-service data (reused from the route).
  employee?: Employee | null;
  empCtx?: EmployeeContext | null;
  kyc?: KycStatus | null;
}

function notHandled(): AiQueryResult {
  return { handled: false, text: null, intent: null, module: null, success: false, dataFound: false };
}

export async function handleAssistantQuery(input: AssistantQueryInput): Promise<AiQueryResult> {
  const { user, actor, message } = input;

  const detected = detectIntent(message);
  if (!detected) return notHandled();

  const lang = actor.language;
  const started = Date.now();

  // Deterministic reply helper for a recognized intent. Once we know the user's
  // intent we never defer to the LLM — we answer explicitly (success/denied/
  // unavailable) so a recognized query can't be hallucinated.
  const respond = (text: string, opts: { success: boolean; dataFound: boolean; error?: string }): AiQueryResult => {
    recordUsage({
      feature: "hr_chat",
      provider: "rule-based",
      success: opts.success,
      latencyMs: Date.now() - started,
      companyId: actor.companyId,
      employeeId: actor.employeeId,
      userId: actor.userId,
      intent: detected.intent,
      module: detected.module,
      action: detected.kind,
      error: opts.error,
    });
    return { handled: true, text, intent: detected.intent, module: detected.module, success: opts.success, dataFound: opts.dataFound };
  };

  // RBAC / ownership gate — explicit role table first.
  const auth = authorizeIntent(actor, detected);
  if (!auth.ok) {
    const text =
      auth.reason === "no_employee_link"
        ? t(lang, "Your login isn't linked to an employee profile, so I can't show this. Please ask HR to link your account.", "आपका अकाउंट किसी एम्प्लॉयी प्रोफ़ाइल से लिंक नहीं है, इसलिए मैं यह नहीं दिखा सकता। कृपया HR से लिंक करवाएँ।")
        : t(lang, "You don't have permission to access this information.", "आपके पास यह जानकारी देखने की अनुमति नहीं है।");
    return respond(text, { success: false, dataFound: false, error: `denied:${auth.reason}` });
  }

  // Second gate: defer to the app's real RBAC for covered modules so per-user
  // permission overrides (explicit revokes) block the AI path too — closing the
  // privilege-escalation gap vs. the rest of the app. super_admin already passed.
  if (detected.scope === "admin" && actor.role !== "super_admin" && RBAC_COVERED_MODULES.has(detected.module)) {
    let permitted = true;
    try {
      permitted = await userHasAccess(user, detected.module);
    } catch {
      permitted = false; // fail closed
    }
    if (!permitted) {
      const text = t(lang, "You don't have permission to access this information.", "आपके पास यह जानकारी देखने की अनुमति नहीं है।");
      return respond(text, { success: false, dataFound: false, error: "denied:module_revoked" });
    }
  }

  const handler = HANDLERS[detected.intent];
  if (!handler) {
    // Recognized but unimplemented (e.g. cross-company company_wise). Stay
    // deterministic — tell the user plainly instead of falling back to the LLM.
    const text = t(
      lang,
      "I understood your request, but that report isn't available through the assistant yet. Please use the relevant module in the dashboard.",
      "मैं आपका अनुरोध समझ गया, लेकिन यह रिपोर्ट अभी असिस्टेंट से उपलब्ध नहीं है। कृपया डैशबोर्ड के संबंधित मॉड्यूल का उपयोग करें।",
    );
    return respond(text, { success: false, dataFound: false, error: "unimplemented" });
  }

  // Manager / limited-role employee scoping for admin intents (null = all).
  let allowedEmployeeIds: Set<string> | null = null;
  if (detected.scope === "admin") {
    try {
      allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
    } catch {
      allowedEmployeeIds = null;
    }
  }

  const ctx: HandlerContext = {
    actor,
    detected,
    employee: input.employee ?? null,
    empCtx: input.empCtx ?? null,
    kyc: input.kyc ?? null,
    allowedEmployeeIds,
  };

  try {
    const result = await handler(ctx);
    return respond(result.text, { success: result.success, dataFound: result.dataFound });
  } catch (err: any) {
    // Stay deterministic on handler error: report an explicit failure rather
    // than handing a recognized intent to the LLM (which could hallucinate).
    const text = t(
      lang,
      "Sorry, something went wrong while fetching that information. Please try again in a moment.",
      "क्षमा करें, यह जानकारी लाते समय कुछ गड़बड़ हो गई। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    );
    return respond(text, { success: false, dataFound: false, error: String(err?.message || err) });
  }
}
