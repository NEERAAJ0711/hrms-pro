// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { attendanceService, employeeService, leaveService, payrollService, settingsService } from "../services";
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

export async function registerSelfServiceRoutes(app: Express): Promise<void> {
  app.get("/api/my-payslips", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.status(404).json({ error: "Employee record not found" });
      const records = await payrollService.getPayrollByEmployee(employee.id);
      res.json(records.filter((p: any) => p.status === "paid" || p.status === "processed"));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch payslips" });
    }
  });

  // ===== Leave Adjustment Routes =====
  app.get("/api/leave-adjustments", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin"].includes(user.role);
      if (isAdmin) {
        const rows = await leaveService.getLeaveAdjustmentsByCompany(user.companyId || "");
        return res.json(rows);
      }
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.json([]);
      res.json(await leaveService.getLeaveAdjustmentsByEmployee(employee.id));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch leave adjustments" });
    }
  });

  app.post("/api/leave-adjustments", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("leave", "configure"), async (req, res) => {
    try {
      const user = (req as any).user;
      const row = await leaveService.createLeaveAdjustment({ ...req.body, companyId: req.body.companyId || user.companyId, adjustedBy: String(user.id) });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to create leave adjustment" });
    }
  });

  app.delete("/api/leave-adjustments/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("leave", "configure"), async (req, res) => {
    try {
      await leaveService.deleteLeaveAdjustment(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // ===== Comp-Off Routes =====
  // Returns attendance dates eligible for comp-off, purely from the attendance table.
  //
  // "weekly_off"  → any attendance with a real punch on the employee's weekly-off day
  //                 (per their time-office policy), OR any row stored as status="weekend"
  // "holiday"     → any attendance with a real punch on a company holiday date,
  //                 OR any row stored as status="holiday"
  // "extra_shift" → attendance rows with status = "present" and otHours > 0
  //
  // We deliberately accept multiple status values ("weekend"/"week_off"/"weekly_off",
  // "holiday"/"hol", "present", "half_day") because different code paths (quick entry,
  // biometric sync, manual edit) historically use different conventions.
  app.get("/api/comp-off/qualifying-dates", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const type = (req.query.type as string) || "weekly_off";
      console.log(`[comp-off/qualifying-dates] user.id=${user.id} role=${user.role} type=${type}`);

      const employee = await employeeService.getEmployeeByUserId(String(user.id));
      console.log(`[comp-off/qualifying-dates] employee=${employee?.id ?? "NOT FOUND"}`);
      if (!employee) return res.json([]);

      // 90-day window (YYYY-MM-DD strings, safe for lexicographic comparison)
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const todayStr  = fmt(new Date());
      const cutoffD   = new Date(); cutoffD.setDate(cutoffD.getDate() - 90);
      const cutoffStr = fmt(cutoffD);

      // Pull all attendance for this employee in the 90-day window via raw SQL
      const rows = await attendanceService.getAttendanceWindowRaw(employee.id, cutoffStr, todayStr);
      const attRows = ((rows as any).rows ?? rows) as Array<{
        date: string; status: string; otHours: string | null;
        clockIn: string | null; clockOut: string | null;
      }>;
      console.log(`[comp-off/qualifying-dates] attRows=${attRows.length} type=${type}`);

      // Company holidays for "holiday" type
      const holidays = await settingsService.getHolidaysByCompany(employee.companyId);
      const holidaySet = new Set(holidays.map((h: any) => h.date as string));

      // Employee's weekly-off schedule (lowercase day names: "sunday", "saturday", etc.)
      let weeklyOffDays: Set<string> = new Set(["sunday"]); // safe default
      if (employee.timeOfficePolicyId) {
        const policy = await settingsService.getTimeOfficePolicy(employee.timeOfficePolicyId);
        if (policy) {
          weeklyOffDays = new Set();
          if (policy.weeklyOff1) weeklyOffDays.add(String(policy.weeklyOff1).toLowerCase());
          if (policy.weeklyOff2) weeklyOffDays.add(String(policy.weeklyOff2).toLowerCase());
        }
      }
      const dayName = (dateStr: string) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date(y, m - 1, d).getDay()];
      };

      // A "real punch" = clockIn or clockOut is set and is not the zero-time placeholder
      const isRealTime = (t: string | null) =>
        !!t && t !== "00:00" && t !== "00:00:00" && t !== "0:00";
      const hadPunch = (r: typeof attRows[number]) =>
        isRealTime(r.clockIn) || isRealTime(r.clockOut);

      // Normalize the many ways "weekend" and "holiday" statuses are spelled
      const isWeekendStatus = (s: string) =>
        ["weekend", "week_off", "weekly_off", "wo"].includes((s || "").toLowerCase());
      const isHolidayStatus = (s: string) =>
        ["holiday", "hol", "public_holiday"].includes((s || "").toLowerCase());
      const isPresentStatus = (s: string) =>
        ["present", "half_day", "miss_punch"].includes((s || "").toLowerCase());

      let eligible: typeof attRows;

      if (type === "weekly_off") {
        eligible = attRows.filter(r => {
          // Case A: row explicitly marked as weekly-off in DB → qualifies as long as
          //         we have any signal the employee actually came in (real punch OR OT)
          if (isWeekendStatus(r.status)) {
            return hadPunch(r) || (r.otHours ? parseFloat(r.otHours) > 0 : false);
          }
          // Case B: row marked "present"/"half_day" but the calendar day IS the
          //         employee's policy weekly off → they worked on their off day
          if (isPresentStatus(r.status) && weeklyOffDays.has(dayName(r.date))) {
            return true;
          }
          return false;
        });
      } else if (type === "holiday") {
        eligible = attRows.filter(r => {
          if (isHolidayStatus(r.status)) {
            return hadPunch(r) || (r.otHours ? parseFloat(r.otHours) > 0 : false);
          }
          if (isPresentStatus(r.status) && holidaySet.has(r.date)) {
            return true;
          }
          return false;
        });
      } else if (type === "extra_shift") {
        eligible = attRows.filter(r =>
          isPresentStatus(r.status) && r.otHours && parseFloat(r.otHours) > 0
        );
      } else {
        eligible = [];
      }

      console.log(`[comp-off/qualifying-dates] eligible before dedup=${eligible.length}`);

      // Remove dates that already have a non-rejected comp-off application.
      // Rejected applications should NOT block re-applying for the same date.
      const existing = await leaveService.getCompOffByEmployee(employee.id);
      const usedDates = new Set(
        existing
          .filter((c: any) => (c.status ?? "").toLowerCase() !== "rejected")
          .map((c: any) => (c.workedDate ?? c.worked_date ?? null) as string | null)
          .filter(Boolean)
      );
      eligible = eligible.filter(r => !usedDates.has(r.date));

      console.log(`[comp-off/qualifying-dates] final=${eligible.length}`);
      res.json(eligible);
    } catch (err) {
      console.error("[comp-off qualifying-dates]", err);
      res.status(500).json({ error: "Failed to fetch qualifying dates" });
    }
  });

  app.get("/api/comp-off", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      if (isAdmin) {
        if (user.role === "super_admin" && !user.companyId) {
          const rows = await leaveService.getAllCompOff();
          return res.json(rows);
        }
        const rows = await leaveService.getCompOffByCompany(user.companyId || "");
        return res.json(rows);
      }
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.json([]);
      res.json(await leaveService.getCompOffByEmployee(employee.id));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch comp-off applications" });
    }
  });

  app.post("/api/comp-off", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      let employeeId = req.body.employeeId;
      let companyId = req.body.companyId || user.companyId;
      if (!isAdmin) {
        const employee = await employeeService.getEmployeeByUserId(user.id);
        if (!employee) return res.status(400).json({ error: "No employee record linked" });
        employeeId = employee.id;
        companyId = employee.companyId;
      }
      const row = await leaveService.createCompOff({ ...req.body, employeeId, companyId, status: "pending" });
      res.json(row);
    } catch (err) {
      console.error("[comp-off POST]", err);
      res.status(500).json({ error: "Failed to create comp-off" });
    }
  });

  app.patch("/api/comp-off/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const row = await leaveService.updateCompOff(req.params.id, req.body);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to update comp-off" });
    }
  });

  app.delete("/api/comp-off/:id", requireAuth, async (req, res) => {
    try {
      await leaveService.deleteCompOff(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // ===== Outdoor Entry Routes =====
  app.get("/api/outdoor-entries", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      if (isAdmin) {
        const rows = await attendanceService.getOutdoorEntriesByCompany(user.companyId || "");
        return res.json(rows);
      }
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.json([]);
      res.json(await attendanceService.getOutdoorEntriesByEmployee(employee.id));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch outdoor entries" });
    }
  });

  app.post("/api/outdoor-entries", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      let employeeId = req.body.employeeId;
      let companyId = req.body.companyId || user.companyId;
      if (!isAdmin) {
        const employee = await employeeService.getEmployeeByUserId(user.id);
        if (!employee) return res.status(400).json({ error: "No employee record linked" });
        employeeId = employee.id;
        companyId = employee.companyId;
      }
      const row = await attendanceService.createOutdoorEntry({ ...req.body, employeeId, companyId, status: "pending" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to create outdoor entry" });
    }
  });

  app.patch("/api/outdoor-entries/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const row = await attendanceService.updateOutdoorEntry(req.params.id, req.body);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to update outdoor entry" });
    }
  });

  app.delete("/api/outdoor-entries/:id", requireAuth, async (req, res) => {
    try {
      await attendanceService.deleteOutdoorEntry(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete outdoor entry" });
    }
  });

  // ===== Notification Routes =====
}
