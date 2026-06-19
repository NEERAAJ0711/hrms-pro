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

export async function registerLoanRoutes(app: Express): Promise<void> {
  app.get("/api/loan-advances", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let records;
      if (user.role === "super_admin") {
        const { companyId } = req.query;
        if (companyId) {
          records = await storage.getLoanAdvancesByCompany(companyId as string);
        } else {
          const companies = await storage.getAllCompanies();
          const all = await Promise.all(companies.map(c => storage.getLoanAdvancesByCompany(c.id)));
          records = all.flat();
        }
      } else if (["company_admin", "hr_admin", "manager"].includes(user.role)) {
        if (!user.companyId) return res.json([]);
        records = await storage.getLoanAdvancesByCompany(user.companyId);
        // Enforce contractor + location access restriction
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          records = records.filter((r: any) => allowedEmployeeIds.has(r.employeeId));
        }
      } else {
        const employee = await storage.getEmployeeByUserId(user.id);
        if (!employee) return res.json([]);
        records = await storage.getLoanAdvancesByEmployee(employee.id);
      }
      // Enrich with employee info
      const enriched = await Promise.all((records || []).map(async (r) => {
        const emp = await storage.getEmployee(r.employeeId);
        return {
          ...r,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Unknown",
          employeeCode: emp?.employeeCode || "",
        };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loan/advance records" });
    }
  });

  app.post("/api/loan-advances", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let employeeId = req.body.employeeId;
      let companyId = req.body.companyId;
      // If employee role, force to their own record
      if (user.role === "employee") {
        const employee = await storage.getEmployeeByUserId(user.id);
        if (!employee) return res.status(400).json({ error: "No employee record linked to your account" });
        employeeId = employee.id;
        companyId = employee.companyId;
      }
      if (!employeeId || !companyId) return res.status(400).json({ error: "employeeId and companyId are required" });
      const now = new Date().toISOString();
      const record = await storage.createLoanAdvance({
        ...req.body,
        employeeId,
        companyId,
        status: "pending",
        requestDate: req.body.requestDate || now.split("T")[0],
        createdAt: now,
        updatedAt: now,
      });
      // Notify HR/admins about new loan/advance request
      try {
        const requestUser = (req as any).user;
        const hrIds = await getHrAdminIds(record.companyId, requestUser.id);
        const emp2 = await storage.getEmployee(record.employeeId);
        const empName2 = emp2 ? `${emp2.firstName} ${emp2.lastName}` : (requestUser.username || requestUser.email);
        const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
        if (hrIds.length > 0) {
          await createNotificationForMany(hrIds, { companyId: record.companyId, type: "loan_request", title: `New ${typeLabel} Request`, message: `${empName2} has applied for a ${typeLabel.toLowerCase()} of ₹${Number(record.amount).toLocaleString("en-IN")}.`, link: "/loan-advances" });
        }
        await createNotification({ userId: requestUser.id, companyId: record.companyId, type: "loan_submitted", title: `${typeLabel} Request Submitted`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} has been submitted and is awaiting approval.`, link: "/loan-advances" });
      } catch (err) {
        console.error("[Notification] loan submission notify failed:", err);
      }
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to create loan/advance application" });
    }
  });

  app.get("/api/loan-advances/:id", requireAuth, async (req, res) => {
    try {
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch record" });
    }
  });

  app.patch("/api/loan-advances/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      // Employee can only edit their own pending applications
      if (user.role === "employee") {
        const employee = await storage.getEmployeeByUserId(user.id);
        if (!employee || employee.id !== record.employeeId) return res.status(403).json({ error: "Forbidden" });
        if (record.status !== "pending") return res.status(400).json({ error: "Cannot edit a non-pending application" });
      }
      const updated = await storage.updateLoanAdvance(req.params.id, { ...req.body, updatedAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update loan/advance" });
    }
  });

  app.post("/api/loan-advances/:id/approve", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const user = (req as any).user;
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.status !== "pending") return res.status(400).json({ error: "Only pending applications can be approved" });
      const { totalInstallments, installmentAmount, deductionStartMonth, remarks } = req.body;
      if (!totalInstallments || !installmentAmount || !deductionStartMonth) {
        return res.status(400).json({ error: "totalInstallments, installmentAmount, and deductionStartMonth are required" });
      }
      const now = new Date().toISOString();
      const updated = await storage.updateLoanAdvance(req.params.id, {
        status: "active",
        approvedBy: user.id,
        approvedAt: now,
        totalInstallments: Number(totalInstallments),
        installmentAmount: Number(installmentAmount),
        remainingBalance: record.amount,
        deductionStartMonth,
        remarks: remarks || null,
        updatedAt: now,
      });
      // Notify employee of approval
      try {
        const loanEmp = await storage.getEmployee(record.employeeId);
        const loanEmpUserId = await resolveEmployeeUserId(loanEmp);
        if (loanEmpUserId) {
          const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
          await createNotification({ userId: loanEmpUserId, companyId: record.companyId, type: "loan_approved", title: `${typeLabel} Approved ✓`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} has been approved. EMI: ₹${Number(installmentAmount).toLocaleString("en-IN")}/month.`, link: "/loan-advances" });
        }
      } catch (err) {
        console.error("[Notification] loan approval notify failed:", err);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve loan/advance" });
    }
  });

  app.post("/api/loan-advances/:id/reschedule", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const user = (req as any).user;
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.status !== "active") return res.status(400).json({ error: "Only active loan/advance records can be rescheduled" });
      const { totalInstallments, installmentAmount, deductionStartMonth, remarks } = req.body;
      if (!totalInstallments || !installmentAmount || !deductionStartMonth) {
        return res.status(400).json({ error: "totalInstallments, installmentAmount, and deductionStartMonth are required" });
      }
      if (Number(totalInstallments) < 1) return res.status(400).json({ error: "Must have at least 1 installment" });
      if (Number(installmentAmount) < 1) return res.status(400).json({ error: "Installment amount must be at least ₹1" });
      const now = new Date().toISOString();
      const scheduleNote = remarks ? `[Rescheduled on ${now.slice(0,10)}: ${remarks}]` : `[Rescheduled on ${now.slice(0,10)}]`;
      const existingRemarks = record.remarks ? `${record.remarks} | ${scheduleNote}` : scheduleNote;
      const updated = await storage.updateLoanAdvance(req.params.id, {
        totalInstallments: Number(totalInstallments),
        installmentAmount: Number(installmentAmount),
        deductionStartMonth,
        remarks: existingRemarks,
        updatedAt: now,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reschedule loan/advance" });
    }
  });

  // Recalculate remaining balance from actual processed/paid payroll deductions
  app.post("/api/loan-advances/:id/recalculate-balance", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const user = (req as any).user;
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      if (user.role !== "super_admin" && record.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!record.deductionStartMonth) {
        return res.status(400).json({ error: "Loan has no deduction start month set" });
      }

      // Get all processed/paid payrolls for this employee from deductionStartMonth onwards
      const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const allPayrolls = await storage.getPayrollByEmployee(record.employeeId);
      const paidPayrolls = allPayrolls.filter(p => {
        if (!["processed", "paid"].includes(p.status)) return false;
        const mIdx = MONTH_NAMES.indexOf(p.month);
        if (mIdx < 0) return false;
        const payrollYM = `${p.year}-${String(mIdx + 1).padStart(2, "0")}`;
        return payrollYM >= record.deductionStartMonth!;
      });

      // Sum the actual loanDeduction amounts from those payrolls
      const totalDeducted = paidPayrolls.reduce((sum, p) => sum + (Number((p as any).loanDeduction) || 0), 0);
      const originalAmount = Number(record.amount) || 0;
      const newBalance = Math.max(0, originalAmount - totalDeducted);
      const newStatus = newBalance <= 0 ? "closed" : "active";

      const updated = await storage.updateLoanAdvance(req.params.id, {
        remainingBalance: newBalance,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      res.json({ ...updated, totalDeducted, paidMonths: paidPayrolls.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to recalculate balance" });
    }
  });

  app.post("/api/loan-advances/:id/reject", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "manager"), async (req, res) => {
    try {
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.status !== "pending") return res.status(400).json({ error: "Only pending applications can be rejected" });
      const updated = await storage.updateLoanAdvance(req.params.id, {
        status: "rejected",
        rejectionReason: req.body.rejectionReason || "No reason provided",
        updatedAt: new Date().toISOString(),
      });
      // Notify employee of rejection
      try {
        const loanEmpR = await storage.getEmployee(record.employeeId);
        const loanEmpRUserId = await resolveEmployeeUserId(loanEmpR);
        if (loanEmpRUserId) {
          const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
          await createNotification({ userId: loanEmpRUserId, companyId: record.companyId, type: "loan_rejected", title: `${typeLabel} Rejected`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} was rejected. Reason: ${req.body.rejectionReason || "No reason provided"}.`, link: "/loan-advances" });
        }
      } catch (err) {
        console.error("[Notification] loan rejection notify failed:", err);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject loan/advance" });
    }
  });

  app.post("/api/loan-advances/:id/cancel", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      if (user.role === "employee") {
        const employee = await storage.getEmployeeByUserId(user.id);
        if (!employee || employee.id !== record.employeeId) return res.status(403).json({ error: "Forbidden" });
      }
      if (!["pending"].includes(record.status)) return res.status(400).json({ error: "Only pending applications can be cancelled" });
      const updated = await storage.updateLoanAdvance(req.params.id, { status: "cancelled", updatedAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel application" });
    }
  });

  app.post("/api/loan-advances/:id/close", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      const updated = await storage.updateLoanAdvance(req.params.id, { status: "closed", remainingBalance: 0, updatedAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to close loan/advance" });
    }
  });

  app.delete("/api/loan-advances/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const record = await storage.getLoanAdvance(req.params.id);
      if (!record) return res.status(404).json({ error: "Not found" });
      await storage.deleteLoanAdvance(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete record" });
    }
  });

  // ===== Expense Routes =====
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      if (isAdmin) {
        const rows = await storage.getExpensesByCompany(user.companyId || "");
        return res.json(rows);
      }
      // employee — get own employee record first
      const empRows = await storage.getEmployeesByCompany(user.companyId || "");
      const myEmp = empRows.find((e: any) => String(e.userId) === String(user.id));
      if (!myEmp) return res.json([]);
      const rows = await storage.getExpensesByEmployee(myEmp.id);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user.role);
      let employeeId = req.body.employeeId;
      if (!isAdmin) {
        const empRows = await storage.getEmployeesByCompany(user.companyId || "");
        const myEmp = empRows.find((e: any) => String(e.userId) === String(user.id));
        if (!myEmp) return res.status(400).json({ error: "No employee record linked" });
        employeeId = myEmp.id;
      }
      const companyId = req.body.companyId || user.companyId;
      const row = await storage.createExpense({ ...req.body, employeeId, companyId, status: "submitted" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const row = await storage.updateExpense(req.params.id, req.body);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteExpense(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // ===== My Payslips (employee self-service) =====
}
