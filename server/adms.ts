import type { Express, Request, Response } from "express";
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
let nextCmdId = Date.now();

const MAX_QUEUE_PER_DEVICE = 8;

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
  // Cheap path until we have a dedicated index lookup helper.
  const all = await storage.getAllBiometricDevices();
  return all.find((d) => d.deviceSerial === serial);
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
async function processUserRecords(
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

async function processAttlog(
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
    const parts = line.split("\t");
    if (parts.length < 2) {
      out.bad++;
      continue;
    }
    const [pin, ts, status] = parts;
    const split = splitTimestamp(ts);
    if (!split) {
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

export function registerAdmsRoutes(app: Express) {
  // Handshake / config pull. Some firmwares hit this on every wakeup;
  // others only on first boot. The body of our response tells the device
  // what to push and how often.
  app.get(["/iclock/cdata", "/iclock/cdata.aspx"], async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const ip = clientIp(req);
    if (!sn) return res.status(400).type("text/plain").send("ERROR: missing SN");
    const device = await findDeviceBySerial(sn);
    console.log(`[ADMS] GET /iclock/cdata SN=${sn} ip=${ip} known=${!!device}`);
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

    // Build current IST datetime string to sync the device clock
    const nowUtc = new Date();
    const istMs = nowUtc.getTime() + 5.5 * 60 * 60 * 1000;
    const istDate = new Date(istMs);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const istDateStr = `${istDate.getUTCFullYear()}-${pad2(istDate.getUTCMonth() + 1)}-${pad2(istDate.getUTCDate())} ${pad2(istDate.getUTCHours())}:${pad2(istDate.getUTCMinutes())}:${pad2(istDate.getUTCSeconds())}`;

    const lines = [
      `GET OPTION FROM: ${sn}`,
      `Stamp=0`,
      `ATTLOGStamp=0`,
      `OPERLOGStamp=0`,
      `ATTPHOTOStamp=0`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=00:00;01:00;02:00;03:00;04:00;05:00;06:00;07:00;08:00;09:00;10:00;11:00;12:00;13:00;14:00;15:00;16:00;17:00;18:00;19:00;20:00;21:00;22:00;23:00`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag`,
      `TimeZone=5.5`,
      `Date=${istDateStr}`,
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

    // Standard ADMS ack format: "OK: <Stamp>" tells the device to advance
    // its cursor past everything in this batch.
    res.type("text/plain").send(`OK: ${stamp}`);
  });

  // Device polling for queued commands. We don't push remote commands yet,
  // so always reply with the empty-OK response.
  app.get("/iclock/getrequest", async (req: Request, res: Response) => {
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
          const lines = cmds.map((c) => `C:${++nextCmdId}:${c}`);
          console.log(`[ADMS] DELIVER cmds=${cmds.length} SN=${sn}: ${cmds.join(" | ")}`);
          return res.type("text/plain").send(lines.join(NEW_LINE));
        }
      }
    }
    res.type("text/plain").send("OK");
  });

  // Device reports back result of a command we sent. Ack and discard.
  app.post("/iclock/devicecmd", async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const ip = clientIp(req);
    if (sn) {
      const device = await findDeviceBySerial(sn);
      if (device) {
        const authErr = authenticateDevice(req, device, ip);
        if (authErr) {
          console.warn(`[ADMS] REJECT POST devicecmd SN=${sn} ip=${ip} reason="${authErr}"`);
          return res.status(401).type("text/plain").send("ERROR: unauthorized");
        }
        await touchDevice(device.id, ip);
      }
    }
    res.type("text/plain").send("OK");
  });

  // Some firmwares ping a plain root path on /iclock/ — keep it cheap.
  app.get("/iclock/ping", (_req: Request, res: Response) => {
    res.type("text/plain").send("OK");
  });
}
