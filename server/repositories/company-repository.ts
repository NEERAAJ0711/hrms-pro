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
import { eq, and, isNull, desc, sql, count, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "crypto";

// CompanyRepository — DB access for the Company domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class CompanyRepository {
  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async nextCompanyCode(): Promise<string> {
    const rows = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(SUBSTRING(company_code FROM 'HRMS([0-9]+)') AS INTEGER)), 0) + 1 AS next
      FROM companies
      WHERE company_code ~ '^HRMS[0-9]+$'
    `);
    const next = Number((rows.rows[0] as { next: number | string })?.next ?? 1);
    return `HRMS${String(next).padStart(3, "0")}`;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const id = randomUUID();
    // If the caller supplied a code, insert as-is. Otherwise auto-generate and
    // retry on a unique-violation so concurrent creates don't fail on a duplicate.
    if (company.companyCode) {
      const result = await db.insert(companies).values({ ...company, id }).returning();
      return result[0];
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const companyCode = await this.nextCompanyCode();
      try {
        const result = await db.insert(companies).values({ ...company, id, companyCode }).returning();
        return result[0];
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "23505" && attempt < 4) continue; // unique violation — recompute & retry
        throw err;
      }
    }
    throw new Error("Could not generate a unique company code");
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies).set(company).where(eq(companies.id, id)).returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id)).returning();
    return result.length > 0;
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getCompanyContractors(companyId: string): Promise<(CompanyContractor & { contractorName: string })[]> {
    const rows = await db
      .select({
        id: companyContractors.id,
        companyId: companyContractors.companyId,
        contractorId: companyContractors.contractorId,
        startDate: companyContractors.startDate,
        contractorName: companies.companyName,
      })
      .from(companyContractors)
      .leftJoin(companies, eq(companies.id, companyContractors.contractorId))
      .where(eq(companyContractors.companyId, companyId));
    return rows.map((r) => ({ ...r, contractorName: r.contractorName ?? "(Unknown Company)" }));
  }

  async addCompanyContractor(data: InsertCompanyContractor): Promise<CompanyContractor> {
    const id = randomUUID();
    const result = await db.insert(companyContractors).values({ ...data, id }).returning();
    return result[0];
  }

  async removeCompanyContractor(companyId: string, contractorId: string): Promise<boolean> {
    const result = await db
      .delete(companyContractors)
      .where(and(eq(companyContractors.companyId, companyId), eq(companyContractors.contractorId, contractorId)))
      .returning();
    return result.length > 0;
  }

  async getPrincipalEmployers(contractorId: string): Promise<(CompanyContractor & { companyName: string })[]> {
    const rows = await db
      .select({
        id: companyContractors.id,
        companyId: companyContractors.companyId,
        contractorId: companyContractors.contractorId,
        startDate: companyContractors.startDate,
        companyName: companies.companyName,
      })
      .from(companyContractors)
      .leftJoin(companies, eq(companies.id, companyContractors.companyId))
      .where(eq(companyContractors.contractorId, contractorId));
    // Ensure companyName is always a string (leftJoin may produce null)
    return rows.map((r) => ({ ...r, companyName: r.companyName ?? "(Unknown Company)" }));
  }

  async getContractorEmployees(companyId: string, contractorId: string): Promise<(Employee & { contractorEmployeeId: string; taggedDate: string | null; taggedBy: string | null })[]> {
    const junction = await db.select().from(companyContractors)
      .where(and(eq(companyContractors.companyId, companyId), eq(companyContractors.contractorId, contractorId)));
    if (!junction.length) return [];
    const rows = await db
      .select({ ...employees, contractorEmployeeId: contractorEmployees.id, taggedDate: contractorEmployees.taggedDate, taggedBy: contractorEmployees.taggedBy } as any)
      .from(contractorEmployees)
      .innerJoin(employees, eq(employees.id, contractorEmployees.employeeId))
      .where(eq(contractorEmployees.companyContractorId, junction[0].id));
    return rows as any;
  }

  async addContractorEmployee(companyId: string, contractorId: string, employeeId: string, taggedDate?: string, taggedBy?: string): Promise<void> {
    const junction = await db.select().from(companyContractors)
      .where(and(eq(companyContractors.companyId, companyId), eq(companyContractors.contractorId, contractorId)));
    console.log("[addContractorEmployee] companyId=%s contractorId=%s employeeId=%s junction.length=%d", companyId, contractorId, employeeId, junction.length);
    if (!junction.length) throw new Error(`No contractor link found: company=${companyId}, contractor=${contractorId}`);
    const id = randomUUID();
    await db.insert(contractorEmployees).values({ id, companyContractorId: junction[0].id, employeeId, taggedDate: taggedDate ?? null, taggedBy: taggedBy ?? null });
  }

  async removeContractorEmployee(companyId: string, contractorId: string, employeeId: string): Promise<boolean> {
    const junction = await db.select().from(companyContractors)
      .where(and(eq(companyContractors.companyId, companyId), eq(companyContractors.contractorId, contractorId)));
    if (!junction.length) return false;
    const result = await db.delete(contractorEmployees)
      .where(and(eq(contractorEmployees.companyContractorId, junction[0].id), eq(contractorEmployees.employeeId, employeeId)))
      .returning();
    return result.length > 0;
  }

  async getContractorMastersByCompany(companyId: string): Promise<ContractorMaster[]> {
    return await db.select().from(contractorMasters).where(eq(contractorMasters.companyId, companyId));
  }

  async getContractorMaster(id: string): Promise<ContractorMaster | undefined> {
    const result = await db.select().from(contractorMasters).where(eq(contractorMasters.id, id));
    return result[0];
  }

  async createContractorMaster(data: InsertContractorMaster): Promise<ContractorMaster> {
    const id = randomUUID();
    const result = await db.insert(contractorMasters).values({ ...data, id }).returning();
    return result[0];
  }

  async updateContractorMaster(id: string, data: Partial<InsertContractorMaster>): Promise<ContractorMaster | undefined> {
    const result = await db.update(contractorMasters).set(data).where(eq(contractorMasters.id, id)).returning();
    return result[0];
  }

  async deleteContractorMaster(id: string): Promise<boolean> {
    const result = await db.delete(contractorMasters).where(eq(contractorMasters.id, id)).returning();
    return result.length > 0;
  }

  async updateCompanyTrial(id: string, trialDays: number, trialExtendedDays: number): Promise<void> {
    await db.execute(sql`UPDATE companies SET trial_days = ${trialDays}, trial_extended_days = ${trialExtendedDays} WHERE id = ${id}`);
  }

  async updateCompanyTrialDays(id: string, trialDays: number): Promise<void> {
    await db.execute(sql`UPDATE companies SET trial_days = ${trialDays} WHERE id = ${id}`);
  }

  async updateCompanyTrialExtendedDays(id: string, trialExtendedDays: number): Promise<void> {
    await db.execute(sql`UPDATE companies SET trial_extended_days = ${trialExtendedDays} WHERE id = ${id}`);
  }

  async setCompanyLogo(id: string, urlPath: string): Promise<void> {
    await db.execute(sql`UPDATE companies SET logo = ${urlPath} WHERE id = ${id}`);
  }

  async setCompanySignature(id: string, urlPath: string): Promise<void> {
    await db.execute(sql`UPDATE companies SET signature = ${urlPath} WHERE id = ${id}`);
  }

  async clearCompanyLogo(id: string): Promise<void> {
    await db.execute(sql`UPDATE companies SET logo = NULL WHERE id = ${id}`);
  }

  async clearCompanySignature(id: string): Promise<void> {
    await db.execute(sql`UPDATE companies SET signature = NULL WHERE id = ${id}`);
  }

  // Batched lookup of employee IDs tagged to any of the given company-contractor
  // junctions. Verbatim move of the per-user access-restriction tag query.
  async getTaggedEmployeeIdsByContractors(companyContractorIds: string[]) {
    return await db
      .select({ employeeId: contractorEmployees.employeeId })
      .from(contractorEmployees)
      .where(inArray(contractorEmployees.companyContractorId, companyContractorIds));
  }
}
