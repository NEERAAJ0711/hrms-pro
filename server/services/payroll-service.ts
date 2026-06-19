import { PayrollRepository } from "../repositories/payroll-repository";
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

// PayrollService — business/service layer for the Payroll domain (Task: storage layering).
// Wraps PayrollRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class PayrollService {
  constructor(private payrollRepo = new PayrollRepository()) {}

  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.getSalaryStructure(id);
  }

  async getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.getSalaryStructureByEmployee(employeeId);
  }

  async getSalaryStructuresByEmployee(employeeId: string): Promise<SalaryStructure[]> {
    return this.payrollRepo.getSalaryStructuresByEmployee(employeeId);
  }

  async createSalaryStructure(salaryStructure: InsertSalaryStructure): Promise<SalaryStructure> {
    return this.payrollRepo.createSalaryStructure(salaryStructure);
  }

  async updateSalaryStructure(id: string, salaryStructure: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.updateSalaryStructure(id, salaryStructure);
  }

  async deleteSalaryStructure(id: string): Promise<boolean> {
    return this.payrollRepo.deleteSalaryStructure(id);
  }

  async getAllSalaryStructures(): Promise<SalaryStructure[]> {
    return this.payrollRepo.getAllSalaryStructures();
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    return this.payrollRepo.getPayroll(id);
  }

  async getPayrollByEmployee(employeeId: string): Promise<Payroll[]> {
    return this.payrollRepo.getPayrollByEmployee(employeeId);
  }

  async getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]> {
    return this.payrollRepo.getPayrollByMonth(companyId, month, year);
  }

  async getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined> {
    return this.payrollRepo.getPayrollByEmployeeMonth(employeeId, month, year);
  }

  async createPayroll(record: InsertPayroll): Promise<Payroll> {
    return this.payrollRepo.createPayroll(record);
  }

  async updatePayroll(id: string, record: Partial<InsertPayroll>): Promise<Payroll | undefined> {
    return this.payrollRepo.updatePayroll(id, record);
  }

  async deletePayroll(id: string): Promise<boolean> {
    return this.payrollRepo.deletePayroll(id);
  }

  async getAllPayroll(): Promise<Payroll[]> {
    return this.payrollRepo.getAllPayroll();
  }

  async getFnfSettlement(id: string): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.getFnfSettlement(id);
  }

  async getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.getFnfSettlementByEmployee(employeeId);
  }

  async getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]> {
    return this.payrollRepo.getFnfSettlementsByCompany(companyId);
  }

  async createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement> {
    return this.payrollRepo.createFnfSettlement(settlement);
  }

  async updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.updateFnfSettlement(id, settlement);
  }

  async deleteFnfSettlement(id: string): Promise<boolean> {
    return this.payrollRepo.deleteFnfSettlement(id);
  }

  async getAllFnfSettlements(): Promise<FnfSettlement[]> {
    return this.payrollRepo.getAllFnfSettlements();
  }

  async getLoanAdvance(id: string): Promise<LoanAdvance | undefined> {
    return this.payrollRepo.getLoanAdvance(id);
  }

  async getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]> {
    return this.payrollRepo.getLoanAdvancesByEmployee(employeeId);
  }

  async getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]> {
    return this.payrollRepo.getLoanAdvancesByCompany(companyId);
  }

  async createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance> {
    return this.payrollRepo.createLoanAdvance(data);
  }

  async updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined> {
    return this.payrollRepo.updateLoanAdvance(id, data);
  }

  async deleteLoanAdvance(id: string): Promise<boolean> {
    return this.payrollRepo.deleteLoanAdvance(id);
  }

  async getExpensesByCompany(companyId: string): Promise<any[]> {
    return this.payrollRepo.getExpensesByCompany(companyId);
  }

  async getExpensesByEmployee(employeeId: string): Promise<any[]> {
    return this.payrollRepo.getExpensesByEmployee(employeeId);
  }

  async createExpense(data: any): Promise<any> {
    return this.payrollRepo.createExpense(data);
  }

  async updateExpense(id: string, data: any): Promise<any> {
    return this.payrollRepo.updateExpense(id, data);
  }

  async deleteExpense(id: string): Promise<boolean> {
    return this.payrollRepo.deleteExpense(id);
  }

}

export const payrollService = new PayrollService();
