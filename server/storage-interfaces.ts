// Domain storage interfaces — decomposed from the former 2,037-line IStorage
// god-interface (Task #5, Phase A). The composite `IStorage` is assembled from
// these per-domain interfaces, so existing implementers (DatabaseStorage,
// MemStorage) and callers see an identical shape with zero behavior change.
import {
  type User,
  type InsertUser,
  type Notification,
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
  type LeavePolicy,
  type InsertLeavePolicy,
  type SalaryStructure,
  type InsertSalaryStructure,
  type Payroll,
  type InsertPayroll,
  type Setting,
  type InsertSetting,
  type MasterDepartment,
  type InsertMasterDepartment,
  type MasterDesignation,
  type InsertMasterDesignation,
  type WageGrade,
  type InsertWageGrade,
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
  type LoanAdvance,
  type InsertLoanAdvance,
  type InsertPreviousExperience,
  type UserPermission,
  type ModuleAccessRequest,
  type CompanyContractor,
  type InsertCompanyContractor,
  type ContractorMaster,
  type InsertContractorMaster,
  type KraTemplate,
  type InsertKraTemplate,
  type KraTemplateKpi,
  type InsertKraTemplateKpi,
  type KraAssignment,
  type InsertKraAssignment,
  type KraAssignmentKpi,
  type InsertKraAssignmentKpi,
} from "@shared/schema";

// ─── Users & access control ─────────────────────────────────────────────────
export interface IUserStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;

  // User Permissions
  getUserPermissions(userId: string): Promise<UserPermission[]>;
  setUserPermissions(userId: string, permissions: { module: string; canAccess: boolean }[], grantedBy: string, companyId: string | null): Promise<UserPermission[]>;

  // Module Access Requests
  createModuleAccessRequest(data: { userId: string; companyId: string | null; module: string; actions?: string[] | null; reason?: string | null }): Promise<ModuleAccessRequest>;
  getModuleAccessRequest(id: string): Promise<ModuleAccessRequest | undefined>;
  listModuleAccessRequests(filters: { companyId?: string; userId?: string; status?: string }): Promise<ModuleAccessRequest[]>;
  decideModuleAccessRequest(id: string, status: "approved" | "denied" | "revoked", decidedBy: string, decisionNote?: string | null): Promise<ModuleAccessRequest | undefined>;
  findPendingModuleAccessRequest(userId: string, module: string): Promise<ModuleAccessRequest | undefined>;
  deleteModuleAccessRequest(id: string): Promise<boolean>;
}

// ─── Companies & contractors ────────────────────────────────────────────────
export interface ICompanyStorage {
  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;
  getAllCompanies(): Promise<Company[]>;

  // Company Contractors
  getCompanyContractors(companyId: string): Promise<(CompanyContractor & { contractorName: string })[]>;
  addCompanyContractor(data: InsertCompanyContractor): Promise<CompanyContractor>;
  removeCompanyContractor(companyId: string, contractorId: string): Promise<boolean>;
  getPrincipalEmployers(contractorId: string): Promise<(CompanyContractor & { companyName: string })[]>;
  getContractorEmployees(companyId: string, contractorId: string): Promise<(Employee & { contractorEmployeeId: string; taggedDate: string | null; taggedBy: string | null })[]>;
  addContractorEmployee(companyId: string, contractorId: string, employeeId: string, taggedDate?: string, taggedBy?: string): Promise<void>;
  removeContractorEmployee(companyId: string, contractorId: string, employeeId: string): Promise<boolean>;

  // Contractor Masters
  getContractorMastersByCompany(companyId: string): Promise<ContractorMaster[]>;
  getContractorMaster(id: string): Promise<ContractorMaster | undefined>;
  createContractorMaster(data: InsertContractorMaster): Promise<ContractorMaster>;
  updateContractorMaster(id: string, data: Partial<InsertContractorMaster>): Promise<ContractorMaster | undefined>;
  deleteContractorMaster(id: string): Promise<boolean>;
}

// ─── Employees ──────────────────────────────────────────────────────────────
export interface IEmployeeStorage {
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByUserId(userId: string): Promise<Employee | undefined>;
  getEmployeesByCompany(companyId: string): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;
  getAllEmployees(): Promise<Employee[]>;

