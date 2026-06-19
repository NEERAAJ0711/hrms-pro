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
