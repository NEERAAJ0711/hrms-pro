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

// DashboardRepository — DB access for the Dashboard domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class DashboardRepository {
  async getDashboardStats(): Promise<DashboardStats> {
    const [companiesCount] = await db.select({ value: count() }).from(companies);
    const [employeesCount] = await db.select({ value: count() }).from(employees);
    const [usersCount] = await db.select({ value: count() }).from(users);
    const [activeCount] = await db.select({ value: count() }).from(employees).where(eq(employees.status, "active"));
    const [contractorsCount] = await db.select({ value: count() }).from(companyContractors);
    const [principalEmployersCount] = await db.select({ value: count() }).from(companyContractors);

    const deptRows = await db
      .select({ department: employees.department, count: count() })
      .from(employees)
      .groupBy(employees.department);

    const departmentDistribution = deptRows.map((r) => ({
      department: r.department || "Unassigned",
      count: r.count,
    }));

    const recentEmployees = await db
      .select()
      .from(employees)
      .orderBy(desc(employees.dateOfJoining))
      .limit(5);

    return {
      totalCompanies: companiesCount.value,
      totalEmployees: employeesCount.value,
      totalUsers: usersCount.value,
      activeEmployees: activeCount.value,
      totalContractors: contractorsCount.value,
      totalPrincipalEmployers: principalEmployersCount.value,
      departmentDistribution,
      recentEmployees,
    };
  }

  async getDashboardStatsByCompany(companyId: string): Promise<DashboardStats> {
    const [companiesCount] = await db.select({ value: count() }).from(companies).where(eq(companies.id, companyId));
    const [employeesCount] = await db.select({ value: count() }).from(employees).where(eq(employees.companyId, companyId));
    const [usersCount] = await db.select({ value: count() }).from(users).where(eq(users.companyId, companyId));
    const [activeCount] = await db.select({ value: count() }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));
    // Contractors this company has hired
    const [contractorsCount] = await db.select({ value: count() }).from(companyContractors).where(eq(companyContractors.companyId, companyId));
    // Companies that have hired this company as a contractor
    const [principalEmployersCount] = await db.select({ value: count() }).from(companyContractors).where(eq(companyContractors.contractorId, companyId));

    const deptRows = await db
      .select({ department: employees.department, count: count() })
      .from(employees)
      .where(eq(employees.companyId, companyId))
      .groupBy(employees.department);

    const departmentDistribution = deptRows.map((r) => ({
      department: r.department || "Unassigned",
      count: r.count,
    }));

    const recentEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.companyId, companyId))
      .orderBy(desc(employees.dateOfJoining))
      .limit(5);

    return {
      totalCompanies: companiesCount.value,
      totalEmployees: employeesCount.value,
      totalUsers: usersCount.value,
      activeEmployees: activeCount.value,
      totalContractors: contractorsCount.value,
      totalPrincipalEmployers: principalEmployersCount.value,
      departmentDistribution,
      recentEmployees,
    };
  }
}
