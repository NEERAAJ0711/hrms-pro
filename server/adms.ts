import express from "express";
import type { Express, Request, Response } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { timingSafeEqual, randomUUID } from "crypto";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { biometricPunchLogs } from "../shared/schema";
import rateLimit from "express-rate-limit";

// Verbose ADMS request/response logging.
// Always on in development; in production only when DEBUG_ADMS=true is set.
// Keeps PM2 logs clean without losing visibility during local dev or on-demand prod debugging.
const ADMS_DEBUG = process.env.DEBUG_ADMS === "true" || process.env.NODE_ENV !== "production";

/**
 * ZKTeco "Push SDK" / ADMS protocol handler.
 *
 * The device runs in ADMS (cloud-push) mode and POSTs attendance records
 * to the configured server over HTTP. We never dial the device — it phones
 * home. This is the right model when the device sits behind NAT.
 *
 * Endpoints the firmware uses (all unauthenticated; the device only knows
 * how to send its serial number `SN=...` in the query string, so that's
 * the only identifier we have to authenticate it):
 *
 *   GET  /iclock/cdata?SN=<serial>&options=all&pushver=...&language=...
 *        → handshake, we return a tiny config block telling the device
 *          when/how to push records.
 *
 *   POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<n>
 *        → body is tab-separated attendance lines:
 *            <pin>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t<workcode>\t...
 *          where status: 0=check-in, 1=check-out, 2=break-out,
 *                        3=break-in, 4=overtime-in, 5=overtime-out
 *
 *   POST /iclock/cdata?SN=<serial>&table=OPERLOG | USERINFO | FINGERTMP
 *        → user/biometric metadata; we ack with "OK" and discard.
 *
 *   GET  /iclock/getrequest?SN=<serial>
 *        → device polling for queued commands; we always reply "OK".
 *
 *   POST /iclock/devicecmd?SN=<serial>
 *        → device reporting command results; ack and discard.
 *
 *   GET  /iclock/ping?SN=<serial>  (some firmwares)
 *        → liveness; "OK".
 *
 * Every successful contact updates `lastPushAt` / `lastPushIp` /
 * `firmwareVersion` / `pushTotal` on the device row, and (for ATTLOG)
 * inserts deduped rows into `biometric_punch_logs`.
 */

const NEW_LINE = "\r\n";

// ---------------------------------------------------------------------------
// In-memory device cache — avoids hitting the DB on every ADMS request.
// TTL of 30 s is short enough to pick up DB changes quickly.
// ---------------------------------------------------------------------------
const _deviceCache = new Map<string, { device: any | null; ts: number }>();
const DEVICE_CACHE_TTL_MS = 30_000;

function _invalidateDevice(deviceId?: string) {
  if (!deviceId) { _deviceCache.clear(); return; }
  for (const [k, v] of Array.from(_deviceCache.entries())) {
    if (v.device?.id === deviceId) _deviceCache.delete(k);
  }
}

// In-memory command queue per device. ZK ADMS lets the server reply to a
// device poll with C:<id>:<command> lines; the device executes and reports
// back via /iclock/devicecmd. Volatile memory is fine here — if the server
// restarts the admin just clicks "Sync Users" again.
const pendingCommands: Map<string, string[]> = new Map();
// Command IDs must be small integers — ZKTeco firmware typically overflows
// on IDs larger than a few digits. DO NOT use Date.now() here.
let nextCmdId = 1;

const MAX_QUEUE_PER_DEVICE = 8;

export async function enqueueDeviceCommand(deviceId: string, cmd: string): Promise<void> {
  // Update in-memory queue first (zero-latency for the current request cycle).
  const list = pendingCommands.get(deviceId) || [];
  if (!list.includes(cmd)) {
    if (list.length >= MAX_QUEUE_PER_DEVICE) {
      console.warn(`[ADMS] queue full for device=${deviceId}, dropping cmd: ${cmd}`);
    } else {
      list.push(cmd);
      pendingCommands.set(deviceId, list);
    }
  }

  // Persist to DB so commands survive server restarts.
  // Atomic: appends only when cmd is not already present and queue < limit.
  // Silently falls back to in-memory-only when the column doesn't exist yet
  // (before migration 012 has been applied on this DB instance).
  try {
    await db.execute(sql`
      UPDATE biometric_devices
      SET pending_commands = (
        CASE
          WHEN jsonb_array_length(COALESCE(pending_commands, '[]'::jsonb)) >= ${MAX_QUEUE_PER_DEVICE}
            OR COALESCE(pending_commands, '[]'::jsonb) @> jsonb_build_array(${cmd}::text)
          THEN COALESCE(pending_commands, '[]'::jsonb)
          ELSE COALESCE(pending_commands, '[]'::jsonb) || jsonb_build_array(${cmd}::text)
        END
      )
      WHERE id = ${deviceId}
    `);
  } catch {
    // Best-effort: in-memory queue is already updated above.
  }
}

async function drainCommands(deviceId: string): Promise<string[]> {
  // Drain in-memory queue immediately.
  const memCmds = pendingCommands.get(deviceId) || [];
  pendingCommands.delete(deviceId);

  // Atomically read + clear the DB queue in a single CTE so nothing is lost
  // even if two requests arrive simultaneously.
  try {
    const result = await db.execute(sql`
      WITH snapshot AS (
        SELECT COALESCE(pending_commands, '[]'::jsonb) AS cmds
        FROM biometric_devices WHERE id = ${deviceId}
      ),
      cleared AS (
        UPDATE biometric_devices
        SET pending_commands = '[]'::jsonb
        WHERE id = ${deviceId}
      )
      SELECT cmds FROM snapshot
    `);
    const dbCmds: string[] = (result.rows[0] as any)?.cmds ?? [];
    // Merge DB + in-memory, preserving insertion order and deduplicating.
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const c of [...dbCmds, ...memCmds]) {
      if (!seen.has(c)) { seen.add(c); merged.push(c); }
    }
    return merged;
  } catch {
    // Fall back to in-memory only (e.g. column not yet added by migration).
    return memCmds;
  }
}

// Source IP for ADMS auth. We deliberately do NOT parse the raw
// X-Forwarded-For header here — a spoofer could trivially forge it and
// satisfy the pinned-CIDR check without holding the device's token.
// Express's req.ip already returns the right thing when `trust proxy` is
// configured (one hop, set in server/index.ts), so the proxy chain is
// honoured but client-supplied XFF is ignored. Fall back to the raw
// socket peer if req.ip is somehow unavailable.
function clientIp(req: Request): string {
  return ((req.ip || req.socket.remoteAddress || "") as string).trim();
}

// Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4) down to the bare IPv4 literal
// so CIDR comparisons against pinned IPv4 ranges work the way operators expect.
function normaliseIp(ip: string): string {
  if (!ip) return ip;
  const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? m[1] : ip;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc * 256) + n;
  }
  return acc >>> 0;
}

// Match a client IP against an allow-list spec. Spec may be a single CIDR
// ("1.2.3.4/24"), a bare IPv4 literal (treated as /32), or a comma-separated
// list of either. IPv6 is supported only as exact-match literals.
function ipMatchesSpec(rawIp: string, spec: string): boolean {
  const ip = normaliseIp(rawIp || "");
  if (!ip || !spec) return false;
  for (const piece of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (piece.includes("/")) {
      const [base, bitsStr] = piece.split("/");
      const bits = Number(bitsStr);
      // IPv6 /128 is just exact-match on the literal — supported via the
      // string-equality path. Any other IPv6 prefix isn't supported (the
      // admin-time validator rejects it before it ever reaches us).
      if (ipv4ToInt(base) == null) {
        if (bits === 128 && base.toLowerCase() === ip.toLowerCase()) return true;
        continue;
      }
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
      const ipInt = ipv4ToInt(ip);
      const baseInt = ipv4ToInt(base);
      if (ipInt == null || baseInt == null) continue;
      if (bits === 0) return true;
      const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
      if ((ipInt & mask) === (baseInt & mask)) return true;
    } else {
      if (piece === ip) return true;
      const a = ipv4ToInt(ip);
      const b = ipv4ToInt(piece);
      if (a != null && b != null && a === b) return true;
    }
  }
  return false;
}

function safeStrEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function extractToken(req: Request): string {
  const q = req.query as Record<string, unknown>;
  const fromQuery = String(q.token || q.auth || q.Token || "").trim();
  if (fromQuery) return fromQuery;
  const xHeader = String(req.headers["x-device-token"] || "").trim();
  if (xHeader) return xHeader;
  const authz = String(req.headers["authorization"] || "").trim();
  if (authz) {
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    return authz;
  }
  return "";
}

// Returns null on success, or a short reason string (for logs) on failure.
// If NEITHER pushToken NOR allowedIpCidr is configured the device runs in
// "open" mode — any source IP is accepted. This is the right default for
// most ZKTeco deployments where the device is behind NAT and has no fixed IP.
// Admins can tighten security by adding a pushToken or IP CIDR at any time.
function authenticateDevice(req: Request, device: any, ip: string): string | null {
  const token = (device.pushToken || "").trim();
  const cidr = (device.allowedIpCidr || "").trim();
  if (!token && !cidr) {
    // No auth configured → trust-all (open) mode.
    // Only log this warning in debug mode; it fires on every single request
    // otherwise (most deployments legitimately run open — device behind NAT).
    if (ADMS_DEBUG) console.warn(
      `[ADMS] WARN: device SN=${device.deviceSerial} running in open mode (no pushToken/allowedIpCidr) — ` +
      `accepted push from ${ip}.`,
    );
    return null;
  }
  if (token) {
    const provided = extractToken(req);
    if (provided && safeStrEq(provided, token)) return null;
  }
  if (cidr) {
    if (ipMatchesSpec(ip, cidr)) return null;
  }
  return token && cidr
    ? "neither token nor source IP matched"
    : token
      ? "token missing or wrong"
      : "source IP not in allow-list";
}

async function findDeviceBySerial(serial: string) {
  const cacheKey = serial || "";
  const cached = _deviceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DEVICE_CACHE_TTL_MS) {
    return cached.device ?? undefined;
  }

  const all = await storage.getAllBiometricDevices();
  // 1. Exact match
  const exact = all.find((d) => d.deviceSerial === serial);
  if (exact) { _deviceCache.set(cacheKey, { device: exact, ts: Date.now() }); return exact; }
  // 2. Case-insensitive match
  const upper = serial.toUpperCase();
  const ci = all.find((d) => (d.deviceSerial || "").toUpperCase() === upper);
  if (ci) { _deviceCache.set(cacheKey, { device: ci, ts: Date.now() }); return ci; }
  // 3. Single-device fallback — if only one device is registered and the SN
  //    doesn't match exactly, use it anyway (handles typos / mistyped SNs).
  //    We log a prominent warning so the operator can fix the SN in HRMS.
  if (all.length === 1) {
    if (ADMS_DEBUG) console.warn(
      `[ADMS] SN MISMATCH: device reports SN=${serial} but HRMS has SN=${all[0].deviceSerial}. ` +
      `Using the only registered device as fallback.`,
    );
    // Auto-correct the SN in DB so future calls match exactly
    try {
      await storage.updateBiometricDevice(all[0].id, { deviceSerial: serial } as any);
      _invalidateDevice(all[0].id);
    } catch (_) { /* best-effort */ }
    const result = { ...all[0], deviceSerial: serial };
    _deviceCache.set(cacheKey, { device: result, ts: Date.now() });
    return result;
  }

  _deviceCache.set(cacheKey, { device: null, ts: Date.now() }); // negative cache
  return undefined;
}

async function touchDevice(
  deviceId: string,
  ip: string,
  extra: { firmwareVersion?: string; addToTotal?: number; lastAttlogStamp?: number } = {},
) {
  const update: any = {
    status: "online",
    lastPushAt: new Date().toISOString(),
    lastPushIp: ip,
  };
  if (extra.firmwareVersion) update.firmwareVersion = extra.firmwareVersion;
  if (extra.lastAttlogStamp != null) update.lastAttlogStamp = extra.lastAttlogStamp;
  await storage.updateBiometricDevice(deviceId, update);
  if (extra.addToTotal) {
    const fresh = await storage.getBiometricDevice(deviceId);
    if (fresh) {
      await storage.updateBiometricDevice(deviceId, {
        pushTotal: (fresh.pushTotal || 0) + extra.addToTotal,
      } as any);
    }
  }
  // Invalidate cache so subsequent lookups see fresh DB values.
  _invalidateDevice(deviceId);
}

// status field from ATTLOG → our internal punch type.
function decodePunchType(raw: string): string {
  switch ((raw || "").trim()) {
    case "0":
      return "in";
    case "1":
      return "out";
    case "2":
      return "break-out";
    case "3":
      return "break-in";
    case "4":
      return "overtime-in";
    case "5":
      return "overtime-out";
    default:
      return "unknown";
  }
}

