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
import { notificationService } from "../services";
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

export async function registerNotificationRoutes(app: Express): Promise<void> {
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await notificationService.listForUser(user.id);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const count = await notificationService.unreadCount(user.id);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await notificationService.markRead(req.params.id, user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await notificationService.markAllRead(user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.delete("/api/notifications/clear", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await notificationService.clearForUser(user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  // SSE stream endpoint — real-time notification delivery
  app.get("/api/notifications/stream", requireAuth, (req, res) => {
    const user = (req as any).user;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    addSSEClient(user.id, res);
    const heartbeat = setInterval(() => {
      try { res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`); }
      catch { clearInterval(heartbeat); }
    }, 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      removeSSEClient(user.id, res);
    });
  });

  // ===== Contractor Masters Routes =====
}
