import { pgTable, text, varchar, boolean, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Roles for the system
export const roles = [
  "super_admin",
  "company_admin", 
  "hr_admin",
  "recruiter",
  "manager",
  "employee"
] as const;

export type Role = typeof roles[number];

// Company Master
export const companies = pgTable("companies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyName: text("company_name").notNull(),
  legalName: text("legal_name").notNull(),
  cin: text("cin"),
  pan: text("pan"),
  gstin: text("gstin"),
  pfCode: text("pf_code"),
  esiCode: text("esi_code"),
  ptState: text("pt_state"),
  lwfState: text("lwf_state"),
  registeredAddress: text("registered_address"),
  logo: text("logo"),
  financialYear: text("financial_year"),
  status: text("status").notNull().default("active"),
  officeLatitude: text("office_latitude"),
  officeLongitude: text("office_longitude"),
  officeRadiusMeters: integer("office_radius_meters").default(100),
  faceVerificationEnabled: boolean("face_verification_enabled").default(true),
  gpsVerificationEnabled: boolean("gps_verification_enabled").default(true),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").default(""),
  lastName: text("last_name").default(""),
  role: text("role").notNull().default("employee"),
  companyId: varchar("company_id", { length: 36 }),
  status: text("status").notNull().default("active"),
  lastLogin: text("last_login"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Employees table
export const employees = pgTable("employees", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeCode: text("employee_code").notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  mobileNumber: text("mobile_number"),
  officialEmail: text("official_email"),
  dateOfJoining: text("date_of_joining").notNull(),
  department: text("department"),
  designation: text("designation"),
  reportingManager: varchar("reporting_manager", { length: 36 }),
  location: text("location"),
  employmentType: text("employment_type").default("permanent"),
  status: text("status").notNull().default("active"),
  grossSalary: integer("gross_salary"),
  paymentMode: text("payment_mode"),
  pfApplicable: boolean("pf_applicable").default(false),
  uan: text("uan"),
  esiApplicable: boolean("esi_applicable").default(false),
  esiNumber: text("esi_number"),
  ptState: text("pt_state"),
  lwfApplicable: boolean("lwf_applicable").default(false),
  bonusApplicable: boolean("bonus_applicable").default(false),
  bonusPaidMonthly: boolean("bonus_paid_monthly").default(false),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  pan: text("pan"),
  aadhaar: text("aadhaar"),
  timeOfficePolicyId: varchar("time_office_policy_id", { length: 36 }),
  exitDate: text("exit_date"),
  exitReason: text("exit_reason"),
  exitType: text("exit_type"),
  biometricDeviceId: text("biometric_device_id"),
  wageGradeId: varchar("wage_grade_id", { length: 36 }),
  registeredFaceImage: text("registered_face_image"),
  fatherHusbandName: text("father_husband_name"),
  presentAddress: text("present_address"),
  presentState: text("present_state"),
  presentDistrict: text("present_district"),
  presentPincode: text("present_pincode"),
  permanentAddress: text("permanent_address"),
  permanentState: text("permanent_state"),
  permanentDistrict: text("permanent_district"),
  permanentPincode: text("permanent_pincode"),
  address: text("address"),
  addressState: text("address_state"),
  addressDistrict: text("address_district"),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const exitTypes = [
  "resignation",
  "termination",
  "retirement",
  "absconding",
  "end_of_contract",
  "death",
  "other"
] as const;
export type ExitType = typeof exitTypes[number];

// Master Departments table (company-specific)
export const masterDepartments = pgTable("master_departments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  status: text("status").notNull().default("active"),
});

export const insertMasterDepartmentSchema = createInsertSchema(masterDepartments).omit({ id: true });
export type InsertMasterDepartment = z.infer<typeof insertMasterDepartmentSchema>;
export type MasterDepartment = typeof masterDepartments.$inferSelect;

// Master Designations table (company-specific)
export const masterDesignations = pgTable("master_designations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  level: integer("level").default(1),
  description: text("description"),
  status: text("status").notNull().default("active"),
});

export const insertMasterDesignationSchema = createInsertSchema(masterDesignations).omit({ id: true });
export type InsertMasterDesignation = z.infer<typeof insertMasterDesignationSchema>;
export type MasterDesignation = typeof masterDesignations.$inferSelect;

// Wage Grades table — per-company minimum-wage grades. Used to tag each
// employee with the grade that determines their statutory minimum monthly
// wage (e.g. "Skilled", "Semi-skilled", "Unskilled"). Stored in rupees as
// an integer to match grossSalary semantics.
export const wageGrades = pgTable("wage_grades", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  minimumWage: integer("minimum_wage").notNull(),
  period: text("period"),
  description: text("description"),
  status: text("status").notNull().default("active"),
});

export const insertWageGradeSchema = createInsertSchema(wageGrades).omit({ id: true });
export type InsertWageGrade = z.infer<typeof insertWageGradeSchema>;
export type WageGrade = typeof wageGrades.$inferSelect;


// Master Locations table (company-specific)
export const masterLocations = pgTable("master_locations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  address: text("address"),
  city: text("city"),
  district: text("district"),
  state: text("state"),
  country: text("country").default("India"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  status: text("status").notNull().default("active"),
});

export const insertMasterLocationSchema = createInsertSchema(masterLocations).omit({ id: true });
export type InsertMasterLocation = z.infer<typeof insertMasterLocationSchema>;
export type MasterLocation = typeof masterLocations.$inferSelect;

// Earning Heads table (company-specific)
export const earningHeads = pgTable("earning_heads", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("fixed"), // fixed, percentage
  calculationBase: text("calculation_base"), // basic, gross
  percentage: integer("percentage").default(0),
  isTaxable: boolean("is_taxable").default(true),
  isPartOfCTC: boolean("is_part_of_ctc").default(true),
  status: text("status").notNull().default("active"),
});

