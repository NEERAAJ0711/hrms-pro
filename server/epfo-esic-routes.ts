/**
 * EPFO & ESIC API Routes — Task #3
 *
 * Covers all endpoints from the spec:
 *   - Automation job management (list, enqueue, get+logs, retry, cancel, resume)
 *   - Portal session management (save, get, test)
 *   - EPFO: registrations, KYC, ECR filing, challans, passbook, exit-management
 *   - ESIC: registrations, contributions, monthly filing, challans, employee-search
 *   - Compliance calendar (upcoming + history)
 *   - Reports: EPFO ECR, ESIC contribution, failed-filings, audit (PDF + Excel)
 *   - Automation logs (paginated, filterable)
 */

import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
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
  esicFetchedEmployees,
  challans,
  complianceCalendarEvents,
  employees,
  payroll,
  salaryStructures,
  statutorySettings,
  automationJobTypes,
  users as usersTable,
} from "@shared/schema";
import { sendComplianceReminderEmail } from "./services/email-service";
import { eq, and, desc, sql, inArray, gte, lte, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { queueService } from "./queue-service";
import { portalSessionService } from "./portal-session-service";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

// Resolve admin/HR email addresses for a company to notify about compliance events.
async function getComplianceRecipientEmails(companyId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, companyId),
          or(eq(usersTable.role, "company_admin"), eq(usersTable.role, "hr_admin")),
        ),
      );
    return rows.map((r) => r.email).filter((e): e is string => !!e);
  } catch (err) {
    console.error("[Email] compliance recipients lookup failed:", err);
    return [];
  }
}

// ─── Shared Zod schemas ───────────────────────────────────────────────────────

const monthSchema = z.enum([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);

const portalSchema = z.enum(["epfo", "esic"]);

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const enqueueJobSchema = z.object({
  jobType: z.enum(automationJobTypes),
  companyId: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const portalCredentialSchema = z.object({
  username: z.string().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
  companyId: z.string().min(1).optional(),
});

const registerEmployeeSchema = z.object({
  employeeId: z.string().min(1, "employeeId is required"),
  companyId: z.string().min(1).optional(),
});

const bulkRegisterSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, "at least one employeeId is required"),
  companyId: z.string().min(1).optional(),
});

const updateKycSchema = z.object({
  employeeId: z.string().min(1, "employeeId is required"),
  kycType: z.enum(["aadhaar", "pan", "bank"]),
  documentNumber: z.string().optional(),
  companyId: z.string().min(1).optional(),
});

const fileEcrSchema = z.object({
  month: monthSchema,
  year: z.number().int().min(2000).max(2100),
  companyId: z.string().min(1).optional(),
  bulk: z.boolean().optional().default(false),
});

const fileMonthlySSchema = z.object({
  month: monthSchema,
  year: z.number().int().min(2000).max(2100),
  companyId: z.string().min(1).optional(),
});

const syncChallansSchema = z.object({
  month: monthSchema.optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  companyId: z.string().min(1).optional(),
});

const exitManagementSchema = z.object({
  employeeId: z.string().min(1, "employeeId is required"),
  exitDate: z.string().min(1, "exitDate is required"),
  exitType: z.string().optional(),
  companyId: z.string().min(1).optional(),
});

const esicEmployeeSearchSchema = z.object({
  query: z.string().min(1, "search query is required"),
  companyId: z.string().min(1).optional(),
});

const calendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().min(1),
  eventType: z.enum(["epfo_ecr_due", "esic_return_due", "pt_due", "lwf_due", "tds_due", "custom"]).default("custom"),
  periodMonth: monthSchema.optional(),
  periodYear: z.number().int().optional(),
  companyId: z.string().min(1).optional(),
});

