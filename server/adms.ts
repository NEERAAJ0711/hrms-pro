/**
 * ZKTeco ADMS (Attendance Data Management System) — Cloud Push Protocol Handler
 *
 * The device connects TO us (server-initiated connection is not needed).
 * All endpoints run on a dedicated Express app bound to ADMS_PORT (default 8181).
 *
 * ── Protocol flow for x2008 (no pushver param) ──────────────────────────────
 *  1. GET  /iclock/cdata?SN=<serial>
 *       → server responds with "GET OPTION FROM: <SN>" config block
 *       → server queues SET TIME + DATA UPDATE ATTLOG commands
 *
 *  2. GET  /iclock/getrequest?SN=<serial>
 *       → device polls every Delay seconds for pending commands
 *       → server ALWAYS responds with DATA UPDATE ATTLOG Stamp=<n>
 *         (plus any other queued commands such as SET TIME)
 *
 *  3. POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<n>
 *       → device uploads attendance records (tab-separated lines)
 *       → server inserts into biometric_punch_logs, responds "OK: <stamp>"
 *
 *  4. POST /iclock/devicecmd?SN=<serial>
 *       → device reports command execution result
 *       → server responds "OK"
 *
 * ── Protocol flow for SpeedFace-V5L / newer (pushver param present) ─────────
 *  1. GET  /iclock/cdata?SN=<serial>&pushver=<ver>
 *       → server responds with "ServerVersion=..." block
 *       → device self-uploads at TransTimes intervals without explicit commands
 *
 * ── Path aliasing ─────────────────────────────────────────────────────────────
 *  Bare paths (/cdata, /getrequest, /devicecmd) are aliased to the same handlers
 *  so devices configured with just "http://HOST:8181" work without /iclock prefix.
 */

import express from "express";
import type { Express, Request, Response } from "express";
import { createServer } from "http";
import { randomUUID, timingSafeEqual } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { biometricPunchLogs } from "../shared/schema";
import rateLimit from "express-rate-limit";

// ─── Constants ────────────────────────────────────────────────────────────────

const CRLF = "\r\n";
const ADMS_PORT = parseInt(process.env.ADMS_PORT || "8181", 10);

// Logging is always on — biometric systems need full audit visibility.
const LOG = true;

// ─── In-memory device cache (30 s TTL) ───────────────────────────────────────

const _cache = new Map<string, { device: any; ts: number }>();
const CACHE_TTL_MS = 30_000;

function cacheSet(key: string, device: any): void {
  _cache.set(key, { device, ts: Date.now() });
}

function cacheGet(key: string): any | null {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.device;
  return null;
}

function cacheDel(deviceId: string): void {
  for (const [k, v] of Array.from(_cache.entries())) {
    if (v.device?.id === deviceId) _cache.delete(k);
  }
}

// ─── Device resolution ───────────────────────────────────────────────────────

/**
 * Resolve a ZKTeco device by its reported serial number (SN).
 *
 * Resolution order:
 *   1. Cache hit (30 s TTL)
 *   2. Exact DB match (case-sensitive)
 *   3. Case-insensitive DB match
 *   4. Sole-device fallback — if only ONE device is registered, use it
 *      regardless of SN and auto-update the DB serial to the real value.
 *      This handles first-boot, placeholder serials, and SN mismatches on
 *      single-device deployments without requiring manual correction.
 */
async function resolveDevice(sn: string): Promise<any | null> {
  const cached = cacheGet(sn);
  if (cached) return cached;

  const all = await storage.getAllBiometricDevices();
  if (!all.length) return null;

  // Exact match
  const exact = all.find((d) => d.deviceSerial === sn);
  if (exact) { cacheSet(sn, exact); return exact; }

  // Case-insensitive match
  const upper = sn.toUpperCase();
  const ci = all.find((d) => (d.deviceSerial || "").toUpperCase() === upper);
  if (ci) { cacheSet(sn, ci); return ci; }

  // Sole-device fallback
  if (all.length === 1) {
    const sole = all[0];
    if (sn && sn !== sole.deviceSerial) {
      console.warn(
        `[ADMS] SN mismatch: device="${sn}" db="${sole.deviceSerial}" — ` +
        `auto-correcting DB serial to match the real device.`
      );
      try {
        await storage.updateBiometricDevice(sole.id, { deviceSerial: sn } as any);
        cacheDel(sole.id);
        const updated = { ...sole, deviceSerial: sn };
        cacheSet(sn, updated);
        return updated;
      } catch {
        // Update failed — still serve the device so data is not lost.
      }
    }
    cacheSet(sn, sole);
    return sole;
  }

  return null;
}

