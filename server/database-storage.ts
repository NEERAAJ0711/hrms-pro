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
import { db } from "./db";
import { IStorage } from "./storage";
import { randomUUID } from "crypto";
import { AttendanceRepository } from "./repositories/attendance-repository";
import { AuditRepository } from "./repositories/audit-repository";
import { BiometricRepository } from "./repositories/biometric-repository";
import { CompanyRepository } from "./repositories/company-repository";
import { ComplianceRepository } from "./repositories/compliance-repository";
import { DashboardRepository } from "./repositories/dashboard-repository";
import { EmployeeRepository } from "./repositories/employee-repository";
import { KraRepository } from "./repositories/kra-repository";
import { LeaveRepository } from "./repositories/leave-repository";
import { PayrollRepository } from "./repositories/payroll-repository";
import { RecruitmentRepository } from "./repositories/recruitment-repository";
import { SettingsRepository } from "./repositories/settings-repository";
import { UserRepository } from "./repositories/user-repository";

// DatabaseStorage is now a thin facade that delegates every call to the
// per-domain repositories in ./repositories (Task #5 Phase B). The public
// IStorage surface and all behavior are identical to before.
export class DatabaseStorage implements IStorage {
  private attendanceRepo = new AttendanceRepository();
  private auditRepo = new AuditRepository();
  private biometricRepo = new BiometricRepository();
  private companyRepo = new CompanyRepository();
  private complianceRepo = new ComplianceRepository();
  private dashboardRepo = new DashboardRepository();
  private employeeRepo = new EmployeeRepository();
  private kraRepo = new KraRepository();
  private leaveRepo = new LeaveRepository();
  private payrollRepo = new PayrollRepository();
  private recruitmentRepo = new RecruitmentRepository();
  private settingsRepo = new SettingsRepository();
  private userRepo = new UserRepository();

  // ── Attendance ──
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

  // ── Audit ──
  async writeAuditLog(entry: { action: string; userId: string; userName: string; details: string }): Promise<void> {
    return this.auditRepo.writeAuditLog(entry);
  }

  // ── Biometric ──
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

  // ── Company ──
  async getCompany(id: string): Promise<Company | undefined> {
    return this.companyRepo.getCompany(id);
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    return this.companyRepo.createCompany(company);
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    return this.companyRepo.updateCompany(id, company);
  }

  async deleteCompany(id: string): Promise<boolean> {
    return this.companyRepo.deleteCompany(id);
  }

  async getAllCompanies(): Promise<Company[]> {
    return this.companyRepo.getAllCompanies();
  }

  async getCompanyContractors(companyId: string): Promise<(CompanyContractor & { contractorName: string })[]> {
    return this.companyRepo.getCompanyContractors(companyId);
  }

  async addCompanyContractor(data: InsertCompanyContractor): Promise<CompanyContractor> {
    return this.companyRepo.addCompanyContractor(data);
  }

  async removeCompanyContractor(companyId: string, contractorId: string): Promise<boolean> {
    return this.companyRepo.removeCompanyContractor(companyId, contractorId);
  }

  async getPrincipalEmployers(contractorId: string): Promise<(CompanyContractor & { companyName: string })[]> {
    return this.companyRepo.getPrincipalEmployers(contractorId);
  }

  async getContractorEmployees(companyId: string, contractorId: string): Promise<(Employee & { contractorEmployeeId: string; taggedDate: string | null; taggedBy: string | null })[]> {
    return this.companyRepo.getContractorEmployees(companyId, contractorId);
  }

  async addContractorEmployee(companyId: string, contractorId: string, employeeId: string, taggedDate?: string, taggedBy?: string): Promise<void> {
    return this.companyRepo.addContractorEmployee(companyId, contractorId, employeeId, taggedDate, taggedBy);
  }

  async removeContractorEmployee(companyId: string, contractorId: string, employeeId: string): Promise<boolean> {
    return this.companyRepo.removeContractorEmployee(companyId, contractorId, employeeId);
  }

  async getContractorMastersByCompany(companyId: string): Promise<ContractorMaster[]> {
    return this.companyRepo.getContractorMastersByCompany(companyId);
  }

  async getContractorMaster(id: string): Promise<ContractorMaster | undefined> {
    return this.companyRepo.getContractorMaster(id);
  }

  async createContractorMaster(data: InsertContractorMaster): Promise<ContractorMaster> {
    return this.companyRepo.createContractorMaster(data);
  }

  async updateContractorMaster(id: string, data: Partial<InsertContractorMaster>): Promise<ContractorMaster | undefined> {
    return this.companyRepo.updateContractorMaster(id, data);
  }

  async deleteContractorMaster(id: string): Promise<boolean> {
    return this.companyRepo.deleteContractorMaster(id);
  }

  // ── Compliance ──
  async getStatutorySettings(id: string): Promise<StatutorySettings | undefined> {
    return this.complianceRepo.getStatutorySettings(id);
  }

  async getStatutorySettingsByCompany(companyId: string): Promise<StatutorySettings | undefined> {
    return this.complianceRepo.getStatutorySettingsByCompany(companyId);
  }

  async createStatutorySettings(s: InsertStatutorySettings): Promise<StatutorySettings> {
    return this.complianceRepo.createStatutorySettings(s);
  }

  async updateStatutorySettings(id: string, s: Partial<InsertStatutorySettings>): Promise<StatutorySettings | undefined> {
    return this.complianceRepo.updateStatutorySettings(id, s);
  }

  async deleteStatutorySettings(id: string): Promise<boolean> {
    return this.complianceRepo.deleteStatutorySettings(id);
  }

