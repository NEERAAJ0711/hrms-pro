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

export async function registerSystemRoutes(app: Express): Promise<void> {
  // Returns the caller's public IP as seen by this server.
  // Used by the "Auto-detect" button in the Add Machine dialog so the user
  // doesn't have to manually look up their router's WAN IP.
  app.get("/api/server/my-ip", requireAuth, (req, res) => {
    const raw = req.ip || req.socket.remoteAddress || "";
    // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
    const ip = raw.replace(/^::ffff:/, "");
    res.json({ ip });
  });

  // Returns the server's resolved public IP for ADMS device configuration.
  // IMPORTANT: ZKTeco x2008 and virtually all biometric devices only support
  // plain HTTP — never HTTPS. Always return http:// ADMS URLs regardless of
  // whether the dashboard itself is served over HTTPS. The device talks
  // directly to port 8181 (plain HTTP, dedicated ADMS listener).
  app.get("/api/server/network-info", requireAuth, async (req, res) => {
    try {
      const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || null;
      const reqHost = req.hostname;
      const host = (reqHost === "localhost" || reqHost === "127.0.0.1")
        ? (replitDevDomain || reqHost)
        : reqHost;

      let ip: string | null = null;
      try {
        const result = await dnsPromises.lookup(host, { family: 4 });
        ip = result.address;
      } catch {
        // DNS failed — skip
      }
      // Fallback: use ipify to get server's outbound IP
      if (!ip || ip.startsWith("127.") || ip.startsWith("::")) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
          clearTimeout(timer);
          const j = await r.json() as { ip: string };
          ip = j.ip;
        } catch { /* ignore */ }
      }

      // Dedicated ADMS port — device connects here over plain HTTP (no HTTPS).
      const admsPort = parseInt(process.env.ADMS_PORT || "8181", 10);

      // Always http:// — biometric devices do not support HTTPS/TLS.
      const admsUrl   = `http://${host}:${admsPort}/iclock/cdata`;
      const admsUrlIp = ip ? `http://${ip}:${admsPort}/iclock/cdata` : null;

      res.json({
        host,
        replitDevDomain,
        ip,
        port: String(admsPort),
        proto: "http",
        admsUrl,
        admsUrlIp,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to resolve network info" });
    }
  });
}
