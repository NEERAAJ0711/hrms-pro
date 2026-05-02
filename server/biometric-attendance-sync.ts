/**
 * Biometric Attendance Sync
 *
 * Reads unprocessed biometric_punch_logs (where employeeId is resolved)
 * and upserts daily attendance records automatically.
 *
 * Rules:
 *  • First punch of the day  → clockIn  (regardless of punch type)
 *  • Last punch of the day   → clockOut (regardless of punch type, only if different from first)
 *  • Max work window = 24 hrs (supports night-shift / round-the-clock workers).
 *    If an employee has a clockIn but no clockOut and 24 hours have elapsed
 *    (or it is a past day), the attendance record is marked "miss_punch".
 *
 *  • Night-shift cross-day fix: if an employee's policy has dutyStart > dutyEnd
 *    (e.g. 22:00–06:00) the clock-out punch arrives on the next calendar day.
 *    healNightShiftCrossDay() stitches these together into one complete record.
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
const MAX_WORK_HOURS = 24;       // supports round-the-clock / night-shift workers

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

/**
 * Cross-midnight-aware work minutes.
 * If clockOut time-of-day < clockIn time-of-day the shift spans midnight → add 24 h.
 */
function calcWorkMinutes(inHHMM: string, outHHMM: string): number {
  const diff = toMinutes(outHHMM) - toMinutes(inHHMM);
  return diff < 0 ? diff + 1440 : diff;
}

/**
 * Night-shift-aware normal duty minutes.
 * If dutyEnd < dutyStart the shift crosses midnight → add 24 h.
 */
function calcNormalDutyMinutes(startHHMM: string, endHHMM: string): number {
  const diff = toMinutes(endHHMM) - toMinutes(startHHMM);
  return diff <= 0 ? diff + 1440 : diff;
}

/** Today's date as "YYYY-MM-DD" in local time. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Return the calendar date that is one day after dateStr ("YYYY-MM-DD"). */
function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
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
      const normalDutyMins = calcNormalDutyMinutes(dutyStart, dutyEnd);
      if (normalDutyMins <= 0) continue;

      const rawWorkMin = calcWorkMinutes(row.clock_in, row.clock_out);
      const workMin = Math.min(rawWorkMin, MAX_WORK_HOURS * 60);
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

// ─── Retroactive miss-punch correction ────────────────────────────────────────

/**
 * For biometric attendance records that are currently status='miss_punch',
 * fetch ALL punch logs for that employee+date (regardless of isProcessed flag)
 * and recompute the attendance using first-punch=in / last-punch=out.
 * This self-heals records that were incorrectly stamped because punches arrived
 * in multiple sync waves (each wave only saw part of the day's punches).
 */
