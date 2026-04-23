/**
 * ZKTeco ADMS (cloud-push) protocol handler.
 *
 * The device phones home over HTTP — we never dial it. All endpoints live on
 * a dedicated Express app bound to ADMS_PORT (default 8181) so devices work
 * out of the box without port reconfiguration.
 *
 * Protocol flow (x2008 firmware, no pushver):
 *   1. GET  /iclock/cdata  → handshake: server returns "GET OPTION FROM: <SN>"
 *      + config block.  Server queues SET TIME + DATA UPDATE ATTLOG commands.
 *   2. GET  /iclock/getrequest → device polls for queued commands; server
 *      delivers them as "C:<id>:<cmd>" lines.
 *   3. POST /iclock/cdata?table=ATTLOG&Stamp=<n> → device uploads attendance
 *      records; server inserts into biometric_punch_logs.
 *   4. POST /iclock/devicecmd → device reports command result; server acks.
 *
 * Protocol flow (SpeedFace-V5L / newer, pushver present):
 *   1. GET  /iclock/cdata → handshake: server returns "ServerVersion=..." block.
 *   2. Device self-uploads at TransTimes intervals; no extra command needed.
 *
 * Bare paths (/cdata, /getrequest, /devicecmd) are aliased to the same handlers
 * so x2008 devices configured with just "http://HOST:8181" work without /iclock.
 */

import express from "express";
import type { Express, Request, Response } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { timingSafeEqual, randomUUID } from "crypto";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { biometricPunchLogs } from "../shared/schema";
import rateLimit from "express-rate-limit";

// ─── Debug flag ──────────────────────────────────────────────────────────────
// Key events (new device, ATTLOG insert, errors) are ALWAYS logged.
// Verbose per-request noise is gated behind ADMS_DEBUG.
const ADMS_DEBUG =
  process.env.DEBUG_ADMS === "true" || process.env.NODE_ENV !== "production";

const CRLF = "\r\n";

// ─── In-memory device cache (30 s TTL) ───────────────────────────────────────
const _cache = new Map<string, { device: any; ts: number }>();
const CACHE_TTL = 30_000;

function cacheSet(key: string, device: any) {
  _cache.set(key, { device, ts: Date.now() });
}
function cacheGet(key: string) {
  const e = _cache.get(key);
  if (e && Date.now() - e.ts < CACHE_TTL) return e.device;
  return null;
}
function cacheDel(deviceId: string) {
  for (const [k, v] of _cache) {
    if (v.device?.id === deviceId) _cache.delete(k);
  }
}

// ─── Device resolution ───────────────────────────────────────────────────────
/**
 * Find the device for a given SN.
 *
 * Resolution order:
 *   1. Exact-match by serial (case-sensitive)
 *   2. Case-insensitive match
 *   3. Sole-device fallback — if exactly ONE device is registered, use it
 *      regardless of SN.  This covers:
 *        • Device with no SN at all (empty string)
 *        • Device whose DB serial is still the "TEST123" placeholder
 *        • Any SN mismatch on a single-device deployment
 *
 * Side-effect: on sole-device fallback WITH a real (non-empty) SN, the DB
 * serial is updated to the real one so future calls match exactly.
 */
async function resolveDevice(sn: string): Promise<any | null> {
  // 1. Cache hit
  const cached = cacheGet(sn);
  if (cached !== null) return cached;

  const all = await storage.getAllBiometricDevices();

  // 2. Exact match
  const exact = all.find((d) => d.deviceSerial === sn);
  if (exact) {
    cacheSet(sn, exact);
    return exact;
  }

  // 3. Case-insensitive match
  const upper = sn.toUpperCase();
  const ci = all.find((d) => (d.deviceSerial || "").toUpperCase() === upper);
  if (ci) {
    cacheSet(sn, ci);
    return ci;
  }

  // 4. Sole-device fallback
  if (all.length === 1) {
    const sole = all[0];
    if (sn && sn !== sole.deviceSerial) {
      console.warn(
        `[ADMS] SN MISMATCH: device says SN="${sn}" but DB has "${sole.deviceSerial}". ` +
        `Updating DB serial to the real value. (You may also update it in Device Management.)`
      );
      try {
        await storage.updateBiometricDevice(sole.id, { deviceSerial: sn } as any);
        cacheDel(sole.id);
        const updated = { ...sole, deviceSerial: sn };
        cacheSet(sn, updated);
        return updated;
      } catch {
        // DB update failed — still return the device so we don't drop the push
      }
    }
    cacheSet(sn, sole);
    return sole;
  }

  return null;
}

