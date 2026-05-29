/**
 * EPFO & ESIC API Routes — Task #3
 *
 * Covers:
 *   - Automation job management (list, get+logs, retry, cancel)
 *   - Portal session management (upsert credentials, test login)
 *   - EPFO: registrations, KYC, ECR returns, challans
 *   - ESIC: registrations, monthly returns, challans
 *   - Compliance calendar (CRUD + auto-generate upcoming events)
 *   - Reports: EPFO ECR Excel, ESIC contribution Excel
 */

import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  automationJobs,
  automationLogs,
  portalSessions,
  epfoRegistrations,
  epfoKycRecords,
  epfoEcrReturns,
  esicRegistrations,
  esicMonthlyReturns,
  challans,
  complianceCalendarEvents,
  employees,
  payroll,
  statutorySettings,
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { queueService } from "./queue-service";
import { portalSessionService } from "./portal-session-service";
import * as XLSX from "xlsx";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthIndex(name: string): number {
  return MONTH_NAMES.findIndex(m => m.toLowerCase() === name.toLowerCase());
}

/** ECR due on 15th of next month; ESIC due on 21st of next month */
function calcDueDate(month: string, year: number, portal: "epfo" | "esic"): string {
  const idx = monthIndex(month);
  const day = portal === "epfo" ? 15 : 21;
  const nextMonthDate = new Date(year, idx + 1, day);
  return nextMonthDate.toISOString().slice(0, 10);
}

/** Returns the company the caller may act on, or throws a 403-payload object */
function resolveCompanyId(
  user: { role: string; companyId?: string | null },
  requestedCompanyId?: string
): string {
  if (user.role === "super_admin") {
    if (!requestedCompanyId) throw { status: 400, error: "companyId is required for super_admin" };
    return requestedCompanyId;
  }
  if (!user.companyId) throw { status: 403, error: "User has no company assigned" };
  return user.companyId;
}

function isForbidden(user: { role: string; companyId?: string | null }, jobCompanyId: string): boolean {
  return user.role !== "super_admin" && user.companyId !== jobCompanyId;
}

// ─── Compliance calendar: seed N months of upcoming events ───────────────────