  // Previous Experiences
  getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]>;
  getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]>;
  createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience>;
  deletePreviousExperience(id: string): Promise<void>;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
export interface IDashboardStorage {
  getDashboardStats(): Promise<DashboardStats>;
  getDashboardStatsByCompany(companyId: string): Promise<DashboardStats>;
}

// ─── Attendance ─────────────────────────────────────────────────────────────
export interface IAttendanceStorage {
  getAttendance(id: string): Promise<Attendance | undefined>;
  getAttendanceByEmployee(employeeId: string, date?: string): Promise<Attendance[]>;
  getAttendanceByDate(companyId: string, date: string): Promise<Attendance[]>;
  createAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: string, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  deleteAttendance(id: string): Promise<boolean>;
  getAllAttendance(): Promise<Attendance[]>;
  getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined>;

  // Outdoor Entries
  getOutdoorEntriesByCompany(companyId: string): Promise<any[]>;
  getOutdoorEntriesByEmployee(employeeId: string): Promise<any[]>;
  createOutdoorEntry(data: any): Promise<any>;
  updateOutdoorEntry(id: string, data: any): Promise<any>;
  deleteOutdoorEntry(id: string): Promise<boolean>;
}

// ─── Leave ──────────────────────────────────────────────────────────────────
export interface ILeaveStorage {
  // Leave Types
  getLeaveType(id: string): Promise<LeaveType | undefined>;
  getLeaveTypesByCompany(companyId: string | null): Promise<LeaveType[]>;
  createLeaveType(leaveType: InsertLeaveType): Promise<LeaveType>;
  updateLeaveType(id: string, leaveType: Partial<InsertLeaveType>): Promise<LeaveType | undefined>;
  deleteLeaveType(id: string): Promise<boolean>;
  getAllLeaveTypes(): Promise<LeaveType[]>;

  // Leave Requests
  getLeaveRequest(id: string): Promise<LeaveRequest | undefined>;
  getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]>;
  getLeaveRequestsByCompany(companyId: string): Promise<LeaveRequest[]>;
  createLeaveRequest(leaveRequest: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, leaveRequest: Partial<LeaveRequest>): Promise<LeaveRequest | undefined>;
  deleteLeaveRequest(id: string): Promise<boolean>;
  getAllLeaveRequests(): Promise<LeaveRequest[]>;

  // Leave Policies
  getLeavePoliciesByCompany(companyId: string): Promise<LeavePolicy[]>;
  getLeavePolicy(id: string): Promise<LeavePolicy | undefined>;
  createLeavePolicy(policy: InsertLeavePolicy): Promise<LeavePolicy>;
  updateLeavePolicy(id: string, policy: Partial<InsertLeavePolicy>): Promise<LeavePolicy | undefined>;
  deleteLeavePolicy(id: string): Promise<boolean>;

  // Leave Adjustments
  getLeaveAdjustmentsByCompany(companyId: string): Promise<any[]>;
  getLeaveAdjustmentsByEmployee(employeeId: string): Promise<any[]>;
  createLeaveAdjustment(data: any): Promise<any>;
  deleteLeaveAdjustment(id: string): Promise<boolean>;

  // Comp-Off Applications
  getCompOffByCompany(companyId: string): Promise<any[]>;
  getCompOffByEmployee(employeeId: string): Promise<any[]>;
  createCompOff(data: any): Promise<any>;
  updateCompOff(id: string, data: any): Promise<any>;
  deleteCompOff(id: string): Promise<boolean>;
}

// ─── Payroll, salary & settlements ──────────────────────────────────────────
export interface IPayrollStorage {
  // Salary Structures
  getSalaryStructure(id: string): Promise<SalaryStructure | undefined>;
  getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined>;
  getSalaryStructuresByEmployee(employeeId: string): Promise<SalaryStructure[]>;
  createSalaryStructure(salaryStructure: InsertSalaryStructure): Promise<SalaryStructure>;
  updateSalaryStructure(id: string, salaryStructure: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined>;
  deleteSalaryStructure(id: string): Promise<boolean>;
  getAllSalaryStructures(): Promise<SalaryStructure[]>;

  // Payroll
  getPayroll(id: string): Promise<Payroll | undefined>;
  getPayrollByEmployee(employeeId: string): Promise<Payroll[]>;
  getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]>;
  getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined>;
  createPayroll(payroll: InsertPayroll): Promise<Payroll>;
  updatePayroll(id: string, payroll: Partial<InsertPayroll>): Promise<Payroll | undefined>;
  deletePayroll(id: string): Promise<boolean>;
  getAllPayroll(): Promise<Payroll[]>;

