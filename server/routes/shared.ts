// HRMS Pro — shared route infrastructure (middleware, helpers, multer configs)
import type { Request, Response, NextFunction } from "express";
import { companyService, employeeService, settingsService, userService } from "../services";
import { storage } from "../storage";
import { db } from "../db";
import { users as usersTable, contractorEmployees as contractorEmployeesTable } from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import multer from "multer";
import { makeFileFilter, DOCUMENT_EXTENSIONS, DATA_EXTENSIONS } from "../upload-security";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";

// --- Biometric device network allow-list (SSRF guard) ---
// ZKTeco biometric devices are typically on the office LAN (192.168.x.x).
// We allow all valid IPs and hostnames — private ranges are fine because
// the IP is the device's local address used for direct TCP commands.
export const DEFAULT_ALLOWED_BIOMETRIC_PORTS = [80, 443, 4370, 8080, 8181];
export const EXTRA_ALLOWED_BIOMETRIC_PORTS = (process.env.BIOMETRIC_ALLOWED_PORTS || "")
  .split(",").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0 && n < 65536);
export const ALLOWED_BIOMETRIC_PORTS = new Set<number>([...DEFAULT_ALLOWED_BIOMETRIC_PORTS, ...EXTRA_ALLOWED_BIOMETRIC_PORTS]);

// Per-device ADMS auth: a device must have either a shared secret or a
// pinned source CIDR. Validates the values here so bad input is rejected
// at admin time rather than silently locking the device out at push time.
export function validateBiometricDeviceAuth(pushToken: unknown, allowedIpCidr: unknown): string | null {
  const tok = pushToken == null ? "" : String(pushToken).trim();
  const cidr = allowedIpCidr == null ? "" : String(allowedIpCidr).trim();
  if (!tok && !cidr) {
    return "Device must have either pushToken (shared secret) or allowedIpCidr (pinned source IP/CIDR) so ADMS pushes can be authenticated.";
  }
  if (tok && tok.length < 12) {
    return "pushToken must be at least 12 characters";
  }
  if (cidr) {
    for (const piece of cidr.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [base, bitsStr] = piece.includes("/") ? piece.split("/") : [piece, "32"];
      if (net.isIP(base) === 0) {
        return `allowedIpCidr entry "${piece}" is not a valid IP literal`;
      }
      if (net.isIP(base) === 4) {
        const bits = Number(bitsStr);
        if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
          return `allowedIpCidr entry "${piece}" has an invalid prefix length (expected 0-32)`;
        }
      } else {
        // IPv6 — we only support exact-match literals on the push side, so
        // refuse a prefix here to avoid false confidence.
        if (piece.includes("/") && bitsStr !== "128") {
          return `allowedIpCidr entry "${piece}" uses IPv6 prefix; only /128 (exact match) is supported`;
        }
      }
    }
  }
  return null;
}

export function validateBiometricNetwork(ip: unknown, port: unknown): string | null {
  if (ip != null && ip !== "") {
    if (typeof ip !== "string") return "ipAddress must be a string";
    // Accept IPv4, IPv6, or a DNS hostname.
    // Private/LAN IPs (192.168.x.x, 10.x, 172.x) are valid — ZKTeco
    // devices are almost always on the office local network.
    if (net.isIP(ip) === 0) {
      const isHostname = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(ip);
      if (!isHostname) return "ipAddress must be a valid IPv4/IPv6 literal or DNS hostname";
    }
  }
  if (port != null && port !== "") {
    const p = Number(port);
    if (!Number.isInteger(p) || p <= 0 || p > 65535) return "port must be an integer between 1 and 65535";
    if (!ALLOWED_BIOMETRIC_PORTS.has(p)) {
      return `port ${p} is not in the allow-list (${Array.from(ALLOWED_BIOMETRIC_PORTS).sort((a,b)=>a-b).join(", ")})`;
    }
  }
  return null;
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: makeFileFilter(DATA_EXTENSIONS),
});

// Document disk storage (10 MB limit)
export const DOC_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'employee-docs');
if (!fs.existsSync(DOC_UPLOAD_DIR)) fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });
export const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOC_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});
export const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: makeFileFilter(DOCUMENT_EXTENSIONS),
});

