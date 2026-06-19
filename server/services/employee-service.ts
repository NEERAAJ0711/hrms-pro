import { EmployeeRepository } from "../repositories/employee-repository";
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

// EmployeeService — business/service layer for the Employee domain (Task: storage layering).
// Wraps EmployeeRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class EmployeeService {
  constructor(private employeeRepo = new EmployeeRepository()) {}

  async getEmployee(id: string): Promise<Employee | undefined> {
    return this.employeeRepo.getEmployee(id);
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    return this.employeeRepo.getEmployeeByUserId(userId);
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return this.employeeRepo.getEmployeesByCompany(companyId);
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    return this.employeeRepo.createEmployee(employee);
  }

  async updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    return this.employeeRepo.updateEmployee(id, employee);
  }

  async deleteEmployee(id: string): Promise<boolean> {
    return this.employeeRepo.deleteEmployee(id);
  }

  async getAllEmployees(): Promise<Employee[]> {
    return this.employeeRepo.getAllEmployees();
  }

  async getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]> {
    return this.employeeRepo.getPreviousExperiencesByEmployee(employeeId);
  }

  async getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]> {
    return this.employeeRepo.getPreviousExperiencesByCandidate(candidateProfileId);
  }

  async createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience> {
    return this.employeeRepo.createPreviousExperience(exp);
  }

  async deletePreviousExperience(id: string): Promise<void> {
    return this.employeeRepo.deletePreviousExperience(id);
  }

  async linkPunchLogsToEmployee(employeeId: string | string[], devicePin: string, companyId: string): Promise<void> {
    return this.employeeRepo.linkPunchLogsToEmployee(employeeId, devicePin, companyId);
  }

  async getEmployeeDocuments(employeeId: string | string[]) {
    return this.employeeRepo.getEmployeeDocuments(employeeId);
  }

  async getEmployeeCompanyIdRow(employeeId: string | string[]) {
    return this.employeeRepo.getEmployeeCompanyIdRow(employeeId);
  }

  async insertEmployeeDocument(params: {
    id: string;
    employeeId: string | string[];
    companyId: any;
    docType: any;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    createdBy: any;
    now: string;
  }): Promise<void> {
    return this.employeeRepo.insertEmployeeDocument(params);
  }

  async getEmployeeDocumentForDelete(docId: string | string[], employeeId: string | string[]) {
    return this.employeeRepo.getEmployeeDocumentForDelete(docId, employeeId);
  }

  async deleteEmployeeDocument(docId: string | string[]): Promise<void> {
    return this.employeeRepo.deleteEmployeeDocument(docId);
  }

  async cancelPendingProfileUpdateRequests(userId: string): Promise<void> {
    return this.employeeRepo.cancelPendingProfileUpdateRequests(userId);
  }

  async autoLinkUserToEmployee(params: {
    userId: string;
    companyId: string;
    email: any;
    firstName: any;
    lastName: any;
    username: any;
  }): Promise<any | null> {
    return this.employeeRepo.autoLinkUserToEmployee(params);
  }

  async createProfileUpdateRequest(values: any) {
    return this.employeeRepo.createProfileUpdateRequest(values);
  }

  async getPendingProfileUpdateRequest(userId: string) {
    return this.employeeRepo.getPendingProfileUpdateRequest(userId);
  }

  async getAllProfileUpdateRequests() {
    return this.employeeRepo.getAllProfileUpdateRequests();
  }

  async getProfileUpdateRequestById(id: string) {
    return this.employeeRepo.getProfileUpdateRequestById(id);
  }

  async updateProfileUpdateRequest(id: string, values: any): Promise<void> {
    return this.employeeRepo.updateProfileUpdateRequest(id, values);
  }

}

export const employeeService = new EmployeeService();
