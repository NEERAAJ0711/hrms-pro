import { pgTable, text, varchar, boolean, timestamp, integer, real, numeric, bigserial, json, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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

// Web session store (managed at runtime by connect-pg-simple / express-session).
// Declared here only so `drizzle-kit push` recognises it as an existing,
// up-to-date table and does NOT propose dropping it (which would trigger an
// interactive data-loss prompt and hang the non-interactive post-merge push).
// The column shapes below mirror connect-pg-simple's table exactly so push is a
// no-op: sid varchar PK, sess json, expire timestamp(6), index on expire.
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

// Company Master
export const companies = pgTable("companies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyCode: text("company_code"),               // Human-readable ID, e.g. HRMS001
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
  signature: text("signature"),
  financialYear: text("financial_year"),
  status: text("status").notNull().default("active"),
  officeLatitude: text("office_latitude"),
  officeLongitude: text("office_longitude"),
  officeRadiusMeters: integer("office_radius_meters").default(100),
  faceVerificationEnabled: boolean("face_verification_enabled").default(true),
  gpsVerificationEnabled: boolean("gps_verification_enabled").default(true),
  isContractor: boolean("is_contractor").default(false),
  trialStartDate: text("trial_start_date"),
  trialDays: integer("trial_days").default(3),
  trialExtendedDays: integer("trial_extended_days").default(0),
}, (table) => [
  uniqueIndex("companies_company_code_unique").on(table.companyCode),
]);

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Company → Contractor relationship
export const companyContractors = pgTable("company_contractors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  contractorId: varchar("contractor_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
});

export const insertCompanyContractorSchema = createInsertSchema(companyContractors).omit({ id: true });
export type InsertCompanyContractor = z.infer<typeof insertCompanyContractorSchema>;
export type CompanyContractor = typeof companyContractors.$inferSelect;

// Contractor → Employee tagging
export const contractorEmployees = pgTable("contractor_employees", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyContractorId: varchar("company_contractor_id", { length: 36 }).notNull().references((): AnyPgColumn => companyContractors.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  taggedDate: text("tagged_date"),
  taggedBy: text("tagged_by"),
});

export const insertContractorEmployeeSchema = createInsertSchema(contractorEmployees).omit({ id: true });
export type InsertContractorEmployee = z.infer<typeof insertContractorEmployeeSchema>;
export type ContractorEmployee = typeof contractorEmployees.$inferSelect;

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").default(""),
  lastName: text("last_name").default(""),
  role: text("role").notNull().default("employee"),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  lastLogin: text("last_login"),
  accessDepartments: text("access_departments").array(),
  accessLocations: text("access_locations").array(),
  accessContractors: text("access_contractors").array(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Employees table
export const employees = pgTable("employees", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeCode: text("employee_code").notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  mobileNumber: text("mobile_number"),
  officialEmail: text("official_email"),
  dateOfJoining: text("date_of_joining").notNull(),
  department: text("department"),
  designation: text("designation"),
  reportingManager: varchar("reporting_manager", { length: 36 }).references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
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
  otApplicable: boolean("ot_applicable").default(false),
  otRate: text("ot_rate").default("2x"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  pan: text("pan"),
  aadhaar: text("aadhaar"),
  timeOfficePolicyId: varchar("time_office_policy_id", { length: 36 }).references((): AnyPgColumn => timeOfficePolicies.id, { onDelete: "set null" }),
  exitDate: text("exit_date"),
  exitReason: text("exit_reason"),
  exitType: text("exit_type"),
  biometricDeviceId: text("biometric_device_id"),
  wageGradeId: varchar("wage_grade_id", { length: 36 }).references((): AnyPgColumn => wageGrades.id, { onDelete: "set null" }),
  contractorMasterId: varchar("contractor_master_id", { length: 36 }).references((): AnyPgColumn => contractorMasters.id, { onDelete: "set null" }),
  // Cross-company link: points to the On-Roll (master) employee record when the
  // same person is also employed at another company. NULL = this record is the
  // master (or the person works at only one company). See migrations/025.
  masterEmployeeId: varchar("master_employee_id", { length: 36 }).references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
  leavePolicyId: varchar("leave_policy_id", { length: 36 }).references((): AnyPgColumn => leavePolicies.id, { onDelete: "set null" }),
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
  maritalStatus: text("marital_status"),
  motherName: text("mother_name"),
  bloodGroup: text("blood_group"),
  nomineeName: text("nominee_name"),
  nomineeRelation: text("nominee_relation"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactNumber: text("emergency_contact_number"),
}, (table) => [
  index("idx_employees_company").on(table.companyId),
  index("idx_employees_company_status").on(table.companyId, table.status),
  index("idx_employees_user").on(table.userId),
]);

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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  minimumWage: integer("minimum_wage").notNull(),
  period: text("period"),
  effectiveFrom: text("effective_from"),
  effectiveTo: text("effective_to"),
  state: text("state"),
  description: text("description"),
  status: text("status").notNull().default("active"),
});

export const insertWageGradeSchema = createInsertSchema(wageGrades).omit({ id: true });
export type InsertWageGrade = z.infer<typeof insertWageGradeSchema>;
export type WageGrade = typeof wageGrades.$inferSelect;


// Master Locations table (company-specific)
export const masterLocations = pgTable("master_locations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("fixed"), // fixed, percentage
  calculationBase: text("calculation_base"), // basic, gross
  percentage: real("percentage").default(0),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("fixed"), // fixed, percentage
  calculationBase: text("calculation_base"), // basic, gross
  percentage: real("percentage").default(0),
  isStatutory: boolean("is_statutory").default(false),
  status: text("status").notNull().default("active"),
});

