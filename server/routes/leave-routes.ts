// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { employeeService, leaveService, sendLeaveDecisionEmail } from "../services";
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

export async function registerLeaveRoutes(app: Express): Promise<void> {
  app.get("/api/leave-types", requireAuth, requireModuleAccess("leave"), async (req, res) => {
    try {
      const user = (req as any).user;
      let leaveTypes;
      if (user.role === "super_admin") {
        leaveTypes = await leaveService.getAllLeaveTypes();
      } else {
        leaveTypes = await leaveService.getLeaveTypesByCompany(user.companyId);
      }
      res.json(leaveTypes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave types" });
    }
  });

  app.post("/api/leave-types", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("leave", "configure"), async (req, res) => {
    try {
      const data = insertLeaveTypeSchema.parse(req.body);
      const leaveType = await leaveService.createLeaveType(data);
      res.status(201).json(leaveType);
    } catch (error) {
      res.status(500).json({ error: "Failed to create leave type" });
    }
  });

  app.patch("/api/leave-types/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("leave", "configure"), async (req, res) => {
    try {
      const updated = await leaveService.updateLeaveType(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Leave type not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update leave type" });
    }
  });

  app.delete("/api/leave-types/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("leave", "configure"), async (req, res) => {
    try {
      const success = await leaveService.deleteLeaveType(req.params.id);
      if (!success) return res.status(404).json({ error: "Leave type not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete leave type" });
    }
  });

  // ===== Leave Requests Routes =====
  app.get("/api/leave-requests", requireAuth, requireModuleAccess("leave"), async (req, res) => {
    try {
      const user = (req as any).user;
      let requests;
      if (user.role === "employee") {
        const employees = user.companyId ? await employeeService.getEmployeesByCompany(user.companyId) : [];
        const myEmployee = employees.find(e => e.userId === user.id);
        if (myEmployee) {
          requests = await leaveService.getLeaveRequestsByEmployee(myEmployee.id);
        } else {
          requests = [];
        }
      } else if (user.role === "super_admin") {
        requests = await leaveService.getAllLeaveRequests();
      } else if (user.companyId) {
        requests = await leaveService.getLeaveRequestsByCompany(user.companyId);
        // Enforce contractor + location access restriction
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          requests = requests.filter((r: any) => allowedEmployeeIds.has(r.employeeId));
        }
      } else {
        requests = [];
      }
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/leave-requests", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      // Normalize before Zod parse: numeric columns expect string, frontend may send number
      const body = { ...req.body, days: String(req.body.days ?? "1") };
      const parsed = insertLeaveRequestSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      }
      const request = await leaveService.createLeaveRequest(parsed.data);
      // Notify HR/admins about new leave request
      try {
        const hrIds = await getHrAdminIds(user.companyId, user.id);
        const emp = await employeeService.getEmployeeByUserId(user.id);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (user.username || user.email);
        if (hrIds.length > 0) {
          await createNotificationForMany(hrIds, { companyId: user.companyId, type: "leave_request", title: "New Leave Request", message: `${empName} has submitted a leave request.`, link: "/leave" });
        }
        // Also notify the submitting user
        await createNotification({ userId: user.id, companyId: user.companyId, type: "leave_submitted", title: "Leave Request Submitted", message: "Your leave request has been submitted and is awaiting approval.", link: "/leave" });
      } catch (err) {
        console.error("[Notification] leave submission notify failed:", err);
      }
      res.status(201).json(request);
    } catch (error: any) {
      const msg = error?.message || String(error);
      const issues = error?.issues ? JSON.stringify(error.issues) : undefined;
      res.status(500).json({ error: "Failed to create leave request", detail: msg, issues });
    }
  });

  app.patch("/api/leave-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await leaveService.getLeaveRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Leave request not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updates = { ...req.body };
      if (req.body.status === "approved" || req.body.status === "rejected") {
        updates.approvedBy = user.id;
        updates.approvedAt = updates.approvedAt || new Date().toISOString();
      }
      const updated = await leaveService.updateLeaveRequest(req.params.id, updates);
      // Notify employee when leave is approved or rejected
      if (req.body.status === "approved" || req.body.status === "rejected") {
        try {
          const leaveEmp = existing.employeeId ? await employeeService.getEmployee(existing.employeeId) : null;
          const empUserId = leaveEmp ? await resolveEmployeeUserId(leaveEmp) : null;
          if (empUserId) {
            const statusLabel = req.body.status === "approved" ? "Approved ✓" : "Rejected ✗";
            const msg = req.body.status === "approved"
              ? "Your leave request has been approved."
              : `Your leave request has been rejected.${req.body.rejectionReason ? " Reason: " + req.body.rejectionReason : ""}`;
            await createNotification({ userId: empUserId, companyId: existing.companyId, type: `leave_${req.body.status}`, title: `Leave Request ${statusLabel}`, message: msg, link: "/leave" });
          }
          if (leaveEmp?.officialEmail) {
            await sendLeaveDecisionEmail({
              to: leaveEmp.officialEmail,
              employeeName: `${leaveEmp.firstName} ${leaveEmp.lastName}`.trim(),
              status: req.body.status,
              startDate: existing.startDate,
              endDate: existing.endDate,
              rejectionReason: req.body.rejectionReason,
              companyId: existing.companyId,
            });
          }
        } catch (err) {
          console.error("[Notification] leave approval notify failed:", err);
        }
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update leave request" });
    }
  });

  // ===== Salary Structure Bulk Upload Routes =====
}
