// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { companyService, employeeService, userService } from "../services";
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

export async function registerAuthRoutes(app: Express): Promise<void> {
  // ===== Auth Routes (Basic) =====
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await userService.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.session.userId = user.id;

      // Auto-link: if this is an employee with a companyId, try to connect their
      // user account to an employee record if not already linked.
      // This fixes accounts created before the userId-link system, or where
      // "Create Login" stored a @company.local placeholder email.
      if (user.companyId && user.role !== "super_admin") {
        try {
          const empToLink = await employeeService.autoLinkUserToEmployee({
            userId: user.id,
            companyId: user.companyId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            username,
          });
          if (empToLink) {
            console.log(`[AutoLink] Linked user ${user.id} (${username}) → employee ${empToLink.id} (${empToLink.employeeCode})`);
          }
        } catch (linkErr) {
          // Non-fatal — log and continue; user can still log in
          console.error("[AutoLink] Failed to auto-link employee record:", linkErr);
        }
      }

      // Ensure we save the session before responding
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Could not save session" });
        res.json(user);
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { signupType = "employee" } = req.body;

      // Check for duplicate username and email before anything
      const existingUsername = await userService.getUserByUsername(req.body.username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken. Please choose another." });
      const existingEmail = await userService.getUserByEmail(req.body.email).catch(() => null);
      if (existingEmail) return res.status(400).json({ message: "An account with this email already exists." });

      if (signupType === "company_admin") {
        const { companyName, username, email, password, firstName, lastName } = req.body;
        if (!companyName || !username || !email || !password) {
          return res.status(400).json({ message: "Company name, username, email, and password are required." });
        }
        // Create company with 3-day trial
        const today = new Date().toISOString().split("T")[0];
        const companyId = crypto.randomUUID();
        await userService.insertSignupCompany(companyId, companyName, today);
        // Create company_admin user
        const userId = crypto.randomUUID();
        await userService.insertSignupUser(userId, username, email, password, firstName, lastName, companyId);
        const user = await userService.getUser(userId);
        req.session.userId = userId;
        return res.status(201).json({ ...user, companyName, trialDaysLeft: 3, trialExpired: false });
      }

      // Default: employee / job seeker signup
      const data = insertUserSchema.parse(req.body);
      const user = await userService.createUser({ ...data, role: "employee" });
      req.session.userId = user.id;
      res.status(201).json(user);
    } catch (error: any) {
      console.error("[signup]", error);
      res.status(400).json({ message: error.message || "Invalid user data" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Could not log out" });
      res.json({ success: true });
    });
  });

  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const action = req.query.action as string | undefined;
      const rows = await userService.getAuditLogs(action, limit);
      res.json(rows.rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      commit: process.env.GIT_COMMIT || "unknown",
      builtAt: process.env.BUILD_TIME || new Date().toISOString(),
      node: process.version,
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const user = await userService.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      let companyName: string | null = null;
      let trialInfo: { trialActive: boolean; trialExpired: boolean; trialDaysLeft: number; trialDaysTotal: number; trialStartDate: string | null } | null = null;
      let paymentStatus: string | null = null;
      if (user.companyId) {
        const company = await companyService.getCompany(user.companyId);
        companyName = company?.companyName || null;
        if (company && company.trialStartDate) {
          const start = new Date(company.trialStartDate);
          const total = (company.trialDays ?? 3) + (company.trialExtendedDays ?? 0);
          const expiry = new Date(start);
          expiry.setDate(expiry.getDate() + total);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          expiry.setHours(23, 59, 59, 999);
          const msLeft = expiry.getTime() - today.getTime();
          const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
          trialInfo = {
            trialActive: true,
            trialExpired: msLeft < 0,
            trialDaysLeft: daysLeft,
            trialDaysTotal: total,
            trialStartDate: company.trialStartDate,
          };

          // If the trial has expired, a company-reported payment still grants
          // access immediately while pending, and stays granted once approved.
          // Only an explicit rejection (or no submission) keeps access locked.
          if (trialInfo.trialExpired) {
            const latest = await db.execute(sql`
              SELECT status FROM payment_submissions
              WHERE company_id = ${user.companyId}
              ORDER BY created_at DESC
              LIMIT 1
            `);
            paymentStatus = ((latest.rows[0] as { status?: string } | undefined)?.status) ?? null;
            if (paymentStatus === "pending" || paymentStatus === "approved") {
              trialInfo.trialExpired = false;
            }
          }
        }
      }
      res.json({ ...user, companyName, ...(trialInfo ?? {}), paymentStatus });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

}