export const insertDeductionHeadSchema = createInsertSchema(deductionHeads).omit({ id: true });
export type InsertDeductionHead = z.infer<typeof insertDeductionHeadSchema>;
export type DeductionHead = typeof deductionHeads.$inferSelect;

// Statutory Settings table (company-specific)
export const statutorySettings = pgTable("statutory_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  totalContractors: number;
  totalPrincipalEmployers: number;
  departmentDistribution: { department: string; count: number }[];
  recentEmployees: Employee[];
}

// Attendance table
export const attendance = pgTable("attendance", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
}, (table) => [
  index("idx_attendance_employee_date").on(table.employeeId, table.date),
  index("idx_attendance_company_date").on(table.companyId, table.date),
]);

export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export const attendanceStatuses = ["present", "absent", "half_day", "on_leave", "holiday", "weekend"] as const;
export type AttendanceStatus = typeof attendanceStatuses[number];

// Leave Types table
export const leaveTypes = pgTable("leave_types", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
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
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull().references((): AnyPgColumn => leaveTypes.id, { onDelete: "restrict" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: numeric("days", { precision: 4, scale: 1 }).notNull(),
  dayType: text("day_type").notNull().default("full_day"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_leave_requests_company").on(table.companyId),
  index("idx_leave_requests_employee").on(table.employeeId),
  index("idx_leave_requests_status").on(table.status),
]);

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

export const leaveRequestStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveRequestStatus = typeof leaveRequestStatuses[number];

// Leave Policies table
export const leavePolicies = pgTable("leave_policies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  annualLeaveDays: integer("annual_leave_days").notNull().default(0),
  sickLeaveDays: integer("sick_leave_days").notNull().default(0),
  casualLeaveDays: integer("casual_leave_days").notNull().default(0),
  maternityLeaveDays: integer("maternity_leave_days").notNull().default(0),
  paternityLeaveDays: integer("paternity_leave_days").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const insertLeavePolicySchema = createInsertSchema(leavePolicies).omit({ id: true });
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;
export type LeavePolicy = typeof leavePolicies.$inferSelect;

// Salary Structure table
export const salaryStructures = pgTable("salary_structures", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  basicSalary: integer("basic_salary").notNull(),
  hra: integer("hra").default(0),
  conveyance: integer("conveyance").default(0),
  medicalAllowance: integer("medical_allowance").default(0),
  specialAllowance: integer("special_allowance").default(0),
  otherAllowances: integer("other_allowances").default(0),
  customEarnings: json("custom_earnings").$type<Record<string, number>>().default({}),
  customDeductions: json("custom_deductions").$type<Record<string, number>>().default({}),
  grossSalary: integer("gross_salary").notNull(),
  pfEmployee: integer("pf_employee").default(0),
  pfEmployer: integer("pf_employer").default(0),
  vpfAmount: integer("vpf_amount").default(0),
  esi: integer("esi").default(0),
  professionalTax: integer("professional_tax").default(0),
  lwfEmployee: integer("lwf_employee").default(0),
  tds: integer("tds").default(0),
  otherDeductions: integer("other_deductions").default(0),
  netSalary: integer("net_salary").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  status: text("status").notNull().default("active"),
}, (table) => [
  index("idx_salary_structures_employee").on(table.employeeId),
  index("idx_salary_structures_company").on(table.companyId),
]);

export const insertSalaryStructureSchema = createInsertSchema(salaryStructures).omit({ id: true });
export type InsertSalaryStructure = z.infer<typeof insertSalaryStructureSchema>;
export type SalaryStructure = typeof salaryStructures.$inferSelect;

// Payroll table
export const payroll = pgTable("payroll", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  vpfAmount: integer("vpf_amount").default(0),
  esi: integer("esi").default(0),
  professionalTax: integer("professional_tax").default(0),
  lwfEmployee: integer("lwf_employee").default(0),
  tds: integer("tds").default(0),
  otherDeductions: integer("other_deductions").default(0),
  loanDeduction: integer("loan_deduction").default(0),
  totalDeductions: integer("total_deductions").notNull(),
  netSalary: integer("net_salary").notNull(),
  workingDays: integer("working_days").notNull(),
  presentDays: numeric("present_days", { precision: 6, scale: 1 }).notNull().default("0"),
  payDays: numeric("pay_days", { precision: 6, scale: 1 }).default("0"),
  leaveDays: integer("leave_days").default(0),
  otHours: numeric("ot_hours", { precision: 6, scale: 2 }).default("0"),
  otAmount: integer("ot_amount").default(0),
  customEarnings: json("custom_earnings").$type<Record<string, number>>().default({}),
  customDeductions: json("custom_deductions").$type<Record<string, number>>().default({}),
  status: text("status").notNull().default("draft"),
  paidOn: text("paid_on"),
  generatedAt: text("generated_at").notNull(),
}, (table) => [
  index("idx_payroll_company_month_year").on(table.companyId, table.month, table.year),
  index("idx_payroll_employee").on(table.employeeId),
]);

export const insertPayrollSchema = createInsertSchema(payroll).omit({ id: true }).extend({
  presentDays: z.union([z.string(), z.number()]).transform(v => String(v)),
  payDays: z.union([z.string(), z.number()]).transform(v => String(v)),
});
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payroll.$inferSelect;

export const payrollStatuses = ["draft", "processed", "paid"] as const;
export type PayrollStatus = typeof payrollStatuses[number];

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  key: text("key").notNull(),
  value: text("value"),
  category: text("category").notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

export const timeOfficePolicies = pgTable("time_office_policies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  // Short, human-friendly machine code shown to admins and used when
  // assigning an employee to a specific machine (e.g. "M1", "GATE-A").
  // Kept separate from the manufacturer serial so admins can rename
  // without affecting device identity.
  code: text("code"),
  deviceSerial: text("device_serial").notNull(),
  ipAddress: text("ip_address"),
  admsServerIp: text("adms_server_ip"),
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
  // Tracks the highest ATTLOG record timestamp acknowledged per device.
  // Returned as ATTLOGStamp in GET /cdata so the device only pushes new records.
  // Set to 0 to force a full re-upload on next connection.
  lastAttlogStamp: integer("last_attlog_stamp").notNull().default(0),
  // Pending ADMS commands queued for the device (persisted across restarts).
  pendingCommands: json("pending_commands").$type<string[]>().default([]),
  // When true, server sends DATA CLEAR ATTLOG to the device after every
  // successful ATTLOG upload, keeping device memory free.
  autoDeletePunches: boolean("auto_delete_punches").notNull().default(false),
  // Machine type — used to show correct setup guide and verify-mode labels in UI.
  // "zkteco"        = ZKTeco fingerprint/card/face (x2008 or SpeedFace protocol)
  // "essl_airface"  = ESSL AirFace-Orcus (face recognition, SpeedFace/newer protocol)
  deviceModel: text("device_model").default("zkteco"),
});