// ─── Command queue ────────────────────────────────────────────────────────────

/**
 * In-memory pending command queue: deviceId → string[]
 * Also persisted to biometric_devices.pending_commands (JSONB) so commands
 * survive server restarts.
 */
const pendingCmds = new Map<string, string[]>();
let nextCmdId = 1;
const MAX_QUEUE = 8;

/** Add a command to the device's pending queue (idempotent, max 8 slots). */
export async function enqueueDeviceCommand(deviceId: string, cmd: string): Promise<void> {
  const list = pendingCmds.get(deviceId) || [];
  if (list.includes(cmd)) return;
  if (list.length >= MAX_QUEUE) {
    console.warn(`[ADMS] Queue full for device=${deviceId}, dropping: ${cmd}`);
    return;
  }
  list.push(cmd);
  pendingCmds.set(deviceId, list);

  // Persist to DB (best-effort — survives server restart)
  try {
    await db.execute(sql`
      UPDATE biometric_devices
      SET pending_commands = (
        CASE
          WHEN jsonb_array_length(COALESCE(pending_commands,'[]'::jsonb)) >= ${MAX_QUEUE}
            OR COALESCE(pending_commands,'[]'::jsonb) @> jsonb_build_array(${cmd}::text)
          THEN COALESCE(pending_commands,'[]'::jsonb)
          ELSE COALESCE(pending_commands,'[]'::jsonb) || jsonb_build_array(${cmd}::text)
        END
      )
      WHERE id = ${deviceId}
    `);
  } catch { /* best-effort */ }
}

/**
 * Drain all queued commands for a device from both in-memory map and DB,
 * returning the deduplicated list. Called by /getrequest.
 */
async function drainCommands(deviceId: string): Promise<string[]> {
  const mem = pendingCmds.get(deviceId) || [];
  pendingCmds.delete(deviceId);

  try {
    const r = await db.execute(sql`
      WITH snap AS (
        SELECT COALESCE(pending_commands,'[]'::jsonb) AS cmds
        FROM biometric_devices WHERE id = ${deviceId}
      ),
      clr AS (
        UPDATE biometric_devices
        SET pending_commands = '[]'::jsonb
        WHERE id = ${deviceId}
      )
      SELECT cmds FROM snap
    `);
    const dbCmds: string[] = (r.rows[0] as any)?.cmds ?? [];
    const seen = new Set<string>();
    return [...dbCmds, ...mem].filter((c) => !seen.has(c) && seen.add(c));
  } catch {
    return mem;
  }
}

// ─── Device touch ─────────────────────────────────────────────────────────────

/** Update last-seen metadata on the device record. */
async function touchDevice(
  deviceId: string,
  ip: string,
  extras: { fw?: string; stamp?: number; addTotal?: number } = {}
): Promise<void> {
  const upd: any = {
    status: "online",
    lastPushAt: new Date().toISOString(),
    lastPushIp: ip,
  };
  if (extras.fw) upd.firmwareVersion = extras.fw;
  if (extras.stamp != null) upd.lastAttlogStamp = extras.stamp;

  await storage.updateBiometricDevice(deviceId, upd);

  if (extras.addTotal) {
    const fresh = await storage.getBiometricDevice(deviceId);
    if (fresh) {
      await storage.updateBiometricDevice(deviceId, {
        pushTotal: (fresh.pushTotal || 0) + extras.addTotal,
      } as any);
    }
  }

  cacheDel(deviceId);
}

// ─── Helpers: parsing ─────────────────────────────────────────────────────────

function decodePunchType(raw: string): string {
  switch ((raw || "").trim()) {
    case "0":  return "in";
    case "1":  return "out";
    case "2":  return "break-out";
    case "3":  return "break-in";
    case "4":  return "overtime-in";
    case "5":  return "overtime-out";
    default:   return "unknown";
  }
}

/**
 * Parse a ZKTeco ATTLOG timestamp.
 * The x2008 stores times in the device's local timezone (assumed IST = UTC+05:30
 * unless an explicit offset is already present).
 */
function parseTimestamp(ts: string): { date: string; time: string; epoch: number } | null {
  const m = (ts || "").trim().match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return null;
  const secs = m[4] ?? "00";
  const isoStr = `${m[1]}T${m[2]}:${m[3]}:${secs}+05:30`;
  const epoch = Math.floor(new Date(isoStr).getTime() / 1000);
  return { date: m[1], time: `${m[2]}:${m[3]}`, epoch: isNaN(epoch) ? 0 : epoch };
}

