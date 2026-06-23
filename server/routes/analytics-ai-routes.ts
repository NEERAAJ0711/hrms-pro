// HRMS Pro — Phase 4 Attendance/Leave/Payroll AI routes (additive; read-only).
//
// Every endpoint enforces auth, company isolation, and the same RBAC the rest of
// the app uses (userHasAccess + manager team scoping via allowedEmployeeIds).
// Responses always include deterministic `facts` (usable with no AI key) plus an
// `ai` narrative envelope that degrades gracefully. The AI never produces a
// figure, so nothing can be hallucinated.
import type { Express, Request, Response } from "express";
import { employeeService } from "../services";
import { requireAuth, userHasAccess, getAllowedEmployeeIdsForUser } from "./shared";
import { currentMonthIST } from "../ai/intents/context";
import {
  computeAttendanceFacts, explainAttendance,
  computeLeaveFacts, explainLeave,
  computePayrollFacts, explainPayroll,
  computeManagerInsights, explainManagerInsights,
  computeExecutiveSummary, explainExecutiveSummary,
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

// Roles permitted to view company/team analytics. `userHasAccess` alone is NOT
// enough here: MODULE_ACCESS lists `employee` under attendance/leave (so they can
// see their OWN data), which would otherwise let an employee pull company-wide
// aggregates. Gate on these explicit roles first (fail closed), then still honor
// any per-user permission revoke via userHasAccess.
const ANALYTICS_ADMIN_ROLES = ["super_admin", "company_admin", "hr_admin", "manager"];

export async function registerAnalyticsAiRoutes(app: Express): Promise<void> {
  // Resolve the caller's linked employee for self-service endpoints.
  async function selfEmployee(req: Request, res: Response) {
    const user = (req as any).user;
    const emp = await employeeService.getEmployeeByUserId(user.id);
    if (!emp) {
      res.status(404).json({ error: "Your login isn't linked to an employee profile." });
      return null;
    }
    return emp as any;
  }

  // Require a company context for company-scoped aggregates.
  function requireCompany(req: Request, res: Response): string | null {
    const user = (req as any).user;
    if (!user.companyId) {
      res.status(400).json({ error: "No company context for this request." });
      return null;
    }
    return user.companyId as string;
  }

  // ── Self-service ───────────────────────────────────────────────────────────
  app.get("/api/ai/me/attendance", requireAuth, async (req, res) => {
    try {
      const emp = await selfEmployee(req, res);
      if (!emp) return;
      const { month, year } = period(req);
      const facts = await computeAttendanceFacts({ companyId: emp.companyId, employeeId: emp.id, month, year });
      const ai = await explainAttendance(facts, emp.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze attendance", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/me/leave", requireAuth, async (req, res) => {
    try {
      const emp = await selfEmployee(req, res);
      if (!emp) return;
      const { year } = period(req);
      const facts = await computeLeaveFacts({ companyId: emp.companyId, employeeId: emp.id, year });
      const ai = await explainLeave(facts, emp.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze leave", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/me/payslip", requireAuth, async (req, res) => {
    try {
      const emp = await selfEmployee(req, res);
      if (!emp) return;
      const month = req.query.month ? String(req.query.month) : null;
      const year = req.query.year ? parseYear(req.query.year, currentMonthIST().year) : null;
      const facts = await computePayrollFacts({ companyId: emp.companyId, employeeId: emp.id, month, year });
      const ai = await explainPayroll(facts, emp.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to explain payslip", detail: String(err?.message || err) });
    }
  });

  // ── Admin / manager ────────────────────────────────────────────────────────
  app.get("/api/ai/attendance/insights", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = requireCompany(req, res);
      if (!companyId) return;
      if (!ANALYTICS_ADMIN_ROLES.includes(user.role)) return res.status(403).json({ error: "Access denied" });
      if (!(await userHasAccess(user, "attendance"))) return res.status(403).json({ error: "Access denied" });
      const allowedEmployeeIds = user.role === "super_admin" ? null : await getAllowedEmployeeIdsForUser(user);
      const { month, year } = period(req);
      const facts = await computeAttendanceFacts({ companyId, allowedEmployeeIds, month, year });
      const ai = await explainAttendance(facts, companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze attendance", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/leave/insights", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = requireCompany(req, res);
      if (!companyId) return;
      if (!ANALYTICS_ADMIN_ROLES.includes(user.role)) return res.status(403).json({ error: "Access denied" });
      if (!(await userHasAccess(user, "leave"))) return res.status(403).json({ error: "Access denied" });
      const allowedEmployeeIds = user.role === "super_admin" ? null : await getAllowedEmployeeIdsForUser(user);
      const { year } = period(req);
      const facts = await computeLeaveFacts({ companyId, allowedEmployeeIds, year });
      const ai = await explainLeave(facts, companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze leave", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/insights/team", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = requireCompany(req, res);
      if (!companyId) return;
      if (!ANALYTICS_ADMIN_ROLES.includes(user.role)) return res.status(403).json({ error: "Access denied" });
      if (!(await userHasAccess(user, "attendance"))) return res.status(403).json({ error: "Access denied" });
      const allowedEmployeeIds = user.role === "super_admin" ? null : await getAllowedEmployeeIdsForUser(user);
      const { month, year } = period(req);
      const facts = await computeManagerInsights({ companyId, allowedEmployeeIds, month, year });
      const ai = await explainManagerInsights(facts, companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build team insights", detail: String(err?.message || err) });
    }
  });

  app.get("/api/ai/insights/executive", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = requireCompany(req, res);
      if (!companyId) return;
      // Company-wide leadership view — payroll-privileged roles only.
      const allowed = ["super_admin", "company_admin", "hr_admin"];
      if (!allowed.includes(user.role)) return res.status(403).json({ error: "Access denied" });
      const { month, year } = period(req);
      const facts = await computeExecutiveSummary({ companyId, month, year });
      const ai = await explainExecutiveSummary(facts, companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build executive summary", detail: String(err?.message || err) });
    }
  });

  // Payroll explanation for a specific employee — owner OR payroll-privileged.
  app.get("/api/ai/payroll/explain/:employeeId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employeeId = String(req.params.employeeId);
      const emp = await employeeService.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      // Company isolation.
      if (user.role !== "super_admin" && emp.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const linked = await employeeService.getEmployeeByUserId(user.id);
      const isOwner = !!linked && linked.id === employeeId;
      if (!isOwner && !(await userHasAccess(user, "payroll"))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const month = req.query.month ? String(req.query.month) : null;
      const year = req.query.year ? parseYear(req.query.year, currentMonthIST().year) : null;
      const facts = await computePayrollFacts({ companyId: emp.companyId, employeeId, month, year });
      const ai = await explainPayroll(facts, emp.companyId);
      res.json({ facts, ai });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to explain payroll", detail: String(err?.message || err) });
    }
  });
}