const calendarEventPatchSchema = z.object({
  status: z.enum(["upcoming", "completed", "overdue", "waived"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function monthSortSql() {
  return sql`CASE month
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
  END DESC`;
}

/** ECR due on 15th of next month; ESIC due on 21st of next month */
function calcDueDate(month: string, year: number, portal: "epfo" | "esic"): string {
  const idx = MONTH_NAMES.findIndex(m => m === month);
  const day = portal === "epfo" ? 15 : 21;
  const nextDate = new Date(year, idx + 1, day);
  return nextDate.toISOString().slice(0, 10);
}

/** Returns companyId from user context + optional override for super_admin */
function getCompanyId(
  user: { role: string; companyId?: string | null },
  override?: string
): { companyId: string } | { error: string; status: number } {
  if (user.role === "super_admin") {
    if (!override) return { error: "companyId is required for super_admin", status: 400 };
    return { companyId: override };
  }
  if (!user.companyId) return { error: "User has no company assigned", status: 403 };
  return { companyId: user.companyId };
}

function isForbidden(user: { role: string; companyId?: string | null }, jobCompanyId: string): boolean {
  return user.role !== "super_admin" && user.companyId !== jobCompanyId;
}

/** Build offset from page/limit */
function pageToOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** Validate body with Zod, send 400 on failure */
function parseBody<T>(schema: z.ZodSchema<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", details: result.error.flatten() });
    return null;
  }
  return result.data;
}

/** Validate query with Zod, send 400 on failure */
function parseQuery<S extends z.ZodTypeAny>(schema: S, query: unknown, res: Response): z.output<S> | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    res.status(400).json({ error: "Invalid query parameters", details: result.error.flatten() });
    return null;
  }
  return result.data as z.output<S>;
}

// ─── Compliance calendar: seed upcoming events ────────────────────────────────

async function ensureUpcomingEvents(companyId: string, months = 6): Promise<void> {
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    const nowStr = new Date().toISOString();

    for (const [portal, eventType] of [
      ["epfo", "epfo_ecr_due"],
      ["esic", "esic_return_due"],
    ] as const) {
      const due = calcDueDate(month, year, portal);
      const existing = await db
        .select({ id: complianceCalendarEvents.id })
        .from(complianceCalendarEvents)
        .where(and(
          eq(complianceCalendarEvents.companyId, companyId),
          eq(complianceCalendarEvents.eventType, eventType),
          eq(complianceCalendarEvents.periodMonth, month),
          eq(complianceCalendarEvents.periodYear, year)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(complianceCalendarEvents).values({
          id: randomUUID(),
          companyId,
          eventType,
          title: `${portal.toUpperCase()} ${portal === "epfo" ? "ECR" : "Return"} — ${month} ${year}`,
          description: `Monthly ${portal === "epfo" ? "ECR filing" : "ESIC contribution return"} due for ${month} ${year}`,
          dueDate: due,
          periodMonth: month,
          periodYear: year,
          status: new Date(due) < now ? "overdue" : "upcoming",
          createdAt: nowStr,
          updatedAt: nowStr,
        });
      }
    }
  }
}

// ─── pdfkit PDF report helper ─────────────────────────────────────────────────

function streamPdfReport(
  res: Response,
  title: string,
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string
): void {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  // Title
  doc.fontSize(14).font("Helvetica-Bold").text(title, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica").text(`Generated: ${new Date().toLocaleString("en-IN")}`, { align: "right" });
  doc.moveDown(0.8);

  if (rows.length === 0) {
    doc.fontSize(11).text("No data found for the selected period.", { align: "center" });
    doc.end();
    return;
  }

  // Calculate equal column widths
  const pageWidth = doc.page.width - 80;
  const colWidth = Math.floor(pageWidth / columns.length);
  const rowHeight = 18;
  const headerH = 20;
  let y = doc.y;

  const drawRow = (vals: string[], isHeader: boolean) => {
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    if (isHeader) {
      doc.rect(40, y, pageWidth, headerH).fill("#4A90D9");
      doc.fillColor("white").font("Helvetica-Bold").fontSize(8);
    } else {
      doc.fillColor("#333").font("Helvetica").fontSize(8);
    }
    vals.forEach((v, i) => {
      doc.text(v, 40 + i * colWidth + 3, y + 4, {
        width: colWidth - 6,
        ellipsis: true,
        lineBreak: false,
      });
    });
    if (!isHeader) {
      doc.strokeColor("#ddd").rect(40, y, pageWidth, rowHeight).stroke();
    }
    y += isHeader ? headerH : rowHeight;
    doc.fillColor("#333");
  };

  // Header row
  drawRow(columns, true);
  // Data rows
  rows.forEach((r, idx) => {
    if (idx % 2 === 0) {
      doc.rect(40, y, pageWidth, rowHeight).fill("#f9f9f9").stroke();
    }
    drawRow(columns.map(c => String(r[c] ?? "")), false);
  });

  // Footer
  doc.fontSize(8).fillColor("#888").text(`Total rows: ${rows.length}`, 40, doc.page.height - 40);
  doc.end();
}

// ─── Statutory filing payload ───────────────────────────────────────────────────
// Maps an employee record into the payload consumed by the EPFO UAN / ESIC IP
// registration automation. Includes the statutory fields (nominee, marital
// status, mother's name, blood group, emergency contact) the portal forms need.
// Missing values are left undefined so the automation skips them gracefully.
function buildRegistrationPayload(
  emp: typeof employees.$inferSelect,
  grossSalary: number = 0,
) {
  const opt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode ?? "",
    name: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim(),
    dob: emp.dateOfBirth ?? "",
    gender: emp.gender ?? "",
    dateOfJoining: emp.dateOfJoining,
    fatherName: opt(emp.fatherHusbandName),
    mobileNumber: opt(emp.mobileNumber),
    mobile: opt(emp.mobileNumber),
    aadhaar: opt(emp.aadhaar),
    pan: opt(emp.pan),
    bankAccount: opt(emp.bankAccount),
    ifsc: opt(emp.ifsc),
    // Monthly gross wage for the ESIC IP salary field. Sourced from the active
    // salary structure (or latest payroll as a fallback). 0 when no salary data
    // exists — the automation skips the field when grossSalary is not > 0.
    grossSalary: Number.isFinite(grossSalary) && grossSalary > 0 ? grossSalary : 0,
    // New statutory fields
    maritalStatus: opt(emp.maritalStatus),
    motherName: opt(emp.motherName),
    bloodGroup: opt(emp.bloodGroup),
    nomineeName: opt(emp.nomineeName),
    nomineeRelation: opt(emp.nomineeRelation),
    emergencyContactName: opt(emp.emergencyContactName),
    emergencyContactNumber: opt(emp.emergencyContactNumber),
  };
}

// Resolves the current monthly gross wage for each employee, used to populate the
// ESIC IP registration salary field. Source of truth is the active salary
// structure's grossSalary; when an employee has no active structure we fall back
// to the latest generated payroll's totalEarnings. Employees with neither are
// omitted from the map (callers default to 0).
async function getGrossSalaryMap(employeeIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const structures = await db
    .select({ employeeId: salaryStructures.employeeId, grossSalary: salaryStructures.grossSalary })
    .from(salaryStructures)
    .where(and(inArray(salaryStructures.employeeId, ids), eq(salaryStructures.status, "active")));
  for (const s of structures) {
    if (s.grossSalary && s.grossSalary > 0) map.set(s.employeeId, s.grossSalary);
  }

  const missing = ids.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const payrolls = await db
      .select({ employeeId: payroll.employeeId, totalEarnings: payroll.totalEarnings, generatedAt: payroll.generatedAt })
      .from(payroll)
      .where(inArray(payroll.employeeId, missing))
      .orderBy(desc(payroll.generatedAt));
    for (const p of payrolls) {
      if (!map.has(p.employeeId) && p.totalEarnings && p.totalEarnings > 0) {
        map.set(p.employeeId, p.totalEarnings);
      }
    }
  }
  return map;
}

// ─── Route Registration ────────────────────────────────────────────────────────