export const insertEarningHeadSchema = createInsertSchema(earningHeads).omit({ id: true });
export type InsertEarningHead = z.infer<typeof insertEarningHeadSchema>;
export type EarningHead = typeof earningHeads.$inferSelect;

// Deduction Heads table (company-specific)
export const deductionHeads = pgTable("deduction_heads", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("fixed"), // fixed, percentage
  calculationBase: text("calculation_base"), // basic, gross
  percentage: integer("percentage").default(0),
  isStatutory: boolean("is_statutory").default(false),
  status: text("status").notNull().default("active"),
});

export const insertDeductionHeadSchema = createInsertSchema(deductionHeads).omit({ id: true });
export type InsertDeductionHead = z.infer<typeof insertDeductionHeadSchema>;
export type DeductionHead = typeof deductionHeads.$inferSelect;

// Statutory Settings table (company-specific)
export const statutorySettings = pgTable("statutory_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  // PF Settings
  pfEmployeePercent: integer("pf_employee_percent").default(12),
  pfEmployerPercent: integer("pf_employer_percent").default(12),
  pfWageCeiling: integer("pf_wage_ceiling").default(15000),
  pfEnabled: boolean("pf_enabled").default(true),
  // ESIC Settings
  esicEmployeePercent: integer("esic_employee_percent").default(75), // 0.75% stored as 75
  esicEmployerPercent: integer("esic_employer_percent").default(325), // 3.25% stored as 325
  esicWageCeiling: integer("esic_wage_ceiling").default(21000),
  esicEnabled: boolean("esic_enabled").default(true),
  esicCalcOnGross: boolean("esic_calc_on_gross").default(false), // false = new rule (basic+DA), true = old setup (gross)
  // LWF Settings (percentage stored as basis points, e.g. 20 = 0.2%)
  lwfEmployeePercent: integer("lwf_employee_percent").default(20),
  lwfEmployerPercent: integer("lwf_employer_percent").default(40),
  lwfEmployeeMaxCap: integer("lwf_employee_max_cap").default(34),
  lwfEmployerMaxCap: integer("lwf_employer_max_cap").default(68),
  lwfCalculationBase: text("lwf_calculation_base").default("gross"),
  lwfEnabled: boolean("lwf_enabled").default(false),
  // PT Settings (monthly slab-based, storing max amount)
  ptMaxAmount: integer("pt_max_amount").default(200),
  ptEnabled: boolean("pt_enabled").default(true),
  ptState: text("pt_state"),
  // Bonus Settings
  bonusPercent: integer("bonus_percent").default(833), // 8.33% stored as 833 (basis points x100)
  bonusCalculationBase: text("bonus_calculation_base").default("basic"), // "basic" or "gross"
  bonusMaxCeiling: integer("bonus_max_ceiling").default(7000), // Monthly wage ceiling for bonus calculation
  bonusMinPercent: integer("bonus_min_percent").default(833), // Minimum 8.33%
  bonusMaxPercent: integer("bonus_max_percent").default(2000), // Maximum 20%
  bonusEnabled: boolean("bonus_enabled").default(true),
  bonusSkipCeiling: boolean("bonus_skip_ceiling").default(false), // Skip wage ceiling when true
});

