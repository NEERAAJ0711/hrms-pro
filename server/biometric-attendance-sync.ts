/**
 * Biometric Attendance Sync
 *
 * Reads unprocessed biometric_punch_logs (where employeeId is resolved)
 * and upserts daily attendance records automatically.
 *
 * Triggered:
 *  • Immediately after each ATTLOG batch is ingested (called from adms.ts)
 *  • Periodically every SWEEP_MS to catch logs whose employees were
 *    mapped after the punch was recorded
 */

import { randomUUID } from "crypto";
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  biometricPunchLogs,
  attendance,
  employees,
  timeOfficePolicies,
} from "../shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const SWEEP_MS = 5 * 60 * 1000; // every 5 minutes
let _sweepTimer: ReturnType<typeof setInterval> | null = null;

// Punch types that represent a clock-IN event
const IN_TYPES  = new Set(["in", "break-in", "overtime-in"]);
// Punch types that represent a clock-OUT event
const OUT_TYPES = new Set(["out", "break-out", "overtime-out"]);

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

/** Smallest HH:MM string in an array. */
function minTime(times: string[]): string {
  return times.reduce((a, b) => (toMinutes(a) <= toMinutes(b) ? a : b));
}

/** Largest HH:MM string in an array. */
function maxTime(times: string[]): string {
  return times.reduce((a, b) => (toMinutes(a) >= toMinutes(b) ? a : b));
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
      times:      { time: string; type: string }[];
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
    g.times.push({ time: log.punchTime, type: log.punchType || "unknown" });
  }

  // 3. Pre-fetch timeOfficePolicy for each unique (companyId, employeeId) pair
  const empPolicyCache = new Map<string, any>(); // empId → policy | null

  const uniqueEmpIds = [...new Set(logs.map((l) => l.employeeId!).filter(Boolean))];
  if (uniqueEmpIds.length) {
    // Fetch all employees at once
    const empRows = await db
      .select({ id: employees.id, timeOfficePolicyId: employees.timeOfficePolicyId })
      .from(employees)
      .where(inArray(employees.id, uniqueEmpIds));

    // Collect unique policy IDs
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

      // Classify punches
      const inPunches  = times.filter((t) => IN_TYPES.has(t.type)).map((t) => t.time);
      const outPunches = times.filter((t) => OUT_TYPES.has(t.type)).map((t) => t.time);
      const allTimes   = times.map((t) => t.time);

      // If no typed punches, treat first as IN, last as OUT
      let clockIn:  string | null = inPunches.length  ? minTime(inPunches)  : minTime(allTimes);
      let clockOut: string | null = outPunches.length ? maxTime(outPunches) : null;

      // If clockIn and clockOut are the same (only one punch, or device bug) → no clockOut
      if (clockOut && clockOut === clockIn) clockOut = null;

      // Don't use an "out" that is earlier than the "in" (shouldn't happen, but guard)
      if (clockOut && toMinutes(clockOut) <= toMinutes(clockIn)) clockOut = null;

      // Calculate workHours / status
      const policy = empPolicyCache.get(employeeId);
      const fullDayMinHours  = policy?.fullDayMinHours  ?? 8;
      const halfDayMinHours  = policy?.halfDayMinHours  ?? 4;
      const otAllowed        = policy?.otAllowed        ?? false;
      const dutyEndTime      = policy?.dutyEndTime      ?? "18:00";
      const dutyStartTime    = policy?.dutyStartTime    ?? "09:00";
      const normalDutyMins   = toMinutes(dutyEndTime) - toMinutes(dutyStartTime);

      let workHours:  string | null = null;
      let otHours:    string | null = null;
      let status = "present";

      if (clockIn && clockOut) {
        const workMin = toMinutes(clockOut) - toMinutes(clockIn);
        workHours = fromMinutes(Math.max(0, workMin));

        if (workMin >= fullDayMinHours * 60) {
          status = "present";
        } else if (workMin >= halfDayMinHours * 60) {
          status = "half_day";
        } else {
          status = "present"; // still present, just short shift
        }

        if (otAllowed && normalDutyMins > 0 && workMin > normalDutyMins) {
          otHours = fromMinutes(workMin - normalDutyMins);
        }
      }

      // 5. Check for existing attendance record
      const [existing] = await db
        .select({ id: attendance.id, clockIn: attendance.clockIn, clockOut: attendance.clockOut, clockInMethod: attendance.clockInMethod })
        .from(attendance)
        .where(
          and(
            eq(attendance.employeeId, employeeId),
            eq(attendance.companyId, companyId),
            eq(attendance.date, punchDate),
          )
        )
        .limit(1);

      if (existing) {
        // Update strategy:
        // - Always update clockOut / workHours / status when we have new data
        // - Preserve clockIn of non-biometric records (manual entries by HR)
        const updates: Record<string, any> = {};

        if (existing.clockInMethod === "biometric") {
          // Full overwrite — biometric owns this record
          updates.clockIn      = clockIn;
          updates.clockOut     = clockOut ?? existing.clockOut;
          updates.workHours    = workHours ?? null;
          updates.otHours      = otHours ?? null;
          updates.status       = status;
          updates.clockOutMethod = clockOut ? "biometric" : null;
        } else {
          // Non-biometric record: only fill in missing clockOut
          if (!existing.clockOut && clockOut) {
            updates.clockOut     = clockOut;
            updates.workHours    = workHours ?? null;
            updates.otHours      = otHours ?? null;
            updates.status       = status;
            updates.clockOutMethod = "biometric";
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
          id:              randomUUID(),
          employeeId,
          companyId,
          date:            punchDate,
          clockIn:         clockIn ?? undefined,
          clockOut:        clockOut ?? undefined,
          status,
          workHours:       workHours ?? undefined,
          otHours:         otHours ?? undefined,
          clockInMethod:   "biometric",
          clockOutMethod:  clockOut ? "biometric" : undefined,
          faceVerified:    false,
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

  // Run once immediately on startup (catches any backlog)
  setTimeout(() => processBiometricAttendance().catch(console.error), 5_000);

  _sweepTimer = setInterval(
    () => processBiometricAttendance().catch(console.error),
    SWEEP_MS
  );
}

/** One-shot trigger — called from adms.ts after each ATTLOG batch. */
export function triggerBiometricAttendanceSync(companyId?: string) {
  // Small delay to ensure the DB write is committed before we read it
  setTimeout(
    () => processBiometricAttendance(companyId).catch(console.error),
    500
  );
}
