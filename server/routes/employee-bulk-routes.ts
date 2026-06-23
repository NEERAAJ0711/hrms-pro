// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { companyService, employeeService, settingsService } from "../services";
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
import { resolveCrossCompanyLink, backfillMasterLink } from "../services/employee-link";
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

export async function registerEmployeeBulkRoutes(app: Express): Promise<void> {
  app.get("/api/employees/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await employeeService.getEmployeeByUserId(user.id);
      if (!employee) return res.status(404).json({ error: "No employee record linked to your account" });
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee profile" });
    }
  });

  app.get("/api/employees", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      let employees;
      if (user.role === "super_admin") {
        employees = await employeeService.getAllEmployees();
      } else if (user.companyId) {
        employees = await employeeService.getEmployeesByCompany(user.companyId);
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          employees = employees.filter((e: any) => allowedEmployeeIds.has(e.id));
        }
      } else {
        employees = [];
      }
      res.json(employees);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // ===== Employee Bulk Upload =====
  app.get("/api/employees/bulk-template", requireAuth, requireModuleAccess("employees"), (req, res) => {
    // Columns marked * are required; all others are optional.
    // Use actual Date objects so Excel treats them as date cells (not text).
    const templateData = [
      {
        "Employee Code *": "EMP001",
        "Full Name *": "Rajesh Kumar Sharma",
        "Father / Husband Name": "Ram Kumar Sharma",
        "Gender": "Male",
        "Date of Birth": new Date(1990, 0, 15),
        "Mobile Number": "9876543210",
        "Date of Joining *": new Date(2024, 0, 1),
        "UAN": "",
        "ESI Number": "",
        "Bank Account": "1234567890",
        "IFSC": "SBIN0001234",
        "PAN": "ABCDE1234F",
        "Aadhaar": "123456789012",
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData, { cellDates: true });
    // Apply DD-MM-YYYY date format to the date columns (cols D=3, G=6, 0-indexed)
    const dateColIndices = [4, 6]; // "Date of Birth" = col E (idx 4), "Date of Joining *" = col G (idx 6)
    const headers = Object.keys(templateData[0]);
    headers.forEach((h, colIdx) => {
      if (h === "Date of Birth" || h === "Date of Joining *") {
        // Format the sample row (row 2, index 1) — XLSX uses A1 notation
        const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: 1 });
        if (ws[cellRef]) ws[cellRef].z = "dd-mm-yyyy";
      }
    });
    // Set column widths
    const colWidths = headers.map(k => ({ wch: Math.max(k.length + 4, 20) }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=employee_bulk_template.xlsx");
    res.send(buffer);
  });

  app.post("/api/employees/bulk-upload", requireAuth, requireAction("employees", "bulk_upload"), upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const companyId = user.role === "super_admin" ? req.body.companyId : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const company = await companyService.getCompany(companyId);
      if (!company) return res.status(400).json({ error: "Invalid company ID" });

      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: true });

      if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

      const results = { created: 0, skipped: 0, errors: [] as string[] };
      const existingEmployees = await employeeService.getEmployeesByCompany(companyId);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          // Support both new format ("Employee Code *") and old format ("Employee Code")
          const employeeCode = String(row["Employee Code *"] || row["Employee Code"] || "").trim();

          // Support new "Full Name *" column as well as legacy "First Name" + "Last Name"
          const fullNameRaw = String(row["Full Name *"] || row["Full Name"] || "").trim();
          let firstName = String(row["First Name"] || "").trim();
          let lastName = String(row["Last Name"] || "").trim();
          if (fullNameRaw) {
            const parts = fullNameRaw.split(/\s+/);
            firstName = parts[0];
            // Single-word name: leave lastName empty rather than duplicating firstName
            lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
          }

          const dateOfJoining = parseExcelDate(row["Date of Joining *"] || row["Date of Joining"]) || "";

          if (!employeeCode || !firstName || !dateOfJoining) {
            results.errors.push(`Row ${rowNum}: Missing required fields (Employee Code, Full Name, Date of Joining)`);
            results.skipped++;
            continue;
          }

          const duplicate = existingEmployees.find(e => e.employeeCode === employeeCode);
          if (duplicate) {
            results.errors.push(`Row ${rowNum}: Employee code '${employeeCode}' already exists`);
            results.skipped++;
            continue;
          }

          const aadhaar = String(row["Aadhaar"] || "").trim();
          if (aadhaar) {
            const aadhaarDup = existingEmployees.find(e => e.aadhaar === aadhaar);
            if (aadhaarDup) {
              results.errors.push(`Row ${rowNum}: Aadhaar '${aadhaar}' already registered to ${aadhaarDup.firstName} ${aadhaarDup.lastName}`);
              results.skipped++;
              continue;
            }
          }

          const panVal = String(row["PAN"] || "").trim();
          if (panVal) {
            const panDup = existingEmployees.find(e => e.pan === panVal);
            if (panDup) {
              results.errors.push(`Row ${rowNum}: PAN '${panVal}' already registered to ${panDup.firstName} ${panDup.lastName}`);
              results.skipped++;
              continue;
            }
          }

          const uanVal = String(row["UAN"] || "").trim();
          if (uanVal) {
            const uanDup = existingEmployees.find(e => e.uan === uanVal);
            if (uanDup) {
              results.errors.push(`Row ${rowNum}: UAN '${uanVal}' already registered to ${uanDup.firstName} ${uanDup.lastName}`);
              results.skipped++;
              continue;
            }
          }

          const esiVal = String(row["ESI Number"] || "").trim();
          if (esiVal) {
            const esiDup = existingEmployees.find(e => e.esiNumber === esiVal);
            if (esiDup) {
              results.errors.push(`Row ${rowNum}: ESI Number '${esiVal}' already registered to ${esiDup.firstName} ${esiDup.lastName}`);
              results.skipped++;
              continue;
            }
          }

          const bankVal = String(row["Bank Account"] || "").trim();
          if (bankVal) {
            const bankDup = existingEmployees.find(e => e.bankAccount === bankVal);
            if (bankDup) {
              results.errors.push(`Row ${rowNum}: Bank Account '${bankVal}' already registered to ${bankDup.firstName} ${bankDup.lastName}`);
              results.skipped++;
              continue;
            }
          }

          const yesNo = (val: any) => String(val || "").toLowerCase() === "yes";

          const empData = {
            employeeCode,
            companyId,
            firstName,
            lastName,
            fatherHusbandName: String(row["Father / Husband Name"] || row["Father Name"] || "").trim() || null,
            gender: String(row["Gender"] || "").trim() || null,
            dateOfBirth: parseExcelDate(row["Date of Birth"]) || null,
            mobileNumber: String(row["Mobile Number"] || "").trim() || null,
            dateOfJoining,
            department: String(row["Department"] || "").trim() || null,
            designation: String(row["Designation"] || "").trim() || null,
            employmentType: String(row["Employment Type"] || "permanent").trim(),
            paymentMode: String(row["Payment Mode"] || "").trim() || null,
            pfApplicable: true,
            uan: uanVal || null,
            esiApplicable: true,
            esiNumber: esiVal || null,
            ptState: String(row["PT State"] || "").trim() || null,
            lwfApplicable: false,
            bonusApplicable: yesNo(row["Bonus Applicable"]),
            bonusPaidMonthly: yesNo(row["Bonus Paid Monthly"]),
            bankAccount: bankVal || null,
            ifsc: String(row["IFSC"] || "").trim() || null,
            pan: panVal || null,
            aadhaar: aadhaar || null,
            status: "active",
          };

          // Enforce the cross-company On-Roll/Contractual rule (same person in
          // another company must be Contractual + contractor-tagged).
          const link = await resolveCrossCompanyLink(empData as any, companyId);
          if (link.error) {
            results.errors.push(`Row ${rowNum}: ${link.error}`);
            results.skipped++;
            continue;
          }
          if (link.masterEmployeeId !== undefined) (empData as any).masterEmployeeId = link.masterEmployeeId;

          const created = await employeeService.createEmployee(empData as any);
          await backfillMasterLink(created.id, link.backfillIds);
          existingEmployees.push({ ...empData, id: created.id } as any);
          results.created++;
        } catch (err: any) {
          results.errors.push(`Row ${rowNum}: ${err.message || "Unknown error"}`);
          results.skipped++;
        }
      }

      res.json({
        success: true,
        message: `${results.created} employees created, ${results.skipped} skipped`,
        ...results,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to process file: " + (error.message || "Unknown error") });
    }
  });

  // ===== Employee Bulk Update =====

  // Helper: parse any date value coming from Excel → YYYY-MM-DD for DB storage
  // Handles: JS Date, Excel serial number, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY,
  //          YYYY-MM-DD, D-M-YYYY (single digit), M/D/YYYY (US), named months
  function parseExcelDate(val: any): string | null {
    if (val === null || val === undefined || val === "") return null;

    // ── JS Date object (cellDates:true gives these for actual date-formatted cells) ──
    if (val instanceof Date && !isNaN(val.getTime())) {
      // Use UTC methods to avoid timezone shifting the date by 1 day
      const d = String(val.getUTCDate()).padStart(2, "0");
      const m = String(val.getUTCMonth() + 1).padStart(2, "0");
      return `${val.getUTCFullYear()}-${m}-${d}`;
    }

    // ── Excel serial number (numeric) ─────────────────────────────────────────
    if (typeof val === "number" && val > 1000) {
      // Excel epoch: Jan 1 1900 = serial 1 (with the 1900 leap year bug: add 1 if > 59)
      const adj = val > 59 ? val - 1 : val;
      const jsDate = new Date((adj - 1) * 86400 * 1000 + Date.UTC(1900, 0, 1));
      const d = String(jsDate.getUTCDate()).padStart(2, "0");
      const m = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
      return `${jsDate.getUTCFullYear()}-${m}-${d}`;
    }

    const s = String(val).trim();
    if (!s) return null;

    // ── YYYY-MM-DD (ISO — already correct) ────────────────────────────────────
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const [yyyy, mm, dd] = s.split("-");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    // ── D/M/YYYY or DD/MM/YYYY (Indian / European slash format) ──────────────
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("/");
      // Sanity check: month ≤ 12 means DD/MM/YYYY (Indian); else try M/D/YYYY
      if (parseInt(mm, 10) <= 12) {
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      // Swap — treat as M/D/YYYY
      return `${yyyy}-${dd.padStart(2, "0")}-${mm.padStart(2, "0")}`;
    }

    // ── D-M-YYYY or DD-MM-YYYY (dash separator) ───────────────────────────────
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("-");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    // ── D.M.YYYY or DD.MM.YYYY (dot separator) ────────────────────────────────
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split(".");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    // ── Named month: "15 Jan 2025", "Jan 15 2025", "15-Jan-2025", "15/Jan/2025" ──
    const MONTHS: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      january: "01", february: "02", march: "03", april: "04", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const namedMatch = s.match(/^(\d{1,2})[\s\-\/]([a-zA-Z]+)[\s\-\/](\d{4})$/);
    if (namedMatch) {
      const [, dd, mon, yyyy] = namedMatch;
      const mm = MONTHS[mon.toLowerCase()];
      if (mm) return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
    }
    const namedMatchRev = s.match(/^([a-zA-Z]+)[\s\-\/](\d{1,2})[\s,\-\/]+(\d{4})$/);
    if (namedMatchRev) {
      const [, mon, dd, yyyy] = namedMatchRev;
      const mm = MONTHS[mon.toLowerCase()];
      if (mm) return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
    }

    // ── Last resort: try native Date.parse (may be locale-dependent) ──────────
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) {
      const dt = new Date(parsed);
      const d = String(dt.getUTCDate()).padStart(2, "0");
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      return `${dt.getUTCFullYear()}-${m}-${d}`;
    }

    return null; // unparseable — return null instead of saving garbage
  }

  // Format YYYY-MM-DD → DD-MM-YYYY for template display
  function toDisplayDate(val: any): string {
    if (!val) return "";
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [yyyy, mm, dd] = s.split("-");
      return `${dd}-${mm}-${yyyy}`;
    }
    return s;
  }

  // Mapping: Excel column label → DB field key
  const BULK_UPDATE_FIELD_MAP: Record<string, string> = {
    "Father / Husband Name": "fatherHusbandName",
    "Gender": "gender",
    "Date of Birth": "dateOfBirth",
    "Mobile Number": "mobileNumber",
    "Date of Joining": "dateOfJoining",
    "Department": "department",
    "Designation": "designation",
    "Employment Type": "employmentType",
    "Payment Mode": "paymentMode",
    "UAN": "uan",
    "ESI Number": "esiNumber",
    "PF Applicable": "pfApplicable",
    "ESI Applicable": "esiApplicable",
    "PT State": "ptState",
    "LWF Applicable": "lwfApplicable",
    "Bank Account": "bankAccount",
    "IFSC Code": "ifsc",
    "PAN": "pan",
    "Aadhaar": "aadhaar",
    "Location": "location",
    "Wage Grade": "__wageGrade__",       // resolved via name → ID
    "Contractor": "__contractor__",     // resolved via name → ID
    "Biometric Device ID": "biometricDeviceId",
    "Bonus Applicable": "bonusApplicable",
    "Bonus Paid Monthly": "bonusPaidMonthly",
  };
  const BOOL_FIELDS = new Set(["pfApplicable", "esiApplicable", "lwfApplicable", "bonusApplicable", "bonusPaidMonthly"]);
  const DATE_FIELDS = new Set(["dateOfBirth", "dateOfJoining"]);
  // Fields that need name→ID resolution (not simple direct DB column writes)
  const NAME_LOOKUP_FIELDS = new Set(["__wageGrade__", "__contractor__"]);

  // GET  /api/employees/bulk-update-template?fields=f1,f2,...&companyId=xxx
  app.get("/api/employees/bulk-update-template", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      const rawFields = String(req.query.fields || "").split(",").map(f => f.trim()).filter(Boolean);
      if (rawFields.length === 0) return res.status(400).json({ error: "No fields selected" });

      const companyId = user.role === "super_admin" ? String(req.query.companyId || "") : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const employees = await employeeService.getEmployeesByCompany(companyId);
      if (employees.length === 0) return res.status(400).json({ error: "No employees found for this company" });

      // Pre-fetch lookup tables if needed
      const needsWageGrade = rawFields.includes("Wage Grade");
      const needsContractor = rawFields.includes("Contractor");
      const wageGrades = needsWageGrade ? await settingsService.getWageGradesByCompany(companyId) : [];
      const contractors = needsContractor ? await companyService.getContractorMastersByCompany(companyId) : [];
      const wageGradeIdToName = new Map(wageGrades.map((g: any) => [g.id, g.name]));
      const contractorIdToName = new Map(contractors.map((c: any) => [c.id, c.contractorName]));

      // Build rows: fixed cols Employee Code + Employee Name, then blank selected cols
      const rows = employees.map(emp => {
        const row: Record<string, any> = {
          "Employee Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`.trim(),
        };
        for (const label of rawFields) {
          const dbField = BULK_UPDATE_FIELD_MAP[label];
          if (!dbField) continue;
          if (dbField === "__wageGrade__") {
            row[label] = wageGradeIdToName.get((emp as any).wageGradeId ?? "") ?? "";
          } else if (dbField === "__contractor__") {
            row[label] = contractorIdToName.get((emp as any).contractorMasterId ?? "") ?? "";
          } else if (BOOL_FIELDS.has(dbField)) {
            const current = (emp as any)[dbField];
            row[label] = current ? "Yes" : "No";
          } else if (DATE_FIELDS.has(dbField)) {
            // Write as actual Date object so Excel shows it as a date cell
            const raw = (emp as any)[dbField];
            if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
              const [yyyy, mm, dd] = String(raw).split("-").map(Number);
              row[label] = new Date(Date.UTC(yyyy, mm - 1, dd));
            } else {
              row[label] = raw ?? "";
            }
          } else {
            row[label] = (emp as any)[dbField] ?? "";
          }
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
      // Apply DD-MM-YYYY format to all date columns
      const headers = Object.keys(rows[0] || {});
      rows.forEach((_, rowIdx) => {
        headers.forEach((h, colIdx) => {
          const dbField = BULK_UPDATE_FIELD_MAP[h];
          if (dbField && DATE_FIELDS.has(dbField)) {
            const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx + 1 });
            if (ws[cellRef] && ws[cellRef].t === "d") ws[cellRef].z = "dd-mm-yyyy";
          }
        });
      });
      const colWidths = headers.map(k => ({ wch: Math.max(k.length + 4, 22) }));
      ws["!cols"] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bulk Update");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=employee_bulk_update_template.xlsx");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to generate template" });
    }
  });

  // POST /api/employees/bulk-update
  app.post("/api/employees/bulk-update", requireAuth, requireAction("employees", "edit"), upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const companyId = user.role === "super_admin" ? req.body.companyId : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: true });
      if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

      // Detect which update-able columns are present (exclude fixed cols)
      const allKeys = Object.keys(rows[0] || {});
      const updateLabels = allKeys.filter(k => k !== "Employee Code" && k !== "Employee Name" && BULK_UPDATE_FIELD_MAP[k]);

      const employees = await employeeService.getEmployeesByCompany(companyId);
      const empMap = new Map(employees.map(e => [e.employeeCode.toLowerCase(), e]));

      // Pre-fetch name→ID maps for lookup fields if those columns exist in the file
      const hasWageGrade = updateLabels.includes("Wage Grade");
      const hasContractor = updateLabels.includes("Contractor");
      const wageGradesList = hasWageGrade ? await settingsService.getWageGradesByCompany(companyId) : [];
      const contractorsList = hasContractor ? await companyService.getContractorMastersByCompany(companyId) : [];
      const wageGradeNameToId = new Map(wageGradesList.map((g: any) => [g.name.toLowerCase(), g.id]));
      const contractorNameToId = new Map(contractorsList.map((c: any) => [c.contractorName.toLowerCase(), c.id]));

      const results = { updated: 0, skipped: 0, errors: [] as string[] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const code = String(row["Employee Code"] || "").trim();
        if (!code) { results.errors.push(`Row ${rowNum}: Missing Employee Code`); results.skipped++; continue; }

        const emp = empMap.get(code.toLowerCase());
        if (!emp) { results.errors.push(`Row ${rowNum}: Employee code '${code}' not found`); results.skipped++; continue; }

        const updates: Record<string, any> = {};
        for (const label of updateLabels) {
          const dbField = BULK_UPDATE_FIELD_MAP[label];
          if (!dbField) continue;
          const cellVal = row[label];
          const raw = String(cellVal ?? "").trim();
          if (raw === "") continue; // skip blank cells

          if (dbField === "__wageGrade__") {
            const id = wageGradeNameToId.get(raw.toLowerCase());
            if (id) updates["wageGradeId"] = id;
            else results.errors.push(`Row ${rowNum} (${code}): Wage grade '${raw}' not found — skipped`);
          } else if (dbField === "__contractor__") {
            const id = contractorNameToId.get(raw.toLowerCase());
            if (id) updates["contractorMasterId"] = id;
            else results.errors.push(`Row ${rowNum} (${code}): Contractor '${raw}' not found — skipped`);
          } else if (BOOL_FIELDS.has(dbField)) {
            updates[dbField] = raw.toLowerCase() === "yes";
          } else if (DATE_FIELDS.has(dbField)) {
            const parsed = parseExcelDate(cellVal);
            if (parsed) updates[dbField] = parsed;
          } else {
            updates[dbField] = raw;
          }
        }

        if (Object.keys(updates).length === 0) { results.skipped++; continue; }

        try {
          // Enforce the cross-company On-Roll/Contractual rule using the effective
          // (existing + patched) identity & employment fields.
          const merged = {
            pan: updates.pan ?? emp.pan,
            aadhaar: updates.aadhaar ?? emp.aadhaar,
            employmentType: updates.employmentType ?? emp.employmentType,
            contractorMasterId: updates.contractorMasterId ?? emp.contractorMasterId,
          };
          const link = await resolveCrossCompanyLink(merged, emp.companyId, emp.id);
          if (link.error) {
            results.errors.push(`Row ${rowNum} (${code}): ${link.error}`);
            results.skipped++;
            continue;
          }
          if (link.masterEmployeeId !== undefined) (updates as any).masterEmployeeId = link.masterEmployeeId;

          await employeeService.updateEmployee(emp.id, updates as any);
          await backfillMasterLink(emp.id, link.backfillIds);
          results.updated++;
        } catch (err: any) {
          results.errors.push(`Row ${rowNum} (${code}): ${err.message}`);
          results.skipped++;
        }
      }

      res.json({ success: true, message: `${results.updated} updated, ${results.skipped} skipped`, ...results });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to process file: " + (err.message || "Unknown error") });
    }
  });

  // ===== Biometric Routes =====
}
