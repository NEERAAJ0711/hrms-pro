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
}
