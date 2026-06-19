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

// PayrollRepository — DB access for the Payroll domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class PayrollRepository {
  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    const result = await db.select().from(salaryStructures).where(eq(salaryStructures.id, id));
    return result[0];
  }

  async getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined> {
    const result = await db.select().from(salaryStructures).where(
      and(eq(salaryStructures.employeeId, employeeId), eq(salaryStructures.status, "active"))
    );
    return result[0];
  }

  async getSalaryStructuresByEmployee(employeeId: string): Promise<SalaryStructure[]> {
    return await db.select().from(salaryStructures).where(eq(salaryStructures.employeeId, employeeId));
  }

  async createSalaryStructure(salaryStructure: InsertSalaryStructure): Promise<SalaryStructure> {
    const id = randomUUID();
    const result = await db.insert(salaryStructures).values({ ...salaryStructure, id }).returning();
    return result[0];
  }

  async updateSalaryStructure(id: string, salaryStructure: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined> {
    const result = await db.update(salaryStructures).set(salaryStructure).where(eq(salaryStructures.id, id)).returning();
    return result[0];
  }

  async deleteSalaryStructure(id: string): Promise<boolean> {
    const result = await db.delete(salaryStructures).where(eq(salaryStructures.id, id)).returning();
    return result.length > 0;
  }

  async getAllSalaryStructures(): Promise<SalaryStructure[]> {
    return await db.select().from(salaryStructures);
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    const result = await db.select().from(payroll).where(eq(payroll.id, id));
    return result[0];
  }

  async getPayrollByEmployee(employeeId: string): Promise<Payroll[]> {
    return await db.select().from(payroll).where(eq(payroll.employeeId, employeeId));
  }

  async getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]> {
    return await db.select().from(payroll).where(
      and(eq(payroll.companyId, companyId), eq(payroll.month, month), eq(payroll.year, year))
    );
  }

  async getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined> {
    const result = await db.select().from(payroll).where(
      and(eq(payroll.employeeId, employeeId), eq(payroll.month, month), eq(payroll.year, year))
    );
    return result[0];
  }

  async createPayroll(record: InsertPayroll): Promise<Payroll> {
    const id = randomUUID();
    const result = await db.insert(payroll).values({ ...record, id }).returning();
    return result[0];
  }

  async updatePayroll(id: string, record: Partial<InsertPayroll>): Promise<Payroll | undefined> {
    const result = await db.update(payroll).set(record).where(eq(payroll.id, id)).returning();
    return result[0];
  }

  async deletePayroll(id: string): Promise<boolean> {
    const result = await db.delete(payroll).where(eq(payroll.id, id)).returning();
    return result.length > 0;
  }

  async getAllPayroll(): Promise<Payroll[]> {
    return await db.select().from(payroll);
  }

  async getFnfSettlement(id: string): Promise<FnfSettlement | undefined> {
    const result = await db.select().from(fnfSettlements).where(eq(fnfSettlements.id, id));
    return result[0];
  }

  async getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined> {
    const result = await db.select().from(fnfSettlements).where(eq(fnfSettlements.employeeId, employeeId));
    return result[0];
  }

  async getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]> {
    return await db.select().from(fnfSettlements).where(eq(fnfSettlements.companyId, companyId));
  }

  async createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement> {
    const id = randomUUID();
    const result = await db.insert(fnfSettlements).values({ ...settlement, id }).returning();
    return result[0];
  }

  async updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined> {
    const result = await db.update(fnfSettlements).set(settlement).where(eq(fnfSettlements.id, id)).returning();
    return result[0];
  }

  async deleteFnfSettlement(id: string): Promise<boolean> {
    const result = await db.delete(fnfSettlements).where(eq(fnfSettlements.id, id)).returning();
    return result.length > 0;
  }

  async getAllFnfSettlements(): Promise<FnfSettlement[]> {
    return await db.select().from(fnfSettlements);
  }

  async getLoanAdvance(id: string): Promise<LoanAdvance | undefined> {
    const result = await db.select().from(loanAdvances).where(eq(loanAdvances.id, id));
    return result[0];
  }

  async getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]> {
    return await db.select().from(loanAdvances).where(eq(loanAdvances.employeeId, employeeId)).orderBy(desc(loanAdvances.createdAt));
  }

  async getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]> {
    return await db.select().from(loanAdvances).where(eq(loanAdvances.companyId, companyId)).orderBy(desc(loanAdvances.createdAt));
  }

  async createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance> {
    const id = randomUUID();
    const result = await db.insert(loanAdvances).values({ ...data, id }).returning();
    return result[0];
  }

  async updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined> {
    const result = await db.update(loanAdvances).set(data).where(eq(loanAdvances.id, id)).returning();
    return result[0];
  }

  async deleteLoanAdvance(id: string): Promise<boolean> {
    const result = await db.delete(loanAdvances).where(eq(loanAdvances.id, id)).returning();
    return result.length > 0;
  }

  async getExpensesByCompany(companyId: string): Promise<any[]> {
    return await db.select().from(expenses).where(eq(expenses.companyId, companyId)).orderBy(desc(expenses.createdAt));
  }

  async getExpensesByEmployee(employeeId: string): Promise<any[]> {
    return await db.select().from(expenses).where(eq(expenses.employeeId, employeeId)).orderBy(desc(expenses.createdAt));
  }

  async createExpense(data: any): Promise<any> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row = { ...data, id, createdAt: now };
    const result = await db.insert(expenses).values(row).returning();
    return result[0];
  }

  async updateExpense(id: string, data: any): Promise<any> {
    const result = await db.update(expenses).set(data).where(eq(expenses.id, id)).returning();
    return result[0];
  }

  async deleteExpense(id: string): Promise<boolean> {
    const result = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    return result.length > 0;
  }
}
