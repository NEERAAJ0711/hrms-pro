// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  notifications, profileUpdateRequests, users as usersTable,
  contractorEmployees as contractorEmployeesTable, employees,
  insertUserSchema, insertCompanySchema, insertEmployeeSchema, insertAttendanceSchema,
  insertLeaveTypeSchema, insertLeaveRequestSchema, insertSalaryStructureSchema, insertPayrollSchema,
  insertSettingSchema, insertMasterDepartmentSchema, insertMasterDesignationSchema, insertMasterLocationSchema,
  insertEarningHeadSchema, insertDeductionHeadSchema, insertStatutorySettingsSchema, insertTimeOfficePolicySchema,
  insertFnfSettlementSchema, insertHolidaySchema, insertBiometricDeviceSchema, insertJobPostingSchema,
  insertJobApplicationSchema, insertWageGradeSchema, insertContractorMasterSchema
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { queueService } from "../queue-service";
import { createNotification, createNotificationForMany } from "../notifications";
import { addSSEClient, removeSSEClient } from "../sse";
import { setOpenAIKeyOverride, setGeminiKeyOverride, loadAllApiKeysFromDB } from "../ai-service";
import { getAdmsActivityLog, getAdmsActivityLogFromDB, getAdmsServerStatus, processAttlog, processUserRecords } from "../adms";
import * as dnsPromises from "dns/promises";
import multer from "multer";
import { makeFileFilter, DOCUMENT_EXTENSIONS, DATA_EXTENSIONS, APK_EXTENSIONS } from "../upload-security";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
  requireAuth, requireRole, requireModuleAccess, requireAction,
  userHasAccess, MODULE_ACCESS, formatAge, resolveEmployeeUserId, getHrAdminIds,
  resolveAllowedLocationNames, getAllowedEmployeeIdsForUser,
  validateBiometricDeviceAuth, validateBiometricNetwork,
  upload, docUpload, companyAssetUpload, safeUnlinkCompanyAsset,
  COMPANY_ASSETS_DIR, DOC_UPLOAD_DIR, daysInMonth,
} from "./shared";