// "2026-04-17 09:30:15" → { punchDate, punchTime, epochSecs }.
// punchTime is HH:MM (seconds dropped for display/dedup).
// epochSecs is the Unix timestamp used to advance the ATTLOGStamp pointer.
// Timestamps from ZKTeco x2008 are in the device's configured timezone
// (TimeZone=5.5 → IST = UTC+05:30). We parse them with an explicit offset.
function splitTimestamp(ts: string): { punchDate: string; punchTime: string; epochSecs: number } | null {
  const m = (ts || "").trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const secs = m[4] ?? "00";
  const isoStr = `${m[1]}T${m[2]}:${m[3]}:${secs}+05:30`;
  const epochSecs = Math.floor(new Date(isoStr).getTime() / 1000);
  return { punchDate: m[1], punchTime: `${m[2]}:${m[3]}`, epochSecs: isNaN(epochSecs) ? 0 : epochSecs };
}

// Parse a USERINFO/USER row pushed by the device. ZKTeco firmwares typically
// emit lines that look like:
//   USER PIN=123\tName=Alice\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=...\tVerify=0
// Some firmwares omit the leading "USER " token (table=USERINFO) and just
// send the tab-separated key=value pairs. We accept both shapes.
function parseUserRecord(line: string): Record<string, string> | null {
  let s = (line || "").trim();
  if (!s) return null;
  // Strip leading "USER " or "OPLOG\tUSER\t" prefixes if present.
  s = s.replace(/^(?:OPLOG\s+)?USER\s+/i, "");
  const out: Record<string, string> = {};
  for (const part of s.split(/\t+/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  // Must at least have a PIN to be useful.
  return out.PIN || out.Pin || out.pin ? out : null;
}

// Persist enrolled-user records pushed by the device (USERINFO table or
// USER rows inside OPERLOG). Idempotent: an upsert keyed on (device_id, pin)
// keeps name/privilege/card current and bumps last_seen_at on every push.
export async function processUserRecords(
  device: any,
  body: string,
): Promise<{ upserted: number; bad: number }> {
  const out = { upserted: 0, bad: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const now = new Date().toISOString();
  for (const line of lines) {
    // In OPERLOG payloads only USER rows are user enrollments — skip the rest.
    if (/^(?:OPLOG\s+)?USER\b/i.test(line) || !/^\w+\b/.test(line)) {
      // proceed
    } else if (!/PIN=/i.test(line)) {
      continue;
    }
    const rec = parseUserRecord(line);
    if (!rec) {
      out.bad++;
      continue;
    }
    const pin = String(rec.PIN || rec.Pin || rec.pin || "").trim();
    if (!pin) { out.bad++; continue; }
    const name = (rec.Name || rec.NAME || rec.name || "").trim() || null;
    const pri  = (rec.Pri  || rec.Privilege || "").trim() || null;
    const card = (rec.Card || rec.CARD || "").trim() || null;
    const passwordSet = !!(rec.Passwd || rec.Password || rec.PWD);
    try {
      await db.execute(sql`
        INSERT INTO biometric_device_users
          (device_id, device_employee_id, name, privilege, card,
           password_set, fingerprint_count, first_seen_at, last_seen_at)
        VALUES
          (${device.id}, ${pin}, ${name}, ${pri}, ${card},
           ${passwordSet}, 0, ${now}, ${now})
        ON CONFLICT (device_id, device_employee_id) DO UPDATE
          SET name          = COALESCE(EXCLUDED.name, biometric_device_users.name),
              privilege     = COALESCE(EXCLUDED.privilege, biometric_device_users.privilege),
              card          = COALESCE(EXCLUDED.card, biometric_device_users.card),
              password_set  = EXCLUDED.password_set OR biometric_device_users.password_set,
              last_seen_at  = EXCLUDED.last_seen_at
      `);
      out.upserted++;
    } catch (err) {
      console.error("[ADMS] upsert USER row failed:", err);
      out.bad++;
    }
  }
  return out;
}

export async function processAttlog(
  device: any,
  body: string,
): Promise<{ inserted: number; duplicates: number; unmapped: number; bad: number; maxStamp: number }> {
  const out = { inserted: 0, duplicates: 0, unmapped: 0, bad: 0, maxStamp: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // For unmapped rows we still want to record them so the operator can see
  // them in the Punch Logs view.
  const employees = device.companyId
    ? await storage.getEmployeesByCompany(device.companyId)
    : await storage.getAllEmployees();
  const byBiometricId = new Map(
    employees.filter((e) => e.biometricDeviceId).map((e) => [String(e.biometricDeviceId), e]),
  );

  // Fallback companyId: when the device has no company assigned and the
  // employee isn't mapped, use the first company so no punch is silently lost.
  let fallbackCompanyId: string | null = device.companyId ?? null;
  if (!fallbackCompanyId) {
    const allCompanies = await storage.getAllCompanies();
    fallbackCompanyId = allCompanies?.[0]?.id ?? null;
  }

  const now = new Date().toISOString();
  // Collect all valid rows for a single bulk INSERT … ON CONFLICT DO NOTHING.
  // This replaces the old per-row findDuplicatePunchLog + createBiometricPunchLog
  // pattern (2 DB round-trips per line) with one batch round-trip for the whole push.
  const rows: Array<{
    id: string;
    companyId: string;
    employeeId: string | null;
    deviceEmployeeId: string;
    punchTime: string;
    punchDate: string;
    punchType: string;
    deviceId: string;
    isProcessed: boolean;
    isDuplicate: boolean;
    missingPunch: boolean;
    syncedAt: null;
    createdAt: string;
  }> = [];

  for (const line of lines) {
    // Parse ATTLOG line. ZKTeco x2008 firmware 2.x emits tab-separated fields.
    //
    // Standard format:  PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify ...
    // Extended format:  PIN \t Name \t YYYY-MM-DD HH:MM:SS \t status \t ...
    //   (some builds include the employee name as field[1])
    let pin: string, ts: string, status: string = "0";
    const tabParts = line.split("\t");
    if (tabParts.length >= 2) {
      pin = tabParts[0].trim();
      const isDateField1 = /^\d{4}[-/]\d{2}[-/]\d{2}/.test(tabParts[1].trim());
      if (isDateField1) {
        ts     = tabParts[1].trim();
        status = (tabParts[2] ?? "0").trim();
      } else {
        ts     = (tabParts[2] ?? "").trim();
        status = (tabParts[3] ?? "0").trim();
      }
    } else {
      // Regex fallback for space-separated ATTLOG.
      const m = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(\d+)/);
      if (!m) { out.bad++; continue; }
      pin    = m[1];
      ts     = `${m[2]} ${m[3]}`;
      status = m[4];
    }

    const split = splitTimestamp(ts);
    if (!split) {
      if (out.bad === 0) {
        console.warn(`[ADMS] ATTLOG parse fail — pin="${pin}" ts="${ts}" raw="${line.slice(0, 80)}"`);
      }
      out.bad++;
      continue;
    }

    const employee = byBiometricId.get(String(pin));
    const punchCompanyId = employee?.companyId || device.companyId || fallbackCompanyId;
    if (!punchCompanyId) {
      // Cannot resolve a company — skip so we don't create orphaned rows.
      out.unmapped++;
      continue;
    }

    if (!employee) out.unmapped++;
    if (split.epochSecs > out.maxStamp) out.maxStamp = split.epochSecs;

    rows.push({
      id: randomUUID(),
      companyId: punchCompanyId,
      employeeId: employee?.id ?? null,
      deviceEmployeeId: String(pin),
      punchTime: split.punchTime,
      punchDate: split.punchDate,
      punchType: decodePunchType(status),
      deviceId: device.id,
      isProcessed: false,
      isDuplicate: false,
      missingPunch: false,
      syncedAt: null,
      createdAt: now,
    });
  }

  if (rows.length > 0) {
    try {
      const inserted = await db
        .insert(biometricPunchLogs)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: biometricPunchLogs.id });
      out.inserted  = inserted.length;
      out.duplicates = rows.length - inserted.length;
    } catch (err) {
      console.error("[ADMS] bulk insert ATTLOG failed:", err);
      out.bad += rows.length;
    }
  }

  return out;
}

// Rolling in-memory log of recent ADMS device activity (last 200 entries).
// Exposed via /api/biometric/adms-log for admin debugging.
const admsActivityLog: Array<{ ts: string; direction: "IN" | "OUT"; sn: string; line: string }> = [];
function admsLog(direction: "IN" | "OUT", sn: string, line: string) {
  admsActivityLog.push({ ts: new Date().toISOString(), direction, sn, line });
  if (admsActivityLog.length > 200) admsActivityLog.shift();
}

export function getAdmsActivityLog() {
  return [...admsActivityLog];
}

// Build a TransTimes string covering every 5-minute slot in 24 hours.
// The SpeedFace-V5L / ZKTeco ADMS firmware uploads data only at the
// times listed here, so dense coverage ensures low end-to-end latency.
function buildTransTimes(): string {
  return Array.from({ length: 24 }, (_, h) =>
    ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]
      .map((m) => `${String(h).padStart(2, "0")}:${m}`)
      .join(";")
  ).join(";");
}