/**
 * Parse a USERINFO / OPLOG USER line into a key=value map.
 * Handles both tab-delimited and space-delimited key=value pairs.
 * Returns null if no PIN field is found.
 */
function parseUserLine(line: string): Record<string, string> | null {
  const s = (line || "").trim().replace(/^(?:OPLOG\s+)?USER\s+/i, "");
  if (!s) return null;

  const out: Record<string, string> = {};

  // Primary: tab-delimited  (PIN=X\tName=Y\tPri=Z…)
  if (s.includes("\t")) {
    for (const part of s.split(/\t+/)) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  } else {
    // Fallback: space-delimited  (PIN=X Name=Y Pri=Z…)
    // Use a greedy key=value regex so values can include spaces until the next key
    const pairs = s.matchAll(/([A-Za-z]\w*)\s*=\s*((?:(?![A-Za-z]\w*\s*=).)*)/g);
    for (const m of pairs) {
      out[m[1].trim()] = m[2].trim();
    }
  }

  if (!(out.PIN || out.Pin || out.pin)) return null;
  return out;
}

// ─── ATTLOG processor ─────────────────────────────────────────────────────────

export async function processAttlog(
  device: any,
  body: string
): Promise<{ inserted: number; duplicates: number; bad: number; unmapped: number; maxStamp: number }> {
  const out = { inserted: 0, duplicates: 0, bad: 0, unmapped: 0, maxStamp: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // Resolve company — fall back to the first registered company
  let companyId: string | null = device.companyId ?? null;
  if (!companyId) {
    const all = await storage.getAllCompanies();
    companyId = all?.[0]?.id ?? null;
  }
  if (!companyId) {
    console.error("[ADMS] processAttlog: no company found — cannot store punch logs");
    out.bad = lines.length;
    return out;
  }

  // Build PIN → employee map
  const employees = device.companyId
    ? await storage.getEmployeesByCompany(device.companyId)
    : await storage.getAllEmployees();
  const byPin = new Map(
    employees.filter((e) => e.biometricDeviceId).map((e) => [String(e.biometricDeviceId), e])
  );

  const now = new Date().toISOString();
  const rows: any[] = [];

  for (const line of lines) {
    // Standard format:  PIN\tYYYY-MM-DD HH:MM:SS\tstatus\tverify...
    // Extended format:  PIN\tName\tYYYY-MM-DD HH:MM:SS\tstatus...
    let pin = "", ts = "", status = "0";
    const parts = line.split("\t");

    if (parts.length >= 2) {
      pin = parts[0].trim();
      const field1IsDate = /^\d{4}[-/]\d{2}[-/]\d{2}/.test(parts[1].trim());
      if (field1IsDate) {
        ts     = parts[1].trim();
        status = (parts[2] ?? "0").trim();
      } else {
        ts     = (parts[2] ?? "").trim();
        status = (parts[3] ?? "0").trim();
      }
    } else {
      // Space-separated fallback
      const m = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(\d+)/);
      if (!m) { out.bad++; continue; }
      pin = m[1]; ts = `${m[2]} ${m[3]}`; status = m[4];
    }

    if (!pin) { out.bad++; continue; }
    const parsed = parseTimestamp(ts);
    if (!parsed) {
      console.warn(`[ADMS] ATTLOG bad timestamp pin="${pin}" ts="${ts}"`);
      out.bad++;
      continue;
    }

    if (parsed.epoch > out.maxStamp) out.maxStamp = parsed.epoch;

    const matchedEmployee = byPin.get(String(pin)) ?? null;
    if (!matchedEmployee) out.unmapped++;
    rows.push({
      id:               randomUUID(),
      companyId,
      employeeId:       matchedEmployee?.id ?? null,
      deviceEmployeeId: pin,
      punchTime:        parsed.time,
      punchDate:        parsed.date,
      punchType:        decodePunchType(status),
      deviceId:         device.id,
      isProcessed:      false,
      isDuplicate:      false,
      missingPunch:     false,
      syncedAt:         null,
      createdAt:        now,
    });
  }

  if (!rows.length) return out;

  try {
    const inserted = await db
      .insert(biometricPunchLogs)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: biometricPunchLogs.id });
    out.inserted   = inserted.length;
    out.duplicates = rows.length - inserted.length;
    console.log(
      `[ADMS] ATTLOG device=${device.deviceSerial} ` +
      `inserted=${out.inserted} dups=${out.duplicates} unmapped=${out.unmapped} bad=${out.bad} lines=${lines.length}`
    );
  } catch (err) {
    console.error("[ADMS] ATTLOG bulk insert failed:", err);
    out.bad += rows.length;
  }

  return out;
}

