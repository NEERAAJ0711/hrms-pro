/**
 * Biometric Attendance Sync
 *
 * Reads unprocessed biometric_punch_logs (where employeeId is resolved)
 * and upserts daily attendance records automatically.
 *
 * Rules:
 *  • First punch of the day  → clockIn  (regardless of punch type)
 *  • Last punch of the day   → clockOut (regardless of punch type, only if different from first)
 *  • Max work window = 12 hrs. If an employee has a clockIn but no clockOut
 *    and 12 hours have elapsed (or it is a past day), the attendance record
 *    is marked "miss_punch" by the periodic sweep.
 *
 * Triggered:
 *  • Immediately after each ATTLOG batch is ingested (called from adms.ts)
 *  • Periodically every SWEEP_MS to catch logs whose employees were
 *    mapped after the punch was recorded
 */

import { randomUUID } from "crypto";
import { and, eq, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  biometricPunchLogs,
  attendance,
  employees,
  timeOfficePolicies,
} from "../shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const SWEEP_MS = 5 * 60 * 1000; // every 5 minutes
const MAX_WORK_HOURS = 12;       // employee must punch out within 12 hours

let _sweepTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "HH:MM" → total minutes from midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Convert total minutes → "HH:MM" string. */
function fromMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Today's date as "YYYY-MM-DD" in local time. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "HH:MM" string for (now − MAX_WORK_HOURS). Used for the today-miss-punch check. */
function cutoffTimeStr(): string {
  const d = new Date(Date.now() - MAX_WORK_HOURS * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── OT backfill ──────────────────────────────────────────────────────────────

/** Returns true when a stored ot_hours value means "zero" in any representation. */
function isZeroOt(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim();
  if (s === "" || s === "0") return true;
  // Handle "HH:MM" format — zero if both parts are 0
  const parts = s.split(":");
  if (parts.length === 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m) && h === 0 && m === 0) return true;
  }
  return false;
}

/**
 * Recalculate OT for biometric attendance records whose stored OT is zero/null
 * but whose actual work hours exceed the normal duty duration.
 *
 * @param recentOnly  true  → only look at last 7 days (fast, called every sweep)
 *                   false → scan all records (called once at startup)
 */
async function backfillBiometricOtHours(recentOnly = false): Promise<void> {
  try {
    // Fetch biometric records with both punches, reading stored ot_hours too
    const rows = await db.execute<{
      id: string;
      employee_id: string;
      company_id: string;
      clock_in: string;
      clock_out: string;
      ot_hours: string | null;
    }>(sql`
      SELECT id, employee_id, company_id, clock_in, clock_out, ot_hours
      FROM   attendance
      WHERE  clock_in_method = 'biometric'
        AND  clock_in  IS NOT NULL
        AND  clock_out IS NOT NULL
        ${recentOnly
          ? sql`AND date >= (CURRENT_DATE - INTERVAL '7 days')::text`
          : sql``}
    `);

    if (!rows.rows.length) return;

    // Keep only records where the stored OT looks like zero
    const toFix = rows.rows.filter(r => isZeroOt(r.ot_hours));
    if (!toFix.length) return;

    // Build employee → policy map
    const empIds = Array.from(new Set(toFix.map(r => r.employee_id)));
    const empRows = await db
      .select({ id: employees.id, timeOfficePolicyId: employees.timeOfficePolicyId, companyId: employees.companyId })
      .from(employees)
      .where(inArray(employees.id, empIds));

    const policyIds = Array.from(new Set(empRows.map(e => e.timeOfficePolicyId).filter(Boolean))) as string[];
    const policyMap = new Map<string, any>();
    if (policyIds.length) {
      const pols = await db.select().from(timeOfficePolicies).where(inArray(timeOfficePolicies.id, policyIds));
      for (const p of pols) policyMap.set(p.id, p);
    }

    // Also fetch company-default policies
    const companyIds = Array.from(new Set(empRows.map(e => e.companyId)));
    const defaultPolicies = new Map<string, any>();
    if (companyIds.length) {
      const defs = await db
        .select()
        .from(timeOfficePolicies)
        .where(and(
          inArray(timeOfficePolicies.companyId, companyIds),
          eq(timeOfficePolicies.status, "active"),
        ));
      for (const p of defs) {
        if ((p as any).isDefault && !defaultPolicies.has(p.companyId)) {
          defaultPolicies.set(p.companyId, p);
        }
      }
      // fallback: first active policy per company
      for (const p of defs) {
        if (!defaultPolicies.has(p.companyId)) defaultPolicies.set(p.companyId, p);
      }
    }

    const empMap = new Map(empRows.map(e => [e.id, e]));

    let updated = 0;
    for (const row of toFix) {
      const emp = empMap.get(row.employee_id);
      let policy: any = null;
      if (emp?.timeOfficePolicyId) policy = policyMap.get(emp.timeOfficePolicyId) ?? null;
      if (!policy && emp) policy = defaultPolicies.get(emp.companyId) ?? null;

      const dutyStart = policy?.dutyStartTime ?? "09:00";
      const dutyEnd   = policy?.dutyEndTime   ?? "18:00";
      const normalDutyMins = toMinutes(dutyEnd) - toMinutes(dutyStart);
      if (normalDutyMins <= 0) continue;

      const rawWorkMin = toMinutes(row.clock_out) - toMinutes(row.clock_in);
      const workMin = Math.min(rawWorkMin, MAX_WORK_HOURS * 60); // cap at 12h
      if (workMin <= normalDutyMins) continue; // genuinely no OT for this record

      const otHoursStr = fromMinutes(workMin - normalDutyMins);

      await db.execute(sql`
        UPDATE attendance
        SET ot_hours = ${otHoursStr}
        WHERE id = ${row.id}
      `);
      updated++;
    }

    if (updated) console.log(`[BioAttSync] OT backfill${recentOnly ? " (recent)" : ""}: fixed ${updated} record(s)`);
  } catch (err) {
    console.error("[BioAttSync] backfillBiometricOtHours failed:", err);
  }
}

