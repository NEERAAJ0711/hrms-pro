import { KraRepository } from "../repositories/kra-repository";
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

// KraService — business/service layer for the Kra domain (Task: storage layering).
// Wraps KraRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class KraService {
  constructor(private kraRepo = new KraRepository()) {}

  async getKraTemplatesByCompany(companyId: string): Promise<KraTemplate[]> {
    return this.kraRepo.getKraTemplatesByCompany(companyId);
  }

  async getKraTemplate(id: string): Promise<KraTemplate | undefined> {
    return this.kraRepo.getKraTemplate(id);
  }

  async createKraTemplate(data: InsertKraTemplate): Promise<KraTemplate> {
    return this.kraRepo.createKraTemplate(data);
  }

  async updateKraTemplate(id: string, data: Partial<InsertKraTemplate>): Promise<KraTemplate | undefined> {
    return this.kraRepo.updateKraTemplate(id, data);
  }

  async deleteKraTemplate(id: string): Promise<boolean> {
    return this.kraRepo.deleteKraTemplate(id);
  }

  async getKraTemplateKpis(templateId: string): Promise<KraTemplateKpi[]> {
    return this.kraRepo.getKraTemplateKpis(templateId);
  }

  async createKraTemplateKpi(data: InsertKraTemplateKpi): Promise<KraTemplateKpi> {
    return this.kraRepo.createKraTemplateKpi(data);
  }

  async updateKraTemplateKpi(id: string, data: Partial<InsertKraTemplateKpi>): Promise<KraTemplateKpi | undefined> {
    return this.kraRepo.updateKraTemplateKpi(id, data);
  }

  async deleteKraTemplateKpi(id: string): Promise<boolean> {
    return this.kraRepo.deleteKraTemplateKpi(id);
  }

  async deleteKraTemplateKpisByTemplate(templateId: string): Promise<void> {
    return this.kraRepo.deleteKraTemplateKpisByTemplate(templateId);
  }

  async getKraAssignmentsByCompany(companyId: string): Promise<KraAssignment[]> {
    return this.kraRepo.getKraAssignmentsByCompany(companyId);
  }

  async getKraAssignmentsByEmployee(employeeId: string): Promise<KraAssignment[]> {
    return this.kraRepo.getKraAssignmentsByEmployee(employeeId);
  }

  async getKraAssignment(id: string): Promise<KraAssignment | undefined> {
    return this.kraRepo.getKraAssignment(id);
  }

  async createKraAssignment(data: InsertKraAssignment): Promise<KraAssignment> {
    return this.kraRepo.createKraAssignment(data);
  }

  async updateKraAssignment(id: string, data: Partial<InsertKraAssignment>): Promise<KraAssignment | undefined> {
    return this.kraRepo.updateKraAssignment(id, data);
  }

  async deleteKraAssignment(id: string): Promise<boolean> {
    return this.kraRepo.deleteKraAssignment(id);
  }

  async getKraAssignmentKpis(assignmentId: string): Promise<KraAssignmentKpi[]> {
    return this.kraRepo.getKraAssignmentKpis(assignmentId);
  }

  async createKraAssignmentKpi(data: InsertKraAssignmentKpi): Promise<KraAssignmentKpi> {
    return this.kraRepo.createKraAssignmentKpi(data);
  }

  async updateKraAssignmentKpi(id: string, data: Partial<InsertKraAssignmentKpi>): Promise<KraAssignmentKpi | undefined> {
    return this.kraRepo.updateKraAssignmentKpi(id, data);
  }

  async deleteKraAssignmentKpisByAssignment(assignmentId: string): Promise<void> {
    return this.kraRepo.deleteKraAssignmentKpisByAssignment(assignmentId);
  }

}

export const kraService = new KraService();
