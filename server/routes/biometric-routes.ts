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

export async function registerBiometricRoutes(app: Express): Promise<void> {
  app.get("/api/biometric/devices", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let devices;
      if (user.role === "super_admin") {
        devices = await storage.getAllBiometricDevices();
      } else if (user.companyId) {
        devices = await storage.getBiometricDevicesByCompany(user.companyId);
      } else {
        devices = [];
      }
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: "Failed to get biometric devices" });
    }
  });

  app.post("/api/biometric/devices", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertBiometricDeviceSchema.parse(req.body);
      // Only super_admin can create shared devices (companyId = null).
      // Company admins are forced to scope new devices to their own company.
      if (user.role !== "super_admin") {
        if (data.companyId == null || data.companyId !== user.companyId) {
          (data as any).companyId = user.companyId;
        }
      }
      // SSRF guard: an admin cannot point the server at internal hosts.
      const netError = validateBiometricNetwork((data as any).ipAddress, (data as any).port);
      if (netError) {
        return res.status(400).json({ error: netError });
      }
      // Anti-spoof: a device must be bound to either a shared secret or a
      // pinned source CIDR. Otherwise anyone who learns the serial number
      // could fabricate ADMS pushes against /iclock/cdata.
      const authError = validateBiometricDeviceAuth((data as any).pushToken, (data as any).allowedIpCidr);
      if (authError) {
        return res.status(400).json({ error: authError });
      }
      const device = await storage.createBiometricDevice(data);
      res.status(201).json(device);
    } catch (error: any) {
      if (error?.code === "23505" && error?.constraint?.includes("device_serial_unique")) {
        return res.status(409).json({
          error: "A device with this serial number already exists. Each machine must have a unique Device Serial / ID.",
        });
      }
      console.error("[biometric/devices POST] error:", error);
      res.status(500).json({ error: error?.message || "Failed to create biometric device", details: error?.errors });
    }
  });

  app.patch("/api/biometric/devices/:id", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (user.role !== "super_admin" && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied. You can only edit devices that belong to your company." });
      }
      const { name, code, deviceSerial, ipAddress, admsServerIp, port, status, companyId, pushToken, allowedIpCidr, autoDeletePunches, deviceModel } = req.body || {};
      const patch: Record<string, any> = {};
      if (name !== undefined) patch.name = name;
      if (code !== undefined) patch.code = code === "" ? null : String(code).trim();
      if (deviceSerial !== undefined) patch.deviceSerial = deviceSerial;
      if (ipAddress !== undefined) patch.ipAddress = ipAddress;
      if (admsServerIp !== undefined) patch.admsServerIp = admsServerIp === "" ? null : admsServerIp;
      if (port !== undefined) patch.port = port == null || port === "" ? null : Number(port);
      if (status !== undefined) patch.status = status;
      // Only super_admin may move a device across companies (or to "shared").
      if (companyId !== undefined && user.role === "super_admin") patch.companyId = companyId;
      if (pushToken !== undefined) patch.pushToken = pushToken === "" ? null : pushToken;
      if (allowedIpCidr !== undefined) patch.allowedIpCidr = allowedIpCidr === "" ? null : allowedIpCidr;
      if (autoDeletePunches !== undefined) patch.autoDeletePunches = !!autoDeletePunches;
      if (deviceModel !== undefined) patch.deviceModel = ["zkteco", "essl_airface"].includes(deviceModel) ? deviceModel : "zkteco";

      // SSRF guard: validate any new ipAddress/port the same way create does.
      const nextIp = patch.ipAddress !== undefined ? patch.ipAddress : device.ipAddress;
      const nextPort = patch.port !== undefined ? patch.port : device.port;
      const netError = validateBiometricNetwork(nextIp, nextPort);
      if (netError) {
        return res.status(400).json({ error: netError });
      }
      // Anti-spoof: after this patch the device must still have at least
      // one of pushToken / allowedIpCidr set, and any provided values must
      // parse cleanly.
      const nextToken = patch.pushToken !== undefined ? patch.pushToken : (device as any).pushToken;
      const nextCidr  = patch.allowedIpCidr !== undefined ? patch.allowedIpCidr : (device as any).allowedIpCidr;
      const authError = validateBiometricDeviceAuth(nextToken, nextCidr);
      if (authError) {
        return res.status(400).json({ error: authError });
      }

      const updated = await storage.updateBiometricDevice(req.params.id, patch as any);
      if (!updated) return res.status(404).json({ error: "Device not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("[biometric/devices PATCH] error:", error);
      res.status(500).json({ error: error?.message || "Failed to update biometric device" });
    }
  });

  app.delete("/api/biometric/devices/:id", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      // Only super_admin can remove shared devices or devices in another company
      if (user.role !== "super_admin" && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied. You can only delete devices that belong to your company." });
      }
      const ok = await storage.deleteBiometricDevice(req.params.id);
      if (!ok) return res.status(404).json({ message: "Device not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to delete biometric device" });
    }
  });

  // List the employees seen on this machine, derived from the punch log
  // history. Each row is one device-side employee ID (the PIN the machine
  // uses) with the matched system employee (if any) and how many punches
  // we've recorded for that user on this machine.
  app.get("/api/biometric/devices/:id/users", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied. You can only view devices that belong to your company." });
      }
      // Build a roster of every PIN known on this machine, from two sources:
      //   1. biometric_device_users — users the device has pushed via
      //      USERINFO/USER (i.e. actually enrolled on the machine).
      //   2. biometric_punch_logs   — anyone who has punched here, in case
      //      a USERINFO push was missed or the firmware doesn't send one.
      // Then we LEFT JOIN employees to attach the matched HR employee.
      const rows = await db.execute(sql`
        WITH pin_union AS (
          SELECT device_employee_id FROM biometric_device_users
            WHERE device_id = ${req.params.id}
          UNION
          SELECT DISTINCT device_employee_id FROM biometric_punch_logs
            WHERE device_id = ${req.params.id}
        ),
        punch_agg AS (
          SELECT
            device_employee_id,
            COUNT(*)::int                              AS punch_count,
            MAX(punch_date || ' ' || punch_time)       AS last_punch_at,
            MAX(employee_id)                           AS employee_id
          FROM biometric_punch_logs
          WHERE device_id = ${req.params.id}
          GROUP BY device_employee_id
        )
        SELECT
          p.device_employee_id                         AS device_employee_id,
          du.name                                      AS device_name,
          du.privilege                                 AS device_privilege,
          du.card                                      AS device_card,
          du.last_seen_at                              AS enrolled_last_seen_at,
          (du.device_employee_id IS NOT NULL)          AS enrolled,
          pa.punch_count                               AS punch_count,
          pa.last_punch_at                             AS last_punch_at,
          COALESCE(emap.id, pa.employee_id)            AS employee_id,
          COALESCE(emap.first_name, e.first_name)      AS first_name,
          COALESCE(emap.last_name,  e.last_name)       AS last_name,
          COALESCE(emap.employee_code, e.employee_code)   AS hr_employee_code,
          COALESCE(emap.official_email, e.official_email) AS email,
          COALESCE(emap.registered_face_image, e.registered_face_image) AS face_image,
          COALESCE(emap.designation, e.designation) AS designation,
          COALESCE(emap.department, e.department) AS department,
          ecode.id                                                     AS code_matched_employee_id,
          ecode.first_name                                             AS code_matched_first_name,
          ecode.last_name                                              AS code_matched_last_name
        FROM pin_union p
        LEFT JOIN biometric_device_users du
          ON du.device_id = ${req.params.id}
         AND du.device_employee_id = p.device_employee_id
        LEFT JOIN punch_agg pa
          ON pa.device_employee_id = p.device_employee_id
        LEFT JOIN employees emap
          ON emap.biometric_device_id = p.device_employee_id
        LEFT JOIN employees e
          ON e.id = pa.employee_id
        -- Fallback: match by employee_code = device PIN (common ZKTeco deployment
        -- where the operator uses the employee code as the device PIN)
        LEFT JOIN employees ecode
          ON ecode.employee_code = p.device_employee_id
         AND ecode.company_id   = ${device.companyId ?? null}
        ORDER BY (du.device_employee_id IS NOT NULL) DESC,
                 pa.last_punch_at DESC NULLS LAST,
                 p.device_employee_id ASC
        LIMIT 2000
      `);
      const users = (rows.rows as any[]).map((r) => ({
        deviceEmployeeId: r.device_employee_id,
        employeeId: r.employee_id || null,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        hrEmployeeCode: r.hr_employee_code || null,
        email: r.email || null,
        faceImage: r.face_image || null,
        designation: r.designation || null,
        department: r.department || null,
        deviceName: r.device_name || null,
        // Fallback names from code-matched employee (no mapping required)
        codeMatchedEmployeeId: (r as any).code_matched_employee_id || null,
        codeMatchedFirstName: (r as any).code_matched_first_name || null,
        codeMatchedLastName: (r as any).code_matched_last_name || null,
        privilege: r.device_privilege || null,
        card: r.device_card || null,
        enrolled: !!r.enrolled,
        enrolledLastSeenAt: r.enrolled_last_seen_at || null,
        punchCount: Number(r.punch_count) || 0,
        lastSeenAt: r.last_punch_at || r.enrolled_last_seen_at || null,
        matched: !!r.employee_id,
      }));
      res.json({
        device: {
          id: device.id,
          name: device.name,
          code: (device as any).code || null,
          deviceSerial: device.deviceSerial,
        },
        total: users.length,
        users,
      });
    } catch (error: any) {
      console.error("[biometric/devices/:id/users] error:", error);
      res.status(500).json({ error: error?.message || "Failed to load device users" });
    }
  });

  // Delete ALL punch logs and reset ATTLOGStamp so every device re-uploads everything.
  app.post("/api/biometric/clear-and-resync", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const result = await db.execute(sql.raw(`DELETE FROM biometric_punch_logs`));
      const deleted = (result as any)?.rowCount ?? 0;

      // Reset ATTLOGStamp to 0 on every device so the next GET /iclock/cdata
      // response includes ATTLOGStamp=0, telling the SpeedFace-V5L to re-push
      // its entire stored attendance log. No extra getrequest commands needed —
      // the stamp in the registration response IS the trigger.
      const devices = await storage.getAllBiometricDevices();
      for (const dev of devices) {
        await storage.updateBiometricDevice(dev.id, { lastAttlogStamp: 0 } as any);
      }

      res.json({
        success: true,
        deleted,
        devicesReset: devices.length,
        message: `Deleted ${deleted} punch records. ATTLOGStamp reset to 0 on ${devices.length} device(s). The device will re-upload all stored records on its next TransTimes connection (within 5 minutes).`,
      });
    } catch (error: any) {
      console.error("[biometric/clear-and-resync] error:", error);
      res.status(500).json({ error: String(error?.message || "Clear failed") });
    }
  });

  // One-time timezone correction: shift all stored punch times by N minutes.
  // Use when the biometric device was sending timestamps in a wrong timezone
  // (e.g., UTC+8 instead of IST UTC+5:30 → offsetMinutes = -150).
  app.post("/api/biometric/correct-timezone", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const offsetMinutes: number = typeof req.body?.offsetMinutes === "number" ? req.body.offsetMinutes : -150;
      if (offsetMinutes === 0) return res.json({ success: true, updated: 0, message: "Offset is 0 — nothing to do." });

      const sign = offsetMinutes >= 0 ? "+" : "-";
      const absMin = Math.abs(offsetMinutes);
      const intervalSql = `${absMin} minutes`;

      const result = await db.execute(sql.raw(`
        UPDATE biometric_punch_logs
        SET
          punch_time = to_char(
            (to_timestamp(punch_date || ' ' || punch_time, 'YYYY-MM-DD HH24:MI') ${sign} interval '${intervalSql}'),
            'HH24:MI'
          ),
          punch_date = to_char(
            (to_timestamp(punch_date || ' ' || punch_time, 'YYYY-MM-DD HH24:MI') ${sign} interval '${intervalSql}'),
            'YYYY-MM-DD'
          )
      `));

      const updated = (result as any)?.rowCount ?? 0;
      res.json({ success: true, updated, message: `Shifted ${updated} punch records by ${offsetMinutes} minutes.` });
    } catch (error: any) {
      console.error("[biometric/correct-timezone] error:", error);
      res.status(500).json({ error: String(error?.message || "Correction failed") });
    }
  });

  // Trigger a user-list sync from the SpeedFace-V5L.
  // The device automatically pushes its enrolled-user table on every
  // TransTimes connection (TransTables=User Transaction in the registration
  // response). We don't send a getrequest command — that mechanism doesn't
  // exist in the SpeedFace-V5L ADMS push protocol.
  app.post("/api/biometric/devices/:id/sync-users", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { enqueueDeviceCommand, pushHrUsernamesToDevice } = await import("../adms");

      // 1. Tell the device to upload its full user list (so we get PIN roster + any names it has)
      await enqueueDeviceCommand(device.id, "DATA UPDATE USERINFO Stamp=0");
      console.log(`[biometric/sync-users] Queued DATA UPDATE USERINFO Stamp=0 for device ${device.deviceSerial}`);

      // 2. Push HR employee names TO the device so the device learns the names it's missing.
      //    This is the key fix: when users were enrolled without typing a name on the device
      //    keyboard, the device stores empty names. We push the HRMS name so it gets stored.
      const companyId = device.companyId;
      const allEmps = companyId
        ? await storage.getEmployeesByCompany(companyId)
        : await storage.getAllEmployees();
      const mappedEmps = (allEmps as any[]).filter(
        (e: any) => e.biometricDeviceId && (e.firstName || e.lastName)
      );
      let pushed = 0;
      let dbUpdated = 0;
      if (mappedEmps.length > 0) {
        pushed = await pushHrUsernamesToDevice(device.id, mappedEmps.map((e: any) => ({
          biometricDeviceId: String(e.biometricDeviceId),
          firstName: e.firstName || "",
          lastName: e.lastName || "",
        })));
        console.log(`[biometric/sync-users] Queued ${pushed} HR name push commands for device ${device.deviceSerial}`);

        // Also update biometric_device_users directly in the DB so names
        // appear immediately in the UI even before the device responds.
        for (const emp of mappedEmps) {
          const pin = String((emp as any).biometricDeviceId);
          const fullName = [(emp as any).firstName, (emp as any).lastName].filter(Boolean).join(" ").trim();
          if (!fullName) continue;
          try {
            const r = await db.execute(sql`
              UPDATE biometric_device_users
              SET name = ${fullName}
              WHERE device_id = ${device.id}
                AND device_employee_id = ${pin}
                AND (name IS NULL OR name = '')
            `);
            if ((r.rowCount ?? 0) > 0) dbUpdated++;
          } catch { /* best-effort */ }
        }
        if (dbUpdated > 0) {
          console.log(`[biometric/sync-users] Directly updated ${dbUpdated} empty names in DB from HR data`);
        }
      }

      res.json({
        success: true,
        pushed,
        dbUpdated,
        message: `Sync requested. ${pushed > 0
          ? `${pushed} employee name(s) queued for the device + ${dbUpdated} name(s) updated in the local records immediately.`
          : "No mapped employees found to push names for — use 'Map to HR' to link device PINs to employees first."}`,
      });
    } catch (error: any) {
      console.error(`[biometric/devices/:id/sync-users] error:`, error);
      res.status(500).json({ error: String(error?.message || "Failed to queue sync") });
    }
  });

  // Delete a user from the physical biometric device (sends DATA DELETE USERINFO PIN=X
  // via the ADMS command queue) and removes them from local biometric_device_users.
  // Punch logs are NOT deleted — historical attendance records are preserved.
  app.delete("/api/biometric/devices/:id/users/:pin", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const pin = String(req.params.pin).trim();
      if (!pin) return res.status(400).json({ error: "PIN is required" });

      // 1. Send delete command to the physical device
      const { enqueueDeviceCommand } = await import("../adms");
      await enqueueDeviceCommand(device.id, `DATA DELETE USERINFO PIN=${pin}`);

      // 2. Remove from local biometric_device_users (punch logs remain)
      await db.execute(sql`
        DELETE FROM biometric_device_users
        WHERE device_id = ${device.id} AND device_employee_id = ${pin}
      `);

      console.log(`[biometric/remove-user] PIN=${pin} deleted from device ${device.deviceSerial} and local DB`);
      res.json({
        success: true,
        message: `User PIN ${pin} removed from device. The delete command has been queued and will execute on the device's next connection.`,
      });
    } catch (error: any) {
      console.error(`[biometric/devices/:id/users/:pin DELETE] error:`, error);
      res.status(500).json({ error: String(error?.message || "Failed to delete user") });
    }
  });

  // Reset ATTLOGStamp to 0 on a single device so it re-uploads ALL stored records.
  // Also enqueues DATA UPDATE ATTLOG Stamp=0 so the command is delivered on the
  // device's next /getrequest poll (within seconds when device is online).
  app.post("/api/biometric/devices/:id/reset-stamp", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const device = await storage.getBiometricDevice(req.params.id);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.updateBiometricDevice(device.id, { lastAttlogStamp: 0 } as any);
      // Bust the in-memory device cache so the NEXT getrequest poll reads
      // lastAttlogStamp=0 from the DB instead of the stale cached value.
      // Without this the device keeps receiving DATA UPDATE ATTLOG Stamp=<old>
      // for up to 30 seconds and never re-uploads its history.
      const { bustDeviceCache } = await import("../adms");
      bustDeviceCache(device.id);
      res.json({ success: true, message: "ATTLOGStamp reset to 0. The device will re-upload all stored records on its next connection (within 5 minutes)." });
    } catch (error: any) {
      console.error("[biometric/devices/:id/reset-stamp] error:", error);
      res.status(500).json({ error: String(error?.message || "Failed to reset stamp") });
    }
  });

  // Manual trigger: process unprocessed biometric logs → attendance records
  app.post("/api/biometric/process-attendance", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? undefined : user.companyId;
      const { processBiometricAttendance } = await import("../biometric-attendance-sync");
      const result = await processBiometricAttendance(companyId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[biometric/process-attendance] error:", error);
      res.status(500).json({ error: String(error?.message || "Failed to process attendance") });
    }
  });

  // ===== Biometric Punch Log Routes =====
  // ADMS device communication log — shows last 200 raw requests from device.
  // Reads from DB (persistent, survives restarts) merged with in-memory entries.
  app.get("/api/biometric/adms-log", requireAuth, requireRole("super_admin", "company_admin"), async (_req, res) => {
    const dbEntries = await getAdmsActivityLogFromDB();
    const memEntries = getAdmsActivityLog();
    // Merge: prefer DB (it has persisted entries); overlay recent in-memory ones
    // that haven't been flushed yet by deduping by ts+line.
    const seen = new Set(dbEntries.map((e) => `${e.ts}|${e.line}`));
    const extra = memEntries.filter((e) => !seen.has(`${e.ts}|${e.line}`));
    // DB entries come newest-first; reverse for chronological merge, then sort.
    const all = [...dbEntries.reverse(), ...extra].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );
    res.json(all.slice(-200));
  });

  // ADMS server status — shows whether port 8181 is bound, when it started,
  // and any binding error. Used by the admin diagnostic banner.
  app.get("/api/biometric/adms-server-status", requireAuth, requireRole("super_admin", "company_admin"), async (_req, res) => {
    res.json(getAdmsServerStatus());
  });

  // Import ATTLOG data from a file — workaround for devices that won't re-push
  // historical records. User exports data from device USB, uploads the text file here.
  // Accepts the raw ZKTeco ATTLOG text format (tab OR space-separated lines).
  // Also accepts CSV: date,time,pin,status  or  pin,datetime,status columns.
  app.post("/api/biometric/import-attlog", requireAuth, requireRole("super_admin", "company_admin"),
    upload.single("file"), async (req: any, res) => {
    try {
      const user = (req as any).user;
      const deviceId = (req.body?.deviceId || "").trim();

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      // Resolve device — required for associating records
      let device: any = null;
      if (deviceId) {
        device = await storage.getBiometricDevice(deviceId);
        if (!device) return res.status(404).json({ error: "Device not found." });
        if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
          return res.status(403).json({ error: "Access denied." });
        }
      } else {
        // Pick first device for this user's company
        const allDevices = await storage.getAllBiometricDevices();
        const myDevices = user.role === "super_admin"
          ? allDevices
          : allDevices.filter((d: any) => d.companyId === user.companyId);
        device = myDevices[0] ?? null;
        if (!device) return res.status(400).json({ error: "No biometric device found. Please select a device." });
      }

      const fileText = req.file.buffer.toString("utf8");
      const result = await processAttlog(device, fileText);

      res.json({
        success: true,
        message: `Import complete: ${result.inserted} records stored, ${result.duplicates} duplicates skipped, ${result.unmapped} unmapped (no employee match), ${result.bad} unreadable lines.`,
        results: result,
      });
    } catch (error: any) {
      console.error("[biometric/import-attlog] error:", error);
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  // Import USERINFO (device user list) from a file exported via USB.
  // Format expected: ZKTeco USER key=value lines, one per line.
  app.post("/api/biometric/import-userinfo", requireAuth, requireRole("super_admin", "company_admin"),
    upload.single("file"), async (req: any, res) => {
    try {
      const user = (req as any).user;
      const deviceId = (req.body?.deviceId || "").trim();

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      let device: any = null;
      if (deviceId) {
        device = await storage.getBiometricDevice(deviceId);
        if (!device) return res.status(404).json({ error: "Device not found." });
        if (user.role !== "super_admin" && device.companyId && device.companyId !== user.companyId) {
          return res.status(403).json({ error: "Access denied." });
        }
      } else {
        const allDevices = await storage.getAllBiometricDevices();
        const myDevices = user.role === "super_admin"
          ? allDevices
          : allDevices.filter((d: any) => d.companyId === user.companyId);
        device = myDevices[0] ?? null;
        if (!device) return res.status(400).json({ error: "No biometric device found." });
      }

      const fileText = req.file.buffer.toString("utf8");
      const result = await processUserRecords(device, fileText);

      res.json({
        success: true,
        message: `User import complete: ${result.upserted} users stored/updated, ${result.bad} unreadable lines.`,
        results: result,
      });
    } catch (error: any) {
      console.error("[biometric/import-userinfo] error:", error);
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  // Map a device PIN to an HR employee.
  // Sets employee.biometricDeviceId and retroactively links all existing
  // punch logs for that PIN to the employee (sets employeeId where null).
  app.post("/api/biometric/map-pin", requireAuth, requireRole("super_admin", "company_admin"), async (req: any, res) => {
    try {
      const user = req.user;
      const { employeeId, devicePin, deviceId } = req.body || {};
      if (!employeeId || !devicePin) {
        return res.status(400).json({ error: "employeeId and devicePin are required." });
      }

      // Verify employee belongs to the user's company
      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found." });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied." });
      }

      // Check if another employee already has this PIN in the same company
      const allEmps = await storage.getEmployeesByCompany(employee.companyId);
      const conflict = allEmps.find((e: any) => e.biometricDeviceId === String(devicePin) && e.id !== employeeId);
      if (conflict) {
        return res.status(409).json({
          error: `PIN ${devicePin} is already assigned to ${conflict.firstName} ${conflict.lastName} (${conflict.employeeCode}).`
        });
      }

      // Update the employee's biometric device PIN
      await storage.updateEmployee(employeeId, { biometricDeviceId: String(devicePin) });

      // Retroactively link existing punch logs for this PIN.
      // Filter by device_id (not company_id) so that contractor employees who punch
      // on a principal employer's device — where punch logs carry the device's
      // company_id rather than the employee's — are correctly linked.
      // We also fix company_id in the log so attendance processing works correctly.
      // We cover both NULL employee_id (first-time map) and re-maps to a new employee.
      const deviceClause = deviceId
        ? sql`AND device_id = ${deviceId}`
        : sql`AND company_id = ${employee.companyId}`;
      const updated = await db.execute(sql`
        UPDATE biometric_punch_logs
        SET employee_id = ${employeeId},
            company_id  = ${employee.companyId}
        WHERE device_employee_id = ${String(devicePin)}
          ${deviceClause}
          AND (employee_id IS NULL OR employee_id != ${employeeId})
      `);

      const linkedCount = (updated as any)?.rowCount ?? 0;

      // Immediately process the newly linked punch logs so attendance records
      // appear right away instead of waiting for the next 5-minute sweep.
      if (linkedCount > 0) {
        import("../biometric-attendance-sync")
          .then(({ processBiometricAttendance }) =>
            processBiometricAttendance(employee.companyId)
          )
          .catch((err) => console.error("[map-pin] post-map sync failed:", err));
      }

      res.json({
        success: true,
        message: `PIN ${devicePin} mapped to ${employee.firstName} ${employee.lastName}. ${linkedCount} existing punch records linked.`,
      });
    } catch (error: any) {
      console.error("[biometric/map-pin] error:", error);
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  app.get("/api/biometric/logs", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId: qCompanyId, date } = req.query;

      let targetCompanyId: string | null = null;
      if (user.role === "super_admin") {
        targetCompanyId = (qCompanyId as string) || null;
      } else if (user.companyId) {
        targetCompanyId = user.companyId;
      }

      // Single enriched query: punch logs + employee name resolved via 3 paths:
      //   1. bpl.employee_id (explicitly mapped)
      //   2. employees.biometric_device_id = device PIN (auto-matched by biometric ID)
      //   3. employees.employee_code = device PIN (common in card-only deployments)
      //   4. biometric_device_users.name (name the device itself reported via USERINFO)
      const companyFilter = targetCompanyId
        ? sql`AND bpl.company_id = ${targetCompanyId}`
        : sql``;
      const dateFilter = date
        ? sql`AND bpl.punch_date = ${date as string}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          bpl.id,
          bpl.company_id          AS "companyId",
          bpl.employee_id         AS "employeeId",
          bpl.device_employee_id  AS "deviceEmployeeId",
          bpl.punch_date          AS "punchDate",
          bpl.punch_time          AS "punchTime",
          bpl.punch_type          AS "punchType",
          bpl.punch_type_override AS "punchTypeOverride",
          bpl.device_id           AS "deviceId",
          bpl.is_processed        AS "isProcessed",
          bpl.is_duplicate        AS "isDuplicate",
          bpl.missing_punch       AS "missingPunch",
          bpl.synced_at           AS "syncedAt",
          bpl.created_at          AS "createdAt",
          -- Resolved employee (mapped, or matched by biometricDeviceId/employeeCode)
          COALESCE(e1.id,         e2.id,         e3.id)         AS "resolvedEmployeeId",
          COALESCE(e1.first_name, e2.first_name, e3.first_name) AS "resolvedFirstName",
          COALESCE(e1.last_name,  e2.last_name,  e3.last_name)  AS "resolvedLastName",
          COALESCE(e1.employee_code, e2.employee_code, e3.employee_code) AS "resolvedEmployeeCode",
          -- Device-provided name (from USERINFO) as final fallback
          bdu.name AS "deviceName"
        FROM biometric_punch_logs bpl
        LEFT JOIN employees e1
          ON e1.id = bpl.employee_id
        LEFT JOIN employees e2
          ON e2.biometric_device_id = bpl.device_employee_id
         AND e2.company_id = bpl.company_id
        LEFT JOIN employees e3
          ON e3.employee_code = bpl.device_employee_id
         AND e3.company_id = bpl.company_id
        LEFT JOIN biometric_device_users bdu
          ON bdu.device_id = bpl.device_id
         AND bdu.device_employee_id = bpl.device_employee_id
        WHERE TRUE
          ${companyFilter}
          ${dateFilter}
        ORDER BY bpl.punch_date DESC, bpl.punch_time DESC
        LIMIT 5000
      `);

      const enriched = (rows.rows as any[]).map((r) => ({
        id:               r.id,
        companyId:        r.companyId,
        employeeId:       r.employeeId   || r.resolvedEmployeeId || null,
        deviceEmployeeId: r.deviceEmployeeId,
        punchDate:        r.punchDate,
        punchTime:        r.punchTime,
        punchType:         r.punchType,
        punchTypeOverride: !!r.punchTypeOverride,
        deviceId:          r.deviceId,
        isProcessed:       !!r.isProcessed,
        isDuplicate:      !!r.isDuplicate,
        missingPunch:     !!r.missingPunch,
        syncedAt:         r.syncedAt,
        createdAt:        r.createdAt,
        // Resolved name — shown even when not explicitly mapped
        resolvedEmployeeId:   r.resolvedEmployeeId   || null,
        resolvedFirstName:    r.resolvedFirstName    || null,
        resolvedLastName:     r.resolvedLastName     || null,
        resolvedEmployeeCode: r.resolvedEmployeeCode || null,
        deviceName:           r.deviceName           || null,
      }));

      res.json(enriched);
    } catch (error) {
      console.error("[biometric/logs] error:", error);
      res.status(500).json({ error: "Failed to fetch biometric logs" });
    }
  });

  // Update punch type for a single log (manual correction for in/out mix-ups).
  // Sets punch_type_override = true so the auto-classifier will not overwrite
  // this correction on future syncs. Then re-classifies the rest of the day's
  // punches for that employee (those without override), updates attendance.
  app.patch("/api/biometric/logs/:id/punch-type", requireAuth, requireRole("super_admin", "company_admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { punchType } = req.body;
      if (!["in", "out"].includes(punchType)) {
        return res.status(400).json({ error: "punchType must be 'in' or 'out'" });
      }
      const user = req.user;
      const companyClause = user.role !== "super_admin"
        ? sql`AND company_id = ${user.companyId}`
        : sql``;

      // 1. Mark this specific log as manually overridden & set its type
      const result = await db.execute(sql`
        UPDATE biometric_punch_logs
        SET punch_type          = ${punchType},
            punch_type_override = true,
            is_processed        = false,
            synced_at           = NULL
        WHERE id = ${id}
          ${companyClause}
      `);
      if ((result as any)?.rowCount === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      // 2. Fetch employee_id + punch_date + company_id for this log
      const logRow = await db.execute<{
        employee_id: string; punch_date: string; company_id: string;
      }>(sql`SELECT employee_id, punch_date, company_id FROM biometric_punch_logs WHERE id = ${id}`);
      const logData = (logRow as any)?.rows?.[0];

      if (logData?.employee_id && logData?.punch_date) {
        // 3. Re-classify all non-overridden punches for this employee+date
        //    so first=in / last=out is correctly reassigned after the admin edit
        import("../biometric-attendance-sync")
          .then(async ({ classifyPunchTypes, processBiometricAttendance }) => {
            await classifyPunchTypes(logData.employee_id, logData.punch_date, logData.company_id);
            await processBiometricAttendance(logData.company_id);
          })
          .catch(err => console.error("[patch-punch-type] re-classify/sync failed:", err));
      }

      res.json({ success: true, punchType, override: true });
    } catch (error: any) {
      console.error("[biometric/logs/punch-type] error:", error);
      res.status(500).json({ error: "Failed to update punch type" });
    }
  });

  // ===== Job Posting Routes =====
}