async function correctMissPunchFromAllLogs(): Promise<void> {
  try {
    // Find biometric miss_punch records
    const missPunchRows = await db.execute<{
      id: string;
      employee_id: string;
      company_id: string;
      date: string;
    }>(sql`
      SELECT id, employee_id, company_id, date
      FROM   attendance
      WHERE  status            = 'miss_punch'
        AND  clock_in_method   = 'biometric'
        AND  clock_in          IS NOT NULL
    `);

    if (!missPunchRows.rows.length) return;

    // Collect all unique (employeeId, date) pairs
    const pairs = missPunchRows.rows.map(r => ({ attId: r.id, employeeId: r.employee_id, companyId: r.company_id, date: r.date }));

    // Fetch all punch logs for those pairs (processed OR not)
    // Build a single query using OR conditions
    for (const pair of pairs) {
      const logRows = await db.execute<{ punch_time: string }>(sql`
        SELECT punch_time
        FROM   biometric_punch_logs
        WHERE  employee_id = ${pair.employeeId}
          AND  company_id  = ${pair.companyId}
          AND  punch_date  = ${pair.date}
          AND  punch_time  IS NOT NULL
        ORDER  BY punch_time ASC
      `);

      if (!logRows.rows.length) continue; // no punch data at all — nothing to heal

      const allTimes = logRows.rows.map(r => r.punch_time).filter(Boolean);
      const sorted   = [...new Set(allTimes)].sort((a, b) => toMinutes(a) - toMinutes(b));

      const mergedIn  = sorted[0];
      const mergedOut = sorted.length > 1 ? sorted[sorted.length - 1] : null;

      // If we only have one punch, restore to present (clock-in only).
      // The employee did come to work — keep clock_in and mark as present.
      if (!mergedOut || toMinutes(mergedOut) <= toMinutes(mergedIn)) {
        await db.execute(sql`
          UPDATE attendance
          SET clock_in   = ${mergedIn},
              clock_out  = NULL,
              work_hours = NULL,
              status     = 'present'
          WHERE id = ${pair.attId}
        `);
        console.log(`[BioAttSync] Corrected miss_punch → present (in-only) for employee ${pair.employeeId} on ${pair.date}`);
        continue;
      }

      const workMin   = calcWorkMinutes(mergedIn, mergedOut);
      const cappedMin = Math.min(workMin, MAX_WORK_HOURS * 60);
      const workHours = fromMinutes(Math.max(0, cappedMin));
      const newStatus = "present"; // has both in and out → present

      await db.execute(sql`
        UPDATE attendance
        SET clock_in    = ${mergedIn},
            clock_out   = ${mergedOut},
            work_hours  = ${workHours},
            status      = ${newStatus},
            clock_out_method = 'biometric'
        WHERE id = ${pair.attId}
      `);

      // Also mark all those logs as processed
      await db.execute(sql`
        UPDATE biometric_punch_logs
        SET is_processed = true
        WHERE employee_id = ${pair.employeeId}
          AND company_id  = ${pair.companyId}
          AND punch_date  = ${pair.date}
      `);

      console.log(`[BioAttSync] Corrected miss_punch → present for employee ${pair.employeeId} on ${pair.date} (${mergedIn}–${mergedOut})`);
    }
  } catch (err) {
    console.error("[BioAttSync] correctMissPunchFromAllLogs failed:", err);
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
    // Pass A: same-company match (biometric_device_id OR exact employee_code OR
    //         numeric-suffix of employee_code, e.g. "PSA7029" → "7029")
    await db.execute(sql`
      UPDATE biometric_punch_logs bpl
      SET employee_id = e.id
      FROM employees e
      WHERE bpl.employee_id IS NULL
        AND e.company_id = bpl.company_id
        AND (
          e.biometric_device_id = bpl.device_employee_id
          OR e.employee_code    = bpl.device_employee_id
          OR REGEXP_REPLACE(e.employee_code, '^[A-Za-z]+', '') = bpl.device_employee_id
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
    // Pass C: cross-company numeric-suffix match for contractors whose code
    //         has a letter prefix (e.g. "PSA7029" on another company's device)
    await db.execute(sql`
      UPDATE biometric_punch_logs bpl
      SET employee_id = e.id,
          company_id  = e.company_id
      FROM employees e
      WHERE bpl.employee_id IS NULL
        AND e.company_id != bpl.company_id
        AND REGEXP_REPLACE(e.employee_code, '^[A-Za-z]+', '') = bpl.device_employee_id
        ${companyClause}
    `);
  } catch (err) {
    console.error("[BioAttSync] Backfill update failed:", err);
  }

  // Run the miss-punch rule on every sweep cycle
  await applyMissPunchRule();

  // Retroactively correct miss_punch records that now have enough punches to
  // compute a valid in+out (handles staggered multi-wave sync arrivals).
  await correctMissPunchFromAllLogs();

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
      const normalDutyMins  = calcNormalDutyMinutes(dutyStartTime, dutyEndTime);

      let workHours: string | null = null;
      let otHours:   string | null = null;
      let status = "present";

      if (clockIn && clockOut) {
        const workMin = calcWorkMinutes(clockIn, clockOut);
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
          // Merge this batch's punches with the already-stored biometric times so
          // that arriving in multiple sync waves never loses the earliest clock-in
          // or the latest clock-out captured in a previous wave.
          const allTimes: string[] = [...times];
          if (existing.clockIn)  allTimes.push(existing.clockIn);
          if (existing.clockOut) allTimes.push(existing.clockOut);
          const allSorted = [...new Set(allTimes)].sort((a, b) => toMinutes(a) - toMinutes(b));

          const mergedIn:  string       = allSorted[0];
          const mergedOut: string | null = allSorted.length > 1 ? allSorted[allSorted.length - 1] : null;

          // Recalculate work/OT from the merged span
          let mergedWork:   string | null = null;
          let mergedOT:     string | null = null;
          let mergedStatus               = "present";
          if (mergedIn && mergedOut) {
            const workMin   = calcWorkMinutes(mergedIn, mergedOut);
            const cappedMin = Math.min(workMin, MAX_WORK_HOURS * 60);
            mergedWork = fromMinutes(Math.max(0, cappedMin));
            if (workMin >= fullDayMinHours * 60)      mergedStatus = "present";
            else if (workMin >= halfDayMinHours * 60) mergedStatus = "half_day";
            else                                       mergedStatus = "present";
            if (normalDutyMins > 0 && cappedMin > normalDutyMins)
              mergedOT = fromMinutes(cappedMin - normalDutyMins);
          }

          updates.clockIn        = mergedIn;
          updates.clockOut       = mergedOut;
          updates.workHours      = mergedWork;
          updates.otHours        = mergedOT;
          updates.status         = mergedStatus;
          updates.clockOutMethod = mergedOut ? "biometric" : null;
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

// ─── Night-shift cross-day healer ─────────────────────────────────────────────

/**
 * Fixes the scenario where a night-shift employee's clock-in punch (e.g. 22:00)
 * lands on Day N and their clock-out punch (e.g. 06:00) lands on Day N+1,
 * causing two separate miss_punch records instead of one complete present record.
 *
 * For each night-shift miss_punch on Day N (clock_in >= dutyStartTime):
 *   • Search biometric_punch_logs for Day N+1 punches <= dutyEndTime
 *   • Use the earliest such punch as Day N's clock_out
 *   • Recalculate workHours / otHours with cross-midnight arithmetic
 *   • Remove the orphaned miss_punch on Day N+1 if it was created from that punch
 */
async function healNightShiftCrossDay(): Promise<void> {
  try {
    const missPunchRows = await db.execute<{
      id: string;
      employee_id: string;
      company_id: string;
      date: string;
      clock_in: string;
    }>(sql`
      SELECT id, employee_id, company_id, date, clock_in
      FROM   attendance
      WHERE  status           = 'miss_punch'
        AND  clock_in_method  = 'biometric'
        AND  clock_in         IS NOT NULL
        AND  clock_out        IS NULL
    `);

    if (!missPunchRows.rows.length) return;

    const empIds = [...new Set(missPunchRows.rows.map(r => r.employee_id))];
    const empRows = await db
      .select({
        id:                 employees.id,
        companyId:          employees.companyId,
        timeOfficePolicyId: (employees as any).timeOfficePolicyId,
      })
      .from(employees)
      .where(inArray(employees.id, empIds));

    const policyIds = [
      ...new Set(empRows.map((e: any) => e.timeOfficePolicyId).filter(Boolean)),
    ] as string[];
    const policyMap = new Map<string, any>();
    if (policyIds.length) {
      const pols = await db
        .select()
        .from(timeOfficePolicies)
        .where(inArray(timeOfficePolicies.id, policyIds));
      for (const p of pols) policyMap.set(p.id, p);
    }
    const empMap = new Map(empRows.map((e: any) => [e.id, e]));

    // Threshold for "late evening" clock-in that could be a cross-midnight shift
    const LATE_IN_MIN  = 17 * 60; // 17:00 — heuristic for non-night-shift policies
    const EARLY_OUT_MAX = 12 * 60; // 12:00 — latest we accept as "next morning" punch

    let healed = 0;
    for (const row of missPunchRows.rows) {
      const emp: any = empMap.get(row.employee_id);
      if (!emp) continue;
      if (!row.clock_in) continue;

      const policy    = emp.timeOfficePolicyId ? policyMap.get(emp.timeOfficePolicyId) : null;
      const dutyStart = policy?.dutyStartTime ?? "09:00";
      const dutyEnd   = policy?.dutyEndTime   ?? "18:00";

      const isNightShiftPolicy = toMinutes(dutyStart) > toMinutes(dutyEnd);

      // For night-shift policies: clock-in must be >= dutyStart, next-day punch <= dutyEnd
      // For all other policies: clock-in must be >= 17:00, next-day punch <= 12:00
      const minClockInMin  = isNightShiftPolicy ? toMinutes(dutyStart) : LATE_IN_MIN;
      const maxNextPunchStr = isNightShiftPolicy ? dutyEnd : "12:00";

      if (toMinutes(row.clock_in) < minClockInMin) continue;

      const nextDay = nextDateStr(row.date);

      const nextDayPunches = await db.execute<{ punch_time: string }>(sql`
        SELECT punch_time
        FROM   biometric_punch_logs
        WHERE  employee_id = ${row.employee_id}
          AND  company_id  = ${row.company_id}
          AND  punch_date  = ${nextDay}
          AND  punch_time  IS NOT NULL
          AND  punch_time  <= ${maxNextPunchStr}
        ORDER  BY punch_time ASC
        LIMIT  1
      `);

      if (!nextDayPunches.rows.length) continue;

      const clockOut       = nextDayPunches.rows[0].punch_time;
      const workMin        = calcWorkMinutes(row.clock_in, clockOut);
      const cappedMin      = Math.min(workMin, MAX_WORK_HOURS * 60);
      // For cross-midnight work on a day-shift policy, normalDutyMins is a day span — use it as-is
      const normalDutyMins = calcNormalDutyMinutes(dutyStart, dutyEnd);
      const workHours      = fromMinutes(Math.max(0, cappedMin));
      const otHours        = (normalDutyMins > 0 && cappedMin > normalDutyMins)
        ? fromMinutes(cappedMin - normalDutyMins) : null;

      const fullDayMinHours = policy?.fullDayMinHours ?? 8;
      const halfDayMinHours = policy?.halfDayMinHours ?? 4;
      const newStatus =
        workMin >= fullDayMinHours * 60 ? "present"
          : workMin >= halfDayMinHours * 60 ? "half_day"
            : "present";

      // Update Day N attendance with the resolved clock_out
      await db.execute(sql`
        UPDATE attendance
        SET    clock_out         = ${clockOut},
               work_hours        = ${workHours},
               ot_hours          = ${otHours},
               status            = ${newStatus},
               clock_out_method  = 'biometric'
        WHERE  id = ${row.id}
      `);

      // Remove orphan Day N+1 miss_punch if it was created solely from this punch
      await db.execute(sql`
        DELETE FROM attendance
        WHERE  employee_id      = ${row.employee_id}
          AND  company_id       = ${row.company_id}
          AND  date             = ${nextDay}
          AND  clock_in         = ${clockOut}
          AND  clock_out        IS NULL
          AND  status           = 'miss_punch'
          AND  clock_in_method  = 'biometric'
      `);

      healed++;
      console.log(
        `[BioAttSync] Night-shift healed: emp ${row.employee_id} ${row.date} ` +
        `in=${row.clock_in} → out=${clockOut} (next day)`
      );
    }

    if (healed) {
      console.log(`[BioAttSync] Night-shift cross-day heal: fixed ${healed} record(s)`);
    }
  } catch (err) {
    console.error("[BioAttSync] healNightShiftCrossDay failed:", err);
  }
}

// ─── Background sweep ─────────────────────────────────────────────────────────

export function startBiometricAttendanceSync() {
  if (_sweepTimer) return;
  console.log(
    `[BioAttSync] Started — periodic sweep every ${SWEEP_MS / 60_000} min`
  );

  // Full OT backfill at startup — fixes ALL historical records with missing OT
  setTimeout(() => backfillBiometricOtHours(false).catch(console.error), 8_000);

  // Heal any existing night-shift cross-day miss_punch records at startup
  setTimeout(() => healNightShiftCrossDay().catch(console.error), 12_000);

  // Run once immediately on startup (catches any backlog + applies miss-punch rule)
  setTimeout(() => processBiometricAttendance().catch(console.error), 5_000);

  // Every regular sweep: process new punches, heal night-shift, then fill OT
  const runSweep = async () => {
    await processBiometricAttendance().catch(console.error);
    await healNightShiftCrossDay().catch(console.error);
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
