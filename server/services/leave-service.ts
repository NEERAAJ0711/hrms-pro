import { LeaveRepository } from "../repositories/leave-repository";
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

// LeaveService — business/service layer for the Leave domain (Task: storage layering).
// Wraps LeaveRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class LeaveService {
  constructor(private leaveRepo = new LeaveRepository()) {}

  async getLeaveType(id: string): Promise<LeaveType | undefined> {
    return this.leaveRepo.getLeaveType(id);
  }

  async getLeaveTypesByCompany(companyId: string | null): Promise<LeaveType[]> {
    return this.leaveRepo.getLeaveTypesByCompany(companyId);
  }

  async createLeaveType(leaveType: InsertLeaveType): Promise<LeaveType> {
    return this.leaveRepo.createLeaveType(leaveType);
  }

  async updateLeaveType(id: string, leaveType: Partial<InsertLeaveType>): Promise<LeaveType | undefined> {
    return this.leaveRepo.updateLeaveType(id, leaveType);
  }

  async deleteLeaveType(id: string): Promise<boolean> {
    return this.leaveRepo.deleteLeaveType(id);
  }

  async getAllLeaveTypes(): Promise<LeaveType[]> {
    return this.leaveRepo.getAllLeaveTypes();
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    return this.leaveRepo.getLeaveRequest(id);
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return this.leaveRepo.getLeaveRequestsByEmployee(employeeId);
  }

  async getLeaveRequestsByCompany(companyId: string): Promise<LeaveRequest[]> {
    return this.leaveRepo.getLeaveRequestsByCompany(companyId);
  }

  async createLeaveRequest(leaveRequest: InsertLeaveRequest): Promise<LeaveRequest> {
    return this.leaveRepo.createLeaveRequest(leaveRequest);
  }

  async updateLeaveRequest(id: string, leaveRequest: Partial<LeaveRequest>): Promise<LeaveRequest | undefined> {
    return this.leaveRepo.updateLeaveRequest(id, leaveRequest);
  }

  async deleteLeaveRequest(id: string): Promise<boolean> {
    return this.leaveRepo.deleteLeaveRequest(id);
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return this.leaveRepo.getAllLeaveRequests();
  }

  async getLeavePoliciesByCompany(companyId: string): Promise<LeavePolicy[]> {
    return this.leaveRepo.getLeavePoliciesByCompany(companyId);
  }

  async getLeavePolicy(id: string): Promise<LeavePolicy | undefined> {
    return this.leaveRepo.getLeavePolicy(id);
  }

  async createLeavePolicy(data: InsertLeavePolicy): Promise<LeavePolicy> {
    return this.leaveRepo.createLeavePolicy(data);
  }

  async updateLeavePolicy(id: string, data: Partial<InsertLeavePolicy>): Promise<LeavePolicy | undefined> {
    return this.leaveRepo.updateLeavePolicy(id, data);
  }

  async deleteLeavePolicy(id: string): Promise<boolean> {
    return this.leaveRepo.deleteLeavePolicy(id);
  }

  async getLeaveAdjustmentsByCompany(companyId: string): Promise<any[]> {
    return this.leaveRepo.getLeaveAdjustmentsByCompany(companyId);
  }

  async getLeaveAdjustmentsByEmployee(employeeId: string): Promise<any[]> {
    return this.leaveRepo.getLeaveAdjustmentsByEmployee(employeeId);
  }

  async createLeaveAdjustment(data: any): Promise<any> {
    return this.leaveRepo.createLeaveAdjustment(data);
  }

  async deleteLeaveAdjustment(id: string): Promise<boolean> {
    return this.leaveRepo.deleteLeaveAdjustment(id);
  }

  async getAllCompOff(): Promise<any[]> {
    return this.leaveRepo.getAllCompOff();
  }

  async getCompOffByCompany(companyId: string): Promise<any[]> {
    return this.leaveRepo.getCompOffByCompany(companyId);
  }

  async getCompOffByEmployee(employeeId: string): Promise<any[]> {
    return this.leaveRepo.getCompOffByEmployee(employeeId);
  }

  async createCompOff(data: any): Promise<any> {
    return this.leaveRepo.createCompOff(data);
  }

  async updateCompOff(id: string, data: any): Promise<any> {
    return this.leaveRepo.updateCompOff(id, data);
  }

  async deleteCompOff(id: string): Promise<boolean> {
    return this.leaveRepo.deleteCompOff(id);
  }

}

export const leaveService = new LeaveService();