export function registerEpfoEsicRoutes(
  app: Express,
  requireAuth: any,
  requireRole: (...roles: string[]) => any
): void {

  const adminRoles = requireRole("super_admin", "company_admin", "hr_admin");

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION JOBS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/automation/jobs — enqueue any job type
  app.post("/api/automation/jobs", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(enqueueJobSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const job = await queueService.enqueueJob({
        jobType: data.jobType,
        companyId: cidResult.companyId,
        payload: data.payload,
        maxRetries: data.maxRetries,
        scheduledAt: data.scheduledAt,
        createdBy: user.id,
      });
      res.status(201).json(job);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue job" });
    }
  });

  // GET /api/automation/jobs — list with filters
  app.get("/api/automation/jobs", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      // Enforce tenant isolation: non-super_admin must always have a companyId
      let cid: string | undefined;
      if (user.role === "super_admin") {
        cid = q.companyId || undefined; // super_admin may list all or filter by company
      } else {
        if (!user.companyId) return res.status(403).json({ error: "No company assigned to this user" });
        cid = user.companyId;
      }
      // Accept both ?type= and ?jobType= for frontend compatibility
      const jobType = q.jobType || q.type || undefined;
      const jobs = await queueService.listJobs({
        companyId: cid,
        status: q.status,
        jobType,
        from: q.from,
        to: q.to,
        limit: pg.limit,
        offset: pageToOffset(pg.page, pg.limit),
      });
      res.json({ data: jobs, page: pg.page, limit: pg.limit });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch jobs" });
    }
  });

  // GET /api/automation/jobs/:id — single job + logs
  app.get("/api/automation/jobs/:id", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id as string);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });
      const logs = await queueService.getLogs(job.id, 500);
      res.json({ ...job, logs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch job" });
    }
  });

  // POST /api/automation/jobs/:id/retry
  app.post("/api/automation/jobs/:id/retry", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id as string);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });
      if (!["failed", "cancelled"].includes(job.status)) {
        return res.status(409).json({ error: `Cannot retry job with status '${job.status}'` });
      }
      await queueService.retryJob(job.id);
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to retry job" });
    }
  });

  // DELETE /api/automation/jobs/:id
  //   ?hard=true  → permanently remove job + logs (not allowed while running/paused)
  //   (default)   → cancel a pending job (sets status = 'cancelled')
  app.delete("/api/automation/jobs/:id", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id as string);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied" });

      if (req.query.hard === "true") {
        // Hard delete — remove from DB entirely
        const result = await queueService.deleteJob(job.id);
        if (!result.deleted) {
          if (result.reason === "job_active") {
            return res.status(409).json({ error: "Cannot delete a running or paused job. Cancel or wait for it to finish first." });
          }
          return res.status(404).json({ error: "Job not found" });
        }
        return res.json({ ok: true, deleted: true });
      }

      // Soft cancel / kill — works for pending, running, AND paused jobs.
      if (!["pending", "running", "paused"].includes(job.status)) {
        return res.status(409).json({ error: `Cannot cancel a ${job.status} job` });
      }
      // Tear down any live browser / paused wait first so the worker records it
      // as 'cancelled' rather than retrying, then force the DB status to cancelled
      // (covers pending jobs the worker isn't tracking).
      const { abortJob } = await import("./automation/queue-worker");
      await abortJob(job.id);
      await queueService.forceCancelJob(job.id);
      res.json({ ok: true, cancelled: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to process job request" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION LOGS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/automation/logs — paginated, filterable by job/level/date
  app.get("/api/automation/logs", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      let query = db.select().from(automationLogs).$dynamic();
      const conditions = [eq(automationLogs.companyId, cid)];
      if (q.jobId) conditions.push(eq(automationLogs.jobId, q.jobId));
      if (q.level) conditions.push(eq(automationLogs.level, q.level));
      if (q.from) conditions.push(gte(automationLogs.createdAt, q.from));
      if (q.to) conditions.push(lte(automationLogs.createdAt, q.to));

      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(automationLogs)
        .where(and(...conditions));

      query = query
        .where(and(...conditions))
        .orderBy(desc(automationLogs.createdAt))
        .limit(pg.limit)
        .offset(pageToOffset(pg.page, pg.limit));

      const logs = await query;
      res.json({ data: logs, page: pg.page, limit: pg.limit, total: Number(total[0]?.count ?? 0) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch logs" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTAL SESSIONS  (spec: /api/automation/portal-session — singular)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/automation/portal-session — save credentials
  app.post("/api/automation/portal-session", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(
        portalCredentialSchema.extend({ portal: portalSchema }),
        req.body,
        res
      );
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      await portalSessionService.saveCredentials(cidResult.companyId, data.portal, data.username, data.password);
      res.json({ ok: true, portal: data.portal, companyId: cidResult.companyId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to save portal credentials" });
    }
  });

  // GET /api/automation/portal-session/:portal — check if configured (no password in response)
  app.get("/api/automation/portal-session/:portal", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const portalParse = portalSchema.safeParse(req.params.portal);
      if (!portalParse.success) return res.status(400).json({ error: "portal must be 'epfo' or 'esic'" });

      const { companyId: qCid } = req.query as Record<string, string>;
      const cidResult = getCompanyId(user, qCid);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const rows = await db
        .select({
          id: portalSessions.id,
          portal: portalSessions.portal,
          username: portalSessions.username,
          lastLoginAt: portalSessions.lastLoginAt,
          sessionValidUntil: portalSessions.sessionValidUntil,
          isActive: portalSessions.isActive,
          hasCookies: sql<boolean>`(encrypted_cookies IS NOT NULL)`.as("hasCookies"),
          updatedAt: portalSessions.updatedAt,
        })
        .from(portalSessions)
        .where(and(
          eq(portalSessions.companyId, cidResult.companyId),
          eq(portalSessions.portal, portalParse.data),
          eq(portalSessions.isActive, true)
        ))
        .limit(1);

      if (!rows[0]) return res.json({ configured: false });
      res.json({ configured: true, ...rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch portal session" });
    }
  });

  // POST /api/automation/portal-session/test — enqueue login test job
  // NOTE: this must be registered BEFORE the :portal GET route to avoid collision
  app.post("/api/automation/portal-session/test", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(
        z.object({ portal: portalSchema, companyId: z.string().min(1).optional() }),
        req.body,
        res
      );
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const companyId = cidResult.companyId;
      const portal = data.portal;

      // ── Clean slate before fresh login ───────────────────────────────────────
      // 1. Find jobs currently paused (waiting for CAPTCHA/OTP) for this portal
      //    so we can unblock their in-memory resolvers after cancelling.
      const pausedJobs = await queueService.listJobs({ companyId, status: "paused", limit: 50 });
      const portalPausedIds = pausedJobs
        .filter(j => j.jobType.startsWith(portal + "_"))
        .map(j => j.id);

      // 2. Cancel ONLY paused (stuck / waiting for CAPTCHA) jobs for this portal.
      //    Pending jobs are preserved so they run immediately after login.
      const cancelled = await queueService.cancelStuckPortalJobs(companyId, portal);

      // 3. Unblock any in-memory CAPTCHA/OTP resolvers so the queue worker isn't
      //    left hanging on a job that is now cancelled.
      const { resumeResolvers, killIdleSession } = await import("./automation/queue-worker");
      for (const pid of portalPausedIds) {
        const resolver = resumeResolvers.get(pid);
        if (resolver) {
          resumeResolvers.delete(pid);
          resolver("__cancelled__"); // unblocks the promise; automation will error quickly
        }
      }

      // 4. Kill the existing idle browser session so the next login starts fresh.
      killIdleSession(companyId, portal);

      if (cancelled > 0) {
        await queueService.addLog(
          "system", companyId, "info",
          `Re-login initiated: ${cancelled} stale ${portal.toUpperCase()} job(s) cancelled before fresh login`
        ).catch(() => {});
      }

      // 5. Enqueue the fresh login test
      const jobType = portal === "epfo" ? "epfo_login_test" : "esic_login_test";
      const job = await queueService.enqueueJob({
        jobType,
        companyId,
        payload: { portal },
        createdBy: user.id,
        maxRetries: 0,
      });
      res.json({ ok: true, jobId: job.id, cancelledJobs: cancelled });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue portal test" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — REGISTRATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/registrations
  app.get("/api/epfo/registrations", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(epfoRegistrations.companyId, cid)];
      if (q.status) conditions.push(eq(epfoRegistrations.status, q.status));

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(epfoRegistrations)
        .where(and(...conditions));

      const rows = await db
        .select({
          reg: epfoRegistrations,
          employeeName: sql<string>`(select concat(first_name,' ',last_name) from employees e where e.id=epfo_registrations.employee_id)`,
          employeeCode: sql<string>`(select employee_code from employees e where e.id=epfo_registrations.employee_id)`,
        })
        .from(epfoRegistrations)
        .where(and(...conditions))
        .orderBy(desc(epfoRegistrations.createdAt))
        .limit(pg.limit)
        .offset(pageToOffset(pg.page, pg.limit));

      res.json({
        data: rows.map(r => ({ ...r.reg, employeeName: r.employeeName, employeeCode: r.employeeCode })),
        page: pg.page, limit: pg.limit, total: Number(count),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch EPFO registrations" });
    }
  });

  // GET /api/epfo/registrations/employee/:employeeId
  app.get("/api/epfo/registrations/employee/:employeeId", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const [row] = await db
        .select().from(epfoRegistrations)
        .where(eq(epfoRegistrations.employeeId, req.params.employeeId as string))
        .limit(1);
      if (!row) return res.status(404).json({ error: "No EPFO registration found" });
      if (isForbidden(user, row.companyId)) return res.status(403).json({ error: "Access denied" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch registration" });
    }
  });

  // POST /api/epfo/register-employee — enqueue UAN generation
  app.post("/api/epfo/register-employee", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(registerEmployeeSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });
      const { companyId: cid } = cidResult;

      const [emp] = await db.select().from(employees).where(eq(employees.id, data.employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (emp.companyId !== cid) return res.status(403).json({ error: "Employee does not belong to this company" });

      const now = new Date().toISOString();
      const [existing] = await db.select().from(epfoRegistrations).where(
        and(eq(epfoRegistrations.companyId, cid), eq(epfoRegistrations.employeeId, data.employeeId))
      ).limit(1);

      const grossMap = await getGrossSalaryMap([emp.id]);
      const job = await queueService.enqueueJob({
        jobType: "epfo_uan_generate",
        companyId: cid,
        payload: buildRegistrationPayload(emp, grossMap.get(emp.id) ?? 0),
        createdBy: user.id,
      });

      if (existing) {
        await db.update(epfoRegistrations)
          .set({ status: "pending", jobId: job.id, errorMessage: null, updatedAt: now })
          .where(eq(epfoRegistrations.id, existing.id));
        return res.json({ ok: true, jobId: job.id, registrationId: existing.id });
      }

      const id = randomUUID();
      await db.insert(epfoRegistrations).values({
        id, companyId: cid, employeeId: data.employeeId,
        status: "pending", jobId: job.id,
        createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, registrationId: id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue EPFO registration" });
    }
  });

  // POST /api/epfo/bulk-register
  app.post("/api/epfo/bulk-register", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(bulkRegisterSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const emps = await db.select().from(employees).where(
        and(eq(employees.companyId, cidResult.companyId), inArray(employees.id, data.employeeIds))
      );
      if (emps.length === 0) return res.status(404).json({ error: "No matching employees found for this company" });

      const grossMap = await getGrossSalaryMap(emps.map((e) => e.id));
      const job = await queueService.enqueueJob({
        jobType: "epfo_bulk_register",
        companyId: cidResult.companyId,
        payload: { employees: emps.map((e) => buildRegistrationPayload(e, grossMap.get(e.id) ?? 0)) },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id, count: emps.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue bulk EPFO registration" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — KYC
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/kyc/:employeeId
  app.get("/api/epfo/kyc/:employeeId", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rows = await db
        .select().from(epfoKycRecords)
        .where(eq(epfoKycRecords.employeeId, req.params.employeeId as string))
        .orderBy(desc(epfoKycRecords.createdAt));
      if (rows.length > 0 && isForbidden(user, rows[0].companyId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch KYC records" });
    }
  });

  // POST /api/epfo/update-kyc — enqueue KYC update
  app.post("/api/epfo/update-kyc", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(updateKycSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });
      const { companyId: cid } = cidResult;

      const [reg] = await db
        .select({ uan: epfoRegistrations.uan })
        .from(epfoRegistrations)
        .where(and(eq(epfoRegistrations.companyId, cid), eq(epfoRegistrations.employeeId, data.employeeId)))
        .limit(1);

      const jobTypeMap: Record<string, string> = {
        aadhaar: "epfo_kyc_aadhaar",
        pan: "epfo_kyc_pan",
        bank: "epfo_kyc_bank",
      };

      const job = await queueService.enqueueJob({
        jobType: jobTypeMap[data.kycType] as any,
        companyId: cid,
        payload: { employeeId: data.employeeId, kycType: data.kycType, documentNumber: data.documentNumber, uan: reg?.uan ?? null },
        createdBy: user.id,
      });

      const now = new Date().toISOString();
      const [existingKyc] = await db.select().from(epfoKycRecords).where(
        and(
          eq(epfoKycRecords.companyId, cid),
          eq(epfoKycRecords.employeeId, data.employeeId),
          eq(epfoKycRecords.kycType, data.kycType)
        )
      ).limit(1);

      if (existingKyc) {
        await db.update(epfoKycRecords)
          .set({ status: "pending", jobId: job.id, documentNumber: data.documentNumber ?? null, errorMessage: null, updatedAt: now })
          .where(eq(epfoKycRecords.id, existingKyc.id));
        return res.json({ ok: true, jobId: job.id, kycRecordId: existingKyc.id });
      }

      const kycId = randomUUID();
      await db.insert(epfoKycRecords).values({
        id: kycId, companyId: cid, employeeId: data.employeeId,
        uan: reg?.uan ?? null, kycType: data.kycType, status: "pending",
        documentNumber: data.documentNumber ?? null,
        jobId: job.id, createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, kycRecordId: kycId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue KYC update" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPFO — ECR / CHALLANS / PASSBOOK / EXIT
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/epfo/ecr-returns (list)
  app.get("/api/epfo/ecr-returns", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(epfoEcrReturns.companyId, cid)];
      if (q.status) conditions.push(eq(epfoEcrReturns.status, q.status));
      if (q.year) conditions.push(eq(epfoEcrReturns.year, Number(q.year)));

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(epfoEcrReturns).where(and(...conditions));

      const rows = await db.select().from(epfoEcrReturns)
        .where(and(...conditions))
        .orderBy(desc(epfoEcrReturns.year), monthSortSql())
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ECR returns" });
    }
  });

  // POST /api/epfo/file-ecr — create ECR return record + enqueue filing
  app.post("/api/epfo/file-ecr", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(fileEcrSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });
      const { companyId: cid } = cidResult;

      const [existing] = await db.select().from(epfoEcrReturns).where(
        and(eq(epfoEcrReturns.companyId, cid), eq(epfoEcrReturns.month, data.month), eq(epfoEcrReturns.year, data.year))
      ).limit(1);

      if (existing?.status === "filed") {
        return res.status(409).json({ error: "ECR for this month/year is already filed" });
      }

      // Aggregate PF contributions from payroll
      const payrollRows = await db
        .select({ basicSalary: payroll.basicSalary, pfEmployee: payroll.pfEmployee })
        .from(payroll)
        .where(and(eq(payroll.companyId, cid), eq(payroll.month, data.month), eq(payroll.year, data.year)));

      const totalEmployees = payrollRows.length;
      const totalPfWages = payrollRows.reduce((s, r) => s + (r.basicSalary || 0), 0);
      const totalEmployeeContribution = payrollRows.reduce((s, r) => s + (r.pfEmployee || 0), 0);
      const totalEmployerContribution = Math.round(totalPfWages * 0.12);
      const totalAmount = totalEmployeeContribution + totalEmployerContribution;
      const dueDate = calcDueDate(data.month, data.year, "epfo");

      const job = await queueService.enqueueJob({
        jobType: data.bulk ? "epfo_bulk_ecr" : "epfo_ecr_file",
        companyId: cid,
        payload: { month: data.month, year: data.year, totalEmployees, totalAmount },
        createdBy: user.id,
      });

      const now = new Date().toISOString();
      let returnId: string;
      if (existing) {
        await db.update(epfoEcrReturns)
          .set({ status: "pending", jobId: job.id, totalEmployees, totalPfWages, totalEmployeeContribution, totalEmployerContribution, totalAmount, dueDate, errorMessage: null, updatedAt: now })
          .where(eq(epfoEcrReturns.id, existing.id));
        returnId = existing.id;
      } else {
        returnId = randomUUID();
        await db.insert(epfoEcrReturns).values({
          id: returnId, companyId: cid, month: data.month, year: data.year,
          totalEmployees, totalPfWages, totalEmployeeContribution, totalEmployerContribution, totalAmount,
          status: "pending", jobId: job.id, dueDate,
          createdBy: user.id, createdAt: now, updatedAt: now,
        });
      }
      res.status(201).json({ ok: true, jobId: job.id, returnId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to file ECR" });
    }
  });

  // GET /api/epfo/challans
  app.get("/api/epfo/challans", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(challans.companyId, cid), eq(challans.portal, "epfo")];
      if (q.status) conditions.push(eq(challans.status, q.status));
      if (q.year) conditions.push(eq(challans.year, Number(q.year)));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(challans).where(and(...conditions));
      const rows = await db.select().from(challans).where(and(...conditions))
        .orderBy(desc(challans.year), desc(challans.createdAt))
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch EPFO challans" });
    }
  });

  // POST /api/epfo/sync-challans — enqueue challan download/sync
  app.post("/api/epfo/sync-challans", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(syncChallansSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const job = await queueService.enqueueJob({
        jobType: "epfo_challan_download",
        companyId: cidResult.companyId,
        payload: { month: data.month, year: data.year },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue challan sync" });
    }
  });

  // GET /api/epfo/passbook/:uan — enqueue passbook status check
  app.get("/api/epfo/passbook/:uan", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { uan } = req.params;
      if (!uan) return res.status(400).json({ error: "UAN is required" });

      const { companyId: qCid } = req.query as Record<string, string>;
      const cidResult = getCompanyId(user, qCid);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const job = await queueService.enqueueJob({
        jobType: "epfo_passbook_status",
        companyId: cidResult.companyId,
        payload: { uan },
        createdBy: user.id,
        maxRetries: 1,
      });
      res.json({ ok: true, jobId: job.id, uan });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue passbook check" });
    }
  });

  // POST /api/epfo/exit-management — enqueue EPFO exit processing
  app.post("/api/epfo/exit-management", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(exitManagementSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const [emp] = await db.select().from(employees).where(eq(employees.id, data.employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (emp.companyId !== cidResult.companyId) return res.status(403).json({ error: "Employee does not belong to this company" });

      const job = await queueService.enqueueJob({
        jobType: "epfo_exit_management",
        companyId: cidResult.companyId,
        payload: { employeeId: data.employeeId, exitDate: data.exitDate, exitType: data.exitType, uan: emp.uan },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue exit management" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESIC — REGISTRATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/esic/registrations
  app.get("/api/esic/registrations", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(esicRegistrations.companyId, cid)];
      if (q.status) conditions.push(eq(esicRegistrations.status, q.status));

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(esicRegistrations).where(and(...conditions));

      const rows = await db
        .select({
          reg: esicRegistrations,
          employeeName: sql<string>`(select concat(first_name,' ',last_name) from employees e where e.id=esic_registrations.employee_id)`,
          employeeCode: sql<string>`(select employee_code from employees e where e.id=esic_registrations.employee_id)`,
        })
        .from(esicRegistrations)
        .where(and(...conditions))
        .orderBy(desc(esicRegistrations.createdAt))
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({
        data: rows.map(r => ({ ...r.reg, employeeName: r.employeeName, employeeCode: r.employeeCode })),
        page: pg.page, limit: pg.limit, total: Number(count),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC registrations" });
    }
  });

  // GET /api/esic/registrations/employee/:employeeId
  app.get("/api/esic/registrations/employee/:employeeId", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const [row] = await db.select().from(esicRegistrations)
        .where(eq(esicRegistrations.employeeId, req.params.employeeId as string)).limit(1);
      if (!row) return res.status(404).json({ error: "No ESIC registration found" });
      if (isForbidden(user, row.companyId)) return res.status(403).json({ error: "Access denied" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC registration" });
    }
  });

  // POST /api/esic/register-employee
  app.post("/api/esic/register-employee", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(registerEmployeeSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });
      const { companyId: cid } = cidResult;

      const [emp] = await db.select().from(employees).where(eq(employees.id, data.employeeId)).limit(1);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (emp.companyId !== cid) return res.status(403).json({ error: "Employee does not belong to this company" });

      const now = new Date().toISOString();
      const [existing] = await db.select().from(esicRegistrations).where(
        and(eq(esicRegistrations.companyId, cid), eq(esicRegistrations.employeeId, data.employeeId))
      ).limit(1);

      const grossMap = await getGrossSalaryMap([emp.id]);
      const job = await queueService.enqueueJob({
        jobType: "esic_ip_generate",
        companyId: cid,
        payload: buildRegistrationPayload(emp, grossMap.get(emp.id) ?? 0),
        createdBy: user.id,
      });

      if (existing) {
        await db.update(esicRegistrations)
          .set({ status: "pending", jobId: job.id, errorMessage: null, updatedAt: now })
          .where(eq(esicRegistrations.id, existing.id));
        return res.json({ ok: true, jobId: job.id, registrationId: existing.id });
      }

      const id = randomUUID();
      await db.insert(esicRegistrations).values({
        id, companyId: cid, employeeId: data.employeeId,
        status: "pending", jobId: job.id,
        createdBy: user.id, createdAt: now, updatedAt: now,
      });
      res.status(201).json({ ok: true, jobId: job.id, registrationId: id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC registration" });
    }
  });

  // POST /api/esic/bulk-register
  app.post("/api/esic/bulk-register", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(bulkRegisterSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const emps = await db.select().from(employees).where(
        and(eq(employees.companyId, cidResult.companyId), inArray(employees.id, data.employeeIds))
      );
      if (emps.length === 0) return res.status(404).json({ error: "No matching employees found for this company" });

      const grossMap = await getGrossSalaryMap(emps.map((e) => e.id));
      const job = await queueService.enqueueJob({
        jobType: "esic_bulk_register",
        companyId: cidResult.companyId,
        payload: { employees: emps.map((e) => buildRegistrationPayload(e, grossMap.get(e.id) ?? 0)) },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id, count: emps.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC bulk registration" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESIC — CONTRIBUTIONS / MONTHLY RETURNS / CHALLANS / SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/esic/contributions — per-employee ESIC contribution data from payroll
  app.get("/api/esic/contributions", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(payroll.companyId, cid)];
      if (q.month) conditions.push(eq(payroll.month, q.month));
      if (q.year) conditions.push(eq(payroll.year, Number(q.year)));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(payroll).where(and(...conditions));

      const rows = await db
        .select({
          employeeId: payroll.employeeId,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          esiNumber: employees.esiNumber,
          month: payroll.month,
          year: payroll.year,
          esicWages: payroll.basicSalary,
          employeeEsic: payroll.esi,
          payrollStatus: payroll.status,
        })
        .from(payroll)
        .innerJoin(employees, eq(employees.id, payroll.employeeId))
        .where(and(...conditions))
        .orderBy(desc(payroll.year), monthSortSql(), employees.employeeCode)
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC contributions" });
    }
  });

  // GET /api/esic/monthly-returns (list)
  app.get("/api/esic/monthly-returns", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(esicMonthlyReturns.companyId, cid)];
      if (q.status) conditions.push(eq(esicMonthlyReturns.status, q.status));
      if (q.year) conditions.push(eq(esicMonthlyReturns.year, Number(q.year)));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(esicMonthlyReturns).where(and(...conditions));
      const rows = await db.select().from(esicMonthlyReturns)
        .where(and(...conditions))
        .orderBy(desc(esicMonthlyReturns.year), monthSortSql())
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC returns" });
    }
  });

  // POST /api/esic/file-monthly — create ESIC monthly return + enqueue filing
  app.post("/api/esic/file-monthly", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(fileMonthlySSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });
      const { companyId: cid } = cidResult;

      const [existing] = await db.select().from(esicMonthlyReturns).where(
        and(eq(esicMonthlyReturns.companyId, cid), eq(esicMonthlyReturns.month, data.month), eq(esicMonthlyReturns.year, data.year))
      ).limit(1);

      if (existing?.status === "filed") {
        return res.status(409).json({ error: "ESIC return for this month/year is already filed" });
      }

      const [settings] = await db
        .select({ esicEmployerPercent: statutorySettings.esicEmployerPercent })
        .from(statutorySettings)
        .where(eq(statutorySettings.companyId, cid))
        .limit(1);
      const emplrPct = settings?.esicEmployerPercent ?? 325;

      const payrollRows = await db
        .select({ esi: payroll.esi, basicSalary: payroll.basicSalary })
        .from(payroll)
        .where(and(eq(payroll.companyId, cid), eq(payroll.month, data.month), eq(payroll.year, data.year)));

      const totalEmployees = payrollRows.length;
      const totalEsicWages = payrollRows.reduce((s, r) => s + (r.basicSalary || 0), 0);
      const totalEmployeeContribution = payrollRows.reduce((s, r) => s + (r.esi || 0), 0);
      const totalEmployerContribution = Math.round(totalEsicWages * emplrPct / 10000);
      const totalAmount = totalEmployeeContribution + totalEmployerContribution;
      const dueDate = calcDueDate(data.month, data.year, "esic");

      const job = await queueService.enqueueJob({
        jobType: "esic_monthly_file",
        companyId: cid,
        payload: { month: data.month, year: data.year, totalEmployees, totalAmount },
        createdBy: user.id,
      });

      const now = new Date().toISOString();
      let returnId: string;
      if (existing) {
        await db.update(esicMonthlyReturns)
          .set({ status: "pending", jobId: job.id, totalEmployees, totalEsicWages, totalEmployeeContribution, totalEmployerContribution, totalAmount, dueDate, errorMessage: null, updatedAt: now })
          .where(eq(esicMonthlyReturns.id, existing.id));
        returnId = existing.id;
      } else {
        returnId = randomUUID();
        await db.insert(esicMonthlyReturns).values({
          id: returnId, companyId: cid, month: data.month, year: data.year,
          totalEmployees, totalEsicWages, totalEmployeeContribution, totalEmployerContribution, totalAmount,
          status: "pending", jobId: job.id, dueDate,
          createdBy: user.id, createdAt: now, updatedAt: now,
        });
      }
      res.status(201).json({ ok: true, jobId: job.id, returnId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to file ESIC monthly return" });
    }
  });

  // GET /api/esic/challans
  app.get("/api/esic/challans", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(challans.companyId, cid), eq(challans.portal, "esic")];
      if (q.status) conditions.push(eq(challans.status, q.status));
      if (q.year) conditions.push(eq(challans.year, Number(q.year)));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(challans).where(and(...conditions));
      const rows = await db.select().from(challans).where(and(...conditions))
        .orderBy(desc(challans.year), desc(challans.createdAt))
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC challans" });
    }
  });

  // POST /api/esic/sync-challans — enqueue ESIC challan download
  app.post("/api/esic/sync-challans", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(syncChallansSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const job = await queueService.enqueueJob({
        jobType: "esic_challan_download",
        companyId: cidResult.companyId,
        payload: { month: data.month, year: data.year },
        createdBy: user.id,
      });
      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC challan sync" });
    }
  });

  // GET /api/esic/employee-search — enqueue portal search job
  app.get("/api/esic/employee-search", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const data = parseQuery(esicEmployeeSearchSchema.extend({ companyId: z.string().optional() }), q, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const job = await queueService.enqueueJob({
        jobType: "esic_employee_search",
        companyId: cidResult.companyId,
        payload: { query: data.query },
        createdBy: user.id,
        maxRetries: 1,
      });
      res.json({ ok: true, jobId: job.id, query: data.query });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to enqueue ESIC employee search" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/compliance-calendar — upcoming events, auto-seeded + cross-referenced
  app.get("/api/compliance-calendar", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      // Auto-seed next 3 months of EPFO/ESIC events (per spec)
      await ensureUpcomingEvents(cid, 3);

      const conditions = [eq(complianceCalendarEvents.companyId, cid)];
      if (q.year) conditions.push(eq(complianceCalendarEvents.periodYear, Number(q.year)));
      if (q.month) conditions.push(eq(complianceCalendarEvents.periodMonth, q.month));
      if (q.eventType) conditions.push(eq(complianceCalendarEvents.eventType, q.eventType));

      const events = await db.select().from(complianceCalendarEvents)
        .where(and(...conditions))
        .orderBy(complianceCalendarEvents.dueDate);

      // Cross-reference: update status from actual EPFO/ESIC return records
      const now = new Date();
      const nowStr = now.toISOString().slice(0, 10);
      const updates: Promise<void>[] = [];

      for (const ev of events) {
        if (!ev.periodMonth || !ev.periodYear) continue;
        let computedStatus = ev.status;

        if (ev.eventType === "epfo_ecr_due") {
          const [ret] = await db.select({ status: epfoEcrReturns.status }).from(epfoEcrReturns)
            .where(and(eq(epfoEcrReturns.companyId, cid), eq(epfoEcrReturns.month, ev.periodMonth), eq(epfoEcrReturns.year, ev.periodYear)))
            .limit(1);
          if (ret?.status === "filed" || ret?.status === "challan_generated" || ret?.status === "paid") {
            computedStatus = "completed";
          } else if (ev.dueDate < nowStr) {
            computedStatus = "overdue";
          }
        } else if (ev.eventType === "esic_return_due") {
          const [ret] = await db.select({ status: esicMonthlyReturns.status }).from(esicMonthlyReturns)
            .where(and(eq(esicMonthlyReturns.companyId, cid), eq(esicMonthlyReturns.month, ev.periodMonth), eq(esicMonthlyReturns.year, ev.periodYear)))
            .limit(1);
          if (ret?.status === "filed" || ret?.status === "challan_generated" || ret?.status === "paid") {
            computedStatus = "completed";
          } else if (ev.dueDate < nowStr) {
            computedStatus = "overdue";
          }
        } else if (ev.status === "upcoming" && ev.dueDate < nowStr) {
          computedStatus = "overdue";
        }

        if (computedStatus !== ev.status) {
          ev.status = computedStatus;
          updates.push(
            db.update(complianceCalendarEvents)
              .set({ status: computedStatus, updatedAt: now.toISOString() })
              .where(eq(complianceCalendarEvents.id, ev.id))
              .then(() => undefined)
          );
        }
      }
      await Promise.all(updates);

      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch compliance calendar" });
    }
  });

  // GET /api/compliance-calendar/history — past filing statuses cross-referenced
  app.get("/api/compliance-calendar/history", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      // Get EPFO ECR history
      const epfoHistory = await db
        .select({
          period: sql<string>`concat(month, ' ', year)`,
          month: epfoEcrReturns.month,
          year: epfoEcrReturns.year,
          status: epfoEcrReturns.status,
          type: sql<string>`'epfo_ecr'`,
          filedAt: epfoEcrReturns.filedAt,
          dueDate: epfoEcrReturns.dueDate,
          totalAmount: epfoEcrReturns.totalAmount,
          trrn: epfoEcrReturns.trrn,
          challanNo: epfoEcrReturns.challanNo,
          errorMessage: epfoEcrReturns.errorMessage,
        })
        .from(epfoEcrReturns)
        .where(eq(epfoEcrReturns.companyId, cid))
        .orderBy(desc(epfoEcrReturns.year), monthSortSql());

      // Get ESIC monthly return history
      const esicHistory = await db
        .select({
          period: sql<string>`concat(month, ' ', year)`,
          month: esicMonthlyReturns.month,
          year: esicMonthlyReturns.year,
          status: esicMonthlyReturns.status,
          type: sql<string>`'esic_monthly'`,
          filedAt: esicMonthlyReturns.filedAt,
          dueDate: esicMonthlyReturns.dueDate,
          totalAmount: esicMonthlyReturns.totalAmount,
          trrn: sql<null>`null`,
          challanNo: esicMonthlyReturns.challanNo,
          errorMessage: esicMonthlyReturns.errorMessage,
        })
        .from(esicMonthlyReturns)
        .where(eq(esicMonthlyReturns.companyId, cid))
        .orderBy(desc(esicMonthlyReturns.year), monthSortSql());

      const combined = [...epfoHistory, ...esicHistory]
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          const mi = MONTH_NAMES.findIndex(m => m === a.month);
          const mj = MONTH_NAMES.findIndex(m => m === b.month);
          return mj - mi;
        });

      const start = pageToOffset(pg.page, pg.limit);
      res.json({
        data: combined.slice(start, start + pg.limit),
        page: pg.page, limit: pg.limit, total: combined.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch filing history" });
    }
  });

  // POST /api/compliance-calendar — create custom event
  app.post("/api/compliance-calendar", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(calendarEventSchema, req.body, res);
      if (!data) return;

      const cidResult = getCompanyId(user, data.companyId);
      if ("error" in cidResult) return res.status(cidResult.status).json({ error: cidResult.error });

      const now = new Date().toISOString();
      const insertId = randomUUID();
      await db.insert(complianceCalendarEvents).values({
        id: insertId,
        companyId: cidResult.companyId,
        eventType: data.eventType,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        status: new Date(data.dueDate) < new Date() ? "overdue" : "upcoming",
        createdBy: user.id as string,
        createdAt: now, updatedAt: now,
      } as any);
      const [row] = await db.select().from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.companyId, cidResult.companyId))
        .orderBy(desc(complianceCalendarEvents.createdAt)).limit(1);

      // Notify company admins/HR of the new compliance obligation
      try {
        const to = await getComplianceRecipientEmails(cidResult.companyId);
        if (to.length) {
          await sendComplianceReminderEmail({
            to,
            title: data.title,
            dueDate: data.dueDate,
            eventType: data.eventType,
            description: data.description,
            companyId: cidResult.companyId,
          });
        }
      } catch (err) {
        console.error("[Email] compliance reminder failed:", err);
      }

      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create calendar event" });
    }
  });

  // PATCH /api/compliance-calendar/:id
  app.patch("/api/compliance-calendar/:id", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(calendarEventPatchSchema, req.body, res);
      if (!data) return;
      const eventId = req.params.id as string;

      const [existing] = await db.select().from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.id, eventId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (isForbidden(user, existing.companyId)) return res.status(403).json({ error: "Access denied" });

      const set: { status?: string; title?: string; description?: string | null; dueDate?: string; updatedAt: string } = {
        updatedAt: new Date().toISOString(),
      };
      if (data.status) set.status = data.status;
      if (data.title) set.title = data.title;
      if (data.description !== undefined) set.description = data.description ?? null;
      if (data.dueDate) set.dueDate = data.dueDate;

      await db.update(complianceCalendarEvents).set(set).where(eq(complianceCalendarEvents.id, eventId));
      const [updated] = await db.select().from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.id, eventId)).limit(1);

      // Notify admins/HR when the due date or status meaningfully changed
      if ((data.dueDate || data.status) && updated) {
        try {
          const to = await getComplianceRecipientEmails(updated.companyId);
          if (to.length) {
            await sendComplianceReminderEmail({
              to,
              title: updated.title,
              dueDate: updated.dueDate,
              eventType: updated.eventType,
              description: updated.description,
              companyId: updated.companyId,
            });
          }
        } catch (err) {
          console.error("[Email] compliance reminder failed:", err);
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to update event" });
    }
  });

  // DELETE /api/compliance-calendar/:id
  app.delete("/api/compliance-calendar/:id", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const eventId = req.params.id as string;
      const [existing] = await db.select().from(complianceCalendarEvents)
        .where(eq(complianceCalendarEvents.id, eventId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (isForbidden(user, existing.companyId)) return res.status(403).json({ error: "Access denied" });
      await db.delete(complianceCalendarEvents).where(eq(complianceCalendarEvents.id, eventId));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to delete event" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  const reportQuerySchema = z.object({
    month: monthSchema,
    year: z.coerce.number().int().min(2000).max(2100),
    companyId: z.string().optional(),
    format: z.enum(["excel", "pdf"]).default("excel"),
  });

  // GET /api/epfo/reports/contribution — PF contribution report
  app.get("/api/epfo/reports/contribution", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const params = parseQuery(reportQuerySchema, req.query, res);
      if (!params) return;

      const cid = user.role === "super_admin" && params.companyId ? params.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select({
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          uan: employees.uan,
          basicSalary: payroll.basicSalary,
          pfEmployee: payroll.pfEmployee,
          payrollStatus: payroll.status,
        })
        .from(payroll)
        .innerJoin(employees, eq(employees.id, payroll.employeeId))
        .where(and(eq(payroll.companyId, cid), eq(payroll.month, params.month), eq(payroll.year, params.year)))
        .orderBy(employees.employeeCode);

      const data = rows.map(r => ({
        "Employee Code": r.employeeCode,
        "Employee Name": `${r.firstName} ${r.lastName}`,
        "UAN": r.uan || "",
        "PF Wages (₹)": r.basicSalary || 0,
        "Employee PF 12% (₹)": r.pfEmployee || 0,
        "Employer PF 12% (₹)": Math.round((r.basicSalary || 0) * 0.12),
        "Total PF (₹)": (r.pfEmployee || 0) + Math.round((r.basicSalary || 0) * 0.12),
        "Payroll Status": r.payrollStatus,
      }));

      const title = `EPFO PF Contribution — ${params.month} ${params.year}`;
      if (params.format === "pdf") {
        return streamPdfReport(res, title, Object.keys(data[0] || {}), data as any, `EPFO_PF_${params.month}_${params.year}.pdf`);
      }

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [16, 30, 16, 16, 18, 18, 14, 14].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "PF Contribution");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=EPFO_PF_${params.month}_${params.year}.xlsx`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate EPFO report" });
    }
  });

  // GET /api/esic/reports/contribution — ESIC contribution report
  app.get("/api/esic/reports/contribution", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const params = parseQuery(reportQuerySchema, req.query, res);
      if (!params) return;

      const cid = user.role === "super_admin" && params.companyId ? params.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const [settings] = await db
        .select({ esicEmployerPercent: statutorySettings.esicEmployerPercent })
        .from(statutorySettings).where(eq(statutorySettings.companyId, cid)).limit(1);
      const emplrPct = settings?.esicEmployerPercent ?? 325;

      const rows = await db
        .select({
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          esiNumber: employees.esiNumber,
          basicSalary: payroll.basicSalary,
          esi: payroll.esi,
          payrollStatus: payroll.status,
        })
        .from(payroll)
        .innerJoin(employees, eq(employees.id, payroll.employeeId))
        .where(and(eq(payroll.companyId, cid), eq(payroll.month, params.month), eq(payroll.year, params.year)))
        .orderBy(employees.employeeCode);

      const data = rows.map(r => ({
        "Employee Code": r.employeeCode,
        "Employee Name": `${r.firstName} ${r.lastName}`,
        "IP Number": r.esiNumber || "",
        "ESIC Wages (₹)": r.basicSalary || 0,
        "Employee ESIC 0.75% (₹)": r.esi || 0,
        "Employer ESIC 3.25% (₹)": Math.round((r.basicSalary || 0) * emplrPct / 10000),
        "Total ESIC (₹)": (r.esi || 0) + Math.round((r.basicSalary || 0) * emplrPct / 10000),
        "Payroll Status": r.payrollStatus,
      }));

      const title = `ESIC Contribution — ${params.month} ${params.year}`;
      if (params.format === "pdf") {
        return streamPdfReport(res, title, Object.keys(data[0] || {}), data as any, `ESIC_Contribution_${params.month}_${params.year}.pdf`);
      }

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [16, 30, 16, 16, 20, 20, 14, 14].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ESIC Contribution");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=ESIC_Contribution_${params.month}_${params.year}.xlsx`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate ESIC report" });
    }
  });

  // GET /api/automation/reports/failed-filings — jobs that failed
  app.get("/api/automation/reports/failed-filings", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [
        eq(automationJobs.companyId, cid),
        eq(automationJobs.status, "failed"),
      ];
      if (q.jobType) conditions.push(eq(automationJobs.jobType, q.jobType));
      if (q.from) conditions.push(gte(automationJobs.createdAt, q.from));
      if (q.to) conditions.push(lte(automationJobs.createdAt, q.to));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(automationJobs).where(and(...conditions));
      const rows = await db.select().from(automationJobs).where(and(...conditions))
        .orderBy(desc(automationJobs.updatedAt))
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      if (q.format === "excel") {
        const data = rows.map(r => ({
          "Job ID": r.id,
          "Job Type": r.jobType,
          "Error": r.errorMessage || "",
          "Retry Count": r.retryCount,
          "Created At": r.createdAt,
          "Updated At": r.updatedAt,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Failed Filings");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=Failed_Filings.xlsx");
        return res.send(buf);
      }

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate failed-filings report" });
    }
  });

  // GET /api/automation/reports/audit — full audit trail of all jobs
  app.get("/api/automation/reports/audit", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const q = req.query as Record<string, string>;
      const pg = parseQuery(paginationSchema, { page: q.page, limit: q.limit }, res);
      if (!pg) return;

      const cid = user.role === "super_admin" && q.companyId ? q.companyId : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const conditions = [eq(automationJobs.companyId, cid)];
      if (q.status) conditions.push(eq(automationJobs.status, q.status));
      if (q.jobType) conditions.push(eq(automationJobs.jobType, q.jobType));
      if (q.from) conditions.push(gte(automationJobs.createdAt, q.from));
      if (q.to) conditions.push(lte(automationJobs.createdAt, q.to));

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(automationJobs).where(and(...conditions));
      const rows = await db.select().from(automationJobs).where(and(...conditions))
        .orderBy(desc(automationJobs.createdAt))
        .limit(pg.limit).offset(pageToOffset(pg.page, pg.limit));

      if (q.format === "excel") {
        const data = rows.map(r => ({
          "Job ID": r.id,
          "Job Type": r.jobType,
          "Status": r.status,
          "Retry Count": r.retryCount,
          "Started At": r.startedAt || "",
          "Completed At": r.completedAt || "",
          "Error": r.errorMessage || "",
          "Created At": r.createdAt,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Automation Audit");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=Automation_Audit.xlsx");
        return res.send(buf);
      }

      res.json({ data: rows, page: pg.page, limit: pg.limit, total: Number(count) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to generate audit report" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUME — inject CAPTCHA / OTP answer into a paused job
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/automation/jobs/:id/resume  { answer: string }
  app.post("/api/automation/jobs/:id/resume", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const data = parseBody(z.object({ answer: z.string().min(1, "answer is required") }), req.body, res);
      if (!data) return;

      const id = req.params.id as string;
      const worker = await import("./automation/queue-worker");
      const job = await worker.queueService.getJob(id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (isForbidden(user, job.companyId)) return res.status(403).json({ error: "Access denied — job belongs to a different company" });
      if (job.status !== "paused") {
        return res.status(409).json({ error: `Job is not paused (current status: ${job.status})` });
      }
      const resolver = worker.resumeResolvers.get(id);
      if (!resolver) {
        return res.status(404).json({ error: "No active pause handler for this job (worker may have restarted)" });
      }
      worker.resumeResolvers.delete(id);
      await worker.queueService.markJobResumed(id);
      resolver(data.answer.trim());
      res.json({ ok: true, jobId: id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to resume job" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/automation/esic-employees — fetched employee list stored in DB
  app.get("/api/automation/esic-employees", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCid } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCid ? qCid : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(esicFetchedEmployees)
        .where(eq(esicFetchedEmployees.companyId, cid))
        .orderBy(esicFetchedEmployees.ipNo);

      // Get the fetchedAt from the first row (all same batch)
      const fetchedAt = rows[0]?.fetchedAt ?? null;
      res.json({ employees: rows, count: rows.length, fetchedAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch ESIC employees" });
    }
  });

  // GET /api/automation/epfo-employees — latest fetched EPFO member list (from job result)
  app.get("/api/automation/epfo-employees", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCid } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCid ? qCid : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const rows = await db
        .select()
        .from(automationJobs)
        .where(and(
          eq(automationJobs.companyId, cid),
          eq(automationJobs.jobType, "epfo_employee_list"),
          eq(automationJobs.status, "completed"),
        ))
        .orderBy(desc(automationJobs.completedAt))
        .limit(1);

      const result = (rows[0]?.result ?? null) as { employees?: Record<string, string>[]; fetchedAt?: string } | null;
      const employees = Array.isArray(result?.employees) ? result!.employees : [];
      res.json({ employees, count: employees.length, fetchedAt: result?.fetchedAt ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch EPFO employees" });
    }
  });

  app.get("/api/automation/summary", requireAuth, adminRoles, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId: qCid } = req.query as Record<string, string>;
      const cid = user.role === "super_admin" && qCid ? qCid : user.companyId;
      if (!cid) return res.status(400).json({ error: "companyId required" });

      const [epfoReg, esicReg, pendingJobs, failedJobs, ecrReturns, esicReturns] = await Promise.all([
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
        epfoEcrReturns: Number(ecrReturns[0]?.count ?? 0),
        esicMonthlyReturns: Number(esicReturns[0]?.count ?? 0),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch summary" });
    }
  });

  // ── GET /api/esic/contribution-history/file — serve a generated PDF ────────
  app.get("/api/esic/contribution-history/file", requireAuth, adminRoles, (req: Request, res: Response) => {
    const file = (req.query.file as string) ?? "";
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
      return res.status(400).json({ error: "Invalid file name" });
    }
    const baseDir = path.resolve("uploads", "esic-reports");
    const abs = path.resolve(baseDir, file);
    // Defense-in-depth: ensure the resolved path stays inside the reports dir.
    if (abs !== baseDir && !abs.startsWith(baseDir + path.sep)) {
      return res.status(400).json({ error: "Invalid file name" });
    }
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: "File not found. Run the Download PDF job first." });
    }
    res.download(abs, file);
  });
}