export const insertStatutorySettingsSchema = createInsertSchema(statutorySettings).omit({ id: true });
export type InsertStatutorySettings = z.infer<typeof insertStatutorySettingsSchema>;
export type StatutorySettings = typeof statutorySettings.$inferSelect;

// Legacy departments array for backward compatibility
export const departments = [
  "Engineering",
  "Human Resources",
  "Finance",
  "Sales",
  "Marketing",
  "Operations",
  "Legal",
  "Administration"
] as const;

export type Department = typeof departments[number];

// Employment types
export const employmentTypes = [
  "permanent",
  "contract",
  "intern",
  "consultant"
] as const;

export type EmploymentType = typeof employmentTypes[number];

// Status types
export const statusTypes = ["active", "inactive"] as const;
export type StatusType = typeof statusTypes[number];

// Dashboard stats type
export interface DashboardStats {
  totalCompanies: number;
  totalEmployees: number;
  totalUsers: number;
  activeEmployees: number;
  departmentDistribution: { department: string; count: number }[];
  recentEmployees: Employee[];
}

// Attendance table
export const attendance = pgTable("attendance", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  date: text("date").notNull(),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  status: text("status").notNull().default("present"),
  workHours: text("work_hours"),
  otHours: text("ot_hours"),
  notes: text("notes"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  locationAccuracy: text("location_accuracy"),
  locationAddress: text("location_address"),
  faceImagePath: text("face_image_path"),
  faceVerified: boolean("face_verified").default(false),
  clockInMethod: text("clock_in_method").default("web"),
  clockOutLatitude: text("clock_out_latitude"),
  clockOutLongitude: text("clock_out_longitude"),
  clockOutLocationAccuracy: text("clock_out_location_accuracy"),
  clockOutFaceImagePath: text("clock_out_face_image_path"),
  clockOutFaceVerified: boolean("clock_out_face_verified").default(false),
  clockOutMethod: text("clock_out_method"),
  leaveTypeCode: text("leave_type_code"),
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export const attendanceStatuses = ["present", "absent", "half_day", "on_leave", "holiday", "weekend"] as const;
export type AttendanceStatus = typeof attendanceStatuses[number];

// Leave Types table
export const leaveTypes = pgTable("leave_types", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  daysPerYear: integer("days_per_year").notNull().default(12),
  carryForward: boolean("carry_forward").default(false),
  maxCarryForward: integer("max_carry_forward").default(0),
  description: text("description"),
  status: text("status").notNull().default("active"),
});

export const insertLeaveTypeSchema = createInsertSchema(leaveTypes).omit({ id: true });
export type InsertLeaveType = z.infer<typeof insertLeaveTypeSchema>;
export type LeaveType = typeof leaveTypes.$inferSelect;

// Leave Requests table
export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

export const leaveRequestStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveRequestStatus = typeof leaveRequestStatuses[number];

// Salary Structure table
export const salaryStructures = pgTable("salary_structures", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  basicSalary: integer("basic_salary").notNull(),
  hra: integer("hra").default(0),
  conveyance: integer("conveyance").default(0),
  medicalAllowance: integer("medical_allowance").default(0),
  specialAllowance: integer("special_allowance").default(0),
  otherAllowances: integer("other_allowances").default(0),
  grossSalary: integer("gross_salary").notNull(),
  pfEmployee: integer("pf_employee").default(0),
  pfEmployer: integer("pf_employer").default(0),
  esi: integer("esi").default(0),
  professionalTax: integer("professional_tax").default(0),
  lwfEmployee: integer("lwf_employee").default(0),
  tds: integer("tds").default(0),
  otherDeductions: integer("other_deductions").default(0),
  netSalary: integer("net_salary").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  status: text("status").notNull().default("active"),
});

