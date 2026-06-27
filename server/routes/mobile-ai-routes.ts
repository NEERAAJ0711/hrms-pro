// Mobile AI assistant routes.
//
// Exposes the same enterprise AI brain the web app uses (the deterministic,
// RBAC-checked intent layer + LLM fallback) to the Flutter app over JWT auth.
// The intent layer (`handleAssistantQuery`) answers attendance / leave /
// payroll / employee-search / approval questions straight from live DB data;
// anything it doesn't recognize falls back to the HR/compliance LLM co-pilot.

import type { Express, Request, Response } from "express";
import { handleAssistantQuery, buildActor } from "../ai";
import { generateComplianceReply } from "../ai-service";
import { getEmployeeForUser, getOrCreateKycStatus, fetchEmployeeContext } from "../ai-hr-routes";

type ChatHistory = Array<{ role: string; content: string }>;

// Server-side guards so we never trust the client to cap payload size. These
// keep AI token cost / latency bounded regardless of what the app sends.
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_ITEM_CHARS = 4000;

// Normalize + clamp client-supplied chat history into the {role, content} shape
// the LLM helpers expect. Anything malformed is dropped silently.
function sanitizeHistory(raw: unknown): ChatHistory {
  if (!Array.isArray(raw)) return [];
  const cleaned: ChatHistory = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as any).role === "assistant" ? "assistant" : "user";
    const content = String((item as any).content ?? "").trim();
    if (!content) continue;
    cleaned.push({ role, content: content.slice(0, MAX_HISTORY_ITEM_CHARS) });
  }
  return cleaned.slice(-MAX_HISTORY_ITEMS);
}

export function registerMobileAiRoutes(app: Express, requireJwtAuth: any) {
  // ── General AI assistant ───────────────────────────────────────────────────
  // Body: { message, history?: [{role, content}], language?: "english"|"hindi" }
  app.post("/api/mobile/ai/chat", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const message = String(req.body?.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
      if (!message) return res.status(400).json({ error: "message is required" });

      const history = sanitizeHistory(req.body?.history);
      const language = req.body?.language === "hindi" ? "hindi" : "english";
      const companyId: string | null = user.companyId ?? null;

      // Resolve the employee linked to this login (self-service intents need it).
      let employee: any = null;
      try {
        employee = await getEmployeeForUser(user.id, companyId);
      } catch {
        /* non-fatal — admin users may have no employee record */
      }
      const employeeName = employee
        ? `${employee.firstName} ${employee.lastName}`.trim()
        : (user.name || user.username || "User");

      // Live self-service context (attendance / leave / payslip) + KYC, so the
      // intent layer can answer "show my attendance", "my leave balance", etc.
      let empCtx: any = null;
      let kyc: any = null;
      if (employee && companyId) {
        try { empCtx = await fetchEmployeeContext(employee.id, companyId); } catch { /* non-fatal */ }
        try { kyc = await getOrCreateKycStatus(employee.id, companyId); } catch { /* non-fatal */ }
      }

      const actor = buildActor({
        userId: user.id,
        role: user.role,
        companyId,
        userName: user.name || user.username || employeeName,
        employeeId: employee?.id ?? null,
        employeeName,
        language,
      });

      // 1) Deterministic, RBAC-checked intent layer (no hallucination).
      let reply: string | null = null;
      let handled = false;
      let intent: string | null = null;
      let module: string | null = null;
      try {
        const r = await handleAssistantQuery({ user, actor, message, employee, empCtx, kyc });
        if (r.handled && r.text) {
          reply = r.text;
          handled = true;
          intent = r.intent;
          module = r.module;
        }
      } catch {
        /* fall through to LLM */
      }

      // 2) LLM fallback (HR / compliance co-pilot) for open-ended questions.
      if (!reply) {
        reply = await generateComplianceReply(message, history, "both");
      }

      return res.json({ reply, handled, intent, module });
    } catch (err) {
      return res.status(500).json({ error: "AI service error" });
    }
  });

  // ── Compliance co-pilot (stateless EPFO/ESIC Q&A) ──────────────────────────
  // Body: { message, history?: [{role, content}], portal?: "epfo"|"esic"|"both" }
  app.post("/api/mobile/ai/compliance-chat", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const message = String(req.body?.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
      if (!message) return res.status(400).json({ error: "message is required" });
      const history = sanitizeHistory(req.body?.history);
      const portal = ["epfo", "esic", "both"].includes(req.body?.portal) ? req.body.portal : "both";
      const reply = await generateComplianceReply(message, history, portal);
      return res.json({ reply });
    } catch (err) {
      return res.status(500).json({ error: "AI service error" });
    }
  });
}