// Map ZKTeco Verified field value to a human-readable label.
// SpeedFace-V5L face-recognition punches arrive with Verified=15.
function verifiedLabel(v: string): string {
  switch (v?.trim()) {
    case "1":   return "fingerprint";
    case "3":   return "finger-vein";
    case "4":   return "password";
    case "15":  return "face";
    case "200": return "palm";
    default:    return `method-${v ?? "?"}`;
  }
}

export function registerAdmsRoutes(app: Express) {
  // Log every raw /iclock/* request.
  // Verbose body preview is gated behind DEBUG_ADMS=true to avoid flooding
  // production PM2 logs on every 5-minute device heartbeat.
  app.use("/iclock", (req, _res, next) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const ip = clientIp(req);
    const method = req.method;
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const fullUrl = req.path + (qs ? `?${qs}` : "");
    if (ADMS_DEBUG) {
      const bodyPreview = typeof req.body === "string" && req.body.length > 0
        ? ` BODY[${req.body.length}bytes]: ${req.body.slice(0, 400).replace(/\t/g, "·").replace(/\r?\n/g, " | ")}` : "";
      const entry = `${method} ${fullUrl}${bodyPreview} (ip:${ip})`;
      console.log(`[ADMS-RAW] SN=${sn} ${entry}`);
      admsLog("IN", sn, entry);
    } else {
      admsLog("IN", sn, `${method} ${fullUrl} (ip:${ip})`);
    }
    next();
  });

  // Handshake / config pull. Some firmwares hit this on every wakeup;
  // others only on first boot. The body of our response tells the device
  // what to push and how often.
  //
  // Some ZKTeco firmware versions (x2008 fw 2.4.x) send an initial probe to
  // /iclock/cdata WITHOUT the SN parameter. If exactly one device is registered
  // we accept the probe using that device so the ADMS protocol can proceed.
  app.get(["/iclock/cdata", "/iclock/cdata.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);

    // Resolve device — skip findDeviceBySerial for empty SN to avoid
    // accidentally clearing the stored serial in the DB.
    let device = sn ? await findDeviceBySerial(sn) : undefined;

    // No-SN firmware probe: fall back to sole registered device.
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) {
        device = all[0];
        sn = device.deviceSerial || "";
        console.warn(`[ADMS] No-SN probe from ${ip} — matched sole device SN=${sn}`);
      }
    }

    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");
    if (!device) {
      // Reply 200 anyway — silent rejection just makes the device retry
      // forever and clutters the network. We'll still log the attempt.
      return res.type("text/plain").send("OK");
    }

    const authErr = authenticateDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT GET cdata SN=${sn} ip=${ip} reason="${authErr}"`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    const fw = String(req.query.pushver || req.query.PushVersion || "").trim();
    await touchDevice(device.id, ip, { firmwareVersion: fw || undefined });

    // ATTLOGStamp tells the device the last record the server has already seen.
    // The device will only push records with a higher timestamp on its next
    // TransTimes trigger. When lastAttlogStamp is 0 (fresh install or after a
    // manual "Clear & Re-Sync") the device sends its entire stored log.
    // This is the standard ADMS mechanism — no separate getrequest command needed.
    const attlogStamp = device.lastAttlogStamp ?? 0;

    // TransTimes: every 5 minutes across all 24 hours so the device uploads
    // attendance records promptly. Format: HH:MM;HH:MM;...
    const transTimes = buildTransTimes();

    // x2008 firmware: no "pushver" in the query string.
    // SpeedFace-V5L / newer push firmware: includes "pushver".
    const isSpeedFace = !!fw;

    if (ADMS_DEBUG) console.log(`[ADMS] GET /iclock/cdata SN=${sn} ip=${ip} protocol=${isSpeedFace ? "SpeedFace" : "x2008"} ATTLOGStamp=${attlogStamp}`);
    admsLog("OUT", sn, `→ 200 registration protocol=${isSpeedFace ? "SpeedFace" : "x2008"} ATTLOGStamp=${attlogStamp}`);

    if (isSpeedFace) {
      // SpeedFace-V5L / push mode — device uploads automatically at TransTimes.
      // TransTables=User Transaction instructs it to push enrolled users + attendance.
      const lines = [
        `ServerVersion=2.4.1`,
        `ServerName=ADMS`,
        `PushVersion=2.6.1`,
        `ATTLOGStamp=${attlogStamp}`,
        `OPERLOGStamp=9999999999`,
        `ATTPHOTOStamp=0`,
        `ErrorDelay=30`,
        `RequestDelay=10`,
        `TransTimes=${transTimes}`,
        `TransInterval=1`,
        `TransTables=User Transaction`,
        `Realtime=1`,
        `TimeoutSec=30`,
        `Encrypt=None`,
        ``,
      ];
      return res.type("text/plain").send(lines.join(NEW_LINE));
    }

    // x2008 / legacy mode — "GET OPTION FROM:" registration response.
    // The device does NOT self-initiate ATTLOG upload; it waits for a
    // "DATA UPDATE ATTLOG Stamp=X" command delivered via /getrequest.
    const x2008Lines = [
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=${attlogStamp}`,
      `OPERLOGStamp=9999999999`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=${transTimes}`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog OpLog EnrollFP`,
      `Realtime=1`,
      `Encrypt=0`,
      ``,
    ];
    // Sync clock then trigger ATTLOG upload on the device's next /getrequest poll.
    const deviceTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    await enqueueDeviceCommand(device.id, `SET TIME ${deviceTime}`);
    await enqueueDeviceCommand(device.id, `DATA UPDATE ATTLOG Stamp=${attlogStamp}`);
    return res.type("text/plain").send(x2008Lines.join(NEW_LINE));
  });

  // The actual data push. Body is tab-separated lines; we got a `text`
  // body parser mounted under /iclock so `req.body` is always a string.
  app.post(["/iclock/cdata", "/iclock/cdata.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || "").toUpperCase();
    const stamp = String(req.query.Stamp || req.query.stamp || "0");
    const ip = clientIp(req);

    // Same no-SN firmware probe fallback as GET /iclock/cdata.
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) {
        device = all[0];
        sn = device.deviceSerial || "";
        console.warn(`[ADMS] POST cdata no-SN from ${ip} table=${table} — matched sole device SN=${sn}`);
      }
    }

    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");
    if (!device) {
      console.warn(`[ADMS] POST cdata from UNKNOWN SN=${sn} ip=${ip} table=${table}`);
      // 200 OK + no-op so the device clears its queue rather than retrying
      // forever. The push is logged; the operator can register the device.
      return res.type("text/plain").send("OK");
    }

    const authErr = authenticateDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT POST cdata SN=${sn} ip=${ip} table=${table} reason="${authErr}"`);
      // 401 makes the spoofer's request fail loudly while the real device
      // (which matches token/CIDR) keeps working unaffected.
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    const body = typeof req.body === "string" ? req.body : "";
    // ackStamp is the stamp value we will send back in the OK: response.
    // For ATTLOG this advances to the highest timestamp we processed; for
    // other tables we echo the incoming stamp.
    let ackStamp: number | string = stamp;

    if (table === "ATTLOG") {
      const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
      if (ADMS_DEBUG) {
        const bodyPreview = body.slice(0, 400).replace(/\r?\n/g, " | ");
        console.log(`[ADMS] POST ATTLOG SN=${sn} Stamp=${stamp} lines=${lineCount} preview="${bodyPreview}"`);
        admsLog("IN", sn, `ATTLOG Stamp=${stamp} lines=${lineCount} body="${bodyPreview.slice(0, 150)}"`);
      } else {
        console.log(`[ADMS] POST ATTLOG SN=${sn} ip=${ip} Stamp=${stamp} lines=${lineCount}`);
      }
      const r = await processAttlog(device, body);
      // Advance the stamp to the highest timestamp in this batch. If no valid
      // timestamps were parsed (r.maxStamp === 0) keep the stored value so we
      // never regress — the device will re-push the same batch next cycle and
      // our upsert will handle dedup safely.
      const storedStamp = device.lastAttlogStamp ?? 0;
      const newStamp = r.maxStamp > storedStamp ? r.maxStamp : storedStamp;
      ackStamp = newStamp; // use local value — no extra DB read needed
      await touchDevice(device.id, ip, {
        addToTotal: r.inserted,
        lastAttlogStamp: newStamp > 0 ? newStamp : undefined,
      });
      await storage.updateBiometricDevice(device.id, { lastSync: new Date().toISOString() } as any);
      _invalidateDevice(device.id);
      if (ADMS_DEBUG) console.log(
        `[ADMS] POST ATTLOG SN=${sn} ip=${ip} inserted=${r.inserted} dups=${r.duplicates} unmapped=${r.unmapped} bad=${r.bad} ackStamp=${ackStamp}`,
      );
    } else if (table === "OPERLOG" || table === "USERINFO" || table === "USER") {
      // OPERLOG carries USER enrollments mixed with other op events; USERINFO
      // and USER are user-only pushes. We persist USER rows so the View Users
      // dialog can show every enrolled employee, not just those who've punched.
      const r = await processUserRecords(device, body);
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST ${table} SN=${sn} ip=${ip} users_upserted=${r.upserted} bad=${r.bad}`);
    } else if (table === "TABLEDATA") {
      // SpeedFace-V5L pushes enrolled-user records as:
      //   POST /iclock/cdata?table=tabledata&tablename=user&count=N
      // where the body is tab-separated key=value pairs per line.
      const tableName = String(req.query.tablename || req.query.tableName || "").toLowerCase();
      if (tableName === "user") {
        const r = await processUserRecords(device, body);
        await touchDevice(device.id, ip);
        if (ADMS_DEBUG) console.log(`[ADMS] POST TABLEDATA/user SN=${sn} ip=${ip} users_upserted=${r.upserted} bad=${r.bad}`);
      } else {
        await touchDevice(device.id, ip);
        if (ADMS_DEBUG) console.log(`[ADMS] POST TABLEDATA/${tableName} SN=${sn} ip=${ip} bytes=${body.length} — ack`);
      }
    } else if (table === "BIODATA" || table === "BIOPHOTO") {
      // SpeedFace-V5L uploads face templates (BIODATA) and face photos (BIOPHOTO).
      // We acknowledge without storing the biometric blob — storing raw face
      // templates is out of scope and requires careful data-protection controls.
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST ${table} SN=${sn} ip=${ip} bytes=${body.length} — face data ack`);
    } else {
      // FINGERTMP / ATTPHOTO / unknown — acknowledge so the device clears its queue.
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST ${table} SN=${sn} ip=${ip} bytes=${body.length} — ack`);
    }

    // ATTLOG ack: the device interprets "OK: N" as "server has records up to
    // timestamp N — don't re-send those next cycle." We use the highest epoch
    // timestamp we just computed locally rather than doing another DB fetch.
    res.type("text/plain").send(`OK: ${ackStamp}`);
  });

  // Device polling for queued commands.
  // IMPORTANT: x2008 firmware polls /iclock/getrequest.aspx (with .aspx).
  // Both variants must be handled or commands are never delivered.
  app.get(["/iclock/getrequest", "/iclock/getrequest.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);

    // No-SN firmware probe: resolve sole registered device so commands are delivered.
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) {
        device = all[0];
        sn = device.deviceSerial || "";
      }
    }

    if (device) {
      const authErr = authenticateDevice(req, device, ip);
      if (authErr) {
        console.warn(`[ADMS] REJECT GET getrequest SN=${sn} ip=${ip} reason="${authErr}"`);
        return res.status(401).type("text/plain").send("ERROR: unauthorized");
      }
      await touchDevice(device.id, ip);

      const cmds = await drainCommands(device.id);
      if (cmds.length > 0) {
        // Command IDs must be small sequential integers — x2008 firmware
        // silently ignores commands with large IDs (e.g. Date.now()).
        const lines = cmds.map((c) => `C:${nextCmdId++}:${c}`);
        // Wrap around to avoid ever sending very large IDs
        if (nextCmdId > 9999) nextCmdId = 1;
        const cmdStr = cmds.join(" | ");
        if (ADMS_DEBUG) console.log(`[ADMS] DELIVER cmds=${cmds.length} SN=${sn}: ${cmdStr}`);
        admsLog("OUT", sn, `CMDS: ${cmdStr}`);
        return res.type("text/plain").send(lines.join(NEW_LINE));
      }
    }
    res.type("text/plain").send("OK");
  });

  // Device reports back result of a command we sent.
  // IMPORTANT: x2008 firmware uses /iclock/devicecmd.aspx (with .aspx).
  app.post(["/iclock/devicecmd", "/iclock/devicecmd.aspx"], async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const ip = clientIp(req);
    const body = typeof req.body === "string" ? req.body : "";
    if (sn) {
      const device = await findDeviceBySerial(sn);
      if (device) {
        const authErr = authenticateDevice(req, device, ip);
        if (authErr) {
          console.warn(`[ADMS] REJECT POST devicecmd SN=${sn} ip=${ip} reason="${authErr}"`);
          return res.status(401).type("text/plain").send("ERROR: unauthorized");
        }
        await touchDevice(device.id, ip);
        // Log the device's command result so we can see if commands execute
        if (body) {
          if (ADMS_DEBUG) console.log(`[ADMS] devicecmd result SN=${sn}: ${body.slice(0, 200)}`);
          admsLog("IN", sn, `devicecmd: ${body.slice(0, 200)}`);
        }
      }
    }
    res.type("text/plain").send("OK");
  });

  // SpeedFace-V5L sends GET /iclock/test as a mandatory connectivity probe
  // BEFORE it will start pushing attendance data. The protocol requires the
  // literal response body "Test" — any other body causes the device to abort.
  app.get(["/iclock/test", "/iclock/ping"], (req: Request, res: Response) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    if (ADMS_DEBUG) console.log(`[ADMS] connectivity probe SN=${sn} path=${req.path}`);
    res.type("text/plain").send("Test");
  });

  // ---------------------------------------------------------------------------
  // Bare-path aliases (no /iclock prefix).
  // ZKTeco x2008 firmware 2.4.x configures the ADMS server URL as just
  // "http://HOST:8181" and appends paths like /cdata, /getrequest, /devicecmd
  // directly — without the /iclock segment. These aliases reuse the same
  // handler arrays so both URL patterns work identically.
  // ---------------------------------------------------------------------------

  // Raw logger for bare paths (mirrors the /iclock middleware above).
  // Always logs the full URL (with query string) and client IP so we can
  // distinguish real device requests (has SN=...) from browser tests.
  app.use(["/cdata", "/getrequest", "/devicecmd", "/ping", "/test"], (req, _res, next) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const ip = clientIp(req);
    const method = req.method;
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const fullUrl = req.path + (qs ? `?${qs}` : "");
    const bodyPreview = typeof req.body === "string" && req.body.length > 0
      ? ` BODY[${req.body.length}bytes]: ${req.body.slice(0, 400).replace(/\t/g, "·").replace(/\r?\n/g, " | ")}` : "";
    const entry = `${method} ${fullUrl}${bodyPreview} (ip:${ip})`;
    if (ADMS_DEBUG) console.log(`[ADMS-RAW-BARE] SN=${sn} ${entry}`);
    admsLog("IN", sn, `(bare) ${entry}`);
    next();
  });

  // GET /cdata → handshake.  Supports BOTH protocols:
  //   • x2008 / legacy firmware: no "pushver" in query → "GET OPTION FROM:" format
  //     The device does NOT self-initiate ATTLOG upload; it waits for a
  //     "DATA UPDATE ATTLOG Stamp=X" command delivered via /getrequest.
  //     We queue that command here so it is ready on the next poll.
  //   • SpeedFace-V5L / newer push firmware: "pushver" present → "ServerVersion=" format
  //     Device uploads automatically at TransTimes intervals; no extra command needed.
  app.get(["/cdata", "/cdata.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) {
        device = all[0];
        sn = device.deviceSerial || "";
        console.warn(`[ADMS] No-SN bare GET /cdata from ${ip} — matched sole device SN=${sn}`);
        admsLog("IN", sn, `(bare) GET /cdata — no SN in query, auto-matched sole device (ip:${ip})`);
      }
    }
    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");
    if (!device) {
      admsLog("IN", "?", `(bare) GET /cdata — unrecognised device (ip:${ip})`);
      return res.type("text/plain").send("OK");
    }
    const authErr = authenticateDevice(req, device, ip);
    if (authErr) {
      admsLog("IN", sn, `(bare) GET /cdata — auth rejected: ${authErr} (ip:${ip})`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    const isSpeedFace = !!(req.query.pushver || req.query.PushVersion);
    await touchDevice(device.id, ip, { firmwareVersion: String(req.query.pushver || "") || undefined });
    const attlogStamp = device.lastAttlogStamp ?? 0;

    if (ADMS_DEBUG) console.log(`[ADMS] GET /cdata (bare) SN=${sn} ip=${ip} protocol=${isSpeedFace ? "SpeedFace" : "x2008"} ATTLOGStamp=${attlogStamp}`);
    admsLog("OUT", sn, `(bare) → 200 registration protocol=${isSpeedFace ? "SpeedFace" : "x2008"} ATTLOGStamp=${attlogStamp}`);

    if (isSpeedFace) {
      // SpeedFace-V5L / push mode — device uploads automatically at TransTimes
      const lines = [
        `ServerVersion=2.4.1`,
        `ServerName=ADMS`,
        `PushVersion=2.6.1`,
        `ATTLOGStamp=${attlogStamp}`,
        `OPERLOGStamp=9999999999`,
        `ATTPHOTOStamp=0`,
        `ErrorDelay=30`,
        `RequestDelay=10`,
        `TransTimes=${buildTransTimes()}`,
        `TransInterval=1`,
        `TransTables=User Transaction`,
        `Realtime=1`,
        `TimeoutSec=30`,
        `Encrypt=None`,
        ``,
      ];
      return res.type("text/plain").send(lines.join(NEW_LINE));
    }

    // x2008 / legacy mode — send "GET OPTION FROM:" registration response
    // then queue DATA UPDATE ATTLOG command for delivery via /getrequest
    const x2008Lines = [
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=${attlogStamp}`,
      `OPERLOGStamp=9999999999`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=${buildTransTimes()}`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog OpLog EnrollFP`,
      `Realtime=1`,
      `Encrypt=0`,
      ``,
    ];
    // Queue commands delivered on the device's next /getrequest poll (seconds away).
    // 1. Sync the device clock to server time — format must be "YYYY-MM-DD HH:MM:SS",
    //    ZKTeco firmware does not accept the ISO 'T' separator or trailing 'Z'.
    const deviceTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    await enqueueDeviceCommand(device.id, `SET TIME ${deviceTime}`);
    // 2. Trigger ATTLOG upload (x2008 never self-initiates without this command).
    await enqueueDeviceCommand(device.id, `DATA UPDATE ATTLOG Stamp=${attlogStamp}`);
    return res.type("text/plain").send(x2008Lines.join(NEW_LINE));
  });

  // POST /cdata → same as POST /iclock/cdata (attendance + user data push)
  app.post(["/cdata", "/cdata.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || "").toUpperCase();
    const stamp = String(req.query.Stamp || req.query.stamp || "0");
    const ip = clientIp(req);
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) {
        device = all[0];
        sn = device.deviceSerial || "";
        console.warn(`[ADMS] POST bare /cdata no-SN from ${ip} table=${table} — matched sole device SN=${sn}`);
      }
    }
    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");
    if (!device) return res.type("text/plain").send("OK");
    const authErr = authenticateDevice(req, device, ip);
    if (authErr) return res.status(401).type("text/plain").send("ERROR: unauthorized");
    const body = typeof req.body === "string" ? req.body : "";
    let ackStamp: number | string = stamp;

    if (table === "ATTLOG") {
      const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
      if (ADMS_DEBUG) {
        const bodyPreview = body.slice(0, 400).replace(/\r?\n/g, " | ");
        console.log(`[ADMS] POST bare ATTLOG SN=${sn} Stamp=${stamp} lines=${lineCount} preview="${bodyPreview}"`);
        admsLog("IN", sn, `ATTLOG(bare) Stamp=${stamp} lines=${lineCount} body="${bodyPreview.slice(0, 150)}"`);
      } else {
        console.log(`[ADMS] POST bare ATTLOG SN=${sn} ip=${ip} Stamp=${stamp} lines=${lineCount}`);
      }
      const r = await processAttlog(device, body);
      const storedStamp = device.lastAttlogStamp ?? 0;
      const newStamp = r.maxStamp > storedStamp ? r.maxStamp : storedStamp;
      ackStamp = newStamp;
      await touchDevice(device.id, ip, {
        addToTotal: r.inserted,
        lastAttlogStamp: newStamp > 0 ? newStamp : undefined,
      });
      await storage.updateBiometricDevice(device.id, { lastSync: new Date().toISOString() } as any);
      _invalidateDevice(device.id);
      if (ADMS_DEBUG) console.log(`[ADMS] POST bare ATTLOG SN=${sn} inserted=${r.inserted} dups=${r.duplicates} ackStamp=${ackStamp}`);
    } else if (table === "OPERLOG" || table === "USERINFO" || table === "USER") {
      const r = await processUserRecords(device, body);
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST bare ${table} SN=${sn} ip=${ip} users_upserted=${r.upserted} bad=${r.bad}`);
    } else if (table === "TABLEDATA") {
      const tableName = String(req.query.tablename || req.query.tableName || "").toLowerCase();
      if (tableName === "user") {
        const r = await processUserRecords(device, body);
        await touchDevice(device.id, ip);
        if (ADMS_DEBUG) console.log(`[ADMS] POST bare TABLEDATA/user SN=${sn} ip=${ip} users_upserted=${r.upserted} bad=${r.bad}`);
      } else {
        await touchDevice(device.id, ip);
        if (ADMS_DEBUG) console.log(`[ADMS] POST bare TABLEDATA/${tableName} SN=${sn} ip=${ip} bytes=${body.length} — ack`);
      }
    } else if (table === "BIODATA" || table === "BIOPHOTO") {
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST bare ${table} SN=${sn} ip=${ip} bytes=${body.length} — face data ack`);
    } else {
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST bare ${table} SN=${sn} ip=${ip} bytes=${body.length} — ack`);
    }
    res.type("text/plain").send(`OK: ${ackStamp}`);
  });

  // GET /getrequest → same as GET /iclock/getrequest (command polling)
  app.get(["/getrequest", "/getrequest.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) { device = all[0]; sn = device.deviceSerial || ""; }
    }
    if (device) {
      const authErr = authenticateDevice(req, device, ip);
      if (authErr) return res.status(401).type("text/plain").send("ERROR: unauthorized");
      await touchDevice(device.id, ip);
      const cmds = await drainCommands(device.id);
      if (cmds.length > 0) {
        const lines = cmds.map((c) => `C:${nextCmdId++}:${c}`);
        if (nextCmdId > 9999) nextCmdId = 1;
        const cmdStr = cmds.join(" | ");
        if (ADMS_DEBUG) console.log(`[ADMS] DELIVER cmds=${cmds.length} SN=${sn} (bare): ${cmdStr}`);
        admsLog("OUT", sn, `CMDS(bare): ${cmdStr}`);
        return res.type("text/plain").send(lines.join(NEW_LINE));
      }
    }
    res.type("text/plain").send("OK");
  });

  // POST /devicecmd → same as POST /iclock/devicecmd (command result)
  app.post(["/devicecmd", "/devicecmd.aspx"], async (req: Request, res: Response) => {
    let sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);
    const body = typeof req.body === "string" ? req.body : "";
    let device = sn ? await findDeviceBySerial(sn) : undefined;
    if (!device && !sn) {
      const all = await storage.getAllBiometricDevices();
      if (all.length === 1) { device = all[0]; sn = device.deviceSerial || ""; }
    }
    if (device) {
      const authErr = authenticateDevice(req, device, ip);
      if (authErr) return res.status(401).type("text/plain").send("ERROR: unauthorized");
      await touchDevice(device.id, ip);
      if (body) {
        if (ADMS_DEBUG) console.log(`[ADMS] devicecmd(bare) result SN=${sn}: ${body.slice(0, 200)}`);
        admsLog("IN", sn, `devicecmd(bare): ${body.slice(0, 200)}`);
      }
    }
    res.type("text/plain").send("OK");
  });

  app.get(["/test", "/ping"], (req: Request, res: Response) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    if (ADMS_DEBUG) console.log(`[ADMS] connectivity probe (bare) SN=${sn} path=${req.path}`);
    res.type("text/plain").send("Test");
  });

  // Health check — human-readable endpoint to verify the ADMS server is up
  // and see its current clock (useful for diagnosing SET TIME drift).
  // Covers both /health and /iclock/health.
  app.get(["/health", "/iclock/health"], (_req: Request, res: Response) => {
    res.json({ status: "ok", time: new Date() });
  });
}

