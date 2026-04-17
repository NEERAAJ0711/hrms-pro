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
  masterDesignations,
  masterLocations,
  earningHeads,
  deductionHeads,
  statutorySettings,
  timeOfficePolicies,
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
} from "@shared/schema";
import { eq, and, isNull, desc, sql, count, or } from "drizzle-orm";
import { db } from "./db";
import { IStorage } from "./storage";
import { randomUUID } from "crypto";

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const result = await db.insert(users).values({ ...user, id }).returning();
    return result[0];
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const id = randomUUID();
    const result = await db.insert(companies).values({ ...company, id }).returning();
    return result[0];
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies).set(company).where(eq(companies.id, id)).returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id)).returning();
    return result.length > 0;
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const result = await db.select().from(employees).where(eq(employees.id, id));
    return result[0];
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    const result = await db.select().from(employees).where(eq(employees.userId, userId));
    return result[0];
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return await db.select().from(employees).where(eq(employees.companyId, companyId));
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const id = randomUUID();
    const result = await db.insert(employees).values({ ...employee, id }).returning();
    return result[0];
  }

  async updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const result = await db.update(employees).set(employee).where(eq(employees.id, id)).returning();
    return result[0];
  }

  async deleteEmployee(id: string): Promise<boolean> {
    const result = await db.delete(employees).where(eq(employees.id, id)).returning();
    return result.length > 0;
  }

  async getAllEmployees(): Promise<Employee[]> {
    return await db.select().from(employees);
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const [companiesCount] = await db.select({ value: count() }).from(companies);
    const [employeesCount] = await db.select({ value: count() }).from(employees);
    const [usersCount] = await db.select({ value: count() }).from(users);
    const [activeCount] = await db.select({ value: count() }).from(employees).where(eq(employees.status, "active"));

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
      departmentDistribution,
      recentEmployees,
    };
  }

  async getDashboardStatsByCompany(companyId: string): Promise<DashboardStats> {
    const [companiesCount] = await db.select({ value: count() }).from(companies).where(eq(companies.id, companyId));
    const [employeesCount] = await db.select({ value: count() }).from(employees).where(eq(employees.companyId, companyId));
    const [usersCount] = await db.select({ value: count() }).from(users).where(eq(users.companyId, companyId));
    const [activeCount] = await db.select({ value: count() }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

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
      departmentDistribution,
      recentEmployees,
    };
  }

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

  async getLeaveType(id: string): Promise<LeaveType | undefined> {
    const result = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id));
    return result[0];
  }

  async getLeaveTypesByCompany(companyId: string | null): Promise<LeaveType[]> {
    if (companyId === null) {
      return await db.select().from(leaveTypes).where(isNull(leaveTypes.companyId));
    }
    return await db.select().from(leaveTypes).where(
      or(eq(leaveTypes.companyId, companyId), isNull(leaveTypes.companyId))
    );
  }

  async createLeaveType(leaveType: InsertLeaveType): Promise<LeaveType> {
    const id = randomUUID();
    const result = await db.insert(leaveTypes).values({ ...leaveType, id }).returning();
    return result[0];
  }

  async updateLeaveType(id: string, leaveType: Partial<InsertLeaveType>): Promise<LeaveType | undefined> {
    const result = await db.update(leaveTypes).set(leaveType).where(eq(leaveTypes.id, id)).returning();
    return result[0];
  }

  async deleteLeaveType(id: string): Promise<boolean> {
    const result = await db.delete(leaveTypes).where(eq(leaveTypes.id, id)).returning();
    return result.length > 0;
  }

  async getAllLeaveTypes(): Promise<LeaveType[]> {
    return await db.select().from(leaveTypes);
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    const result = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    return result[0];
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId));
  }

  async getLeaveRequestsByCompany(companyId: string): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).where(eq(leaveRequests.companyId, companyId));
  }

  async createLeaveRequest(leaveRequest: InsertLeaveRequest): Promise<LeaveRequest> {
    const id = randomUUID();
    const result = await db.insert(leaveRequests).values({ ...leaveRequest, id }).returning();
    return result[0];
  }

  async updateLeaveRequest(id: string, leaveRequest: Partial<LeaveRequest>): Promise<LeaveRequest | undefined> {
    const result = await db.update(leaveRequests).set(leaveRequest).where(eq(leaveRequests.id, id)).returning();
    return result[0];
  }

  async deleteLeaveRequest(id: string): Promise<boolean> {
    const result = await db.delete(leaveRequests).where(eq(leaveRequests.id, id)).returning();
    return result.length > 0;
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests);
  }

  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    const result = await db.select().from(salaryStructures).where(eq(salaryStructures.id, id));
    return result[0];
  }

  async getSalaryStructureByEmployee(employeeId: string): Promise<SalaryStructure | undefined> {
    const result = await db.select().from(salaryStructures).where(
      and(eq(salaryStructures.employeeId, employeeId), eq(salaryStructures.status, "active"))
    );
    return result[0];
  }

  async createSalaryStructure(salaryStructure: InsertSalaryStructure): Promise<SalaryStructure> {
    const id = randomUUID();
    const result = await db.insert(salaryStructures).values({ ...salaryStructure, id }).returning();
    return result[0];
  }

  async updateSalaryStructure(id: string, salaryStructure: Partial<InsertSalaryStructure>): Promise<SalaryStructure | undefined> {
    const result = await db.update(salaryStructures).set(salaryStructure).where(eq(salaryStructures.id, id)).returning();
    return result[0];
  }

  async deleteSalaryStructure(id: string): Promise<boolean> {
    const result = await db.delete(salaryStructures).where(eq(salaryStructures.id, id)).returning();
    return result.length > 0;
  }

  async getAllSalaryStructures(): Promise<SalaryStructure[]> {
    return await db.select().from(salaryStructures);
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    const result = await db.select().from(payroll).where(eq(payroll.id, id));
    return result[0];
  }

  async getPayrollByEmployee(employeeId: string): Promise<Payroll[]> {
    return await db.select().from(payroll).where(eq(payroll.employeeId, employeeId));
  }

  async getPayrollByMonth(companyId: string, month: string, year: number): Promise<Payroll[]> {
    return await db.select().from(payroll).where(
      and(eq(payroll.companyId, companyId), eq(payroll.month, month), eq(payroll.year, year))
    );
  }

  async getPayrollByEmployeeMonth(employeeId: string, month: string, year: number): Promise<Payroll | undefined> {
    const result = await db.select().from(payroll).where(
      and(eq(payroll.employeeId, employeeId), eq(payroll.month, month), eq(payroll.year, year))
    );
    return result[0];
  }

  async createPayroll(record: InsertPayroll): Promise<Payroll> {
    const id = randomUUID();
    const result = await db.insert(payroll).values({ ...record, id }).returning();
    return result[0];
  }

  async updatePayroll(id: string, record: Partial<InsertPayroll>): Promise<Payroll | undefined> {
    const result = await db.update(payroll).set(record).where(eq(payroll.id, id)).returning();
    return result[0];
  }

  async deletePayroll(id: string): Promise<boolean> {
    const result = await db.delete(payroll).where(eq(payroll.id, id)).returning();
    return result.length > 0;
  }

  async getAllPayroll(): Promise<Payroll[]> {
    return await db.select().from(payroll);
  }

  async getSetting(id: string): Promise<Setting | undefined> {
    const result = await db.select().from(settings).where(eq(settings.id, id));
    return result[0];
  }

  async getSettingByKey(companyId: string | null, key: string): Promise<Setting | undefined> {
    const companyFilter = companyId === null ? isNull(settings.companyId) : eq(settings.companyId, companyId);
    const result = await db.select().from(settings).where(and(companyFilter, eq(settings.key, key)));
    return result[0];
  }

  async getSettingsByCategory(companyId: string | null, category: string): Promise<Setting[]> {
    const companyFilter = companyId === null ? isNull(settings.companyId) : eq(settings.companyId, companyId);
    return await db.select().from(settings).where(and(companyFilter, eq(settings.category, category)));
  }

  async createSetting(setting: InsertSetting): Promise<Setting> {
    const id = randomUUID();
    const result = await db.insert(settings).values({ ...setting, id }).returning();
    return result[0];
  }

  async updateSetting(id: string, setting: Partial<InsertSetting>): Promise<Setting | undefined> {
    const result = await db.update(settings).set(setting).where(eq(settings.id, id)).returning();
    return result[0];
  }

  async deleteSetting(id: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.id, id)).returning();
    return result.length > 0;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async getMasterDepartment(id: string): Promise<MasterDepartment | undefined> {
    const result = await db.select().from(masterDepartments).where(eq(masterDepartments.id, id));
    return result[0];
  }

  async getAllMasterDepartments(): Promise<MasterDepartment[]> {
    return await db.select().from(masterDepartments);
  }

  async getMasterDepartmentsByCompany(companyId: string): Promise<MasterDepartment[]> {
    return await db.select().from(masterDepartments).where(eq(masterDepartments.companyId, companyId));
  }

  async createMasterDepartment(dept: InsertMasterDepartment): Promise<MasterDepartment> {
    const id = randomUUID();
    const result = await db.insert(masterDepartments).values({ ...dept, id }).returning();
    return result[0];
  }

  async updateMasterDepartment(id: string, dept: Partial<InsertMasterDepartment>): Promise<MasterDepartment | undefined> {
    const result = await db.update(masterDepartments).set(dept).where(eq(masterDepartments.id, id)).returning();
    return result[0];
  }

  async deleteMasterDepartment(id: string): Promise<boolean> {
    const result = await db.delete(masterDepartments).where(eq(masterDepartments.id, id)).returning();
    return result.length > 0;
  }

  async getMasterDesignation(id: string): Promise<MasterDesignation | undefined> {
    const result = await db.select().from(masterDesignations).where(eq(masterDesignations.id, id));
    return result[0];
  }

  async getAllMasterDesignations(): Promise<MasterDesignation[]> {
    return await db.select().from(masterDesignations);
  }

  async getMasterDesignationsByCompany(companyId: string): Promise<MasterDesignation[]> {
    return await db.select().from(masterDesignations).where(eq(masterDesignations.companyId, companyId));
  }

  async createMasterDesignation(desg: InsertMasterDesignation): Promise<MasterDesignation> {
    const id = randomUUID();
    const result = await db.insert(masterDesignations).values({ ...desg, id }).returning();
    return result[0];
  }

  async updateMasterDesignation(id: string, desg: Partial<InsertMasterDesignation>): Promise<MasterDesignation | undefined> {
    const result = await db.update(masterDesignations).set(desg).where(eq(masterDesignations.id, id)).returning();
    return result[0];
  }

  async deleteMasterDesignation(id: string): Promise<boolean> {
    const result = await db.delete(masterDesignations).where(eq(masterDesignations.id, id)).returning();
    return result.length > 0;
  }

  async getMasterLocation(id: string): Promise<MasterLocation | undefined> {
    const result = await db.select().from(masterLocations).where(eq(masterLocations.id, id));
    return result[0];
  }

  async getAllMasterLocations(): Promise<MasterLocation[]> {
    return await db.select().from(masterLocations);
  }

  async getMasterLocationsByCompany(companyId: string): Promise<MasterLocation[]> {
    return await db.select().from(masterLocations).where(eq(masterLocations.companyId, companyId));
  }

  async createMasterLocation(loc: InsertMasterLocation): Promise<MasterLocation> {
    const id = randomUUID();
    const result = await db.insert(masterLocations).values({ ...loc, id }).returning();
    return result[0];
  }

  async updateMasterLocation(id: string, loc: Partial<InsertMasterLocation>): Promise<MasterLocation | undefined> {
    const result = await db.update(masterLocations).set(loc).where(eq(masterLocations.id, id)).returning();
    return result[0];
  }

  async deleteMasterLocation(id: string): Promise<boolean> {
    const result = await db.delete(masterLocations).where(eq(masterLocations.id, id)).returning();
    return result.length > 0;
  }

  async getEarningHead(id: string): Promise<EarningHead | undefined> {
    const result = await db.select().from(earningHeads).where(eq(earningHeads.id, id));
    return result[0];
  }

  async getEarningHeadsByCompany(companyId: string): Promise<EarningHead[]> {
    return await db.select().from(earningHeads).where(eq(earningHeads.companyId, companyId));
  }

  async createEarningHead(head: InsertEarningHead): Promise<EarningHead> {
    const id = randomUUID();
    const result = await db.insert(earningHeads).values({ ...head, id }).returning();
    return result[0];
  }

  async updateEarningHead(id: string, head: Partial<InsertEarningHead>): Promise<EarningHead | undefined> {
    const result = await db.update(earningHeads).set(head).where(eq(earningHeads.id, id)).returning();
    return result[0];
  }

  async deleteEarningHead(id: string): Promise<boolean> {
    const result = await db.delete(earningHeads).where(eq(earningHeads.id, id)).returning();
    return result.length > 0;
  }

  async getDeductionHead(id: string): Promise<DeductionHead | undefined> {
    const result = await db.select().from(deductionHeads).where(eq(deductionHeads.id, id));
    return result[0];
  }

  async getDeductionHeadsByCompany(companyId: string): Promise<DeductionHead[]> {
    return await db.select().from(deductionHeads).where(eq(deductionHeads.companyId, companyId));
  }

  async createDeductionHead(head: InsertDeductionHead): Promise<DeductionHead> {
    const id = randomUUID();
    const result = await db.insert(deductionHeads).values({ ...head, id }).returning();
    return result[0];
  }

  async updateDeductionHead(id: string, head: Partial<InsertDeductionHead>): Promise<DeductionHead | undefined> {
    const result = await db.update(deductionHeads).set(head).where(eq(deductionHeads.id, id)).returning();
    return result[0];
  }

  async deleteDeductionHead(id: string): Promise<boolean> {
    const result = await db.delete(deductionHeads).where(eq(deductionHeads.id, id)).returning();
    return result.length > 0;
  }

  async getStatutorySettings(id: string): Promise<StatutorySettings | undefined> {
    const result = await db.select().from(statutorySettings).where(eq(statutorySettings.id, id));
    return result[0];
  }

  async getStatutorySettingsByCompany(companyId: string): Promise<StatutorySettings | undefined> {
    const result = await db.select().from(statutorySettings).where(eq(statutorySettings.companyId, companyId));
    return result[0];
  }

  async createStatutorySettings(s: InsertStatutorySettings): Promise<StatutorySettings> {
    const id = randomUUID();
    const result = await db.insert(statutorySettings).values({ ...s, id }).returning();
    return result[0];
  }

  async updateStatutorySettings(id: string, s: Partial<InsertStatutorySettings>): Promise<StatutorySettings | undefined> {
    const result = await db.update(statutorySettings).set(s).where(eq(statutorySettings.id, id)).returning();
    return result[0];
  }

  async deleteStatutorySettings(id: string): Promise<boolean> {
    const result = await db.delete(statutorySettings).where(eq(statutorySettings.id, id)).returning();
    return result.length > 0;
  }

  async getTimeOfficePolicy(id: string): Promise<TimeOfficePolicy | undefined> {
    const result = await db.select().from(timeOfficePolicies).where(eq(timeOfficePolicies.id, id));
    return result[0];
  }

  async getTimeOfficePoliciesByCompany(companyId: string): Promise<TimeOfficePolicy[]> {
    return await db.select().from(timeOfficePolicies).where(eq(timeOfficePolicies.companyId, companyId));
  }

  async createTimeOfficePolicy(policy: InsertTimeOfficePolicy): Promise<TimeOfficePolicy> {
    const id = randomUUID();
    const result = await db.insert(timeOfficePolicies).values({ ...policy, id }).returning();
    return result[0];
  }

  async updateTimeOfficePolicy(id: string, policy: Partial<InsertTimeOfficePolicy>): Promise<TimeOfficePolicy | undefined> {
    const result = await db.update(timeOfficePolicies).set(policy).where(eq(timeOfficePolicies.id, id)).returning();
    return result[0];
  }

  async deleteTimeOfficePolicy(id: string): Promise<boolean> {
    const result = await db.delete(timeOfficePolicies).where(eq(timeOfficePolicies.id, id)).returning();
    return result.length > 0;
  }

  async getFnfSettlement(id: string): Promise<FnfSettlement | undefined> {
    const result = await db.select().from(fnfSettlements).where(eq(fnfSettlements.id, id));
    return result[0];
  }

  async getFnfSettlementByEmployee(employeeId: string): Promise<FnfSettlement | undefined> {
    const result = await db.select().from(fnfSettlements).where(eq(fnfSettlements.employeeId, employeeId));
    return result[0];
  }

  async getFnfSettlementsByCompany(companyId: string): Promise<FnfSettlement[]> {
    return await db.select().from(fnfSettlements).where(eq(fnfSettlements.companyId, companyId));
  }

  async createFnfSettlement(settlement: InsertFnfSettlement): Promise<FnfSettlement> {
    const id = randomUUID();
    const result = await db.insert(fnfSettlements).values({ ...settlement, id }).returning();
    return result[0];
  }

  async updateFnfSettlement(id: string, settlement: Partial<InsertFnfSettlement>): Promise<FnfSettlement | undefined> {
    const result = await db.update(fnfSettlements).set(settlement).where(eq(fnfSettlements.id, id)).returning();
    return result[0];
  }

  async deleteFnfSettlement(id: string): Promise<boolean> {
    const result = await db.delete(fnfSettlements).where(eq(fnfSettlements.id, id)).returning();
    return result.length > 0;
  }

  async getAllFnfSettlements(): Promise<FnfSettlement[]> {
    return await db.select().from(fnfSettlements);
  }

  async getHoliday(id: string): Promise<Holiday | undefined> {
    const result = await db.select().from(holidays).where(eq(holidays.id, id));
    return result[0];
  }

  async getHolidaysByCompany(companyId: string): Promise<Holiday[]> {
    return await db.select().from(holidays).where(eq(holidays.companyId, companyId));
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const id = randomUUID();
    const result = await db.insert(holidays).values({ ...holiday, id }).returning();
    return result[0];
  }

  async updateHoliday(id: string, holiday: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    const result = await db.update(holidays).set(holiday).where(eq(holidays.id, id)).returning();
    return result[0];
  }

  async deleteHoliday(id: string): Promise<boolean> {
    const result = await db.delete(holidays).where(eq(holidays.id, id)).returning();
    return result.length > 0;
  }

  async getAllHolidays(): Promise<Holiday[]> {
    return await db.select().from(holidays);
  }

  async getBiometricPunchLog(id: string): Promise<BiometricPunchLog | undefined> {
    const result = await db.select().from(biometricPunchLogs).where(eq(biometricPunchLogs.id, id));
    return result[0];
  }

  async getBiometricPunchLogsByCompany(companyId: string): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs).where(eq(biometricPunchLogs.companyId, companyId));
  }

  async getBiometricPunchLogsByDate(companyId: string, date: string): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs).where(
      and(eq(biometricPunchLogs.companyId, companyId), eq(biometricPunchLogs.punchDate, date))
    );
  }

  async createBiometricPunchLog(log: InsertBiometricPunchLog): Promise<BiometricPunchLog> {
    const id = randomUUID();
    const result = await db.insert(biometricPunchLogs).values({ ...log, id }).returning();
    return result[0];
  }

  async updateBiometricPunchLog(id: string, log: Partial<InsertBiometricPunchLog>): Promise<BiometricPunchLog | undefined> {
    const result = await db.update(biometricPunchLogs).set(log).where(eq(biometricPunchLogs.id, id)).returning();
    return result[0];
  }

  async deleteBiometricPunchLog(id: string): Promise<boolean> {
    const result = await db.delete(biometricPunchLogs).where(eq(biometricPunchLogs.id, id)).returning();
    return result.length > 0;
  }

  async getAllBiometricPunchLogs(): Promise<BiometricPunchLog[]> {
    return await db.select().from(biometricPunchLogs);
  }

  async findDuplicatePunchLog(companyId: string, deviceEmployeeId: string, punchTime: string, punchDate: string): Promise<BiometricPunchLog | undefined> {
    const result = await db.select().from(biometricPunchLogs).where(
      and(
        eq(biometricPunchLogs.companyId, companyId),
        eq(biometricPunchLogs.deviceEmployeeId, deviceEmployeeId),
        eq(biometricPunchLogs.punchTime, punchTime),
        eq(biometricPunchLogs.punchDate, punchDate)
      )
    );
    return result[0];
  }

  async getBiometricDevice(id: string): Promise<BiometricDevice | undefined> {
    const result = await db.select().from(biometricDevices).where(eq(biometricDevices.id, id));
    return result[0];
  }

  async getBiometricDevicesByCompany(companyId: string): Promise<BiometricDevice[]> {
    // Include shared devices (companyId IS NULL) — those serve every company
    return await db
      .select()
      .from(biometricDevices)
      .where(or(eq(biometricDevices.companyId, companyId), isNull(biometricDevices.companyId)));
  }

  async createBiometricDevice(device: InsertBiometricDevice): Promise<BiometricDevice> {
    const id = randomUUID();
    const result = await db.insert(biometricDevices).values({ ...device, id }).returning();
    return result[0];
  }

  async updateBiometricDevice(id: string, device: Partial<InsertBiometricDevice>): Promise<BiometricDevice | undefined> {
    const result = await db.update(biometricDevices).set(device).where(eq(biometricDevices.id, id)).returning();
    return result[0];
  }

  async deleteBiometricDevice(id: string): Promise<boolean> {
    const result = await db.delete(biometricDevices).where(eq(biometricDevices.id, id)).returning();
    return result.length > 0;
  }

  async getAllBiometricDevices(): Promise<BiometricDevice[]> {
    return await db.select().from(biometricDevices);
  }

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

  async getPreviousExperiencesByEmployee(employeeId: string): Promise<PreviousExperience[]> {
    return await db.select().from(previousExperiences).where(eq(previousExperiences.employeeId, employeeId));
  }

  async getPreviousExperiencesByCandidate(candidateProfileId: string): Promise<PreviousExperience[]> {
    return await db.select().from(previousExperiences).where(eq(previousExperiences.candidateProfileId, candidateProfileId));
  }

  async createPreviousExperience(exp: InsertPreviousExperience): Promise<PreviousExperience> {
    const id = randomUUID();
    const result = await db.insert(previousExperiences).values({ ...exp, id }).returning();
    return result[0];
  }

  async deletePreviousExperience(id: string): Promise<void> {
    await db.delete(previousExperiences).where(eq(previousExperiences.id, id));
  }

  async getAttendanceByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | undefined> {
    const result = await db.select().from(attendance).where(
      and(eq(attendance.employeeId, employeeId), eq(attendance.date, date))
    );
    return result[0];
  }

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  }

  async setUserPermissions(userId: string, permissions: { module: string; canAccess: boolean }[], grantedBy: string, companyId: string | null): Promise<UserPermission[]> {
    const now = new Date().toISOString();
    const result: UserPermission[] = [];
    for (const perm of permissions) {
      const existing = await db.select().from(userPermissions)
        .where(and(eq(userPermissions.userId, userId), eq(userPermissions.module, perm.module)));
      if (existing.length > 0) {
        const updated = await db.update(userPermissions)
          .set({ canAccess: perm.canAccess, grantedBy, updatedAt: now })
          .where(and(eq(userPermissions.userId, userId), eq(userPermissions.module, perm.module)))
          .returning();
        result.push(updated[0]);
      } else {
        const id = randomUUID();
        const inserted = await db.insert(userPermissions)
          .values({ id, userId, companyId, module: perm.module, canAccess: perm.canAccess, grantedBy, updatedAt: now })
          .returning();
        result.push(inserted[0]);
      }
    }
    return result;
  }

  async getLoanAdvance(id: string): Promise<LoanAdvance | undefined> {
    const result = await db.select().from(loanAdvances).where(eq(loanAdvances.id, id));
    return result[0];
  }

  async getLoanAdvancesByEmployee(employeeId: string): Promise<LoanAdvance[]> {
    return await db.select().from(loanAdvances).where(eq(loanAdvances.employeeId, employeeId)).orderBy(desc(loanAdvances.createdAt));
  }

  async getLoanAdvancesByCompany(companyId: string): Promise<LoanAdvance[]> {
    return await db.select().from(loanAdvances).where(eq(loanAdvances.companyId, companyId)).orderBy(desc(loanAdvances.createdAt));
  }

  async createLoanAdvance(data: InsertLoanAdvance): Promise<LoanAdvance> {
    const id = randomUUID();
    const result = await db.insert(loanAdvances).values({ ...data, id }).returning();
    return result[0];
  }

  async updateLoanAdvance(id: string, data: Partial<InsertLoanAdvance> & { approvedBy?: string; approvedAt?: string; updatedAt?: string }): Promise<LoanAdvance | undefined> {
    const result = await db.update(loanAdvances).set(data).where(eq(loanAdvances.id, id)).returning();
    return result[0];
  }

  async deleteLoanAdvance(id: string): Promise<boolean> {
    const result = await db.delete(loanAdvances).where(eq(loanAdvances.id, id)).returning();
    return result.length > 0;
  }
}
