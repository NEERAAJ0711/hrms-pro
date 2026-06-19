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
  profileUpdateRequests,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, count, or } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "crypto";

// EmployeeRepository — DB access for the Employee domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class EmployeeRepository {
  async getEmployee(id: string): Promise<Employee | undefined> {
    const result = await db.select().from(employees).where(eq(employees.id, id));
    return result[0];
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    // Primary: direct userId match
    const result = await db.select().from(employees).where(eq(employees.userId, userId));
    if (result[0]) return result[0];

    // Fallback: match via the user's email → employee's officialEmail
    // (covers employees created before the userId-link system)
    const userRow = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const email = userRow[0]?.email;
    if (!email) return undefined;

    const byEmail = await db
      .select()
      .from(employees)
      .where(eq(employees.officialEmail, email))
      .limit(1);

    if (byEmail[0]) {
      // Auto-link so future lookups hit the fast path
      await db.update(employees).set({ userId }).where(eq(employees.id, byEmail[0].id));
      return { ...byEmail[0], userId };
    }

    return undefined;
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

  async linkPunchLogsToEmployee(employeeId: string | string[], devicePin: string, companyId: string): Promise<void> {
    await db.execute(sql`
      UPDATE biometric_punch_logs
      SET employee_id = ${employeeId}
      WHERE device_employee_id = ${devicePin}
        AND company_id = ${companyId}
        AND employee_id IS NULL
    `);
  }

  async getEmployeeDocuments(employeeId: string | string[]) {
    return await db.execute(sql`
      SELECT id, doc_type, file_name, file_path, file_size, mime_type, created_at
      FROM employee_documents
      WHERE employee_id = ${employeeId}
      ORDER BY doc_type, created_at DESC
    `);
  }

  async getEmployeeCompanyIdRow(employeeId: string | string[]) {
    return await db.execute(sql`SELECT company_id FROM employees WHERE id = ${employeeId} LIMIT 1`);
  }

  async insertEmployeeDocument(params: {
    id: string;
    employeeId: string | string[];
    companyId: any;
    docType: any;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    createdBy: any;
    now: string;
  }): Promise<void> {
    await db.execute(sql`
      INSERT INTO employee_documents (id, employee_id, company_id, doc_type, file_name, file_path, file_size, mime_type, created_by, created_at, updated_at)
      VALUES (${params.id}, ${params.employeeId}, ${params.companyId}, ${params.docType}, ${params.fileName}, ${params.filePath}, ${params.fileSize}, ${params.mimeType}, ${params.createdBy}, ${params.now}, ${params.now})
    `);
  }

  async getEmployeeDocumentForDelete(docId: string | string[], employeeId: string | string[]) {
    return await db.execute(sql`SELECT file_path FROM employee_documents WHERE id = ${docId} AND employee_id = ${employeeId} LIMIT 1`);
  }

  async deleteEmployeeDocument(docId: string | string[]): Promise<void> {
    await db.execute(sql`DELETE FROM employee_documents WHERE id = ${docId}`);
  }

  async cancelPendingProfileUpdateRequests(userId: string): Promise<void> {
    await db.update(profileUpdateRequests)
      .set({ status: "cancelled" })
      .where(and(
        eq(profileUpdateRequests.userId, userId),
        eq(profileUpdateRequests.status, "pending")
      ));
  }

  async createProfileUpdateRequest(values: any) {
    return await db.insert(profileUpdateRequests).values(values).returning();
  }

  // Auto-link an employee record to a freshly-authenticated user on login.
  // Verbatim move of the login auto-link sequence (already-linked check + three
  // match strategies + link update). Returns the linked employee, or null when
  // already linked or no match was found, so the caller can log identically.
  async autoLinkUserToEmployee(params: {
    userId: string;
    companyId: string;
    email: any;
    firstName: any;
    lastName: any;
    username: any;
  }): Promise<any | null> {
    const { userId, companyId, email, firstName, lastName, username } = params;
    const alreadyLinked = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.userId, userId), eq(employees.companyId, companyId)))
      .limit(1);

    if (alreadyLinked[0]) return null;

    // Strategy 1: match by user email → employee officialEmail
    let empToLink = (
      await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.officialEmail, email),
            eq(employees.companyId, companyId),
            isNull(employees.userId),
          ),
        )
        .limit(1)
    )[0];

    // Strategy 2: match by username → employeeCode (common in HR setups)
    if (!empToLink && username) {
      empToLink = (
        await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.employeeCode, username),
              eq(employees.companyId, companyId),
              isNull(employees.userId),
            ),
          )
          .limit(1)
      )[0];
    }

    // Strategy 3: match by first+last name within company (last resort)
    if (!empToLink && firstName && lastName) {
      empToLink = (
        await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.firstName, firstName),
              eq(employees.lastName, lastName),
              eq(employees.companyId, companyId),
              isNull(employees.userId),
            ),
          )
          .limit(1)
      )[0];
    }

    if (empToLink) {
      await db
        .update(employees)
        .set({ userId })
        .where(eq(employees.id, empToLink.id));
      return empToLink;
    }
    return null;
  }

  async getPendingProfileUpdateRequest(userId: string) {
    return await db.select().from(profileUpdateRequests)
      .where(and(
        eq(profileUpdateRequests.userId, userId),
        eq(profileUpdateRequests.status, "pending")
      ))
      .orderBy(desc(profileUpdateRequests.createdAt))
      .limit(1);
  }

  async getAllProfileUpdateRequests() {
    return await db.select().from(profileUpdateRequests)
      .orderBy(desc(profileUpdateRequests.createdAt));
  }

  async getProfileUpdateRequestById(id: string) {
    return await db.select().from(profileUpdateRequests)
      .where(eq(profileUpdateRequests.id, id)).limit(1);
  }

  async updateProfileUpdateRequest(id: string, values: any): Promise<void> {
    await db.update(profileUpdateRequests).set(values).where(eq(profileUpdateRequests.id, id));
  }
}
