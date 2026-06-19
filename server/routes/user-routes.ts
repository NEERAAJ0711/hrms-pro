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

export async function registerUserRoutes(app: Express): Promise<void> {
  app.get("/api/users", requireAuth, requireModuleAccess("users"), async (req, res) => {
    try {
      const user = (req as any).user;
      let users;
      if (user.role === "super_admin") {
        users = await userService.getAllUsers();
      } else if (user.companyId) {
        users = (await userService.getAllUsers()).filter(u => u.companyId === user.companyId);
      } else {
        users = [];
      }
      const companyId = user.role === "super_admin" ? null : user.companyId;
      const allEmployees = companyId
        ? await employeeService.getEmployeesByCompany(companyId)
        : await (async () => {
            const companies = await companyService.getAllCompanies();
            const lists = await Promise.all(companies.map(c => employeeService.getEmployeesByCompany(c.id)));
            return lists.flat();
          })();
      const empByUserId: Record<string, { firstName: string; lastName: string }> = {};
      for (const emp of allEmployees) {
        if (emp.userId) empByUserId[emp.userId] = { firstName: emp.firstName, lastName: emp.lastName };
      }
      const enriched = users.map(u => ({
        ...u,
        employeeName: empByUserId[u.id] ? `${empByUserId[u.id].firstName} ${empByUserId[u.id].lastName}`.trim() : null,
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireAuth, requireAction("users", "create"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertUserSchema.parse(req.body);
      if (user.role !== "super_admin") {
        (data as any).companyId = user.companyId;
        if ((data as any).role === "super_admin") {
          return res.status(403).json({ error: "Only Super Admin can create Super Admin users." });
        }
      }
      const existingByUsername = await userService.getUserByUsername(data.username);
      if (existingByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const existingByEmail = await userService.getUserByEmail(data.email);
      if (existingByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const newUser = await userService.createUser(data);
      res.status(201).json(newUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireAction("users", "edit"), async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await userService.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (req.body.role === "super_admin" && user.role !== "super_admin") {
        return res.status(403).json({ error: "Only Super Admin can assign Super Admin role." });
      }
      const updateData: Record<string, any> = { ...req.body };
      if (!updateData.password || updateData.password === "") {
        delete updateData.password;
      }
      if (user.role !== "super_admin") {
        updateData.companyId = targetUser.companyId;
      }
      const updated = await userService.updateUser(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAction("users", "delete"), async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await userService.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await userService.deleteUser(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ===== User Permissions Routes =====
  app.get("/api/users/:id/permissions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await userService.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      // A user can always read their own permission overrides (needed by the
      // sidebar to render modules an admin has granted them). Otherwise the
      // caller must be Super Admin or Company Admin of the same company.
      const isSelf = user.id === req.params.id;
      if (!isSelf) {
        if (user.role !== "super_admin" && user.role !== "company_admin") {
          return res.status(403).json({ error: "Access denied" });
        }
        if (user.role === "company_admin" && targetUser.companyId !== user.companyId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const permissions = await userService.getUserPermissions(req.params.id);
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  app.put("/api/users/:id/permissions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await userService.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      if (user.role === "company_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { permissions } = req.body as { permissions: { module: string; canAccess: boolean }[] };
      if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions must be an array" });
      const result = await userService.setUserPermissions(req.params.id, permissions, user.id, targetUser.companyId);
      res.json(result);
    } catch (error) {
      console.error("set permissions error:", error);
      res.status(500).json({ error: "Failed to update permissions" });
    }
  });

  // ===== Module Access Requests =====
  // The full list of HR modules a user can request access to. Keep in sync
  // with the requireModuleAccess() / MODULE_ACCESS map above.
  const REQUESTABLE_MODULES = new Set([
    "employees", "attendance", "leave", "payroll", "reports",
    "recruitment", "compliances", "masters", "settings", "users",
  ]);

  // User creates a new request for module access.
  app.post("/api/module-access-requests", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const module = String(req.body?.module || "").trim();
      const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
      // Optional per-action list. Empty / missing = full-module ("Select All").
      const rawActions = Array.isArray(req.body?.actions) ? req.body.actions : [];
      const actions: string[] = rawActions
        .map((a: any) => String(a || "").trim())
        .filter((a: string) => /^[a-z0-9_]+$/.test(a))
        .slice(0, 20);
      if (!module || !REQUESTABLE_MODULES.has(module)) {
        return res.status(400).json({ error: "Invalid module" });
      }
      // Skip duplicate pending requests for the same module.
      const existing = await userService.findPendingModuleAccessRequest(user.id, module);
      if (existing) {
        return res.status(409).json({ error: "You already have a pending request for this module", request: existing });
      }
      // If user already has full-module access, no point requesting.
      const perms = await userService.getUserPermissions(user.id);
      const moduleOverride = perms.find(p => p.module === module);
      if (moduleOverride?.canAccess) {
        return res.status(409).json({ error: "You already have access to this module" });
      }
      // For per-action requests, drop actions the user already holds and
      // reject if nothing remains to request.
      const filteredActions = actions.length > 0
        ? actions.filter(a => {
            const ao = perms.find(p => p.module === `${module}:${a}`);
            return !(ao?.canAccess === true);
          })
        : [];
      if (actions.length > 0 && filteredActions.length === 0) {
        return res.status(409).json({ error: "You already have access to the requested actions" });
      }
      const created = await userService.createModuleAccessRequest({
        userId: user.id,
        companyId: user.companyId || null,
        module,
        actions: filteredActions.length > 0 ? filteredActions : null,
        reason,
      });
      // Notify approvers (super admin + company admins of the same company).
      try {
        const allUsers = await userService.getAllUsers();
        const approvers = allUsers.filter(u =>
          u.role === "super_admin"
          || (u.role === "company_admin" && u.companyId === user.companyId)
        );
        const requesterName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
        await createNotificationForMany(approvers.map(a => a.id), {
          companyId: user.companyId || null,
          type: "module_access_request",
          title: "New module access request",
          message: `${requesterName} requested access to ${module}`,
          link: "/access-requests",
        });
      } catch (notifyErr) {
        console.error("[module-access] approver notification failed:", notifyErr);
      }
      res.json(created);
    } catch (err) {
      console.error("[module-access] create failed:", err);
      res.status(500).json({ error: "Failed to create request" });
    }
  });

  // User lists their own requests.
  app.get("/api/module-access-requests/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await userService.listModuleAccessRequests({ userId: user.id });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch your requests" });
    }
  });

  // Admin lists all requests (super_admin sees everything; company_admin sees
  // only requests in their own company).
  app.get("/api/module-access-requests", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const status = req.query.status ? String(req.query.status) : undefined;
      const filters: { companyId?: string; status?: string } = {};
      if (status) filters.status = status;
      if (user.role === "company_admin") {
        if (!user.companyId) return res.json([]);
        filters.companyId = user.companyId;
      } else if (req.query.companyId) {
        filters.companyId = String(req.query.companyId);
      }
      const rows = await userService.listModuleAccessRequests(filters);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Admin approves or denies a request. On approve we upsert the
  // user_permissions row so the user's next API call passes the middleware.
  // Admin-only: permanently erase a history row. Used to clean up the
  // History tab. Allowed for super_admin (any company) and company_admin
  // (own company only). Pending requests can also be deleted — treat it
  // as a hard cancel.
  app.delete("/api/module-access-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Only Super Admin and Company Admin can delete history" });
      }
      const existing = await userService.getModuleAccessRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Request not found" });
      if (user.role === "company_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const ok = await userService.deleteModuleAccessRequest(existing.id);
      if (!ok) return res.status(404).json({ error: "Request not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[module-access] delete failed:", err);
      res.status(500).json({ error: "Failed to delete request" });
    }
  });

  app.patch("/api/module-access-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const action = String(req.body?.action || "").toLowerCase();
      if (action !== "approve" && action !== "deny") {
        return res.status(400).json({ error: "action must be 'approve' or 'deny'" });
      }
      const existing = await userService.getModuleAccessRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Request not found" });
      if (existing.status !== "pending") return res.status(409).json({ error: "Request already decided" });
      if (user.role === "company_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
      const newStatus = action === "approve" ? "approved" : "denied";
      const decided = await userService.decideModuleAccessRequest(existing.id, newStatus, user.id, note);
      if (action === "approve") {
        // If the request specified individual actions, grant each as a
        // `module:action` permission. Otherwise grant full-module access.
        const reqActions: string[] = Array.isArray((existing as any).actions)
          ? (existing as any).actions
          : [];
        const grants = reqActions.length > 0
          ? reqActions.map(a => ({ module: `${existing.module}:${a}`, canAccess: true }))
          : [{ module: existing.module, canAccess: true }];
        await userService.setUserPermissions(
          existing.userId,
          grants,
          user.id,
          existing.companyId,
        );
      }
      // Notify the requester.
      try {
        await createNotification({
          userId: existing.userId,
          companyId: existing.companyId,
          type: "module_access_decision",
          title: action === "approve" ? "Module access approved" : "Module access denied",
          message: `Your request for ${existing.module} was ${newStatus}${note ? `: ${note}` : ""}`,
          link: "/my-access-requests",
        });
      } catch (notifyErr) {
        console.error("[module-access] requester notification failed:", notifyErr);
      }
      res.json(decided);
    } catch (err) {
      console.error("[module-access] decide failed:", err);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  // Admin grants a module to a user directly (no prior request needed).
  // Re-uses the existing user_permissions table — for revocation just call
  // PUT /api/users/:id/permissions with canAccess: false (existing endpoint).
  app.post("/api/module-access-grants", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const targetUserId = String(req.body?.userId || "");
      const module = String(req.body?.module || "");
      const canAccess = req.body?.canAccess !== false; // default true
      // Optional per-action list. Empty / missing = full-module grant/revoke.
      const rawActions = Array.isArray(req.body?.actions) ? req.body.actions : [];
      const actions: string[] = rawActions
        .map((a: any) => String(a || "").trim())
        .filter((a: string) => /^[a-z0-9_]+$/.test(a))
        .slice(0, 20);
      if (!targetUserId || !module || !REQUESTABLE_MODULES.has(module)) {
        return res.status(400).json({ error: "userId and a valid module are required" });
      }
      const target = await userService.getUser(targetUserId);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (user.role === "company_admin" && target.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Build the set of permission rows to upsert. Full-module = single row;
      // per-action = one row per action key.
      const grants = actions.length > 0
        ? actions.map(a => ({ module: `${module}:${a}`, canAccess }))
        : [{ module, canAccess }];
      // For direct grants (canAccess=true), create a synthetic "approved"
      // module_access_requests row so the grant shows up in the admin
      // History tab with a Revoke button. Without this, direct grants are
      // invisible after the fact and admins can't undo them. We only create
      // a fresh row per call so each grant action is auditable on its own.
      if (canAccess) {
        try {
          const synthetic = await userService.createModuleAccessRequest({
            userId: targetUserId,
            companyId: target.companyId,
            module,
            actions: actions.length > 0 ? actions : null,
            reason: "Granted directly by admin",
          });
          await userService.decideModuleAccessRequest(
            synthetic.id,
            "approved",
            user.id,
            null,
          );
        } catch (logErr) {
          console.error("[module-access] failed to log direct grant:", logErr);
        }
      }
      const result = await userService.setUserPermissions(
        targetUserId,
        grants,
        user.id,
        target.companyId,
      );
      // Reflect the action on the request history so the History tab shows
      // an accurate status (Approved → Revoked) instead of leaving stale
      // "Approved" rows after revocation. For a full-module revoke, mark all
      // approved requests for this module. For per-action revokes, only mark
      // requests whose action set is a subset of the revoked actions.
      if (!canAccess) {
        try {
          if (actions.length === 0) {
            // Also flip every `${module}:*` action-level grant to revoked so
            // stale action rows can't keep authorizing the user after a
            // full-module revoke.
            await userService.revokeModuleActionPermissions(targetUserId, module, user.id);
            await userService.revokeApprovedModuleRequests(targetUserId, module, user.id);
          } else {
            // Mark only rows whose action list is fully covered by the revoked
            // actions (or which had no actions but module is being narrowed —
            // skip those since the module grant itself isn't being revoked).
            const approved = await userService.listModuleAccessRequests({ userId: targetUserId, status: "approved" });
            const revokedSet = new Set(actions);
            for (const r of approved) {
              if (r.module !== module) continue;
              const ra: string[] = Array.isArray((r as any).actions) ? (r as any).actions : [];
              if (ra.length === 0) continue; // full-module grant — leave alone
              if (ra.every(a => revokedSet.has(a))) {
                await userService.decideModuleAccessRequest(r.id, "revoked", user.id, null);
              }
            }
          }
        } catch (reqErr) {
          console.error("[module-access] failed to mark request revoked:", reqErr);
        }
      }
      try {
        await createNotification({
          userId: targetUserId,
          companyId: target.companyId,
          type: "module_access_decision",
          title: canAccess ? "Module access granted" : "Module access revoked",
          message: canAccess
            ? `An administrator granted you access to ${module}`
            : `An administrator revoked your access to ${module}`,
          link: "/my-access-requests",
        });
      } catch (notifyErr) {
        console.error("[module-access] grant notification failed:", notifyErr);
      }
      res.json(result[0] || null);
    } catch (err) {
      console.error("[module-access] grant failed:", err);
      res.status(500).json({ error: "Failed to grant access" });
    }
  });

  // ===== Employee Routes =====
}