export const insertSalaryStructureSchema = createInsertSchema(salaryStructures).omit({ id: true });
export type InsertSalaryStructure = z.infer<typeof insertSalaryStructureSchema>;
export type SalaryStructure = typeof salaryStructures.$inferSelect;

// Payroll table
export const payroll = pgTable("payroll", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  basicSalary: integer("basic_salary").notNull(),
  hra: integer("hra").default(0),
  conveyance: integer("conveyance").default(0),
  medicalAllowance: integer("medical_allowance").default(0),
  specialAllowance: integer("special_allowance").default(0),
  otherAllowances: integer("other_allowances").default(0),
  bonus: integer("bonus").default(0),
  totalEarnings: integer("total_earnings").notNull(),
  pfEmployee: integer("pf_employee").default(0),
  esi: integer("esi").default(0),
  professionalTax: integer("professional_tax").default(0),
  lwfEmployee: integer("lwf_employee").default(0),
  tds: integer("tds").default(0),
  otherDeductions: integer("other_deductions").default(0),
  loanDeduction: integer("loan_deduction").default(0),
  totalDeductions: integer("total_deductions").notNull(),
  netSalary: integer("net_salary").notNull(),
  workingDays: integer("working_days").notNull(),
  presentDays: integer("present_days").notNull(),
  payDays: integer("pay_days").default(0),
  leaveDays: integer("leave_days").default(0),
  otHours: numeric("ot_hours", { precision: 6, scale: 2 }).default("0"),
  otAmount: integer("ot_amount").default(0),
  status: text("status").notNull().default("draft"),
  paidOn: text("paid_on"),
  generatedAt: text("generated_at").notNull(),
});

export const insertPayrollSchema = createInsertSchema(payroll).omit({ id: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payroll.$inferSelect;

export const payrollStatuses = ["draft", "processed", "paid"] as const;
export type PayrollStatus = typeof payrollStatuses[number];

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }),
  key: text("key").notNull(),
  value: text("value"),
  category: text("category").notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

export const timeOfficePolicies = pgTable("time_office_policies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  policyName: text("policy_name").notNull(),
  weeklyOff1: text("weekly_off_1").notNull().default("sunday"),
  weeklyOff2: text("weekly_off_2").default("saturday"),
  dutyStartTime: text("duty_start_time").notNull().default("09:00"),
  dutyEndTime: text("duty_end_time").notNull().default("18:00"),
  allowAutoAttend: boolean("allow_auto_attend").default(false),
  presentMarkingDuration: integer("present_marking_duration").default(480),
  permissibleLateArrival: integer("permissible_late_arrival").default(15),
  permissibleEarlyGoing: integer("permissible_early_going").default(15),
  halfDayMinHours: integer("half_day_min_hours").default(4),
  fullDayMinHours: integer("full_day_min_hours").default(8),
  otAllowed: boolean("ot_allowed").default(false),
  isDefault: boolean("is_default").default(false),
  status: text("status").notNull().default("active"),
});

export const insertTimeOfficePolicySchema = createInsertSchema(timeOfficePolicies).omit({ id: true });
export type InsertTimeOfficePolicy = z.infer<typeof insertTimeOfficePolicySchema>;
export type TimeOfficePolicy = typeof timeOfficePolicies.$inferSelect;