export const insertBiometricDeviceSchema = createInsertSchema(biometricDevices).omit({ id: true });
export type InsertBiometricDevice = z.infer<typeof insertBiometricDeviceSchema>;
export type BiometricDevice = typeof biometricDevices.$inferSelect;

// Biometric Punch Logs table
export const biometricPunchLogs = pgTable("biometric_punch_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
  deviceEmployeeId: text("device_employee_id").notNull(),
  punchTime: text("punch_time").notNull(),
  punchDate: text("punch_date").notNull(),
  punchType: text("punch_type").default("unknown"),
  punchTypeOverride: boolean("punch_type_override").default(false),
  deviceId: text("device_id"),
  isProcessed: boolean("is_processed").default(false),
  isDuplicate: boolean("is_duplicate").default(false),
  missingPunch: boolean("missing_punch").default(false),
  syncedAt: text("synced_at"),
  createdAt: text("created_at"),
  // How the identity was verified on the device: face, fingerprint, card, password, palm
  verifyMode: text("verify_mode"),
}, (table) => [
  index("idx_biometric_punch_company_date").on(table.companyId, table.punchDate),
  index("idx_biometric_punch_employee").on(table.employeeId),
]);

export const insertBiometricPunchLogSchema = createInsertSchema(biometricPunchLogs).omit({ id: true });
export type InsertBiometricPunchLog = z.infer<typeof insertBiometricPunchLogSchema>;
export type BiometricPunchLog = typeof biometricPunchLogs.$inferSelect;

// Users enrolled on a biometric device. Populated from USERINFO/USER records
// pushed by the device (ADMS protocol). Lets us show the full enrolled list
// even for employees who haven't punched yet.
export const biometricDeviceUsers = pgTable("biometric_device_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  deviceId: varchar("device_id", { length: 36 }).notNull().references((): AnyPgColumn => biometricDevices.id, { onDelete: "cascade" }),
  deviceEmployeeId: text("device_employee_id").notNull(),
  name: text("name"),
  privilege: text("privilege"),
  card: text("card"),
  passwordSet: boolean("password_set").default(false),
  fingerprintCount: integer("fingerprint_count").default(0),
  // Face templates stored on device (ESSL AirFace-Orcus sends FacePic= in USERINFO)
  faceCount: integer("face_count").default(0),
  firstSeenAt: text("first_seen_at"),
  lastSeenAt: text("last_seen_at"),
});

export type BiometricDeviceUser = typeof biometricDeviceUsers.$inferSelect;

