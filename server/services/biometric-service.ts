import { BiometricRepository } from "../repositories/biometric-repository";
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

// BiometricService — business/service layer for the Biometric domain (Task: storage layering).
// Wraps BiometricRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class BiometricService {
  constructor(private biometricRepo = new BiometricRepository()) {}

  async getBiometricPunchLog(id: string): Promise<BiometricPunchLog | undefined> {
    return this.biometricRepo.getBiometricPunchLog(id);
  }

  async getBiometricPunchLogsByCompany(companyId: string): Promise<BiometricPunchLog[]> {
    return this.biometricRepo.getBiometricPunchLogsByCompany(companyId);
  }

  async getBiometricPunchLogsByDate(companyId: string, date: string): Promise<BiometricPunchLog[]> {
    return this.biometricRepo.getBiometricPunchLogsByDate(companyId, date);
  }

  async createBiometricPunchLog(log: InsertBiometricPunchLog): Promise<BiometricPunchLog> {
    return this.biometricRepo.createBiometricPunchLog(log);
  }

  async updateBiometricPunchLog(id: string, log: Partial<InsertBiometricPunchLog>): Promise<BiometricPunchLog | undefined> {
    return this.biometricRepo.updateBiometricPunchLog(id, log);
  }

  async deleteBiometricPunchLog(id: string): Promise<boolean> {
    return this.biometricRepo.deleteBiometricPunchLog(id);
  }

  async getAllBiometricPunchLogs(): Promise<BiometricPunchLog[]> {
    return this.biometricRepo.getAllBiometricPunchLogs();
  }

  async findDuplicatePunchLog(companyId: string, deviceEmployeeId: string, punchTime: string, punchDate: string): Promise<BiometricPunchLog | undefined> {
    return this.biometricRepo.findDuplicatePunchLog(companyId, deviceEmployeeId, punchTime, punchDate);
  }

  async getBiometricDevice(id: string): Promise<BiometricDevice | undefined> {
    return this.biometricRepo.getBiometricDevice(id);
  }

  async getBiometricDevicesByCompany(companyId: string): Promise<BiometricDevice[]> {
    return this.biometricRepo.getBiometricDevicesByCompany(companyId);
  }

  async createBiometricDevice(device: InsertBiometricDevice): Promise<BiometricDevice> {
    return this.biometricRepo.createBiometricDevice(device);
  }

  async updateBiometricDevice(id: string, device: Partial<InsertBiometricDevice>): Promise<BiometricDevice | undefined> {
    return this.biometricRepo.updateBiometricDevice(id, device);
  }

  async deleteBiometricDevice(id: string): Promise<boolean> {
    return this.biometricRepo.deleteBiometricDevice(id);
  }

  async getAllBiometricDevices(): Promise<BiometricDevice[]> {
    return this.biometricRepo.getAllBiometricDevices();
  }

  async getDeviceUsersRoster(deviceId: string, deviceCompanyId: string | null) {
    return this.biometricRepo.getDeviceUsersRoster(deviceId, deviceCompanyId);
  }

  async deleteAllPunchLogs() {
    return this.biometricRepo.deleteAllPunchLogs();
  }

  async correctPunchTimezone(sign: string, intervalSql: string) {
    return this.biometricRepo.correctPunchTimezone(sign, intervalSql);
  }

  async updateDeviceUserName(deviceId: string, pin: string, fullName: string) {
    return this.biometricRepo.updateDeviceUserName(deviceId, pin, fullName);
  }

  async deleteDeviceUser(deviceId: string, pin: string) {
    return this.biometricRepo.deleteDeviceUser(deviceId, pin);
  }

  async linkPunchLogsToEmployee(employeeId: string, companyId: string, devicePin: string, deviceClause: any) {
    return this.biometricRepo.linkPunchLogsToEmployee(employeeId, companyId, devicePin, deviceClause);
  }

  async getEnrichedPunchLogs(companyFilter: any, dateFilter: any) {
    return this.biometricRepo.getEnrichedPunchLogs(companyFilter, dateFilter);
  }

  async overridePunchType(id: string, punchType: string, companyClause: any) {
    return this.biometricRepo.overridePunchType(id, punchType, companyClause);
  }

  async getPunchLogClassificationData(id: string) {
    return this.biometricRepo.getPunchLogClassificationData(id);
  }

}

export const biometricService = new BiometricService();