// ─── Miss-punch sweep ──────────────────────────────────────────────────────────

/**
 * Mark attendance records as "miss_punch" when:
 *  • clockIn is set, clockOut is null
 *  • Either: the date is before today (past day with no out punch)
 *  • Or:     the date is today AND clockIn is ≤ (now − 12 h)
 * Does NOT overwrite leave / holiday / weekend / absent records.
 */
async function applyMissPunchRule(): Promise<void> {
  const today   = todayStr();
  const cutoff  = cutoffTimeStr();
  const safe    = `status NOT IN ('absent','on_leave','holiday','weekend','miss_punch')`;

  try {
    // Past days with no clock-out
    await db.execute(sql`
      UPDATE attendance
      SET status = 'miss_punch'
      WHERE clock_in  IS NOT NULL
        AND clock_out IS NULL
        AND date      <  ${today}
        AND ${sql.raw(safe)}
    `);

    // Today: clock-in was more than MAX_WORK_HOURS ago and still no clock-out
    await db.execute(sql`
      UPDATE attendance
      SET status = 'miss_punch'
      WHERE clock_in  IS NOT NULL
        AND clock_out IS NULL
        AND date      =  ${today}
        AND clock_in  <= ${cutoff}
        AND ${sql.raw(safe)}
    `);
  } catch (err) {
    console.error("[BioAttSync] applyMissPunchRule failed:", err);
  }
}

// ─── Core processor ───────────────────────────────────────────────────────────

interface ProcessResult {
  processed: number;
  skipped:   number;
  errors:    number;
}