// ─── USERINFO processor ───────────────────────────────────────────────────────

export async function processUserRecords(
  device: any,
  body: string
): Promise<{ upserted: number; bad: number }> {
  const out = { upserted: 0, bad: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const now = new Date().toISOString();

  console.log(`[ADMS] processUserRecords: ${lines.length} total lines from device ${device.deviceSerial}`);

  for (const line of lines) {
    if (!/PIN=/i.test(line)) {
      console.log(`[ADMS]   SKIP (no PIN=): ${line.slice(0, 120)}`);
      continue;
    }
    const rec = parseUserLine(line);
    if (!rec) {
      console.log(`[ADMS]   BAD (parse fail): ${line.slice(0, 120)}`);
      out.bad++;
      continue;
    }
    const pin = String(rec.PIN || rec.Pin || rec.pin || "").trim();
    if (!pin) {
      console.log(`[ADMS]   BAD (empty PIN): ${line.slice(0, 120)}`);
      out.bad++;
      continue;
    }

    const name = (rec.Name || rec.NAME || rec.name || "").trim() || null;
    console.log(`[ADMS]   OK  PIN=${pin} Name=${name ?? "(empty)"}`);

    try {
      await db.execute(sql`
        INSERT INTO biometric_device_users
          (device_id, device_employee_id, name, privilege, card,
           password_set, fingerprint_count, first_seen_at, last_seen_at)
        VALUES (
          ${device.id}, ${pin},
          ${name},
          ${(rec.Pri  || rec.Privilege || "").trim() || null},
          ${(rec.Card || rec.CARD || "").trim() || null},
          ${!!(rec.Passwd || rec.Password || rec.PWD)},
          0, ${now}, ${now}
        )
        ON CONFLICT (device_id, device_employee_id) DO UPDATE
          SET name         = COALESCE(EXCLUDED.name, biometric_device_users.name),
              privilege    = COALESCE(EXCLUDED.privilege, biometric_device_users.privilege),
              card         = COALESCE(EXCLUDED.card, biometric_device_users.card),
              password_set = EXCLUDED.password_set OR biometric_device_users.password_set,
              last_seen_at = EXCLUDED.last_seen_at
      `);
      out.upserted++;
    } catch (err) {
      console.error("[ADMS] upsert user row failed:", err);
      out.bad++;
    }
  }

  console.log(`[ADMS] processUserRecords done: upserted=${out.upserted} bad=${out.bad}`);
  return out;
}

// ─── Activity log ─────────────────────────────────────────────────────────────

/** In-memory ring buffer (500 entries) for live UI updates. */
const activityBuf: Array<{ ts: string; dir: "IN" | "OUT"; sn: string; line: string }> = [];

/**
 * Record an ADMS event.
 * @param persist  If true, also insert into adms_activity_log table in DB
 *                 (survives restarts; done for key events only).
 */
function admsLog(dir: "IN" | "OUT", sn: string, line: string, persist = false): void {
  const ts = new Date().toISOString();
  activityBuf.push({ ts, dir, sn, line });
  if (activityBuf.length > 500) activityBuf.shift();

  if (LOG) console.log(`[ADMS] ${dir} SN="${sn}" ${line}`);

  if (!persist) return;
  db.execute(sql`
    INSERT INTO adms_activity_log (device_sn, direction, message, created_at)
    VALUES (${sn}, ${dir}, ${line}, NOW())
  `).then(async () => {
    // Keep only the newest 500 rows per SN to bound table growth.
    await db.execute(sql`
      DELETE FROM adms_activity_log
      WHERE device_sn = ${sn}
        AND id NOT IN (
          SELECT id FROM adms_activity_log
          WHERE device_sn = ${sn}
          ORDER BY id DESC
          LIMIT 500
        )
    `);
  }).catch(() => { /* best-effort */ });
}

/** Return the in-memory activity log (newest last). */
export function getAdmsActivityLog(): Array<{
  ts: string; direction: string; sn: string; line: string;
}> {
  return activityBuf.map((e) => ({
    ts: e.ts, direction: e.dir, sn: e.sn, line: e.line,
  }));
}

/** Return the most recent 200 entries from the DB (survives restarts). */
export async function getAdmsActivityLogFromDB(): Promise<Array<{
  ts: string; direction: string; sn: string; line: string;
}>> {
  try {
    const rows = await db.execute(sql`
      SELECT device_sn AS sn, direction, message AS line, created_at AS ts
      FROM adms_activity_log
      ORDER BY id DESC
      LIMIT 200
    `);
    return (rows.rows as any[]).map((r) => ({
      ts:        r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      direction: String(r.direction),
      sn:        String(r.sn),
      line:      String(r.line),
    }));
  } catch {
    return getAdmsActivityLog();
  }
}

// ─── IP helpers ───────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  return String(req.ip || req.socket.remoteAddress || "").trim();
}