// ─── Command queue ────────────────────────────────────────────────────────────
const pendingCmds = new Map<string, string[]>();
let nextCmdId = 1;
const MAX_QUEUE = 8;

export async function enqueueDeviceCommand(deviceId: string, cmd: string) {
  const list = pendingCmds.get(deviceId) || [];
  if (list.includes(cmd)) return;
  if (list.length >= MAX_QUEUE) {
    console.warn(`[ADMS] queue full for device=${deviceId}, dropping: ${cmd}`);
    return;
  }
  list.push(cmd);
  pendingCmds.set(deviceId, list);

  // Persist to DB (best-effort; survives server restart)
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
        UPDATE biometric_devices SET pending_commands='[]'::jsonb WHERE id = ${deviceId}
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

// ─── Device touch (update last-seen fields) ───────────────────────────────────
async function touchDevice(
  deviceId: string,
  ip: string,
  extra: { fw?: string; addTotal?: number; stamp?: number } = {}
) {
  const upd: any = { status: "online", lastPushAt: new Date().toISOString(), lastPushIp: ip };
  if (extra.fw) upd.firmwareVersion = extra.fw;
  if (extra.stamp != null) upd.lastAttlogStamp = extra.stamp;
  await storage.updateBiometricDevice(deviceId, upd);
  if (extra.addTotal) {
    const fresh = await storage.getBiometricDevice(deviceId);
    if (fresh) {
      await storage.updateBiometricDevice(deviceId, {
        pushTotal: (fresh.pushTotal || 0) + extra.addTotal,
      } as any);
    }
  }
  cacheDel(deviceId);
}

// ─── ATTLOG processing ────────────────────────────────────────────────────────
function decodePunchType(raw: string): string {
  switch ((raw || "").trim()) {
    case "0": return "in";
    case "1": return "out";
    case "2": return "break-out";
    case "3": return "break-in";
    case "4": return "overtime-in";
    case "5": return "overtime-out";
    default:  return "unknown";
  }
}

/**
 * Parse a ZKTeco timestamp.
 *
 * The x2008 stores timestamps in the device's local timezone (configured via
 * the web UI; we assume IST = UTC+05:30 unless the timestamp already includes
 * a 'Z' or '+' offset indicator).  We return the date string as-is (YYYY-MM-DD)
 * so the UI shows what the device recorded, plus an epoch value for the stamp.
 */
function parseTimestamp(ts: string): { date: string; time: string; epoch: number } | null {
  const m = (ts || "").trim().match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return null;
  const secs = m[4] ?? "00";
  // Assume IST (UTC+05:30) if no explicit offset present
  const isoStr = `${m[1]}T${m[2]}:${m[3]}:${secs}+05:30`;
  const epoch = Math.floor(new Date(isoStr).getTime() / 1000);
  return {
    date: m[1],
    time: `${m[2]}:${m[3]}`,
    epoch: isNaN(epoch) ? 0 : epoch,
  };
}

export async function processAttlog(
  device: any,
  body: string,
): Promise<{ inserted: number; duplicates: number; bad: number; maxStamp: number }> {
  const out = { inserted: 0, duplicates: 0, bad: 0, maxStamp: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // Resolve company — use device's company, or the first company as final fallback
  let companyId: string | null = device.companyId ?? null;
  if (!companyId) {
    const all = await storage.getAllCompanies();
    companyId = all?.[0]?.id ?? null;
  }
  if (!companyId) {
    console.error("[ADMS] processAttlog: no company found — cannot store punches");
    out.bad = lines.length;
    return out;
  }

  // Build PIN → employee map for this company (or all employees if no companyId)
  const employees = device.companyId
    ? await storage.getEmployeesByCompany(device.companyId)
    : await storage.getAllEmployees();
  const byPin = new Map(
    employees.filter((e) => e.biometricDeviceId).map((e) => [String(e.biometricDeviceId), e])
  );

  const now = new Date().toISOString();
  const rows: any[] = [];

  for (const line of lines) {
    // Standard format:  PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify ...
    // Extended format:  PIN \t Name \t YYYY-MM-DD HH:MM:SS \t status ...
    let pin = "", ts = "", status = "0";
    const parts = line.split("\t");
    if (parts.length >= 2) {
      pin = parts[0].trim();
      const f1IsDate = /^\d{4}[-/]\d{2}[-/]\d{2}/.test(parts[1].trim());
      if (f1IsDate) {
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

    const employee = byPin.get(String(pin)) ?? null;
    rows.push({
      id: randomUUID(),
      companyId,
      employeeId: employee?.id ?? null,
      deviceEmployeeId: pin,
      punchTime: parsed.time,
      punchDate: parsed.date,
      punchType: decodePunchType(status),
      deviceId: device.id,
      isProcessed: false,
      isDuplicate: false,
      missingPunch: false,
      syncedAt: null,
      createdAt: now,
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
    if (out.inserted > 0) {
      console.log(
        `[ADMS] ATTLOG device=${device.deviceSerial} inserted=${out.inserted} ` +
        `dups=${out.duplicates} bad=${out.bad} total_lines=${lines.length}`
      );
    }
  } catch (err) {
    console.error("[ADMS] ATTLOG bulk insert failed:", err);
    out.bad += rows.length;
  }

  return out;
}

// ─── USERINFO processing ──────────────────────────────────────────────────────
function parseUserRecord(line: string): Record<string, string> | null {
  let s = (line || "").trim().replace(/^(?:OPLOG\s+)?USER\s+/i, "");
  if (!s) return null;
  const out: Record<string, string> = {};
  for (const part of s.split(/\t+/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out.PIN || out.Pin || out.pin ? out : null;
}

export async function processUserRecords(
  device: any,
  body: string,
): Promise<{ upserted: number; bad: number }> {
  const out = { upserted: 0, bad: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const now = new Date().toISOString();
  for (const line of lines) {
    if (!/PIN=/i.test(line)) continue;
    const rec = parseUserRecord(line);
    if (!rec) { out.bad++; continue; }
    const pin = String(rec.PIN || rec.Pin || rec.pin || "").trim();
    if (!pin) { out.bad++; continue; }
    try {
      await db.execute(sql`
        INSERT INTO biometric_device_users
          (device_id, device_employee_id, name, privilege, card,
           password_set, fingerprint_count, first_seen_at, last_seen_at)
        VALUES (
          ${device.id}, ${pin},
          ${(rec.Name || rec.NAME || rec.name || "").trim() || null},
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
  return out;
}

// ─── Activity log ─────────────────────────────────────────────────────────────
// In-memory ring buffer for the live 5-second UI refresh — fast, no DB round-trip.
const admsActivity: Array<{ ts: string; dir: "IN" | "OUT"; sn: string; line: string }> = [];

// Write a log entry to the in-memory ring buffer.
// Key events (handshake, ATTLOG, command delivery) are ALSO persisted to the
// `adms_activity_log` DB table so they survive server restarts.
function admsLog(dir: "IN" | "OUT", sn: string, line: string, persist = false) {
  const ts = new Date().toISOString();
  admsActivity.push({ ts, dir, sn, line });
  if (admsActivity.length > 500) admsActivity.shift();

  if (persist) {
    // Fire-and-forget DB insert; never block the request handler.
    db.execute(sql`
      INSERT INTO adms_activity_log (device_sn, direction, message, created_at)
      VALUES (${sn}, ${dir}, ${line}, NOW())
    `).then(async () => {
      // Prune: keep only the newest 500 rows for this SN to bound table growth.
      // Do this occasionally — whenever row count for the SN might exceed limit.
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
}

export function getAdmsActivityLog() {
  return admsActivity.map((e) => ({
    ts: e.ts,
    direction: e.dir,
    sn: e.sn,
    line: e.line,
  }));
}

// DB-backed version — survives server restarts.
// Returns the most recent 200 entries across all devices.
export async function getAdmsActivityLogFromDB(): Promise<Array<{
  ts: string; direction: string; sn: string; line: string;
}>> {
  try {
    const rows = await db.execute(sql`
      SELECT device_sn AS sn, direction, message AS line,
             created_at AS ts
      FROM adms_activity_log
      ORDER BY id DESC
      LIMIT 200
    `);
    return (rows.rows as any[]).map((r) => ({
      ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      direction: String(r.direction),
      sn: String(r.sn),
      line: String(r.line),
    }));
  } catch {
    // Table might not exist yet on older deployments — fall back to in-memory
    return getAdmsActivityLog();
  }
}

// ─── IP helpers ───────────────────────────────────────────────────────────────
function clientIp(req: Request): string {
  return ((req.ip || req.socket.remoteAddress || "") as string).trim();
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

// Returns null on success, or a reason string on failure.
// No token + no CIDR = open mode (accepted from any IP).
function authDevice(req: Request, device: any, ip: string): string | null {
  const token = (device.pushToken || "").trim();
  const cidr  = (device.allowedIpCidr || "").trim();
  if (!token && !cidr) return null; // open mode
  if (token && safeEq(extractToken(req), token)) return null;
  if (cidr  && ipInCidr(ip, cidr)) return null;
  return token && cidr ? "neither token nor IP matched" : token ? "wrong token" : "IP not in CIDR";
}

// ─── TransTimes: every 5 minutes across all 24 hours ─────────────────────────
function buildTransTimes(): string {
  return Array.from({ length: 24 }, (_, h) =>
    ["00","05","10","15","20","25","30","35","40","45","50","55"]
      .map((m) => `${String(h).padStart(2,"0")}:${m}`)
      .join(";")
  ).join(";");
}

// ─── ADMS server status ───────────────────────────────────────────────────────
let admsState = { running: false, port: 8181, boundAt: null as string | null, error: null as string | null };
export function getAdmsServerStatus() { return { ...admsState }; }

// ─── Route registration ───────────────────────────────────────────────────────
export function registerAdmsRoutes(app: Express) {

  // ── Middleware: log ADMS device requests ─────────────────────────────────
  // Scope to known ADMS paths so Vite/API requests on the main app are silent.
  const ADMS_PATHS = /^\/(iclock\/|cdata|getrequest|devicecmd|test|ping|health)/;
  app.use((req, _res, next) => {
    if (!ADMS_PATHS.test(req.path)) { next(); return; }
    const sn  = String(req.query.SN || req.query.sn || "?").trim();
    const ip  = clientIp(req);
    const qs  = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = req.path + (qs ? `?${qs}` : "");
    const bodyInfo = typeof req.body === "string" && req.body.length > 0
      ? ` BODY[${req.body.length}B]` : "";
    if (ADMS_DEBUG) {
      const bodyPreview = typeof req.body === "string"
        ? req.body.slice(0, 300).replace(/\t/g, "·").replace(/\r?\n/g, " | ")
        : "";
      console.log(`[ADMS] ← ${req.method} ${url}${bodyInfo}${bodyPreview ? ` "${bodyPreview}"` : ""} ip=${ip}`);
    }
    admsLog("IN", sn, `${req.method} ${url}${bodyInfo} ip=${ip}`);
    next();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Shared GET /cdata handler (handles both /iclock/cdata and /cdata)
  async function handleGetCdata(req: Request, res: Response) {
    const sn  = String(req.query.SN || req.query.sn || "").trim();
    const ip  = clientIp(req);
    const fw  = String(req.query.pushver || req.query.PushVersion || "").trim();

    const device = sn ? await resolveDevice(sn) : await resolveDevice("");
    if (!device) {
      console.warn(`[ADMS] GET /cdata unrecognised SN="${sn}" ip=${ip} — no device registered`);
      admsLog("OUT", sn || "?", "→ 200 (no device registered, silent OK)");
      return res.type("text/plain").send("OK");
    }

    // Use the current device serial (may have been auto-corrected)
    const effectiveSn = sn || device.deviceSerial || "";

    const authErr = authDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT GET /cdata SN="${effectiveSn}" ip=${ip}: ${authErr}`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    await touchDevice(device.id, ip, { fw: fw || undefined });
    const stamp = device.lastAttlogStamp ?? 0;
    const times = buildTransTimes();

    const isSpeedFace = !!fw;
    console.log(`[ADMS] HANDSHAKE SN="${effectiveSn}" ip=${ip} proto=${isSpeedFace ? "SpeedFace" : "x2008"} stamp=${stamp}`);
    admsLog("OUT", effectiveSn, `→ HANDSHAKE proto=${isSpeedFace ? "SpeedFace" : "x2008"} stamp=${stamp} ip=${ip}`, true);

    if (isSpeedFace) {
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

    // x2008 — "GET OPTION FROM:" format, then queue commands for next poll
    const body = [
      `GET OPTION FROM: ${effectiveSn}`,
      `ATTLOGStamp=${stamp}`,
      "OPERLOGStamp=9999999999",
      "ErrorDelay=30",
      "Delay=10",
      `TransTimes=${times}`,
      "TransInterval=1",
      "TransFlag=TransData AttLog OpLog EnrollFP",
      "Realtime=1",
      "Encrypt=0",
      "",
    ].join(CRLF);

    const devTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    await enqueueDeviceCommand(device.id, `SET TIME ${devTime}`);
    await enqueueDeviceCommand(device.id, `DATA UPDATE ATTLOG Stamp=${stamp}`);

    return res.type("text/plain").send(body);
  }

  // Shared POST /cdata handler
  async function handlePostCdata(req: Request, res: Response) {
    const sn    = String(req.query.SN || req.query.sn || "").trim();
    const table = String(req.query.table || "").toUpperCase();
    const stamp = String(req.query.Stamp || req.query.stamp || "0");
    const ip    = clientIp(req);
    const body  = typeof req.body === "string" ? req.body : "";

    const device = await resolveDevice(sn);
    if (!device) {
      console.warn(`[ADMS] POST /cdata UNKNOWN SN="${sn}" ip=${ip} table=${table} — no device registered`);
      admsLog("OUT", sn || "?", `→ 200 (no device) table=${table}`);
      return res.type("text/plain").send("OK");
    }

    const effectiveSn = sn || device.deviceSerial || "";
    const authErr = authDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT POST /cdata SN="${effectiveSn}" ip=${ip} table=${table}: ${authErr}`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    let ackStamp: number | string = stamp;

    if (table === "ATTLOG") {
      const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
      console.log(`[ADMS] POST ATTLOG SN="${effectiveSn}" ip=${ip} stamp=${stamp} lines=${lineCount}`);
      admsLog("IN", effectiveSn, `← ATTLOG ${lineCount} lines stamp=${stamp} ip=${ip}`, true);
      if (ADMS_DEBUG && body) {
        console.log(`[ADMS]   body: ${body.slice(0, 500).replace(/\r?\n/g, " | ")}`);
      }

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

      admsLog("OUT", effectiveSn, `→ ATTLOG ins=${r.inserted} dups=${r.duplicates} bad=${r.bad} lines=${lineCount} stamp=${ackStamp}`, true);

    } else if (["OPERLOG","USERINFO","USER"].includes(table)) {
      const r = await processUserRecords(device, body);
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST ${table} SN="${effectiveSn}" users=${r.upserted} bad=${r.bad}`);
      admsLog("OUT", effectiveSn, `→ OK ${table} users=${r.upserted}`);

    } else if (table === "TABLEDATA") {
      const tname = String(req.query.tablename || req.query.tableName || "").toLowerCase();
      if (tname === "user") {
        const r = await processUserRecords(device, body);
        await touchDevice(device.id, ip);
        admsLog("OUT", effectiveSn, `→ OK TABLEDATA/user users=${r.upserted}`);
      } else {
        await touchDevice(device.id, ip);
        admsLog("OUT", effectiveSn, `→ OK TABLEDATA/${tname} bytes=${body.length}`);
      }
    } else {
      await touchDevice(device.id, ip);
      if (ADMS_DEBUG) console.log(`[ADMS] POST ${table || "(unknown)"} SN="${effectiveSn}" bytes=${body.length} — ack`);
      admsLog("OUT", effectiveSn, `→ OK ${table || "?"} bytes=${body.length}`);
    }

    res.type("text/plain").send(`OK: ${ackStamp}`);
  }

  // Shared GET /getrequest handler
  async function handleGetRequest(req: Request, res: Response) {
    const sn = String(req.query.SN || req.query.sn || "").trim();
    const ip = clientIp(req);

    const device = await resolveDevice(sn);
    if (!device) {
      if (ADMS_DEBUG) console.log(`[ADMS] GET /getrequest unknown SN="${sn}" ip=${ip}`);
      return res.type("text/plain").send("OK");
    }

    const effectiveSn = sn || device.deviceSerial || "";
    const authErr = authDevice(req, device, ip);
    if (authErr) {
      console.warn(`[ADMS] REJECT GET /getrequest SN="${effectiveSn}" ip=${ip}: ${authErr}`);
      return res.status(401).type("text/plain").send("ERROR: unauthorized");
    }

    await touchDevice(device.id, ip);
    const cmds = await drainCommands(device.id);
    if (cmds.length > 0) {
      const lines = cmds.map((c) => `C:${nextCmdId++}:${c}`);
      if (nextCmdId > 9999) nextCmdId = 1;
      console.log(`[ADMS] DELIVER ${cmds.length} cmd(s) to SN="${effectiveSn}": ${cmds.join(" | ")}`);
      admsLog("OUT", effectiveSn, `→ CMDS (${cmds.length}): ${cmds.join(" | ")}`, true);
      return res.type("text/plain").send(lines.join(CRLF));
    }
    admsLog("OUT", effectiveSn, "→ OK (no cmds)");
    res.type("text/plain").send("OK");
  }

  // Shared POST /devicecmd handler
  async function handlePostDevicecmd(req: Request, res: Response) {
    const sn   = String(req.query.SN || req.query.sn || "").trim();
    const ip   = clientIp(req);
    const body = typeof req.body === "string" ? req.body : "";

    const device = await resolveDevice(sn);
    if (device) {
      const effectiveSn = sn || device.deviceSerial || "";
      const authErr = authDevice(req, device, ip);
      if (authErr) {
        console.warn(`[ADMS] REJECT POST /devicecmd SN="${effectiveSn}" ip=${ip}: ${authErr}`);
        return res.status(401).type("text/plain").send("ERROR: unauthorized");
      }
      await touchDevice(device.id, ip);
      if (body) {
        if (ADMS_DEBUG) console.log(`[ADMS] devicecmd result SN="${effectiveSn}": ${body.slice(0, 200)}`);
        admsLog("IN", effectiveSn, `devicecmd: ${body.slice(0, 200)}`);
      }
    }
    res.type("text/plain").send("OK");
  }

  // ── Register routes (both /iclock/* and bare paths share one handler) ──────

  app.get(
    ["/iclock/cdata", "/iclock/cdata.aspx", "/cdata", "/cdata.aspx"],
    handleGetCdata,
  );

  app.post(
    ["/iclock/cdata", "/iclock/cdata.aspx", "/cdata", "/cdata.aspx"],
    handlePostCdata,
  );

  app.get(
    ["/iclock/getrequest", "/iclock/getrequest.aspx", "/getrequest", "/getrequest.aspx"],
    handleGetRequest,
  );

  app.post(
    ["/iclock/devicecmd", "/iclock/devicecmd.aspx", "/devicecmd", "/devicecmd.aspx"],
    handlePostDevicecmd,
  );

  // Connectivity probes — SpeedFace-V5L requires literal "Test" response
  app.get(
    ["/iclock/test", "/iclock/ping", "/test", "/ping"],
    (_req: Request, res: Response) => res.type("text/plain").send("Test"),
  );

  // Health check
  app.get(
    ["/health", "/iclock/health"],
    (_req: Request, res: Response) => res.json({ status: "ok", time: new Date() }),
  );
}

// ─── Dedicated ADMS HTTP server on port 8181 ─────────────────────────────────
const ADMS_PORT = parseInt(process.env.ADMS_PORT || "8181", 10);

function buildAdmsApp() {
  const a = express();

  // Parse every request body as plain text — ZKTeco devices often omit
  // Content-Type entirely; type: () => true handles those cases reliably.
  a.use(express.text({ type: () => true, limit: "10mb" }));

  // Hard request timeout — prevents stalled sockets from holding the server
  a.use((req, res, next) => {
    res.setTimeout(30_000, () =>
      console.error(`[ADMS] Request timeout: ${req.method} ${req.url}`)
    );
    next();
  });

  // Rate limit — max 60 req/s per IP (well above any legitimate device rate)
  a.use(rateLimit({ windowMs: 1000, max: 60, standardHeaders: false, legacyHeaders: false }));

  a.set("trust proxy", 1);

  registerAdmsRoutes(a);

  // Catch-all: log unknown paths, reply OK so the device clears its retry queue
  a.use((req, res) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const ip = clientIp(req);
    console.warn(`[ADMS] UNKNOWN PATH SN="${sn}" ip=${ip} ${req.method} ${req.url}`);
    admsLog("IN", sn, `UNKNOWN ${req.method} ${req.url}`);
    res.type("text/plain").send("OK");
  });

  return a;
}

export function startAdmsServer(maxRetries = 6, retryDelayMs = 5000) {
  admsState = { running: false, port: ADMS_PORT, boundAt: null, error: null };
  const srv = createServer(buildAdmsApp());
  let attempt = 0;

  function tryBind() {
    attempt++;
    srv.listen({ port: ADMS_PORT, host: "0.0.0.0" });
  }

  srv.on("listening", () => {
    console.log(`[ADMS] Listening on port ${ADMS_PORT}`);
    console.log(`[ADMS] ZKTeco devices → http://<server-ip>:${ADMS_PORT}/iclock/cdata`);
    admsState = { running: true, port: ADMS_PORT, boundAt: new Date().toISOString(), error: null };
  });

  srv.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < maxRetries) {
      console.warn(`[ADMS] Port ${ADMS_PORT} in use (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs / 1000}s…`);
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
