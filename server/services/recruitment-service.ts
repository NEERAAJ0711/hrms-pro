import { RecruitmentRepository } from "../repositories/recruitment-repository";
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

// RecruitmentService — business/service layer for the Recruitment domain (Task: storage layering).
// Wraps RecruitmentRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class RecruitmentService {
  constructor(private recruitmentRepo = new RecruitmentRepository()) {}

  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    return this.recruitmentRepo.getJobPosting(id);
  }

  async getJobPostingsByCompany(companyId: string): Promise<JobPosting[]> {
    return this.recruitmentRepo.getJobPostingsByCompany(companyId);
  }

  async createJobPosting(posting: InsertJobPosting): Promise<JobPosting> {
    return this.recruitmentRepo.createJobPosting(posting);
  }

  async updateJobPosting(id: string, posting: Partial<InsertJobPosting>): Promise<JobPosting | undefined> {
    return this.recruitmentRepo.updateJobPosting(id, posting);
  }

  async deleteJobPosting(id: string): Promise<boolean> {
    return this.recruitmentRepo.deleteJobPosting(id);
  }

  async getAllJobPostings(): Promise<JobPosting[]> {
    return this.recruitmentRepo.getAllJobPostings();
  }

  async getJobApplication(id: string): Promise<JobApplication | undefined> {
    return this.recruitmentRepo.getJobApplication(id);
  }

  async getJobApplicationsByPosting(jobPostingId: string): Promise<JobApplication[]> {
    return this.recruitmentRepo.getJobApplicationsByPosting(jobPostingId);
  }

  async getJobApplicationsByEmployee(employeeId: string): Promise<JobApplication[]> {
    return this.recruitmentRepo.getJobApplicationsByEmployee(employeeId);
  }

  async getJobApplicationsByUserId(userId: string): Promise<JobApplication[]> {
    return this.recruitmentRepo.getJobApplicationsByUserId(userId);
  }

  async getJobApplicationsByCompany(companyId: string): Promise<JobApplication[]> {
    return this.recruitmentRepo.getJobApplicationsByCompany(companyId);
  }

  async createJobApplication(application: InsertJobApplication): Promise<JobApplication> {
    return this.recruitmentRepo.createJobApplication(application);
  }

  async updateJobApplication(id: string, application: Partial<JobApplication>): Promise<JobApplication | undefined> {
    return this.recruitmentRepo.updateJobApplication(id, application);
  }

  async deleteJobApplication(id: string): Promise<boolean> {
    return this.recruitmentRepo.deleteJobApplication(id);
  }

  async getAllJobApplications(): Promise<JobApplication[]> {
    return this.recruitmentRepo.getAllJobApplications();
  }

  async getCandidateProfile(id: string): Promise<CandidateProfile | undefined> {
    return this.recruitmentRepo.getCandidateProfile(id);
  }

  async getCandidateProfileByUserId(userId: string): Promise<CandidateProfile | undefined> {
    return this.recruitmentRepo.getCandidateProfileByUserId(userId);
  }

  async getCandidateProfileByAadhaar(aadhaar: string): Promise<CandidateProfile | undefined> {
    return this.recruitmentRepo.getCandidateProfileByAadhaar(aadhaar);
  }

  async createCandidateProfile(profile: InsertCandidateProfile): Promise<CandidateProfile> {
    return this.recruitmentRepo.createCandidateProfile(profile);
  }

  async updateCandidateProfile(id: string, profile: Partial<InsertCandidateProfile>): Promise<CandidateProfile | undefined> {
    return this.recruitmentRepo.updateCandidateProfile(id, profile);
  }

}

export const recruitmentService = new RecruitmentService();
