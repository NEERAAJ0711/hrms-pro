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

// KraRepository — DB access for the Kra domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class KraRepository {
  async getKraTemplatesByCompany(companyId: string): Promise<KraTemplate[]> {
    return await db.select().from(kraTemplates).where(eq(kraTemplates.companyId, companyId)).orderBy(kraTemplates.name);
  }

  async getKraTemplate(id: string): Promise<KraTemplate | undefined> {
    const result = await db.select().from(kraTemplates).where(eq(kraTemplates.id, id));
    return result[0];
  }

  async createKraTemplate(data: InsertKraTemplate): Promise<KraTemplate> {
    const id = randomUUID();
    const result = await db.insert(kraTemplates).values({ ...data, id }).returning();
    return result[0];
  }

  async updateKraTemplate(id: string, data: Partial<InsertKraTemplate>): Promise<KraTemplate | undefined> {
    const result = await db.update(kraTemplates).set(data).where(eq(kraTemplates.id, id)).returning();
    return result[0];
  }

  async deleteKraTemplate(id: string): Promise<boolean> {
    const result = await db.delete(kraTemplates).where(eq(kraTemplates.id, id)).returning();
    return result.length > 0;
  }

  async getKraTemplateKpis(templateId: string): Promise<KraTemplateKpi[]> {
    return await db.select().from(kraTemplateKpis).where(eq(kraTemplateKpis.templateId, templateId)).orderBy(kraTemplateKpis.sortOrder);
  }

  async createKraTemplateKpi(data: InsertKraTemplateKpi): Promise<KraTemplateKpi> {
    const id = randomUUID();
    const result = await db.insert(kraTemplateKpis).values({ ...data, id }).returning();
    return result[0];
  }

  async updateKraTemplateKpi(id: string, data: Partial<InsertKraTemplateKpi>): Promise<KraTemplateKpi | undefined> {
    const result = await db.update(kraTemplateKpis).set(data).where(eq(kraTemplateKpis.id, id)).returning();
    return result[0];
  }

  async deleteKraTemplateKpi(id: string): Promise<boolean> {
    const result = await db.delete(kraTemplateKpis).where(eq(kraTemplateKpis.id, id)).returning();
    return result.length > 0;
  }

  async deleteKraTemplateKpisByTemplate(templateId: string): Promise<void> {
    await db.delete(kraTemplateKpis).where(eq(kraTemplateKpis.templateId, templateId));
  }

  async getKraAssignmentsByCompany(companyId: string): Promise<KraAssignment[]> {
    return await db.select().from(kraAssignments).where(eq(kraAssignments.companyId, companyId)).orderBy(desc(kraAssignments.createdAt));
  }

  async getKraAssignmentsByEmployee(employeeId: string): Promise<KraAssignment[]> {
    return await db.select().from(kraAssignments).where(eq(kraAssignments.employeeId, employeeId)).orderBy(desc(kraAssignments.createdAt));
  }

  async getKraAssignment(id: string): Promise<KraAssignment | undefined> {
    const result = await db.select().from(kraAssignments).where(eq(kraAssignments.id, id));
    return result[0];
  }

  async createKraAssignment(data: InsertKraAssignment): Promise<KraAssignment> {
    const id = randomUUID();
    const result = await db.insert(kraAssignments).values({ ...data, id }).returning();
    return result[0];
  }

  async updateKraAssignment(id: string, data: Partial<InsertKraAssignment>): Promise<KraAssignment | undefined> {
    const result = await db.update(kraAssignments).set(data).where(eq(kraAssignments.id, id)).returning();
    return result[0];
  }

  async deleteKraAssignment(id: string): Promise<boolean> {
    const result = await db.delete(kraAssignments).where(eq(kraAssignments.id, id)).returning();
    return result.length > 0;
  }

  async getKraAssignmentKpis(assignmentId: string): Promise<KraAssignmentKpi[]> {
    return await db.select().from(kraAssignmentKpis).where(eq(kraAssignmentKpis.assignmentId, assignmentId)).orderBy(kraAssignmentKpis.sortOrder);
  }

  async createKraAssignmentKpi(data: InsertKraAssignmentKpi): Promise<KraAssignmentKpi> {
    const id = randomUUID();
    const result = await db.insert(kraAssignmentKpis).values({ ...data, id }).returning();
    return result[0];
  }

  async updateKraAssignmentKpi(id: string, data: Partial<InsertKraAssignmentKpi>): Promise<KraAssignmentKpi | undefined> {
    const result = await db.update(kraAssignmentKpis).set(data).where(eq(kraAssignmentKpis.id, id)).returning();
    return result[0];
  }

  async deleteKraAssignmentKpisByAssignment(assignmentId: string): Promise<void> {
    await db.delete(kraAssignmentKpis).where(eq(kraAssignmentKpis.assignmentId, assignmentId));
  }
}
