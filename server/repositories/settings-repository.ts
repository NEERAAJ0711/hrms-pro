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

// SettingsRepository — DB access for the Settings domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class SettingsRepository {
  async getSetting(id: string): Promise<Setting | undefined> {
    const result = await db.select().from(settings).where(eq(settings.id, id));
    return result[0];
  }

  async getSettingByKey(companyId: string | null, key: string): Promise<Setting | undefined> {
    const companyFilter = companyId === null ? isNull(settings.companyId) : eq(settings.companyId, companyId);
    const result = await db.select().from(settings).where(and(companyFilter, eq(settings.key, key)));
    return result[0];
  }

  async getSettingsByCategory(companyId: string | null, category: string): Promise<Setting[]> {
    const companyFilter = companyId === null ? isNull(settings.companyId) : eq(settings.companyId, companyId);
    return await db.select().from(settings).where(and(companyFilter, eq(settings.category, category)));
  }

  async createSetting(setting: InsertSetting): Promise<Setting> {
    const id = randomUUID();
    const result = await db.insert(settings).values({ ...setting, id }).returning();
    return result[0];
  }

  async updateSetting(id: string, setting: Partial<InsertSetting>): Promise<Setting | undefined> {
    const result = await db.update(settings).set(setting).where(eq(settings.id, id)).returning();
    return result[0];
  }

  async deleteSetting(id: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.id, id)).returning();
    return result.length > 0;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async getMasterDepartment(id: string): Promise<MasterDepartment | undefined> {
    const result = await db.select().from(masterDepartments).where(eq(masterDepartments.id, id));
    return result[0];
  }

  async getAllMasterDepartments(): Promise<MasterDepartment[]> {
    return await db.select().from(masterDepartments);
  }

  async getMasterDepartmentsByCompany(companyId: string): Promise<MasterDepartment[]> {
    return await db.select().from(masterDepartments).where(eq(masterDepartments.companyId, companyId));
  }

  async createMasterDepartment(dept: InsertMasterDepartment): Promise<MasterDepartment> {
    const id = randomUUID();
    const result = await db.insert(masterDepartments).values({ ...dept, id }).returning();
    return result[0];
  }

  async updateMasterDepartment(id: string, dept: Partial<InsertMasterDepartment>): Promise<MasterDepartment | undefined> {
    const result = await db.update(masterDepartments).set(dept).where(eq(masterDepartments.id, id)).returning();
    return result[0];
  }

  async deleteMasterDepartment(id: string): Promise<boolean> {
    const result = await db.delete(masterDepartments).where(eq(masterDepartments.id, id)).returning();
    return result.length > 0;
  }

  async getMasterDesignation(id: string): Promise<MasterDesignation | undefined> {
    const result = await db.select().from(masterDesignations).where(eq(masterDesignations.id, id));
    return result[0];
  }

  async getAllMasterDesignations(): Promise<MasterDesignation[]> {
    return await db.select().from(masterDesignations);
  }

  async getMasterDesignationsByCompany(companyId: string): Promise<MasterDesignation[]> {
    return await db.select().from(masterDesignations).where(eq(masterDesignations.companyId, companyId));
  }

  async createMasterDesignation(desg: InsertMasterDesignation): Promise<MasterDesignation> {
    const id = randomUUID();
    const result = await db.insert(masterDesignations).values({ ...desg, id }).returning();
    return result[0];
  }

  async updateMasterDesignation(id: string, desg: Partial<InsertMasterDesignation>): Promise<MasterDesignation | undefined> {
    const result = await db.update(masterDesignations).set(desg).where(eq(masterDesignations.id, id)).returning();
    return result[0];
  }

  async deleteMasterDesignation(id: string): Promise<boolean> {
    const result = await db.delete(masterDesignations).where(eq(masterDesignations.id, id)).returning();
    return result.length > 0;
  }

  async getMasterLocation(id: string): Promise<MasterLocation | undefined> {
    const result = await db.select().from(masterLocations).where(eq(masterLocations.id, id));
    return result[0];
  }

  async getAllMasterLocations(): Promise<MasterLocation[]> {
    return await db.select().from(masterLocations);
  }

  async getMasterLocationsByCompany(companyId: string): Promise<MasterLocation[]> {
    return await db.select().from(masterLocations).where(eq(masterLocations.companyId, companyId));
  }

  async createMasterLocation(loc: InsertMasterLocation): Promise<MasterLocation> {
    const id = randomUUID();
    const result = await db.insert(masterLocations).values({ ...loc, id }).returning();
    return result[0];
  }

  async updateMasterLocation(id: string, loc: Partial<InsertMasterLocation>): Promise<MasterLocation | undefined> {
    const result = await db.update(masterLocations).set(loc).where(eq(masterLocations.id, id)).returning();
    return result[0];
  }

  async deleteMasterLocation(id: string): Promise<boolean> {
    const result = await db.delete(masterLocations).where(eq(masterLocations.id, id)).returning();
    return result.length > 0;
  }

  async getEarningHead(id: string): Promise<EarningHead | undefined> {
    const result = await db.select().from(earningHeads).where(eq(earningHeads.id, id));
    return result[0];
  }

  async getEarningHeadsByCompany(companyId: string): Promise<EarningHead[]> {
    return await db.select().from(earningHeads).where(eq(earningHeads.companyId, companyId));
  }

  async createEarningHead(head: InsertEarningHead): Promise<EarningHead> {
    const id = randomUUID();
    const result = await db.insert(earningHeads).values({ ...head, id }).returning();
    return result[0];
  }

  async updateEarningHead(id: string, head: Partial<InsertEarningHead>): Promise<EarningHead | undefined> {
    const result = await db.update(earningHeads).set(head).where(eq(earningHeads.id, id)).returning();
    return result[0];
  }

  async deleteEarningHead(id: string): Promise<boolean> {
    const result = await db.delete(earningHeads).where(eq(earningHeads.id, id)).returning();
    return result.length > 0;
  }

  async getDeductionHead(id: string): Promise<DeductionHead | undefined> {
    const result = await db.select().from(deductionHeads).where(eq(deductionHeads.id, id));
    return result[0];
  }

  async getDeductionHeadsByCompany(companyId: string): Promise<DeductionHead[]> {
    return await db.select().from(deductionHeads).where(eq(deductionHeads.companyId, companyId));
  }

  async createDeductionHead(head: InsertDeductionHead): Promise<DeductionHead> {
    const id = randomUUID();
    const result = await db.insert(deductionHeads).values({ ...head, id }).returning();
    return result[0];
  }

  async updateDeductionHead(id: string, head: Partial<InsertDeductionHead>): Promise<DeductionHead | undefined> {
    const result = await db.update(deductionHeads).set(head).where(eq(deductionHeads.id, id)).returning();
    return result[0];
  }

  async deleteDeductionHead(id: string): Promise<boolean> {
    const result = await db.delete(deductionHeads).where(eq(deductionHeads.id, id)).returning();
    return result.length > 0;
  }

  async getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined> {
    const result = await db.select().from(timeOfficePolicies).where(eq(timeOfficePolicies.id, id));
    return result[0];
  }

  async getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]> {
    return await db.select().from(timeOfficePolicies).where(eq(timeOfficePolicies.companyId, companyId));
  }

  async createTimeOfficePolicy(policy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy> {
    const id = randomUUID();
    const result = await db.insert(timeOfficePolicies).values({ ...policy, id }).returning();
    return result[0];
  }

  async updateTimeOfficePolicy(id: string, policy: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined> {
    const result = await db.update(timeOfficePolicies).set(policy).where(eq(timeOfficePolicies.id, id)).returning();
    return result[0];
  }

  async deleteTimeOfficePolicy(id: string): Promise<boolean> {
    const result = await db.delete(timeOfficePolicies).where(eq(timeOfficePolicies.id, id)).returning();
    return result.length > 0;
  }

  async getHoliday(id: string): Promise<Holiday | undefined> {
    const result = await db.select().from(holidays).where(eq(holidays.id, id));
    return result[0];
  }

  async getHolidaysByCompany(companyId: string): Promise<Holiday[]> {
    return await db.select().from(holidays).where(eq(holidays.companyId, companyId));
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const id = randomUUID();
    const result = await db.insert(holidays).values({ ...holiday, id }).returning();
    return result[0];
  }

  async updateHoliday(id: string, holiday: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    const result = await db.update(holidays).set(holiday).where(eq(holidays.id, id)).returning();
    return result[0];
  }

  async deleteHoliday(id: string): Promise<boolean> {
    const result = await db.delete(holidays).where(eq(holidays.id, id)).returning();
    return result.length > 0;
  }

  async getAllHolidays(): Promise<Holiday[]> {
    return await db.select().from(holidays);
  }

  async getWageGrade(id: string): Promise<WageGrade | undefined> {
    const result = await db.select().from(wageGrades).where(eq(wageGrades.id, id));
    return result[0];
  }

  async getAllWageGrades(): Promise<WageGrade[]> {
    return await db.select().from(wageGrades);
  }

  async getWageGradesByCompany(companyId: string): Promise<WageGrade[]> {
    return await db.select().from(wageGrades).where(eq(wageGrades.companyId, companyId));
  }

  async createWageGrade(grade: InsertWageGrade): Promise<WageGrade> {
    const id = randomUUID();
    const result = await db.insert(wageGrades).values({ ...grade, id }).returning();
    return result[0];
  }

  async updateWageGrade(id: string, grade: Partial<InsertWageGrade>): Promise<WageGrade | undefined> {
    const result = await db.update(wageGrades).set(grade).where(eq(wageGrades.id, id)).returning();
    return result[0];
  }

  async deleteWageGrade(id: string): Promise<boolean> {
    const result = await db.delete(wageGrades).where(eq(wageGrades.id, id)).returning();
    return result.length > 0;
  }
}
