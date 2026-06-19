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

export async function registerAttendanceRoutes(app: Express): Promise<void> {
  app.get("/api/attendance", requireAuth, requireModuleAccess("attendance"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { employeeId, date, companyId } = req.query;
      let records;

      // Employees can only ever see their own attendance
      if (user.role === "employee") {
        const myEmployee = await storage.getEmployeeByUserId(user.id);
        if (!myEmployee) return res.json([]);
        records = await storage.getAttendanceByEmployee(myEmployee.id, date as string | undefined);
      } else if (employeeId) {
        records = await storage.getAttendanceByEmployee(employeeId as string, date as string | undefined);
      } else if (user.role === "super_admin") {
        if (companyId && date) {
          records = await storage.getAttendanceByDate(companyId as string, date as string);
        } else {
          records = await storage.getAllAttendance();
          if (companyId) records = records.filter((a: any) => a.companyId === companyId);
        }
      } else if (user.companyId) {
        if (date) {
          records = await storage.getAttendanceByDate(user.companyId, date as string);
        } else {
          records = (await storage.getAllAttendance()).filter((a: any) => a.companyId === user.companyId);
        }
        // Enforce contractor + location access restriction
        const allowedEmployeeIds = await getAllowedEmployeeIdsForUser(user);
        if (allowedEmployeeIds !== null) {
          records = records.filter((r: any) => allowedEmployeeIds.has(r.employeeId));
        }
      } else {
        records = [];
      }
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance", requireAuth, async (req, res) => {
    try {
      const data = insertAttendanceSchema.parse(req.body);
      const record = await storage.createAttendance(data);
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to create attendance record" });
    }
  });

  app.post("/api/attendance/quick-entry", requireAuth, async (req, res) => {
    try {
      const { employeeId, companyId, month, year, payDays, halfDays, otHours } = req.body;
      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });

      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
      const totalPayDays = parseInt(payDays);
      const halfDayCount = Math.max(0, Math.min(parseInt(halfDays || "0"), totalPayDays));
      const totalOtHours = parseFloat(otHours || "0");

      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      const isCurrentMonth = yearNum === todayYear && monthNum === todayMonth;
      const isFutureMonth = yearNum > todayYear || (yearNum === todayYear && monthNum > todayMonth);

      if (isFutureMonth) {
        return res.status(400).json({ error: "Cannot create attendance for future months." });
      }

      const joiningDate = (employee as any).dateOfJoining;
      let joiningDay = 1;
      if (joiningDate) {
        const jd = new Date(joiningDate);
        const jYear = jd.getFullYear();
        const jMonth = jd.getMonth() + 1;
        if (jYear > yearNum || (jYear === yearNum && jMonth > monthNum)) {
          return res.status(400).json({ error: `Employee joined on ${joiningDate}. Cannot create attendance before joining date.` });
        }
        if (jYear === yearNum && jMonth === monthNum) {
          joiningDay = jd.getDate();
        }
      }

      const exitDate = (employee as any).exitDate;
      let lastActiveDay = daysInMonth;
      if (exitDate) {
        const ed = new Date(exitDate);
        const eYear = ed.getFullYear();
        const eMonth = ed.getMonth() + 1;
        if (eYear < yearNum || (eYear === yearNum && eMonth < monthNum)) {
          return res.status(400).json({ error: `Employee exited on ${exitDate}. Cannot create attendance after exit date.` });
        }
        if (eYear === yearNum && eMonth === monthNum) {
          lastActiveDay = ed.getDate();
        }
      }

      const maxAllowedDays = isCurrentMonth ? Math.min(todayDay, lastActiveDay) : lastActiveDay;

      if (totalPayDays > maxAllowedDays) {
        return res.status(400).json({ error: `Pay days (${totalPayDays}) cannot exceed ${maxAllowedDays} for ${isCurrentMonth ? "the current month (up to today)" : "this month"}.` });
      }

      if (totalPayDays > daysInMonth) {
        return res.status(400).json({ error: `Pay days (${totalPayDays}) cannot exceed ${daysInMonth} days in this month.` });
      }

      const dayNameMap: Record<number, string> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };

      const policies = await storage.getTimeOfficePoliciesByCompany(companyId);
      const activePolicies = policies.filter((p: any) => p.status === "active");
      let policy: any = null;
      if ((employee as any).timeOfficePolicyId) {
        policy = activePolicies.find((p: any) => p.id === (employee as any).timeOfficePolicyId);
      }
      if (!policy) {
        policy = activePolicies.find((p: any) => p.isDefault) || activePolicies[0];
      }

      const holidays = await storage.getHolidaysByCompany(companyId);
      const holidayDates = new Set(holidays.map((h: any) => h.date));

      const leaveRequests = await storage.getLeaveRequestsByEmployee(employeeId);
      const approvedLeaves = leaveRequests.filter((lr: any) => lr.status === "approved");
      const allLeaveTypes = await storage.getLeaveTypesByCompany(companyId);
      const leaveTypeMap = new Map<string, string>();
      for (const lt of allLeaveTypes) {
        leaveTypeMap.set(lt.id, (lt as any).code || lt.name);
      }
      const leaveDatesMap = new Map<string, string>();
      for (const lr of approvedLeaves) {
        const leaveCode = leaveTypeMap.get((lr as any).leaveTypeId) || "L";
        const start = new Date((lr as any).startDate);
        const end = new Date((lr as any).endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          leaveDatesMap.set(d.toISOString().split("T")[0], leaveCode);
        }
      }
      const leaveDatesSet = new Set(leaveDatesMap.keys());

      const wosPerWeek = policy
        ? (policy.weeklyOff1 ? 1 : 0) + (policy.weeklyOff2 ? 1 : 0)
        : 2;

      const dayTypes: { day: number; dateStr: string; isWeeklyOff: boolean; isHoliday: boolean; isLeave: boolean; leaveTypeCode: string; isFuture: boolean }[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const date = new Date(yearNum, monthNum - 1, day);
        const dayName = dayNameMap[date.getDay()];
        const isWeeklyOff = policy
          ? (policy.weeklyOff1 === dayName || (policy.weeklyOff2 || "") === dayName)
          : (date.getDay() === 0 || date.getDay() === 6);
        const isHoliday = !isWeeklyOff && holidayDates.has(dateStr);
        const isLeave = !isWeeklyOff && !isHoliday && leaveDatesSet.has(dateStr);
        const leaveTypeCode = leaveDatesMap.get(dateStr) || "";
        const isFuture = isCurrentMonth && day > todayDay;
        const isBeforeJoining = day < joiningDay;
        const isAfterExit = day > lastActiveDay;
        const isIneligible = isFuture || isBeforeJoining || isAfterExit;
        dayTypes.push({ day, dateStr, isWeeklyOff, isHoliday, isLeave, leaveTypeCode, isFuture: isIneligible });
      }

      const eligibleDays = dayTypes.filter(d => !d.isFuture);
      const wosDaysInRange = eligibleDays.filter(d => d.isWeeklyOff);
      const holidayDaysInRange = eligibleDays.filter(d => d.isHoliday);
      const workingDaysInRange = eligibleDays.filter(d => !d.isWeeklyOff && !d.isHoliday && !d.isLeave);

      const maxWODays = wosDaysInRange.length;         // actual WO days available in range
      const maxWorkingDays = workingDaysInRange.length; // actual working days available

      // Scale holidays proportionally but keep them optional (0 if no holidays)
      const proportionalHolidays = holidayDaysInRange.length > 0
        ? Math.round(totalPayDays / eligibleDays.length * holidayDaysInRange.length)
        : 0;

      // ── Proportional WO formula (consistent with attendance display) ──────
      // earnedWOs = round(presents × wosPerWeek / workingDaysPerWeek)
      // Solve for presents from payDays:  presents ≈ payDays × workingDaysPerWeek / 7
      // Then WOs = payDays - presents - holidays (capped at actual WO days in range).
      const workingDaysPerWeek = Math.max(1, 7 - wosPerWeek);
      const presentsTarget = Math.round((totalPayDays - proportionalHolidays) * workingDaysPerWeek / 7);
      const requiredPresentDays = Math.min(Math.max(0, presentsTarget), maxWorkingDays);
      const proportionalWOs = Math.min(
        Math.max(0, totalPayDays - requiredPresentDays - proportionalHolidays),
        maxWODays
      );

      const presentDayIndices = new Set<number>();
      if (requiredPresentDays > 0 && workingDaysInRange.length > 0) {
        const shuffled = [...workingDaysInRange].sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(requiredPresentDays, shuffled.length); i++) {
          presentDayIndices.add(shuffled[i].day);
        }
      }

      // Pre-sort present day indices; last halfDayCount days → half_day status
      const sortedPresentDays = Array.from(presentDayIndices).sort((a, b) => a - b);
      const effectiveHalfDayCount = Math.min(halfDayCount, sortedPresentDays.length);
      const halfDayDayNumbers = new Set(sortedPresentDays.slice(sortedPresentDays.length - effectiveHalfDayCount));
      const fullPresentCount = sortedPresentDays.length - effectiveHalfDayCount;

      let created = 0;
      let skipped = 0;
      let presentDaysCreated = 0;
      let halfDaysCreated = 0;
      let woMarked = 0;
      let holidayMarked = 0;
      let leaveMarked = 0;

      const lastFullPresentDay = sortedPresentDays.slice(0, fullPresentCount).pop() ?? -1;
      const perDayOt = fullPresentCount > 0
        ? Math.round((totalOtHours / fullPresentCount) * 100) / 100
        : 0;
      let distributedOtSoFar = 0;

      for (const dayInfo of eligibleDays) {
        const { dateStr, isWeeklyOff, isHoliday, isLeave, leaveTypeCode } = dayInfo;
        const existing = await storage.getAttendanceByEmployee(employeeId, dateStr);
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        let status: string;
        if (isWeeklyOff) {
          if (woMarked < proportionalWOs) {
            status = "weekend";
            woMarked++;
          } else {
            status = "absent";
          }
        } else if (isHoliday) {
          if (holidayMarked < proportionalHolidays) {
            status = "holiday";
            holidayMarked++;
          } else {
            status = "absent";
          }
        } else if (isLeave) {
          status = "on_leave";
          leaveMarked++;
        } else if (presentDayIndices.has(dayInfo.day)) {
          if (halfDayDayNumbers.has(dayInfo.day)) {
            status = "half_day";
            halfDaysCreated++;
          } else {
            status = "present";
            presentDaysCreated++;
          }
        } else {
          status = "absent";
        }

        // OT distribution: only to full present days; last present day gets exact remainder
        let otForDay = "0";
        if (status === "present" && totalOtHours > 0 && fullPresentCount > 0) {
          if (dayInfo.day === lastFullPresentDay) {
            const remainder = Math.round((totalOtHours - distributedOtSoFar) * 100) / 100;
            otForDay = String(Math.max(0, remainder));
          } else {
            otForDay = String(perDayOt);
            distributedOtSoFar = Math.round((distributedOtSoFar + perDayOt) * 100) / 100;
          }
        }

        let clockIn: string | null = null;
        let clockOut: string | null = null;
        let workHrs = "0";

        const dutyStart = policy?.dutyStartTime || "09:00";
        const dutyEnd   = policy?.dutyEndTime   || "18:00";
        const [startH, startM] = dutyStart.split(":").map(Number);
        const [endH, endM]     = dutyEnd.split(":").map(Number);

        if (status === "present") {
          const inOffsetMin  = Math.floor(Math.random() * 21) - 5;
          const outOffsetMin = Math.floor(Math.random() * 21) - 5;
          let inTotalMin  = startH * 60 + startM + inOffsetMin;
          let outTotalMin = endH   * 60 + endM   + outOffsetMin;
          if (inTotalMin < 0) inTotalMin = 0;
          if (outTotalMin <= inTotalMin) outTotalMin = inTotalMin + 480;
          clockIn  = `${String(Math.floor(inTotalMin / 60)).padStart(2, "0")}:${String(inTotalMin % 60).padStart(2, "0")}`;
          clockOut = `${String(Math.floor(outTotalMin / 60)).padStart(2, "0")}:${String(outTotalMin % 60).padStart(2, "0")}`;
          const diffMin = outTotalMin - inTotalMin;
          workHrs = `${String(Math.floor(diffMin / 60)).padStart(2, "0")}:${String(diffMin % 60).padStart(2, "0")}`;
        } else if (status === "half_day") {
          // Half-day: clock in at duty start, clock out ~4 hours later (morning half)
          const inTotalMin  = startH * 60 + startM;
          const outTotalMin = inTotalMin + 240; // 4 hours
          clockIn  = `${String(Math.floor(inTotalMin / 60)).padStart(2, "0")}:${String(inTotalMin % 60).padStart(2, "0")}`;
          clockOut = `${String(Math.floor(outTotalMin / 60)).padStart(2, "0")}:${String(outTotalMin % 60).padStart(2, "0")}`;
          workHrs  = "04:00";
        } else if (status === "weekend" || status === "holiday") {
          // Leave clockIn/clockOut as NULL — these are not real punches.
          // If the employee actually worked, biometric sync will fill in
          // the real times later.
          clockIn  = null;
          clockOut = null;
          workHrs  = "00:00";
        }

        await storage.createAttendance({
          employeeId,
          companyId,
          date: dateStr,
          status,
          clockIn,
          clockOut,
          workHours: workHrs,
          otHours: otForDay,
          notes: isWeeklyOff ? "Weekly Off" : isHoliday ? "Holiday" : isLeave ? leaveTypeCode : null,
          leaveTypeCode: isLeave ? leaveTypeCode : null,
        });
        created++;
      }

      const halfMsg = halfDaysCreated > 0 ? ` + ${halfDaysCreated} Half Day` : "";
      res.json({ success: true, message: `Pay Days: ${totalPayDays} (${presentDaysCreated} Present${halfMsg} + ${woMarked} Weekly Offs + ${holidayMarked} Holidays${leaveMarked > 0 ? ` + ${leaveMarked} Leave` : ""}). Created ${created} records (up to ${isCurrentMonth ? "today" : "month end"}), skipped ${skipped} existing.` });
    } catch (error) {
      console.error("[quick-entry] Error:", error);
      res.status(500).json({ error: `Failed to process quick entry: ${(error as any)?.message || error}` });
    }
  });

  app.patch("/api/attendance/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("attendance", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getAttendance(req.params.id);
      if (!existing) return res.status(404).json({ error: "Attendance record not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Only super_admin can edit biometric (machine) records
      if (user.role !== "super_admin" && existing.clockInMethod === "biometric") {
        return res.status(403).json({ error: "Biometric records can only be edited by Super Admin" });
      }

      const updateData = { ...req.body };
      const clockIn = updateData.clockIn || existing.clockIn;
      const clockOut = updateData.clockOut || existing.clockOut;
      const status = updateData.status || existing.status;

      if (clockIn && clockOut && status === "present") {
        const [inH, inM] = clockIn.split(":").map(Number);
        const [outH, outM] = clockOut.split(":").map(Number);
        const inTotalMin = inH * 60 + inM;
        const outTotalMin = outH * 60 + outM;
        const diffMin = outTotalMin > inTotalMin ? outTotalMin - inTotalMin : 0;
        const hrs = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        updateData.workHours = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

        const employee = await storage.getEmployee(existing.employeeId);
        if (employee) {
          const policies = await storage.getTimeOfficePoliciesByCompany(existing.companyId);
          const activePolicies = policies.filter((p: any) => p.status === "active");
          let policy: any = (employee as any).timeOfficePolicyId
            ? activePolicies.find((p: any) => p.id === (employee as any).timeOfficePolicyId)
            : null;
          if (!policy) policy = activePolicies.find((p: any) => p.isDefault) || activePolicies[0];

          const [dutyEndH, dutyEndM] = ((policy?.dutyEndTime) || "18:00").split(":").map(Number);
          const dutyEndMin = dutyEndH * 60 + dutyEndM;
          const [dutyStartH, dutyStartM] = ((policy?.dutyStartTime) || "09:00").split(":").map(Number);
          const dutyStartMin = dutyStartH * 60 + dutyStartM;
          const normalDutyMin = dutyEndMin - dutyStartMin;

          if (normalDutyMin > 0 && diffMin > normalDutyMin) {
            const otMin = diffMin - normalDutyMin;
            const otHrs = Math.floor(otMin / 60);
            const otMins = otMin % 60;
            updateData.otHours = `${String(otHrs).padStart(2, "0")}:${String(otMins).padStart(2, "0")}`;
          } else {
            updateData.otHours = "0";
          }
        }
      }

      const updated = await storage.updateAttendance(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update attendance" });
    }
  });

  // Company admins can add the missing punch for biometric miss_punch records
  app.post("/api/attendance/:id/missed-log", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("attendance", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getAttendance(req.params.id);
      if (!existing) return res.status(404).json({ error: "Attendance record not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.clockInMethod !== "biometric" || existing.status !== "miss_punch") {
        return res.status(400).json({ error: "Only biometric miss_punch records can use this endpoint" });
      }

      const { time, notes } = req.body as { time: string; notes?: string };
      if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: "Invalid time format — expected HH:MM" });
      }

      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

      // Determine the existing single punch time
      const existingTime = existing.clockIn || existing.clockOut || "00:00";
      const newMin = toMin(time);
      const existingMin = toMin(existingTime);

      // Assign clock-in / clock-out by which time is earlier, regardless of which
      // slot was originally filled.  This handles the common case where the biometric
      // device recorded the afternoon punch first (setting it as clockIn) and the
      // morning punch is entered manually.
      let finalClockIn: string;
      let finalClockOut: string;
      if (newMin < existingMin) {
        // Entered time is earlier → it is the clock-in
        finalClockIn  = time;
        finalClockOut = existingTime;
      } else if (newMin > existingMin) {
        // Entered time is later → it is the clock-out
        finalClockIn  = existingTime;
        finalClockOut = time;
      } else {
        // Same minute — fall back to original slot assignment
        finalClockIn  = existing.clockIn  ?? time;
        finalClockOut = existing.clockOut ?? time;
      }

      const inMin  = toMin(finalClockIn);
      const outMin = toMin(finalClockOut);
      // Cross-midnight aware: if outMin < inMin the shift spans midnight
      let diffMin = outMin - inMin;
      if (diffMin < 0) diffMin += 24 * 60;
      const workHours = fromMin(Math.min(diffMin, 24 * 60));

      const employee = await storage.getEmployee(existing.employeeId);
      let otHours = "0";
      if (employee) {
        const policies = await storage.getTimeOfficePoliciesByCompany(existing.companyId);
        const active = (policies as any[]).filter(p => p.status === "active");
        let policy: any = (employee as any).timeOfficePolicyId
          ? active.find(p => p.id === (employee as any).timeOfficePolicyId)
          : null;
        if (!policy) policy = active.find(p => p.isDefault) || active[0];

        // Night-shift aware: if dutyEnd < dutyStart the duty spans midnight
        let normalDutyMin =
          toMin((policy?.dutyEndTime) || "18:00") - toMin((policy?.dutyStartTime) || "09:00");
        if (normalDutyMin <= 0) normalDutyMin += 24 * 60;
        const cappedDiff = Math.min(diffMin, 24 * 60);
        if (normalDutyMin > 0 && cappedDiff > normalDutyMin) {
          otHours = fromMin(cappedDiff - normalDutyMin);
        }
      }

      const updated = await storage.updateAttendance(req.params.id, {
        clockIn:  finalClockIn,
        clockOut: finalClockOut,
        workHours,
        otHours,
        status:   "present",
        ...(notes !== undefined ? { notes } : {}),
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to add missed log" });
    }
  });

  app.delete("/api/attendance/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), requireAction("attendance", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getAttendance(req.params.id);
      if (!existing) return res.status(404).json({ error: "Attendance record not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Only super_admin can delete biometric (machine) records
      if (user.role !== "super_admin" && existing.clockInMethod === "biometric") {
        return res.status(403).json({ error: "Biometric records can only be deleted by Super Admin" });
      }
      await storage.deleteAttendance(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete attendance record" });
    }
  });

  // ===== Leave Types Routes =====
}