export async function registerAutomationRoutes(app: Express): Promise<void> {
  // ─── Automation: latest portal employee list result ───────────────────────────
  app.get("/api/automation/portal-employee-list/:portal", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const portal = req.params.portal as "esic" | "epfo";
      if (portal !== "esic" && portal !== "epfo") return res.status(400).json({ error: "portal must be esic or epfo" });

      const companyId = req.query.companyId as string | undefined;
      const effectiveCid = user.role === "super_admin" ? companyId : user.companyId;
      if (!effectiveCid) return res.status(400).json({ error: "companyId required" });

      const jobType = portal === "esic" ? "esic_employee_list" : "epfo_employee_list";
      const jobs = await queueService.listJobs({ companyId: effectiveCid, jobType, status: "completed", limit: 1 });
      if (!jobs.length) return res.json({ data: null, job: null });
      const job = jobs[0];
      res.json({ data: job.result ?? null, job: { id: job.id, completedAt: job.completedAt, createdAt: job.createdAt } });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch employee list" });
    }
  });

  // ─── Automation: saved portal form snapshots ──────────────────────────────────
  // Lists the form snapshots captured during a registration run (rendered HTML +
  // distilled field id/name/type list) so an engineer can correct mismatched
  // selectors offline instead of re-running a full live job.
  app.get("/api/automation/jobs/:id/form-snapshots", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id).catch(() => null);
      if (!job) return res.status(404).json({ error: "Job not found" });
      // Non-super-admins may only view their own company's jobs.
      if (user.role !== "super_admin" && job.companyId !== user.companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const dir = path.join(process.cwd(), "uploads", "automation-screenshots", job.id);
      if (!fs.existsSync(dir)) return res.json({ snapshots: [] });

      const files = fs.readdirSync(dir);
      // Group HTML + its sibling fields JSON by shared "NNN-label" prefix.
      // NOTE: the snapshot HTML is untrusted portal markup. It is NOT linked
      // through the static /uploads mount (which would render it as an active
      // same-origin page → stored-XSS). Instead each artifact is served through
      // the authenticated, non-executable download route below.
      const byPrefix = new Map<string, { label: string; htmlUrl?: string; fieldsUrl?: string }>();
      for (const f of files) {
        let prefix: string | null = null;
        let kind: "html" | "fields" | null = null;
        if (f.endsWith(".form.html")) { prefix = f.slice(0, -".form.html".length); kind = "html"; }
        else if (f.endsWith(".fields.json")) { prefix = f.slice(0, -".fields.json".length); kind = "fields"; }
        if (!prefix || !kind) continue;

        const label = prefix.replace(/^\d+-/, "");
        const entry = byPrefix.get(prefix) ?? { label };
        const url = `/api/automation/jobs/${job.id}/form-snapshots/${encodeURIComponent(f)}`;
        if (kind === "html") entry.htmlUrl = url;
        else entry.fieldsUrl = url;
        byPrefix.set(prefix, entry);
      }

      const snapshots = Array.from(byPrefix.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([prefix, v]) => ({ id: prefix, ...v }));
      res.json({ snapshots });
    } catch (err) {
      res.status(500).json({ error: "Failed to list form snapshots" });
    }
  });

  // ─── Automation: download a single saved form snapshot (auth-gated) ────────────
  // Serves snapshot artifacts behind auth + company authorization. Crucially, the
  // captured portal HTML is untrusted, so it is served as text/plain with
  // nosniff + an attachment disposition — never as active text/html on the app
  // origin — to eliminate any stored-XSS / origin-confusion risk.
  app.get("/api/automation/jobs/:id/form-snapshots/:file", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const job = await queueService.getJob(req.params.id).catch(() => null);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (user.role !== "super_admin" && job.companyId !== user.companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Reject any path traversal — only a bare snapshot filename is allowed.
      const requested = String(req.params.file);
      const safeName = path.basename(requested);
      if (safeName !== requested) return res.status(400).json({ error: "Invalid file name" });
      const isHtml = safeName.endsWith(".form.html");
      const isFields = safeName.endsWith(".fields.json");
      if (!isHtml && !isFields) return res.status(400).json({ error: "Invalid file type" });

      const dir = path.join(process.cwd(), "uploads", "automation-screenshots", job.id);
      const filePath = path.join(dir, safeName);
      // Defence-in-depth: ensure the resolved path is still inside the job dir.
      if (!filePath.startsWith(dir + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Snapshot not found" });
      }

      const content = fs.readFileSync(filePath, "utf8");
      // Never serve as text/html. text/plain + nosniff guarantees the browser
      // will not parse/execute the untrusted portal markup as a page.
      res.setHeader("Content-Type", isFields ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(content);
    } catch (err) {
      res.status(500).json({ error: "Failed to load form snapshot" });
    }
  });

  // ─── Automation: live browser screenshot ──────────────────────────────────────
  // Returns the current Playwright screenshot as PNG.
  // While the browser is still cold-starting (page not open yet), serves a slim
  // SVG placeholder so the live-screen shows "Launching…" instead of the empty
  // "Waiting for browser" state.
  app.get("/api/automation/jobs/:id/live-screenshot", requireAuth, async (req: Request, res: Response) => {
    try {
      const { activePages } = await import("../automation/queue-worker");
      const page = activePages.get(req.params.id);

      if (!page) {
        // Browser hasn't opened its page yet — check if this job is actually active
        const job = await queueService.getJob(req.params.id).catch(() => null);
        if (job && (job.status === "running" || job.status === "paused" || job.status === "pending")) {
          // Serve a styled placeholder so the live-screen renders immediately
          const label = job.status === "pending"
            ? "Job queued — waiting to start…"
            : "Launching browser — please wait…";
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#020617"/>
  <rect x="490" y="310" width="300" height="100" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
  <text x="640" y="354" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="#94a3b8">\u23f3 ${label}</text>
  <text x="640" y="384" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#334155">Chromium will appear here once it starts</text>
</svg>`;
          res.setHeader("Content-Type", "image/svg+xml");
          res.setHeader("Cache-Control", "no-store");
          return res.send(svg);
        }
        return res.status(404).json({ error: "No active browser for this job" });
      }

      const buf = await page.screenshot({ fullPage: false }).catch(() => null);
      if (!buf) return res.status(503).json({ error: "Screenshot failed" });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: "Screenshot error" });
    }
  });

}