// ---------------------------------------------------------------------------
// Dedicated HTTP server on port 8181 for ZKTeco ADMS push protocol.
// ZKTeco devices default to port 8181, so this lets them work without any
// port reconfiguration. The /iclock/* routes are also registered on the main
// app (port 5000) for reverse-proxy setups that forward all traffic to one port.
// ---------------------------------------------------------------------------
const ADMS_PORT = parseInt(process.env.ADMS_PORT || "8181", 10);

function buildAdmsApp() {
  const admsApp = express();
  // ZKTeco devices often send POST bodies with no Content-Type header at all.
  // type: () => true unconditionally parses every request body as plain text,
  // which is more reliable than the "*/*" wildcard (which may skip headerless requests).
  admsApp.use(express.text({ type: () => true, limit: "5mb" }));
  // Hard timeout per request — prevents stalled device connections from holding
  // the socket open indefinitely. 25 s is well above the longest expected ATTLOG
  // upload while still freeing the slot if the device goes silent mid-transfer.
  admsApp.use((req, res, next) => {
    res.setTimeout(25000, () => {
      console.error(`[ADMS] Request timeout ${req.method} ${req.url}`);
    });
    next();
  });
  // Rate-limit: max 50 requests/second per IP.
  // Protects against rogue devices, scanners, or firmware loops flooding the port.
  // Legitimate ZKTeco devices poll at most every few seconds, well under this limit.
  // Applied globally — every path on this server is device traffic (/iclock/* and bare).
  admsApp.use(rateLimit({
    windowMs: 1000,
    max: 50,
    standardHeaders: false,
    legacyHeaders: false,
    message: "Too many requests",
  }));
  // Trust one proxy hop so req.ip is correct when the device pushes via NAT.
  admsApp.set("trust proxy", 1);
  // Mount all ZKTeco ADMS endpoints.
  registerAdmsRoutes(admsApp);
  // Catch-all: log any unrecognized path so we can diagnose firmware quirks,
  // then return a plain OK so the device doesn't stall on unexpected paths.
  admsApp.use((req, res) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const ip = clientIp(req);
    console.warn(`[ADMS-UNKNOWN] SN=${sn} ip=${ip} ${req.method} ${req.url}`);
    admsLog("IN", sn, `UNKNOWN ${req.method} ${req.url} (ip:${ip})`);
    res.type("text/plain").send("OK");
  });
  return admsApp;
}

