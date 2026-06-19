import { CompanyRepository } from "../repositories/company-repository";
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

// CompanyService — business/service layer for the Company domain (Task: storage layering).
// Wraps CompanyRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class CompanyService {
  constructor(private companyRepo = new CompanyRepository()) {}

  async getCompany(id: string): Promise<Company | undefined> {
    return this.companyRepo.getCompany(id);
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    return this.companyRepo.createCompany(company);
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    return this.companyRepo.updateCompany(id, company);
  }

  async deleteCompany(id: string): Promise<boolean> {
    return this.companyRepo.deleteCompany(id);
  }

  async getAllCompanies(): Promise<Company[]> {
    return this.companyRepo.getAllCompanies();
  }

  async getCompanyContractors(companyId: string): Promise<(CompanyContractor & { contractorName: string })[]> {
    return this.companyRepo.getCompanyContractors(companyId);
  }

  async addCompanyContractor(data: InsertCompanyContractor): Promise<CompanyContractor> {
    return this.companyRepo.addCompanyContractor(data);
  }

  async removeCompanyContractor(companyId: string, contractorId: string): Promise<boolean> {
    return this.companyRepo.removeCompanyContractor(companyId, contractorId);
  }

  async getPrincipalEmployers(contractorId: string): Promise<(CompanyContractor & { companyName: string })[]> {
    return this.companyRepo.getPrincipalEmployers(contractorId);
  }

  async getContractorEmployees(companyId: string, contractorId: string): Promise<(Employee & { contractorEmployeeId: string; taggedDate: string | null; taggedBy: string | null })[]> {
    return this.companyRepo.getContractorEmployees(companyId, contractorId);
  }

  async addContractorEmployee(companyId: string, contractorId: string, employeeId: string, taggedDate?: string, taggedBy?: string): Promise<void> {
    return this.companyRepo.addContractorEmployee(companyId, contractorId, employeeId, taggedDate, taggedBy);
  }

  async removeContractorEmployee(companyId: string, contractorId: string, employeeId: string): Promise<boolean> {
    return this.companyRepo.removeContractorEmployee(companyId, contractorId, employeeId);
  }

  async getContractorMastersByCompany(companyId: string): Promise<ContractorMaster[]> {
    return this.companyRepo.getContractorMastersByCompany(companyId);
  }

  async getContractorMaster(id: string): Promise<ContractorMaster | undefined> {
    return this.companyRepo.getContractorMaster(id);
  }

  async createContractorMaster(data: InsertContractorMaster): Promise<ContractorMaster> {
    return this.companyRepo.createContractorMaster(data);
  }

  async updateContractorMaster(id: string, data: Partial<InsertContractorMaster>): Promise<ContractorMaster | undefined> {
    return this.companyRepo.updateContractorMaster(id, data);
  }

  async deleteContractorMaster(id: string): Promise<boolean> {
    return this.companyRepo.deleteContractorMaster(id);
  }

  async updateCompanyTrial(id: string, trialDays: number, trialExtendedDays: number): Promise<void> {
    return this.companyRepo.updateCompanyTrial(id, trialDays, trialExtendedDays);
  }

  async updateCompanyTrialDays(id: string, trialDays: number): Promise<void> {
    return this.companyRepo.updateCompanyTrialDays(id, trialDays);
  }

  async updateCompanyTrialExtendedDays(id: string, trialExtendedDays: number): Promise<void> {
    return this.companyRepo.updateCompanyTrialExtendedDays(id, trialExtendedDays);
  }

  async setCompanyLogo(id: string, urlPath: string): Promise<void> {
    return this.companyRepo.setCompanyLogo(id, urlPath);
  }

  async setCompanySignature(id: string, urlPath: string): Promise<void> {
    return this.companyRepo.setCompanySignature(id, urlPath);
  }

  async clearCompanyLogo(id: string): Promise<void> {
    return this.companyRepo.clearCompanyLogo(id);
  }

  async clearCompanySignature(id: string): Promise<void> {
    return this.companyRepo.clearCompanySignature(id);
  }

  getTaggedEmployeeIdsByContractors(companyContractorIds: string[]) {
    return this.companyRepo.getTaggedEmployeeIdsByContractors(companyContractorIds);
  }

}

export const companyService = new CompanyService();
