import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerMobileRoutes } from "./mobile-routes";
import { registerComplianceRoutes } from "./compliance-routes";
import { createNotification, createNotificationForMany } from "./notifications";
import { addSSEClient, removeSSEClient } from "./sse";
import { db } from "./db";
import { notifications, profileUpdateRequests } from "../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { 
  insertUserSchema, 
  insertCompanySchema, 
  insertEmployeeSchema,
  insertAttendanceSchema,
  insertLeaveTypeSchema,
  insertLeaveRequestSchema,
  insertSalaryStructureSchema,
  insertPayrollSchema,
  insertSettingSchema,
  insertMasterDepartmentSchema,
  insertMasterDesignationSchema,
  insertMasterLocationSchema,
  insertEarningHeadSchema,
  insertDeductionHeadSchema,
  insertStatutorySettingsSchema,
  insertTimeOfficePolicySchema,
  insertFnfSettlementSchema,
  insertHolidaySchema,
  insertBiometricDeviceSchema,
  insertJobPostingSchema,
  insertJobApplicationSchema,
  insertWageGradeSchema,
  insertContractorMasterSchema
} from "@shared/schema";
import { z } from "zod";
import { registerAdmsRoutes, getAdmsActivityLog, getAdmsActivityLogFromDB, getAdmsServerStatus, processAttlog, processUserRecords } from './adms';
import * as dnsPromises from 'dns/promises';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

// --- Biometric device network allow-list (SSRF guard) ---
// ZKTeco biometric devices are typically on the office LAN (192.168.x.x).
// We allow all valid IPs and hostnames — private ranges are fine because
// the IP is the device's local address used for direct TCP commands.
const DEFAULT_ALLOWED_BIOMETRIC_PORTS = [80, 443, 4370, 8080, 8181];
const EXTRA_ALLOWED_BIOMETRIC_PORTS = (process.env.BIOMETRIC_ALLOWED_PORTS || "")
  .split(",").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0 && n < 65536);
const ALLOWED_BIOMETRIC_PORTS = new Set<number>([...DEFAULT_ALLOWED_BIOMETRIC_PORTS, ...EXTRA_ALLOWED_BIOMETRIC_PORTS]);

// Per-device ADMS auth: a device must have either a shared secret or a
// pinned source CIDR. Validates the values here so bad input is rejected
// at admin time rather than silently locking the device out at push time.
function validateBiometricDeviceAuth(pushToken: unknown, allowedIpCidr: unknown): string | null {
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

function validateBiometricNetwork(ip: unknown, port: unknown): string | null {
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Document disk storage (10 MB limit)
const DOC_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'employee-docs');
if (!fs.existsSync(DOC_UPLOAD_DIR)) fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOC_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Extend Express Request type for session
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

// Authentication middleware
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  (req as any).user = user;
  next();
};