/**
 * Try to bind the ADMS server to ADMS_PORT.
 * If port is already in use (e.g. rolling restart), retry up to maxRetries times
 * with a short delay so the old process has time to release the socket.
 */
// ── ADMS server status (module-level, readable via API) ──────────────────────
let admsServerState: {
  running: boolean;
  port: number;
  boundAt: string | null;
  error: string | null;
} = { running: false, port: ADMS_PORT, boundAt: null, error: null };

export function getAdmsServerStatus() {
  return { ...admsServerState };
}

export function startAdmsServer(maxRetries = 6, retryDelayMs = 5000) {
  const server = createServer(buildAdmsApp());

  let attempt = 0;

  function tryListen() {
    attempt++;
    server.listen({ port: ADMS_PORT, host: "0.0.0.0" });
  }

  server.on("listening", () => {
    console.log(`[ADMS] Dedicated ADMS server listening on port ${ADMS_PORT}`);
    console.log(`[ADMS] ZKTeco devices should push to http://<server-ip>:${ADMS_PORT}/iclock/cdata`);
    admsServerState = { running: true, port: ADMS_PORT, boundAt: new Date().toISOString(), error: null };
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (attempt < maxRetries) {
        console.warn(
          `[ADMS] Port ${ADMS_PORT} in use (attempt ${attempt}/${maxRetries}) — ` +
          `retrying in ${retryDelayMs / 1000}s…`
        );
        admsServerState = { running: false, port: ADMS_PORT, boundAt: null, error: `port ${ADMS_PORT} in use (retry ${attempt}/${maxRetries})` };
        server.close(() => {
          setTimeout(tryListen, retryDelayMs);
        });
      } else {
        const msg = `Port ${ADMS_PORT} still in use after ${maxRetries} attempts. Check for other processes on this port.`;
        console.error(`[ADMS] ${msg}`);
        admsServerState = { running: false, port: ADMS_PORT, boundAt: null, error: msg };
      }
    } else {
      console.error("[ADMS] Server error:", err);
      admsServerState = { running: false, port: ADMS_PORT, boundAt: null, error: err.message };
    }
  });

  tryListen();
  return server;
}