  // F&F Settlements
  getFnfSettlement(id: string): Promise<FnfSettlement | undefined>;
  getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined>;
  getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]>;
  createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement>;
  updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined>;
  deleteFnfSettlement(id: string): Promise<boolean>;
  getAllFnfSettlements(): Promise<FnfSettlement[]>;

  // Loan & Advances
  getLoanAdvance(id: string): Promise<LoanAdvance | undefined>;
  getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]>;
  getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]>;
  createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance>;
  updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined>;
  deleteLoanAdvance(id: string): Promise<boolean>;

  // Expenses
  getExpensesByCompany(companyId: string): Promise<any[]>;
  getExpensesByEmployee(employeeId: string): Promise<any[]>;
  createExpense(data: any): Promise<any>;
  updateExpense(id: string, data: any): Promise<any>;
  deleteExpense(id: string): Promise<boolean>;
}

// ─── Settings, masters & statutory configuration ────────────────────────────
export interface ISettingsStorage {
  // Settings
  getSetting(id: string): Promise<Setting | undefined>;
  getSettingByKey(companyId: string | null, key: string): Promise<Setting | undefined>;
  getSettingsByCategory(companyId: string | null, category: string): Promise<Setting[]>;
  createSetting(setting: InsertSetting): Promise<Setting>;
  updateSetting(id: string, setting: Partial<InsertSetting>): Promise<Setting | undefined>;
  deleteSetting(id: string): Promise<boolean>;
  getAllSettings(): Promise<Setting[]>;

  // Master Departments
  getMasterDepartment(id: string): Promise<MasterDepartment | undefined>;
  getAllMasterDepartments(): Promise<MasterDepartment[]>;
  getMasterDepartmentsByCompany(companyId: string): Promise<MasterDepartment[]>;
  createMasterDepartment(dept: InsertMasterDepartment): Promise<MasterDepartment>;
  updateMasterDepartment(id: string, dept: Partial<InsertMasterDepartment>): Promise<MasterDepartment | undefined>;
  deleteMasterDepartment(id: string): Promise<boolean>;

  // Master Designations
  getMasterDesignation(id: string): Promise<MasterDesignation | undefined>;
  getAllMasterDesignations(): Promise<MasterDesignation[]>;
  getMasterDesignationsByCompany(companyId: string): Promise<MasterDesignation[]>;
  createMasterDesignation(desg: InsertMasterDesignation): Promise<MasterDesignation>;
  updateMasterDesignation(id: string, desg: Partial<InsertMasterDesignation>): Promise<MasterDesignation | undefined>;
  deleteMasterDesignation(id: string): Promise<boolean>;

  // Wage Grades
  getAllWageGrades(): Promise<WageGrade[]>;
  getWageGradesByCompany(companyId: string): Promise<WageGrade[]>;
  getWageGrade(id: string): Promise<WageGrade | undefined>;
  createWageGrade(grade: InsertWageGrade): Promise<WageGrade>;
  updateWageGrade(id: string, grade: Partial<InsertWageGrade>): Promise<WageGrade | undefined>;
  deleteWageGrade(id: string): Promise<boolean>;

  // Master Locations
  getMasterLocation(id: string): Promise<MasterLocation | undefined>;
  getAllMasterLocations(): Promise<MasterLocation[]>;
  getMasterLocationsByCompany(companyId: string): Promise<MasterLocation[]>;
  createMasterLocation(loc: InsertMasterLocation): Promise<MasterLocation>;
  updateMasterLocation(id: string, loc: Partial<InsertMasterLocation>): Promise<MasterLocation | undefined>;
  deleteMasterLocation(id: string): Promise<boolean>;

  // Earning Heads
  getEarningHead(id: string): Promise<EarningHead | undefined>;
  getEarningHeadsByCompany(companyId: string): Promise<EarningHead[]>;
  createEarningHead(head: InsertEarningHead): Promise<EarningHead>;
  updateEarningHead(id: string, head: Partial<InsertEarningHead>): Promise<EarningHead | undefined>;
  deleteEarningHead(id: string): Promise<boolean>;