// Full & Final Settlement table
export const fnfSettlements = pgTable("fnf_settlements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  settlementDate: text("settlement_date").notNull(),
  lastWorkingDay: text("last_working_day").notNull(),
  salaryDue: integer("salary_due").default(0),
  leaveEncashment: integer("leave_encashment").default(0),
  bonus: integer("bonus").default(0),
  gratuity: integer("gratuity").default(0),
  noticePay: integer("notice_pay").default(0),
  otherEarnings: integer("other_earnings").default(0),
  otherEarningsRemarks: text("other_earnings_remarks"),
  totalEarnings: integer("total_earnings").notNull().default(0),
  pfDeduction: integer("pf_deduction").default(0),
  esiDeduction: integer("esi_deduction").default(0),
  professionalTax: integer("professional_tax").default(0),
  tds: integer("tds").default(0),
  loanRecovery: integer("loan_recovery").default(0),
  noticePeriodRecovery: integer("notice_period_recovery").default(0),
  otherDeductions: integer("other_deductions").default(0),
  otherDeductionsRemarks: text("other_deductions_remarks"),
  totalDeductions: integer("total_deductions").notNull().default(0),
  netPayable: integer("net_payable").notNull().default(0),
  remarks: text("remarks"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedAt: text("approved_at"),
});

export const insertFnfSettlementSchema = createInsertSchema(fnfSettlements).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertFnfSettlement = z.infer<typeof insertFnfSettlementSchema>;
export type FnfSettlement = typeof fnfSettlements.$inferSelect;

export const fnfStatuses = ["draft", "approved", "paid", "cancelled"] as const;
export type FnfStatus = typeof fnfStatuses[number];

// Holidays table
export const holidays = pgTable("holidays", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  date: text("date").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("public"),
  status: text("status").notNull().default("active"),
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({ id: true });
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

// Biometric Devices table
export const biometricDevices = pgTable("biometric_devices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }),
  name: text("name").notNull(),
  // Short, human-friendly machine code shown to admins and used when
  // assigning an employee to a specific machine (e.g. "M1", "GATE-A").
  // Kept separate from the manufacturer serial so admins can rename
  // without affecting device identity.
  code: text("code"),
  deviceSerial: text("device_serial").notNull(),
  ipAddress: text("ip_address"),
  port: integer("port").default(8181),
  status: text("status").notNull().default("offline"), // online, offline
  lastSync: text("last_sync"),
  createdAt: text("created_at"),
  // ADMS push-mode tracking — populated when the device phones home over HTTP
  lastPushAt: text("last_push_at"),
  lastPushIp: text("last_push_ip"),
  firmwareVersion: text("firmware_version"),
  pushTotal: integer("push_total").notNull().default(0),
  // Authentication for ADMS pushes. A device must match at least one of:
  //   - pushToken: shared secret sent as ?token=, ?auth=, Authorization: Bearer,
  //                or X-Device-Token header
  //   - allowedIpCidr: source IP must fall inside this CIDR (e.g. 1.2.3.4/32)
  // If both are null the device cannot push (fail-closed).
  pushToken: text("push_token"),
  allowedIpCidr: text("allowed_ip_cidr"),
});

export const insertBiometricDeviceSchema = createInsertSchema(biometricDevices).omit({ id: true });
export type InsertBiometricDevice = z.infer<typeof insertBiometricDeviceSchema>;
export type BiometricDevice = typeof biometricDevices.$inferSelect;

// Biometric Punch Logs table
export const biometricPunchLogs = pgTable("biometric_punch_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }),
  deviceEmployeeId: text("device_employee_id").notNull(),
  punchTime: text("punch_time").notNull(),
  punchDate: text("punch_date").notNull(),
  punchType: text("punch_type").default("unknown"),
  deviceId: text("device_id"),
  isProcessed: boolean("is_processed").default(false),
  isDuplicate: boolean("is_duplicate").default(false),
  missingPunch: boolean("missing_punch").default(false),
  syncedAt: text("synced_at"),
  createdAt: text("created_at"),
});

export const insertBiometricPunchLogSchema = createInsertSchema(biometricPunchLogs).omit({ id: true });
export type InsertBiometricPunchLog = z.infer<typeof insertBiometricPunchLogSchema>;
export type BiometricPunchLog = typeof biometricPunchLogs.$inferSelect;