// Role-based access middleware
const requireRole = (...allowedRoles: string[]) => {
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
const MODULE_ACCESS: Record<string, string[]> = {
  companies: ["super_admin"],
  users: ["super_admin", "company_admin"],
  employees: ["super_admin", "company_admin", "hr_admin", "manager"],
  attendance: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  leave: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  payroll: ["super_admin", "company_admin", "hr_admin"],
  settings: ["super_admin", "company_admin"],
  masters: ["super_admin", "company_admin", "hr_admin"],
};

const requireModuleAccess = (module: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // super_admin always has full access — skip all checks
    if (user.role === "super_admin") return next();

    // Check user-specific permission overrides first
    try {
      const userPerms = await storage.getUserPermissions(user.id);
      const override = userPerms.find(p => p.module === module);
      if (override) {
        if (override.canAccess) return next();
        return res.status(403).json({ error: `Access denied. You do not have access to the ${module} module.` });
      }
    } catch (_) { /* if DB fails, fall through to role check */ }

    // Fall back to role-based access
    const allowedRoles = MODULE_ACCESS[module] || [];
    if (allowedRoles.includes(user.role)) {
      return next();
    }
    
    res.status(403).json({ error: `Access denied. You do not have access to the ${module} module.` });
  };
};

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Serve uploaded employee documents statically
  app.use('/uploads', (await import('express')).default.static(path.join(process.cwd(), 'uploads')));

  // ZKTeco ADMS push endpoints (/iclock/...) — devices behind NAT phone home
  // here over HTTP. These are intentionally unauthenticated at the session
  // layer; identity is the device serial number sent in the query string.
  registerAdmsRoutes(app);

  // Returns the caller's public IP as seen by this server.
  // Used by the "Auto-detect" button in the Add Machine dialog so the user
  // doesn't have to manually look up their router's WAN IP.
  app.get("/api/server/my-ip", requireAuth, (req, res) => {
    const raw = req.ip || req.socket.remoteAddress || "";
    // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
    const ip = raw.replace(/^::ffff:/, "");
    res.json({ ip });
  });

  // Returns the server's resolved public IP for ADMS device configuration.
  // IMPORTANT: ZKTeco x2008 and virtually all biometric devices only support
  // plain HTTP — never HTTPS. Always return http:// ADMS URLs regardless of
  // whether the dashboard itself is served over HTTPS. The device talks
  // directly to port 8181 (plain HTTP, dedicated ADMS listener).
  app.get("/api/server/network-info", requireAuth, async (req, res) => {
    try {
      const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || null;
      const reqHost = req.hostname;
      const host = (reqHost === "localhost" || reqHost === "127.0.0.1")
        ? (replitDevDomain || reqHost)
        : reqHost;

      let ip: string | null = null;
      try {
        const result = await dnsPromises.lookup(host, { family: 4 });
        ip = result.address;
      } catch {
        // DNS failed — skip
      }
      // Fallback: use ipify to get server's outbound IP
      if (!ip || ip.startsWith("127.") || ip.startsWith("::")) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
          clearTimeout(timer);
          const j = await r.json() as { ip: string };
          ip = j.ip;
        } catch { /* ignore */ }
      }

      // Dedicated ADMS port — device connects here over plain HTTP (no HTTPS).
      const admsPort = parseInt(process.env.ADMS_PORT || "8181", 10);

      // Always http:// — biometric devices do not support HTTPS/TLS.
      const admsUrl   = `http://${host}:${admsPort}/iclock/cdata`;
      const admsUrlIp = ip ? `http://${ip}:${admsPort}/iclock/cdata` : null;

      res.json({
        host,
        replitDevDomain,
        ip,
        port: String(admsPort),
        proto: "http",
        admsUrl,
        admsUrlIp,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to resolve network info" });
    }
  });

  // Add OT columns to payroll table if they don't exist
  await db.execute(sql`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS ot_hours NUMERIC(6,2) DEFAULT 0`).catch(() => {});
  await db.execute(sql`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS ot_amount INTEGER DEFAULT 0`).catch(() => {});

  // Mirror of migrations/007: short, friendly machine code shown in the
  // device list and used when assigning an employee to a specific machine.
  await db.execute(sql`ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS code TEXT`).catch(() => {});

  // Mirror of migrations/006: prevent duplicate biometric punches at the
  // DB level so two concurrent ADMS pushes can't sneak past the
  // application-level dedupe check.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'biometric_punch_logs_dedup_unique'
      ) THEN
        DELETE FROM biometric_punch_logs a
        USING biometric_punch_logs b
        WHERE a.ctid < b.ctid
          AND a.company_id          = b.company_id
          AND COALESCE(a.device_id, '')   = COALESCE(b.device_id, '')
          AND COALESCE(a.employee_id, '') = COALESCE(b.employee_id, '')
          AND a.device_employee_id  = b.device_employee_id
          AND a.punch_date          = b.punch_date
          AND a.punch_time          = b.punch_time
          AND COALESCE(a.punch_type, '')  = COALESCE(b.punch_type, '');

        CREATE UNIQUE INDEX biometric_punch_logs_dedup_unique
          ON biometric_punch_logs (
            company_id,
            (COALESCE(device_id, '')),
            (COALESCE(employee_id, '')),
            device_employee_id,
            punch_date,
            punch_time,
            (COALESCE(punch_type, ''))
          );
      END IF;
    END $$;
  `).catch((err) => {
    console.error("[migrations] biometric_punch_logs_dedup_unique failed:", err);
  });

  // Mirror of migrations/007: per-device ADMS auth (shared secret OR pinned
  // source CIDR). Backfills existing devices to their last-seen push IP so
  // the deployed device keeps working without manual reconfiguration.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS push_token text;
  `).catch((err) => console.error("[migrations] add push_token failed:", err));
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS allowed_ip_cidr text;
  `).catch((err) => console.error("[migrations] add allowed_ip_cidr failed:", err));
  // NOTE: The old backfill that set allowed_ip_cidr = last_push_ip/32 has been
  // intentionally removed. Locking devices to a /32 CIDR by default causes
  // silent auth failures when the device's public IP changes (e.g. DHCP/NAT).
  // Devices remain in open mode (pushToken=null, allowedIpCidr=null) unless
  // an admin explicitly configures auth in the Biometric Devices UI.
  // Reset any accidentally-backfilled CIDR locks back to open mode:
  await db.execute(sql`
    UPDATE biometric_devices
       SET allowed_ip_cidr = NULL
     WHERE push_token IS NULL
       AND allowed_ip_cidr IS NOT NULL
       AND allowed_ip_cidr LIKE '%.%.%.%/32';
  `).catch((err) => console.error("[migrations] clear backfilled allowed_ip_cidr failed:", err));

  // Mirror of migrations/008: per-device enrolled-user roster, populated
  // from USERINFO/USER records pushed via ADMS. Powers the View Users
  // dialog so even employees who haven't punched yet appear.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS biometric_device_users (
      id                 VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      device_id          VARCHAR(36) NOT NULL,
      device_employee_id TEXT        NOT NULL,
      name               TEXT,
      privilege          TEXT,
      card               TEXT,
      password_set       BOOLEAN     DEFAULT false,
      fingerprint_count  INTEGER     DEFAULT 0,
      first_seen_at      TEXT,
      last_seen_at       TEXT
    )
  `).catch((err) => console.error("[migrations] create biometric_device_users failed:", err));
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS biometric_device_users_unique
      ON biometric_device_users (device_id, device_employee_id)
  `).catch((err) => console.error("[migrations] biometric_device_users_unique failed:", err));

  // Mirror of migrations/009: per-company wage grades + employee tag column.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wage_grades (
      id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      company_id   VARCHAR(36) NOT NULL,
      name         TEXT        NOT NULL,
      code         TEXT,
      minimum_wage INTEGER     NOT NULL,
      description  TEXT,
      status       TEXT        NOT NULL DEFAULT 'active'
    )
  `).catch((err) => console.error("[migrations] create wage_grades failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS wage_grades_company_idx ON wage_grades (company_id)
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS wage_grade_id VARCHAR(36)
  `).catch((err) => console.error("[migrations] add employees.wage_grade_id failed:", err));
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_applicable BOOLEAN DEFAULT false
  `).catch((err) => console.error("[migrations] add employees.ot_applicable failed:", err));
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_rate TEXT DEFAULT '2x'
  `).catch((err) => console.error("[migrations] add employees.ot_rate failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS period TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.period failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS effective_from TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.effective_from failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS state TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.state failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS effective_to TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.effective_to failed:", err));

  // Mirror of migrations/010: pending command queue persisted in DB so commands
  // survive server restarts. Used by ADMS /getrequest handler.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS pending_commands JSONB DEFAULT '[]'::jsonb
  `).catch((err) => console.error("[migrations] add pending_commands failed:", err));

  // migrations/012: store the ADMS server IP per device so it is part of
  // the device record rather than derived at runtime from network-info.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS adms_server_ip text
  `).catch((err) => console.error("[migrations] add adms_server_ip failed:", err));

  // Auto-delete: when enabled the server queues DATA CLEAR ATTLOG after every
  // successful ATTLOG upload, keeping the device memory from filling up.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS auto_delete_punches boolean NOT NULL DEFAULT false
  `).catch((err) => console.error("[migrations] add auto_delete_punches failed:", err));

  // Mirror of migrations/011: persistent ADMS activity log — survives server
  // restarts, powers the live activity feed in the Biometric Integration UI.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS adms_activity_log (
      id         BIGSERIAL    PRIMARY KEY,
      device_sn  TEXT         NOT NULL,
      direction  TEXT         NOT NULL,
      message    TEXT         NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `).catch((err) => console.error("[migrations] create adms_activity_log failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS adms_activity_log_sn_idx ON adms_activity_log (device_sn, id DESC)
  `).catch(() => {});

  // Trial columns for companies (self-signup free trial)
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_start_date TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 3`).catch(() => {});
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_extended_days INTEGER NOT NULL DEFAULT 0`).catch(() => {});

  // Create employee_documents table if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      employee_id VARCHAR(36) NOT NULL,
      company_id  VARCHAR(36) NOT NULL,
      doc_type    TEXT        NOT NULL,
      file_name   TEXT        NOT NULL,
      file_path   TEXT        NOT NULL,
      file_size   INTEGER,
      mime_type   TEXT,
      created_by  VARCHAR(36),
      created_at  TEXT        NOT NULL,
      updated_at  TEXT        NOT NULL
    )
  `).catch(() => {});

  // Register mobile API routes
  registerMobileRoutes(app);

  // ===== Auth Routes (Basic) =====
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.session.userId = user.id;
      // Ensure we save the session before responding
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Could not save session" });
        res.json(user);
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { signupType = "employee" } = req.body;

      // Check for duplicate username and email before anything
      const existingUsername = await storage.getUserByUsername(req.body.username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken. Please choose another." });
      const existingEmail = await storage.getUserByEmail(req.body.email).catch(() => null);
      if (existingEmail) return res.status(400).json({ message: "An account with this email already exists." });

      if (signupType === "company_admin") {
        const { companyName, username, email, password, firstName, lastName } = req.body;
        if (!companyName || !username || !email || !password) {
          return res.status(400).json({ message: "Company name, username, email, and password are required." });
        }
        // Create company with 3-day trial
        const today = new Date().toISOString().split("T")[0];
        const companyId = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO companies (id, company_name, legal_name, status, trial_start_date, trial_days, trial_extended_days)
          VALUES (${companyId}, ${companyName}, ${companyName}, 'active', ${today}, 3, 0)
        `);
        // Create company_admin user
        const userId = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO users (id, username, email, password, first_name, last_name, role, company_id, status)
          VALUES (${userId}, ${username}, ${email}, ${password}, ${firstName || ""}, ${lastName || ""}, 'company_admin', ${companyId}, 'active')
        `);
        const user = await storage.getUser(userId);
        req.session.userId = userId;
        return res.status(201).json({ ...user, companyName, trialDaysLeft: 3, trialExpired: false });
      }

      // Default: employee / job seeker signup
      const data = insertUserSchema.parse(req.body);
      const user = await storage.createUser({ ...data, role: "employee" });
      req.session.userId = user.id;
      res.status(201).json(user);
    } catch (error: any) {
      console.error("[signup]", error);
      res.status(400).json({ message: error.message || "Invalid user data" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Could not log out" });
      res.json({ success: true });
    });
  });

  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "super_admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const action = req.query.action as string | undefined;
      const rows = await db.execute(
        sql`SELECT id, action, user_id, user_name, details, created_at FROM audit_logs ${action ? sql`WHERE action = ${action}` : sql``} ORDER BY created_at DESC LIMIT ${limit}`
      );
      res.json(rows.rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      commit: process.env.GIT_COMMIT || "unknown",
      builtAt: process.env.BUILD_TIME || new Date().toISOString(),
      node: process.version,
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      let companyName: string | null = null;
      let trialInfo: { trialActive: boolean; trialExpired: boolean; trialDaysLeft: number; trialDaysTotal: number; trialStartDate: string | null } | null = null;
      if (user.companyId) {
        const company = await storage.getCompany(user.companyId);
        companyName = company?.companyName || null;
        if (company && company.trialStartDate) {
          const start = new Date(company.trialStartDate);
          const total = (company.trialDays ?? 3) + (company.trialExtendedDays ?? 0);
          const expiry = new Date(start);
          expiry.setDate(expiry.getDate() + total);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          expiry.setHours(23, 59, 59, 999);
          const msLeft = expiry.getTime() - today.getTime();
          const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
          trialInfo = {
            trialActive: true,
            trialExpired: msLeft < 0,
            trialDaysLeft: daysLeft,
            trialDaysTotal: total,
            trialStartDate: company.trialStartDate,
          };
        }
      }
      res.json({ ...user, companyName, ...(trialInfo ?? {}) });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Super admin: extend trial for a company
  app.patch("/api/companies/:id/trial", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { trialDays, trialExtendedDays } = req.body;
      const updates: Record<string, any> = {};
      if (trialDays !== undefined) updates.trial_days = Number(trialDays);
      if (trialExtendedDays !== undefined) updates.trial_extended_days = Number(trialExtendedDays);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No values to update" });
      if (updates.trial_days !== undefined && updates.trial_extended_days !== undefined) {
        await db.execute(sql`UPDATE companies SET trial_days = ${updates.trial_days}, trial_extended_days = ${updates.trial_extended_days} WHERE id = ${id}`);
      } else if (updates.trial_days !== undefined) {
        await db.execute(sql`UPDATE companies SET trial_days = ${updates.trial_days} WHERE id = ${id}`);
      } else {
        await db.execute(sql`UPDATE companies SET trial_extended_days = ${updates.trial_extended_days} WHERE id = ${id}`);
      }
      const company = await storage.getCompany(id);
      res.json({ success: true, company });
    } catch (error) {
      res.status(500).json({ error: "Failed to update trial" });
    }
  });

  // ===== Dashboard Routes =====
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let stats;
      if (user.role === "super_admin") {
        stats = await storage.getDashboardStats();
      } else if (user.companyId) {
        stats = await storage.getDashboardStatsByCompany(user.companyId);
      } else {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // ===== Company Routes =====
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role === "super_admin") {
        const companies = await storage.getAllCompanies();
        res.json(companies);
      } else if (user.role === "employee" && !user.companyId) {
        const companies = await storage.getAllCompanies();
        res.json(companies.map(c => ({ id: c.id, companyName: c.companyName, status: c.status })));
      } else if (user.companyId) {
        const company = await storage.getCompany(user.companyId);
        res.json(company ? [company] : []);
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ error: "Company not found" });
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  // ===== Lookup endpoints (no module-gate — used by User form access pickers) =====
  app.get("/api/lookup/departments", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await storage.getMasterDepartmentsByCompany(cid));
    } catch { res.json([]); }
  });

  app.get("/api/lookup/locations", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await storage.getMasterLocationsByCompany(cid));
    } catch { res.json([]); }
  });

  app.get("/api/lookup/contractors", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const cid = (req.query.companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      res.json(await storage.getContractorMastersByCompany(cid));
    } catch { res.json([]); }
  });

  // ===== User Routes =====
  app.get("/api/users", requireAuth, requireModuleAccess("users"), async (req, res) => {
    try {
      const user = (req as any).user;
      let users;
      if (user.role === "super_admin") {
        users = await storage.getAllUsers();
      } else if (user.companyId) {
        users = (await storage.getAllUsers()).filter(u => u.companyId === user.companyId);
      } else {
        users = [];
      }
      const companyId = user.role === "super_admin" ? null : user.companyId;
      const allEmployees = companyId
        ? await storage.getEmployeesByCompany(companyId)
        : await (async () => {
            const companies = await storage.getAllCompanies();
            const lists = await Promise.all(companies.map(c => storage.getEmployeesByCompany(c.id)));
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

  app.post("/api/users", requireAuth, requireModuleAccess("users"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertUserSchema.parse(req.body);
      if (user.role !== "super_admin") {
        (data as any).companyId = user.companyId;
        if ((data as any).role === "super_admin") {
          return res.status(403).json({ error: "Only Super Admin can create Super Admin users." });
        }
      }
      const existingByUsername = await storage.getUserByUsername(data.username);
      if (existingByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const existingByEmail = await storage.getUserByEmail(data.email);
      if (existingByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const newUser = await storage.createUser(data);
      res.status(201).json(newUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireModuleAccess("users"), async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await storage.getUser(req.params.id);
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
      const updated = await storage.updateUser(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireModuleAccess("users"), async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await storage.deleteUser(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ===== User Permissions Routes =====
  app.get("/api/users/:id/permissions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      if (user.role === "company_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const permissions = await storage.getUserPermissions(req.params.id);
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  app.put("/api/users/:id/permissions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (user.role !== "super_admin" && user.role !== "company_admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      if (user.role === "company_admin" && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { permissions } = req.body as { permissions: { module: string; canAccess: boolean }[] };
      if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions must be an array" });
      const result = await storage.setUserPermissions(req.params.id, permissions, user.id, targetUser.companyId);
      res.json(result);
    } catch (error) {
      console.error("set permissions error:", error);
      res.status(500).json({ error: "Failed to update permissions" });
    }
  });

  // ===== Employee Routes =====
  app.get("/api/employees/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await storage.getEmployeeByUserId(user.id);
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
        employees = await storage.getAllEmployees();
      } else if (user.companyId) {
        employees = await storage.getEmployeesByCompany(user.companyId);
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
    const templateData = [
      {
        "Employee Code *": "EMP001",
        "Full Name *": "Rajesh Kumar Sharma",
        "Father / Husband Name": "Ram Kumar Sharma",
        "Gender": "Male",
        "Date of Birth": "15-01-1990",
        "Mobile Number": "9876543210",
        "Date of Joining *": "01-01-2024",
        "UAN": "",
        "ESI Number": "",
        "Bank Account": "1234567890",
        "IFSC": "SBIN0001234",
        "PAN": "ABCDE1234F",
        "Aadhaar": "123456789012",
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    // Set column widths
    const colWidths = Object.keys(templateData[0]).map(k => ({ wch: Math.max(k.length + 4, 20) }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=employee_bulk_template.xlsx");
    res.send(buffer);
  });

  app.post("/api/employees/bulk-upload", requireAuth, requireModuleAccess("employees"), upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const companyId = user.role === "super_admin" ? req.body.companyId : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const company = await storage.getCompany(companyId);
      if (!company) return res.status(400).json({ error: "Invalid company ID" });

      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: "dd-mm-yyyy" });

      if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

      const results = { created: 0, skipped: 0, errors: [] as string[] };
      const existingEmployees = await storage.getEmployeesByCompany(companyId);

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

          await storage.createEmployee(empData as any);
          existingEmployees.push({ ...empData, id: "temp" } as any);
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
  // Accepts: JS Date object, Excel serial number, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY
  function parseExcelDate(val: any): string | null {
    if (val === null || val === undefined || val === "") return null;
    // JS Date object (cellDates:true path or xlsx auto-parse)
    if (val instanceof Date && !isNaN(val.getTime())) {
      const d = String(val.getDate()).padStart(2, "0");
      const m = String(val.getMonth() + 1).padStart(2, "0");
      return `${val.getFullYear()}-${m}-${d}`;
    }
    // Excel serial number (numeric)
    if (typeof val === "number") {
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      const d = String(jsDate.getUTCDate()).padStart(2, "0");
      const m = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
      return `${jsDate.getUTCFullYear()}-${m}-${d}`;
    }
    const s = String(val).trim();
    if (!s) return null;
    // DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("-");
      return `${yyyy}-${mm}-${dd}`;
    }
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }
    // YYYY-MM-DD (already correct for DB)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s; // fallback — pass as-is
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
  };
  const BOOL_FIELDS = new Set(["pfApplicable", "esiApplicable", "lwfApplicable"]);
  const DATE_FIELDS = new Set(["dateOfBirth", "dateOfJoining"]);

  // GET  /api/employees/bulk-update-template?fields=f1,f2,...&companyId=xxx
  app.get("/api/employees/bulk-update-template", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      const rawFields = String(req.query.fields || "").split(",").map(f => f.trim()).filter(Boolean);
      if (rawFields.length === 0) return res.status(400).json({ error: "No fields selected" });

      const companyId = user.role === "super_admin" ? String(req.query.companyId || "") : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const employees = await storage.getEmployeesByCompany(companyId);
      if (employees.length === 0) return res.status(400).json({ error: "No employees found for this company" });

      // Build rows: fixed cols Employee Code + Employee Name, then blank selected cols
      const rows = employees.map(emp => {
        const row: Record<string, any> = {
          "Employee Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`.trim(),
        };
        for (const label of rawFields) {
          const dbField = BULK_UPDATE_FIELD_MAP[label];
          if (!dbField) continue;
          const current = (emp as any)[dbField];
          if (BOOL_FIELDS.has(dbField)) {
            row[label] = current ? "Yes" : "No";
          } else if (DATE_FIELDS.has(dbField)) {
            row[label] = toDisplayDate(current); // DD-MM-YYYY
          } else {
            row[label] = current ?? "";
          }
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length + 4, 22) }));
      ws["!cols"] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bulk Update");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=employee_bulk_update_template.xlsx");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to generate template" });
    }
  });

  // POST /api/employees/bulk-update
  app.post("/api/employees/bulk-update", requireAuth, requireModuleAccess("employees"), upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const companyId = user.role === "super_admin" ? req.body.companyId : user.companyId;
      if (!companyId) return res.status(400).json({ error: "Company ID is required" });

      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: "dd-mm-yyyy" });
      if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

      // Detect which update-able columns are present (exclude fixed cols)
      const allKeys = Object.keys(rows[0] || {});
      const updateLabels = allKeys.filter(k => k !== "Employee Code" && k !== "Employee Name" && BULK_UPDATE_FIELD_MAP[k]);

      const employees = await storage.getEmployeesByCompany(companyId);
      const empMap = new Map(employees.map(e => [e.employeeCode.toLowerCase(), e]));

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
          if (BOOL_FIELDS.has(dbField)) {
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
          await storage.updateEmployee(emp.id, updates as any);
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
      const { name, code, deviceSerial, ipAddress, port, status, companyId, pushToken, allowedIpCidr, autoDeletePunches } = req.body || {};
      const patch: Record<string, any> = {};
      if (name !== undefined) patch.name = name;
      if (code !== undefined) patch.code = code === "" ? null : String(code).trim();
      if (deviceSerial !== undefined) patch.deviceSerial = deviceSerial;
      if (ipAddress !== undefined) patch.ipAddress = ipAddress;
      if (port !== undefined) patch.port = port == null || port === "" ? null : Number(port);
      if (status !== undefined) patch.status = status;
      // Only super_admin may move a device across companies (or to "shared").
      if (companyId !== undefined && user.role === "super_admin") patch.companyId = companyId;
      if (pushToken !== undefined) patch.pushToken = pushToken === "" ? null : pushToken;
      if (allowedIpCidr !== undefined) patch.allowedIpCidr = allowedIpCidr === "" ? null : allowedIpCidr;
      if (autoDeletePunches !== undefined) patch.autoDeletePunches = !!autoDeletePunches;

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

      const { enqueueDeviceCommand, pushHrUsernamesToDevice } = await import("./adms");

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
      const { enqueueDeviceCommand } = await import("./adms");
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
      const { bustDeviceCache } = await import("./adms");
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
      const { processBiometricAttendance } = await import("./biometric-attendance-sync");
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
        import("./biometric-attendance-sync")
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
        punchType:        r.punchType,
        deviceId:         r.deviceId,
        isProcessed:      !!r.isProcessed,
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

  // ===== Job Posting Routes =====
  app.get("/api/job-postings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let postings;
      if (user.role === "super_admin") {
        postings = await storage.getAllJobPostings();
      } else if (user.role === "employee") {
        if (user.companyId) {
          postings = (await storage.getJobPostingsByCompany(user.companyId)).filter(p => p.status === "open");
        } else {
          postings = (await storage.getAllJobPostings()).filter(p => p.status === "open");
        }
      } else if (user.companyId) {
        postings = await storage.getJobPostingsByCompany(user.companyId);
      } else {
        postings = [];
      }
      res.json(postings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job postings" });
    }
  });

  app.get("/api/job-postings/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const posting = await storage.getJobPosting(req.params.id);
      if (!posting) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && posting.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job posting" });
    }
  });

  app.post("/api/job-postings", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? (req.body.companyId || user.companyId) : user.companyId;
      if (!companyId) return res.status(400).json({ error: "No company assigned. Please assign a company to your account first." });
      const { title, department, location, employmentType, description, requirements, salaryRange, vacancies, status, closingDate } = req.body;
      if (!title || !description) return res.status(400).json({ error: "Title and Description are required." });
      const posting = await storage.createJobPosting({
        companyId,
        title: String(title),
        department: department ? String(department) : null,
        location: location ? String(location) : null,
        employmentType: employmentType ? String(employmentType) : "full_time",
        description: String(description),
        requirements: requirements ? String(requirements) : null,
        salaryRange: salaryRange ? String(salaryRange) : null,
        vacancies: vacancies ? Number(vacancies) : 1,
        status: status ? String(status) : "draft",
        postedBy: user.id,
        postedAt: new Date().toISOString(),
        closingDate: closingDate ? String(closingDate) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      res.status(201).json(posting);
    } catch (error) {
      console.error("Create job posting error:", error);
      res.status(500).json({ error: "Failed to create job posting" });
    }
  });

  app.put("/api/job-postings/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getJobPosting(req.params.id);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const posting = await storage.updateJobPosting(req.params.id, req.body);
      res.json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update job posting" });
    }
  });

  app.delete("/api/job-postings/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getJobPosting(req.params.id);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await storage.deleteJobPosting(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job posting" });
    }
  });

  // ===== Job Application Routes =====
  app.get("/api/job-applications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { jobPostingId } = req.query;
      let applications;

      if (user.role === "employee") {
        const byUser = await storage.getJobApplicationsByUserId(user.id);
        if (user.companyId) {
          const employees = await storage.getEmployeesByCompany(user.companyId);
          const myEmployee = employees.find(e => e.userId === user.id);
          if (myEmployee) {
            const byEmployee = await storage.getJobApplicationsByEmployee(myEmployee.id);
            const ids = new Set(byUser.map(a => a.id));
            applications = [...byUser, ...byEmployee.filter(a => !ids.has(a.id))];
          } else {
            applications = byUser;
          }
        } else {
          applications = byUser;
        }
      } else if (user.role === "super_admin") {
        if (jobPostingId) {
          applications = await storage.getJobApplicationsByPosting(jobPostingId as string);
        } else {
          applications = await storage.getAllJobApplications();
        }
      } else if (user.companyId) {
        if (jobPostingId) {
          const posting = await storage.getJobPosting(jobPostingId as string);
          if (posting && posting.companyId === user.companyId) {
            applications = await storage.getJobApplicationsByPosting(jobPostingId as string);
          } else {
            applications = [];
          }
        } else {
          applications = await storage.getJobApplicationsByCompany(user.companyId);
        }
      } else {
        applications = [];
      }
      res.json(applications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job applications" });
    }
  });

  app.post("/api/job-applications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const posting = await storage.getJobPosting(req.body.jobPostingId);
      if (!posting || posting.status !== "open") {
        return res.status(400).json({ error: "Job posting is not accepting applications" });
      }

      let employeeId = null;
      if (user.companyId) {
        const employees = await storage.getEmployeesByCompany(user.companyId);
        const myEmployee = employees.find(e => e.userId === user.id);
        if (myEmployee) employeeId = myEmployee.id;
      }

      const existingApps = await storage.getJobApplicationsByPosting(posting.id);
      const alreadyApplied = existingApps.find(a =>
        a.applicantUserId === user.id || (employeeId && a.employeeId === employeeId)
      );
      if (alreadyApplied) {
        return res.status(400).json({ error: "You have already applied for this position" });
      }

      const data = insertJobApplicationSchema.parse({
        ...req.body,
        companyId: posting.companyId,
        applicantUserId: user.id,
        employeeId,
        applicantName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username,
        applicantEmail: user.email,
        applicantPhone: req.body.applicantPhone || null,
        appliedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      const application = await storage.createJobApplication(data);
      res.status(201).json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  app.put("/api/job-applications/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updates = {
        ...req.body,
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      };
      const application = await storage.updateJobApplication(req.params.id, updates);
      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  app.put("/api/job-applications/:id/respond", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (existing.applicantUserId !== user.id) {
        return res.status(403).json({ error: "You can only respond to your own applications" });
      }
      const { action, negotiationNote } = req.body;
      if (!["accept", "negotiate", "reject", "withdraw"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Use accept, negotiate, reject, or withdraw" });
      }
      const finalStatuses = ["offer_accepted", "offer_rejected", "hired", "rejected", "withdrawn"];
      if (finalStatuses.includes(existing.status)) {
        return res.status(400).json({ error: "This application is in a final state and cannot be modified" });
      }
      if (["accept", "negotiate", "reject"].includes(action) && existing.status !== "offered") {
        return res.status(400).json({ error: "You can only respond to an active offer" });
      }
      let updates: any = {};
      if (action === "accept") {
        updates = { status: "offer_accepted", employeeResponse: "accepted" };
      } else if (action === "negotiate") {
        updates = { status: "offer_negotiated", employeeResponse: "negotiated", negotiationNote: negotiationNote || "" };
      } else if (action === "reject") {
        updates = { status: "offer_rejected", employeeResponse: "rejected", negotiationNote: negotiationNote || "" };
      } else if (action === "withdraw") {
        updates = { status: "withdrawn", employeeResponse: "withdrawn" };
      }
      const application = await storage.updateJobApplication(req.params.id, updates);
      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to respond to application" });
    }
  });

  app.delete("/api/job-applications/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await storage.deleteJobApplication(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  // ===== Employee Duplicate Validation Helper =====
  async function validateEmployeeDuplicates(data: any, companyId: string, excludeId?: string): Promise<string | null> {
    const allEmployees = await storage.getEmployeesByCompany(companyId);
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
  app.post("/api/employees", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertEmployeeSchema.parse(req.body);
      if (user.role !== "super_admin") {
        (data as any).companyId = user.companyId;
      }
      const companyId = (data as any).companyId;
      if (companyId) {
        const dupError = await validateEmployeeDuplicates(data, companyId);
        if (dupError) return res.status(400).json({ error: dupError });
      }
      const employee = await storage.createEmployee(data);
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

      const employees = await storage.getEmployeesByCompany(companyId);
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
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee" });
    }
  });

  app.patch("/api/employees/:id", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const dupError = await validateEmployeeDuplicates(req.body, existing.companyId, req.params.id);
      if (dupError) return res.status(400).json({ error: dupError });
      const updated = await storage.updateEmployee(req.params.id, req.body);

      // If the biometric device ID changed, retroactively link all existing punch logs
      // for that PIN so historical attendance immediately appears under this employee.
      const newPin = req.body.biometricDeviceId ? String(req.body.biometricDeviceId) : null;
      const oldPin = existing.biometricDeviceId ? String(existing.biometricDeviceId) : null;
      if (newPin && newPin !== oldPin) {
        try {
          await db.execute(sql`
            UPDATE biometric_punch_logs
            SET employee_id = ${req.params.id}
            WHERE device_employee_id = ${newPin}
              AND company_id = ${existing.companyId}
              AND employee_id IS NULL
          `);
        } catch { /* best-effort — don't block the employee update */ }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", requireAuth, requireModuleAccess("employees"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      console.log(`[AUDIT] EMPLOYEE_DELETE | user=${user.username || user.email} (id=${user.id}, role=${user.role}) | empId=${existing.id} | code=${existing.employeeCode} | name=${existing.firstName} ${existing.lastName} | companyId=${existing.companyId} | at=${new Date().toISOString()} | ip=${req.ip}`);
      await storage.writeAuditLog({ action: "EMPLOYEE_DELETE", userId: user.id, userName: user.username || user.email || "", details: JSON.stringify({ empId: existing.id, employeeCode: existing.employeeCode, name: `${existing.firstName} ${existing.lastName}`, companyId: existing.companyId }) });
      const success = await storage.deleteEmployee(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // ===== Employee Exit & Reinstate Routes =====
  app.post("/api/employees/:id/exit", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { exitDate, exitType, exitReason } = req.body;
      const updated = await storage.updateEmployee(req.params.id, {
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

  app.post("/api/employees/:id/reinstate", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.updateEmployee(req.params.id, {
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
      const rows = await db.execute(sql`
        SELECT id, doc_type, file_name, file_path, file_size, mime_type, created_at
        FROM employee_documents
        WHERE employee_id = ${req.params.id}
        ORDER BY doc_type, created_at DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employees/:id/documents", requireAuth, docUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      const { docType } = req.body;
      if (!file || !docType) return res.status(400).json({ error: "File and docType required" });
      const empRow = await db.execute(sql`SELECT company_id FROM employees WHERE id = ${req.params.id} LIMIT 1`);
      const emp = empRow.rows[0] as any;
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      const now = new Date().toISOString();
      const id = randomUUID();
      const filePath = `/uploads/employee-docs/${file.filename}`;
      await db.execute(sql`
        INSERT INTO employee_documents (id, employee_id, company_id, doc_type, file_name, file_path, file_size, mime_type, created_by, created_at, updated_at)
        VALUES (${id}, ${req.params.id}, ${emp.company_id}, ${docType}, ${file.originalname}, ${filePath}, ${file.size}, ${file.mimetype}, ${(req.session as any).userId}, ${now}, ${now})
      `);
      return res.json({ id, docType, fileName: file.originalname, filePath, fileSize: file.size, mimeType: file.mimetype, createdAt: now });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employees/:id/documents/:docId", requireAuth, async (req, res) => {
    try {
      const row = await db.execute(sql`SELECT file_path FROM employee_documents WHERE id = ${req.params.docId} AND employee_id = ${req.params.id} LIMIT 1`);
      const doc = row.rows[0] as any;
      if (!doc) return res.status(404).json({ error: "Document not found" });
      const fullPath = path.join(process.cwd(), doc.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      await db.execute(sql`DELETE FROM employee_documents WHERE id = ${req.params.docId}`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employees/:id/unlink-login", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!employee.userId) return res.status(400).json({ error: "This employee has no linked login account." });
      await storage.updateEmployee(employee.id, { userId: null as any });
      res.json({ success: true, message: "Login account unlinked from employee." });
    } catch (error) {
      res.status(500).json({ error: "Failed to unlink login" });
    }
  });

  app.post("/api/employees/:id/create-login", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (employee.userId) {
        return res.status(400).json({ error: "This employee already has a login account linked." });
      }
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password are required" });
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) return res.status(400).json({ error: "Username already taken" });
      // Check if the employee's official email is already taken (e.g. they self-signed up)
      // Fall back to a company-local address so we never violate the unique email constraint
      let loginEmail = `${username}@company.local`;
      if (employee.officialEmail) {
        const emailTaken = await storage.getUserByEmail(employee.officialEmail);
        if (!emailTaken) loginEmail = employee.officialEmail;
      }
      const newUser = await storage.createUser({
        username,
        password,
        email: loginEmail,
        firstName: employee.firstName,
        lastName: employee.lastName,
        role: "employee",
        companyId: employee.companyId,
        status: "active",
      });
      await storage.updateEmployee(employee.id, { userId: newUser.id });
      res.json({ message: "Login created and linked successfully", userId: newUser.id, username: newUser.username });
    } catch (error) {
      console.error("create-login error:", error);
      res.status(500).json({ error: "Failed to create login" });
    }
  });

  // ===== Aadhaar Verification =====
  app.post("/api/employees/verify-aadhaar", requireAuth, async (req, res) => {
    try {
      const { aadhaar, companyId } = req.body;
      const allEmployees = await storage.getAllEmployees();
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
      const employee = await storage.getEmployeeByUserId(user.id);
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
      const profile = await storage.getCandidateProfileByUserId(user.id);
      if (profile) {
        return res.json(profile);
      }

      // No candidate profile yet — try to pre-populate from employee record
      const allEmployees = await storage.getAllEmployees();
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

      const existingProfile = await storage.getCandidateProfileByAadhaar(aadhaar);
      if (existingProfile && existingProfile.userId !== user.id) {
        return res.json({ status: "active_exists", message: "This Aadhaar number is already registered with another account." });
      }

      const allEmployees = await storage.getAllEmployees();
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

      const allEmployees = await storage.getAllEmployees();
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
        await db.update(profileUpdateRequests)
          .set({ status: "cancelled" })
          .where(and(
            eq(profileUpdateRequests.userId, user.id),
            eq(profileUpdateRequests.status, "pending")
          ));

        const requestPayload = {
          firstName: finalFirstName, lastName: finalLastName, aadhaar,
          dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
          address, addressState, addressDistrict, addressPincode,
          permanentAddress: req.body.permanentAddress || "", permanentState: req.body.permanentState || "",
          permanentDistrict: permanentDistrictValue, permanentPincode: req.body.permanentPincode || "",
          pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
        };

        const [newRequest] = await db.insert(profileUpdateRequests).values({
          id: randomUUID(),
          userId: user.id,
          companyId: user.companyId || null,
          status: "pending",
          requestData: JSON.stringify(requestPayload),
          createdAt: new Date().toISOString(),
        }).returning();

        // Notify all admins/HR of the company
        const allUsers = await storage.getAllUsers();
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
      const existingProfile = await storage.getCandidateProfileByUserId(user.id);

      if (existingProfile) {
        const updated = await storage.updateCandidateProfile(existingProfile.id, {
          firstName: finalFirstName, lastName: finalLastName,
          dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
          address, addressState, addressDistrict, addressPincode,
          permanentAddress: req.body.permanentAddress || "", permanentState: req.body.permanentState || "",
          permanentDistrict: permanentDistrictValue, permanentPincode: req.body.permanentPincode || "",
          pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
          updatedAt: new Date().toISOString(),
        });
        await storage.updateUser(user.id, { firstName: finalFirstName, lastName: finalLastName });
        return res.json(updated);
      }

      const aadhaarCheck = await storage.getCandidateProfileByAadhaar(aadhaar);
      if (aadhaarCheck) return res.status(400).json({ error: "This Aadhaar number is already registered" });

      const otherEmpMatch = allEmployees.find((e: any) => e.aadhaar === aadhaar && e !== linkedEmployee);
      if (otherEmpMatch) {
        return res.status(400).json({ error: `This Aadhaar is already registered to employee ${(otherEmpMatch as any).firstName} ${(otherEmpMatch as any).lastName}` });
      }

      const profile = await storage.createCandidateProfile({
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
      await storage.updateUser(user.id, { firstName: finalFirstName, lastName: finalLastName });
      res.status(201).json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  // Check for the current user's pending profile update request
  app.get("/api/my-profile/pending-request", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await db.select().from(profileUpdateRequests)
        .where(and(
          eq(profileUpdateRequests.userId, user.id),
          eq(profileUpdateRequests.status, "pending")
        ))
        .orderBy(desc(profileUpdateRequests.createdAt))
        .limit(1);
      res.json(rows[0] || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending request" });
    }
  });

  // Admin: List all profile update requests
  app.get("/api/admin/profile-update-requests", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const allRequests = await db.select().from(profileUpdateRequests)
        .orderBy(desc(profileUpdateRequests.createdAt));

      const filtered = user.role === "super_admin"
        ? allRequests
        : allRequests.filter((r: any) => r.companyId === user.companyId);

      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map((u: any) => [u.id, u]));

      const enriched = await Promise.all(filtered.map(async (r: any) => {
        const u: any = userMap.get(r.userId);
        let reqData: any = {};
        try { reqData = JSON.parse(r.requestData); } catch {}

        // Fallback to requestData name if user account not found in users table
        const nameFromReq = [reqData.firstName, reqData.lastName].filter(Boolean).join(" ");
        const nameFromUser = u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";

        // Fetch current saved candidate profile for diff display
        const currentProfile = await storage.getCandidateProfileByUserId(r.userId);

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

      const rows = await db.select().from(profileUpdateRequests)
        .where(eq(profileUpdateRequests.id, id)).limit(1);
      const request = rows[0];
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== "pending") return res.status(400).json({ error: "Request is no longer pending" });

      const data = JSON.parse(request.requestData);
      const existingProfile = await storage.getCandidateProfileByUserId(request.userId);

      if (existingProfile) {
        await storage.updateCandidateProfile(existingProfile.id, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await storage.createCandidateProfile({
          userId: request.userId,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (data.firstName || data.lastName) {
        await storage.updateUser(request.userId, {
          firstName: data.firstName || "",
          lastName: data.lastName || "",
        });
      }

      await db.update(profileUpdateRequests).set({
        status: "approved",
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      }).where(eq(profileUpdateRequests.id, id));

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

      const rows = await db.select().from(profileUpdateRequests)
        .where(eq(profileUpdateRequests.id, id)).limit(1);
      const request = rows[0];
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== "pending") return res.status(400).json({ error: "Request is no longer pending" });

      await db.update(profileUpdateRequests).set({
        status: "rejected",
        adminNote: adminNote || null,
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      }).where(eq(profileUpdateRequests.id, id));

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
      const profile = await storage.getCandidateProfileByUserId(user.id);
      if (!profile) return res.json([]);
      const experiences = await storage.getPreviousExperiencesByCandidate(profile.id);
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
      const profile = await storage.getCandidateProfileByUserId(user.id);
      if (!profile) return res.status(400).json({ error: "Profile not found — please save your profile first" });
      const exp = await storage.createPreviousExperience({
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
      await storage.deletePreviousExperience(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete experience" });
    }
  });

  // ===== Attendance Routes =====
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
          clockIn  = "00:00";
          clockOut = "00:00";
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
      res.status(500).json({ error: "Failed to process quick entry" });
    }
  });

  app.patch("/api/attendance/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
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
  app.post("/api/attendance/:id/missed-log", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
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
      const diffMin = outMin > inMin ? outMin - inMin : 0;
      const workHours = fromMin(Math.min(diffMin, 12 * 60));

      const employee = await storage.getEmployee(existing.employeeId);
      let otHours = "0";
      if (employee) {
        const policies = await storage.getTimeOfficePoliciesByCompany(existing.companyId);
        const active = (policies as any[]).filter(p => p.status === "active");
        let policy: any = (employee as any).timeOfficePolicyId
          ? active.find(p => p.id === (employee as any).timeOfficePolicyId)
          : null;
        if (!policy) policy = active.find(p => p.isDefault) || active[0];

        const normalDutyMin =
          toMin((policy?.dutyEndTime) || "18:00") - toMin((policy?.dutyStartTime) || "09:00");
        const cappedDiff = Math.min(diffMin, 12 * 60);
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

  app.delete("/api/attendance/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
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
  app.get("/api/leave-types", requireAuth, requireModuleAccess("leave"), async (req, res) => {
    try {
      const user = (req as any).user;
      let leaveTypes;
      if (user.role === "super_admin") {
        leaveTypes = await storage.getAllLeaveTypes();
      } else {
        leaveTypes = await storage.getLeaveTypesByCompany(user.companyId);
      }
      res.json(leaveTypes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave types" });
    }
  });

  app.post("/api/leave-types", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const data = insertLeaveTypeSchema.parse(req.body);
      const leaveType = await storage.createLeaveType(data);
      res.status(201).json(leaveType);
    } catch (error) {
      res.status(500).json({ error: "Failed to create leave type" });
    }
  });

  app.patch("/api/leave-types/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const updated = await storage.updateLeaveType(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Leave type not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update leave type" });
    }
  });

  app.delete("/api/leave-types/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const success = await storage.deleteLeaveType(req.params.id);
      if (!success) return res.status(404).json({ error: "Leave type not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete leave type" });
    }
  });

  // ===== Leave Requests Routes =====
  app.get("/api/leave-requests", requireAuth, requireModuleAccess("leave"), async (req, res) => {
    try {
      const user = (req as any).user;
      let requests;
      if (user.role === "employee") {
        const employees = user.companyId ? await storage.getEmployeesByCompany(user.companyId) : [];
        const myEmployee = employees.find(e => e.userId === user.id);
        if (myEmployee) {
          requests = await storage.getLeaveRequestsByEmployee(myEmployee.id);
        } else {
          requests = [];
        }
      } else if (user.role === "super_admin") {
        requests = await storage.getAllLeaveRequests();
      } else if (user.companyId) {
        requests = await storage.getLeaveRequestsByCompany(user.companyId);
      } else {
        requests = [];
      }
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/leave-requests", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertLeaveRequestSchema.parse(req.body);
      const request = await storage.createLeaveRequest(data);
      // Notify HR/admins about new leave request
      try {
        const companyUsers = await db.query.users.findMany({ where: (u: any, { eq: eqFn, inArray }: any) => inArray(u.role, ["hr_admin", "company_admin", "super_admin"]) });
        const hrIds = companyUsers.filter((u: any) => u.role === "super_admin" || u.companyId === user.companyId).map((u: any) => u.id).filter((id: any) => id !== user.id);
        const emp = await storage.getEmployeeByUserId(user.id);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : user.username;
        await createNotificationForMany(hrIds, { companyId: user.companyId, type: "leave_request", title: "New Leave Request", message: `${empName} has submitted a leave request.`, link: "/leave" });
        // Also notify the employee themselves
        await createNotification({ userId: user.id, companyId: user.companyId, type: "leave_submitted", title: "Leave Request Submitted", message: "Your leave request has been submitted and is awaiting approval.", link: "/leave" });
      } catch {}
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create leave request" });
    }
  });

  app.patch("/api/leave-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getLeaveRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Leave request not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updates = { ...req.body };
      if (req.body.status === "approved" || req.body.status === "rejected") {
        updates.approvedBy = user.id;
        updates.approvedAt = updates.approvedAt || new Date().toISOString();
      }
      const updated = await storage.updateLeaveRequest(req.params.id, updates);
      // Notify employee when leave is approved or rejected
      if (req.body.status === "approved" || req.body.status === "rejected") {
        try {
          const empRecord = await storage.getEmployeeByUserId ? null : null; // fallback
          // Find the user linked to the employee of this leave request
          const leaveEmp = existing.employeeId ? await storage.getEmployee(existing.employeeId) : null;
          if (leaveEmp) {
            const empUsers = await db.query.users.findMany({ where: (u: any, { eq: eqFn }: any) => eqFn(u.id, leaveEmp.userId) });
            const empUser = empUsers[0];
            if (empUser) {
              const statusLabel = req.body.status === "approved" ? "Approved ✓" : "Rejected ✗";
              await createNotification({ userId: empUser.id, companyId: existing.companyId, type: `leave_${req.body.status}`, title: `Leave Request ${statusLabel}`, message: req.body.status === "approved" ? "Your leave request has been approved." : `Your leave request has been rejected. ${req.body.rejectionReason || ""}`, link: "/leave" });
            }
          }
        } catch {}
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update leave request" });
    }
  });

  // ===== Salary Structure Bulk Upload Routes =====
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

  app.post("/api/salary-structures/bulk-upload", requireAuth, requireModuleAccess("payroll"), upload.single("file"), async (req, res) => {
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
      const today = new Date().toISOString().slice(0, 10);

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
        effectiveFrom: today,
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

  app.post("/api/salary-structures", requireAuth, requireModuleAccess("payroll"), async (req, res) => {
    try {
      const data = insertSalaryStructureSchema.parse(req.body);
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
      } else {
        records = [];
      }
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payroll" });
    }
  });

  app.post("/api/payroll", requireAuth, requireModuleAccess("payroll"), async (req, res) => {
    try {
      const data = insertPayrollSchema.parse(req.body);

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

            let unrecordedWOs = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${calcYear}-${String(calcMonthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const utcDate = new Date(Date.UTC(calcYear, calcMonthNum - 1, d));
              if (utcDate > today) break;
              const dayName = dayNames[utcDate.getUTCDay()];
              if ((dayName === wo1 || dayName === wo2) && !periodAtt.find(a => a.date === dateStr)) {
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
          if (emp && (emp as any).userId) {
            const label = req.body.status === "paid" ? "Salary Credited" : "Payslip Ready";
            const msg = req.body.status === "paid"
              ? `Your salary for ${existing.month} ${existing.year} has been credited. ₹${Number((updated as any).netPay || 0).toLocaleString("en-IN")}`
              : `Your payslip for ${existing.month} ${existing.year} has been generated.`;
            await createNotification({ userId: (emp as any).userId, companyId: existing.companyId, type: "payroll_" + req.body.status, title: label, message: msg, link: "/payroll" });
          }
        } catch {}
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
  app.get("/api/settings", requireAuth, requireModuleAccess("settings"), async (req, res) => {
    try {
      const user = (req as any).user;
      let settings;
      if (user.role === "super_admin") {
        settings = await storage.getAllSettings();
      } else if (user.companyId) {
        settings = (await storage.getAllSettings()).filter(s => s.companyId === null || s.companyId === user.companyId);
      } else {
        settings = [];
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAuth, requireModuleAccess("settings"), async (req, res) => {
    try {
      const data = insertSettingSchema.parse(req.body);
      const existing = await storage.getSettingByKey(data.companyId || null, data.key);
      if (existing) {
        const updated = await storage.updateSetting(existing.id, data);
        return res.json(updated);
      }
      const setting = await storage.createSetting(data);
      res.status(201).json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  // ===== Statutory Settings Routes =====
  app.get("/api/statutory-settings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        const settings = await storage.getStatutorySettingsByCompany(companyId as string);
        return res.json(settings ? [settings] : []);
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const company of allCompanies) {
          const s = await storage.getStatutorySettingsByCompany(company.id);
          if (s) results.push(s);
        }
        return res.json(results);
      }
      if (user.companyId) {
        const settings = await storage.getStatutorySettingsByCompany(user.companyId);
        return res.json(settings ? [settings] : []);
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statutory settings" });
    }
  });

  app.post("/api/statutory-settings", requireAuth, async (req, res) => {
    try {
      const data = insertStatutorySettingsSchema.parse(req.body);
      const settings = await storage.createStatutorySettings(data);
      res.status(201).json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to create statutory settings" });
    }
  });

  app.patch("/api/statutory-settings/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateStatutorySettings(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Statutory settings not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update statutory settings" });
    }
  });

  // ===== Master Departments Routes =====
  app.get("/api/master-departments", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        const depts = await storage.getMasterDepartmentsByCompany(companyId as string);
        return res.json(depts);
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterDepartments());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterDepartmentsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/master-departments", requireAuth, async (req, res) => {
    try {
      const data = insertMasterDepartmentSchema.parse(req.body);
      const dept = await storage.createMasterDepartment(data);
      res.status(201).json(dept);
    } catch (error) {
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.patch("/api/master-departments/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMasterDepartment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Department not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/master-departments/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteMasterDepartment(req.params.id);
      if (!success) return res.status(404).json({ error: "Department not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // ===== Master Designations Routes =====
  app.get("/api/master-designations", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getMasterDesignationsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterDesignations());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterDesignationsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch designations" });
    }
  });

  app.post("/api/master-designations", requireAuth, async (req, res) => {
    try {
      const data = insertMasterDesignationSchema.parse(req.body);
      const desg = await storage.createMasterDesignation(data);
      res.status(201).json(desg);
    } catch (error) {
      res.status(500).json({ error: "Failed to create designation" });
    }
  });

  app.patch("/api/master-designations/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMasterDesignation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Designation not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update designation" });
    }
  });

  app.delete("/api/master-designations/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteMasterDesignation(req.params.id);
      if (!success) return res.status(404).json({ error: "Designation not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete designation" });
    }
  });

  // ===== Wage Grades Routes =====
  // Authz: GET filtered by user's companyId unless super_admin; mutations
  // require masters module access AND record-level company ownership.
  const canTouchWageGrade = (user: { role?: string; companyId?: string | null }, companyId: string) =>
    user.role === "super_admin" || (!!user.companyId && user.companyId === companyId);

  app.get("/api/wage-grades", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        if (!canTouchWageGrade(user, companyId as string)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        return res.json(await storage.getWageGradesByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllWageGrades());
      }
      if (user.companyId) {
        return res.json(await storage.getWageGradesByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wage grades" });
    }
  });

  app.post("/api/wage-grades", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const data = insertWageGradeSchema.parse(req.body);
      if (!canTouchWageGrade(user, data.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (data.effectiveFrom && data.name && data.state) {
        const existing = await storage.getWageGradesByCompany(data.companyId);
        const sameGrades = existing
          .filter(g => g.name === data.name && g.state === data.state && g.effectiveFrom)
          .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""));

        if (sameGrades.length > 0) {
          const latest = sameGrades[0];

          // Reject exact duplicate date
          if (latest.effectiveFrom === data.effectiveFrom) {
            return res.status(400).json({
              error: `A "${data.name}" grade for ${data.state} already exists with effective date ${data.effectiveFrom}. Choose a different date.`,
            });
          }

          // Enforce minimum 1-month gap
          const latestDate = new Date(latest.effectiveFrom!);
          const newDate = new Date(data.effectiveFrom);
          const minAllowed = new Date(latestDate);
          minAllowed.setMonth(minAllowed.getMonth() + 1);

          if (newDate < minAllowed) {
            return res.status(400).json({
              error: `Minimum 1-month gap required. The previous "${data.name}" (${data.state}) entry is effective from ${latest.effectiveFrom}. New entry must be effective from ${minAllowed.toISOString().slice(0, 10)} or later.`,
            });
          }

          // Auto-close previous active grade: effectiveTo = new date - 1 day
          const closingDate = new Date(newDate);
          closingDate.setDate(closingDate.getDate() - 1);
          await storage.updateWageGrade(latest.id, {
            effectiveTo: closingDate.toISOString().slice(0, 10),
            status: "closed",
          });
        }
      }

      const grade = await storage.createWageGrade(data);
      res.status(201).json(grade);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wage grade", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create wage grade" });
    }
  });

  app.patch("/api/wage-grades/:id", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getWageGrade(req.params.id);
      if (!existing) return res.status(404).json({ error: "Wage grade not found" });
      if (!canTouchWageGrade(user, existing.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const data = insertWageGradeSchema.partial().parse(req.body);
      // Forbid moving a grade to a different company
      if (data.companyId && !canTouchWageGrade(user, data.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateWageGrade(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Wage grade not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wage grade", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update wage grade" });
    }
  });

  app.delete("/api/wage-grades/:id", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getWageGrade(req.params.id);
      if (!existing) return res.status(404).json({ error: "Wage grade not found" });
      if (!canTouchWageGrade(user, existing.companyId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const success = await storage.deleteWageGrade(req.params.id);
      if (!success) return res.status(404).json({ error: "Wage grade not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete wage grade" });
    }
  });

  // ===== Master Locations Routes =====
  app.get("/api/master-locations", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getMasterLocationsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllMasterLocations());
      }
      if (user.companyId) {
        return res.json(await storage.getMasterLocationsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.post("/api/master-locations", requireAuth, async (req, res) => {
    try {
      const data = insertMasterLocationSchema.parse(req.body);
      const loc = await storage.createMasterLocation(data);
      res.status(201).json(loc);
    } catch (error) {
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.patch("/api/master-locations/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMasterLocation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Location not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/master-locations/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteMasterLocation(req.params.id);
      if (!success) return res.status(404).json({ error: "Location not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // ===== Earning Heads Routes =====
  app.get("/api/earning-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getEarningHeadsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const heads = await storage.getEarningHeadsByCompany(c.id);
          results.push(...heads);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getEarningHeadsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch earning heads" });
    }
  });

  app.post("/api/earning-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const body = { ...req.body };
      if (!body.companyId && user.companyId) body.companyId = user.companyId;
      const data = insertEarningHeadSchema.parse(body);
      const head = await storage.createEarningHead(data);
      res.status(201).json(head);
    } catch (error: any) {
      const msg = error?.errors ? JSON.stringify(error.errors) : (error?.message || String(error));
      console.error("[earning-heads POST] ERROR:", msg);
      res.status(500).json({ error: "Failed to create earning head" });
    }
  });

  app.patch("/api/earning-heads/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateEarningHead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Earning head not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update earning head" });
    }
  });

  app.delete("/api/earning-heads/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteEarningHead(req.params.id);
      if (!success) return res.status(404).json({ error: "Earning head not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete earning head" });
    }
  });

  // ===== Deduction Heads Routes =====
  app.get("/api/deduction-heads", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getDeductionHeadsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const heads = await storage.getDeductionHeadsByCompany(c.id);
          results.push(...heads);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getDeductionHeadsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deduction heads" });
    }
  });

  app.post("/api/deduction-heads", requireAuth, async (req, res) => {
    try {
      const data = insertDeductionHeadSchema.parse(req.body);
      const head = await storage.createDeductionHead(data);
      res.status(201).json(head);
    } catch (error) {
      res.status(500).json({ error: "Failed to create deduction head" });
    }
  });

  app.patch("/api/deduction-heads/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateDeductionHead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Deduction head not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update deduction head" });
    }
  });

  app.delete("/api/deduction-heads/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteDeductionHead(req.params.id);
      if (!success) return res.status(404).json({ error: "Deduction head not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete deduction head" });
    }
  });

  // ===== Time Office Policies Routes =====
  app.get("/api/time-office-policies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getTimeOfficePoliciesByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        const allCompanies = await storage.getAllCompanies();
        const results = [];
        for (const c of allCompanies) {
          const policies = await storage.getTimeOfficePoliciesByCompany(c.id);
          results.push(...policies);
        }
        return res.json(results);
      }
      if (user.companyId) {
        return res.json(await storage.getTimeOfficePoliciesByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time office policies" });
    }
  });

  app.post("/api/time-office-policies", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.weeklyOff2 === "" || body.weeklyOff2 === "__none__") body.weeklyOff2 = null;
      const data = insertTimeOfficePolicySchema.parse(body);
      const policy = await storage.createTimeOfficePolicy(data);
      res.status(201).json(policy);
    } catch (error: any) {
      console.error("Time office policy create error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to create time office policy" });
    }
  });

  app.patch("/api/time-office-policies/:id", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.weeklyOff2 === "" || body.weeklyOff2 === "__none__") body.weeklyOff2 = null;
      const updated = await storage.updateTimeOfficePolicy(req.params.id, body);
      if (!updated) return res.status(404).json({ error: "Time office policy not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Time office policy update error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to update time office policy" });
    }
  });

  app.delete("/api/time-office-policies/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteTimeOfficePolicy(req.params.id);
      if (!success) return res.status(404).json({ error: "Time office policy not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete time office policy" });
    }
  });

  // ===== FnF Settlements Routes =====
  app.get("/api/fnf-settlements", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getFnfSettlementsByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllFnfSettlements());
      }
      if (user.companyId) {
        return res.json(await storage.getFnfSettlementsByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch F&F settlements" });
    }
  });

  app.post("/api/fnf-settlements", requireAuth, async (req, res) => {
    try {
      const data = insertFnfSettlementSchema.parse(req.body);
      const settlement = await storage.createFnfSettlement(data);
      res.status(201).json(settlement);
    } catch (error) {
      res.status(500).json({ error: "Failed to create F&F settlement" });
    }
  });

  app.patch("/api/fnf-settlements/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateFnfSettlement(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "F&F settlement not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update F&F settlement" });
    }
  });

  app.delete("/api/fnf-settlements/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteFnfSettlement(req.params.id);
      if (!success) return res.status(404).json({ error: "F&F settlement not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete F&F settlement" });
    }
  });

  // ===== Holidays Routes =====
  app.get("/api/holidays", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      if (companyId) {
        return res.json(await storage.getHolidaysByCompany(companyId as string));
      }
      if (user.role === "super_admin") {
        return res.json(await storage.getAllHolidays());
      }
      if (user.companyId) {
        return res.json(await storage.getHolidaysByCompany(user.companyId));
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  app.post("/api/holidays", requireAuth, async (req, res) => {
    try {
      const data = insertHolidaySchema.parse(req.body);
      const holiday = await storage.createHoliday(data);
      res.status(201).json(holiday);
    } catch (error) {
      res.status(500).json({ error: "Failed to create holiday" });
    }
  });

  app.patch("/api/holidays/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHoliday(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Holiday not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update holiday" });
    }
  });

  app.delete("/api/holidays/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteHoliday(req.params.id);
      if (!success) return res.status(404).json({ error: "Holiday not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete holiday" });
    }
  });

  // ===== Company CRUD Additions =====
  app.patch("/api/companies/:id", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getCompany(req.params.id);
      if (!existing) return res.status(404).json({ error: "Company not found" });
      if (user.role !== "super_admin" && existing.id !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.updateCompany(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const existing = await storage.getCompany(req.params.id);
      if (!existing) return res.status(404).json({ error: "Company not found" });
      const success = await storage.deleteCompany(req.params.id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // Company Contractors
  app.get("/api/companies/:id/principal-employers", requireAuth, async (req, res) => {
    try {
      const employers = await storage.getPrincipalEmployers(req.params.id);
      res.json(employers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch principal employers" });
    }
  });

  app.get("/api/companies/:id/contractors", requireAuth, async (req, res) => {
    try {
      const contractors = await storage.getCompanyContractors(req.params.id);
      res.json(contractors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  app.post("/api/companies/:id/contractors", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const { contractorId, startDate } = req.body;
      if (!contractorId || !startDate) return res.status(400).json({ error: "contractorId and startDate are required" });
      const record = await storage.addCompanyContractor({ companyId: req.params.id, contractorId, startDate });
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
      const success = await storage.removeCompanyContractor(req.params.id, req.params.contractorId);
      if (!success) return res.status(404).json({ error: "Contractor association not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove contractor" });
    }
  });

  // ─── Contractor Employee Tagging ──────────────────────────────────────────────

  app.get("/api/companies/:companyId/employees", requireAuth, async (req, res) => {
    try {
      const emps = await storage.getEmployeesByCompany(req.params.companyId);
      res.json(emps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.get("/api/companies/:id/contractors/:contractorId/employees", requireAuth, async (req, res) => {
    try {
      const tagged = await storage.getContractorEmployees(req.params.id, req.params.contractorId);
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
      await storage.addContractorEmployee(req.params.id, req.params.contractorId, employeeId, taggedDate, taggedBy);
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
      const success = await storage.removeContractorEmployee(req.params.id, req.params.contractorId, req.params.employeeId);
      if (!success) return res.status(404).json({ error: "Tagged employee not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove employee tag" });
    }
  });

  // ─── Loan & Advance Routes ───────────────────────────────────────────────────

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
        const allUsers = await db.query.users.findMany({});
        const hrIds = allUsers.filter((u: any) => ["hr_admin","company_admin","super_admin"].includes(u.role) && (u.role === "super_admin" || u.companyId === record.companyId)).map((u: any) => u.id).filter((id: any) => id !== requestUser.id);
        const emp2 = await storage.getEmployee(record.employeeId);
        const empName2 = emp2 ? `${emp2.firstName} ${emp2.lastName}` : requestUser.username;
        const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
        await createNotificationForMany(hrIds, { companyId: record.companyId, type: "loan_request", title: `New ${typeLabel} Request`, message: `${empName2} has applied for a ${typeLabel.toLowerCase()} of ₹${Number(record.amount).toLocaleString("en-IN")}.`, link: "/loan-advances" });
        await createNotification({ userId: requestUser.id, companyId: record.companyId, type: "loan_submitted", title: `${typeLabel} Request Submitted`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} has been submitted.`, link: "/loan-advances" });
      } catch {}
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
        if (loanEmp && (loanEmp as any).userId) {
          const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
          await createNotification({ userId: (loanEmp as any).userId, companyId: record.companyId, type: "loan_approved", title: `${typeLabel} Approved ✓`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} has been approved. EMI: ₹${Number(installmentAmount).toLocaleString("en-IN")}/month.`, link: "/loan-advances" });
        }
      } catch {}
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
        if (loanEmpR && (loanEmpR as any).userId) {
          const typeLabel = record.type === "loan" ? "Loan" : "Salary Advance";
          await createNotification({ userId: (loanEmpR as any).userId, companyId: record.companyId, type: "loan_rejected", title: `${typeLabel} Rejected`, message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(record.amount).toLocaleString("en-IN")} was rejected. Reason: ${req.body.rejectionReason || "No reason provided"}.`, link: "/loan-advances" });
        }
      } catch {}
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

  // ===== Notification Routes =====
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await db.select().from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
      res.json({ count: rows.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, req.params.id), eq(notifications.userId, user.id)));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.delete("/api/notifications/clear", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.delete(notifications).where(eq(notifications.userId, user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  // SSE stream endpoint — real-time notification delivery
  app.get("/api/notifications/stream", requireAuth, (req, res) => {
    const user = (req as any).user;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    addSSEClient(user.id, res);
    const heartbeat = setInterval(() => {
      try { res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`); }
      catch { clearInterval(heartbeat); }
    }, 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      removeSSEClient(user.id, res);
    });
  });

  // ===== Contractor Masters Routes =====
  app.get("/api/contractor-masters", requireAuth, requireModuleAccess("masters"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query;
      const cid = (companyId as string) || user.companyId;
      if (!cid) return res.json([]);
      return res.json(await storage.getContractorMastersByCompany(cid));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contractor masters" });
    }
  });

  app.post("/api/contractor-masters", requireAuth, async (req, res) => {
    try {
      const data = insertContractorMasterSchema.parse(req.body);
      const record = await storage.createContractorMaster(data);
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to create contractor master" });
    }
  });

  app.patch("/api/contractor-masters/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateContractorMaster(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Contractor master not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contractor master" });
    }
  });

  app.delete("/api/contractor-masters/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteContractorMaster(req.params.id);
      if (!success) return res.status(404).json({ error: "Contractor master not found" });
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contractor master" });
    }
  });

  // Register compliance routes (completely separate module)
  registerComplianceRoutes(app);

  return httpServer;
}