export const COMPANY_ASSETS_DIR = path.join(process.cwd(), 'uploads', 'company-assets');
if (!fs.existsSync(COMPANY_ASSETS_DIR)) fs.mkdirSync(COMPANY_ASSETS_DIR, { recursive: true });
// Best-effort deletion constrained to the company-assets dir (prevents path traversal/injection
// from a DB-stored asset path being used to unlink arbitrary files).
export function safeUnlinkCompanyAsset(storedPath: string | null | undefined) {
  if (!storedPath) return;
  try {
    const clean = storedPath.split("?")[0];
    const resolved = path.resolve(process.cwd(), "." + (clean.startsWith("/") ? clean : "/" + clean));
    const base = path.resolve(COMPANY_ASSETS_DIR);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) return;
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  } catch { /* best-effort cleanup */ }
}
export const companyAssetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, COMPANY_ASSETS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const companyId = (req.params as any).id || "unknown";
    const type = (req.params as any).type || "asset";
    // Unique per upload so a replaced asset gets a new URL (avoids stale browser/proxy cache)
    cb(null, `${companyId}-${type}-${Date.now()}${ext}`);
  },
});
export const companyAssetUpload = multer({
  storage: companyAssetStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Extend Express Request type for session
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

// Authentication middleware
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = await userService.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  (req as any).user = user;
  next();
};

// Role-based access middleware
export const requireRole = (...allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
};

// Module access middleware
export const MODULE_ACCESS: Record<string, string[]> = {
  companies: ["super_admin"],
  users: ["super_admin", "company_admin"],
  employees: ["super_admin", "company_admin", "hr_admin", "manager"],
  attendance: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  leave: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  payroll: ["super_admin", "company_admin", "hr_admin"],
  settings: ["super_admin", "company_admin"],
  masters: ["super_admin", "company_admin", "hr_admin"],
};

// Internal helper used by both requireModuleAccess and requireAction.
// Semantics (must mirror client/src/hooks/use-can.ts):
//   - super_admin always passes
//   - explicit module-level allow → true
//   - explicit action-level allow → true (when action provided)
//   - explicit module-level deny  → false
//   - explicit action-level deny  → false (when action provided)
//   - otherwise fall back to MODULE_ACCESS role table
export async function userHasAccess(
  user: any,
  module: string,
  action?: string,
): Promise<boolean> {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  // Employee self-service modules are intrinsic to the role and cannot be
  // revoked by an admin. Stale deny rows in `user_permissions` (e.g. left
  // over from earlier admin testing) must not block these endpoints.
  const EMPLOYEE_SELF_SERVICE = new Set([
    "my_attendance", "my_profile", "my_access_requests",
    "leave", "loan_advances", "job_applications",
  ]);
  if (user.role === "employee" && EMPLOYEE_SELF_SERVICE.has(module)) {
    return (MODULE_ACCESS[module] || ["employee"]).includes(user.role);
  }
  let userPerms: { module: string; canAccess: boolean }[] = [];
  try {
    userPerms = await userService.getUserPermissions(user.id);
  } catch (_) { /* fall through to role check */ }
  const moduleOverride = userPerms.find(p => p.module === module);
  const actionOverride = action
    ? userPerms.find(p => p.module === `${module}:${action}`)
    : undefined;
  // An explicit action-level allow always wins. This matters when an earlier
  // full-module revoke wrote `module = deny` and the admin subsequently
  // approved per-action requests — those new action grants should authorize.
  // The revoke flow already flips matching `module:*` rows to deny, so this
  // can only be true after a *fresh* post-revoke approval, not stale data.
  if (actionOverride?.canAccess === true) return true;
  // For module-level checks (no specific action requested), any granted
  // action under this module is enough to surface it (read access etc.).
  if (!action) {
    const prefix = `${module}:`;
    if (userPerms.some(p => p.module.startsWith(prefix) && p.canAccess)) return true;
  }
  // Deny-first for everything else: an explicit module-level revoke blocks,
  // and an explicit action-level revoke blocks just that action.
  if (moduleOverride?.canAccess === false) return false;
  if (actionOverride?.canAccess === false) return false;
  if (moduleOverride?.canAccess === true) return true;
  return (MODULE_ACCESS[module] || []).includes(user.role);
}

export const requireModuleAccess = (module: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const ok = await userHasAccess(user, module);
    if (!ok) return res.status(403).json({ error: `Access denied. You do not have access to the ${module} module.` });
    next();
  };
};

// Like requireModuleAccess but checks a specific action within the module
// (e.g. requireAction("employees", "create")). A full-module grant satisfies
// any action; an action-level grant satisfies only that action.
export const requireAction = (module: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const ok = await userHasAccess(user, module, action);
    if (!ok) return res.status(403).json({ error: `Access denied. You do not have permission to ${action.replace(/_/g, " ")} in ${module}.` });
    next();
  };
};

export function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

/**
 * Resolve the userId for an employee — tries employee.userId first,
 * then falls back to matching a user by officialEmail so employees
 * who were created before the user-link system still receive notifications.
 */