// Users enrolled on a biometric device. Populated from USERINFO/USER records
// pushed by the device (ADMS protocol). Lets us show the full enrolled list
// even for employees who haven't punched yet.
export const biometricDeviceUsers = pgTable("biometric_device_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  deviceId: varchar("device_id", { length: 36 }).notNull(),
  deviceEmployeeId: text("device_employee_id").notNull(),
  name: text("name"),
  privilege: text("privilege"),
  card: text("card"),
  passwordSet: boolean("password_set").default(false),
  fingerprintCount: integer("fingerprint_count").default(0),
  firstSeenAt: text("first_seen_at"),
  lastSeenAt: text("last_seen_at"),
});

export type BiometricDeviceUser = typeof biometricDeviceUsers.$inferSelect;

// Job Posting statuses
export const jobPostingStatuses = ["draft", "open", "closed", "on_hold"] as const;
export type JobPostingStatus = typeof jobPostingStatuses[number];

// Job Application statuses
export const jobApplicationStatuses = ["applied", "shortlisted", "interview_scheduled", "interviewed", "offered", "offer_accepted", "offer_negotiated", "offer_rejected", "hired", "rejected", "withdrawn"] as const;
export type JobApplicationStatus = typeof jobApplicationStatuses[number];

// Job Employment Types
export const jobEmploymentTypes = ["full_time", "part_time", "contract", "intern"] as const;
export type JobEmploymentType = typeof jobEmploymentTypes[number];

