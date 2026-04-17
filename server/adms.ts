import type { Express, Request, Response } from "express";
import { storage } from "./storage";

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

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string) || "";
  return (fwd.split(",")[0] || req.socket.remoteAddress || "").trim();
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
    const punchCompanyId = employee?.companyId || device.companyId;
    if (!punchCompanyId) {
      // Shared device + no employee mapping — there is no company to attach
      // this punch to. Count it as unmapped and move on.
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
  app.get("/iclock/cdata", async (req: Request, res: Response) => {
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

    const fw = String(req.query.pushver || req.query.PushVersion || "").trim();
    await touchDevice(device.id, ip, { firmwareVersion: fw || undefined });

    const lines = [
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=0`,
      `OPERLOGStamp=0`,
      `ATTPHOTOStamp=0`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=00:00;14:05`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag`,
      `TimeZone=8`,
      `Realtime=1`,
      `Encrypt=None`,
      ``,
    ];
    res.type("text/plain").send(lines.join(NEW_LINE));
  });

  // The actual data push. Body is tab-separated lines; we got a `text`
  // body parser mounted under /iclock so `req.body` is always a string.
  app.post("/iclock/cdata", async (req: Request, res: Response) => {
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
    } else {
      // OPERLOG / USERINFO / FINGERTMP / ATTPHOTO etc — acknowledge so the
      // device clears its queue. We don't store user/fingerprint blobs.
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
      if (device) await touchDevice(device.id, ip);
    }
    res.type("text/plain").send("OK");
  });

  // Device reports back result of a command we sent. Ack and discard.
  app.post("/iclock/devicecmd", async (req: Request, res: Response) => {
    const sn = String(req.query.SN || "").trim();
    const ip = clientIp(req);
    if (sn) {
      const device = await findDeviceBySerial(sn);
      if (device) await touchDevice(device.id, ip);
    }
    res.type("text/plain").send("OK");
  });

  // Some firmwares ping a plain root path on /iclock/ — keep it cheap.
  app.get("/iclock/ping", (_req: Request, res: Response) => {
    res.type("text/plain").send("OK");
  });
}
