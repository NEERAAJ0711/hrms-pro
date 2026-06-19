import {
  type User,
  type InsertUser,
  type Company,
  type InsertCompany,
  type Employee,
  type InsertEmployee,
  type DashboardStats,
  type Attendance,
  type InsertAttendance,
  type LeaveType,
  type InsertLeaveType,
  type LeaveRequest,
  type InsertLeaveRequest,
  type SalaryStructure,
  type InsertSalaryStructure,
  type Payroll,
  type InsertPayroll,
  type Setting,
  type InsertSetting,
  type MasterDepartment,
  type InsertMasterDepartment,
  type WageGrade,
  type InsertWageGrade,
  type MasterDesignation,
  type InsertMasterDesignation,
  type MasterLocation,
  type InsertMasterLocation,
  type EarningHead,
  type InsertEarningHead,
  type DeductionHead,
  type InsertDeductionHead,
  type StatutorySettings,
  type InsertStatutorySettings,
  type TimeOfficePolicy,
  type InsertTimeOfficePolicy,
  type FnfSettlement,
  type InsertFnfSettlement,
  type Holiday,
  type InsertHoliday,
  type BiometricPunchLog,
  type InsertBiometricPunchLog,
  type BiometricDevice,
  type InsertBiometricDevice,
  type JobPosting,
  type InsertJobPosting,
  type JobApplication,
  type InsertJobApplication,
  type CandidateProfile,
  type InsertCandidateProfile,
  type PreviousExperience,
  type InsertPreviousExperience,
  type LoanAdvance,
  type InsertLoanAdvance,
  type UserPermission,
  type ModuleAccessRequest,
  type CompanyContractor,
  type InsertCompanyContractor,
  type ContractorMaster,
  type InsertContractorMaster,
  type LeavePolicy,
  type InsertLeavePolicy,
  type KraTemplate,
  type InsertKraTemplate,
  type KraTemplateKpi,
  type InsertKraTemplateKpi,
  type KraAssignment,
  type InsertKraAssignment,
  type KraAssignmentKpi,
  type InsertKraAssignmentKpi,
  leavePolicies,
  contractorMasters,
  companyContractors,
  contractorEmployees,
  companies,
  users,
  employees,
  attendance,
  leaveTypes,
  leaveRequests,
  salaryStructures,
  payroll,
  settings,
  masterDepartments,
  wageGrades,
  masterDesignations,
  masterLocations,
  earningHeads,
  deductionHeads,
  statutorySettings,
  timeOfficePolicies,
  kraTemplates,
  kraTemplateKpis,
  kraAssignments,
  kraAssignmentKpis,
  fnfSettlements,
  holidays,
  biometricPunchLogs,
  biometricDevices,
  jobPostings,
  jobApplications,
  candidateProfiles,
  previousExperiences,
  loanAdvances,
  userPermissions,
  moduleAccessRequests,
  expenses,
  leaveAdjustments,
  compOffApplications,
  outdoorEntries,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, count, or } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "crypto";