function normaliseIp(ip: string): string {
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
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

function ipInCidr(rawIp: string, spec: string): boolean {
  const ip = normaliseIp(rawIp || "");
  if (!ip || !spec) return false;
  for (const piece of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (piece.includes("/")) {
      const [base, bstr] = piece.split("/");
      const bits = Number(bstr);
      if (bits === 0) return true;
      if (!Number.isInteger(bits) || bits < 1 || bits > 32) continue;
      const ipInt = ipv4ToInt(ip), baseInt = ipv4ToInt(base);
      if (ipInt == null || baseInt == null) continue;
      const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
      if ((ipInt & mask) === (baseInt & mask)) return true;
    } else {
      if (piece === ip) return true;
    }
  }
  return false;
}

function extractToken(req: Request): string {
  const q = req.query as Record<string, unknown>;
  const fromQ = String(q.token || q.auth || q.Token || "").trim();
  if (fromQ) return fromQ;
  const hdr = String(req.headers["x-device-token"] || "").trim();
  if (hdr) return hdr;
  const auth = String(req.headers.authorization || "").trim();
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : auth;
  }
  return "";
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

/**
 * Validate a device request against its configured token / CIDR allowlist.
 * Returns null on success, or a human-readable reason string on failure.
 * If neither token nor CIDR is configured, all IPs are accepted (open mode).
 */
function authDevice(req: Request, device: any, ip: string): string | null {
  const token = (device.pushToken || "").trim();
  const cidr  = (device.allowedIpCidr || "").trim();
  if (!token && !cidr) return null;                       // open mode
  if (token && safeEq(extractToken(req), token)) return null;
  if (cidr  && ipInCidr(ip, cidr)) return null;
  return token && cidr ? "neither token nor IP matched"
       : token         ? "wrong token"
                       : "IP not in CIDR";
}

// ─── TransTimes (30-minute slots) ────────────────────────────────────────────

/**
 * Build the TransTimes value — 48 half-hour slots covering 24 hours.
 *
 * The x2008 firmware has a small HTTP response buffer (~2 KB total).
 * Using 288 five-minute slots overflows it and causes the device to silently
 * fail and fall back to only fetching /favicon.ico.
 * 48 half-hour slots produce ~285 characters and fit comfortably.
 */
function buildTransTimes(): string {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    slots.push(`${hh}:00`, `${hh}:30`);
  }
  return slots.join(";");
}

// ─── ADMS server status ───────────────────────────────────────────────────────

let admsState = {
  running: false,
  port: ADMS_PORT,
  boundAt: null as string | null,
  error: null as string | null,
};