  // Deduction Heads
  getDeductionHead(id: string): Promise<DeductionHead | undefined>;
  getDeductionHeadsByCompany(companyId: string): Promise<DeductionHead[]>;
  createDeductionHead(head: InsertDeductionHead): Promise<DeductionHead>;
  updateDeductionHead(id: string, head: Partial<InsertDeductionHead>): Promise<DeductionHead | undefined>;
  deleteDeductionHead(id: string): Promise<boolean>;

  // Time Office Policies
  getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined>;
  getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]>;
  createTimeOfficePolicy(policy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy>;
  updateTimeOfficePolicy(id: string, policy: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined>;
  deleteTimeOfficePolicy(id: string): Promise<boolean>;

  // Holidays
  getHoliday(id: string): Promise<Holiday | undefined>;
  getHolidaysByCompany(companyId: string): Promise<Holiday[]>;
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  updateHoliday(id: string, holiday: Partial<InsertHoliday>): Promise<Holiday | undefined>;
  deleteHoliday(id: string): Promise<boolean>;
  getAllHolidays(): Promise<Holiday[]>;
}

// ─── Compliance (statutory settings) ────────────────────────────────────────
export interface IComplianceStorage {
  getStatutorySettings(id: string): Promise<StatutorySettings | undefined>;
  getStatutorySettingsByCompany(companyId: string): Promise<StatutorySettings | undefined>;
  createStatutorySettings(settings: InsertStatutorySettings): Promise<StatutorySettings>;
  updateStatutorySettings(id: string, settings: Partial<InsertStatutorySettings>): Promise<StatutorySettings | undefined>;
  deleteStatutorySettings(id: string): Promise<boolean>;
}

// ─── Recruitment ────────────────────────────────────────────────────────────
export interface IRecruitmentStorage {
  // Job Postings
  getJobPosting(id: string): Promise<JobPosting | undefined>;
  getJobPostingsByCompany(companyId: string): Promise<JobPosting[]>;
  createJobPosting(posting: InsertJobPosting): Promise<JobPosting>;
  updateJobPosting(id: string, posting: Partial<InsertJobPosting>): Promise<JobPosting | undefined>;
  deleteJobPosting(id: string): Promise<boolean>;
  getAllJobPostings(): Promise<JobPosting[]>;

  // Job Applications
  getJobApplication(id: string): Promise<JobApplication | undefined>;
  getJobApplicationsByPosting(jobPostingId: string): Promise<JobApplication[]>;
  getJobApplicationsByEmployee(employeeId: string): Promise<JobApplication[]>;
  getJobApplicationsByUserId(userId: string): Promise<JobApplication[]>;
  getJobApplicationsByCompany(companyId: string): Promise<JobApplication[]>;
  createJobApplication(application: InsertJobApplication): Promise<JobApplication>;
  updateJobApplication(id: string, application: Partial<JobApplication>): Promise<JobApplication | undefined>;
  deleteJobApplication(id: string): Promise<boolean>;
  getAllJobApplications(): Promise<JobApplication[]>;

  // Candidate Profiles
  getCandidateProfile(id: string): Promise<CandidateProfile | undefined>;
  getCandidateProfileByUserId(userId: string): Promise<CandidateProfile | undefined>;
  getCandidateProfileByAadhaar(aadhaar: string): Promise<CandidateProfile | undefined>;
  createCandidateProfile(profile: InsertCandidateProfile): Promise<CandidateProfile>;
  updateCandidateProfile(id: string, profile: Partial<InsertCandidateProfile>): Promise<CandidateProfile | undefined>;
}

// ─── Biometric ──────────────────────────────────────────────────────────────
export interface IBiometricStorage {
  // Biometric Punch Logs
  getBiometricPunchLog(id: string): Promise<BiometricPunchLog | undefined>;
  getBiometricPunchLogsByCompany(companyId: string): Promise<BiometricPunchLog[]>;
  getBiometricPunchLogsByDate(companyId: string, date: string): Promise<BiometricPunchLog[]>;
  createBiometricPunchLog(log: InsertBiometricPunchLog): Promise<BiometricPunchLog>;
  updateBiometricPunchLog(id: string, log: Partial<InsertBiometricPunchLog>): Promise<BiometricPunchLog | undefined>;
  deleteBiometricPunchLog(id: string): Promise<boolean>;
  getAllBiometricPunchLogs(): Promise<BiometricPunchLog[]>;
  findDuplicatePunchLog(companyId: string, deviceEmployeeId: string, punchTime: string, punchDate: string): Promise<BiometricPunchLog | undefined>;

  // Biometric Devices
  getBiometricDevice(id: string): Promise<BiometricDevice | undefined>;
  getBiometricDevicesByCompany(companyId: string): Promise<BiometricDevice[]>;
  createBiometricDevice(device: InsertBiometricDevice): Promise<BiometricDevice>;
  updateBiometricDevice(id: string, device: Partial<InsertBiometricDevice>): Promise<BiometricDevice | undefined>;
  deleteBiometricDevice(id: string): Promise<boolean>;
  getAllBiometricDevices(): Promise<BiometricDevice[]>;
}

// ─── KRA / KPI performance ──────────────────────────────────────────────────
export interface IKraStorage {
  // KRA Templates
  getKraTemplatesByCompany(companyId: string): Promise<KraTemplate[]>;
  getKraTemplate(id: string): Promise<KraTemplate | undefined>;
  createKraTemplate(data: InsertKraTemplate): Promise<KraTemplate>;
  updateKraTemplate(id: string, data: Partial<InsertKraTemplate>): Promise<KraTemplate | undefined>;
  deleteKraTemplate(id: string): Promise<boolean>;

  // KRA Template KPIs
  getKraTemplateKpis(templateId: string): Promise<KraTemplateKpi[]>;
  createKraTemplateKpi(data: InsertKraTemplateKpi): Promise<KraTemplateKpi>;
  updateKraTemplateKpi(id: string, data: Partial<InsertKraTemplateKpi>): Promise<KraTemplateKpi | undefined>;
  deleteKraTemplateKpi(id: string): Promise<boolean>;
  deleteKraTemplateKpisByTemplate(templateId: string): Promise<void>;

  // KRA Assignments
  getKraAssignmentsByCompany(companyId: string): Promise<KraAssignment[]>;
  getKraAssignmentsByEmployee(employeeId: string): Promise<KraAssignment[]>;
  getKraAssignment(id: string): Promise<KraAssignment | undefined>;
  createKraAssignment(data: InsertKraAssignment): Promise<KraAssignment>;
  updateKraAssignment(id: string, data: Partial<InsertKraAssignment>): Promise<KraAssignment | undefined>;
  deleteKraAssignment(id: string): Promise<boolean>;

  // KRA Assignment KPIs
  getKraAssignmentKpis(assignmentId: string): Promise<KraAssignmentKpi[]>;
  createKraAssignmentKpi(data: InsertKraAssignmentKpi): Promise<KraAssignmentKpi>;
  updateKraAssignmentKpi(id: string, data: Partial<InsertKraAssignmentKpi>): Promise<KraAssignmentKpi | undefined>;
  deleteKraAssignmentKpisByAssignment(assignmentId: string): Promise<void>;
}

// ─── Audit ──────────────────────────────────────────────────────────────────
export interface IAuditStorage {
  writeAuditLog(entry: { action: string; userId: string; userName: string; details: string }): Promise<void>;
}

// ─── Notification domain ─────────────────────────────────────────────────────
// Notification persistence used by the notification routes. Kept as a standalone
// domain interface (not part of the composite IStorage) because these queries
// were never on DatabaseStorage; NotificationRepository is the sole implementer.
export interface INotificationStorage {
  listForUser(userId: string): Promise<Notification[]>;
  listUnreadForUser(userId: string): Promise<Notification[]>;
  markRead(id: string, userId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  clearForUser(userId: string): Promise<void>;
}

// ─── Composite storage interface ────────────────────────────────────────────
// Assembled from every domain interface above. Shape is identical to the former
// monolithic IStorage, so all implementers and callers are unaffected.
export interface IStorage
  extends IUserStorage,
    ICompanyStorage,
    IEmployeeStorage,
    IDashboardStorage,
    IAttendanceStorage,
    ILeaveStorage,
    IPayrollStorage,
    ISettingsStorage,
    IComplianceStorage,
    IRecruitmentStorage,
    IBiometricStorage,
    IKraStorage,
    IAuditStorage {}
