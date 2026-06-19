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

// LeaveRepository — DB access for the Leave domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class LeaveRepository {
  async getLeaveType(id: string): Promise<LeaveType | undefined> {
    const result = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id));
    return result[0];
  }

  async getLeaveTypesByCompany(companyId: string | null): Promise<LeaveType[]> {
    if (companyId === null) {
      return await db.select().from(leaveTypes).where(isNull(leaveTypes.companyId));
    }
    return await db.select().from(leaveTypes).where(
      or(eq(leaveTypes.companyId, companyId), isNull(leaveTypes.companyId))
    );
  }

  async createLeaveType(leaveType: InsertLeaveType): Promise<LeaveType> {
    const id = randomUUID();
    const result = await db.insert(leaveTypes).values({ ...leaveType, id }).returning();
    return result[0];
  }

  async updateLeaveType(id: string, leaveType: Partial<InsertLeaveType>): Promise<LeaveType | undefined> {
    const result = await db.update(leaveTypes).set(leaveType).where(eq(leaveTypes.id, id)).returning();
    return result[0];
  }

  async deleteLeaveType(id: string): Promise<boolean> {
    const result = await db.delete(leaveTypes).where(eq(leaveTypes.id, id)).returning();
    return result.length > 0;
  }

  async getAllLeaveTypes(): Promise<LeaveType[]> {
    return await db.select().from(leaveTypes);
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    const result = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    return result[0];
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId));
  }

  async getLeaveRequestsByCompany(companyId: string): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).where(eq(leaveRequests.companyId, companyId));
  }

  async createLeaveRequest(leaveRequest: InsertLeaveRequest): Promise<LeaveRequest> {
    const id = randomUUID();
    const result = await db.insert(leaveRequests).values({ ...leaveRequest, id }).returning();
    return result[0];
  }

  async updateLeaveRequest(id: string, leaveRequest: Partial<LeaveRequest>): Promise<LeaveRequest | undefined> {
    const result = await db.update(leaveRequests).set(leaveRequest).where(eq(leaveRequests.id, id)).returning();
    return result[0];
  }

  async deleteLeaveRequest(id: string): Promise<boolean> {
    const result = await db.delete(leaveRequests).where(eq(leaveRequests.id, id)).returning();
    return result.length > 0;
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests);
  }

  async getLeavePoliciesByCompany(companyId: string): Promise<LeavePolicy[]> {
    return await db.select().from(leavePolicies).where(eq(leavePolicies.companyId, companyId));
  }

  async getLeavePolicy(id: string): Promise<LeavePolicy | undefined> {
    const result = await db.select().from(leavePolicies).where(eq(leavePolicies.id, id));
    return result[0];
  }

  async createLeavePolicy(data: InsertLeavePolicy): Promise<LeavePolicy> {
    const id = randomUUID();
    const result = await db.insert(leavePolicies).values({ ...data, id }).returning();
    return result[0];
  }

  async updateLeavePolicy(id: string, data: Partial<InsertLeavePolicy>): Promise<LeavePolicy | undefined> {
    const result = await db.update(leavePolicies).set(data).where(eq(leavePolicies.id, id)).returning();
    return result[0];
  }

  async deleteLeavePolicy(id: string): Promise<boolean> {
    const result = await db.delete(leavePolicies).where(eq(leavePolicies.id, id)).returning();
    return result.length > 0;
  }

  async getLeaveAdjustmentsByCompany(companyId: string): Promise<any[]> {
    return await db.select().from(leaveAdjustments).where(eq(leaveAdjustments.companyId, companyId)).orderBy(desc(leaveAdjustments.createdAt));
  }

  async getLeaveAdjustmentsByEmployee(employeeId: string): Promise<any[]> {
    return await db.select().from(leaveAdjustments).where(eq(leaveAdjustments.employeeId, employeeId)).orderBy(desc(leaveAdjustments.createdAt));
  }

  async createLeaveAdjustment(data: any): Promise<any> {
    const row = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    const result = await db.insert(leaveAdjustments).values(row).returning();
    return result[0];
  }

  async deleteLeaveAdjustment(id: string): Promise<boolean> {
    const result = await db.delete(leaveAdjustments).where(eq(leaveAdjustments.id, id)).returning();
    return result.length > 0;
  }

  async getAllCompOff(): Promise<any[]> {
    return await db.select().from(compOffApplications).orderBy(desc(compOffApplications.createdAt));
  }

  async getCompOffByCompany(companyId: string): Promise<any[]> {
    return await db.select().from(compOffApplications).where(eq(compOffApplications.companyId, companyId)).orderBy(desc(compOffApplications.createdAt));
  }

  async getCompOffByEmployee(employeeId: string): Promise<any[]> {
    return await db.select().from(compOffApplications).where(eq(compOffApplications.employeeId, employeeId)).orderBy(desc(compOffApplications.createdAt));
  }

  async createCompOff(data: any): Promise<any> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const result = await db.execute(sql`
      INSERT INTO comp_off_applications
        (id, company_id, employee_id, worked_date, worked_type, credited_days, purpose, status, created_at)
      VALUES
        (${id}, ${data.companyId}, ${data.employeeId}, ${data.workedDate},
         ${data.workedType || 'weekly_off'}, ${String(data.creditedDays ?? '1')},
         ${data.purpose || ''}, ${'pending'}, ${createdAt})
      RETURNING *
    `);
    return (result as any).rows?.[0] ?? result[0];
  }

  async updateCompOff(id: string, data: any): Promise<any> {
    const result = await db.update(compOffApplications).set(data).where(eq(compOffApplications.id, id)).returning();
    return result[0];
  }

  async deleteCompOff(id: string): Promise<boolean> {
    const result = await db.delete(compOffApplications).where(eq(compOffApplications.id, id)).returning();
    return result.length > 0;
  }
}