// Job Postings table
export const jobPostings = pgTable("job_postings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  department: text("department"),
  location: text("location"),
  employmentType: text("employment_type").default("full_time"),
  description: text("description").notNull(),
  requirements: text("requirements"),
  salaryRange: text("salary_range"),
  vacancies: integer("vacancies").default(1),
  status: text("status").notNull().default("draft"),
  postedBy: varchar("posted_by", { length: 36 }),
  postedAt: text("posted_at"),
  closingDate: text("closing_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertJobPostingSchema = createInsertSchema(jobPostings).omit({ id: true });
export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;

// Job Applications table
export const jobApplications = pgTable("job_applications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobPostingId: varchar("job_posting_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  applicantUserId: varchar("applicant_user_id", { length: 36 }),
  employeeId: varchar("employee_id", { length: 36 }),
  applicantName: text("applicant_name"),
  applicantEmail: text("applicant_email"),
  applicantPhone: text("applicant_phone"),
  coverLetter: text("cover_letter"),
  resumeUrl: text("resume_url"),
  status: text("status").notNull().default("applied"),
  appliedAt: text("applied_at").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  reviewedAt: text("reviewed_at"),
  remarks: text("remarks"),
  interviewDate: text("interview_date"),
  interviewTime: text("interview_time"),
  interviewLocation: text("interview_location"),
  interviewerName: text("interviewer_name"),
  interviewNotes: text("interview_notes"),
  offerSalary: text("offer_salary"),
  offerDesignation: text("offer_designation"),
  offerTerms: text("offer_terms"),
  offerExpiryDate: text("offer_expiry_date"),
  employeeResponse: text("employee_response"),
  negotiationNote: text("negotiation_note"),
  createdAt: text("created_at").notNull(),
});

export const insertJobApplicationSchema = createInsertSchema(jobApplications).omit({ id: true, reviewedBy: true, reviewedAt: true });
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplications.$inferSelect;

// Candidate Profiles table (for self-signup employees)
export const candidateProfiles = pgTable("candidate_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  aadhaar: text("aadhaar").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  mobileNumber: text("mobile_number"),
  personalEmail: text("personal_email"),
  fatherName: text("father_name"),
  address: text("address"),
  addressState: text("address_state"),
  addressDistrict: text("address_district"),
  addressPincode: text("address_pincode"),
  permanentAddress: text("permanent_address"),
  permanentState: text("permanent_state"),
  permanentDistrict: text("permanent_district"),
  permanentPincode: text("permanent_pincode"),
  pan: text("pan"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  bankName: text("bank_name"),
  currentSalary: text("current_salary"),
  expectedSalary: text("expected_salary"),
  skills: text("skills"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertCandidateProfileSchema = createInsertSchema(candidateProfiles).omit({ id: true });
export type InsertCandidateProfile = z.infer<typeof insertCandidateProfileSchema>;
export type CandidateProfile = typeof candidateProfiles.$inferSelect;

export const previousExperiences = pgTable("previous_experiences", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }),
  candidateProfileId: varchar("candidate_profile_id", { length: 36 }),
  organizationName: text("organization_name").notNull(),
  postHeld: text("post_held").notNull(),
  dateOfJoining: text("date_of_joining").notNull(),
  dateOfLeaving: text("date_of_leaving").notNull(),
  reasonOfLeaving: text("reason_of_leaving"),
  ctc: text("ctc"),
  jobResponsibilities: text("job_responsibilities"),
  createdAt: text("created_at").notNull(),
});

export const insertPreviousExperienceSchema = createInsertSchema(previousExperiences).omit({ id: true });
export type InsertPreviousExperience = z.infer<typeof insertPreviousExperienceSchema>;
export type PreviousExperience = typeof previousExperiences.$inferSelect;

// Loan & Advance table
export const loanAdvanceTypes = ["loan", "advance"] as const;
export type LoanAdvanceType = typeof loanAdvanceTypes[number];

export const loanAdvanceStatuses = ["pending", "approved", "rejected", "active", "closed", "cancelled"] as const;
export type LoanAdvanceStatus = typeof loanAdvanceStatuses[number];

export const loanAdvances = pgTable("loan_advances", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  type: text("type").notNull().default("advance"),
  amount: integer("amount").notNull(),
  purpose: text("purpose"),
  requestDate: text("request_date").notNull(),
  status: text("status").notNull().default("pending"),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  totalInstallments: integer("total_installments"),
  installmentAmount: integer("installment_amount"),
  remainingBalance: integer("remaining_balance"),
  deductionStartMonth: text("deduction_start_month"),
  remarks: text("remarks"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertLoanAdvanceSchema = createInsertSchema(loanAdvances).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertLoanAdvance = z.infer<typeof insertLoanAdvanceSchema>;
export type LoanAdvance = typeof loanAdvances.$inferSelect;

// User Permissions table — per-user module access overrides
export const appModules = ["attendance", "leave", "payroll", "employees", "reports", "recruitment", "profile"] as const;
export type AppModule = typeof appModules[number];

export const userPermissions = pgTable("user_permissions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }),
  module: text("module").notNull(),
  canAccess: boolean("can_access").notNull().default(true),
  grantedBy: varchar("granted_by", { length: 36 }),
  updatedAt: text("updated_at").notNull(),
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ id: true });
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Profile Update Requests — employee changes pending admin approval
export const profileUpdateRequests = pgTable("profile_update_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  companyId: varchar("company_id", { length: 36 }),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  requestData: text("request_data").notNull(), // JSON of ProfileData
  adminNote: text("admin_note"),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
});
export type ProfileUpdateRequest = typeof profileUpdateRequests.$inferSelect;

// Compliance Adjustments table — completely separate from payroll
export const complianceAdjustments = pgTable("compliance_adjustments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  employeeName: text("employee_name"),
  employeeCode: text("employee_code"),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  complianceType: text("compliance_type").notNull().default("PF"),
  partyName: text("party_name"),
  originalAttendance: integer("original_attendance"),
  originalOtHours: text("original_ot_hours"),
  originalBasicSalary: integer("original_basic_salary"),
  originalGrosssSalary: integer("original_gross_salary"),
  originalNetSalary: integer("original_net_salary"),
  adjustedAttendance: integer("adjusted_attendance"),
  adjustedOtHours: text("adjusted_ot_hours"),
  adjustedBasicSalary: integer("adjusted_basic_salary"),
  adjustedGrossSalary: integer("adjusted_gross_salary"),
  adjustedNetSalary: integer("adjusted_net_salary"),
  remarks: text("remarks"),
  status: text("status").notNull().default("draft"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertComplianceAdjustmentSchema = createInsertSchema(complianceAdjustments).omit({ id: true });
export type InsertComplianceAdjustment = z.infer<typeof insertComplianceAdjustmentSchema>;
export type ComplianceAdjustment = typeof complianceAdjustments.$inferSelect;