export function getAdmsServerStatus() {
  return { ...admsState };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /iclock/cdata  — Handshake */
async function handleGetCdata(req: Request, res: Response) {
  const sn = String(req.query.SN || req.query.sn || "").trim();
  const ip = clientIp(req);
  const fw = String(req.query.pushver || req.query.PushVersion || "").trim();

  const device = await resolveDevice(sn);
  if (!device) {
    console.warn(`[ADMS] GET /cdata unrecognised SN="${sn}" ip=${ip}`);
    admsLog("OUT", sn || "?", "no device registered — silent OK");
    return res.type("text/plain").send("OK");
  }

  const effectiveSn = device.deviceSerial || sn;
  const authErr = authDevice(req, device, ip);
  if (authErr) {
    console.warn(`[ADMS] REJECT handshake SN="${effectiveSn}" ip=${ip}: ${authErr}`);
    return res.status(401).type("text/plain").send("ERROR: unauthorized");
  }

  await touchDevice(device.id, ip, { fw: fw || undefined });

  const stamp = device.lastAttlogStamp ?? 0;
  const times = buildTransTimes();
  const isNewFirmware = !!fw;

  console.log(
    `[ADMS] HANDSHAKE SN="${effectiveSn}" ip=${ip} ` +
    `proto=${isNewFirmware ? "SpeedFace/new" : "x2008"} stamp=${stamp}`
  );
  admsLog("OUT", effectiveSn,
    `HANDSHAKE proto=${isNewFirmware ? "SpeedFace" : "x2008"} stamp=${stamp}`, true);

  if (isNewFirmware) {
    // SpeedFace-V5L / newer firmware — responds with ServerVersion block
    const body = [
      "ServerVersion=2.4.1",
      "ServerName=ADMS",
      "PushVersion=2.6.1",
      `ATTLOGStamp=${stamp}`,
      "OPERLOGStamp=9999999999",
      "ATTPHOTOStamp=0",
      "ErrorDelay=30",
      "RequestDelay=10",
      `TransTimes=${times}`,
      "TransInterval=1",
      "TransTables=User Transaction",
      "Realtime=1",
      "TimeoutSec=30",
      "Encrypt=None",
      "",
    ].join(CRLF);
    return res.type("text/plain").send(body);
  }

  // x2008 — compact "GET OPTION FROM:" format
  // IMPORTANT: Keep this small to avoid overflowing x2008's ~2 KB read buffer.
  // TransFlag includes User so the device auto-pushes enrolled user names.
  const body = [
    `GET OPTION FROM: ${effectiveSn}`,
    `ATTLOGStamp=${stamp}`,
    "OPERLOGStamp=9999999999",
    "ATTPHOTOStamp=0",
    "ErrorDelay=30",
    "Delay=30",
    `TransTimes=${times}`,
    "TransInterval=1",
    "TransFlag=TransData AttLog User",
    "Realtime=1",
    "Encrypt=0",
    "",
  ].join(CRLF);

  // Queue SET TIME so the device clock stays accurate
  const devTime = new Date().toISOString().replace("T", " ").substring(0, 19);
  await enqueueDeviceCommand(device.id, `SET TIME ${devTime}`);
  // Queue USERINFO fetch — Stamp=0 forces device to re-upload ALL enrolled users
  await enqueueDeviceCommand(device.id, "DATA UPDATE USERINFO Stamp=0");

  return res.type("text/plain").send(body);
}

/** GET /iclock/getrequest  — Command polling */
async function handleGetRequest(req: Request, res: Response) {
  const sn = String(req.query.SN || req.query.sn || "").trim();
  const ip = clientIp(req);

  const device = await resolveDevice(sn);
  if (!device) {
    if (LOG) console.log(`[ADMS] GET /getrequest unknown SN="${sn}" ip=${ip}`);
    return res.type("text/plain").send("OK");
  }

  const effectiveSn = device.deviceSerial || sn;
  const authErr = authDevice(req, device, ip);
  if (authErr) {
    console.warn(`[ADMS] REJECT getrequest SN="${effectiveSn}" ip=${ip}: ${authErr}`);
    return res.status(401).type("text/plain").send("ERROR: unauthorized");
  }

  await touchDevice(device.id, ip);

  // Drain any explicitly queued commands (e.g. SET TIME queued during handshake)
  const queued = await drainCommands(device.id);

  // ALWAYS include DATA UPDATE ATTLOG so the device pushes its records on every
  // poll cycle. Use the current stamp so only new records are requested (stamp=0
  // on a fresh device means "send everything"). Any stale ATTLOG variant from the
  // queued list is replaced by this authoritative one.
  const stamp = device.lastAttlogStamp ?? 0;
  const attlogCmd = `DATA UPDATE ATTLOG Stamp=${stamp}`;

  const allCmds = [
    ...queued.filter((c) => !c.startsWith("DATA UPDATE ATTLOG")),
    attlogCmd,
  ];

  const responseLines = allCmds.map((cmd) => {
    const id = nextCmdId++;
    if (nextCmdId > 9999) nextCmdId = 1;
    return `C:${id}:${cmd}`;
  });

  const responseBody = responseLines.join(CRLF) + CRLF;

  console.log(
    `[ADMS] GETREQUEST SN="${effectiveSn}" stamp=${stamp} ` +
    `cmds=${allCmds.length}: ${allCmds.join(" | ")}`
  );
  admsLog("OUT", effectiveSn, `CMDS(${allCmds.length}): ${allCmds.join(" | ")}`, true);

  return res.type("text/plain").send(responseBody);
}

/** POST /iclock/cdata  — Data upload (ATTLOG, USERINFO, etc.) */
async function handlePostCdata(req: Request, res: Response) {
  const sn    = String(req.query.SN    || req.query.sn    || "").trim();
  const table = String(req.query.table || "").toUpperCase();
  const stamp = String(req.query.Stamp || req.query.stamp || "0");
  const ip    = clientIp(req);
  const body  = typeof req.body === "string" ? req.body : "";

  const device = await resolveDevice(sn);
  if (!device) {
    console.warn(`[ADMS] POST /cdata unknown SN="${sn}" table=${table} ip=${ip}`);
    admsLog("OUT", sn || "?", `no device — silent OK table=${table}`);
    return res.type("text/plain").send("OK");
  }

  const effectiveSn = device.deviceSerial || sn;
  const authErr = authDevice(req, device, ip);
  if (authErr) {
    console.warn(`[ADMS] REJECT POST /cdata SN="${effectiveSn}" ip=${ip}: ${authErr}`);
    return res.status(401).type("text/plain").send("ERROR: unauthorized");
  }

  let ackStamp: number | string = stamp;

  if (table === "ATTLOG") {
    const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
    console.log(
      `[ADMS] POST ATTLOG SN="${effectiveSn}" ip=${ip} stamp=${stamp} lines=${lineCount}`
    );
    if (LOG && body) {
      console.log(`[ADMS]   preview: ${body.slice(0, 400).replace(/\r?\n/g, " | ")}`);
    }
    admsLog("IN", effectiveSn, `ATTLOG ${lineCount} lines stamp=${stamp}`, true);

    const r = await processAttlog(device, body);
    const stored = device.lastAttlogStamp ?? 0;
    const newStamp = r.maxStamp > stored ? r.maxStamp : stored;
    ackStamp = newStamp || stamp;

    await touchDevice(device.id, ip, {
      addTotal: r.inserted,
      stamp: newStamp > 0 ? newStamp : undefined,
    });
    await storage.updateBiometricDevice(device.id, { lastSync: new Date().toISOString() } as any);
    cacheDel(device.id);

    admsLog("OUT", effectiveSn,
      `ATTLOG ack ins=${r.inserted} dups=${r.duplicates} bad=${r.bad} stamp=${ackStamp}`, true);

  } else if (["OPERLOG", "USERINFO", "USER"].includes(table)) {
    const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
    console.log(`[ADMS] POST ${table} SN="${effectiveSn}" ip=${ip} lines=${lineCount}`);
    if (body) console.log(`[ADMS]   preview: ${body.slice(0, 600).replace(/\r?\n/g, " | ")}`);
    admsLog("IN", effectiveSn, `${table} ${lineCount} lines`, true);
    const r = await processUserRecords(device, body);
    console.log(`[ADMS] ${table} upserted=${r.upserted} bad=${r.bad} SN="${effectiveSn}"`);
    await touchDevice(device.id, ip);
    admsLog("OUT", effectiveSn, `${table} upserted=${r.upserted} bad=${r.bad}`, true);

  } else if (table === "TABLEDATA") {
    const tname = String(req.query.tablename || req.query.tableName || "").toLowerCase();
    if (tname === "user") {
      const r = await processUserRecords(device, body);
      await touchDevice(device.id, ip);
      admsLog("OUT", effectiveSn, `TABLEDATA/user upserted=${r.upserted}`);
    } else {
      await touchDevice(device.id, ip);
      admsLog("OUT", effectiveSn, `TABLEDATA/${tname} bytes=${body.length}`);
    }
  } else {
    await touchDevice(device.id, ip);
    if (LOG) console.log(
      `[ADMS] POST ${table || "(unknown)"} SN="${effectiveSn}" bytes=${body.length} — ack`
    );
    admsLog("OUT", effectiveSn, `${table || "?"} bytes=${body.length} — OK`);
  }

  return res.type("text/plain").send(`OK: ${ackStamp}`);
}

/** POST /iclock/devicecmd  — Command execution result from device */
async function handlePostDevicecmd(req: Request, res: Response) {
  const sn   = String(req.query.SN || req.query.sn || "").trim();
  const ip   = clientIp(req);
  const body = typeof req.body === "string" ? req.body : "";

  const device = await resolveDevice(sn);
  if (device) {
    const effectiveSn = device.deviceSerial || sn;
    const authErr = authDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT devicecmd SN="${effectiveSn}" ip=${ip}: ${authErr}`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }
    await touchDevice(device.id, ip);
    if (body) {
      console.log(`[ADMS] devicecmd result SN="${effectiveSn}": ${body.slice(0, 200)}`);
      admsLog("IN", effectiveSn, `devicecmd: ${body.slice(0, 200)}`);
    }
  }
  return res.type("text/plain").send("OK");
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerAdmsRoutes(app: Express): void {
  // Log every ADMS request as it comes in
  const ADMS_PATHS = /^\/(iclock\/|cdata|getrequest|devicecmd|test|ping|health)/;
  app.use((req, _res, next) => {
    if (!ADMS_PATHS.test(req.path)) { next(); return; }
    const sn     = String(req.query.SN || req.query.sn || "?").trim();
    const ip     = clientIp(req);
    const qs     = new URLSearchParams(req.query as Record<string, string>).toString();
    const url    = req.path + (qs ? `?${qs}` : "");
    const bInfo  = typeof req.body === "string" && req.body.length > 0
      ? ` BODY[${req.body.length}B]` : "";
    const bPrev  = typeof req.body === "string"
      ? req.body.slice(0, 200).replace(/\t/g, "·").replace(/\r?\n/g, " | ") : "";
    console.log(
      `[ADMS] <- ${req.method} ${url}${bInfo}${bPrev ? ` "${bPrev}"` : ""} ip=${ip}`
    );
    admsLog("IN", sn, `${req.method} ${url}${bInfo} ip=${ip}`);
    next();
  });

  // Handshake
  app.get(
    ["/iclock/cdata", "/iclock/cdata.aspx", "/cdata", "/cdata.aspx"],
    handleGetCdata,
  );

  // Data upload
  app.post(
    ["/iclock/cdata", "/iclock/cdata.aspx", "/cdata", "/cdata.aspx"],
    handlePostCdata,
  );

  // Command polling
  app.get(
    ["/iclock/getrequest", "/iclock/getrequest.aspx", "/getrequest", "/getrequest.aspx"],
    handleGetRequest,
  );

  // Command ACK
  app.post(
    ["/iclock/devicecmd", "/iclock/devicecmd.aspx", "/devicecmd", "/devicecmd.aspx"],
    handlePostDevicecmd,
  );

  // Connectivity probe — SpeedFace-V5L expects literal "Test" response
  app.get(["/iclock/test", "/iclock/ping", "/test", "/ping"],
    (_req, res) => res.type("text/plain").send("Test"),
  );

  // Health check
  app.get(["/health", "/iclock/health"],
    (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }),
  );
}

// ─── ADMS server bootstrap ────────────────────────────────────────────────────

function buildAdmsApp(): Express {
  const a = express();

  // Parse every body as plain text — ZKTeco devices often omit Content-Type.
  // type: () => true accepts ALL content types without restriction.
  a.use(express.text({ type: () => true, limit: "10mb" }));

  // Hard request timeout (30 s) prevents stalled sockets holding the server.
  a.use((req, res, next) => {
    res.setTimeout(30_000, () =>
      console.error(`[ADMS] Request timeout: ${req.method} ${req.url}`)
    );
    next();
  });

  // Rate limit: 60 req/s per IP (well above any legitimate device polling rate).
  a.use(rateLimit({ windowMs: 1_000, max: 60, standardHeaders: false, legacyHeaders: false }));

  a.set("trust proxy", 1);

  registerAdmsRoutes(a);

  // Catch-all: reply OK so the device clears its internal retry queue.
  a.use((req, res) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const ip = clientIp(req);
    console.warn(`[ADMS] UNKNOWN PATH SN="${sn}" ip=${ip} ${req.method} ${req.url}`);
    admsLog("IN", sn, `UNKNOWN ${req.method} ${req.url}`);
    res.type("text/plain").send("OK");
  });

  return a;
}

/**
 * Start the dedicated ADMS HTTP server.
 * Retries up to maxRetries times if the port is already in use.
 */
export function startAdmsServer(maxRetries = 6, retryDelayMs = 5_000) {
  admsState = { running: false, port: ADMS_PORT, boundAt: null, error: null };
  const srv = createServer(buildAdmsApp());
  let attempt = 0;

  function tryBind() {
    attempt++;
    srv.listen({ port: ADMS_PORT, host: "0.0.0.0" });
  }

  srv.on("listening", () => {
    console.log(`[ADMS] Listening on 0.0.0.0:${ADMS_PORT}`);
    console.log(`[ADMS] Device URL: http://<server-ip>:${ADMS_PORT}/iclock/cdata`);
    admsState = {
      running: true,
      port: ADMS_PORT,
      boundAt: new Date().toISOString(),
      error: null,
    };
  });

  srv.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < maxRetries) {
      console.warn(
        `[ADMS] Port ${ADMS_PORT} in use (attempt ${attempt}/${maxRetries}), ` +
        `retrying in ${retryDelayMs / 1000}s…`
      );
      admsState.error = `port in use (retry ${attempt}/${maxRetries})`;
      srv.close(() => setTimeout(tryBind, retryDelayMs));
    } else {
      console.error(`[ADMS] Server error:`, err);
      admsState.error = err.message;
    }
  });

  tryBind();
  return srv;
}
