import { SettingsRepository } from "../repositories/settings-repository";
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

// SettingsService — business/service layer for the Settings domain (Task: storage layering).
// Wraps SettingsRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class SettingsService {
  constructor(private settingsRepo = new SettingsRepository()) {}

  async getSetting(id: string): Promise<Setting | undefined> {
    return this.settingsRepo.getSetting(id);
  }

  async getSettingByKey(companyId: string | null, key: string): Promise<Setting | undefined> {
    return this.settingsRepo.getSettingByKey(companyId, key);
  }

  async getSettingsByCategory(companyId: string | null, category: string): Promise<Setting[]> {
    return this.settingsRepo.getSettingsByCategory(companyId, category);
  }

  async createSetting(setting: InsertSetting): Promise<Setting> {
    return this.settingsRepo.createSetting(setting);
  }

  async updateSetting(id: string, setting: Partial<InsertSetting>): Promise<Setting | undefined> {
    return this.settingsRepo.updateSetting(id, setting);
  }

  async deleteSetting(id: string): Promise<boolean> {
    return this.settingsRepo.deleteSetting(id);
  }

  async getAllSettings(): Promise<Setting[]> {
    return this.settingsRepo.getAllSettings();
  }

  async getMasterDepartment(id: string): Promise<MasterDepartment | undefined> {
    return this.settingsRepo.getMasterDepartment(id);
  }

  async getAllMasterDepartments(): Promise<MasterDepartment[]> {
    return this.settingsRepo.getAllMasterDepartments();
  }

  async getMasterDepartmentsByCompany(companyId: string): Promise<MasterDepartment[]> {
    return this.settingsRepo.getMasterDepartmentsByCompany(companyId);
  }

  async createMasterDepartment(dept: InsertMasterDepartment): Promise<MasterDepartment> {
    return this.settingsRepo.createMasterDepartment(dept);
  }

  async updateMasterDepartment(id: string, dept: Partial<InsertMasterDepartment>): Promise<MasterDepartment | undefined> {
    return this.settingsRepo.updateMasterDepartment(id, dept);
  }

  async deleteMasterDepartment(id: string): Promise<boolean> {
    return this.settingsRepo.deleteMasterDepartment(id);
  }

  async getMasterDesignation(id: string): Promise<MasterDesignation | undefined> {
    return this.settingsRepo.getMasterDesignation(id);
  }

  async getAllMasterDesignations(): Promise<MasterDesignation[]> {
    return this.settingsRepo.getAllMasterDesignations();
  }

  async getMasterDesignationsByCompany(companyId: string): Promise<MasterDesignation[]> {
    return this.settingsRepo.getMasterDesignationsByCompany(companyId);
  }

  async createMasterDesignation(desg: InsertMasterDesignation): Promise<MasterDesignation> {
    return this.settingsRepo.createMasterDesignation(desg);
  }

  async updateMasterDesignation(id: string, desg: Partial<InsertMasterDesignation>): Promise<MasterDesignation | undefined> {
    return this.settingsRepo.updateMasterDesignation(id, desg);
  }

  async deleteMasterDesignation(id: string): Promise<boolean> {
    return this.settingsRepo.deleteMasterDesignation(id);
  }

  async getMasterLocation(id: string): Promise<MasterLocation | undefined> {
    return this.settingsRepo.getMasterLocation(id);
  }

  async getAllMasterLocations(): Promise<MasterLocation[]> {
    return this.settingsRepo.getAllMasterLocations();
  }

  async getMasterLocationsByCompany(companyId: string): Promise<MasterLocation[]> {
    return this.settingsRepo.getMasterLocationsByCompany(companyId);
  }

  async createMasterLocation(loc: InsertMasterLocation): Promise<MasterLocation> {
    return this.settingsRepo.createMasterLocation(loc);
  }

  async updateMasterLocation(id: string, loc: Partial<InsertMasterLocation>): Promise<MasterLocation | undefined> {
    return this.settingsRepo.updateMasterLocation(id, loc);
  }

  async deleteMasterLocation(id: string): Promise<boolean> {
    return this.settingsRepo.deleteMasterLocation(id);
  }

  async getEarningHead(id: string): Promise<EarningHead | undefined> {
    return this.settingsRepo.getEarningHead(id);
  }

  async getEarningHeadsByCompany(companyId: string): Promise<EarningHead[]> {
    return this.settingsRepo.getEarningHeadsByCompany(companyId);
  }

  async createEarningHead(head: InsertEarningHead): Promise<EarningHead> {
    return this.settingsRepo.createEarningHead(head);
  }

  async updateEarningHead(id: string, head: Partial<InsertEarningHead>): Promise<EarningHead | undefined> {
    return this.settingsRepo.updateEarningHead(id, head);
  }

  async deleteEarningHead(id: string): Promise<boolean> {
    return this.settingsRepo.deleteEarningHead(id);
  }

  async getDeductionHead(id: string): Promise<DeductionHead | undefined> {
    return this.settingsRepo.getDeductionHead(id);
  }

  async getDeductionHeadsByCompany(companyId: string): Promise<DeductionHead[]> {
    return this.settingsRepo.getDeductionHeadsByCompany(companyId);
  }

  async createDeductionHead(head: InsertDeductionHead): Promise<DeductionHead> {
    return this.settingsRepo.createDeductionHead(head);
  }

  async updateDeductionHead(id: string, head: Partial<InsertDeductionHead>): Promise<DeductionHead | undefined> {
    return this.settingsRepo.updateDeductionHead(id, head);
  }

  async deleteDeductionHead(id: string): Promise<boolean> {
    return this.settingsRepo.deleteDeductionHead(id);
  }

  async getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined> {
    return this.settingsRepo.getTimeOfficePolicy(id);
  }

  async getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]> {
    return this.settingsRepo.getTimeOfficePoliciesByCompany(companyId);
  }

  async createTimeOfficePolicy(policy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy> {
    return this.settingsRepo.createTimeOfficePolicy(policy);
  }

  async updateTimeOfficePolicy(id: string, policy: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined> {
    return this.settingsRepo.updateTimeOfficePolicy(id, policy);
  }

  async deleteTimeOfficePolicy(id: string): Promise<boolean> {
    return this.settingsRepo.deleteTimeOfficePolicy(id);
  }

  async getHoliday(id: string): Promise<Holiday | undefined> {
    return this.settingsRepo.getHoliday(id);
  }

  async getHolidaysByCompany(companyId: string): Promise<Holiday[]> {
    return this.settingsRepo.getHolidaysByCompany(companyId);
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    return this.settingsRepo.createHoliday(holiday);
  }

  async updateHoliday(id: string, holiday: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    return this.settingsRepo.updateHoliday(id, holiday);
  }

  async deleteHoliday(id: string): Promise<boolean> {
    return this.settingsRepo.deleteHoliday(id);
  }

  async getAllHolidays(): Promise<Holiday[]> {
    return this.settingsRepo.getAllHolidays();
  }

  async getWageGrade(id: string): Promise<WageGrade | undefined> {
    return this.settingsRepo.getWageGrade(id);
  }

  async getAllWageGrades(): Promise<WageGrade[]> {
    return this.settingsRepo.getAllWageGrades();
  }

  async getWageGradesByCompany(companyId: string): Promise<WageGrade[]> {
    return this.settingsRepo.getWageGradesByCompany(companyId);
  }

  async createWageGrade(grade: InsertWageGrade): Promise<WageGrade> {
    return this.settingsRepo.createWageGrade(grade);
  }

  async updateWageGrade(id: string, grade: Partial<InsertWageGrade>): Promise<WageGrade | undefined> {
    return this.settingsRepo.updateWageGrade(id, grade);
  }

  async deleteWageGrade(id: string): Promise<boolean> {
    return this.settingsRepo.deleteWageGrade(id);
  }

}

export const settingsService = new SettingsService();
