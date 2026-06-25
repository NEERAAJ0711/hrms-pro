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

export async function registerCompanyExtraRoutes(app: Express): Promise<void> {
  app.patch("/api/companies/:id", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await companyService.getCompany(req.params.id);
      if (!existing) return res.status(404).json({ error: "Company not found" });
      if (user.role !== "super_admin" && existing.id !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await companyService.updateCompany(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const existing = await companyService.getCompany(req.params.id);
      if (!existing) return res.status(404).json({ error: "Company not found" });
      const success = await companyService.deleteCompany(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // Company Contractors
  app.get("/api/companies/:id/principal-employers", requireAuth, async (req, res) => {
    try {
      const employers = await companyService.getPrincipalEmployers(req.params.id);
      res.json(employers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch principal employers" });
    }
  });

  app.get("/api/companies/:id/contractors", requireAuth, async (req, res) => {
    try {
      const contractors = await companyService.getCompanyContractors(req.params.id);
      res.json(contractors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  app.post("/api/companies/:id/contractors", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.companyId !== req.params.id) {
        return res.status(403).json({ error: "You can only manage contractors for your own company" });
      }
      const { contractorId, startDate } = req.body;
      if (!contractorId || !startDate) return res.status(400).json({ error: "contractorId and startDate are required" });
      const record = await companyService.addCompanyContractor({ companyId: req.params.id, contractorId, startDate });
      // Notify the contractor company's admins that approval is needed.
      try {
        const principal = await companyService.getCompany(req.params.id);
        const admins = (await userService.getUsersByRoles(["company_admin"]))
          .filter(u => u.companyId === contractorId)
          .map(u => u.id);
        if (admins.length) {
          await createNotificationForMany(admins, {
            title: "Contractor request received",
            message: `${principal?.companyName ?? "A company"} wants to add your company as a contractor. Review and approve the request.`,
            type: "info",
            link: `/companies/${contractorId}/contractors`,
          });
        }
      } catch (notifyErr) {
        console.error("[add-contractor] notify failed:", notifyErr);
      }
      res.status(201).json(record);
    } catch (error: any) {
      if (String(error?.message || "").includes("unique")) {
        return res.status(409).json({ error: "This company is already added as a contractor" });
      }
      res.status(500).json({ error: "Failed to add contractor" });
    }
  });

  // Contractor company's admin approves/rejects an incoming request. Here :id is
  // the CONTRACTOR company (the one being asked), :principalId is the principal
  // employer that sent the request.
  app.patch("/api/companies/:id/principal-employers/:principalId/status", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const contractorId = req.params.id;
      const principalId = req.params.principalId;
      const { status } = req.body as { status?: string };
      if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }
      const user = (req as any).user;
      // Only the contractor company's own admin (or a super admin) may decide.
      if (user.role !== "super_admin" && user.companyId !== contractorId) {
        return res.status(403).json({ error: "Only the contractor company's admin can respond to this request" });
      }
      const updated = await companyService.updateContractorStatus(principalId, contractorId, status);
      if (!updated) return res.status(404).json({ error: "Contractor request not found" });
      // Notify the principal employer's admins of the decision.
      try {
        const contractorCo = await companyService.getCompany(contractorId);
        const admins = (await userService.getUsersByRoles(["company_admin"]))
          .filter(u => u.companyId === principalId)
          .map(u => u.id);
        if (admins.length) {
          await createNotificationForMany(admins, {
            title: `Contractor request ${status}`,
            message: `${contractorCo?.companyName ?? "The contractor company"} has ${status} your request to add them as a contractor.`,
            type: status === "approved" ? "success" : "warning",
            link: `/companies/${principalId}/contractors`,
          });
        }
      } catch (notifyErr) {
        console.error("[contractor-status] notify failed:", notifyErr);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contractor request" });
    }
  });

  app.delete("/api/companies/:id/contractors/:contractorId", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.companyId !== req.params.id) {
        return res.status(403).json({ error: "You can only manage contractors for your own company" });
      }
      const success = await companyService.removeCompanyContractor(req.params.id, req.params.contractorId);
      if (!success) return res.status(404).json({ error: "Contractor association not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove contractor" });
    }
  });

  // ─── Contractor Employee Tagging ──────────────────────────────────────────────

  app.get("/api/companies/:companyId/employees", requireAuth, async (req, res) => {
    try {
      const emps = await employeeService.getEmployeesByCompany(req.params.companyId);
      res.json(emps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.get("/api/companies/:id/contractors/:contractorId/employees", requireAuth, async (req, res) => {
    try {
      const tagged = await companyService.getContractorEmployees(req.params.id, req.params.contractorId);
      res.json(tagged);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contractor employees" });
    }
  });

  app.post("/api/companies/:id/contractors/:contractorId/employees", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const u = (req as any).user;
      if (u.role !== "super_admin" && u.companyId !== req.params.id) {
        return res.status(403).json({ error: "You can only manage contractors for your own company" });
      }
      const { employeeId, taggedDate } = req.body;
      if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
      const taggedBy = u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username : null;
      console.log("[tag-employee] companyId=%s contractorId=%s employeeId=%s taggedDate=%s", req.params.id, req.params.contractorId, employeeId, taggedDate);
      await companyService.addContractorEmployee(req.params.id, req.params.contractorId, employeeId, taggedDate, taggedBy);
      res.status(201).json({ success: true });
    } catch (error: any) {
      if (String(error?.message || "").includes("unique")) {
        return res.status(409).json({ error: "Employee is already tagged to this contractor" });
      }
      console.error("[tag-employee] error:", error?.message, error?.stack);
      res.status(500).json({ error: error?.message || "Failed to tag employee" });
    }
  });

  app.delete("/api/companies/:id/contractors/:contractorId/employees/:employeeId", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.companyId !== req.params.id) {
        return res.status(403).json({ error: "You can only manage contractors for your own company" });
      }
      const success = await companyService.removeContractorEmployee(req.params.id, req.params.contractorId, req.params.employeeId);
      if (!success) return res.status(404).json({ error: "Tagged employee not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove employee tag" });
    }
  });

  // ─── Loan & Advance Routes ───────────────────────────────────────────────────

}
