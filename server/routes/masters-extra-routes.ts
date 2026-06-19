// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { companyService, leaveService } from "../services";
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

export async function registerMastersExtraRoutes(app: Express): Promise<void> {
  app.get("/api/contractor-masters", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      const cid = (companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      return res.json(await companyService.getContractorMastersByCompany(cid));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contractor masters" });
    }
  });

  app.post("/api/contractor-masters", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const data = insertContractorMasterSchema.parse(req.body);
      const record = await companyService.createContractorMaster(data);
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to create contractor master" });
    }
  });

  app.patch("/api/contractor-masters/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const updated = await companyService.updateContractorMaster(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Contractor master not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contractor master" });
    }
  });

  app.delete("/api/contractor-masters/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const success = await companyService.deleteContractorMaster(req.params.id);
      if (!success) return res.status(404).json({ error: "Contractor master not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contractor master" });
    }
  });

  // ===== Leave Policies Routes =====
  app.get("/api/leave-policies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      const cid = (companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      return res.json(await leaveService.getLeavePoliciesByCompany(cid));
    } catch { res.status(500).json({ error: "Failed to fetch leave policies" }); }
  });

  app.post("/api/leave-policies", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const { insertLeavePolicySchema } = await import("@shared/schema");
      const data = insertLeavePolicySchema.parse(req.body);
      const policy = await leaveService.createLeavePolicy(data);
      res.status(201).json(policy);
    } catch (error: any) { res.status(400).json({ error: error.message || "Failed to create leave policy" }); }
  });

  app.patch("/api/leave-policies/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const updated = await leaveService.updateLeavePolicy(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Leave policy not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Failed to update leave policy" }); }
  });

  app.delete("/api/leave-policies/:id", requireAuth, requireAction("masters", "edit"), async (req, res) => {
    try {
      const success = await leaveService.deleteLeavePolicy(req.params.id);
      if (!success) return res.status(404).json({ error: "Leave policy not found" });
      res.json({ success });
    } catch { res.status(500).json({ error: "Failed to delete leave policy" }); }
  });
}
