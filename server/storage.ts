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
  type UserPermission
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;
  getAllCompanies(): Promise<Company[]>;

  // Employees
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByUserId(userId: string): Promise<Employee | undefined>;
  getEmployeesByCompany(companyId: string): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;
  getAllEmployees(): Promise<Employee[]>;

  // Dashboard
  getDashboardStats(): Promise<DashboardStats>;
  getDashboardStatsByCompany(companyId: string): Promise<DashboardStats>;

  // Attendance
  getAttendance(id: string): Promise<Attendance | undefined>;
  getAttendanceByEmployee(employeeId: string, date?: string): Promise<Attendance[]>;
  getAttendanceByDate(companyId: string, date: string): Promise<Attendance[]>;
  createAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: string, attendance: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  deleteAttendance(id: string): Promise<boolean>;
  getAllAttendance(): Promise<Attendance[]>;

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

  // Salary Structures
  getSalaryStructure(id: string): Promise<SalaryStructure | undefined>;
  getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined>;
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

  // Statutory Settings
  getStatutorySettings(id: string): Promise<StatutorySettings | undefined>;
  getStatutorySettingsByCompany(companyId: string): Promise<StatutorySettings | undefined>;
  createStatutorySettings(settings: InsertStatutorySettings): Promise<StatutorySettings>;
  updateStatutorySettings(id: string, settings: Partial<InsertStatutorySettings>): Promise<StatutorySettings | undefined>;
  deleteStatutorySettings(id: string): Promise<boolean>;

  // Time Office Policies
  getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined>;
  getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]>;
  createTimeOfficePolicy(policy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy>;
  updateTimeOfficePolicy(id: string, policy: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined>;
  deleteTimeOfficePolicy(id: string): Promise<boolean>;

  // F&F Settlements
  getFnfSettlement(id: string): Promise<FnfSettlement | undefined>;
  getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined>;
  getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]>;
  createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement>;
  updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined>;
  deleteFnfSettlement(id: string): Promise<boolean>;
  getAllFnfSettlements(): Promise<FnfSettlement[]>;

  // Holidays
  getHoliday(id: string): Promise<Holiday | undefined>;
  getHolidaysByCompany(companyId: string): Promise<Holiday[]>;
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  updateHoliday(id: string, holiday: Partial<InsertHoliday>): Promise<Holiday | undefined>;
  deleteHoliday(id: string): Promise<boolean>;
  getAllHolidays(): Promise<Holiday[]>;

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

  // Previous Experiences
  getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]>;
  getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]>;
  createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience>;
  deletePreviousExperience(id: string): Promise<void>;

  // User Permissions
  getUserPermissions(userId: string): Promise<UserPermission[]>;
  setUserPermissions(userId: string, permissions: { module: string; canAccess: boolean }[], grantedBy: string, companyId: string | null): Promise<UserPermission[]>;

  // Loan & Advances
  getLoanAdvance(id: string): Promise<LoanAdvance | undefined>;
  getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]>;
  getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]>;
  createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance>;
  updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined>;
  deleteLoanAdvance(id: string): Promise<boolean>;

  // Attendance helpers
  getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private companies: Map<string, Company>;
  private employees: Map<string, Employee>;
  private attendanceRecords: Map<string, Attendance>;
  private leaveTypesMap: Map<string, LeaveType>;
  private leaveRequestsMap: Map<string, LeaveRequest>;
  private salaryStructuresMap: Map<string, SalaryStructure>;
  private payrollRecords: Map<string, Payroll>;
  private settingsMap: Map<string, Setting>;
  private masterDepartmentsMap: Map<string, MasterDepartment>;
  private masterDesignationsMap: Map<string, MasterDesignation>;
  private wageGradesMap: Map<string, WageGrade>;
  private masterLocationsMap: Map<string, MasterLocation>;
  private earningHeadsMap: Map<string, EarningHead>;
  private deductionHeadsMap: Map<string, DeductionHead>;
  private statutorySettingsMap: Map<string, StatutorySettings>;
  private timeOfficePoliciesMap: Map<string, TimeOfficePolicy>;
  private fnfSettlementsMap: Map<string, FnfSettlement>;
  private holidaysMap: Map<string, Holiday>;
  private biometricPunchLogsMap: Map<string, BiometricPunchLog>;
  private biometricDevicesMap: Map<string, BiometricDevice>;
  private jobPostingsMap: Map<string, JobPosting>;
  private jobApplicationsMap: Map<string, JobApplication>;
  private candidateProfilesMap: Map<string, CandidateProfile>;
  private previousExperiencesMap: Map<string, PreviousExperience>;
  private loanAdvancesMap: Map<string, LoanAdvance>;

  constructor() {
    this.users = new Map();
    this.companies = new Map();
    this.employees = new Map();
    this.attendanceRecords = new Map();
    this.leaveTypesMap = new Map();
    this.leaveRequestsMap = new Map();
    this.salaryStructuresMap = new Map();
    this.payrollRecords = new Map();
    this.settingsMap = new Map();
    this.masterDepartmentsMap = new Map();
    this.masterDesignationsMap = new Map();
    this.wageGradesMap = new Map();
    this.masterLocationsMap = new Map();
    this.earningHeadsMap = new Map();
    this.deductionHeadsMap = new Map();
    this.statutorySettingsMap = new Map();
    this.timeOfficePoliciesMap = new Map();
    this.fnfSettlementsMap = new Map();
    this.holidaysMap = new Map();
    this.biometricPunchLogsMap = new Map();
    this.biometricDevicesMap = new Map();
    this.jobPostingsMap = new Map();
    this.jobApplicationsMap = new Map();
    this.candidateProfilesMap = new Map();
    this.previousExperiencesMap = new Map();
    this.loanAdvancesMap = new Map();

    // Initialize default leave types
    const defaultLeaveTypes = [
      { name: "Casual Leave", code: "CL", daysPerYear: 12, carryForward: false },
      { name: "Sick Leave", code: "SL", daysPerYear: 12, carryForward: true, maxCarryForward: 6 },
      { name: "Privilege Leave", code: "PL", daysPerYear: 15, carryForward: true, maxCarryForward: 30 },
      { name: "Maternity Leave", code: "ML", daysPerYear: 182, carryForward: false },
      { name: "Paternity Leave", code: "PTL", daysPerYear: 15, carryForward: false },
    ];
    
    defaultLeaveTypes.forEach(lt => {
      const id = randomUUID();
      this.leaveTypesMap.set(id, {
        id,
        companyId: null,
        name: lt.name,
        code: lt.code,
        daysPerYear: lt.daysPerYear,
        carryForward: lt.carryForward,
        maxCarryForward: lt.maxCarryForward || 0,
        description: null,
        status: "active"
      });
    });

    // Create default super admin user
    const adminId = randomUUID();
    this.users.set(adminId, {
      id: adminId,
      username: "admin",
      email: "admin@hrms.com",
      password: "admin123",
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      companyId: null,
      status: "active",
      lastLogin: null
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      firstName: insertUser.firstName || "",
      lastName: insertUser.lastName || "",
      role: insertUser.role || "employee",
      status: insertUser.status || "active",
      companyId: insertUser.companyId || null,
      lastLogin: null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Company methods
  async getCompany(id: string): Promise<Company | undefined> {
    return this.companies.get(id);
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const id = randomUUID();
    const company: Company = { 
      ...insertCompany, 
      id,
      status: insertCompany.status || "active",
      cin: insertCompany.cin || null,
      pan: insertCompany.pan || null,
      gstin: insertCompany.gstin || null,
      pfCode: insertCompany.pfCode || null,
      esiCode: insertCompany.esiCode || null,
      ptState: insertCompany.ptState || null,
      lwfState: insertCompany.lwfState || null,
      registeredAddress: insertCompany.registeredAddress || null,
      logo: insertCompany.logo || null,
      financialYear: insertCompany.financialYear || null,
    };
    this.companies.set(id, company);
    return company;
  }

  async updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const company = this.companies.get(id);
    if (!company) return undefined;
    
    const updatedCompany = { ...company, ...updates };
    this.companies.set(id, updatedCompany);
    return updatedCompany;
  }

  async deleteCompany(id: string): Promise<boolean> {
    // Also delete related employees
    const employees = Array.from(this.employees.values());
    for (const emp of employees) {
      if (emp.companyId === id) {
        this.employees.delete(emp.id);
      }
    }
    return this.companies.delete(id);
  }

  async getAllCompanies(): Promise<Company[]> {
    return Array.from(this.companies.values());
  }

  // Employee methods
  async getEmployee(id: string): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    return Array.from(this.employees.values()).find(emp => emp.userId === userId);
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return Array.from(this.employees.values()).filter(
      (emp) => emp.companyId === companyId
    );
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    const id = randomUUID();
    const employee: Employee = { 
      ...insertEmployee, 
      id,
      status: insertEmployee.status || "active",
      userId: insertEmployee.userId || null,
      gender: insertEmployee.gender || null,
      dateOfBirth: insertEmployee.dateOfBirth || null,
      mobileNumber: insertEmployee.mobileNumber || null,
      officialEmail: insertEmployee.officialEmail || null,
      department: insertEmployee.department || null,
      designation: insertEmployee.designation || null,
      reportingManager: insertEmployee.reportingManager || null,
      location: insertEmployee.location || null,
      employmentType: insertEmployee.employmentType || "permanent",
      grossSalary: insertEmployee.grossSalary || null,
      paymentMode: insertEmployee.paymentMode || null,
      pfApplicable: insertEmployee.pfApplicable || false,
      uan: insertEmployee.uan || null,
      esiApplicable: insertEmployee.esiApplicable || false,
      esiNumber: insertEmployee.esiNumber || null,
      ptState: insertEmployee.ptState || null,
      lwfApplicable: insertEmployee.lwfApplicable || false,
      bonusApplicable: insertEmployee.bonusApplicable ?? false,
      bonusPaidMonthly: insertEmployee.bonusPaidMonthly ?? false,
      bankAccount: insertEmployee.bankAccount || null,
      ifsc: insertEmployee.ifsc || null,
      pan: insertEmployee.pan || null,
      aadhaar: insertEmployee.aadhaar || null,
      timeOfficePolicyId: insertEmployee.timeOfficePolicyId || null,
    };
    this.employees.set(id, employee);
    return employee;
  }

  async updateEmployee(id: string, updates: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const employee = this.employees.get(id);
    if (!employee) return undefined;
    
    const normalizedUpdates = { ...updates };
    if ('timeOfficePolicyId' in normalizedUpdates) {
      (normalizedUpdates as any).timeOfficePolicyId = normalizedUpdates.timeOfficePolicyId || null;
    }
    const updatedEmployee = { ...employee, ...normalizedUpdates };
    this.employees.set(id, updatedEmployee);
    return updatedEmployee;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    return this.employees.delete(id);
  }

  async getAllEmployees(): Promise<Employee[]> {
    return Array.from(this.employees.values());
  }

  // Dashboard methods
  async getDashboardStats(): Promise<DashboardStats> {
    const companies = Array.from(this.companies.values());
    const employees = Array.from(this.employees.values());
    const users = Array.from(this.users.values());

    const activeEmployees = employees.filter(e => e.status === "active");

    // Department distribution
    const deptMap = new Map<string, number>();
    for (const emp of employees) {
      const dept = emp.department || "Unassigned";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
    const departmentDistribution = Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    // Recent employees (last 5)
    const recentEmployees = employees.slice(-5).reverse();

    return {
      totalCompanies: companies.length,
      totalEmployees: employees.length,
      totalUsers: users.length,
      activeEmployees: activeEmployees.length,
      departmentDistribution,
      recentEmployees,
    };
  }

  async getDashboardStatsByCompany(companyId: string): Promise<DashboardStats> {
    const employees = Array.from(this.employees.values()).filter(e => e.companyId === companyId);
    const users = Array.from(this.users.values()).filter(u => u.companyId === companyId);

    const activeEmployees = employees.filter(e => e.status === "active");

    // Department distribution for this company only
    const deptMap = new Map<string, number>();
    for (const emp of employees) {
      const dept = emp.department || "Unassigned";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
    const departmentDistribution = Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    // Recent employees (last 5) for this company
    const recentEmployees = employees.slice(-5).reverse();

    return {
      totalCompanies: 1, // Only this company
      totalEmployees: employees.length,
      totalUsers: users.length,
      activeEmployees: activeEmployees.length,
      departmentDistribution,
      recentEmployees,
    };
  }

  // Attendance methods
  async getAttendance(id: string): Promise<Attendance | undefined> {
    return this.attendanceRecords.get(id);
  }

  async getAttendanceByEmployee(employeeId: string, date?: string): Promise<Attendance[]> {
    return Array.from(this.attendanceRecords.values()).filter(
      (a) => a.employeeId === employeeId && (!date || a.date === date)
    );
  }

  async getAttendanceByDate(companyId: string, date: string): Promise<Attendance[]> {
    return Array.from(this.attendanceRecords.values()).filter(
      (a) => a.companyId === companyId && a.date === date
    );
  }

  async createAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    const id = randomUUID();
    const attendance: Attendance = {
      ...insertAttendance,
      id,
      status: insertAttendance.status || "present",
      clockIn: insertAttendance.clockIn || null,
      clockOut: insertAttendance.clockOut || null,
      workHours: insertAttendance.workHours || null,
      otHours: insertAttendance.otHours || null,
      notes: insertAttendance.notes || null,
    };
    this.attendanceRecords.set(id, attendance);
    return attendance;
  }

  async updateAttendance(id: string, updates: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const attendance = this.attendanceRecords.get(id);
    if (!attendance) return undefined;
    const updatedAttendance = { ...attendance, ...updates };
    this.attendanceRecords.set(id, updatedAttendance);
    return updatedAttendance;
  }

  async deleteAttendance(id: string): Promise<boolean> {
    return this.attendanceRecords.delete(id);
  }

  async getAllAttendance(): Promise<Attendance[]> {
    return Array.from(this.attendanceRecords.values());
  }

  // Leave Type methods
  async getLeaveType(id: string): Promise<LeaveType | undefined> {
    return this.leaveTypesMap.get(id);
  }

  async getLeaveTypesByCompany(companyId: string | null): Promise<LeaveType[]> {
    return Array.from(this.leaveTypesMap.values()).filter(
      (lt) => lt.companyId === null || lt.companyId === companyId
    );
  }

  async createLeaveType(insertLeaveType: InsertLeaveType): Promise<LeaveType> {
    const id = randomUUID();
    const leaveType: LeaveType = {
      ...insertLeaveType,
      id,
      status: insertLeaveType.status || "active",
      daysPerYear: insertLeaveType.daysPerYear || 12,
      companyId: insertLeaveType.companyId || null,
      carryForward: insertLeaveType.carryForward || false,
      maxCarryForward: insertLeaveType.maxCarryForward || 0,
      description: insertLeaveType.description || null,
    };
    this.leaveTypesMap.set(id, leaveType);
    return leaveType;
  }

  async updateLeaveType(id: string, updates: Partial<InsertLeaveType>): Promise<LeaveType | undefined> {
    const leaveType = this.leaveTypesMap.get(id);
    if (!leaveType) return undefined;
    const updatedLeaveType = { ...leaveType, ...updates };
    this.leaveTypesMap.set(id, updatedLeaveType);
    return updatedLeaveType;
  }

  async deleteLeaveType(id: string): Promise<boolean> {
    return this.leaveTypesMap.delete(id);
  }

  async getAllLeaveTypes(): Promise<LeaveType[]> {
    return Array.from(this.leaveTypesMap.values());
  }

  // Leave Request methods
  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    return this.leaveRequestsMap.get(id);
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return Array.from(this.leaveRequestsMap.values()).filter(
      (lr) => lr.employeeId === employeeId
    );
  }

  async getLeaveRequestsByCompany(companyId: string): Promise<LeaveRequest[]> {
    return Array.from(this.leaveRequestsMap.values()).filter(
      (lr) => lr.companyId === companyId
    );
  }

  async createLeaveRequest(insertLeaveRequest: InsertLeaveRequest): Promise<LeaveRequest> {
    const id = randomUUID();
    const leaveRequest: LeaveRequest = {
      ...insertLeaveRequest,
      id,
      status: insertLeaveRequest.status || "pending",
      reason: insertLeaveRequest.reason || null,
      approvedBy: null,
      approvedAt: null,
    };
    this.leaveRequestsMap.set(id, leaveRequest);
    return leaveRequest;
  }

  async updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<LeaveRequest | undefined> {
    const leaveRequest = this.leaveRequestsMap.get(id);
    if (!leaveRequest) return undefined;
    const updatedLeaveRequest = { ...leaveRequest, ...updates };
    this.leaveRequestsMap.set(id, updatedLeaveRequest);
    return updatedLeaveRequest;
  }

  async deleteLeaveRequest(id: string): Promise<boolean> {
    return this.leaveRequestsMap.delete(id);
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return Array.from(this.leaveRequestsMap.values());
  }

  // Salary Structure methods
  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    return this.salaryStructuresMap.get(id);
  }

  async getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined> {
    return Array.from(this.salaryStructuresMap.values()).find(
      (ss) => ss.employeeId === employeeId && ss.status === "active"
    );
  }

  async createSalaryStructure(insertSalaryStructure: InsertSalaryStructure): Promise<SalaryStructure> {
    const id = randomUUID();
    const salaryStructure: SalaryStructure = {
      ...insertSalaryStructure,
      id,
      status: insertSalaryStructure.status || "active",
      hra: insertSalaryStructure.hra || 0,
      conveyance: insertSalaryStructure.conveyance || 0,
      medicalAllowance: insertSalaryStructure.medicalAllowance || 0,
      specialAllowance: insertSalaryStructure.specialAllowance || 0,
      otherAllowances: insertSalaryStructure.otherAllowances || 0,
      pfEmployee: insertSalaryStructure.pfEmployee || 0,
      pfEmployer: insertSalaryStructure.pfEmployer || 0,
      esi: insertSalaryStructure.esi || 0,
      professionalTax: insertSalaryStructure.professionalTax || 0,
      lwfEmployee: insertSalaryStructure.lwfEmployee ?? 0,
      tds: insertSalaryStructure.tds || 0,
      otherDeductions: insertSalaryStructure.otherDeductions || 0,
    };
    this.salaryStructuresMap.set(id, salaryStructure);
    return salaryStructure;
  }

  async updateSalaryStructure(id: string, updates: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined> {
    const salaryStructure = this.salaryStructuresMap.get(id);
    if (!salaryStructure) return undefined;
    const updatedSalaryStructure = { ...salaryStructure, ...updates };
    this.salaryStructuresMap.set(id, updatedSalaryStructure);
    return updatedSalaryStructure;
  }

  async deleteSalaryStructure(id: string): Promise<boolean> {
    return this.salaryStructuresMap.delete(id);
  }

  async getAllSalaryStructures(): Promise<SalaryStructure[]> {
    return Array.from(this.salaryStructuresMap.values());
  }

  // Payroll methods
  async getPayroll(id: string): Promise<Payroll | undefined> {
    return this.payrollRecords.get(id);
  }

  async getPayrollByEmployee(employeeId: string): Promise<Payroll[]> {
    return Array.from(this.payrollRecords.values()).filter(
      (p) => p.employeeId === employeeId
    );
  }

  async getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]> {
    return Array.from(this.payrollRecords.values()).filter(
      (p) => p.companyId === companyId && p.month === month && p.year === year
    );
  }

  async getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined> {
    return Array.from(this.payrollRecords.values()).find(
      (p) => p.employeeId === employeeId && p.month === month && p.year === year
    );
  }

  async createPayroll(insertPayroll: InsertPayroll): Promise<Payroll> {
    const id = randomUUID();
    const payroll: Payroll = {
      ...insertPayroll,
      id,
      status: insertPayroll.status || "draft",
      leaveDays: insertPayroll.leaveDays || 0,
      paidOn: insertPayroll.paidOn || null,
      hra: insertPayroll.hra ?? 0,
      conveyance: insertPayroll.conveyance ?? 0,
      medicalAllowance: insertPayroll.medicalAllowance ?? 0,
      specialAllowance: insertPayroll.specialAllowance ?? 0,
      otherAllowances: insertPayroll.otherAllowances ?? 0,
      bonus: insertPayroll.bonus ?? 0,
      pfEmployee: insertPayroll.pfEmployee ?? 0,
      esi: insertPayroll.esi ?? 0,
      professionalTax: insertPayroll.professionalTax ?? 0,
      lwfEmployee: insertPayroll.lwfEmployee ?? 0,
      tds: insertPayroll.tds ?? 0,
      otherDeductions: insertPayroll.otherDeductions ?? 0,
    };
    this.payrollRecords.set(id, payroll);
    return payroll;
  }

  async updatePayroll(id: string, updates: Partial<InsertPayroll>): Promise<Payroll | undefined> {
    const payroll = this.payrollRecords.get(id);
    if (!payroll) return undefined;
    const updatedPayroll = { ...payroll, ...updates };
    this.payrollRecords.set(id, updatedPayroll);
    return updatedPayroll;
  }

  async deletePayroll(id: string): Promise<boolean> {
    return this.payrollRecords.delete(id);
  }

  async getAllPayroll(): Promise<Payroll[]> {
    return Array.from(this.payrollRecords.values());
  }

  // Settings methods
  async getSetting(id: string): Promise<Setting | undefined> {
    return this.settingsMap.get(id);
  }

  async getSettingByKey(companyId: string | null, key: string): Promise<Setting | undefined> {
    return Array.from(this.settingsMap.values()).find(
      (s) => s.companyId === companyId && s.key === key
    );
  }

  async getSettingsByCategory(companyId: string | null, category: string): Promise<Setting[]> {
    return Array.from(this.settingsMap.values()).filter(
      (s) => (s.companyId === null || s.companyId === companyId) && s.category === category
    );
  }

  async createSetting(insertSetting: InsertSetting): Promise<Setting> {
    const id = randomUUID();
    const setting: Setting = {
      ...insertSetting,
      id,
      companyId: insertSetting.companyId || null,
      value: insertSetting.value || null,
    };
    this.settingsMap.set(id, setting);
    return setting;
  }

  async updateSetting(id: string, updates: Partial<InsertSetting>): Promise<Setting | undefined> {
    const setting = this.settingsMap.get(id);
    if (!setting) return undefined;
    const updatedSetting = { ...setting, ...updates };
    this.settingsMap.set(id, updatedSetting);
    return updatedSetting;
  }

  async deleteSetting(id: string): Promise<boolean> {
    return this.settingsMap.delete(id);
  }

  async getAllSettings(): Promise<Setting[]> {
    return Array.from(this.settingsMap.values());
  }

  // Master Departments methods
  async getMasterDepartment(id: string): Promise<MasterDepartment | undefined> {
    return this.masterDepartmentsMap.get(id);
  }

  async getAllMasterDepartments(): Promise<MasterDepartment[]> {
    return Array.from(this.masterDepartmentsMap.values());
  }

  async getMasterDepartmentsByCompany(companyId: string): Promise<MasterDepartment[]> {
    return Array.from(this.masterDepartmentsMap.values()).filter(
      (d) => d.companyId === companyId
    );
  }

  async createMasterDepartment(insertDept: InsertMasterDepartment): Promise<MasterDepartment> {
    const id = randomUUID();
    const dept: MasterDepartment = {
      ...insertDept,
      id,
      code: insertDept.code || null,
      description: insertDept.description || null,
      status: insertDept.status || "active",
    };
    this.masterDepartmentsMap.set(id, dept);
    return dept;
  }

  async updateMasterDepartment(id: string, updates: Partial<InsertMasterDepartment>): Promise<MasterDepartment | undefined> {
    const dept = this.masterDepartmentsMap.get(id);
    if (!dept) return undefined;
    const updated = { ...dept, ...updates };
    this.masterDepartmentsMap.set(id, updated);
    return updated;
  }

  async deleteMasterDepartment(id: string): Promise<boolean> {
    return this.masterDepartmentsMap.delete(id);
  }

  // Master Designations methods
  async getMasterDesignation(id: string): Promise<MasterDesignation | undefined> {
    return this.masterDesignationsMap.get(id);
  }

  async getAllMasterDesignations(): Promise<MasterDesignation[]> {
    return Array.from(this.masterDesignationsMap.values());
  }

  async getMasterDesignationsByCompany(companyId: string): Promise<MasterDesignation[]> {
    return Array.from(this.masterDesignationsMap.values()).filter(
      (d) => d.companyId === companyId
    );
  }

  async createMasterDesignation(insertDesg: InsertMasterDesignation): Promise<MasterDesignation> {
    const id = randomUUID();
    const desg: MasterDesignation = {
      ...insertDesg,
      id,
      code: insertDesg.code || null,
      level: insertDesg.level || 1,
      description: insertDesg.description || null,
      status: insertDesg.status || "active",
    };
    this.masterDesignationsMap.set(id, desg);
    return desg;
  }

  async updateMasterDesignation(id: string, updates: Partial<InsertMasterDesignation>): Promise<MasterDesignation | undefined> {
    const desg = this.masterDesignationsMap.get(id);
    if (!desg) return undefined;
    const updated = { ...desg, ...updates };
    this.masterDesignationsMap.set(id, updated);
    return updated;
  }

  async deleteMasterDesignation(id: string): Promise<boolean> {
    return this.masterDesignationsMap.delete(id);
  }

  // Wage Grades methods
  async getWageGrade(id: string): Promise<WageGrade | undefined> {
    return this.wageGradesMap.get(id);
  }

  async getAllWageGrades(): Promise<WageGrade[]> {
    return Array.from(this.wageGradesMap.values());
  }

  async getWageGradesByCompany(companyId: string): Promise<WageGrade[]> {
    return Array.from(this.wageGradesMap.values()).filter(
      (g) => g.companyId === companyId
    );
  }

  async createWageGrade(insertGrade: InsertWageGrade): Promise<WageGrade> {
    const id = randomUUID();
    const grade: WageGrade = {
      ...insertGrade,
      id,
      code: insertGrade.code ?? null,
      description: insertGrade.description ?? null,
      period: insertGrade.period ?? null,
      effectiveFrom: insertGrade.effectiveFrom ?? null,
      state: insertGrade.state ?? null,
      status: insertGrade.status ?? "active",
    };
    this.wageGradesMap.set(id, grade);
    return grade;
  }

  async updateWageGrade(id: string, updates: Partial<InsertWageGrade>): Promise<WageGrade | undefined> {
    const grade = this.wageGradesMap.get(id);
    if (!grade) return undefined;
    const updated = { ...grade, ...updates };
    this.wageGradesMap.set(id, updated);
    return updated;
  }

  async deleteWageGrade(id: string): Promise<boolean> {
    return this.wageGradesMap.delete(id);
  }

  // Master Locations methods
  async getMasterLocation(id: string): Promise<MasterLocation | undefined> {
    return this.masterLocationsMap.get(id);
  }

  async getAllMasterLocations(): Promise<MasterLocation[]> {
    return Array.from(this.masterLocationsMap.values());
  }

  async getMasterLocationsByCompany(companyId: string): Promise<MasterLocation[]> {
    return Array.from(this.masterLocationsMap.values()).filter(
      (l) => l.companyId === companyId
    );
  }

  async createMasterLocation(insertLoc: InsertMasterLocation): Promise<MasterLocation> {
    const id = randomUUID();
    const loc: MasterLocation = {
      ...insertLoc,
      id,
      code: insertLoc.code || null,
      address: insertLoc.address || null,
      city: insertLoc.city || null,
      state: insertLoc.state || null,
      country: insertLoc.country || "India",
      status: insertLoc.status || "active",
    };
    this.masterLocationsMap.set(id, loc);
    return loc;
  }

  async updateMasterLocation(id: string, updates: Partial<InsertMasterLocation>): Promise<MasterLocation | undefined> {
    const loc = this.masterLocationsMap.get(id);
    if (!loc) return undefined;
    const updated = { ...loc, ...updates };
    this.masterLocationsMap.set(id, updated);
    return updated;
  }

  async deleteMasterLocation(id: string): Promise<boolean> {
    return this.masterLocationsMap.delete(id);
  }

  // Earning Heads methods
  async getEarningHead(id: string): Promise<EarningHead | undefined> {
    return this.earningHeadsMap.get(id);
  }

  async getEarningHeadsByCompany(companyId: string): Promise<EarningHead[]> {
    return Array.from(this.earningHeadsMap.values()).filter(
      (h) => h.companyId === companyId
    );
  }

  async createEarningHead(insertHead: InsertEarningHead): Promise<EarningHead> {
    const id = randomUUID();
    const head: EarningHead = {
      ...insertHead,
      id,
      type: insertHead.type || "fixed",
      calculationBase: insertHead.calculationBase || null,
      percentage: insertHead.percentage || 0,
      isTaxable: insertHead.isTaxable ?? true,
      isPartOfCTC: insertHead.isPartOfCTC ?? true,
      status: insertHead.status || "active",
    };
    this.earningHeadsMap.set(id, head);
    return head;
  }

  async updateEarningHead(id: string, updates: Partial<InsertEarningHead>): Promise<EarningHead | undefined> {
    const head = this.earningHeadsMap.get(id);
    if (!head) return undefined;
    const updated = { ...head, ...updates };
    this.earningHeadsMap.set(id, updated);
    return updated;
  }

  async deleteEarningHead(id: string): Promise<boolean> {
    return this.earningHeadsMap.delete(id);
  }

  // Deduction Heads methods
  async getDeductionHead(id: string): Promise<DeductionHead | undefined> {
    return this.deductionHeadsMap.get(id);
  }

  async getDeductionHeadsByCompany(companyId: string): Promise<DeductionHead[]> {
    return Array.from(this.deductionHeadsMap.values()).filter(
      (h) => h.companyId === companyId
    );
  }

  async createDeductionHead(insertHead: InsertDeductionHead): Promise<DeductionHead> {
    const id = randomUUID();
    const head: DeductionHead = {
      ...insertHead,
      id,
      type: insertHead.type || "fixed",
      calculationBase: insertHead.calculationBase || null,
      percentage: insertHead.percentage || 0,
      isStatutory: insertHead.isStatutory ?? false,
      status: insertHead.status || "active",
    };
    this.deductionHeadsMap.set(id, head);
    return head;
  }

  async updateDeductionHead(id: string, updates: Partial<InsertDeductionHead>): Promise<DeductionHead | undefined> {
    const head = this.deductionHeadsMap.get(id);
    if (!head) return undefined;
    const updated = { ...head, ...updates };
    this.deductionHeadsMap.set(id, updated);
    return updated;
  }

  async deleteDeductionHead(id: string): Promise<boolean> {
    return this.deductionHeadsMap.delete(id);
  }

  // Statutory Settings methods
  async getStatutorySettings(id: string): Promise<StatutorySettings | undefined> {
    return this.statutorySettingsMap.get(id);
  }

  async getStatutorySettingsByCompany(companyId: string): Promise<StatutorySettings | undefined> {
    return Array.from(this.statutorySettingsMap.values()).find(
      (s) => s.companyId === companyId
    );
  }

  async createStatutorySettings(insertSettings: InsertStatutorySettings): Promise<StatutorySettings> {
    const id = randomUUID();
    const settings: StatutorySettings = {
      ...insertSettings,
      id,
      pfEmployeePercent: insertSettings.pfEmployeePercent ?? 12,
      pfEmployerPercent: insertSettings.pfEmployerPercent ?? 12,
      pfWageCeiling: insertSettings.pfWageCeiling ?? 15000,
      pfEnabled: insertSettings.pfEnabled ?? true,
      esicEmployeePercent: insertSettings.esicEmployeePercent ?? 75,
      esicEmployerPercent: insertSettings.esicEmployerPercent ?? 325,
      esicWageCeiling: insertSettings.esicWageCeiling ?? 21000,
      esicEnabled: insertSettings.esicEnabled ?? true,
      lwfEmployeePercent: insertSettings.lwfEmployeePercent ?? 20,
      lwfEmployerPercent: insertSettings.lwfEmployerPercent ?? 40,
      lwfEmployeeMaxCap: insertSettings.lwfEmployeeMaxCap ?? 34,
      lwfEmployerMaxCap: insertSettings.lwfEmployerMaxCap ?? 68,
      lwfCalculationBase: insertSettings.lwfCalculationBase || "gross",
      lwfEnabled: insertSettings.lwfEnabled ?? false,
      ptMaxAmount: insertSettings.ptMaxAmount ?? 200,
      ptEnabled: insertSettings.ptEnabled ?? true,
      ptState: insertSettings.ptState || null,
      bonusPercent: insertSettings.bonusPercent ?? 833,
      bonusCalculationBase: insertSettings.bonusCalculationBase || "basic",
      bonusMaxCeiling: insertSettings.bonusMaxCeiling ?? 7000,
      bonusMinPercent: insertSettings.bonusMinPercent ?? 833,
      bonusMaxPercent: insertSettings.bonusMaxPercent ?? 2000,
      bonusEnabled: insertSettings.bonusEnabled ?? true,
    };
    this.statutorySettingsMap.set(id, settings);
    return settings;
  }

  async updateStatutorySettings(id: string, updates: Partial<InsertStatutorySettings>): Promise<StatutorySettings | undefined> {
    const settings = this.statutorySettingsMap.get(id);
    if (!settings) return undefined;
    const updated = { ...settings, ...updates };
    this.statutorySettingsMap.set(id, updated);
    return updated;
  }

  async deleteStatutorySettings(id: string): Promise<boolean> {
    return this.statutorySettingsMap.delete(id);
  }

  async getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined> {
    return this.timeOfficePoliciesMap.get(id);
  }

  async getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]> {
    return Array.from(this.timeOfficePoliciesMap.values()).filter(
      (p) => p.companyId === companyId
    );
  }

  async createTimeOfficePolicy(insertPolicy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy> {
    const id = randomUUID();
    const policy: TimeOfficePolicy = {
      ...insertPolicy,
      id,
      policyName: insertPolicy.policyName,
      weeklyOff1: insertPolicy.weeklyOff1 || "sunday",
      weeklyOff2: insertPolicy.weeklyOff2 ?? "saturday",
      dutyStartTime: insertPolicy.dutyStartTime || "09:00",
      dutyEndTime: insertPolicy.dutyEndTime || "18:00",
      allowAutoAttend: insertPolicy.allowAutoAttend ?? false,
      presentMarkingDuration: insertPolicy.presentMarkingDuration ?? 480,
      permissibleLateArrival: insertPolicy.permissibleLateArrival ?? 15,
      permissibleEarlyGoing: insertPolicy.permissibleEarlyGoing ?? 15,
      halfDayMinHours: insertPolicy.halfDayMinHours ?? 4,
      fullDayMinHours: insertPolicy.fullDayMinHours ?? 8,
      otAllowed: insertPolicy.otAllowed ?? false,
      isDefault: insertPolicy.isDefault ?? false,
      status: insertPolicy.status || "active",
    };
    this.timeOfficePoliciesMap.set(id, policy);
    return policy;
  }

  async updateTimeOfficePolicy(id: string, updates: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined> {
    const policy = this.timeOfficePoliciesMap.get(id);
    if (!policy) return undefined;
    const updated = { ...policy, ...updates };
    this.timeOfficePoliciesMap.set(id, updated);
    return updated;
  }

  async deleteTimeOfficePolicy(id: string): Promise<boolean> {
    return this.timeOfficePoliciesMap.delete(id);
  }

  async getFnfSettlement(id: string): Promise<FnfSettlement | undefined> {
    return this.fnfSettlementsMap.get(id);
  }

  async getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined> {
    return Array.from(this.fnfSettlementsMap.values()).find(
      (s) => s.employeeId === employeeId
    );
  }

  async getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]> {
    return Array.from(this.fnfSettlementsMap.values()).filter(
      (s) => s.companyId === companyId
    );
  }

  async createFnfSettlement(insertSettlement: InsertFnfSettlement): Promise<FnfSettlement> {
    const id = randomUUID();
    const settlement: FnfSettlement = {
      ...insertSettlement,
      id,
      salaryDue: insertSettlement.salaryDue ?? 0,
      leaveEncashment: insertSettlement.leaveEncashment ?? 0,
      bonus: insertSettlement.bonus ?? 0,
      gratuity: insertSettlement.gratuity ?? 0,
      noticePay: insertSettlement.noticePay ?? 0,
      otherEarnings: insertSettlement.otherEarnings ?? 0,
      otherEarningsRemarks: insertSettlement.otherEarningsRemarks ?? null,
      totalEarnings: insertSettlement.totalEarnings ?? 0,
      pfDeduction: insertSettlement.pfDeduction ?? 0,
      esiDeduction: insertSettlement.esiDeduction ?? 0,
      professionalTax: insertSettlement.professionalTax ?? 0,
      tds: insertSettlement.tds ?? 0,
      loanRecovery: insertSettlement.loanRecovery ?? 0,
      noticePeriodRecovery: insertSettlement.noticePeriodRecovery ?? 0,
      otherDeductions: insertSettlement.otherDeductions ?? 0,
      otherDeductionsRemarks: insertSettlement.otherDeductionsRemarks ?? null,
      totalDeductions: insertSettlement.totalDeductions ?? 0,
      netPayable: insertSettlement.netPayable ?? 0,
      remarks: insertSettlement.remarks ?? null,
      status: insertSettlement.status || "draft",
      approvedBy: null,
      approvedAt: null,
    };
    this.fnfSettlementsMap.set(id, settlement);
    return settlement;
  }

  async updateFnfSettlement(id: string, updates: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined> {
    const settlement = this.fnfSettlementsMap.get(id);
    if (!settlement) return undefined;
    const updated = { ...settlement, ...updates };
    this.fnfSettlementsMap.set(id, updated);
    return updated;
  }

  async deleteFnfSettlement(id: string): Promise<boolean> {
    return this.fnfSettlementsMap.delete(id);
  }

  async getAllFnfSettlements(): Promise<FnfSettlement[]> {
    return Array.from(this.fnfSettlementsMap.values());
  }

  async getHoliday(id: string): Promise<Holiday | undefined> {
    return this.holidaysMap.get(id);
  }

  async getHolidaysByCompany(companyId: string): Promise<Holiday[]> {
    return Array.from(this.holidaysMap.values()).filter(
      (h) => h.companyId === companyId
    );
  }

  async createHoliday(insertHoliday: InsertHoliday): Promise<Holiday> {
    const id = randomUUID();
    const holiday: Holiday = {
      ...insertHoliday,
      id,
      description: insertHoliday.description || null,
      type: insertHoliday.type || "public",
      status: insertHoliday.status || "active",
    };
    this.holidaysMap.set(id, holiday);
    return holiday;
  }

  async updateHoliday(id: string, updates: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    const holiday = this.holidaysMap.get(id);
    if (!holiday) return undefined;
    const updated = { ...holiday, ...updates };
    this.holidaysMap.set(id, updated);
    return updated;
  }

  async deleteHoliday(id: string): Promise<boolean> {
    return this.holidaysMap.delete(id);
  }

  async getAllHolidays(): Promise<Holiday[]> {
    return Array.from(this.holidaysMap.values());
  }

  async getBiometricPunchLog(id: string): Promise<BiometricPunchLog | undefined> {
    return this.biometricPunchLogsMap.get(id);
  }

  async getBiometricPunchLogsByCompany(companyId: string): Promise<BiometricPunchLog[]> {
    return Array.from(this.biometricPunchLogsMap.values()).filter(l => l.companyId === companyId);
  }

  async getBiometricPunchLogsByDate(companyId: string, date: string): Promise<BiometricPunchLog[]> {
    return Array.from(this.biometricPunchLogsMap.values()).filter(l => l.companyId === companyId && l.punchDate === date);
  }

  async createBiometricPunchLog(log: InsertBiometricPunchLog): Promise<BiometricPunchLog> {
    const id = randomUUID();
    const record: BiometricPunchLog = {
      ...log,
      id,
      employeeId: log.employeeId || null,
      punchType: log.punchType || "unknown",
      deviceId: log.deviceId || null,
      isProcessed: log.isProcessed ?? false,
      isDuplicate: log.isDuplicate ?? false,
      missingPunch: log.missingPunch ?? false,
      syncedAt: log.syncedAt || null,
      createdAt: log.createdAt || new Date().toISOString(),
    };
    this.biometricPunchLogsMap.set(id, record);
    return record;
  }

  async updateBiometricPunchLog(id: string, updates: Partial<InsertBiometricPunchLog>): Promise<BiometricPunchLog | undefined> {
    const log = this.biometricPunchLogsMap.get(id);
    if (!log) return undefined;
    const updated = { ...log, ...updates };
    this.biometricPunchLogsMap.set(id, updated);
    return updated;
  }

  async deleteBiometricPunchLog(id: string): Promise<boolean> {
    return this.biometricPunchLogsMap.delete(id);
  }

  async getAllBiometricPunchLogs(): Promise<BiometricPunchLog[]> {
    return Array.from(this.biometricPunchLogsMap.values());
  }

  async findDuplicatePunchLog(companyId: string, deviceEmployeeId: string, punchTime: string, punchDate: string): Promise<BiometricPunchLog | undefined> {
    return Array.from(this.biometricPunchLogsMap.values()).find(
      l => l.companyId === companyId && l.deviceEmployeeId === deviceEmployeeId && l.punchTime === punchTime && l.punchDate === punchDate
    );
  }
  // Biometric Devices
  async getBiometricDevice(id: string): Promise<BiometricDevice | undefined> {
    return this.biometricDevicesMap.get(id);
  }

  async getBiometricDevicesByCompany(companyId: string): Promise<BiometricDevice[]> {
    return Array.from(this.biometricDevicesMap.values()).filter(
      (d) => d.companyId === companyId
    );
  }

  async createBiometricDevice(insertDevice: InsertBiometricDevice): Promise<BiometricDevice> {
    const id = randomUUID();
    const device: BiometricDevice = {
      ...insertDevice,
      id,
      status: insertDevice.status || "offline",
      lastSync: null,
      createdAt: new Date().toISOString(),
      ipAddress: insertDevice.ipAddress || null,
      port: insertDevice.port ?? 8181,
      lastPushAt: insertDevice.lastPushAt ?? null,
      lastPushIp: insertDevice.lastPushIp ?? null,
      firmwareVersion: insertDevice.firmwareVersion ?? null,
      pushTotal: insertDevice.pushTotal ?? 0,
      pushToken: insertDevice.pushToken ?? null,
      allowedIpCidr: insertDevice.allowedIpCidr ?? null,
    };
    this.biometricDevicesMap.set(id, device);
    return device;
  }

  async updateBiometricDevice(id: string, updates: Partial<InsertBiometricDevice>): Promise<BiometricDevice | undefined> {
    const device = this.biometricDevicesMap.get(id);
    if (!device) return undefined;
    const updatedDevice = { ...device, ...updates };
    this.biometricDevicesMap.set(id, updatedDevice);
    return updatedDevice;
  }

  async deleteBiometricDevice(id: string): Promise<boolean> {
    return this.biometricDevicesMap.delete(id);
  }

  async getAllBiometricDevices(): Promise<BiometricDevice[]> {
    return Array.from(this.biometricDevicesMap.values());
  }

  // Job Postings
  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    return this.jobPostingsMap.get(id);
  }

  async getJobPostingsByCompany(companyId: string): Promise<JobPosting[]> {
    return Array.from(this.jobPostingsMap.values()).filter(p => p.companyId === companyId);
  }

  async createJobPosting(posting: InsertJobPosting): Promise<JobPosting> {
    const id = randomUUID();
    const record: JobPosting = {
      ...posting,
      id,
      department: posting.department || null,
      location: posting.location || null,
      employmentType: posting.employmentType || "full_time",
      requirements: posting.requirements || null,
      salaryRange: posting.salaryRange || null,
      vacancies: posting.vacancies ?? 1,
      status: posting.status || "draft",
      postedBy: posting.postedBy || null,
      postedAt: posting.postedAt || null,
      closingDate: posting.closingDate || null,
      createdAt: posting.createdAt || new Date().toISOString(),
      updatedAt: posting.updatedAt || null,
    };
    this.jobPostingsMap.set(id, record);
    return record;
  }

  async updateJobPosting(id: string, updates: Partial<InsertJobPosting>): Promise<JobPosting | undefined> {
    const posting = this.jobPostingsMap.get(id);
    if (!posting) return undefined;
    const updated = { ...posting, ...updates, updatedAt: new Date().toISOString() };
    this.jobPostingsMap.set(id, updated);
    return updated;
  }

  async deleteJobPosting(id: string): Promise<boolean> {
    return this.jobPostingsMap.delete(id);
  }

  async getAllJobPostings(): Promise<JobPosting[]> {
    return Array.from(this.jobPostingsMap.values());
  }

  // Job Applications
  async getJobApplication(id: string): Promise<JobApplication | undefined> {
    return this.jobApplicationsMap.get(id);
  }

  async getJobApplicationsByPosting(jobPostingId: string): Promise<JobApplication[]> {
    return Array.from(this.jobApplicationsMap.values()).filter(a => a.jobPostingId === jobPostingId);
  }

  async getJobApplicationsByEmployee(employeeId: string): Promise<JobApplication[]> {
    return Array.from(this.jobApplicationsMap.values()).filter(a => a.employeeId === employeeId);
  }

  async getJobApplicationsByUserId(userId: string): Promise<JobApplication[]> {
    return Array.from(this.jobApplicationsMap.values()).filter(a => a.applicantUserId === userId);
  }

  async getJobApplicationsByCompany(companyId: string): Promise<JobApplication[]> {
    return Array.from(this.jobApplicationsMap.values()).filter(a => a.companyId === companyId);
  }

  async createJobApplication(application: InsertJobApplication): Promise<JobApplication> {
    const id = randomUUID();
    const record: JobApplication = {
      ...application,
      id,
      applicantUserId: application.applicantUserId || null,
      employeeId: application.employeeId || null,
      applicantName: application.applicantName || null,
      applicantEmail: application.applicantEmail || null,
      applicantPhone: application.applicantPhone || null,
      coverLetter: application.coverLetter || null,
      resumeUrl: application.resumeUrl || null,
      status: application.status || "applied",
      remarks: application.remarks || null,
      createdAt: application.createdAt || new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      interviewDate: application.interviewDate || null,
      interviewTime: application.interviewTime || null,
      interviewLocation: application.interviewLocation || null,
      interviewerName: application.interviewerName || null,
      interviewNotes: application.interviewNotes || null,
      offerSalary: application.offerSalary || null,
      offerDesignation: application.offerDesignation || null,
      offerTerms: application.offerTerms || null,
      offerExpiryDate: application.offerExpiryDate || null,
      employeeResponse: application.employeeResponse || null,
      negotiationNote: application.negotiationNote || null,
    };
    this.jobApplicationsMap.set(id, record);
    return record;
  }

  async updateJobApplication(id: string, updates: Partial<JobApplication>): Promise<JobApplication | undefined> {
    const application = this.jobApplicationsMap.get(id);
    if (!application) return undefined;
    const updated = { ...application, ...updates };
    this.jobApplicationsMap.set(id, updated);
    return updated;
  }

  async deleteJobApplication(id: string): Promise<boolean> {
    return this.jobApplicationsMap.delete(id);
  }

  async getAllJobApplications(): Promise<JobApplication[]> {
    return Array.from(this.jobApplicationsMap.values());
  }

  async getCandidateProfile(id: string): Promise<CandidateProfile | undefined> {
    return this.candidateProfilesMap.get(id);
  }

  async getCandidateProfileByUserId(userId: string): Promise<CandidateProfile | undefined> {
    return Array.from(this.candidateProfilesMap.values()).find(p => p.userId === userId);
  }

  async getCandidateProfileByAadhaar(aadhaar: string): Promise<CandidateProfile | undefined> {
    return Array.from(this.candidateProfilesMap.values()).find(p => p.aadhaar === aadhaar);
  }

  async createCandidateProfile(profile: InsertCandidateProfile): Promise<CandidateProfile> {
    const id = randomUUID();
    const newProfile = { ...profile, id } as CandidateProfile;
    this.candidateProfilesMap.set(id, newProfile);
    return newProfile;
  }

  async updateCandidateProfile(id: string, profile: Partial<InsertCandidateProfile>): Promise<CandidateProfile | undefined> {
    const existing = this.candidateProfilesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...profile } as CandidateProfile;
    this.candidateProfilesMap.set(id, updated);
    return updated;
  }

  async getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined> {
    return Array.from(this.attendanceRecords.values()).find(
      (a) => a.employeeId === employeeId && a.date === date
    );
  }

  async getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]> {
    return Array.from(this.previousExperiencesMap.values()).filter(
      (e) => e.employeeId === employeeId
    );
  }

  async getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]> {
    return Array.from(this.previousExperiencesMap.values()).filter(
      (e) => e.candidateProfileId === candidateProfileId
    );
  }

  async createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience> {
    const id = randomUUID();
    const newExp = { ...exp, id } as PreviousExperience;
    this.previousExperiencesMap.set(id, newExp);
    return newExp;
  }

  async deletePreviousExperience(id: string): Promise<void> {
    this.previousExperiencesMap.delete(id);
  }

  private userPermissionsMap: Map<string, UserPermission> = new Map();

  async getLoanAdvance(id: string): Promise<LoanAdvance | undefined> {
    return this.loanAdvancesMap.get(id);
  }
  async getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]> {
    return Array.from(this.loanAdvancesMap.values()).filter(l => l.employeeId === employeeId);
  }
  async getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]> {
    return Array.from(this.loanAdvancesMap.values()).filter(l => l.companyId === companyId);
  }
  async createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance> {
    const id = randomUUID();
    const record: LoanAdvance = { id, ...data } as LoanAdvance;
    this.loanAdvancesMap.set(id, record);
    return record;
  }
  async updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined> {
    const existing = this.loanAdvancesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.loanAdvancesMap.set(id, updated);
    return updated;
  }
  async deleteLoanAdvance(id: string): Promise<boolean> {
    return this.loanAdvancesMap.delete(id);
  }

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return Array.from(this.userPermissionsMap.values()).filter(p => p.userId === userId);
  }

  async setUserPermissions(userId: string, permissions: { module: string; canAccess: boolean }[], grantedBy: string, companyId: string | null): Promise<UserPermission[]> {
    const now = new Date().toISOString();
    const result: UserPermission[] = [];
    for (const perm of permissions) {
      const existing = Array.from(this.userPermissionsMap.values()).find(p => p.userId === userId && p.module === perm.module);
      if (existing) {
        const updated = { ...existing, canAccess: perm.canAccess, grantedBy, updatedAt: now };
        this.userPermissionsMap.set(existing.id, updated);
        result.push(updated);
      } else {
        const id = randomUUID();
        const newPerm: UserPermission = { id, userId, companyId, module: perm.module, canAccess: perm.canAccess, grantedBy, updatedAt: now };
        this.userPermissionsMap.set(id, newPerm);
        result.push(newPerm);
      }
    }
    return result;
  }
}

import { DatabaseStorage } from "./database-storage";

export const storage: IStorage = new DatabaseStorage();
