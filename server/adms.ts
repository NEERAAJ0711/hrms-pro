import express from "express";
import type { Express, Request, Response } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { timingSafeEqual } from "crypto";
import { db } from "./db";
import { sql } from "drizzle-orm";

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

// In-memory command queue per device. ZK ADMS lets the server reply to a
// device poll with C:<id>:<command> lines; the device executes and reports
// back via /iclock/devicecmd. Volatile memory is fine here — if the server
// restarts the admin just clicks "Sync Users" again.
const pendingCommands: Map<string, string[]> = new Map();
// Command IDs must be small integers — ZKTeco firmware typically overflows
// on IDs larger than a few digits. DO NOT use Date.now() here.
let nextCmdId = 1;

// Devices for which we have already auto-queued ATTLOG+USERINFO since
// this server process started. We only auto-queue once per boot — the user
// can trigger additional re-uploads via the "Clear & Re-Sync" button.
const autoSyncQueued = new Set<string>();

const MAX_QUEUE_PER_DEVICE = 8;

export function resetAutoSyncGuard(deviceId: string): void {
  autoSyncQueued.delete(deviceId);
}

export function enqueueDeviceCommand(deviceId: string, cmd: string): void {
  const list = pendingCommands.get(deviceId) || [];
  // Skip if the same command is already pending — repeated clicks while the
  // device is offline shouldn't pile up duplicate work.
  if (list.includes(cmd)) return;
  if (list.length >= MAX_QUEUE_PER_DEVICE) {
    console.warn(`[ADMS] queue full for device=${deviceId}, dropping cmd: ${cmd}`);
    return;
  }
  list.push(cmd);
  pendingCommands.set(deviceId, list);
}

