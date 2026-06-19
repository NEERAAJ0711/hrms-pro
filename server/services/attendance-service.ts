import { AttendanceRepository } from "../repositories/attendance-repository";
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

// AttendanceService — business/service layer for the Attendance domain (Task: storage layering).
// Wraps AttendanceRepository so route handlers depend on a service seam instead of
// reaching into storage/Drizzle directly. Delegation preserves exact behavior;
// domain-specific calculation logic can migrate here incrementally.
export class AttendanceService {
  constructor(private attendanceRepo = new AttendanceRepository()) {}

  async getAttendance(id: string): Promise<Attendance | undefined> {
    return this.attendanceRepo.getAttendance(id);
  }

  async getAttendanceByEmployee(employeeId: string, date?: string): Promise<Attendance[]> {
    return this.attendanceRepo.getAttendanceByEmployee(employeeId, date);
  }

  async getAttendanceByDate(companyId: string, date: string): Promise<Attendance[]> {
    return this.attendanceRepo.getAttendanceByDate(companyId, date);
  }

  async createAttendance(record: InsertAttendance): Promise<Attendance> {
    return this.attendanceRepo.createAttendance(record);
  }

  async updateAttendance(id: string, record: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    return this.attendanceRepo.updateAttendance(id, record);
  }

  async deleteAttendance(id: string): Promise<boolean> {
    return this.attendanceRepo.deleteAttendance(id);
  }

  async getAllAttendance(): Promise<Attendance[]> {
    return this.attendanceRepo.getAllAttendance();
  }

  async getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined> {
    return this.attendanceRepo.getAttendanceByEmployeeAndDate(employeeId, date);
  }

  async getOutdoorEntriesByCompany(companyId: string): Promise<any[]> {
    return this.attendanceRepo.getOutdoorEntriesByCompany(companyId);
  }

  async getOutdoorEntriesByEmployee(employeeId: string): Promise<any[]> {
    return this.attendanceRepo.getOutdoorEntriesByEmployee(employeeId);
  }

  async createOutdoorEntry(data: any): Promise<any> {
    return this.attendanceRepo.createOutdoorEntry(data);
  }

  async updateOutdoorEntry(id: string, data: any): Promise<any> {
    return this.attendanceRepo.updateOutdoorEntry(id, data);
  }

  async deleteOutdoorEntry(id: string): Promise<boolean> {
    return this.attendanceRepo.deleteOutdoorEntry(id);
  }

  getAttendanceWindowRaw(employeeId: string, cutoffStr: string, todayStr: string) {
    return this.attendanceRepo.getAttendanceWindowRaw(employeeId, cutoffStr, todayStr);
  }

}

export const attendanceService = new AttendanceService();
