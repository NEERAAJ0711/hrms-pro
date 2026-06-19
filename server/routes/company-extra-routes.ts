// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { companyService, employeeService } from "../services";
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
      const { contractorId, startDate } = req.body;
      if (!contractorId || !startDate) return res.status(400).json({ error: "contractorId and startDate are required" });
      const record = await companyService.addCompanyContractor({ companyId: req.params.id, contractorId, startDate });
      res.status(201).json(record);
    } catch (error: any) {
      if (String(error?.message || "").includes("unique")) {
        return res.status(409).json({ error: "This company is already added as a contractor" });
      }
      res.status(500).json({ error: "Failed to add contractor" });
    }
  });

  app.delete("/api/companies/:id/contractors/:contractorId", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
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
      const { employeeId, taggedDate } = req.body;
      if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
      const u = (req as any).user;
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
      const success = await companyService.removeContractorEmployee(req.params.id, req.params.contractorId, req.params.employeeId);
      if (!success) return res.status(404).json({ error: "Tagged employee not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove employee tag" });
    }
  });

  // ─── Loan & Advance Routes ───────────────────────────────────────────────────

}