// BiometricRepository — DB access for the Biometric domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class BiometricRepository {
  async getBiometricPunchLog(id: string): Promise<BiometricPunchLog | undefined> {
    const result = await db.select().from(biometricPunchLogs).where(eq(biometricPunchLogs.id, id));
    return result[0];
  }

  async getBiometricPunchLogsByCompany(companyId: string): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs).where(eq(biometricPunchLogs.companyId, companyId));
  }

  async getBiometricPunchLogsByDate(companyId: string, date: string): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs).where(
      and(eq(biometricPunchLogs.companyId, companyId), eq(biometricPunchLogs.punchDate, date))
    );
  }

  async createBiometricPunchLog(log: InsertBiometricPunchLog): Promise<BiometricPunchLog> {
    const id = randomUUID();
    const result = await db.insert(biometricPunchLogs).values({ ...log, id }).returning();
    return result[0];
  }

  async updateBiometricPunchLog(id: string, log: Partial<InsertBiometricPunchLog>): Promise<BiometricPunchLog | undefined> {
    const result = await db.update(biometricPunchLogs).set(log).where(eq(biometricPunchLogs.id, id)).returning();
    return result[0];
  }

  async deleteBiometricPunchLog(id: string): Promise<boolean> {
    const result = await db.delete(biometricPunchLogs).where(eq(biometricPunchLogs.id, id)).returning();
    return result.length > 0;
  }

  async getAllBiometricPunchLogs(): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs);
  }

  async findDuplicatePunchLog(companyId: string, deviceEmployeeId: string, punchTime: string, punchDate: string): Promise<BiometricPunchLog | undefined> {
    const result = await db.select().from(biometricPunchLogs).where(
      and(
        eq(biometricPunchLogs.companyId, companyId),
        eq(biometricPunchLogs.deviceEmployeeId, deviceEmployeeId),
        eq(biometricPunchLogs.punchTime, punchTime),
        eq(biometricPunchLogs.punchDate, punchDate)
      )
    );
    return result[0];
  }

  async getBiometricDevice(id: string): Promise<BiometricDevice | undefined> {
    const result = await db.select().from(biometricDevices).where(eq(biometricDevices.id, id));
    return result[0];
  }

  async getBiometricDevicesByCompany(companyId: string): Promise<BiometricDevice[]> {
    // Include shared devices (companyId IS NULL) — those serve every company
    return await db
      .select()
      .from(biometricDevices)
      .where(or(eq(biometricDevices.companyId, companyId), isNull(biometricDevices.companyId)));
  }

  async createBiometricDevice(device: InsertBiometricDevice): Promise<BiometricDevice> {
    const id = randomUUID();
    const result = await db.insert(biometricDevices).values({ ...device, id }).returning();
    return result[0];
  }

  async updateBiometricDevice(id: string, device: Partial<InsertBiometricDevice>): Promise<BiometricDevice | undefined> {
    const result = await db.update(biometricDevices).set(device).where(eq(biometricDevices.id, id)).returning();
    return result[0];
  }

  async deleteBiometricDevice(id: string): Promise<boolean> {
    const result = await db.delete(biometricDevices).where(eq(biometricDevices.id, id)).returning();
    return result.length > 0;
  }

  async getAllBiometricDevices(): Promise<BiometricDevice[]> {
    return await db.select().from(biometricDevices);
  }

  async getDeviceUsersRoster(deviceId: string, deviceCompanyId: string | null) {
    return await db.execute(sql`
        WITH pin_union AS (
          SELECT device_employee_id FROM biometric_device_users
            WHERE device_id = ${deviceId}
          UNION
          SELECT DISTINCT device_employee_id FROM biometric_punch_logs
            WHERE device_id = ${deviceId}
        ),
        punch_agg AS (
          SELECT
            device_employee_id,
            COUNT(*)::int                              AS punch_count,
            MAX(punch_date || ' ' || punch_time)       AS last_punch_at,
            MAX(employee_id)                           AS employee_id
          FROM biometric_punch_logs
          WHERE device_id = ${deviceId}
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
          ON du.device_id = ${deviceId}
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
         AND ecode.company_id   = ${deviceCompanyId ?? null}
        ORDER BY (du.device_employee_id IS NOT NULL) DESC,
                 pa.last_punch_at DESC NULLS LAST,
                 p.device_employee_id ASC
        LIMIT 2000
      `);
  }

  async deleteAllPunchLogs() {
    return await db.execute(sql.raw(`DELETE FROM biometric_punch_logs`));
  }

  async correctPunchTimezone(sign: string, intervalSql: string) {
    return await db.execute(sql.raw(`
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
  }

  async updateDeviceUserName(deviceId: string, pin: string, fullName: string) {
    return await db.execute(sql`
              UPDATE biometric_device_users
              SET name = ${fullName}
              WHERE device_id = ${deviceId}
                AND device_employee_id = ${pin}
                AND (name IS NULL OR name = '')
            `);
  }

  async deleteDeviceUser(deviceId: string, pin: string) {
    return await db.execute(sql`
        DELETE FROM biometric_device_users
        WHERE device_id = ${deviceId} AND device_employee_id = ${pin}
      `);
  }

  async linkPunchLogsToEmployee(employeeId: string, companyId: string, devicePin: string, deviceClause: any) {
    return await db.execute(sql`
        UPDATE biometric_punch_logs
        SET employee_id = ${employeeId},
            company_id  = ${companyId}
        WHERE device_employee_id = ${devicePin}
          ${deviceClause}
          AND (employee_id IS NULL OR employee_id != ${employeeId})
      `);
  }

  async getEnrichedPunchLogs(companyFilter: any, dateFilter: any) {
    return await db.execute(sql`
        SELECT
          bpl.id,
          bpl.company_id          AS "companyId",
          bpl.employee_id         AS "employeeId",
          bpl.device_employee_id  AS "deviceEmployeeId",
          bpl.punch_date          AS "punchDate",
          bpl.punch_time          AS "punchTime",
          bpl.punch_type          AS "punchType",
          bpl.punch_type_override AS "punchTypeOverride",
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
  }

  async overridePunchType(id: string, punchType: string, companyClause: any) {
    return await db.execute(sql`
        UPDATE biometric_punch_logs
        SET punch_type          = ${punchType},
            punch_type_override = true,
            is_processed        = false,
            synced_at           = NULL
        WHERE id = ${id}
          ${companyClause}
      `);
  }

  async getPunchLogClassificationData(id: string) {
    return await db.execute<{
        employee_id: string; punch_date: string; company_id: string;
      }>(sql`SELECT employee_id, punch_date, company_id FROM biometric_punch_logs WHERE id = ${id}`);
  }
}