  // ── Dashboard ──
  async getDashboardStats(): Promise<DashboardStats> {
    return this.dashboardRepo.getDashboardStats();
  }

  async getDashboardStatsByCompany(companyId: string): Promise<DashboardStats> {
    return this.dashboardRepo.getDashboardStatsByCompany(companyId);
  }

  // ── Employee ──
  async getEmployee(id: string): Promise<Employee | undefined> {
    return this.employeeRepo.getEmployee(id);
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    return this.employeeRepo.getEmployeeByUserId(userId);
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return this.employeeRepo.getEmployeesByCompany(companyId);
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    return this.employeeRepo.createEmployee(employee);
  }

  async updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    return this.employeeRepo.updateEmployee(id, employee);
  }

  async deleteEmployee(id: string): Promise<boolean> {
    return this.employeeRepo.deleteEmployee(id);
  }

  async getAllEmployees(): Promise<Employee[]> {
    return this.employeeRepo.getAllEmployees();
  }

  async getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]> {
    return this.employeeRepo.getPreviousExperiencesByEmployee(employeeId);
  }

  async getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]> {
    return this.employeeRepo.getPreviousExperiencesByCandidate(candidateProfileId);
  }

  async createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience> {
    return this.employeeRepo.createPreviousExperience(exp);
  }

  async deletePreviousExperience(id: string): Promise<void> {
    return this.employeeRepo.deletePreviousExperience(id);
  }

  // ── Kra ──
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

  // ── Leave ──
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

  // ── Payroll ──
  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.getSalaryStructure(id);
  }

  async getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.getSalaryStructureByEmployee(employeeId);
  }

  async getSalaryStructuresByEmployee(employeeId: string): Promise<SalaryStructure[]> {
    return this.payrollRepo.getSalaryStructuresByEmployee(employeeId);
  }

  async createSalaryStructure(salaryStructure: InsertSalaryStructure): Promise<SalaryStructure> {
    return this.payrollRepo.createSalaryStructure(salaryStructure);
  }

  async updateSalaryStructure(id: string, salaryStructure: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined> {
    return this.payrollRepo.updateSalaryStructure(id, salaryStructure);
  }

  async deleteSalaryStructure(id: string): Promise<boolean> {
    return this.payrollRepo.deleteSalaryStructure(id);
  }

  async getAllSalaryStructures(): Promise<SalaryStructure[]> {
    return this.payrollRepo.getAllSalaryStructures();
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    return this.payrollRepo.getPayroll(id);
  }

  async getPayrollByEmployee(employeeId: string): Promise<Payroll[]> {
    return this.payrollRepo.getPayrollByEmployee(employeeId);
  }

  async getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]> {
    return this.payrollRepo.getPayrollByMonth(companyId, month, year);
  }

  async getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined> {
    return this.payrollRepo.getPayrollByEmployeeMonth(employeeId, month, year);
  }

  async createPayroll(record: InsertPayroll): Promise<Payroll> {
    return this.payrollRepo.createPayroll(record);
  }

  async updatePayroll(id: string, record: Partial<InsertPayroll>): Promise<Payroll | undefined> {
    return this.payrollRepo.updatePayroll(id, record);
  }

  async deletePayroll(id: string): Promise<boolean> {
    return this.payrollRepo.deletePayroll(id);
  }

  async getAllPayroll(): Promise<Payroll[]> {
    return this.payrollRepo.getAllPayroll();
  }

  async getFnfSettlement(id: string): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.getFnfSettlement(id);
  }

  async getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.getFnfSettlementByEmployee(employeeId);
  }

  async getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]> {
    return this.payrollRepo.getFnfSettlementsByCompany(companyId);
  }

  async createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement> {
    return this.payrollRepo.createFnfSettlement(settlement);
  }

  async updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined> {
    return this.payrollRepo.updateFnfSettlement(id, settlement);
  }

  async deleteFnfSettlement(id: string): Promise<boolean> {
    return this.payrollRepo.deleteFnfSettlement(id);
  }

  async getAllFnfSettlements(): Promise<FnfSettlement[]> {
    return this.payrollRepo.getAllFnfSettlements();
  }

  async getLoanAdvance(id: string): Promise<LoanAdvance | undefined> {
    return this.payrollRepo.getLoanAdvance(id);
  }

  async getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]> {
    return this.payrollRepo.getLoanAdvancesByEmployee(employeeId);
  }

  async getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]> {
    return this.payrollRepo.getLoanAdvancesByCompany(companyId);
  }

  async createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance> {
    return this.payrollRepo.createLoanAdvance(data);
  }

  async updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined> {
    return this.payrollRepo.updateLoanAdvance(id, data);
  }

  async deleteLoanAdvance(id: string): Promise<boolean> {
    return this.payrollRepo.deleteLoanAdvance(id);
  }

  async getExpensesByCompany(companyId: string): Promise<any[]> {
    return this.payrollRepo.getExpensesByCompany(companyId);
  }

  async getExpensesByEmployee(employeeId: string): Promise<any[]> {
    return this.payrollRepo.getExpensesByEmployee(employeeId);
  }

  async createExpense(data: any): Promise<any> {
    return this.payrollRepo.createExpense(data);
  }

  async updateExpense(id: string, data: any): Promise<any> {
    return this.payrollRepo.updateExpense(id, data);
  }

  async deleteExpense(id: string): Promise<boolean> {
    return this.payrollRepo.deleteExpense(id);
  }

  // ── Recruitment ──
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

  // ── Settings ──
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

  // ── User ──
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

}
