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

// RecruitmentRepository — DB access for the Recruitment domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class RecruitmentRepository {
  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    const result = await db.select().from(jobPostings).where(eq(jobPostings.id, id));
    return result[0];
  }

  async getJobPostingsByCompany(companyId: string): Promise<JobPosting[]> {
    return await db.select().from(jobPostings).where(eq(jobPostings.companyId, companyId));
  }

  async createJobPosting(posting: InsertJobPosting): Promise<JobPosting> {
    const id = randomUUID();
    const result = await db.insert(jobPostings).values({ ...posting, id }).returning();
    return result[0];
  }

  async updateJobPosting(id: string, posting: Partial<InsertJobPosting>): Promise<JobPosting | undefined> {
    const result = await db.update(jobPostings).set(posting).where(eq(jobPostings.id, id)).returning();
    return result[0];
  }

  async deleteJobPosting(id: string): Promise<boolean> {
    const result = await db.delete(jobPostings).where(eq(jobPostings.id, id)).returning();
    return result.length > 0;
  }

  async getAllJobPostings(): Promise<JobPosting[]> {
    return await db.select().from(jobPostings);
  }

  async getJobApplication(id: string): Promise<JobApplication | undefined> {
    const result = await db.select().from(jobApplications).where(eq(jobApplications.id, id));
    return result[0];
  }

  async getJobApplicationsByPosting(jobPostingId: string): Promise<JobApplication[]> {
    return await db.select().from(jobApplications).where(eq(jobApplications.jobPostingId, jobPostingId));
  }

  async getJobApplicationsByEmployee(employeeId: string): Promise<JobApplication[]> {
    return await db.select().from(jobApplications).where(eq(jobApplications.employeeId, employeeId));
  }

  async getJobApplicationsByUserId(userId: string): Promise<JobApplication[]> {
    return await db.select().from(jobApplications).where(eq(jobApplications.applicantUserId, userId));
  }

  async getJobApplicationsByCompany(companyId: string): Promise<JobApplication[]> {
    return await db.select().from(jobApplications).where(eq(jobApplications.companyId, companyId));
  }

  async createJobApplication(application: InsertJobApplication): Promise<JobApplication> {
    const id = randomUUID();
    const result = await db.insert(jobApplications).values({ ...application, id }).returning();
    return result[0];
  }

  async updateJobApplication(id: string, application: Partial<JobApplication>): Promise<JobApplication | undefined> {
    const result = await db.update(jobApplications).set(application).where(eq(jobApplications.id, id)).returning();
    return result[0];
  }

  async deleteJobApplication(id: string): Promise<boolean> {
    const result = await db.delete(jobApplications).where(eq(jobApplications.id, id)).returning();
    return result.length > 0;
  }

  async getAllJobApplications(): Promise<JobApplication[]> {
    return await db.select().from(jobApplications);
  }

  async getCandidateProfile(id: string): Promise<CandidateProfile | undefined> {
    const result = await db.select().from(candidateProfiles).where(eq(candidateProfiles.id, id));
    return result[0];
  }

  async getCandidateProfileByUserId(userId: string): Promise<CandidateProfile | undefined> {
    const result = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId));
    return result[0];
  }

  async getCandidateProfileByAadhaar(aadhaar: string): Promise<CandidateProfile | undefined> {
    const result = await db.select().from(candidateProfiles).where(eq(candidateProfiles.aadhaar, aadhaar));
    return result[0];
  }

  async createCandidateProfile(profile: InsertCandidateProfile): Promise<CandidateProfile> {
    const id = randomUUID();
    const result = await db.insert(candidateProfiles).values({ ...profile, id }).returning();
    return result[0];
  }

  async updateCandidateProfile(id: string, profile: Partial<InsertCandidateProfile>): Promise<CandidateProfile | undefined> {
    const result = await db.update(candidateProfiles).set(profile).where(eq(candidateProfiles.id, id)).returning();
    return result[0];
  }
}
