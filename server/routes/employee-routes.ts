// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { auditService, employeeService, recruitmentService, userService } from "../services";
import { storage } from "../storage";
import { db } from "../db";
import {
  notifications, profileUpdateRequests, users as usersTable,
  contractorEmployees as contractorEmployeesTable, companyContractors, employees,
  insertUserSchema, insertCompanySchema, insertEmployeeSchema, insertAttendanceSchema,
  insertLeaveTypeSchema, insertLeaveRequestSchema, insertSalaryStructureSchema, insertPayrollSchema,
  insertSettingSchema, insertMasterDepartmentSchema, insertMasterDesignationSchema, insertMasterLocationSchema,
  insertEarningHeadSchema, insertDeductionHeadSchema, insertStatutorySettingsSchema, insertTimeOfficePolicySchema,
  insertFnfSettlementSchema, insertHolidaySchema, insertBiometricDeviceSchema, insertJobPostingSchema,
  insertJobApplicationSchema, insertWageGradeSchema, insertContractorMasterSchema
} from "@shared/schema";
import { eq, and, or, desc, sql, inArray, isNull } from "drizzle-orm";
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
import { resolveCrossCompanyLink, backfillMasterLink } from "../services/employee-link";

export async function registerEmployeeRoutes(app: Express): Promise<void> {
  async function validateEmployeeDuplicates(data: any, companyId: string, excludeId?: string): Promise<string | null> {
    const allEmployees = await employeeService.getEmployeesByCompany(companyId);
    const others = excludeId ? allEmployees.filter(e => e.id !== excludeId) : allEmployees;

    if (data.employeeCode) {
      const dup = others.find(e => e.employeeCode === data.employeeCode);
      if (dup) return `Employee Code '${data.employeeCode}' already exists for ${dup.firstName} ${dup.lastName}`;
    }
    if (data.aadhaar) {
      const dup = others.find(e => e.aadhaar && e.aadhaar === data.aadhaar);
      if (dup) return `Aadhaar '${data.aadhaar}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.pan) {
      const dup = others.find(e => e.pan && e.pan === data.pan);
      if (dup) return `PAN '${data.pan}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.uan) {
      const dup = others.find(e => e.uan && e.uan === data.uan);
      if (dup) return `UAN '${data.uan}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.esiNumber) {
      const dup = others.find(e => e.esiNumber && e.esiNumber === data.esiNumber);
      if (dup) return `ESI Number '${data.esiNumber}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.bankAccount) {
      const dup = others.find(e => e.bankAccount && e.bankAccount === data.bankAccount);
      if (dup) return `Bank Account '${data.bankAccount}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.biometricDeviceId) {
      const dup = others.find(e => e.biometricDeviceId && e.biometricDeviceId === data.biometricDeviceId);
      if (dup) return `Biometric Device ID '${data.biometricDeviceId}' already assigned to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    if (data.mobileNumber) {
      const digits = String(data.mobileNumber).replace(/\D/g, "");
      if (digits.length !== 10) return `Mobile number must be exactly 10 digits`;
      const dup = others.find(e => e.mobileNumber && e.mobileNumber.replace(/\D/g, "") === digits);
      if (dup) return `Mobile number '${data.mobileNumber}' is already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})`;
    }
    return null;
  }

  // ===== Employee CRUD Routes =====
  app.post("/api/employees", requireAuth, requireAction("employees", "create"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertEmployeeSchema.parse(req.body);
      if (user.role !== "super_admin") {
        (data as any).companyId = user.companyId;
      }
      const companyId = (data as any).companyId;
      let pendingBackfillIds: string[] | undefined;
      if (companyId) {
        const dupError = await validateEmployeeDuplicates(data, companyId);
        if (dupError) return res.status(400).json({ error: dupError });
        const link = await resolveCrossCompanyLink(data, companyId);
        if (link.error) return res.status(400).json({ error: link.error });
        if (link.masterEmployeeId !== undefined) (data as any).masterEmployeeId = link.masterEmployeeId;
        pendingBackfillIds = link.backfillIds;
      }
      const employee = await employeeService.createEmployee(data);
      // If this new record became the On-Roll master for an already-existing
      // (contractual) record in another company, link those records back to it.
      await backfillMasterLink(employee.id, pendingBackfillIds);
      res.status(201).json(employee);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to create employee" });
    }
  });

  app.get("/api/employees/next-code", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = (req.query.companyId as string) || user.companyId;
      if (!companyId) return res.json({ nextCode: "" });

      const employees = await employeeService.getEmployeesByCompany(companyId);
      if (employees.length === 0) return res.json({ nextCode: "" });

      const prefixGroups: Record<string, { maxNum: number; padLen: number; code: string }> = {};
      for (const emp of employees) {
        const match = emp.employeeCode.match(/^([A-Za-z]*)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          if (!prefixGroups[prefix] || num > prefixGroups[prefix].maxNum) {
            prefixGroups[prefix] = { maxNum: num, padLen: match[2].length, code: emp.employeeCode };
          }
        }
      }

      const prefixes = Object.keys(prefixGroups);
      if (prefixes.length === 0) return res.json({ nextCode: "", lastCode: employees[employees.length - 1]?.employeeCode });

      let bestPrefix = prefixes[0];
      for (const p of prefixes) {
        if (prefixGroups[p].maxNum > prefixGroups[bestPrefix].maxNum) {
          bestPrefix = p;
        }
      }

      const best = prefixGroups[bestPrefix];
      const nextNum = best.maxNum + 1;
      const nextCode = bestPrefix + String(nextNum).padStart(best.padLen, "0");
      res.json({ nextCode, lastCode: best.code });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate next code" });
    }
  });

  app.get("/api/employees/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      let crossCompany = false;
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        // A principal employer may view employees tagged to one of its contractors.
        const tagged = await db
          .select({ id: contractorEmployeesTable.id })
          .from(contractorEmployeesTable)
          .innerJoin(companyContractors, eq(companyContractors.id, contractorEmployeesTable.companyContractorId))
          .where(and(
            eq(contractorEmployeesTable.employeeId, employee.id),
            eq(companyContractors.companyId, user.companyId),
            eq(companyContractors.status, "approved"),
          ))
          .limit(1);
        if (!tagged.length) return res.status(403).json({ error: "Access denied" });
        crossCompany = true;
      }
      // For a cross-company (contractor) employee, attach the owning company name so
      // the UI can show the correct company instead of falling back to the viewer's own.
      if (crossCompany) {
        const company = await storage.getCompany(employee.companyId);
        return res.json({ ...employee, companyName: company?.companyName, isContractorEmployee: true });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee" });
    }
  });

  app.patch("/api/employees/:id", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await employeeService.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const dupError = await validateEmployeeDuplicates(req.body, existing.companyId, req.params.id);
      if (dupError) return res.status(400).json({ error: dupError });

      // Re-evaluate the cross-company On-Roll/Contractual rule using the effective
      // (existing + patched) identity & employment fields.
      const merged = {
        pan: req.body.pan ?? existing.pan,
        aadhaar: req.body.aadhaar ?? existing.aadhaar,
        employmentType: req.body.employmentType ?? existing.employmentType,
        contractorMasterId: req.body.contractorMasterId ?? existing.contractorMasterId,
      };
      const link = await resolveCrossCompanyLink(merged, existing.companyId, req.params.id);
      if (link.error) return res.status(400).json({ error: link.error });
      if (link.masterEmployeeId !== undefined) req.body.masterEmployeeId = link.masterEmployeeId;

      const updated = await employeeService.updateEmployee(req.params.id, req.body);
      await backfillMasterLink(req.params.id, link.backfillIds);

      // If the biometric device ID changed, retroactively link all existing punch logs
      // for that PIN so historical attendance immediately appears under this employee.
      const newPin = req.body.biometricDeviceId ? String(req.body.biometricDeviceId) : null;
      const oldPin = existing.biometricDeviceId ? String(existing.biometricDeviceId) : null;
      if (newPin && newPin !== oldPin) {
        try {
          await employeeService.linkPunchLogsToEmployee(req.params.id, newPin, existing.companyId);
        } catch { /* best-effort — don't block the employee update */ }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", requireAuth, requireAction("employees", "delete"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await employeeService.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      console.log(`[AUDIT] EMPLOYEE_DELETE | user=${user.username || user.email} (id=${user.id}, role=${user.role}) | empId=${existing.id} | code=${existing.employeeCode} | name=${existing.firstName} ${existing.lastName} | companyId=${existing.companyId} | at=${new Date().toISOString()} | ip=${req.ip}`);
      await auditService.writeAuditLog({ action: "EMPLOYEE_DELETE", userId: user.id, userName: user.username || user.email || "", details: JSON.stringify({ empId: existing.id, employeeCode: existing.employeeCode, name: `${existing.firstName} ${existing.lastName}`, companyId: existing.companyId }) });
      const success = await employeeService.deleteEmployee(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // ===== Employee Exit & Reinstate Routes =====
  app.post("/api/employees/:id/exit", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await employeeService.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { exitDate, exitType, exitReason } = req.body;
      const updated = await employeeService.updateEmployee(req.params.id, {
        status: "inactive",
        exitDate,
        exitType,
        exitReason,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to process employee exit" });
    }
  });

  app.post("/api/employees/:id/reinstate", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await employeeService.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await employeeService.updateEmployee(req.params.id, {
        status: "active",
        exitDate: null as any,
        exitType: null as any,
        exitReason: null as any,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reinstate employee" });
    }
  });

  // ── Employee Document Upload ──────────────────────────────────────────────
  app.get("/api/employees/:id/documents", requireAuth, async (req, res) => {
    try {
      const rows = await employeeService.getEmployeeDocuments(req.params.id);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employees/:id/documents", requireAuth, requireAction("employees", "edit"), docUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      const { docType } = req.body;
      if (!file || !docType) return res.status(400).json({ error: "File and docType required" });
      const empRow = await employeeService.getEmployeeCompanyIdRow(req.params.id);
      const emp = empRow.rows[0] as any;
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      const now = new Date().toISOString();
      const id = randomUUID();
      const filePath = `/uploads/employee-docs/${file.filename}`;
      await employeeService.insertEmployeeDocument({
        id,
        employeeId: req.params.id,
        companyId: emp.company_id,
        docType,
        fileName: file.originalname,
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        createdBy: (req.session as any).userId,
        now,
      });
      return res.json({ id, docType, fileName: file.originalname, filePath, fileSize: file.size, mimeType: file.mimetype, createdAt: now });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employees/:id/documents/:docId", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const row = await employeeService.getEmployeeDocumentForDelete(req.params.docId, req.params.id);
      const doc = row.rows[0] as any;
      if (!doc) return res.status(404).json({ error: "Document not found" });
      const fullPath = path.join(process.cwd(), doc.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      await employeeService.deleteEmployeeDocument(req.params.docId);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employees/:id/unlink-login", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!employee.userId) return res.status(400).json({ error: "This employee has no linked login account." });
      await employeeService.updateEmployee(employee.id, { userId: null as any });
      res.json({ success: true, message: "Login account unlinked from employee." });
    } catch (error) {
      res.status(500).json({ error: "Failed to unlink login" });
    }
  });

  app.post("/api/employees/:id/create-login", requireAuth, requireAction("employees", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (employee.userId) {
        return res.status(400).json({ error: "This employee already has a login account linked." });
      }
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password are required" });
      const existingUser = await userService.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ error: "Username already taken" });
      // Check if the employee's official email is already taken (e.g. they self-signed up)
      // Fall back to a company-local address so we never violate the unique email constraint
      let loginEmail = `${username}@company.local`;
      if (employee.officialEmail) {
        const emailTaken = await userService.getUserByEmail(employee.officialEmail);
        if (!emailTaken) loginEmail = employee.officialEmail;
      }
      const newUser = await userService.createUser({
        username,
        password,
        email: loginEmail,
        firstName: employee.firstName,
        lastName: employee.lastName,
        role: "employee",
        companyId: employee.companyId,
        status: "active",
      });
      await employeeService.updateEmployee(employee.id, { userId: newUser.id });
      res.json({ message: "Login created and linked successfully", userId: newUser.id, username: newUser.username });
    } catch (error) {
      console.error("create-login error:", error);
      res.status(500).json({ error: "Failed to create login" });
    }
  });

  // ===== Aadhaar Verification =====
  app.post("/api/employees/verify-aadhaar", requireAuth, requireAction("employees", "create"), async (req, res) => {
    try {
      const { aadhaar, companyId } = req.body;
      const allEmployees = await employeeService.getAllEmployees();
      const matched = allEmployees.filter(e => e.aadhaar === aadhaar);

      if (matched.length === 0) {
        return res.json({ exists: false, status: "not_found", message: "No employee found with this Aadhaar number." });
      }

      const sameCompany = matched.find(e => e.companyId === companyId);
      if (sameCompany) {
        if (sameCompany.status === "active") {
          return res.json({
            exists: true,
            status: "active_same_company",
            message: `Employee ${sameCompany.firstName} ${sameCompany.lastName} (${sameCompany.employeeCode}) is already active in this company.`,
            employee: sameCompany,
          });
        } else {
          return res.json({
            exists: true,
            status: "exited_same_company",
            message: `Employee ${sameCompany.firstName} ${sameCompany.lastName} (${sameCompany.employeeCode}) was previously in this company but has exited. You can reinstate them.`,
            employee: sameCompany,
          });
        }
      }

      const otherCompanyEmp = matched[0];
      return res.json({
        exists: true,
        status: "other_company",
        message: "This Aadhaar is associated with an employee in another company. You may proceed to add them to your company.",
        employeeInfo: {
          firstName: otherCompanyEmp.firstName,
          lastName: otherCompanyEmp.lastName,
          gender: otherCompanyEmp.gender,
          dateOfBirth: otherCompanyEmp.dateOfBirth,
          mobileNumber: otherCompanyEmp.mobileNumber,
          officialEmail: otherCompanyEmp.officialEmail,
          pan: otherCompanyEmp.pan,
          bankAccount: otherCompanyEmp.bankAccount,
          ifsc: otherCompanyEmp.ifsc,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify Aadhaar" });
    }
  });

  // ===== My Employee Route (for logged-in employee to get their own record) =====
  app.get("/api/my-employee", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.status(404).json({ error: "Employee record not found" });
      return res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee record" });
    }
  });

  // ===== Candidate Self-Profile Routes =====
  app.get("/api/my-profile", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const profile = await recruitmentService.getCandidateProfileByUserId(user.id);
      if (profile) {
        return res.json(profile);
      }

      // No candidate profile yet — try to pre-populate from employee record
      const allEmployees = await employeeService.getAllEmployees();
      const linked = allEmployees.find(
        (e) =>
          (e.officialEmail && user.email && e.officialEmail.toLowerCase() === user.email.toLowerCase()) ||
          (e.userId && e.userId === user.id)
      );

      if (linked) {
        return res.json({
          _fromEmployee: true,
          _employeeId: linked.id,
          firstName: linked.firstName || "",
          lastName: linked.lastName || "",
          aadhaar: linked.aadhaar || "",
          aadhaarPreVerified: !!(linked.aadhaar),
          dateOfBirth: linked.dateOfBirth || "",
          gender: linked.gender || "",
          mobileNumber: linked.mobileNumber || "",
          personalEmail: user.email || "",
          fatherName: linked.fatherHusbandName || "",
          address: linked.presentAddress || linked.address || "",
          addressState: linked.presentState || linked.addressState || "",
          addressDistrict: linked.presentDistrict || linked.addressDistrict || "",
          addressPincode: linked.presentPincode || "",
          permanentAddress: linked.permanentAddress || "",
          permanentState: linked.permanentState || "",
          permanentDistrict: linked.permanentDistrict || "",
          permanentPincode: linked.permanentPincode || "",
          pan: linked.pan || "",
          bankAccount: linked.bankAccount || "",
          ifsc: linked.ifsc || "",
          bankName: "",
          currentSalary: linked.grossSalary ? String(linked.grossSalary * 12) : "",
          expectedSalary: "",
          skills: "",
        });
      }

      return res.json(null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  function validateVerhoeff(aadhaar: string): boolean {
    const d = [
      [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
      [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
      [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]
    ];
    const p = [
      [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
      [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
    ];
    let c = 0;
    const digits = aadhaar.split("").map(Number).reverse();
    for (let i = 0; i < digits.length; i++) {
      c = d[c][p[i % 8][digits[i]]];
    }
    return c === 0;
  }

  function serverValidateAadhaar(aadhaar: string): { valid: boolean; message: string } {
    if (!aadhaar || !/^\d{12}$/.test(aadhaar)) return { valid: false, message: "Aadhaar must be exactly 12 digits" };
    if (/^[01]/.test(aadhaar)) return { valid: false, message: "Aadhaar cannot start with 0 or 1" };
    if (!validateVerhoeff(aadhaar)) return { valid: false, message: "Invalid Aadhaar number (checksum failed)" };
    return { valid: true, message: "Valid" };
  }

  app.post("/api/my-profile/verify-aadhaar", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { aadhaar } = req.body;
      const validation = serverValidateAadhaar(aadhaar);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.message });
      }

      const existingProfile = await recruitmentService.getCandidateProfileByAadhaar(aadhaar);
      if (existingProfile && existingProfile.userId !== user.id) {
        return res.json({ status: "active_exists", message: "This Aadhaar number is already registered with another account." });
      }

      const allEmployees = await employeeService.getAllEmployees();
      const matched = allEmployees.find(e => e.aadhaar === aadhaar);
      if (matched) {
        return res.json({ status: "active_exists", message: `This Aadhaar is already registered to an employee (${matched.firstName} ${matched.lastName}).` });
      }

      return res.json({ status: "available", message: "Aadhaar number is valid and available." });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify Aadhaar" });
    }
  });

  app.put("/api/my-profile", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { firstName, lastName, aadhaar, dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
        address, addressState, addressDistrict, addressPincode,
        pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills } = req.body;

      const finalFirstName = (firstName || "").trim();
      const finalLastName = (lastName || "").trim();

      if (!finalFirstName) return res.status(400).json({ error: "Name is required" });

      const allEmployees = await employeeService.getAllEmployees();
      const linkedEmployee = allEmployees.find(
        (e) => (e.officialEmail && user.email && e.officialEmail.toLowerCase() === user.email.toLowerCase()) ||
          (e.userId && e.userId === user.id)
      );
      const isEmployeeAadhaar = linkedEmployee && linkedEmployee.aadhaar === aadhaar;

      if (!isEmployeeAadhaar) {
        const aadhaarValidation = serverValidateAadhaar(aadhaar);
        if (!aadhaarValidation.valid) return res.status(400).json({ error: aadhaarValidation.message });
      }

      const permanentDistrictValue = req.body.permanentDistrict || "";
      const isAdminRole = ["super_admin", "company_admin", "hr_admin"].includes(user.role || "");

      // Employees: create a pending approval request instead of saving directly
      if (!isAdminRole) {
        // Cancel any existing pending request for this user
        await employeeService.cancelPendingProfileUpdateRequests(user.id);

        const requestPayload = {
          firstName: finalFirstName, lastName: finalLastName, aadhaar,
          dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
          address, addressState, addressDistrict, addressPincode,
          permanentAddress: req.body.permanentAddress || "", permanentState: req.body.permanentState || "",
          permanentDistrict: permanentDistrictValue, permanentPincode: req.body.permanentPincode || "",
          pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
        };

        const [newRequest] = await employeeService.createProfileUpdateRequest({
          id: randomUUID(),
          userId: user.id,
          companyId: user.companyId || null,
          status: "pending",
          requestData: JSON.stringify(requestPayload),
          createdAt: new Date().toISOString(),
        });

        // Notify all admins/HR of the company
        const allUsers = await userService.getAllUsers();
        const adminIds = allUsers
          .filter((u: any) => ["hr_admin", "company_admin", "super_admin"].includes(u.role || "") &&
            (u.role === "super_admin" || u.companyId === user.companyId))
          .map((u: any) => u.id)
          .filter((id: string) => id !== user.id);

        const empName = [finalFirstName, finalLastName].filter(Boolean).join(" ") || user.email || "An employee";
        await createNotificationForMany(adminIds, {
          companyId: user.companyId || undefined,
          type: "profile_update_request",
          title: "Profile Update Request",
          message: `${empName} has submitted a profile update for review.`,
          link: "/profile-requests",
        });

        return res.json({ pending: true, requestId: newRequest.id });
      }

      // Admin path: save directly
      const existingProfile = await recruitmentService.getCandidateProfileByUserId(user.id);

      if (existingProfile) {
        const updated = await recruitmentService.updateCandidateProfile(existingProfile.id, {
          firstName: finalFirstName, lastName: finalLastName,
          dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
          address, addressState, addressDistrict, addressPincode,
          permanentAddress: req.body.permanentAddress || "", permanentState: req.body.permanentState || "",
          permanentDistrict: permanentDistrictValue, permanentPincode: req.body.permanentPincode || "",
          pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
          updatedAt: new Date().toISOString(),
        });
        await userService.updateUser(user.id, { firstName: finalFirstName, lastName: finalLastName });
        return res.json(updated);
      }

      const aadhaarCheck = await recruitmentService.getCandidateProfileByAadhaar(aadhaar);
      if (aadhaarCheck) return res.status(400).json({ error: "This Aadhaar number is already registered" });

      const otherEmpMatch = allEmployees.find((e: any) => e.aadhaar === aadhaar && e !== linkedEmployee);
      if (otherEmpMatch) {
        return res.status(400).json({ error: `This Aadhaar is already registered to employee ${(otherEmpMatch as any).firstName} ${(otherEmpMatch as any).lastName}` });
      }

      const profile = await recruitmentService.createCandidateProfile({
        userId: user.id,
        firstName: finalFirstName, lastName: finalLastName, aadhaar,
        dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
        address, addressState, addressDistrict, addressPincode,
        permanentAddress: req.body.permanentAddress || "", permanentState: req.body.permanentState || "",
        permanentDistrict: permanentDistrictValue, permanentPincode: req.body.permanentPincode || "",
        pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await userService.updateUser(user.id, { firstName: finalFirstName, lastName: finalLastName });
      res.status(201).json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  // Check for the current user's pending profile update request
  app.get("/api/my-profile/pending-request", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await employeeService.getPendingProfileUpdateRequest(user.id);
      res.json(rows[0] || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending request" });
    }
  });

  // Admin: List all profile update requests
  app.get("/api/admin/profile-update-requests", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const allRequests = await employeeService.getAllProfileUpdateRequests();

      const filtered = user.role === "super_admin"
        ? allRequests
        : allRequests.filter((r: any) => r.companyId === user.companyId);

      const allUsers = await userService.getAllUsers();
      const userMap = new Map(allUsers.map((u: any) => [u.id, u]));

      const enriched = await Promise.all(filtered.map(async (r: any) => {
        const u: any = userMap.get(r.userId);
        let reqData: any = {};
        try { reqData = JSON.parse(r.requestData); } catch {}

        // Fallback to requestData name if user account not found in users table
        const nameFromReq = [reqData.firstName, reqData.lastName].filter(Boolean).join(" ");
        const nameFromUser = u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";

        // Fetch current saved candidate profile for diff display
        const currentProfile = await recruitmentService.getCandidateProfileByUserId(r.userId);

        return {
          ...r,
          userName: nameFromUser || nameFromReq || r.userId,
          userEmail: u?.email || reqData.personalEmail || "",
          currentData: currentProfile ? {
            firstName: currentProfile.firstName || "",
            lastName: currentProfile.lastName || "",
            aadhaar: currentProfile.aadhaar || "",
            dateOfBirth: currentProfile.dateOfBirth || "",
            gender: currentProfile.gender || "",
            mobileNumber: currentProfile.mobileNumber || "",
            personalEmail: currentProfile.personalEmail || "",
            fatherName: currentProfile.fatherName || "",
            address: currentProfile.address || "",
            addressState: currentProfile.addressState || "",
            addressDistrict: currentProfile.addressDistrict || "",
            addressPincode: currentProfile.addressPincode || "",
            permanentAddress: (currentProfile as any).permanentAddress || "",
            permanentState: (currentProfile as any).permanentState || "",
            permanentDistrict: (currentProfile as any).permanentDistrict || "",
            permanentPincode: (currentProfile as any).permanentPincode || "",
            pan: currentProfile.pan || "",
            bankAccount: currentProfile.bankAccount || "",
            ifsc: currentProfile.ifsc || "",
            bankName: currentProfile.bankName || "",
            currentSalary: currentProfile.currentSalary || "",
            expectedSalary: currentProfile.expectedSalary || "",
            skills: currentProfile.skills || "",
          } : null,
        };
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile update requests" });
    }
  });

  // Admin: Approve a profile update request
  app.post("/api/admin/profile-update-requests/:id/approve", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const rows = await employeeService.getProfileUpdateRequestById(id);
      const request = rows[0];
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== "pending") return res.status(400).json({ error: "Request is no longer pending" });

      const data = JSON.parse(request.requestData);
      const existingProfile = await recruitmentService.getCandidateProfileByUserId(request.userId);

      if (existingProfile) {
        await recruitmentService.updateCandidateProfile(existingProfile.id, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await recruitmentService.createCandidateProfile({
          userId: request.userId,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (data.firstName || data.lastName) {
        await userService.updateUser(request.userId, {
          firstName: data.firstName || "",
          lastName: data.lastName || "",
        });
      }

      await employeeService.updateProfileUpdateRequest(id, {
        status: "approved",
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      });

      await createNotification({
        userId: request.userId,
        companyId: request.companyId,
        type: "profile_update_approved",
        title: "Profile Update Approved",
        message: "Your profile change request has been approved by Admin. Your profile has been updated.",
        link: "/my-profile",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve request" });
    }
  });

  // Admin: Reject a profile update request
  app.post("/api/admin/profile-update-requests/:id/reject", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const { adminNote } = req.body;

      const rows = await employeeService.getProfileUpdateRequestById(id);
      const request = rows[0];
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== "pending") return res.status(400).json({ error: "Request is no longer pending" });

      await employeeService.updateProfileUpdateRequest(id, {
        status: "rejected",
        adminNote: adminNote || null,
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      });

      await createNotification({
        userId: request.userId,
        companyId: request.companyId,
        type: "profile_update_rejected",
        title: "Profile Update Rejected",
        message: adminNote
          ? `Your profile change request has been rejected by Admin. Reason: ${adminNote}`
          : "Your profile change request has been rejected by Admin.",
        link: "/my-profile",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject request" });
    }
  });

  // ===== My Experiences (Web) =====
  app.get("/api/my-experiences", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const profile = await recruitmentService.getCandidateProfileByUserId(user.id);
      if (!profile) return res.json([]);
      const experiences = await employeeService.getPreviousExperiencesByCandidate(profile.id);
      res.json(experiences);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch experiences" });
    }
  });

  app.post("/api/my-experiences", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { organizationName, postHeld, dateOfJoining, dateOfLeaving, reasonOfLeaving, ctc, jobResponsibilities } = req.body;
      if (!organizationName || !postHeld || !dateOfJoining || !dateOfLeaving) {
        return res.status(400).json({ error: "Organization, post, joining and leaving dates are required" });
      }
      const profile = await recruitmentService.getCandidateProfileByUserId(user.id);
      if (!profile) return res.status(400).json({ error: "Profile not found — please save your profile first" });
      const exp = await employeeService.createPreviousExperience({
        candidateProfileId: profile.id, employeeId: null,
        organizationName, postHeld, dateOfJoining, dateOfLeaving,
        reasonOfLeaving: reasonOfLeaving || "", ctc: ctc || "", jobResponsibilities: jobResponsibilities || "",
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(exp);
    } catch (error) {
      res.status(500).json({ error: "Failed to save experience" });
    }
  });

  app.delete("/api/my-experiences/:id", requireAuth, async (req, res) => {
    try {
      await employeeService.deletePreviousExperience(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete experience" });
    }
  });

  // ===== Attendance Routes =====
}