function drainCommands(deviceId: string): string[] {
  const list = pendingCommands.get(deviceId);
  if (!list || list.length === 0) return [];
  pendingCommands.delete(deviceId);
  return list;
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
    console.warn(
      `[ADMS] WARN: device SN=${device.deviceSerial} has no pushToken or allowedIpCidr — ` +
      `accepting push from ${ip} in open mode. Set a pushToken to secure this device.`,
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
  const all = await storage.getAllBiometricDevices();
  // 1. Exact match
  const exact = all.find((d) => d.deviceSerial === serial);
  if (exact) return exact;
  // 2. Case-insensitive match
  const upper = serial.toUpperCase();
  const ci = all.find((d) => (d.deviceSerial || "").toUpperCase() === upper);
  if (ci) return ci;
  // 3. Single-device fallback — if only one device is registered and the SN
  //    doesn't match exactly, use it anyway (handles typos / mistyped SNs).
  //    We log a prominent warning so the operator can fix the SN in HRMS.
  if (all.length === 1) {
    console.warn(
      `[ADMS] SN MISMATCH: device reports SN=${serial} but HRMS has SN=${all[0].deviceSerial}. ` +
      `Using the only registered device as fallback. Please update the Device Serial in HRMS.`,
    );
    // Auto-correct the SN in DB so future calls match exactly
    try {
      await storage.updateBiometricDevice(all[0].id, { deviceSerial: serial } as any);
    } catch (_) { /* best-effort */ }
    return { ...all[0], deviceSerial: serial };
  }
  return undefined;
}

async function touchDevice(
  deviceId: string,
  ip: string,
  extra: { firmwareVersion?: string; addToTotal?: number } = {},
) {
  const update: any = {
    status: "online",
    lastPushAt: new Date().toISOString(),
    lastPushIp: ip,
  };
  if (extra.firmwareVersion) update.firmwareVersion = extra.firmwareVersion;
  await storage.updateBiometricDevice(deviceId, update);
  if (extra.addToTotal) {
    // Increment the running counter via raw update — done as a separate
    // call so we don't depend on a numeric helper that doesn't exist yet.
    const fresh = await storage.getBiometricDevice(deviceId);
    if (fresh) {
      await storage.updateBiometricDevice(deviceId, {
        pushTotal: (fresh.pushTotal || 0) + extra.addToTotal,
      } as any);
    }
  }
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

// "2026-04-17 09:30:15" → { punchDate: "2026-04-17", punchTime: "09:30" }.
// We deliberately drop seconds because the rest of the system stores HH:MM.
function splitTimestamp(ts: string): { punchDate: string; punchTime: string } | null {
  const m = (ts || "").trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?/);
  if (!m) return null;
  return { punchDate: m[1], punchTime: `${m[2]}:${m[3]}` };
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
): Promise<{ inserted: number; duplicates: number; unmapped: number; bad: number }> {
  const out = { inserted: 0, duplicates: 0, unmapped: 0, bad: 0 };
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // For unmapped rows we still want to record them so the operator can see
  // them in the Punch Logs view. The companyId on the row defaults to the
  // device's company; for shared devices we fall back to the resolved
  // employee's company, and if that fails too we skip the row.
  const employees = device.companyId
    ? await storage.getEmployeesByCompany(device.companyId)
    : await storage.getAllEmployees();
  const byBiometricId = new Map(
    employees.filter((e) => e.biometricDeviceId).map((e) => [String(e.biometricDeviceId), e]),
  );

  // Fallback companyId: when the device has no company assigned and the employee
  // isn't mapped, use the first company so the punch is never silently dropped.
  let fallbackCompanyId: string | null = device.companyId ?? null;
  if (!fallbackCompanyId) {
    const allCompanies = await storage.getAllCompanies();
    fallbackCompanyId = allCompanies?.[0]?.id ?? null;
  }

  for (const line of lines) {
    // Parse ATTLOG line. ZKTeco x2008 firmware 2.x emits tab-separated fields.
    //
    // Standard format:  PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify ...
    // Extended format:  PIN \t Name \t YYYY-MM-DD HH:MM:SS \t status \t ...
    //   (some builds include the employee name as field[1])
    //
    // We auto-detect by checking whether field[1] looks like a datetime.
    // If not, we treat it as the employee name and shift remaining fields.
    // Fallback: regex scan for space-separated format when there are no tabs.
    let pin: string, ts: string, status: string = "0";
    const tabParts = line.split("\t");
    if (tabParts.length >= 2) {
      pin = tabParts[0].trim();
      // Detect extended format: field[1] is a name if it doesn't start with a digit sequence
      // that looks like YYYY-MM-DD or YYYY/MM/DD.
      const isDateField1 = /^\d{4}[-/]\d{2}[-/]\d{2}/.test(tabParts[1].trim());
      if (isDateField1) {
        // Standard: PIN \t DATE TIME \t status ...
        ts     = tabParts[1].trim();
        status = (tabParts[2] ?? "0").trim();
      } else {
        // Extended: PIN \t Name \t DATE TIME \t status ...
        ts     = (tabParts[2] ?? "").trim();
        status = (tabParts[3] ?? "0").trim();
      }
    } else {
      // Regex fallback for space-separated ATTLOG.
      // Format: <PIN> <YYYY-MM-DD> <HH:MM[:SS]> <status> ...
      const m = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(\d+)/);
      if (!m) {
        out.bad++;
        continue;
      }
      pin    = m[1];
      ts     = `${m[2]} ${m[3]}`;
      status = m[4];
    }
    const split = splitTimestamp(ts);
    if (!split) {
      // Log the first failure so we can see the raw field values in server logs.
      if (out.bad === 0) {
        console.warn(`[ADMS] ATTLOG parse fail — pin="${pin}" ts="${ts}" raw="${line.slice(0, 80)}"`);
      }
      out.bad++;
      continue;
    }
    const employee = byBiometricId.get(String(pin));
    const punchCompanyId = employee?.companyId || device.companyId || fallbackCompanyId;
    if (!punchCompanyId) {
      // No company could be resolved at all — no device company, no employee
      // company, no companies in DB. Count as unmapped and skip.
      out.unmapped++;
      continue;
    }

    const dup = await storage.findDuplicatePunchLog(
      punchCompanyId,
      String(pin),
      split.punchTime,
      split.punchDate,
    );
    if (dup) {
      out.duplicates++;
      continue;
    }

    try {
      await storage.createBiometricPunchLog({
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
        createdAt: new Date().toISOString(),
      } as any);
      if (employee) out.inserted++;
      else {
        out.inserted++;
        out.unmapped++;
      }
    } catch (err) {
      console.error("[ADMS] insert ATTLOG row failed:", err);
      out.bad++;
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

export function registerAdmsRoutes(app: Express) {
  // Log every raw /iclock/* request for debugging.
  app.use("/iclock", (req, _res, next) => {
    const sn = String(req.query.SN || req.query.sn || "?").trim();
    const method = req.method;
    const url = req.path + (req.query.table ? `?table=${req.query.table}` : "");
    const bodyPreview = typeof req.body === "string" && req.body.length > 0
      ? ` BODY[${req.body.length}bytes]: ${req.body.slice(0, 400).replace(/\t/g, "·").replace(/\r?\n/g, " | ")}` : "";
    const entry = `${method} ${url}${bodyPreview}`;
    console.log(`[ADMS-RAW] SN=${sn} ${entry}`);
    admsLog("IN", sn, entry);
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

    console.log(`[ADMS] GET /iclock/cdata SN=${sn || "(none)"} ip=${ip} known=${!!device}`);

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

    // On first handshake after server start, enqueue a full data re-upload.
    //
    // "DATA UPDATE ATTLOG" (Return=0 on x2008 2.4.1) — triggers the device
    // to re-evaluate which records to push. Combined with our "OK: 0" ack
    // strategy (we never advance the stamp pointer), this causes the device
    // to push all records on every scheduled TransInterval cycle.
    //
    // "DATA UPDATE USERINFO" (Return=-1 on x2008 2.4.1) — NOT supported on
    // this firmware version. User data is obtained via the OPERLOGStamp=0
    // mechanism in the handshake config — the device will push OPERLOG data
    // (which includes enrollment events) at the next scheduled upload cycle.
    if (!autoSyncQueued.has(device.id)) {
      autoSyncQueued.add(device.id);
      // Stamp=0 tells the device to re-upload ALL records from the very
      // beginning, regardless of what stamp it thinks we already have.
      enqueueDeviceCommand(device.id, "DATA UPDATE ATTLOG Stamp=0");
      console.log(`[ADMS] Auto-queued "DATA UPDATE ATTLOG Stamp=0" for SN=${sn} on first handshake`);
    }

    // Standard ADMS config — no inline commands here (they break config parsing
    // on older firmware). Commands are delivered via GET /iclock/getrequest.
    //
    // IMPORTANT notes for x2008 firmware compatibility:
    //   - Do NOT include a bare "Stamp=0" — use the specific ATTLOGStamp /
    //     OPERLOGStamp fields instead. A bare Stamp= can confuse some firmware
    //     versions into thinking the server already has everything.
    //   - TransFlag flags must be space-separated. Tabs break the parser on
    //     some x2008 firmware builds.
    //   - Delay=1 makes the device poll /getrequest every 1 second so commands
    //     are picked up quickly.
    const lines = [
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=0`,
      `OPERLOGStamp=0`,
      `ATTPHOTOStamp=0`,
      `ErrorDelay=30`,
      `Delay=1`,
      `TransTimes=00:00;01:00;02:00;03:00;04:00;05:00;06:00;07:00;08:00;09:00;10:00;11:00;12:00;13:00;14:00;15:00;16:00;17:00;18:00;19:00;20:00;21:00;22:00;23:00`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP FPImag`,
      `TimeZone=5.5`,
      `Realtime=1`,
      `Encrypt=None`,
      ``,
    ];
    res.type("text/plain").send(lines.join(NEW_LINE));
  });

  // The actual data push. Body is tab-separated lines; we got a `text`
  // body parser mounted under /iclock so `req.body` is always a string.
  app.post(["/iclock/cdata", "/iclock/cdata.aspx"], async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const table = String(req.query.table || "").toUpperCase();
    const stamp = String(req.query.Stamp || req.query.stamp || "0");
    const ip = clientIp(req);
    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");

    const device = await findDeviceBySerial(sn);
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
    if (table === "ATTLOG") {
      // Log a preview of the raw body + device Stamp so we can diagnose
      // format problems and confirm records are actually arriving.
      const bodyPreview = body.slice(0, 400).replace(/\r?\n/g, " | ");
      const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
      console.log(
        `[ADMS] POST ATTLOG SN=${sn} Stamp=${stamp} lines=${lineCount} preview="${bodyPreview}"`,
      );
      admsLog("IN", sn, `ATTLOG Stamp=${stamp} lines=${lineCount} body="${bodyPreview.slice(0, 150)}"`);
      const r = await processAttlog(device, body);
      await touchDevice(device.id, ip, { addToTotal: r.inserted });
      await storage.updateBiometricDevice(device.id, {
        lastSync: new Date().toISOString(),
      } as any);
      console.log(
        `[ADMS] POST ATTLOG SN=${sn} ip=${ip} inserted=${r.inserted} dups=${r.duplicates} unmapped=${r.unmapped} bad=${r.bad}`,
      );
    } else if (table === "OPERLOG" || table === "USERINFO" || table === "USER") {
      // OPERLOG carries USER enrollments mixed with other op events; USERINFO
      // is a USER-only push. We persist USER rows so the View Users dialog
      // can show every enrolled employee, not just those who've punched.
      const r = await processUserRecords(device, body);
      await touchDevice(device.id, ip);
      console.log(
        `[ADMS] POST ${table} SN=${sn} ip=${ip} users_upserted=${r.upserted} bad=${r.bad}`,
      );
    } else {
      // FINGERTMP / ATTPHOTO etc — acknowledge so the device clears its
      // queue. We don't store fingerprint or face template blobs.
      await touchDevice(device.id, ip);
      console.log(`[ADMS] POST ${table} SN=${sn} ip=${ip} bytes=${body.length}`);
    }

    // ATTLOG ack: always respond "OK: 0" so the device never advances its
    // per-server stamp pointer. The x2008 firmware interprets "OK: <stamp>"
    // as "server's ATTLOGStamp is now <stamp>" and will not re-send records
    // with timestamps ≤ that value on subsequent upload cycles. By staying
    // at 0 the device will re-push ALL records on every scheduled cycle;
    // our deduplication logic silently discards the ones we already have.
    // For non-ATTLOG tables (OPERLOG, FINGERTMP, etc.) we echo the stamp
    // normally because we don't need those to be re-pushed.
    if (table === "ATTLOG") {
      res.type("text/plain").send("OK: 0");
    } else {
      res.type("text/plain").send(`OK: ${stamp}`);
    }
  });

  // Device polling for queued commands.
  // IMPORTANT: x2008 firmware polls /iclock/getrequest.aspx (with .aspx).
  // Both variants must be handled or commands are never delivered.
  app.get(["/iclock/getrequest", "/iclock/getrequest.aspx"], async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const ip = clientIp(req);
    if (sn) {
      const device = await findDeviceBySerial(sn);
      if (device) {
        const authErr = authenticateDevice(req, device, ip);
        if (authErr) {
          console.warn(`[ADMS] REJECT GET getrequest SN=${sn} ip=${ip} reason="${authErr}"`);
          return res.status(401).type("text/plain").send("ERROR: unauthorized");
        }
        await touchDevice(device.id, ip);

        const cmds = drainCommands(device.id);
        if (cmds.length > 0) {
          // Command IDs must be small sequential integers — x2008 firmware
          // silently ignores commands with large IDs (e.g. Date.now()).
          const lines = cmds.map((c) => `C:${nextCmdId++}:${c}`);
          // Wrap around to avoid ever sending very large IDs
          if (nextCmdId > 9999) nextCmdId = 1;
          const cmdStr = cmds.join(" | ");
          console.log(`[ADMS] DELIVER cmds=${cmds.length} SN=${sn}: ${cmdStr}`);
          admsLog("OUT", sn, `CMDS: ${cmdStr}`);
          return res.type("text/plain").send(lines.join(NEW_LINE));
        }
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
          console.log(`[ADMS] devicecmd result SN=${sn}: ${body.slice(0, 200)}`);
          admsLog("IN", sn, `devicecmd: ${body.slice(0, 200)}`);
        }
      }
    }
    res.type("text/plain").send("OK");
  });

  // Some firmwares ping a plain root path on /iclock/ — keep it cheap.
  app.get("/iclock/ping", (_req: Request, res: Response) => {
    res.type("text/plain").send("OK");
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
  // Biometric devices send tab-separated payloads with no JSON content-type.
  admsApp.use(express.text({ type: "*/*", limit: "5mb" }));
  // Trust one proxy hop so req.ip is correct when the device pushes via NAT.
  admsApp.set("trust proxy", 1);
  // Mount all ZKTeco ADMS endpoints.
  registerAdmsRoutes(admsApp);
  // Catch-all health check so the device can verify connectivity on this port.
  admsApp.use((_req, res) => res.type("text/plain").send("HRMS ADMS server OK"));
  return admsApp;
}

/**
 * Try to bind the ADMS server to ADMS_PORT.
 * If port is already in use (e.g. rolling restart), retry up to maxRetries times
 * with a short delay so the old process has time to release the socket.
 */
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
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (attempt < maxRetries) {
        console.warn(
          `[ADMS] Port ${ADMS_PORT} in use (attempt ${attempt}/${maxRetries}) — ` +
          `retrying in ${retryDelayMs / 1000}s…`
        );
        // Must close before re-listening
        server.close(() => {
          setTimeout(tryListen, retryDelayMs);
        });
      } else {
        console.error(
          `[ADMS] Port ${ADMS_PORT} still in use after ${maxRetries} attempts. ` +
          `Devices can still push via the main app port.`
        );
      }
    } else {
      console.error("[ADMS] Server error:", err);
    }
  });

  tryListen();
  return server;
}
