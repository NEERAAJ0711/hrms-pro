// HRMS Pro — Phase 6 Workforce decision-support AI routes (additive; read-only).
//
// Every endpoint enforces auth, company isolation, and the same RBAC the rest of
// the app uses (an explicit role allowlist FIRST — fail closed — then
// userHasAccess for per-user revokes, then manager team-scoping via
// allowedEmployeeIds). Responses always include deterministic `facts` (fully
// usable with NO AI key) plus an `ai` narrative envelope that degrades
// gracefully. The AI never produces a figure, score or category, and never
// implies an action was taken — so nothing can be hallucinated.
import type { Express, Request, Response } from "express";
import { requireAuth, userHasAccess, getAllowedEmployeeIdsForUser } from "./shared";
import { currentMonthIST } from "../ai/intents/context";
import {
  computeWorkforceSignals,
  computePerformance, explainPerformance,
  computePromotion, explainPromotion,
  computeIncrement, explainIncrement,
  computeAttrition, explainAttrition,
  computeSuccession, explainSuccession,
  computeLearning, explainLearning,
  computeMobility, explainMobility,
  computeOrgHealth, explainOrgHealth,
  computeLeadershipReport, explainLeadershipReport,
  classifyStrategicTopic, computeStrategyFacts, answerCopilot, strategyTopicModules,
} from "../ai";

function clampMonth(v: any, fallback: number): number {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(12, n));
}

function parseYear(v: any, fallback: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : fallback;
}

function period(req: Request): { month: number; year: number } {
  const now = currentMonthIST();
  return { month: clampMonth(req.query.month, now.month), year: parseYear(req.query.year, now.year) };
}

// Team-scoped decision roles (managers see only their own team via
// allowedEmployeeIds). Salary-sensitive / leadership engines use HR_ROLES.
const WF_ROLES = ["super_admin", "company_admin", "hr_admin", "manager"];
const HR_ROLES = ["super_admin", "company_admin", "hr_admin"];
const REC_ROLES = ["super_admin", "company_admin", "hr_admin", "recruiter"];

export async function registerWorkforceAiRoutes(app: Express): Promise<void> {
  function requireCompany(req: Request, res: Response): string | null {
    const user = (req as any).user;
    if (!user.companyId) {
      res.status(400).json({ error: "No company context for this request." });
      return null;
    }
    return user.companyId as string;
  }

  // Shared gate: role allowlist (fail closed) → module access (honors revokes) →
  // company id + manager team scope. Returns the args every engine needs, or
  // null if the request was already rejected.
  async function gate(
    req: Request,
    res: Response,
    roles: string[],
    modules: string[],
  ): Promise<{ companyId: string; allowedEmployeeIds: Set<string> | null } | null> {
    const user = (req as any).user;
    const companyId = requireCompany(req, res);
    if (!companyId) return null;
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Access denied" });
      return null;
    }
    for (const mod of modules) {
      if (!(await userHasAccess(user, mod))) {
        res.status(403).json({ error: "Access denied" });
        return null;
      }
    }
    const allowedEmployeeIds = user.role === "super_admin" ? null : await getAllowedEmployeeIdsForUser(user);
    return { companyId, allowedEmployeeIds };
  }

  async function signals(req: Request, companyId: string, allowedEmployeeIds: Set<string> | null) {
    const { month, year } = period(req);
    return computeWorkforceSignals({ companyId, allowedEmployeeIds, month, year });
  }

  app.get("/api/ai/workforce/performance", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, WF_ROLES, ["employees"]);
      if (!g) return;
      const facts = computePerformance(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainPerformance(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze performance", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/promotion", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, WF_ROLES, ["employees"]);
      if (!g) return;
      const facts = computePromotion(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainPromotion(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to assess promotion readiness", detail: String(err?.message || err) });
    }
  });

  // Salary-sensitive — payroll-privileged roles + payroll module only.
  app.get("/api/ai/workforce/increment", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, HR_ROLES, ["payroll"]);
      if (!g) return;
      const facts = computeIncrement(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainIncrement(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to compute increment recommendations", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/attrition", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, WF_ROLES, ["attendance", "leave"]);
      if (!g) return;
      const facts = computeAttrition(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainAttrition(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to assess attrition risk", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/succession", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, HR_ROLES, ["employees"]);
      if (!g) return;
      const facts = computeSuccession(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainSuccession(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build succession plan", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/learning", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, WF_ROLES, ["employees"]);
      if (!g) return;
      const facts = computeLearning(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainLearning(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build learning recommendations", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/mobility", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, REC_ROLES, ["employees", "recruitment"]);
      if (!g) return;
      const facts = await computeMobility(await signals(req, g.companyId, g.allowedEmployeeIds), g.companyId);
      const ai = await explainMobility(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to compute internal mobility", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/workforce/org-health", requireAuth, async (req, res) => {
    try {
      const g = await gate(req, res, HR_ROLES, ["attendance", "leave"]);
      if (!g) return;
      const facts = computeOrgHealth(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainOrgHealth(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to compute organizational health", detail: String(err?.message || err) });
    }
  });

  // Executive briefing — leadership only, company-wide.
  app.get("/api/ai/workforce/executive", requireAuth, async (req, res) => {
    try {
      // The briefing composes employee-derived performance/promotion/succession
      // (incl. named individuals), so it must clear `employees` too — not just
      // attendance/leave — to honor a per-user revoke on employee data.
      const g = await gate(req, res, HR_ROLES, ["employees", "attendance", "leave"]);
      if (!g) return;
      const facts = computeLeadershipReport(await signals(req, g.companyId, g.allowedEmployeeIds));
      const ai = await explainLeadershipReport(facts, g.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build executive briefing", detail: String(err?.message || err) });
    }
  });

  // Strategic HR copilot — leadership only (can route to salary-sensitive topics).
  app.post("/api/ai/workforce/copilot", requireAuth, async (req, res) => {
    try {
      const question = String((req.body && req.body.question) || "").trim();
      if (!question) return res.status(400).json({ error: "A 'question' is required." });
      const topic = classifyStrategicTopic(question);
      // Topic-aware RBAC: the copilot can route into payroll (increment) or
      // recruitment (mobility) data, so gate on the modules the chosen topic
      // actually reads — not just attendance/leave — to honor per-user revokes.
      const g = await gate(req, res, HR_ROLES, strategyTopicModules(topic));
      if (!g) return;
      const facts = await computeStrategyFacts(topic, await signals(req, g.companyId, g.allowedEmployeeIds), g.companyId);
      const ai = await answerCopilot(question, facts, g.companyId);
      res.json({ topic, facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to answer strategic question", detail: String(err?.message || err) });
    }
  });
}
