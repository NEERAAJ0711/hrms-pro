// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { companyService, dashboardService, settingsService } from "../services";
import { storage } from "../storage";
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

export async function registerCompanyRoutes(app: Express): Promise<void> {
  // Super admin: extend trial for a company
  app.patch("/api/companies/:id/trial", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { trialDays, trialExtendedDays } = req.body;
      const updates: Record<string, any> = {};
      if (trialDays !== undefined) updates.trial_days = Number(trialDays);
      if (trialExtendedDays !== undefined) updates.trial_extended_days = Number(trialExtendedDays);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No values to update" });
      if (updates.trial_days !== undefined && updates.trial_extended_days !== undefined) {
        await companyService.updateCompanyTrial(id as string, updates.trial_days, updates.trial_extended_days);
      } else if (updates.trial_days !== undefined) {
        await companyService.updateCompanyTrialDays(id as string, updates.trial_days);
      } else {
        await companyService.updateCompanyTrialExtendedDays(id as string, updates.trial_extended_days);
      }
      const company = await companyService.getCompany(id);
      res.json({ success: true, company });
    } catch (error) {
      res.status(500).json({ error: "Failed to update trial" });
    }
  });

  // Upload company logo or signature
  app.post(
    "/api/companies/:id/assets/:type",
    requireAuth,
    requireRole("super_admin", "company_admin"),
    companyAssetUpload.single("file"),
    async (req, res) => {
      try {
        const user = (req as any).user;
        const { id, type } = req.params;
        if (!["logo", "signature"].includes(type)) return res.status(400).json({ error: "Invalid asset type" });
        if (user.role === "company_admin" && user.companyId !== id) {
          return res.status(403).json({ error: "Forbidden" });
        }
        if (!req.file) return res.status(400).json({ error: "No file uploaded or invalid type (jpeg/png/webp/gif only)" });
        // Remove the previous file (if any) so old assets don't accumulate
        const prev = await companyService.getCompany(id);
        const oldPath = type === "logo" ? prev?.logo : (prev as any)?.signature;
        const urlPath = `/uploads/company-assets/${req.file.filename}`;
        if (type === "logo") {
          await companyService.setCompanyLogo(id as string, urlPath);
        } else {
          await companyService.setCompanySignature(id as string, urlPath);
        }
        if (oldPath && oldPath !== urlPath) {
          safeUnlinkCompanyAsset(oldPath);
        }
        const company = await companyService.getCompany(id);
        res.json({ success: true, url: urlPath, company });
      } catch (error) {
        console.error("Company asset upload error:", error);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // Remove company logo or signature
  app.delete(
    "/api/companies/:id/assets/:type",
    requireAuth,
    requireRole("super_admin", "company_admin"),
    async (req, res) => {
      try {
        const user = (req as any).user;
        const { id, type } = req.params;
        if (!["logo", "signature"].includes(type)) return res.status(400).json({ error: "Invalid asset type" });
        if (user.role === "company_admin" && user.companyId !== id) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const company = await companyService.getCompany(id);
        if (company) {
          const existing = type === "logo" ? company.logo : (company as any).signature;
          safeUnlinkCompanyAsset(existing);
        }
        if (type === "logo") {
          await companyService.clearCompanyLogo(id as string);
        } else {
          await companyService.clearCompanySignature(id as string);
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: "Failed to remove asset" });
      }
    }
  );

  // ===== Dashboard Routes =====
  // Dashboard stats are relatively expensive (several aggregate queries) and the
  // page is opened often, so results are cached in-memory for a short TTL per
  // scope (super-admin vs. a specific company). Stale-by-at-most-TTL is acceptable
  // for a stats overview; mutations elsewhere will simply be reflected after TTL.
  const DASHBOARD_CACHE_TTL_MS = 30_000;
  const dashboardCache = new Map<string, { at: number; data: unknown }>();

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const scope =
        user.role === "super_admin"
          ? "super_admin"
          : user.companyId
            ? `company:${user.companyId}`
            : null;
      if (!scope) {
        return res.status(403).json({ error: "Access denied" });
      }

      const cached = dashboardCache.get(scope);
      if (cached && Date.now() - cached.at < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }

      const stats =
        scope === "super_admin"
          ? await dashboardService.getDashboardStats()
          : await dashboardService.getDashboardStatsByCompany(user.companyId);

      dashboardCache.set(scope, { at: Date.now(), data: stats });
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // ===== Company Routes =====
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role === "super_admin") {
        const companies = await companyService.getAllCompanies();
        res.json(companies);
      } else if (user.role === "employee" && !user.companyId) {
        const companies = await companyService.getAllCompanies();
        res.json(companies.map(c => ({ id: c.id, companyName: c.companyName, status: c.status })));
      } else if (user.companyId) {
        const company = await companyService.getCompany(user.companyId);
        res.json(company ? [company] : []);
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await companyService.getCompany(req.params.id);
      if (!company) return res.status(404).json({ error: "Company not found" });
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      // Always set a 3-day trial from today so billing kicks in after trial
      const today = new Date().toISOString().slice(0, 10);
      const company = await companyService.createCompany({
        ...data,
        trialStartDate: data.trialStartDate || today,
        trialDays: data.trialDays ?? 3,
        trialExtendedDays: data.trialExtendedDays ?? 0,
      });
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  // ===== Lookup endpoints (no module-gate — used by User form access pickers) =====
  app.get("/api/lookup/departments", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await settingsService.getMasterDepartmentsByCompany(cid));
    } catch { res.json([]); }
  });

  app.get("/api/lookup/locations", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await settingsService.getMasterLocationsByCompany(cid));
    } catch { res.json([]); }
  });

  app.get("/api/lookup/contractors", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await companyService.getContractorMastersByCompany(cid));
    } catch { res.json([]); }
  });

  // ===== User Routes =====
}