export async function resolveEmployeeUserId(emp: any): Promise<string | null> {
  if (emp?.userId) return emp.userId;
  if (!emp?.officialEmail) return null;
  try {
    const rows = await userService.getUserIdByEmail(emp.officialEmail);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch all user IDs for HR / admin roles in a given company.
 * Returns a unique, deduplicated list excluding the requesting user.
 */
export async function getHrAdminIds(companyId: string | null, excludeUserId?: string): Promise<string[]> {
  try {
    const rows = await userService.getUsersByRoles(["hr_admin", "company_admin", "super_admin"]);
    return rows
      .filter(u => u.role === "super_admin" || u.companyId === companyId)
      .map(u => u.id)
      .filter(id => id !== excludeUserId);
  } catch (err) {
    console.error("[Notification] getHrAdminIds failed:", err);
    return [];
  }
}

/**
 * Resolves user.accessLocations (array of master_location IDs) to a Set of
 * location NAME strings that can be compared against employee.location.
 * Returns null when the user has access to all locations (no restriction).
 */
export async function resolveAllowedLocationNames(user: any): Promise<Set<string> | null> {
  const allowedIds: string[] | null = user.accessLocations;
  if (!allowedIds || allowedIds.length === 0) return null; // no restriction
  if (!user.companyId) return new Set(); // safety: no company → no access
  try {
    const companyLocs = await settingsService.getMasterLocationsByCompany(user.companyId);
    const names = new Set(
      companyLocs.filter((l: any) => allowedIds.includes(l.id)).map((l: any) => l.name)
    );
    return names;
  } catch {
    return new Set(); // fail-closed
  }
}

/**
 * Returns the set of employee IDs (in the user's company) the user is allowed
 * to see, considering both contractor and location access restrictions.
 *
 * An employee is included when BOTH hold:
 *   • Contractor OK: no contractor restriction, OR the employee's
 *     `contractorMasterId` is in `user.accessContractors`, OR the employee is
 *     tagged via the Settings → Tag Employees screen to a company-contractor
 *     whose contractor company's name matches one of the allowed
 *     contractor-master names.
 *   • Location OK: no location restriction, OR the employee's `location`
 *     matches one of the allowed master-location names.
 *
 * Returns `null` when the user has no restriction at all (caller should skip
 * filtering). Returns an empty Set on safety failures so callers fail closed.
 */
export async function getAllowedEmployeeIdsForUser(user: any): Promise<Set<string> | null> {
  const allowedContractors: string[] | null = user.accessContractors;
  const allowedLocationNames = await resolveAllowedLocationNames(user);
  const hasContractorRestriction = !!(allowedContractors && allowedContractors.length > 0);
  const hasLocationRestriction = allowedLocationNames !== null;
  if (!hasContractorRestriction && !hasLocationRestriction) return null;
  if (!user.companyId) return new Set();

  const companyEmployees = await employeeService.getEmployeesByCompany(user.companyId);

  // Build the set of employee IDs tagged to any contractor matching the
  // user's accessContractors via Settings → Tag Employees.
  const taggedEmployeeIds = new Set<string>();
  if (hasContractorRestriction) {
    try {
      const cms = await companyService.getContractorMastersByCompany(user.companyId);
      const allowedNames = new Set(
        cms
          .filter((c: any) => allowedContractors!.includes(c.id))
          .map((c: any) => (c.contractorName || "").trim().toLowerCase())
      );
      if (allowedNames.size > 0) {
        const ccRows = await companyService.getCompanyContractors(user.companyId);
        const matchedCcIds = ccRows
          .filter((cc: any) => allowedNames.has(((cc as any).contractorName || "").trim().toLowerCase()))
          .map((cc: any) => cc.id);
        if (matchedCcIds.length > 0) {
          // Single batched query instead of N per-contractor fetches
          const taggedRows = await companyService.getTaggedEmployeeIdsByContractors(matchedCcIds);
          for (const t of taggedRows) taggedEmployeeIds.add(t.employeeId);
        }
      }
    } catch (err) {
      console.error("[getAllowedEmployeeIdsForUser] tag lookup failed:", err);
    }
  }

  const ids = new Set<string>();
  for (const e of companyEmployees as any[]) {
    const contractorOk = !hasContractorRestriction
      || (e.contractorMasterId && allowedContractors!.includes(e.contractorMasterId))
      || taggedEmployeeIds.has(e.id);
    const locationOk = !hasLocationRestriction
      || (e.location && allowedLocationNames!.has(e.location));
    if (contractorOk && locationOk) ids.add(e.id);
  }
  return ids;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