// ADMS activity log — persistent event log for ZKTeco device push sessions.
// Survives server restarts; powers the live activity feed in the UI.
export const admsActivityLog = pgTable("adms_activity_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceSn: text("device_sn").notNull(),
  direction: text("direction").notNull(), // "IN" | "OUT"
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type AdmsActivityLog = typeof admsActivityLog.$inferSelect;

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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
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
  jobPostingId: varchar("job_posting_id", { length: 36 }).notNull().references((): AnyPgColumn => jobPostings.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  applicantUserId: varchar("applicant_user_id", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  employeeId: varchar("employee_id", { length: 36 }).references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
  applicantName: text("applicant_name"),
  applicantEmail: text("applicant_email"),
  applicantPhone: text("applicant_phone"),
  coverLetter: text("cover_letter"),
  resumeUrl: text("resume_url"),
  status: text("status").notNull().default("applied"),
  appliedAt: text("applied_at").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
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
  // ── Phase 3 Recruitment AI (all nullable / additive / back-compatible) ──────
  // Raw text extracted from the uploaded resume (PDF/DOCX/TXT) and the structured
  // fields parsed from it by the AI resume parser. Never overwrites manually
  // entered application data — it is reviewed/confirmed in the UI first.
  resumeText: text("resume_text"),
  parsedResume: jsonb("parsed_resume"),
  // AI candidate score (0–100) against a specific job, with the breakdown
  // (strengths/weaknesses/missing skills/recommendation) and which job it scored.
  aiScore: integer("ai_score"),
  aiScoreBreakdown: jsonb("ai_score_breakdown"),
  aiScoredJobId: varchar("ai_scored_job_id", { length: 36 }),
  aiScoredAt: text("ai_scored_at"),
  // Concise AI candidate summary and AI-generated interview questions.
  aiSummary: text("ai_summary"),
  aiQuestions: jsonb("ai_questions"),
  // Duplicate detection: id of an existing application this one likely duplicates.
  duplicateOf: varchar("duplicate_of", { length: 36 }),
  createdAt: text("created_at").notNull(),
});

export const insertJobApplicationSchema = createInsertSchema(jobApplications).omit({ id: true, reviewedBy: true, reviewedAt: true });
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplications.$inferSelect;

// Candidate Profiles table (for self-signup employees)
export const candidateProfiles = pgTable("candidate_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().unique().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
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
  // ── Phase 3 Recruitment AI (all nullable / additive / back-compatible) ──────
  resumeText: text("resume_text"),
  parsedResume: jsonb("parsed_resume"),
  aiSummary: text("ai_summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertCandidateProfileSchema = createInsertSchema(candidateProfiles).omit({ id: true });
export type InsertCandidateProfile = z.infer<typeof insertCandidateProfileSchema>;
export type CandidateProfile = typeof candidateProfiles.$inferSelect;

export const previousExperiences = pgTable("previous_experiences", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
  candidateProfileId: varchar("candidate_profile_id", { length: 36 }).references((): AnyPgColumn => candidateProfiles.id, { onDelete: "cascade" }),
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
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("advance"),
  amount: integer("amount").notNull(),
  purpose: text("purpose"),
  requestDate: text("request_date").notNull(),
  status: text("status").notNull().default("pending"),
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
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
  userId: varchar("user_id", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  module: text("module").notNull(),
  canAccess: boolean("can_access").notNull().default(true),
  grantedBy: varchar("granted_by", { length: 36 }),
  updatedAt: text("updated_at").notNull(),
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ id: true });
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// Module Access Requests — user requests admin to grant access to an HR module.
// On approval, the corresponding `user_permissions` row is upserted with
// canAccess=true (always permanent — admin manually revokes).
export const moduleAccessRequests = pgTable("module_access_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  module: text("module").notNull(),
  // Specific actions requested within the module (e.g. ["create","edit"]).
  // NULL / empty array = full-module ("Select All") request.
  actions: text("actions").array(),
  status: text("status").notNull().default("pending"), // pending | approved | denied | revoked
  reason: text("reason"),                              // user-supplied justification
  decisionNote: text("decision_note"),                 // admin's note on approve/deny
  decidedBy: varchar("decided_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
});

export const insertModuleAccessRequestSchema = createInsertSchema(moduleAccessRequests).omit({
  id: true,
  status: true,
  decisionNote: true,
  decidedBy: true,
  decidedAt: true,
  createdAt: true,
});
export type InsertModuleAccessRequest = z.infer<typeof insertModuleAccessRequestSchema>;
export type ModuleAccessRequest = typeof moduleAccessRequests.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_notifications_user_read").on(table.userId, table.isRead),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Profile Update Requests — employee changes pending admin approval
export const profileUpdateRequests = pgTable("profile_update_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  requestData: text("request_data").notNull(), // JSON of ProfileData
  adminNote: text("admin_note"),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
});
export type ProfileUpdateRequest = typeof profileUpdateRequests.$inferSelect;

// Compliance Adjustments table — completely separate from payroll
export const complianceAdjustments = pgTable("compliance_adjustments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
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
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertComplianceAdjustmentSchema = createInsertSchema(complianceAdjustments).omit({ id: true });
export type InsertComplianceAdjustment = z.infer<typeof insertComplianceAdjustmentSchema>;
export type ComplianceAdjustment = typeof complianceAdjustments.$inferSelect;

// Contractor Master table (company-specific)
export const contractorMasters = pgTable("contractor_masters", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  contractorName: text("contractor_name").notNull(),
  contractorAddress: text("contractor_address"),
  serviceChargePercent: real("service_charge_percent").default(0),
  applicableCompliances: text("applicable_compliances").array(),
  status: text("status").notNull().default("active"),
});

export const insertContractorMasterSchema = createInsertSchema(contractorMasters).omit({ id: true });
export type InsertContractorMaster = z.infer<typeof insertContractorMasterSchema>;
export type ContractorMaster = typeof contractorMasters.$inferSelect;

// ─── CD Accounts (Credits & Billing) ──────────────────────────────────────────
export const cdAccounts = pgTable("cd_accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().unique().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  creditBalance: numeric("credit_balance", { precision: 14, scale: 4 }).notNull().default("0"),
  costPerEmployeePerDay: numeric("cost_per_employee_per_day", { precision: 10, scale: 4 }).notNull().default("15"),
  rateEffectiveFrom: text("rate_effective_from"),
  lowBalanceThreshold: numeric("low_balance_threshold", { precision: 14, scale: 4 }).notNull().default("1000"),
  allowNegative: boolean("allow_negative").notNull().default(false),
  negativeLimit: numeric("negative_limit", { precision: 14, scale: 4 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertCdAccountSchema = createInsertSchema(cdAccounts).omit({ id: true });
export type InsertCdAccount = z.infer<typeof insertCdAccountSchema>;
export type CdAccount = typeof cdAccounts.$inferSelect;

// ─── CD Transactions (Ledger) ─────────────────────────────────────────────────
export const cdTransactions = pgTable("cd_transactions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "credit" | "debit" | "adjustment"
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 4 }).notNull(),
  description: text("description").notNull(),
  referenceNo: text("reference_no"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
});
export const insertCdTransactionSchema = createInsertSchema(cdTransactions).omit({ id: true });
export type InsertCdTransaction = z.infer<typeof insertCdTransactionSchema>;
export type CdTransaction = typeof cdTransactions.$inferSelect;

// ─── Daily Billing Logs ───────────────────────────────────────────────────────
export const dailyBillingLogs = pgTable("daily_billing_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  date: text("date").notNull(),                    // YYYY-MM-DD
  employeeCount: integer("employee_count").notNull().default(0),
  ratePerDay: numeric("rate_per_day", { precision: 10, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  // One billing entry per company per day (also enables ON CONFLICT dedupe).
  uniqueIndex("daily_billing_logs_company_id_date_unique").on(table.companyId, table.date),
]);
export const insertDailyBillingLogSchema = createInsertSchema(dailyBillingLogs).omit({ id: true });
export type InsertDailyBillingLog = z.infer<typeof insertDailyBillingLogSchema>;
export type DailyBillingLog = typeof dailyBillingLogs.$inferSelect;

// ─── Invoices (Monthly Auto-Generated) ────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  periodMonth: text("period_month").notNull(),     // YYYY-MM
  periodFrom: text("period_from").notNull(),       // YYYY-MM-DD
  periodTo: text("period_to").notNull(),           // YYYY-MM-DD
  employeeCount: integer("employee_count").notNull().default(0),
  ratePerDay: numeric("rate_per_day", { precision: 10, scale: 4 }).notNull(),
  daysInPeriod: integer("days_in_period").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull(),
  status: text("status").notNull().default("credited"), // "credited" | "pending" | "cancelled"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ─── Payment Submissions (company-reported payments, reviewed by super admin) ──
export const paymentSubmissions = pgTable("payment_submissions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),         // YYYY-MM-DD
  referenceNo: text("reference_no").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  reviewNote: text("review_note"),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  reviewedAt: text("reviewed_at"),
  creditedAt: text("credited_at"),
  submittedBy: varchar("submitted_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
});
export const insertPaymentSubmissionSchema = createInsertSchema(paymentSubmissions).omit({ id: true });
export type InsertPaymentSubmission = z.infer<typeof insertPaymentSubmissionSchema>;
export type PaymentSubmission = typeof paymentSubmissions.$inferSelect;

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expenseCategories = ["travel", "food", "accommodation", "medical", "office_supplies", "client_entertainment", "other"] as const;
export type ExpenseCategory = typeof expenseCategories[number];

export const expenseStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export type ExpenseStatus = typeof expenseStatuses[number];

export const expenses = pgTable("expenses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  category: text("category").notNull().default("other"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  receiptNote: text("receipt_note"),
  status: text("status").notNull().default("submitted"),
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: text("created_at").notNull(),
});
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// ─── Leave Adjustments ────────────────────────────────────────────────────────
export const leaveAdjustments = pgTable("leave_adjustments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  leaveTypeId: varchar("leave_type_id", { length: 36 }).notNull().references((): AnyPgColumn => leaveTypes.id, { onDelete: "restrict" }),
  adjustmentType: text("adjustment_type").notNull().default("credit"), // "credit" | "debit"
  days: numeric("days", { precision: 6, scale: 1 }).notNull(),
  reason: text("reason").notNull(),
  adjustedBy: varchar("adjusted_by", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull(),
});
export const insertLeaveAdjustmentSchema = createInsertSchema(leaveAdjustments).omit({ id: true });
export type InsertLeaveAdjustment = z.infer<typeof insertLeaveAdjustmentSchema>;
export type LeaveAdjustment = typeof leaveAdjustments.$inferSelect;

// ─── Comp-Off Applications ────────────────────────────────────────────────────
export const compOffApplications = pgTable("comp_off_applications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  workedDate: text("worked_date").notNull(),
  workedType: text("worked_type").notNull().default("weekly_off"), // "weekly_off" | "holiday" | "extra_shift"
  creditedDays: numeric("credited_days", { precision: 4, scale: 1 }).notNull().default("1"),
  purpose: text("purpose").notNull(),
  compensatoryDate: text("compensatory_date"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: text("created_at").notNull(),
});
export const insertCompOffSchema = createInsertSchema(compOffApplications).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertCompOff = z.infer<typeof insertCompOffSchema>;
export type CompOff = typeof compOffApplications.$inferSelect;

// ─── KRA & KPI System ─────────────────────────────────────────────────────────

// KRA Templates (reusable at company level)
export const kraTemplates = pgTable("kra_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  department: text("department"),
  reviewPeriodType: text("review_period_type").notNull().default("annual"), // "quarterly" | "half_yearly" | "annual" | "custom"
  status: text("status").notNull().default("active"), // "active" | "inactive"
  createdAt: text("created_at").notNull(),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});
export const insertKraTemplateSchema = createInsertSchema(kraTemplates).omit({ id: true });
export type InsertKraTemplate = z.infer<typeof insertKraTemplateSchema>;
export type KraTemplate = typeof kraTemplates.$inferSelect;

// KPI Metrics within a KRA Template
export const kraTemplateKpis = pgTable("kra_template_kpis", {
  id: varchar("id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull().references((): AnyPgColumn => kraTemplates.id, { onDelete: "cascade" }),
  kpiName: text("kpi_name").notNull(),
  description: text("description"),
  weightage: real("weightage").notNull().default(0), // percentage, all KPIs in template should sum to 100
  measurementUnit: text("measurement_unit").default("number"), // "number" | "percentage" | "currency" | "boolean"
  targetValue: real("target_value").default(100),
  sortOrder: integer("sort_order").default(0),
});
export const insertKraTemplateKpiSchema = createInsertSchema(kraTemplateKpis).omit({ id: true });
export type InsertKraTemplateKpi = z.infer<typeof insertKraTemplateKpiSchema>;
export type KraTemplateKpi = typeof kraTemplateKpis.$inferSelect;

// KRA Assignments (assigned to an employee for a specific period)
export const kraAssignments = pgTable("kra_assignments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  templateId: varchar("template_id", { length: 36 }).references((): AnyPgColumn => kraTemplates.id, { onDelete: "set null" }), // optional – can be a custom assignment
  title: text("title").notNull(),
  reviewPeriod: text("review_period").notNull().default("annual"), // "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "annual" | "custom"
  periodYear: integer("period_year").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("draft"), // "draft" | "active" | "under_review" | "completed"
  managerId: varchar("manager_id", { length: 36 }),
  selfScore: real("self_score"),     // weighted total from self review
  managerScore: real("manager_score"), // weighted total from manager review
  totalScore: real("total_score"),   // final accepted score (0–100)
  feedback: text("feedback"),
  createdAt: text("created_at").notNull(),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});
export const insertKraAssignmentSchema = createInsertSchema(kraAssignments).omit({ id: true });
export type InsertKraAssignment = z.infer<typeof insertKraAssignmentSchema>;
export type KraAssignment = typeof kraAssignments.$inferSelect;

// KPI line-items copied into each assignment (with actuals & scores)
export const kraAssignmentKpis = pgTable("kra_assignment_kpis", {
  id: varchar("id", { length: 36 }).primaryKey(),
  assignmentId: varchar("assignment_id", { length: 36 }).notNull().references((): AnyPgColumn => kraAssignments.id, { onDelete: "cascade" }),
  kpiName: text("kpi_name").notNull(),
  description: text("description"),
  weightage: real("weightage").notNull().default(0),
  measurementUnit: text("measurement_unit").default("number"),
  targetValue: real("target_value").default(100),
  actualValue: real("actual_value"),              // entered by employee or manager
  selfScore: real("self_score"),                   // 0–100 entered by employee
  managerScore: real("manager_score"),             // 0–100 entered by manager (overrides auto)
  computedScore: real("computed_score"),           // auto-calculated final score for this KPI
  sortOrder: integer("sort_order").default(0),
});
export const insertKraAssignmentKpiSchema = createInsertSchema(kraAssignmentKpis).omit({ id: true });
export type InsertKraAssignmentKpi = z.infer<typeof insertKraAssignmentKpiSchema>;
export type KraAssignmentKpi = typeof kraAssignmentKpis.$inferSelect;

// ─── EPFO & ESIC Automation ───────────────────────────────────────────────────

// Automation job statuses
export const automationJobStatuses = ["pending", "running", "paused", "completed", "failed", "cancelled"] as const;
export type AutomationJobStatus = typeof automationJobStatuses[number];

// Automation job types
export const automationJobTypes = [
  // EPFO
  "epfo_uan_generate",
  "epfo_kyc_aadhaar",
  "epfo_kyc_pan",
  "epfo_kyc_bank",
  "epfo_ecr_file",
  "epfo_challan_download",
  "epfo_trrn_track",
  "epfo_passbook_status",
  "epfo_exit_management",
  "epfo_bulk_register",
  "epfo_bulk_ecr",
  "epfo_login_test",
  // ESIC
  "esic_ip_generate",
  "esic_family_declaration",
  "esic_monthly_file",
  "esic_challan_download",
  "esic_temp_card_download",
  "esic_pehchan_card_download",
  "esic_employee_search",
  "esic_employee_list",
  "esic_contribution_tracking",
  "esic_bulk_register",
  "esic_login_test",
  // EPFO
  "epfo_employee_list",
] as const;
export type AutomationJobType = typeof automationJobTypes[number];

// Automation Jobs (queue table)
export const automationJobs = pgTable("automation_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  screenshotPath: text("screenshot_path"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  scheduledAt: text("scheduled_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_automation_jobs_company_type_status").on(table.companyId, table.jobType, table.status),
  index("idx_automation_jobs_type_status_completed").on(table.jobType, table.status, table.completedAt),
]);
export const insertAutomationJobSchema = createInsertSchema(automationJobs).omit({ id: true });
export type InsertAutomationJob = z.infer<typeof insertAutomationJobSchema>;
export type AutomationJob = typeof automationJobs.$inferSelect;

// Automation Logs (detailed activity log per job)
export const automationLogLevels = ["info", "warn", "error", "debug"] as const;
export type AutomationLogLevel = typeof automationLogLevels[number];

export const automationLogs = pgTable("automation_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobId: varchar("job_id", { length: 36 }).notNull().references((): AnyPgColumn => automationJobs.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_automation_logs_job").on(table.jobId),
]);
export const insertAutomationLogSchema = createInsertSchema(automationLogs).omit({ id: true });
export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;
export type AutomationLog = typeof automationLogs.$inferSelect;