async function ensureComplianceEvents(companyId: string, months = 6): Promise<void> {
  const now = new Date();
  const events: typeof complianceCalendarEvents.$inferInsert[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    // EPFO ECR due
    const epfoDue = calcDueDate(month, year, "epfo");
    const esicDue = calcDueDate(month, year, "esic");
    const nowStr = new Date().toISOString();

    events.push({
      id: randomUUID(),
      companyId,
      eventType: "epfo_ecr_due",
      title: `EPFO ECR — ${month} ${year}`,
      description: `Monthly ECR filing due for ${month} ${year}`,
      dueDate: epfoDue,
      periodMonth: month,
      periodYear: year,
      status: new Date(epfoDue) < now ? "overdue" : "upcoming",
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    events.push({
      id: randomUUID(),
      companyId,
      eventType: "esic_return_due",
      title: `ESIC Return — ${month} ${year}`,
      description: `Monthly ESIC contribution return due for ${month} ${year}`,
      dueDate: esicDue,
      periodMonth: month,
      periodYear: year,
      status: new Date(esicDue) < now ? "overdue" : "upcoming",
      createdAt: nowStr,
      updatedAt: nowStr,
    });
  }

  // Upsert — ignore conflicts on (companyId, eventType, periodMonth, periodYear)
  for (const ev of events) {
    const existing = await db
      .select({ id: complianceCalendarEvents.id })
      .from(complianceCalendarEvents)
      .where(
        and(
          eq(complianceCalendarEvents.companyId, companyId),
          eq(complianceCalendarEvents.eventType, ev.eventType!),
          eq(complianceCalendarEvents.periodMonth, ev.periodMonth!),
          eq(complianceCalendarEvents.periodYear, ev.periodYear!)
        )
      )
      .limit(1);
    if (existing.length === 0) {
      await db.insert(complianceCalendarEvents).values(ev);
    }
  }
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerEpfoEsicRoutes(
  app: Express,
  requireAuth: any,
  requireRole: (...roles: string[]) => any
): void {

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION JOBS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/automation/jobs — list with optional filters
  app.get("/api/automation/jobs", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { status, jobType, limit = "50", offset = "0", companyId: qCompany } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId ?? undefined;
      const jobs = await queueService.listJobs({
        companyId: cid,
        status,
        jobType,
        limit: Math.min(Number(limit) || 50, 200),
        offset: Number(offset) || 0,
      });
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch jobs" });
    }
  });

  // GET /api/automation/jobs/:id — single job + logs
  app.get("/api/automation/jobs/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });
      const logs = await queueService.getLogs(job.id, 500);
      res.json({ ...job, logs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch job" });
    }
  });

  // POST /api/automation/jobs/:id/retry — re-queue failed/cancelled job
  app.post("/api/automation/jobs/:id/retry", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });
      if (!["failed", "cancelled"].includes(job.status)) {
        return res.status(409).json({ error: `Cannot retry a job with status '${job.status}'` });
      }
      await queueService.retryJob(job.id);
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to retry job" });
    }
  });

  // DELETE /api/automation/jobs/:id — cancel a pending job
  app.delete("/api/automation/jobs/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });
      if (job.status !== "pending") {
        return res.status(409).json({ error: `Only pending jobs can be cancelled (current: ${job.status})` });
      }
      await queueService.cancelJob(job.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to cancel job" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION LOGS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/automation/logs — recent logs for company
  app.get("/api/automation/logs", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, limit = "100" } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });
      const logs = await queueService.getRecentLogs(cid, Math.min(Number(limit) || 100, 500));
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch logs" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTAL SESSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/automation/portal-sessions — list for company (no passwords)
  app.get("/api/automation/portal-sessions", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });
      const rows = await db
        .select({
          id: portalSessions.id,
          companyId: portalSessions.companyId,
          portal: portalSessions.portal,
          username: portalSessions.username,
          lastLoginAt: portalSessions.lastLoginAt,
          sessionValidUntil: portalSessions.sessionValidUntil,
          isActive: portalSessions.isActive,
          hasCookies: sql<boolean>`(encrypted_cookies IS NOT NULL)`.as("hasCookies"),
          createdAt: portalSessions.createdAt,
          updatedAt: portalSessions.updatedAt,
        })
        .from(portalSessions)
        .where(eq(portalSessions.companyId, cid));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch portal sessions" });
    }
  });

  // PUT /api/automation/portal-sessions/:portal — upsert credentials
  app.put("/api/automation/portal-sessions/:portal", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const portal = req.params.portal as "epfo" | "esic";
      if (!["epfo", "esic"].includes(portal)) {
        return res.status(400).json({ error: "portal must be 'epfo' or 'esic'" });
      }
      const { username, password, companyId: bodyCompany } = req.body as { username?: string; password?: string; companyId?: string };
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "username and password are required" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      await portalSessionService.saveCredentials(cid, portal, username.trim(), password.trim());
      res.json({ ok: true, portal, companyId: cid });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to save credentials" });
    }
  });

  // DELETE /api/automation/portal-sessions/:portal — remove session
  app.delete("/api/automation/portal-sessions/:portal", requireAuth, requireRole("super_admin", "company_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const portal = req.params.portal as "epfo" | "esic";
      if (!["epfo", "esic"].includes(portal)) {
        return res.status(400).json({ error: "portal must be 'epfo' or 'esic'" });
      }
      const { companyId: qCompany } = req.query as Record<string, string>;
      let cid: string;
      try { cid = resolveCompanyId(user, qCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const now = new Date().toISOString();
      await db
        .update(portalSessions)
        .set({ isActive: false, encryptedCookies: null, updatedAt: now })
        .where(and(eq(portalSessions.companyId, cid), eq(portalSessions.portal, portal)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to remove portal session" });
    }
  });

  // POST /api/automation/portal-sessions/:portal/test — enqueue login test
  app.post("/api/automation/portal-sessions/:portal/test", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const portal = req.params.portal as "epfo" | "esic";
      if (!["epfo", "esic"].includes(portal)) {
        return res.status(400).json({ error: "portal must be 'epfo' or 'esic'" });
      }
      const { companyId: bodyCompany } = req.body as { companyId?: string };
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const jobType = portal === "epfo" ? "epfo_login_test" : "esic_login_test";
      const job = await queueService.enqueueJob({
        jobType,
        companyId: cid,
        payload: { portal },
        createdBy: user.id,
        maxRetries: 0,
      });
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue login test" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — REGISTRATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/registrations
  app.get("/api/epfo/registrations", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, status } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      let q = db
        .select({
          reg: epfoRegistrations,
          employeeName: sql<string>`(select concat(first_name, ' ', last_name) from employees e where e.id = epfo_registrations.employee_id)`,
          employeeCode: sql<string>`(select employee_code from employees e where e.id = epfo_registrations.employee_id)`,
        })
        .from(epfoRegistrations)
        .where(status
          ? and(eq(epfoRegistrations.companyId, cid), eq(epfoRegistrations.status, status))
          : eq(epfoRegistrations.companyId, cid))
        .$dynamic();
      const rows = await q.orderBy(desc(epfoRegistrations.createdAt));
      res.json(rows.map(r => ({ ...r.reg, employeeName: r.employeeName, employeeCode: r.employeeCode })));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch EPFO registrations" });
    }
  });

  // GET /api/epfo/registrations/employee/:employeeId
  app.get("/api/epfo/registrations/employee/:employeeId", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rows = await db
        .select()
        .from(epfoRegistrations)
        .where(eq(epfoRegistrations.employeeId, req.params.employeeId))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: "No EPFO registration found" });
      if (isForbidden(user, rows[0].companyId)) return res.status(403).json({ error: "Access denied" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch registration" });
    }
  });

  // POST /api/epfo/register-employee — enqueue UAN generation
  app.post("/api/epfo/register-employee", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeId, companyId: bodyCompany } = req.body as { employeeId?: string; companyId?: string };
      if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      // Check employee belongs to this company
      const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (emp.companyId !== cid) return res.status(403).json({ error: "Employee does not belong to this company" });

      // Upsert registration record
      const now = new Date().toISOString();
      const existing = await db.select().from(epfoRegistrations).where(
        and(eq(epfoRegistrations.companyId, cid), eq(epfoRegistrations.employeeId, employeeId))
      ).limit(1);

      const job = await queueService.enqueueJob({
        jobType: "epfo_uan_generate",
        companyId: cid,
        payload: { employeeId },
        createdBy: user.id,
      });

      if (existing.length > 0) {
        await db.update(epfoRegistrations)
          .set({ status: "pending", jobId: job.id, errorMessage: null, updatedAt: now })
          .where(eq(epfoRegistrations.id, existing[0].id));
        return res.json({ ok: true, jobId: job.id, registrationId: existing[0].id });
      }

      const id = randomUUID();
      await db.insert(epfoRegistrations).values({
        id, companyId: cid, employeeId,
        pfCode: emp.uan ? undefined : undefined,
        status: "pending", jobId: job.id,
        createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, registrationId: id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue EPFO registration" });
    }
  });

  // POST /api/epfo/bulk-register — enqueue bulk UAN generation
  app.post("/api/epfo/bulk-register", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeIds, companyId: bodyCompany } = req.body as { employeeIds?: string[]; companyId?: string };
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ error: "employeeIds array is required" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const job = await queueService.enqueueJob({
        jobType: "epfo_bulk_register",
        companyId: cid,
        payload: { employeeIds },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id, count: employeeIds.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue bulk registration" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — KYC
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/kyc/:employeeId
  app.get("/api/epfo/kyc/:employeeId", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rows = await db
        .select()
        .from(epfoKycRecords)
        .where(eq(epfoKycRecords.employeeId, req.params.employeeId))
        .orderBy(desc(epfoKycRecords.createdAt));
      if (rows.length > 0 && isForbidden(user, rows[0].companyId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch KYC records" });
    }
  });

  // POST /api/epfo/kyc — enqueue KYC update (aadhaar / pan / bank)
  app.post("/api/epfo/kyc", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeId, kycType, documentNumber, companyId: bodyCompany } =
        req.body as { employeeId?: string; kycType?: string; documentNumber?: string; companyId?: string };

      if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
      if (!kycType || !["aadhaar", "pan", "bank"].includes(kycType)) {
        return res.status(400).json({ error: "kycType must be aadhaar, pan, or bank" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      // Get UAN from EPFO registration
      const [reg] = await db
        .select({ uan: epfoRegistrations.uan })
        .from(epfoRegistrations)
        .where(and(eq(epfoRegistrations.companyId, cid), eq(epfoRegistrations.employeeId, employeeId)))
        .limit(1);

      const jobTypeMap: Record<string, string> = {
        aadhaar: "epfo_kyc_aadhaar",
        pan: "epfo_kyc_pan",
        bank: "epfo_kyc_bank",
      };
      const job = await queueService.enqueueJob({
        jobType: jobTypeMap[kycType],
        companyId: cid,
        payload: { employeeId, kycType, documentNumber, uan: reg?.uan ?? null },
        createdBy: user.id,
      });

      // Upsert KYC record
      const now = new Date().toISOString();
      const existingKyc = await db
        .select()
        .from(epfoKycRecords)
        .where(and(
          eq(epfoKycRecords.companyId, cid),
          eq(epfoKycRecords.employeeId, employeeId),
          eq(epfoKycRecords.kycType, kycType)
        ))
        .limit(1);

      if (existingKyc.length > 0) {
        await db.update(epfoKycRecords)
          .set({ status: "pending", jobId: job.id, documentNumber: documentNumber ?? null, errorMessage: null, updatedAt: now })
          .where(eq(epfoKycRecords.id, existingKyc[0].id));
        return res.json({ ok: true, jobId: job.id, kycRecordId: existingKyc[0].id });
      }

      const kycId = randomUUID();
      await db.insert(epfoKycRecords).values({
        id: kycId, companyId: cid, employeeId,
        uan: reg?.uan ?? null, kycType, status: "pending",
        documentNumber: documentNumber ?? null,
        jobId: job.id, createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, kycRecordId: kycId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue KYC update" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — ECR RETURNS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/ecr-returns
  app.get("/api/epfo/ecr-returns", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, year } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(epfoEcrReturns)
        .where(year
          ? and(eq(epfoEcrReturns.companyId, cid), eq(epfoEcrReturns.year, Number(year)))
          : eq(epfoEcrReturns.companyId, cid))
        .orderBy(desc(epfoEcrReturns.year), sql`
          CASE month
            WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
            WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
            WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
            WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END DESC
        `);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ECR returns" });
    }
  });

  // POST /api/epfo/ecr-returns — create ECR return record + enqueue filing
  app.post("/api/epfo/ecr-returns", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { month, year, companyId: bodyCompany, bulk = false } =
        req.body as { month?: string; year?: number; companyId?: string; bulk?: boolean };

      if (!month || !year) return res.status(400).json({ error: "month and year are required" });
      if (!MONTH_NAMES.map(m => m.toLowerCase()).includes(month.toLowerCase())) {
        return res.status(400).json({ error: "Invalid month name" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      // Check for duplicate
      const existing = await db
        .select()
        .from(epfoEcrReturns)
        .where(and(
          eq(epfoEcrReturns.companyId, cid),
          eq(epfoEcrReturns.month, month),
          eq(epfoEcrReturns.year, year)
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].status === "filed") {
        return res.status(409).json({ error: "ECR for this month/year is already filed" });
      }

      // Compute aggregates from payroll
      const payrollRows = await db
        .select({
          pfEmployee: payroll.pfEmployee,
          pfEmployer: sql<number>`0`,
          basicSalary: payroll.basicSalary,
        })
        .from(payroll)
        .where(and(
          eq(payroll.companyId, cid),
          eq(payroll.month, month),
          eq(payroll.year, year)
        ));

      const totalEmployees = payrollRows.length;
      const totalPfWages = payrollRows.reduce((s, r) => s + (r.basicSalary || 0), 0);
      const totalEmployeeContribution = payrollRows.reduce((s, r) => s + (r.pfEmployee || 0), 0);
      const totalEmployerContribution = Math.round(totalPfWages * 0.12);
      const totalAmount = totalEmployeeContribution + totalEmployerContribution;
      const dueDate = calcDueDate(month, year, "epfo");

      const jobType = bulk ? "epfo_bulk_ecr" : "epfo_ecr_file";
      const job = await queueService.enqueueJob({
        jobType,
        companyId: cid,
        payload: { month, year, totalEmployees, totalAmount },
        createdBy: user.id,
      });

      const now = new Date().toISOString();
      let returnId: string;
      if (existing.length > 0) {
        await db.update(epfoEcrReturns)
          .set({
            status: "pending", jobId: job.id,
            totalEmployees, totalPfWages, totalEmployeeContribution,
            totalEmployerContribution, totalAmount, dueDate,
            errorMessage: null, updatedAt: now,
          })
          .where(eq(epfoEcrReturns.id, existing[0].id));
        returnId = existing[0].id;
      } else {
        returnId = randomUUID();
        await db.insert(epfoEcrReturns).values({
          id: returnId, companyId: cid, month, year: Number(year),
          totalEmployees, totalPfWages, totalEmployeeContribution,
          totalEmployerContribution, totalAmount,
          status: "pending", jobId: job.id, dueDate,
          createdBy: user.id, createdAt: now, updatedAt: now,
        });
      }
      res.status(201).json({ ok: true, jobId: job.id, returnId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create ECR return" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — CHALLANS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/challans
  app.get("/api/epfo/challans", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, year } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(challans)
        .where(year
          ? and(eq(challans.companyId, cid), eq(challans.portal, "epfo"), eq(challans.year, Number(year)))
          : and(eq(challans.companyId, cid), eq(challans.portal, "epfo")))
        .orderBy(desc(challans.year), desc(challans.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch challans" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESIC — REGISTRATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/esic/registrations
  app.get("/api/esic/registrations", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, status } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select({
          reg: esicRegistrations,
          employeeName: sql<string>`(select concat(first_name, ' ', last_name) from employees e where e.id = esic_registrations.employee_id)`,
          employeeCode: sql<string>`(select employee_code from employees e where e.id = esic_registrations.employee_id)`,
        })
        .from(esicRegistrations)
        .where(status
          ? and(eq(esicRegistrations.companyId, cid), eq(esicRegistrations.status, status))
          : eq(esicRegistrations.companyId, cid))
        .orderBy(desc(esicRegistrations.createdAt));
      res.json(rows.map(r => ({ ...r.reg, employeeName: r.employeeName, employeeCode: r.employeeCode })));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC registrations" });
    }
  });

  // GET /api/esic/registrations/employee/:employeeId
  app.get("/api/esic/registrations/employee/:employeeId", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rows = await db
        .select()
        .from(esicRegistrations)
        .where(eq(esicRegistrations.employeeId, req.params.employeeId))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: "No ESIC registration found" });
      if (isForbidden(user, rows[0].companyId)) return res.status(403).json({ error: "Access denied" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC registration" });
    }
  });

  // POST /api/esic/register-employee — enqueue IP number generation
  app.post("/api/esic/register-employee", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeId, companyId: bodyCompany } = req.body as { employeeId?: string; companyId?: string };
      if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (emp.companyId !== cid) return res.status(403).json({ error: "Employee does not belong to this company" });

      const now = new Date().toISOString();
      const existing = await db.select().from(esicRegistrations).where(
        and(eq(esicRegistrations.companyId, cid), eq(esicRegistrations.employeeId, employeeId))
      ).limit(1);

      const job = await queueService.enqueueJob({
        jobType: "esic_ip_generate",
        companyId: cid,
        payload: { employeeId },
        createdBy: user.id,
      });

      if (existing.length > 0) {
        await db.update(esicRegistrations)
          .set({ status: "pending", jobId: job.id, errorMessage: null, updatedAt: now })
          .where(eq(esicRegistrations.id, existing[0].id));
        return res.json({ ok: true, jobId: job.id, registrationId: existing[0].id });
      }

      const id = randomUUID();
      await db.insert(esicRegistrations).values({
        id, companyId: cid, employeeId, status: "pending",
        jobId: job.id, createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, registrationId: id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC registration" });
    }
  });

  // POST /api/esic/bulk-register — enqueue bulk IP generation
  app.post("/api/esic/bulk-register", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeIds, companyId: bodyCompany } = req.body as { employeeIds?: string[]; companyId?: string };
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ error: "employeeIds array is required" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const job = await queueService.enqueueJob({
        jobType: "esic_bulk_register",
        companyId: cid,
        payload: { employeeIds },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id, count: employeeIds.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC bulk registration" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESIC — MONTHLY RETURNS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/esic/monthly-returns
  app.get("/api/esic/monthly-returns", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, year } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(esicMonthlyReturns)
        .where(year
          ? and(eq(esicMonthlyReturns.companyId, cid), eq(esicMonthlyReturns.year, Number(year)))
          : eq(esicMonthlyReturns.companyId, cid))
        .orderBy(desc(esicMonthlyReturns.year), sql`
          CASE month
            WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
            WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
            WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
            WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
          END DESC
        `);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC returns" });
    }
  });

  // POST /api/esic/monthly-returns — create ESIC monthly return + enqueue filing
  app.post("/api/esic/monthly-returns", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { month, year, companyId: bodyCompany } =
        req.body as { month?: string; year?: number; companyId?: string };

      if (!month || !year) return res.status(400).json({ error: "month and year are required" });
      if (!MONTH_NAMES.map(m => m.toLowerCase()).includes(month.toLowerCase())) {
        return res.status(400).json({ error: "Invalid month name" });
      }
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const existing = await db
        .select()
        .from(esicMonthlyReturns)
        .where(and(
          eq(esicMonthlyReturns.companyId, cid),
          eq(esicMonthlyReturns.month, month),
          eq(esicMonthlyReturns.year, Number(year))
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].status === "filed") {
        return res.status(409).json({ error: "ESIC return for this month/year is already filed" });
      }

      // Aggregate from payroll
      const payrollRows = await db
        .select({ esi: payroll.esi, basicSalary: payroll.basicSalary })
        .from(payroll)
        .where(and(
          eq(payroll.companyId, cid),
          eq(payroll.month, month),
          eq(payroll.year, Number(year))
        ));

      const settings = await db
        .select({ esicEmployerPercent: statutorySettings.esicEmployerPercent })
        .from(statutorySettings)
        .where(eq(statutorySettings.companyId, cid))
        .limit(1);

      const empPct = 75; // 0.75% stored as 75 bp
      const emplrPct = settings[0]?.esicEmployerPercent ?? 325; // 3.25% stored as 325 bp

      const totalEmployees = payrollRows.length;
      const totalEsicWages = payrollRows.reduce((s, r) => s + (r.basicSalary || 0), 0);
      const totalEmployeeContribution = payrollRows.reduce((s, r) => s + (r.esi || 0), 0);
      const totalEmployerContribution = Math.round(totalEsicWages * emplrPct / 10000);
      const totalAmount = totalEmployeeContribution + totalEmployerContribution;
      const dueDate = calcDueDate(month, Number(year), "esic");

      const job = await queueService.enqueueJob({
        jobType: "esic_monthly_file",
        companyId: cid,
        payload: { month, year, totalEmployees, totalAmount },
        createdBy: user.id,
      });

      const now = new Date().toISOString();
      let returnId: string;
      if (existing.length > 0) {
        await db.update(esicMonthlyReturns)
          .set({
            status: "pending", jobId: job.id,
            totalEmployees, totalEsicWages, totalEmployeeContribution,
            totalEmployerContribution, totalAmount, dueDate,
            errorMessage: null, updatedAt: now,
          })
          .where(eq(esicMonthlyReturns.id, existing[0].id));
        returnId = existing[0].id;
      } else {
        returnId = randomUUID();
        await db.insert(esicMonthlyReturns).values({
          id: returnId, companyId: cid, month, year: Number(year),
          totalEmployees, totalEsicWages, totalEmployeeContribution,
          totalEmployerContribution, totalAmount,
          status: "pending", jobId: job.id, dueDate,
          createdBy: user.id, createdAt: now, updatedAt: now,
        });
      }
      res.status(201).json({ ok: true, jobId: job.id, returnId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create ESIC return" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESIC — CHALLANS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/esic/challans
  app.get("/api/esic/challans", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, year } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(challans)
        .where(year
          ? and(eq(challans.companyId, cid), eq(challans.portal, "esic"), eq(challans.year, Number(year)))
          : and(eq(challans.companyId, cid), eq(challans.portal, "esic")))
        .orderBy(desc(challans.year), desc(challans.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC challans" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/compliance-calendar
  app.get("/api/compliance-calendar", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany, year, month } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      // Auto-seed upcoming events if none exist yet
      await ensureComplianceEvents(cid, 6);

      const conditions = [eq(complianceCalendarEvents.companyId, cid)];
      if (year) conditions.push(eq(complianceCalendarEvents.periodYear, Number(year)));
      if (month) conditions.push(eq(complianceCalendarEvents.periodMonth, month));

      const rows = await db
        .select()
        .from(complianceCalendarEvents)
        .where(and(...conditions))
        .orderBy(complianceCalendarEvents.dueDate);

      // Auto-mark overdue events
      const now = new Date().toISOString().slice(0, 10);
      const overdueIds = rows
        .filter(r => r.dueDate < now && r.status === "upcoming")
        .map(r => r.id);
      if (overdueIds.length > 0) {
        await db
          .update(complianceCalendarEvents)
          .set({ status: "overdue", updatedAt: new Date().toISOString() })
          .where(inArray(complianceCalendarEvents.id, overdueIds));
        rows.forEach(r => { if (overdueIds.includes(r.id)) r.status = "overdue"; });
      }

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch compliance calendar" });
    }
  });

  // POST /api/compliance-calendar — create custom event
  app.post("/api/compliance-calendar", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { title, description, dueDate, eventType = "custom", companyId: bodyCompany, periodMonth, periodYear } =
        req.body as { title?: string; description?: string; dueDate?: string; eventType?: string; companyId?: string; periodMonth?: string; periodYear?: number };

      if (!title?.trim() || !dueDate) return res.status(400).json({ error: "title and dueDate are required" });
      let cid: string;
      try { cid = resolveCompanyId(user, bodyCompany); } catch (e: any) { return res.status(e.status).json({ error: e.error }); }

      const now = new Date().toISOString();
      const id = randomUUID();
      const [row] = await db.insert(complianceCalendarEvents).values({
        id, companyId: cid, eventType, title: title.trim(),
        description: description ?? null, dueDate,
        periodMonth: periodMonth ?? null, periodYear: periodYear ?? null,
        status: new Date(dueDate) < new Date() ? "overdue" : "upcoming",
        createdBy: user.id, createdAt: now, updatedAt: now,
      }).returning();
      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create event" });
    }
  });

  // PATCH /api/compliance-calendar/:id — update status / description
  app.patch("/api/compliance-calendar/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const [existing] = await db
        .select()
        .from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (isForbidden(user, existing.companyId)) return res.status(403).json({ error: "Access denied" });

      const { status, title, description, dueDate } = req.body as {
        status?: string; title?: string; description?: string; dueDate?: string;
      };
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (status) updates.status = status;
      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (dueDate) updates.dueDate = dueDate;

      const [updated] = await db
        .update(complianceCalendarEvents)
        .set(updates)
        .where(eq(complianceCalendarEvents.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to update event" });
    }
  });

  // DELETE /api/compliance-calendar/:id
  app.delete("/api/compliance-calendar/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const [existing] = await db
        .select()
        .from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (isForbidden(user, existing.companyId)) return res.status(403).json({ error: "Access denied" });

      await db.delete(complianceCalendarEvents).where(eq(complianceCalendarEvents.id, req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to delete event" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS — EPFO ECR Contribution (Excel download)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/epfo/reports/ecr-contribution", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { month, year, companyId: qCompany } = req.query as Record<string, string>;
      if (!month || !year) return res.status(400).json({ error: "month and year are required" });
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select({
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          uan: employees.uan,
          basicSalary: payroll.basicSalary,
          pfEmployee: payroll.pfEmployee,
          status: payroll.status,
        })
        .from(payroll)
        .innerJoin(employees, eq(employees.id, payroll.employeeId))
        .where(and(
          eq(payroll.companyId, cid),
          eq(payroll.month, month),
          eq(payroll.year, Number(year))
        ))
        .orderBy(employees.employeeCode);

      const data = rows.map(r => ({
        "Employee Code": r.employeeCode,
        "Employee Name": `${r.firstName} ${r.lastName}`,
        "UAN": r.uan || "",
        "PF Wages": r.basicSalary || 0,
        "Employee PF (12%)": r.pfEmployee || 0,
        "Employer PF (12%)": Math.round((r.basicSalary || 0) * 0.12),
        "Total PF": (r.pfEmployee || 0) + Math.round((r.basicSalary || 0) * 0.12),
        "Status": r.status,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [16, 30, 16, 12, 18, 18, 12, 12].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "EPFO ECR");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=EPFO_ECR_${month}_${year}.xlsx`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate EPFO report" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS — ESIC Contribution (Excel download)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/esic/reports/contribution", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { month, year, companyId: qCompany } = req.query as Record<string, string>;
      if (!month || !year) return res.status(400).json({ error: "month and year are required" });
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const settings = await db
        .select({ esicEmployerPercent: statutorySettings.esicEmployerPercent })
        .from(statutorySettings)
        .where(eq(statutorySettings.companyId, cid))
        .limit(1);
      const emplrPct = settings[0]?.esicEmployerPercent ?? 325;

      const rows = await db
        .select({
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          esiNumber: employees.esiNumber,
          basicSalary: payroll.basicSalary,
          esi: payroll.esi,
          status: payroll.status,
        })
        .from(payroll)
        .innerJoin(employees, eq(employees.id, payroll.employeeId))
        .where(and(
          eq(payroll.companyId, cid),
          eq(payroll.month, month),
          eq(payroll.year, Number(year))
        ))
        .orderBy(employees.employeeCode);

      const data = rows.map(r => ({
        "Employee Code": r.employeeCode,
        "Employee Name": `${r.firstName} ${r.lastName}`,
        "IP Number": r.esiNumber || "",
        "ESIC Wages": r.basicSalary || 0,
        "Employee ESIC (0.75%)": r.esi || 0,
        "Employer ESIC (3.25%)": Math.round((r.basicSalary || 0) * emplrPct / 10000),
        "Total ESIC": (r.esi || 0) + Math.round((r.basicSalary || 0) * emplrPct / 10000),
        "Status": r.status,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [16, 30, 16, 14, 20, 20, 14, 12].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ESIC Contribution");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=ESIC_Contribution_${month}_${year}.xlsx`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate ESIC report" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY / DASHBOARD — overview counts for the compliance module
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/automation/summary", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompany } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCompany ? qCompany : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const [epfoReg, esicReg, pendingJobs, failedJobs, epfoEcr, esicReturn] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(epfoRegistrations).where(eq(epfoRegistrations.companyId, cid)),
        db.select({ count: sql<number>`count(*)` }).from(esicRegistrations).where(eq(esicRegistrations.companyId, cid)),
        db.select({ count: sql<number>`count(*)` }).from(automationJobs).where(and(eq(automationJobs.companyId, cid), eq(automationJobs.status, "pending"))),
        db.select({ count: sql<number>`count(*)` }).from(automationJobs).where(and(eq(automationJobs.companyId, cid), eq(automationJobs.status, "failed"))),
        db.select({ count: sql<number>`count(*)` }).from(epfoEcrReturns).where(eq(epfoEcrReturns.companyId, cid)),
        db.select({ count: sql<number>`count(*)` }).from(esicMonthlyReturns).where(eq(esicMonthlyReturns.companyId, cid)),
      ]);

      res.json({
        epfoRegistrations: Number(epfoReg[0]?.count ?? 0),
        esicRegistrations: Number(esicReg[0]?.count ?? 0),
        pendingJobs: Number(pendingJobs[0]?.count ?? 0),
        failedJobs: Number(failedJobs[0]?.count ?? 0),
        epfoEcrReturns: Number(epfoEcr[0]?.count ?? 0),
        esicMonthlyReturns: Number(esicReturn[0]?.count ?? 0),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch summary" });
    }
  });
}