export async function processBiometricAttendance(
  companyFilter?: string,
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, errors: 0 };

  // 0. Retroactive backfill: for any punch log where employeeId is still null,
  //    try to resolve via biometric_device_id OR employee_code = device PIN.
  //    This self-heals records that arrived before the employee was configured.
  try {
    const companyClause = companyFilter
      ? sql`AND bpl.company_id = ${companyFilter}`
      : sql``;
    // Pass A: same-company match (employee_code OR biometric_device_id)
    await db.execute(sql`
      UPDATE biometric_punch_logs bpl
      SET employee_id = e.id
      FROM employees e
      WHERE bpl.employee_id IS NULL
        AND e.company_id = bpl.company_id
        AND (
          e.biometric_device_id = bpl.device_employee_id
          OR e.employee_code    = bpl.device_employee_id
        )
        ${companyClause}
    `);
    // Pass B: cross-company match via explicit biometric_device_id mapping.
    // Handles contractor employees who punch on the principal employer's device —
    // their punch logs carry the device's company_id, not their own.
    // We also correct company_id in those logs so attendance is created under
    // the right (employee's) company.
    await db.execute(sql`
      UPDATE biometric_punch_logs bpl
      SET employee_id = e.id,
          company_id  = e.company_id
      FROM employees e
      WHERE bpl.employee_id IS NULL
        AND e.biometric_device_id = bpl.device_employee_id
        AND e.company_id != bpl.company_id
        ${companyClause}
    `);
  } catch (err) {
    console.error("[BioAttSync] Backfill update failed:", err);
  }

  // Run the miss-punch rule on every sweep cycle
  await applyMissPunchRule();

  // 1. Fetch all unprocessed logs where the employee has been resolved
  const logs = await db
    .select({
      id:             biometricPunchLogs.id,
      companyId:      biometricPunchLogs.companyId,
      employeeId:     biometricPunchLogs.employeeId,
      punchDate:      biometricPunchLogs.punchDate,
      punchTime:      biometricPunchLogs.punchTime,
      punchType:      biometricPunchLogs.punchType,
    })
    .from(biometricPunchLogs)
    .where(
      and(
        eq(biometricPunchLogs.isProcessed, false),
        isNotNull(biometricPunchLogs.employeeId),
        companyFilter
          ? eq(biometricPunchLogs.companyId, companyFilter)
          : sql`TRUE`,
      )
    );

  if (!logs.length) return result;

  // 2. Group by companyId + employeeId + punchDate
  const groups = new Map<
    string,
    {
      companyId:  string;
      employeeId: string;
      punchDate:  string;
      logIds:     string[];
      times:      string[];   // HH:MM strings (all punches for this day)
    }
  >();

  for (const log of logs) {
    if (!log.employeeId || !log.companyId || !log.punchDate || !log.punchTime) {
      result.skipped++;
      continue;
    }
    const key = `${log.companyId}::${log.employeeId}::${log.punchDate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        companyId:  log.companyId,
        employeeId: log.employeeId,
        punchDate:  log.punchDate,
        logIds:     [],
        times:      [],
      });
    }
    const g = groups.get(key)!;
    g.logIds.push(log.id);
    g.times.push(log.punchTime);
  }

  // 3. Pre-fetch timeOfficePolicy for each unique (companyId, employeeId) pair
  const empPolicyCache = new Map<string, any>(); // empId → policy | null

  const uniqueEmpIds = [...new Set(logs.map((l) => l.employeeId!).filter(Boolean))];
  if (uniqueEmpIds.length) {
    const empRows = await db
      .select({ id: employees.id, timeOfficePolicyId: employees.timeOfficePolicyId })
      .from(employees)
      .where(inArray(employees.id, uniqueEmpIds));

    const policyIds = [...new Set(empRows.map((e) => e.timeOfficePolicyId).filter(Boolean))] as string[];
    const policyMap = new Map<string, any>();
    if (policyIds.length) {
      const pols = await db
        .select()
        .from(timeOfficePolicies)
        .where(inArray(timeOfficePolicies.id, policyIds));
      for (const pol of pols) policyMap.set(pol.id, pol);
    }

    for (const emp of empRows) {
      empPolicyCache.set(emp.id, emp.timeOfficePolicyId ? (policyMap.get(emp.timeOfficePolicyId) ?? null) : null);
    }
  }

  // 4. Process each group
  for (const [, grp] of groups) {
    try {
      const { companyId, employeeId, punchDate, logIds, times } = grp;

      // ── Punch classification ───────────────────────────────────────────────
      // Rule: first punch of the day = In Time; last punch = Out Time.
      // Punch type (in / out / unknown) is intentionally ignored here — many
      // devices send all events as the same type, so position in time is the
      // only reliable signal.
      const sorted = [...times].sort((a, b) => toMinutes(a) - toMinutes(b));

      const clockIn:  string | null = sorted.length > 0 ? sorted[0] : null;
      // Out is only set when there is a second, later punch
      let   clockOut: string | null = sorted.length > 1 ? sorted[sorted.length - 1] : null;

      // Safety: discard out that is not strictly after in (shouldn't happen)
      if (clockOut && clockIn && toMinutes(clockOut) <= toMinutes(clockIn)) {
        clockOut = null;
      }

      // ── OT / work-hours policy ─────────────────────────────────────────────
      const policy         = empPolicyCache.get(employeeId);
      const fullDayMinHours = policy?.fullDayMinHours ?? 8;
      const halfDayMinHours = policy?.halfDayMinHours ?? 4;
      const otAllowed       = policy?.otAllowed       ?? false;
      const dutyEndTime     = policy?.dutyEndTime     ?? "18:00";
      const dutyStartTime   = policy?.dutyStartTime   ?? "09:00";
      const normalDutyMins  = toMinutes(dutyEndTime) - toMinutes(dutyStartTime);

      let workHours: string | null = null;
      let otHours:   string | null = null;
      let status = "present";

      if (clockIn && clockOut) {
        const workMin = toMinutes(clockOut) - toMinutes(clockIn);
        // Cap at MAX_WORK_HOURS to ignore obviously bad data
        const cappedMin = Math.min(workMin, MAX_WORK_HOURS * 60);
        workHours = fromMinutes(Math.max(0, cappedMin));

        if (workMin >= fullDayMinHours * 60) {
          status = "present";
        } else if (workMin >= halfDayMinHours * 60) {
          status = "half_day";
        } else {
          status = "present"; // short shift still counts as present
        }

        if (normalDutyMins > 0 && cappedMin > normalDutyMins) {
          otHours = fromMinutes(cappedMin - normalDutyMins);
        }
      }
      // If no clockOut: status starts as "present"; the miss-punch sweep will
      // update it to "miss_punch" once 12 hours have elapsed.

      // 5. Check for existing attendance record
      const [existing] = await db
        .select({
          id:            attendance.id,
          clockIn:       attendance.clockIn,
          clockOut:      attendance.clockOut,
          clockInMethod: attendance.clockInMethod,
        })
        .from(attendance)
        .where(
          and(
            eq(attendance.employeeId, employeeId),
            eq(attendance.companyId,  companyId),
            eq(attendance.date,       punchDate),
          )
        )
        .limit(1);

      if (existing) {
        const updates: Record<string, any> = {};

        if (existing.clockInMethod === "biometric") {
          // Full overwrite — biometric owns this record
          updates.clockIn         = clockIn;
          updates.clockOut        = clockOut ?? existing.clockOut;
          updates.workHours       = workHours ?? null;
          updates.otHours         = otHours ?? null;
          updates.status          = status;
          updates.clockOutMethod  = clockOut ? "biometric" : null;
        } else {
          // Non-biometric record: only fill in missing clockOut
          if (!existing.clockOut && clockOut) {
            updates.clockOut        = clockOut;
            updates.workHours       = workHours ?? null;
            updates.otHours         = otHours ?? null;
            updates.status          = status;
            updates.clockOutMethod  = "biometric";
          }
        }

        if (Object.keys(updates).length) {
          await db
            .update(attendance)
            .set(updates)
            .where(eq(attendance.id, existing.id));
        }
      } else {
        // Insert new attendance record
        await db.insert(attendance).values({
          id:             randomUUID(),
          employeeId,
          companyId,
          date:           punchDate,
          clockIn:        clockIn   ?? undefined,
          clockOut:       clockOut  ?? undefined,
          status,
          workHours:      workHours ?? undefined,
          otHours:        otHours   ?? undefined,
          clockInMethod:  "biometric",
          clockOutMethod: clockOut  ? "biometric" : undefined,
          faceVerified:   false,
        });
      }

      // 6. Mark all punch logs for this group as processed
      await db
        .update(biometricPunchLogs)
        .set({ isProcessed: true })
        .where(inArray(biometricPunchLogs.id, logIds));

      result.processed++;
    } catch (err) {
      console.error(
        `[BioAttSync] Error processing ${grp.employeeId} ${grp.punchDate}:`,
        err
      );
      result.errors++;
    }
  }

  if (result.processed || result.errors) {
    console.log(
      `[BioAttSync] processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`
    );
  }

  return result;
}

// ─── Background sweep ─────────────────────────────────────────────────────────

export function startBiometricAttendanceSync() {
  if (_sweepTimer) return;
  console.log(
    `[BioAttSync] Started — periodic sweep every ${SWEEP_MS / 60_000} min`
  );

  // Full OT backfill at startup — fixes ALL historical records with missing OT
  setTimeout(() => backfillBiometricOtHours(false).catch(console.error), 8_000);

  // Run once immediately on startup (catches any backlog + applies miss-punch rule)
  setTimeout(() => processBiometricAttendance().catch(console.error), 5_000);

  // Every regular sweep: process new punches, then heal any recent records with OT=0
  const runSweep = async () => {
    await processBiometricAttendance().catch(console.error);
    await backfillBiometricOtHours(true).catch(console.error); // last 7 days only
  };

  _sweepTimer = setInterval(() => runSweep(), SWEEP_MS);
}

/** One-shot trigger — called from adms.ts after each ATTLOG batch. */
export function triggerBiometricAttendanceSync(companyId?: string) {
  // Small delay to ensure the DB write is committed before we read it
  setTimeout(
    () => processBiometricAttendance(companyId).catch(console.error),
    500
  );
}
