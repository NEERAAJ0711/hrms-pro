import { UserRepository } from "../repositories/user-repository";
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

// UserService — business/service layer for the User domain (Task: storage layering).
// Wraps UserRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class UserService {
  constructor(private userRepo = new UserRepository()) {}

  async getUser(id: string): Promise<User | undefined> {
    return this.userRepo.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.userRepo.getUserByUsername(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.userRepo.getUserByEmail(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    return this.userRepo.createUser(user);
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    return this.userRepo.updateUser(id, user);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.userRepo.deleteUser(id);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.getAllUsers();
  }

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return this.userRepo.getUserPermissions(userId);
  }

  async setUserPermissions(userId: string, permissions: { module: string; canAccess: boolean }[], grantedBy: string, companyId: string | null): Promise<UserPermission[]> {
    return this.userRepo.setUserPermissions(userId, permissions, grantedBy, companyId);
  }

  async createModuleAccessRequest(data: { userId: string; companyId: string | null; module: string; actions?: string[] | null; reason?: string | null }): Promise<ModuleAccessRequest> {
    return this.userRepo.createModuleAccessRequest(data);
  }

  async getModuleAccessRequest(id: string): Promise<ModuleAccessRequest | undefined> {
    return this.userRepo.getModuleAccessRequest(id);
  }

  async listModuleAccessRequests(filters: { companyId?: string; userId?: string; status?: string }): Promise<ModuleAccessRequest[]> {
    return this.userRepo.listModuleAccessRequests(filters);
  }

  async decideModuleAccessRequest(id: string, status: "approved" | "denied" | "revoked", decidedBy: string, decisionNote?: string | null): Promise<ModuleAccessRequest | undefined> {
    return this.userRepo.decideModuleAccessRequest(id, status, decidedBy, decisionNote);
  }

  async findPendingModuleAccessRequest(userId: string, module: string): Promise<ModuleAccessRequest | undefined> {
    return this.userRepo.findPendingModuleAccessRequest(userId, module);
  }

  async deleteModuleAccessRequest(id: string): Promise<boolean> {
    return this.userRepo.deleteModuleAccessRequest(id);
  }

  async insertSignupCompany(companyId: string, companyName: string, today: string): Promise<void> {
    return this.userRepo.insertSignupCompany(companyId, companyName, today);
  }

  async insertSignupUser(userId: string, username: string, email: string, password: string, firstName: string, lastName: string, companyId: string): Promise<void> {
    return this.userRepo.insertSignupUser(userId, username, email, password, firstName, lastName, companyId);
  }

  async getAuditLogs(action: string | undefined, limit: number) {
    return this.userRepo.getAuditLogs(action, limit);
  }

  async revokeModuleActionPermissions(targetUserId: string, module: string, grantedBy: string): Promise<void> {
    return this.userRepo.revokeModuleActionPermissions(targetUserId, module, grantedBy);
  }

  async revokeApprovedModuleRequests(targetUserId: string, module: string, decidedBy: string): Promise<void> {
    return this.userRepo.revokeApprovedModuleRequests(targetUserId, module, decidedBy);
  }

  async getUserIdByEmail(email: string): Promise<{ id: string }[]> {
    return this.userRepo.getUserIdByEmail(email);
  }

  async getUsersByRoles(roles: string[]): Promise<{ id: string; role: string; companyId: string | null }[]> {
    return this.userRepo.getUsersByRoles(roles);
  }

}

export const userService = new UserService();
