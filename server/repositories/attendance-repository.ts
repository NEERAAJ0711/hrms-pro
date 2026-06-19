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

// AttendanceRepository — DB access for the Attendance domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class AttendanceRepository {
  async getAttendance(id: string): Promise<Attendance | undefined> {
    const result = await db.select().from(attendance).where(eq(attendance.id, id));
    return result[0];
  }

  async getAttendanceByEmployee(employeeId: string, date?: string): Promise<Attendance[]> {
    if (date) {
      return await db.select().from(attendance).where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)));
    }
    return await db.select().from(attendance).where(eq(attendance.employeeId, employeeId));
  }

  async getAttendanceByDate(companyId: string, date: string): Promise<Attendance[]> {
    return await db.select().from(attendance).where(and(eq(attendance.companyId, companyId), eq(attendance.date, date)));
  }

  async createAttendance(record: InsertAttendance): Promise<Attendance> {
    const id = randomUUID();
    const result = await db.insert(attendance).values({ ...record, id }).returning();
    return result[0];
  }

  async updateAttendance(id: string, record: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const result = await db.update(attendance).set(record).where(eq(attendance.id, id)).returning();
    return result[0];
  }

  async deleteAttendance(id: string): Promise<boolean> {
    const result = await db.delete(attendance).where(eq(attendance.id, id)).returning();
    return result.length > 0;
  }

  async getAllAttendance(): Promise<Attendance[]> {
    return await db.select().from(attendance);
  }

  async getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined> {
    const result = await db.select().from(attendance).where(
      and(eq(attendance.employeeId, employeeId), eq(attendance.date, date))
    );
    return result[0];
  }

  async getOutdoorEntriesByCompany(companyId: string): Promise<any[]> {
    return await db.select().from(outdoorEntries).where(eq(outdoorEntries.companyId, companyId)).orderBy(desc(outdoorEntries.createdAt));
  }

  async getOutdoorEntriesByEmployee(employeeId: string): Promise<any[]> {
    return await db.select().from(outdoorEntries).where(eq(outdoorEntries.employeeId, employeeId)).orderBy(desc(outdoorEntries.createdAt));
  }

  async createOutdoorEntry(data: any): Promise<any> {
    const row = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    const result = await db.insert(outdoorEntries).values(row).returning();
    return result[0];
  }

  async updateOutdoorEntry(id: string, data: any): Promise<any> {
    const result = await db.update(outdoorEntries).set(data).where(eq(outdoorEntries.id, id)).returning();
    return result[0];
  }

  async deleteOutdoorEntry(id: string): Promise<boolean> {
    const result = await db.delete(outdoorEntries).where(eq(outdoorEntries.id, id)).returning();
    return result.length > 0;
  }
}
