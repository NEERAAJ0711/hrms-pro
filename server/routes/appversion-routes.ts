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

export async function registerAppVersionRoutes(app: Express): Promise<void> {
  // ─── Mobile App Version Management (Super Admin) ──────────────────────────
  const apkStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "downloads");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _file, cb) => cb(null, "hrms-app-latest.apk"),
  });
  const apkUpload = multer({
    storage: apkStorage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: makeFileFilter(APK_EXTENSIONS),
  });

  app.get("/api/admin/app-version", requireAuth, requireRole("super_admin"), async (_req, res) => {
    try {
      const versionFile = path.join(process.cwd(), "uploads", "downloads", "version.json");
      if (fs.existsSync(versionFile)) {
        const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
        return res.json(data);
      }
      res.json({ version: "1.0.0", buildNumber: 1, downloadUrl: "", releaseNotes: "", mandatory: false });
    } catch {
      res.json({ version: "1.0.0", buildNumber: 1, downloadUrl: "", releaseNotes: "", mandatory: false });
    }
  });

  app.post("/api/admin/app-version", requireAuth, requireRole("super_admin"), apkUpload.single("apk"), async (req: any, res) => {
    try {
      const { version, buildNumber, releaseNotes, mandatory, downloadUrl } = req.body;
      const dir = path.join(process.cwd(), "uploads", "downloads");
      fs.mkdirSync(dir, { recursive: true });
      const apkUrl = req.file ? `/uploads/downloads/hrms-app-latest.apk` : (downloadUrl || "");
      const versionData = {
        version: version || "1.0.0",
        buildNumber: parseInt(buildNumber) || 1,
        downloadUrl: apkUrl,
        releaseNotes: releaseNotes || "",
        mandatory: mandatory === "true" || mandatory === true,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify(versionData, null, 2));
      res.json(versionData);
    } catch (error) {
      console.error("App version update error:", error);
      res.status(500).json({ error: "Failed to update app version" });
    }
  });

}
