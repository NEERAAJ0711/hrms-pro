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

export async function registerPayrollRoutes(app: Express): Promise<void> {
  app.get("/api/salary-structures/bulk-template", requireAuth, requireModuleAccess("payroll"), async (req, res) => {
    const user = (req as any).user;
    const requestedCompanyId = req.query.companyId as string | undefined;
    const companyId = user.role === "super_admin" ? requestedCompanyId : user.companyId;

    let templateData: Record<string, string | number>[] = [];

    if (companyId) {
      // Pre-fill with existing salary structures for the company
      const employees = await storage.getEmployeesByCompany(companyId);
      const empCodeMap = new Map(employees.map(e => [e.id, e.employeeCode]));
      const allStructures = await storage.getAllSalaryStructures();
      const companyStructures = allStructures
        .filter(s => s.companyId === companyId && s.status === "active")
        .sort((a, b) => {
          const codeA = empCodeMap.get(a.employeeId) || "";
          const codeB = empCodeMap.get(b.employeeId) || "";
          return codeA.localeCompare(codeB);
        });

      if (companyStructures.length > 0) {
        templateData = companyStructures.map(s => ({
          "Employee Code": empCodeMap.get(s.employeeId) || "",
          "Basic Salary": s.basicSalary,
          "HRA": s.hra ?? 0,
          "Conveyance": s.conveyance ?? 0,
          "Special Allowance": s.specialAllowance ?? 0,
          "Other Allowances": s.otherAllowances ?? 0,
          "Gross Salary": s.grossSalary,
          "PF Employee": s.pfEmployee ?? 0,
          "PF Employer": s.pfEmployer ?? 0,
          "ESI": s.esi ?? 0,
          "Professional Tax": s.professionalTax ?? 0,
          "LWF Employee": s.lwfEmployee ?? 0,
          "TDS": s.tds ?? 0,
          "Other Deductions": s.otherDeductions ?? 0,
          "Net Salary": s.netSalary,
          "Effective From": s.effectiveFrom,
        }));
      }
    }

    // Fall back to sample row if nothing to pre-fill
    if (templateData.length === 0) {
      templateData = [{
        "Employee Code": "EMP001",
        "Basic Salary": 20000,
        "HRA": 8000,
        "Conveyance": 1600,
        "Special Allowance": 5000,
        "Other Allowances": 0,
        "Gross Salary": 33600,
        "PF Employee": 1800,
        "PF Employer": 1800,
        "ESI": 0,
        "Professional Tax": 200,
        "LWF Employee": 0,
        "TDS": 0,
        "Other Deductions": 0,
        "Net Salary": 33850,
        "Effective From": "2026-01-01",
      }];
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const colWidths = Object.keys(templateData[0]).map(k => ({ wch: Math.max(k.length + 2, 18) }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SalaryStructures");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const filename = companyId ? "salary_structures_prefilled.xlsx" : "salary_structure_bulk_template.xlsx";
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(buffer);
  });

  app.post("/api/salary-structures/bulk-upload", requireAuth, requireAction("payroll", "bulk_upload"), upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const companyId = user.role === "super_admin" ? req.body.companyId : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const company = await storage.getCompany(companyId);
      if (!company) return res.status(400).json({ error: "Invalid company ID" });

      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

      const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
      const employees = await storage.getEmployeesByCompany(companyId);
      const existingStructures = (await storage.getAllSalaryStructures()).filter(s => s.companyId === companyId);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const employeeCode = String(row["Employee Code"] || "").trim();
          const basicSalary = Number(row["Basic Salary"]);
          const grossSalary = Number(row["Gross Salary"]);
          const netSalary = Number(row["Net Salary"]);
          const effectiveFrom = String(row["Effective From"] || "").trim();

          if (!employeeCode) {
            results.errors.push(`Row ${rowNum}: Missing Employee Code`);
            results.skipped++;
            continue;
          }

          if (isNaN(basicSalary) || basicSalary < 0) {
            results.errors.push(`Row ${rowNum}: Invalid Basic Salary`);
            results.skipped++;
            continue;
          }

          if (isNaN(grossSalary) || grossSalary < 0) {
            results.errors.push(`Row ${rowNum}: Invalid Gross Salary`);
            results.skipped++;
            continue;
          }

          if (isNaN(netSalary) || netSalary < 0) {
            results.errors.push(`Row ${rowNum}: Invalid Net Salary`);
            results.skipped++;
            continue;
          }

          if (!effectiveFrom) {
            results.errors.push(`Row ${rowNum}: Missing Effective From date`);
            results.skipped++;
            continue;
          }

          const employee = employees.find(e => e.employeeCode === employeeCode);
          if (!employee) {
            results.errors.push(`Row ${rowNum}: Employee code '${employeeCode}' not found in this company`);
            results.skipped++;
            continue;
          }

          const num = (val: any) => { const n = Number(val); return isNaN(n) ? 0 : n; };

          const structureData = {
            employeeId: employee.id,
            companyId,
            basicSalary,
            hra: num(row["HRA"]),
            conveyance: num(row["Conveyance"]),
            medicalAllowance: 0,
            specialAllowance: num(row["Special Allowance"]),
            otherAllowances: num(row["Other Allowances"]) + num(row["Medical Allowance"]),
            grossSalary,
            pfEmployee: num(row["PF Employee"]),
            pfEmployer: num(row["PF Employer"]),
            esi: num(row["ESI"]),
            professionalTax: num(row["Professional Tax"]),
            lwfEmployee: num(row["LWF Employee"]),
            tds: num(row["TDS"]),
            otherDeductions: num(row["Other Deductions"]),
            netSalary,
            effectiveFrom,
            status: "active",
          };

          const existingActive = existingStructures.find(
            s => s.employeeId === employee.id && s.status === "active"
          );

          if (existingActive) {
            // Update existing active structure in place
            await storage.updateSalaryStructure(existingActive.id, structureData as any);
            // Refresh the in-memory list
            const idx = existingStructures.findIndex(s => s.id === existingActive.id);
            if (idx >= 0) existingStructures[idx] = { ...existingActive, ...structureData } as any;
            results.updated++;
          } else {
            const created = await storage.createSalaryStructure(structureData as any);
            existingStructures.push(created);
            results.created++;
          }
        } catch (err: any) {
          results.errors.push(`Row ${rowNum}: ${err.message || "Unknown error"}`);
          results.skipped++;
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to process bulk upload" });
    }
  });

  // ===== Salary Structure Routes =====
  app.get("/api/salary-structures", requireAuth, requireModuleAccess("payroll"), async (req, res) => {
    try {
      const user = (req as any).user;
      let structures;
      if (user.role === "super_admin") {
        structures = await storage.getAllSalaryStructures();
      } else if (user.companyId) {
        structures = (await storage.getAllSalaryStructures()).filter(s => s.companyId === user.companyId);
        // Enforce contractor + location access restriction
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          structures = structures.filter((s: any) => allowedEmployeeIds.has(s.employeeId));
        }
      } else {
        structures = [];
      }
      res.json(structures);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch salary structures" });
    }
  });

  // Auto-create or update salary structure from assigned wage grade
  app.post("/api/salary-structures/auto-from-grade", requireAuth, async (req, res) => {
    try {
      const { employeeId } = req.body;
      if (!employeeId) return res.status(400).json({ error: "employeeId required" });

      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      if (!emp.wageGradeId) return res.status(400).json({ error: "Employee has no wage grade assigned" });

      const grade = await storage.getWageGrade(emp.wageGradeId);
      if (!grade || grade.status !== "active") return res.status(404).json({ error: "Active wage grade not found" });

      const settings = await storage.getStatutorySettingsByCompany(emp.companyId);

      // Full breakdown: Basic = max(minWage, 50% gross), HRA = min(50% basic, rem),
      //   Conveyance = min(50% HRA, rem), Special = rest, Medical/Other = 0
      const minWage    = grade.minimumWage;
      const gross      = minWage;                                      // gross starts at min wage
      const basic      = Math.max(minWage, Math.round(gross * 0.5));  // max(minWage, 50%)
      const afterBasic = gross - basic;
      const hra        = Math.min(Math.round(basic * 0.5), afterBasic);
      const afterHra   = afterBasic - hra;
      const conveyance = Math.min(Math.round(hra * 0.5), afterHra);
      const special    = Math.max(0, afterHra - conveyance);

      let pfEmployee = 0, pfEmployer = 0, esi = 0, pt = 0, lwfEmployee = 0;

      if (settings?.pfEnabled && emp.pfApplicable) {
        const pfBase = Math.min(basic, Number(settings.pfWageCeiling) || 15000);
        pfEmployee = Math.round(pfBase * (Number(settings.pfEmployeePercent) || 12) / 100);
        pfEmployer = Math.round(pfBase * (Number(settings.pfEmployerPercent) || 12) / 100);
      }
      if (settings?.esicEnabled && emp.esiApplicable) {
        const ceiling = Number(settings.esicWageCeiling) || 21000;
        if (gross <= ceiling) {
          const esicBase = settings.esicCalcOnGross
            ? Math.min(gross, ceiling)
            : Math.min(Math.max(basic, gross * 0.5), ceiling);
          esi = Math.round(esicBase * (Number(settings.esicEmployeePercent) || 75) / 10000);
        }
      }
      if (settings?.ptEnabled) {
        pt = Math.min(Number(settings.ptMaxAmount) || 200, 200);
      }
      if (settings?.lwfEnabled && emp.lwfApplicable) {
        const lwfBase = settings.lwfCalculationBase === "basic" ? basic : gross;
        lwfEmployee = Math.min(
          Math.round(lwfBase * (Number(settings.lwfEmployeePercent) || 20) / 10000),
          Number(settings.lwfEmployeeMaxCap) || 34
        );
      }

      const net = Math.max(0, gross - pfEmployee - esi - pt - lwfEmployee);

      // Effective date: DOJ for new employees (no payroll yet), 1st of next payroll month for existing
      const GRADE_MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const allPayrollForEmp = (await storage.getAllPayroll()).filter(p => p.employeeId === emp.id);
      let effectiveFrom: string;
      if (allPayrollForEmp.length === 0) {
        effectiveFrom = (emp.dateOfJoining && emp.dateOfJoining.trim()) ? emp.dateOfJoining.trim() : new Date().toISOString().slice(0, 10);
      } else {
        const latestPR = allPayrollForEmp.reduce((a, b) => {
          const aNum = a.year * 100 + (GRADE_MONTH_NAMES.indexOf(a.month) + 1);
          const bNum = b.year * 100 + (GRADE_MONTH_NAMES.indexOf(b.month) + 1);
          return bNum > aNum ? b : a;
        });
        const nextMonth = new Date(latestPR.year, GRADE_MONTH_NAMES.indexOf(latestPR.month) + 1, 1);
        effectiveFrom = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
      }

      const payload = {
        employeeId: emp.id,
        companyId: emp.companyId,
        basicSalary: basic,
        hra,
        conveyance,
        medicalAllowance: 0,
        specialAllowance: special,
        otherAllowances: 0,
        grossSalary: gross,
        pfEmployee,
        pfEmployer,
        esi,
        professionalTax: pt,
        lwfEmployee,
        tds: 0,
        otherDeductions: 0,
        netSalary: net,
        effectiveFrom,
        status: "active",
      };

      // Upsert: update if active structure exists, otherwise create new
      const existing = await storage.getSalaryStructureByEmployee(emp.id);
      let structure;
      if (existing) {
        structure = await storage.updateSalaryStructure(existing.id, payload);
      } else {
        structure = await storage.createSalaryStructure(payload as any);
      }

      res.json({ structure, action: existing ? "updated" : "created" });
    } catch (error) {
      console.error("[auto-from-grade]", error);
      res.status(500).json({ error: "Failed to auto-create salary structure" });
    }
  });

  app.post("/api/salary-structures", requireAuth, requireAction("payroll", "process"), async (req, res) => {
    try {
      const data = insertSalaryStructureSchema.parse(req.body);
      // Block duplicate: same employee + same effectiveFrom already exists
      const existing = await storage.getSalaryStructuresByEmployee(data.employeeId);
      const duplicate = existing.find(s => s.effectiveFrom === data.effectiveFrom);
      if (duplicate) {
        return res.status(400).json({
          error: `A salary structure with effective date ${data.effectiveFrom} already exists for this employee. Please edit the existing structure or choose a different effective date.`,
        });
      }
      const structure = await storage.createSalaryStructure(data);
      res.status(201).json(structure);
    } catch (error: any) {
      const msg = error?.errors ? error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join("; ") : (error?.message || "Failed to create salary structure");
      console.error("[salary-structure POST]", msg, JSON.stringify(req.body));
      res.status(400).json({ error: msg });
    }
  });

  app.patch("/api/salary-structures/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getSalaryStructure(req.params.id);
      if (!existing) return res.status(404).json({ error: "Salary structure not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // ── Lock: block editing only when a Paid payroll exists for this employee ──
      // Draft/Processed payroll can be regenerated, so editing the structure is allowed.
      const allPayrollCheck = await storage.getAllPayroll();
      const hasPaidPayroll = allPayrollCheck.some(p => p.employeeId === existing.employeeId && p.status === "paid");
      if (hasPaidPayroll) {
        return res.status(400).json({
          error: "Cannot edit this salary structure — a finalised (Paid) payroll exists for this employee. Create a new salary structure with a later effective date to apply changes.",
        });
      }
      // ─────────────────────────────────────────────────────────────────────────

      const updated = await storage.updateSalaryStructure(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update salary structure" });
    }
  });

  app.delete("/api/salary-structures/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getSalaryStructure(req.params.id);
      if (!existing) return res.status(404).json({ error: "Salary structure not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Block deletion only when a Paid payroll exists for this employee
      const allPayrollDel = await storage.getAllPayroll();
      const hasPaidPayrollDel = allPayrollDel.some(p => p.employeeId === existing.employeeId && p.status === "paid");
      if (hasPaidPayrollDel) {
        return res.status(400).json({
          error: "Cannot delete this salary structure — a finalised (Paid) payroll exists for this employee.",
        });
      }
      console.log(`[AUDIT] SALARY_STRUCTURE_DELETE | user=${user.username || user.email} (id=${user.id}, role=${user.role}) | structureId=${existing.id} | employeeId=${existing.employeeId} | companyId=${existing.companyId} | basic=${existing.basicSalary} | gross=${existing.grossSalary} | at=${new Date().toISOString()} | ip=${req.ip}`);
      await storage.writeAuditLog({ action: "SALARY_STRUCTURE_DELETE", userId: user.id, userName: user.username || user.email || "", details: JSON.stringify({ structureId: existing.id, employeeId: existing.employeeId, companyId: existing.companyId, basicSalary: existing.basicSalary, grossSalary: existing.grossSalary }) });
      const success = await storage.deleteSalaryStructure(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete salary structure" });
    }
  });

  // ===== Payroll Routes =====
  app.get("/api/payroll", requireAuth, requireModuleAccess("payroll"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { month, year, companyId } = req.query;
      let records;

      if (user.role === "super_admin") {
        if (companyId && month && year) {
          records = await storage.getPayrollByMonth(companyId as string, month as string, parseInt(year as string));
        } else {
          records = await storage.getAllPayroll();
          if (companyId) records = records.filter(p => p.companyId === companyId);
        }
      } else if (user.companyId) {
        if (month && year) {
          records = await storage.getPayrollByMonth(user.companyId, month as string, parseInt(year as string));
        } else {
          records = (await storage.getAllPayroll()).filter(p => p.companyId === user.companyId);
        }
        // Enforce contractor + location access restriction
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          records = records.filter((p: any) => allowedEmployeeIds.has(p.employeeId));
        }
      } else {
        records = [];
      }
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payroll" });
    }
  });

  app.post("/api/payroll", requireAuth, requireAction("payroll", "process"), async (req, res) => {
    try {
      const data = insertPayrollSchema.parse(req.body);

      // Block payroll generation if the payroll month hasn't ended yet
      const PR_MONTH_MAP: Record<string, number> = {
        January:1, February:2, March:3, April:4, May:5, June:6,
        July:7, August:8, September:9, October:10, November:11, December:12,
      };
      const prMonthNum = PR_MONTH_MAP[String(data.month)];
      const prYear = Number(data.year);
      if (prMonthNum && prYear) {
        const lastDayOfMonth = new Date(Date.UTC(prYear, prMonthNum, 0)); // last day of payroll month
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        if (todayUTC <= lastDayOfMonth) {
          return res.status(400).json({
            error: `Cannot generate payroll for ${data.month} ${prYear} — the month is not yet complete. Payroll can only be generated after the month ends.`,
          });
        }
      }

      const employee = await storage.getEmployee(data.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });

      // ── Server-side payDays recalculation (timezone-safe) ──────────────────
      // Browser runs in local time (IST/etc.) which causes date mismatches.
      // Re-derive payDays and presentDays on the server using only UTC dates
      // and string prefix matching — no timezone conversion involved.
      const MONTH_NAME_TO_NUM: Record<string, number> = {
        January:1, February:2, March:3, April:4, May:5, June:6,
        July:7, August:8, September:9, October:10, November:11, December:12,
      };
      const calcMonthNum = MONTH_NAME_TO_NUM[String(data.month)];
      const calcYear = Number(data.year);

      if (calcMonthNum && calcYear) {
        const allAtt = await storage.getAttendanceByEmployee(data.employeeId);
        const monthPrefix = `${calcYear}-${String(calcMonthNum).padStart(2, "0")}`;
        const periodAtt = allAtt.filter((a) => a.date.startsWith(monthPrefix));

        const presents = periodAtt.filter(a => a.status === "present").length;
        const halfdays = periodAtt.filter(a => a.status === "half_day").length;
        const weekends = periodAtt.filter(a => a.status === "weekend").length;
        const holidays = periodAtt.filter(a => a.status === "holiday").length;
        const leaves   = periodAtt.filter(a => a.status === "on_leave").length;

        // Earned WOs for WO days that have no stored attendance record
        let earnedWOs = 0;
        try {
          const policies = await storage.getTimeOfficePoliciesByCompany(data.companyId);
          const empPolicyId = (employee as any).timeOfficePolicyId;
          const policy =
            policies.find(p => (p as any).status === "active" && empPolicyId && p.id === empPolicyId) ||
            policies.find(p => (p as any).status === "active" && (p as any).isDefault) ||
            policies.find(p => (p as any).status === "active") || null;

          if (policy) {
            const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
            const wo1 = (policy as any).weeklyOff1 as string | null;
            const wo2 = (policy as any).weeklyOff2 as string | null;
            const wosPerWeek = (wo1 ? 1 : 0) + (wo2 ? 1 : 0);
            const workingDaysPerWeek = Math.max(1, 7 - wosPerWeek);
            // UTC day count — no local timezone involved
            const daysInMonth = new Date(Date.UTC(calcYear, calcMonthNum, 0)).getUTCDate();
            const today = new Date();

            // "auto" WO: any unrecorded past day can absorb the earned WO
            const hasAutoWO = wo1 === "auto" || wo2 === "auto";
            let unrecordedWOs = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${calcYear}-${String(calcMonthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const utcDate = new Date(Date.UTC(calcYear, calcMonthNum - 1, d));
              if (utcDate > today) break;
              const dayName = dayNames[utcDate.getUTCDay()];
              const isWODay = hasAutoWO ? true : (dayName === wo1 || dayName === wo2);
              if (isWODay && !periodAtt.find(a => a.date === dateStr)) {
                unrecordedWOs++;
              }
            }

            if (unrecordedWOs > 0) {
              const presentTotal = presents + halfdays * 0.5;
              const earned = Math.floor(presentTotal * wosPerWeek / workingDaysPerWeek);
              earnedWOs = Math.min(Math.max(0, earned), unrecordedWOs);
            }
          }
        } catch (_) { /* policy lookup failed — earnedWOs stays 0 */ }

        const serverPresentDays = presents + halfdays * 0.5;
        const serverPayDays = serverPresentDays + weekends + holidays + leaves + earnedWOs;
        // Override whatever the browser sent — server value is authoritative
        (data as any).payDays = String(serverPayDays);
        (data as any).presentDays = String(serverPresentDays);
      }
      // ──────────────────────────────────────────────────────────────────────

      const MONTH_NAME_TO_NUM_V: Record<string, number> = {
        January:1, February:2, March:3, April:4, May:5, June:6,
        July:7, August:8, September:9, October:10, November:11, December:12,
      };
      const payrollMonthNum = MONTH_NAME_TO_NUM_V[String(data.month)] || 1;
      const payrollYear = Number(data.year);
      const payrollMonthStart = `${payrollYear}-${String(payrollMonthNum).padStart(2, "0")}-01`;
      const payrollMonthEndDay = new Date(Date.UTC(payrollYear, payrollMonthNum, 0)).getUTCDate();
      const payrollMonthEnd = `${payrollYear}-${String(payrollMonthNum).padStart(2, "0")}-${String(payrollMonthEndDay).padStart(2, "0")}`;

      const joiningDate = (employee as any).dateOfJoining;
      if (joiningDate && joiningDate > payrollMonthEnd) {
        return res.status(400).json({ error: `Employee joined on ${joiningDate}. Cannot generate payroll before joining date.` });
      }

      const exitDate = (employee as any).exitDate;
      if (exitDate && exitDate < payrollMonthStart) {
        return res.status(400).json({ error: `Employee exited on ${exitDate}. Cannot generate payroll after exit date.` });
      }

      const existing = await storage.getPayrollByEmployeeMonth(data.employeeId, data.month, data.year);
      if (existing) {
        if (existing.status === "paid") {
          return res.status(400).json({ error: "Payroll already finalized (Paid) for this employee and month. Cannot regenerate." });
        }
        const updated = await storage.updatePayroll(existing.id, {
          ...data,
          generatedAt: data.generatedAt || new Date().toISOString(),
        });
        return res.json({ ...updated, generatedAt: data.generatedAt });
      }
      const record = await storage.createPayroll(data);
      res.status(201).json(record);
    } catch (error: any) {
      if (error?.message?.includes("finalized") || error?.message?.includes("Paid")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error?.message || "Failed to create payroll record" });
    }
  });

  app.patch("/api/payroll/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getPayroll(req.params.id);
      if (!existing) return res.status(404).json({ error: "Payroll record not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.updatePayroll(req.params.id, req.body);

      // When payroll is first finalized (processed or paid), deduct loan installments from remaining balance
      // Only fires once: draft → processed, or draft → paid. NOT again for processed → paid.
      const wasDraft = !["processed", "paid"].includes(existing.status);
      const isNowFinalized = ["processed", "paid"].includes(req.body.status);
      if (wasDraft && isNowFinalized) {
        const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const monthNum = MONTH_NAMES.indexOf(existing.month) + 1;
        if (monthNum > 0) {
          const payrollYM = `${String(existing.year)}-${String(monthNum).padStart(2, "0")}`;
          const loans = await storage.getLoanAdvancesByEmployee(existing.employeeId);
          // Use the actual stored loanDeduction (which may be capped at net pay) — not the scheduled installment
          // Distribute it proportionally across active loans for this month
          const eligibleLoans = loans.filter(l =>
            l.status === "active" &&
            l.deductionStartMonth &&
            l.deductionStartMonth <= payrollYM &&
            Number(l.installmentAmount) > 0
          );
          const totalScheduled = eligibleLoans.reduce((s, l) => s + Number(l.installmentAmount), 0);
          const totalActualDeduction = Number((updated as any).loanDeduction) || 0;
          let remainingToApply = totalActualDeduction;
          for (const loan of eligibleLoans) {
            const installment = Number(loan.installmentAmount) || 0;
            // Proportional share of the actual deduction (handles multiple loans)
            const share = totalScheduled > 0 ? (installment / totalScheduled) : 1;
            const actualDeduction = Math.min(installment, Math.round(totalActualDeduction * share));
            const applied = Math.min(actualDeduction, remainingToApply);
            if (applied <= 0) continue;
            remainingToApply -= applied;
            const newBalance = Math.max(0, (Number(loan.remainingBalance) || 0) - applied);
            await storage.updateLoanAdvance(loan.id, {
              remainingBalance: newBalance,
              status: newBalance <= 0 ? "closed" : "active",
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      // Notify employee when payslip is processed or paid
      if (isNowFinalized) {
        try {
          const emp = await storage.getEmployee(existing.employeeId);
          const empUserId = await resolveEmployeeUserId(emp);
          if (empUserId) {
            const label = req.body.status === "paid" ? "Salary Credited" : "Payslip Ready";
            const msg = req.body.status === "paid"
              ? `Your salary for ${existing.month} ${existing.year} has been credited. ₹${Number((updated as any).netPay || (updated as any).netSalary || 0).toLocaleString("en-IN")}`
              : `Your payslip for ${existing.month} ${existing.year} has been generated. You can view it under My Finance → Payslips.`;
            // Send employees to the Payslips tab in My Finance (employee
            // self-service), not the admin-only /payroll module.
            await createNotification({ userId: empUserId, companyId: existing.companyId, type: "payroll_" + req.body.status, title: label, message: msg, link: "/loan-advances?tab=payslips" });
          }
        } catch (err) {
          console.error("[Notification] payroll notify failed:", err);
        }
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update payroll" });
    }
  });

  app.delete("/api/payroll/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getPayroll(req.params.id);
      if (!existing) return res.status(404).json({ error: "Payroll record not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      console.log(`[AUDIT] PAYROLL_DELETE | user=${user.username || user.email} (id=${user.id}, role=${user.role}) | payrollId=${existing.id} | empId=${existing.employeeId} | month=${existing.month} ${existing.year} | net=${existing.netSalary} | at=${new Date().toISOString()} | ip=${req.ip}`);
      await storage.writeAuditLog({ action: "PAYROLL_DELETE", userId: user.id, userName: user.username || user.email || "", details: JSON.stringify({ payrollId: existing.id, employeeId: existing.employeeId, month: existing.month, year: existing.year, netSalary: existing.netSalary }) });
      const success = await storage.deletePayroll(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete payroll" });
    }
  });

  // ===== Settings Routes =====
}