// Portal Sessions (encrypted browser cookies per company per portal)
export const portalTypes = ["epfo", "esic"] as const;
export type PortalType = typeof portalTypes[number];

export const portalSessions = pgTable("portal_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  portal: text("portal").notNull(), // "epfo" | "esic"
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryptedCookies: text("encrypted_cookies"),
  lastLoginAt: text("last_login_at"),
  sessionValidUntil: text("session_valid_until"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertPortalSessionSchema = createInsertSchema(portalSessions).omit({ id: true });
export type InsertPortalSession = z.infer<typeof insertPortalSessionSchema>;
export type PortalSession = typeof portalSessions.$inferSelect;

// EPFO Registrations
export const epfoRegistrationStatuses = ["pending", "submitted", "uan_generated", "kyc_pending", "kyc_done", "failed"] as const;
export type EpfoRegistrationStatus = typeof epfoRegistrationStatuses[number];

export const epfoRegistrations = pgTable("epfo_registrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  uan: text("uan"),
  pfCode: text("pf_code"),
  memberIdAtEpfo: text("member_id_at_epfo"),
  status: text("status").notNull().default("pending"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  submittedAt: text("submitted_at"),
  uanGeneratedAt: text("uan_generated_at"),
  errorMessage: text("error_message"),
  remarks: text("remarks"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertEpfoRegistrationSchema = createInsertSchema(epfoRegistrations).omit({ id: true });
export type InsertEpfoRegistration = z.infer<typeof insertEpfoRegistrationSchema>;
export type EpfoRegistration = typeof epfoRegistrations.$inferSelect;

// EPFO KYC Records
export const epfoKycTypes = ["aadhaar", "pan", "bank"] as const;
export type EpfoKycType = typeof epfoKycTypes[number];

export const epfoKycStatuses = ["pending", "submitted", "approved", "rejected", "failed"] as const;

export const epfoKycRecords = pgTable("epfo_kyc_records", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  uan: text("uan"),
  kycType: text("kyc_type").notNull(), // aadhaar | pan | bank
  status: text("status").notNull().default("pending"),
  documentNumber: text("document_number"), // masked Aadhaar / PAN / account no.
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertEpfoKycRecordSchema = createInsertSchema(epfoKycRecords).omit({ id: true });
export type InsertEpfoKycRecord = z.infer<typeof insertEpfoKycRecordSchema>;
export type EpfoKycRecord = typeof epfoKycRecords.$inferSelect;

// EPFO ECR Returns
export const epfoEcrStatuses = ["pending", "filed", "challan_generated", "paid", "failed"] as const;

export const epfoEcrReturns = pgTable("epfo_ecr_returns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // "January" … "December"
  year: integer("year").notNull(),
  totalEmployees: integer("total_employees").default(0),
  totalPfWages: integer("total_pf_wages").default(0),
  totalEmployeeContribution: integer("total_employee_contribution").default(0),
  totalEmployerContribution: integer("total_employer_contribution").default(0),
  totalAmount: integer("total_amount").default(0),
  trrn: text("trrn"),
  challanNo: text("challan_no"),
  status: text("status").notNull().default("pending"),
  ecrFilePath: text("ecr_file_path"),
  challanFilePath: text("challan_file_path"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  filedAt: text("filed_at"),
  dueDate: text("due_date"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertEpfoEcrReturnSchema = createInsertSchema(epfoEcrReturns).omit({ id: true });
export type InsertEpfoEcrReturn = z.infer<typeof insertEpfoEcrReturnSchema>;
export type EpfoEcrReturn = typeof epfoEcrReturns.$inferSelect;

// ESIC Registrations
export const esicRegistrationStatuses = ["pending", "submitted", "ip_generated", "failed"] as const;

export const esicRegistrations = pgTable("esic_registrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  ipNumber: text("ip_number"),
  esicCode: text("esic_code"),
  status: text("status").notNull().default("pending"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  submittedAt: text("submitted_at"),
  ipGeneratedAt: text("ip_generated_at"),
  errorMessage: text("error_message"),
  remarks: text("remarks"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertEsicRegistrationSchema = createInsertSchema(esicRegistrations).omit({ id: true });
export type InsertEsicRegistration = z.infer<typeof insertEsicRegistrationSchema>;
export type EsicRegistration = typeof esicRegistrations.$inferSelect;

// ESIC Monthly Returns
export const esicReturnStatuses = ["pending", "filed", "challan_generated", "paid", "failed"] as const;

export const esicMonthlyReturns = pgTable("esic_monthly_returns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  totalEmployees: integer("total_employees").default(0),
  totalEsicWages: integer("total_esic_wages").default(0),
  totalEmployeeContribution: integer("total_employee_contribution").default(0),
  totalEmployerContribution: integer("total_employer_contribution").default(0),
  totalAmount: integer("total_amount").default(0),
  challanNo: text("challan_no"),
  status: text("status").notNull().default("pending"),
  returnFilePath: text("return_file_path"),
  challanFilePath: text("challan_file_path"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  filedAt: text("filed_at"),
  dueDate: text("due_date"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertEsicMonthlyReturnSchema = createInsertSchema(esicMonthlyReturns).omit({ id: true });
export type InsertEsicMonthlyReturn = z.infer<typeof insertEsicMonthlyReturnSchema>;
export type EsicMonthlyReturn = typeof esicMonthlyReturns.$inferSelect;

// Challans (unified for EPFO & ESIC)
export const challanPortals = ["epfo", "esic"] as const;
export const challanStatuses = ["generated", "paid", "cancelled"] as const;

export const challans = pgTable("challans", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  portal: text("portal").notNull(), // "epfo" | "esic"
  month: text("month").notNull(),
  year: integer("year").notNull(),
  challanNo: text("challan_no"),
  trrn: text("trrn"),
  amount: integer("amount").default(0),
  dueDate: text("due_date"),
  paidDate: text("paid_date"),
  status: text("status").notNull().default("generated"),
  filePath: text("file_path"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertChallanSchema = createInsertSchema(challans).omit({ id: true });
export type InsertChallan = z.infer<typeof insertChallanSchema>;
export type Challan = typeof challans.$inferSelect;

// Compliance Calendar Events
export const complianceCalendarEventTypes = ["epfo_ecr_due", "esic_return_due", "pt_due", "lwf_due", "tds_due", "custom"] as const;
export type ComplianceCalendarEventType = typeof complianceCalendarEventTypes[number];

export const complianceCalendarEvents = pgTable("compliance_calendar_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: text("due_date").notNull(),
  periodMonth: text("period_month"), // "January" … "December"
  periodYear: integer("period_year"),
  status: text("status").notNull().default("upcoming"), // upcoming | completed | overdue | waived
  relatedReturnId: varchar("related_return_id", { length: 36 }),
  createdBy: varchar("created_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertComplianceCalendarEventSchema = createInsertSchema(complianceCalendarEvents).omit({ id: true });
export type InsertComplianceCalendarEvent = z.infer<typeof insertComplianceCalendarEventSchema>;
export type ComplianceCalendarEvent = typeof complianceCalendarEvents.$inferSelect;

// ─── Outdoor Duty Entries ─────────────────────────────────────────────────────
export const outdoorEntries = pgTable("outdoor_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  checkOutTime: text("check_out_time"),
  checkInTime: text("check_in_time"),
  purpose: text("purpose").notNull(),
  location: text("location"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  approvedBy: varchar("approved_by", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: text("created_at").notNull(),
});
export const insertOutdoorEntrySchema = createInsertSchema(outdoorEntries).omit({ id: true, approvedBy: true, approvedAt: true });
export type InsertOutdoorEntry = z.infer<typeof insertOutdoorEntrySchema>;
export type OutdoorEntry = typeof outdoorEntries.$inferSelect;

// ─── ESIC Fetched Employees (from portal) ─────────────────────────────────────
export const esicFetchedEmployees = pgTable("esic_fetched_employees", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  ipNo: text("ip_no").notNull(),
  name: text("name").notNull(),
  dateOfRegistration: text("date_of_registration"),
  jobId: varchar("job_id", { length: 36 }).references((): AnyPgColumn => automationJobs.id, { onDelete: "set null" }),
  fetchedAt: text("fetched_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_esic_fetched_company").on(table.companyId),
]);
export const insertEsicFetchedEmployeeSchema = createInsertSchema(esicFetchedEmployees).omit({ id: true });
export type InsertEsicFetchedEmployee = z.infer<typeof insertEsicFetchedEmployeeSchema>;
export type EsicFetchedEmployee = typeof esicFetchedEmployees.$inferSelect;

// ─── AI HR Assistant ──────────────────────────────────────────────────────────

export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  sessionType: text("session_type").notNull().default("kyc"),
  status: text("status").notNull().default("active"),
  language: text("language").notNull().default("english"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({ id: true });
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiConversation = typeof aiConversations.$inferSelect;

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references((): AnyPgColumn => aiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: json("attachments"),
  createdAt: text("created_at").notNull(),
});
export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({ id: true });
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;

export const aiFollowUpTasks = pgTable("ai_follow_up_tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("pending"),
  dayNumber: integer("day_number").notNull().default(1),
  remindersSent: integer("reminders_sent").notNull().default(0),
  lastReminderAt: text("last_reminder_at"),
  nextReminderAt: text("next_reminder_at").notNull(),
  escalatedAt: text("escalated_at"),
  escalatedTo: varchar("escalated_to", { length: 36 }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  metadata: json("metadata"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertAiFollowUpTaskSchema = createInsertSchema(aiFollowUpTasks).omit({ id: true });
export type InsertAiFollowUpTask = z.infer<typeof insertAiFollowUpTaskSchema>;
export type AiFollowUpTask = typeof aiFollowUpTasks.$inferSelect;

// AI usage/observability log — additive, intentionally has NO foreign keys so it
// can be written best-effort without coupling to other tables' lifecycles.
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  companyId: varchar("company_id", { length: 36 }),
  employeeId: varchar("employee_id", { length: 36 }),
  // Phase 2: who/what for AI-assistant action auditing (all nullable & additive
  // so legacy usage rows and best-effort recording keep working unchanged).
  userId: varchar("user_id", { length: 36 }),
  intent: text("intent"),
  module: text("module"),
  action: text("action"),
  feature: text("feature").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  latencyMs: integer("latency_ms").notNull().default(0),
  success: boolean("success").notNull().default(true),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});
export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({ id: true });
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

export const kycSubmissionStatus = pgTable("kyc_submission_status", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull().unique().references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
  companyId: varchar("company_id", { length: 36 }).notNull().references((): AnyPgColumn => companies.id, { onDelete: "cascade" }),
  aadhaarSubmitted: boolean("aadhaar_submitted").notNull().default(false),
  panSubmitted: boolean("pan_submitted").notNull().default(false),
  bankDetailsSubmitted: boolean("bank_details_submitted").notNull().default(false),
  cancelledChequeSubmitted: boolean("cancelled_cheque_submitted").notNull().default(false),
  addressProofSubmitted: boolean("address_proof_submitted").notNull().default(false),
  photographSubmitted: boolean("photograph_submitted").notNull().default(false),
  aadhaarVerified: boolean("aadhaar_verified").notNull().default(false),
  panVerified: boolean("pan_verified").notNull().default(false),
  bankVerified: boolean("bank_verified").notNull().default(false),
  overallStatus: text("overall_status").notNull().default("pending"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertKycSubmissionStatusSchema = createInsertSchema(kycSubmissionStatus).omit({ id: true });
export type InsertKycSubmissionStatus = z.infer<typeof insertKycSubmissionStatusSchema>;
export type KycSubmissionStatus = typeof kycSubmissionStatus.$inferSelect;
