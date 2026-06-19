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

export async function registerSettingsRoutes(app: Express): Promise<void> {
  app.get("/api/settings", requireAuth, requireModuleAccess("settings"), async (req, res) => {
    try {
      const user = (req as any).user;
      let settings;
      if (user.role === "super_admin") {
        settings = await storage.getAllSettings();
      } else if (user.companyId) {
        settings = (await storage.getAllSettings()).filter(s => s.companyId === null || s.companyId === user.companyId);
      } else {
        settings = [];
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAuth, requireAction("settings", "edit"), async (req, res) => {
    try {
      const data = insertSettingSchema.parse(req.body);
      const existing = await storage.getSettingByKey(data.companyId || null, data.key);
      if (existing) {
        const updated = await storage.updateSetting(existing.id, data);
        return res.json(updated);
      }
      const setting = await storage.createSetting(data);
      res.status(201).json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  // ===== API Keys Routes (super_admin only) =====
  const maskKey = (val: string) =>
    val.length > 8 ? val.slice(0, 7) + "..." + val.slice(-4) : (val ? "****" : "");

  app.get("/api/settings/api-keys", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const [openaiRow, geminiRow] = await Promise.all([
        storage.getSettingByKey(null, "openai_api_key"),
        storage.getSettingByKey(null, "gemini_api_key"),
      ]);
      const openaiVal = openaiRow?.value || "";
      const geminiVal = geminiRow?.value || "";
      res.json({
        openai: { set: !!openaiVal, hint: maskKey(openaiVal) },
        gemini: { set: !!geminiVal, hint: maskKey(geminiVal) },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/settings/api-keys", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const { openaiApiKey, geminiApiKey } = req.body as { openaiApiKey?: string; geminiApiKey?: string };

      const upsert = async (dbKey: string, rawValue: string) => {
        const key = rawValue.trim();
        const existing = await storage.getSettingByKey(null, dbKey);
        if (existing) {
          await storage.updateSetting(existing.id, { value: key });
        } else {
          await storage.createSetting({ key: dbKey, value: key, category: "api_keys", companyId: null });
        }
        return key;
      };

      if (openaiApiKey !== undefined) {
        const key = await upsert("openai_api_key", openaiApiKey);
        setOpenAIKeyOverride(key || null);
      }
      if (geminiApiKey !== undefined) {
        const key = await upsert("gemini_api_key", geminiApiKey);
        setGeminiKeyOverride(key || null);
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save API keys" });
    }
  });

  // ===== Statutory Settings Routes =====
  app.get("/api/statutory-settings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        const settings = await storage.getStatutorySettingsByCompany(companyId as string);
        return res.json(settings ? [settings] : []);
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const company of allCompanies) {
          const s = await storage.getStatutorySettingsByCompany(company.id);
          if (s) results.push(s);
        }
        return res.json(results);
      }
      if (user.companyId) {
        const settings = await storage.getStatutorySettingsByCompany(user.companyId);
        return res.json(settings ? [settings] : []);
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statutory settings" });
    }
  });

  app.post("/api/statutory-settings", requireAuth, async (req, res) => {
    try {
      const data = insertStatutorySettingsSchema.parse(req.body);
      const settings = await storage.createStatutorySettings(data);
      res.status(201).json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to create statutory settings" });
    }
  });

  app.patch("/api/statutory-settings/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateStatutorySettings(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Statutory settings not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update statutory settings" });
    }
  });

  // ===== Master Departments Routes =====
  app.get("/api/master-departments", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        const depts = await storage.getMasterDepartmentsByCompany(companyId as string);
        return res.json(depts);
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterDepartments());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterDepartmentsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/master-departments", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const data = insertMasterDepartmentSchema.parse(req.body);
      const dept = await storage.createMasterDepartment(data);
      res.status(201).json(dept);
    } catch (error) {
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.patch("/api/master-departments/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const updated = await storage.updateMasterDepartment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Department not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/master-departments/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const success = await storage.deleteMasterDepartment(req.params.id);
      if (!success) return res.status(404).json({ error: "Department not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // ===== Master Designations Routes =====
  app.get("/api/master-designations", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getMasterDesignationsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterDesignations());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterDesignationsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch designations" });
    }
  });

  app.post("/api/master-designations", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const data = insertMasterDesignationSchema.parse(req.body);
      const desg = await storage.createMasterDesignation(data);
      res.status(201).json(desg);
    } catch (error) {
      res.status(500).json({ error: "Failed to create designation" });
    }
  });

  app.patch("/api/master-designations/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const updated = await storage.updateMasterDesignation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Designation not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update designation" });
    }
  });

  app.delete("/api/master-designations/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const success = await storage.deleteMasterDesignation(req.params.id);
      if (!success) return res.status(404).json({ error: "Designation not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete designation" });
    }
  });

  // ===== Wage Grades Routes =====
  // Authz: GET filtered by user's companyId unless super_admin; mutations
  // require masters module access AND record-level company ownership.
  const canTouchWageGrade = (user: { role?: string; companyId?: string | null }, companyId: string) =>
    user.role === "super_admin" || (!!user.companyId && user.companyId === companyId);

  app.get("/api/wage-grades", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        if (!canTouchWageGrade(user, companyId as string)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        return res.json(await storage.getWageGradesByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllWageGrades());
      }
      if (user.companyId) {
        return res.json(await storage.getWageGradesByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wage grades" });
    }
  });

  app.post("/api/wage-grades", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertWageGradeSchema.parse(req.body);
      if (!canTouchWageGrade(user, data.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (data.effectiveFrom && data.name && data.state) {
        const existing = await storage.getWageGradesByCompany(data.companyId);
        const sameGrades = existing
          .filter(g => g.name === data.name && g.state === data.state && g.effectiveFrom)
          .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""));

        if (sameGrades.length > 0) {
          const latest = sameGrades[0];

          // Reject exact duplicate date
          if (latest.effectiveFrom === data.effectiveFrom) {
            return res.status(400).json({
              error: `A "${data.name}" grade for ${data.state} already exists with effective date ${data.effectiveFrom}. Choose a different date.`,
            });
          }

          // Enforce minimum 1-month gap
          const latestDate = new Date(latest.effectiveFrom!);
          const newDate = new Date(data.effectiveFrom);
          const minAllowed = new Date(latestDate);
          minAllowed.setMonth(minAllowed.getMonth() + 1);

          if (newDate < minAllowed) {
            return res.status(400).json({
              error: `Minimum 1-month gap required. The previous "${data.name}" (${data.state}) entry is effective from ${latest.effectiveFrom}. New entry must be effective from ${minAllowed.toISOString().slice(0, 10)} or later.`,
            });
          }

          // Auto-close previous active grade: effectiveTo = new date - 1 day
          const closingDate = new Date(newDate);
          closingDate.setDate(closingDate.getDate() - 1);
          await storage.updateWageGrade(latest.id, {
            effectiveTo: closingDate.toISOString().slice(0, 10),
            status: "closed",
          });
        }
      }

      const grade = await storage.createWageGrade(data);
      res.status(201).json(grade);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wage grade", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create wage grade" });
    }
  });

  app.patch("/api/wage-grades/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getWageGrade(req.params.id);
      if (!existing) return res.status(404).json({ error: "Wage grade not found" });
      if (!canTouchWageGrade(user, existing.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const data = insertWageGradeSchema.partial().parse(req.body);
      // Forbid moving a grade to a different company
      if (data.companyId && !canTouchWageGrade(user, data.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateWageGrade(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Wage grade not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wage grade", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update wage grade" });
    }
  });

  app.delete("/api/wage-grades/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getWageGrade(req.params.id);
      if (!existing) return res.status(404).json({ error: "Wage grade not found" });
      if (!canTouchWageGrade(user, existing.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const success = await storage.deleteWageGrade(req.params.id);
      if (!success) return res.status(404).json({ error: "Wage grade not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete wage grade" });
    }
  });

  // ===== Master Locations Routes =====
  app.get("/api/master-locations", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getMasterLocationsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterLocations());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterLocationsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.post("/api/master-locations", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const data = insertMasterLocationSchema.parse(req.body);
      const loc = await storage.createMasterLocation(data);
      res.status(201).json(loc);
    } catch (error) {
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.patch("/api/master-locations/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const updated = await storage.updateMasterLocation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Location not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/master-locations/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const success = await storage.deleteMasterLocation(req.params.id);
      if (!success) return res.status(404).json({ error: "Location not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // ===== Earning Heads Routes =====
  app.get("/api/earning-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getEarningHeadsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const heads = await storage.getEarningHeadsByCompany(c.id);
          results.push(...heads);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getEarningHeadsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch earning heads" });
    }
  });

  app.post("/api/earning-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const body = { ...req.body };
      if (!body.companyId && user.companyId) body.companyId = user.companyId;
      const data = insertEarningHeadSchema.parse(body);
      const head = await storage.createEarningHead(data);
      res.status(201).json(head);
    } catch (error: any) {
      const msg = error?.errors ? JSON.stringify(error.errors) : (error?.message || String(error));
      console.error("[earning-heads POST] ERROR:", msg);
      res.status(500).json({ error: "Failed to create earning head" });
    }
  });

  app.patch("/api/earning-heads/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateEarningHead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Earning head not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update earning head" });
    }
  });

  app.delete("/api/earning-heads/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteEarningHead(req.params.id);
      if (!success) return res.status(404).json({ error: "Earning head not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete earning head" });
    }
  });

  // ===== Deduction Heads Routes =====
  app.get("/api/deduction-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getDeductionHeadsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const heads = await storage.getDeductionHeadsByCompany(c.id);
          results.push(...heads);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getDeductionHeadsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deduction heads" });
    }
  });

  app.post("/api/deduction-heads", requireAuth, async (req, res) => {
    try {
      const data = insertDeductionHeadSchema.parse(req.body);
      const head = await storage.createDeductionHead(data);
      res.status(201).json(head);
    } catch (error) {
      res.status(500).json({ error: "Failed to create deduction head" });
    }
  });

  app.patch("/api/deduction-heads/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateDeductionHead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Deduction head not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update deduction head" });
    }
  });

  app.delete("/api/deduction-heads/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteDeductionHead(req.params.id);
      if (!success) return res.status(404).json({ error: "Deduction head not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete deduction head" });
    }
  });

  // ===== Time Office Policies Routes =====
  app.get("/api/time-office-policies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getTimeOfficePoliciesByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const policies = await storage.getTimeOfficePoliciesByCompany(c.id);
          results.push(...policies);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getTimeOfficePoliciesByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time office policies" });
    }
  });

  app.post("/api/time-office-policies", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.weeklyOff2 === "" || body.weeklyOff2 === "__none__") body.weeklyOff2 = null;
      const data = insertTimeOfficePolicySchema.parse(body);
      const policy = await storage.createTimeOfficePolicy(data);
      res.status(201).json(policy);
    } catch (error: any) {
      console.error("Time office policy create error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to create time office policy" });
    }
  });

  app.patch("/api/time-office-policies/:id", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.weeklyOff2 === "" || body.weeklyOff2 === "__none__") body.weeklyOff2 = null;
      const updated = await storage.updateTimeOfficePolicy(req.params.id, body);
      if (!updated) return res.status(404).json({ error: "Time office policy not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Time office policy update error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to update time office policy" });
    }
  });

  app.delete("/api/time-office-policies/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteTimeOfficePolicy(req.params.id);
      if (!success) return res.status(404).json({ error: "Time office policy not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete time office policy" });
    }
  });

  // ===== FnF Settlements Routes =====
  app.get("/api/fnf-settlements", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getFnfSettlementsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllFnfSettlements());
      }
      if (user.companyId) {
        return res.json(await storage.getFnfSettlementsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch F&F settlements" });
    }
  });

  app.post("/api/fnf-settlements", requireAuth, async (req, res) => {
    try {
      const data = insertFnfSettlementSchema.parse(req.body);
      const settlement = await storage.createFnfSettlement(data);
      res.status(201).json(settlement);
    } catch (error) {
      res.status(500).json({ error: "Failed to create F&F settlement" });
    }
  });

  app.patch("/api/fnf-settlements/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateFnfSettlement(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "F&F settlement not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update F&F settlement" });
    }
  });

  app.delete("/api/fnf-settlements/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteFnfSettlement(req.params.id);
      if (!success) return res.status(404).json({ error: "F&F settlement not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete F&F settlement" });
    }
  });

  // ===== Holidays Routes =====
  app.get("/api/holidays", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getHolidaysByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllHolidays());
      }
      if (user.companyId) {
        return res.json(await storage.getHolidaysByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  app.post("/api/holidays", requireAuth, async (req, res) => {
    try {
      const data = insertHolidaySchema.parse(req.body);
      const holiday = await storage.createHoliday(data);
      res.status(201).json(holiday);
    } catch (error) {
      res.status(500).json({ error: "Failed to create holiday" });
    }
  });

  app.patch("/api/holidays/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHoliday(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Holiday not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update holiday" });
    }
  });

  app.delete("/api/holidays/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteHoliday(req.params.id);
      if (!success) return res.status(404).json({ error: "Holiday not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete holiday" });
    }
  });

  // ===== Company CRUD Additions =====
}
