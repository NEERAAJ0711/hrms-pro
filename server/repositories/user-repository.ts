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
import { eq, and, isNull, desc, sql, count, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "crypto";

// UserRepository — DB access for the User domain (Task #5 Phase B).
// Methods moved verbatim from the former DatabaseStorage; behavior unchanged.
export class UserRepository {
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

  async createModuleAccessRequest(data: { userId: string; companyId: string | null; module: string; actions?: string[] | null; reason?: string | null }): Promise<ModuleAccessRequest> {
    const id = randomUUID();
    const row = {
      id,
      userId: data.userId,
      companyId: data.companyId,
      module: data.module,
      actions: data.actions && data.actions.length > 0 ? data.actions : null,
      status: "pending",
      reason: data.reason ?? null,
      decisionNote: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    const inserted = await db.insert(moduleAccessRequests).values(row).returning();
    return inserted[0];
  }

  async getModuleAccessRequest(id: string): Promise<ModuleAccessRequest | undefined> {
    const r = await db.select().from(moduleAccessRequests).where(eq(moduleAccessRequests.id, id));
    return r[0];
  }

  async listModuleAccessRequests(filters: { companyId?: string; userId?: string; status?: string }): Promise<ModuleAccessRequest[]> {
    const conds: any[] = [];
    if (filters.companyId) conds.push(eq(moduleAccessRequests.companyId, filters.companyId));
    if (filters.userId)    conds.push(eq(moduleAccessRequests.userId, filters.userId));
    if (filters.status)    conds.push(eq(moduleAccessRequests.status, filters.status));
    const q = conds.length === 0
      ? db.select().from(moduleAccessRequests)
      : db.select().from(moduleAccessRequests).where(and(...conds));
    return await q.orderBy(desc(moduleAccessRequests.createdAt));
  }

  async decideModuleAccessRequest(id: string, status: "approved" | "denied" | "revoked", decidedBy: string, decisionNote?: string | null): Promise<ModuleAccessRequest | undefined> {
    const result = await db.update(moduleAccessRequests)
      .set({ status, decidedBy, decidedAt: new Date().toISOString(), decisionNote: decisionNote ?? null })
      .where(eq(moduleAccessRequests.id, id))
      .returning();
    return result[0];
  }

  async findPendingModuleAccessRequest(userId: string, module: string): Promise<ModuleAccessRequest | undefined> {
    const r = await db.select().from(moduleAccessRequests).where(
      and(
        eq(moduleAccessRequests.userId, userId),
        eq(moduleAccessRequests.module, module),
        eq(moduleAccessRequests.status, "pending"),
      )
    );
    return r[0];
  }

  async deleteModuleAccessRequest(id: string): Promise<boolean> {
    const result = await db.delete(moduleAccessRequests)
      .where(eq(moduleAccessRequests.id, id))
      .returning({ id: moduleAccessRequests.id });
    return result.length > 0;
  }

  async insertSignupCompany(companyId: string, companyName: string, today: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, company_name, legal_name, status, trial_start_date, trial_days, trial_extended_days)
      VALUES (${companyId}, ${companyName}, ${companyName}, 'active', ${today}, 3, 0)
    `);
  }

  async insertSignupUser(userId: string, username: string, email: string, password: string, firstName: string, lastName: string, companyId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO users (id, username, email, password, first_name, last_name, role, company_id, status)
      VALUES (${userId}, ${username}, ${email}, ${password}, ${firstName || ""}, ${lastName || ""}, 'company_admin', ${companyId}, 'active')
    `);
  }

  async getAuditLogs(action: string | undefined, limit: number) {
    return await db.execute(
      sql`SELECT id, action, user_id, user_name, details, created_at FROM audit_logs ${action ? sql`WHERE action = ${action}` : sql``} ORDER BY created_at DESC LIMIT ${limit}`
    );
  }

  async revokeModuleActionPermissions(targetUserId: string, module: string, grantedBy: string): Promise<void> {
    await db.execute(sql`
      UPDATE user_permissions
         SET can_access = false,
             granted_by = ${grantedBy},
             updated_at = ${new Date().toISOString()}
       WHERE user_id = ${targetUserId}
         AND module LIKE ${module + ':%'}
         AND can_access = true
    `);
  }

  async revokeApprovedModuleRequests(targetUserId: string, module: string, decidedBy: string): Promise<void> {
    await db.execute(sql`
      UPDATE module_access_requests
         SET status = 'revoked',
             decided_by = ${decidedBy},
             decided_at = ${new Date().toISOString()}
       WHERE user_id = ${targetUserId}
         AND module = ${module}
         AND status = 'approved'
    `);
  }

  async getUserIdByEmail(email: string): Promise<{ id: string }[]> {
    return await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  }

  async getUsersByRoles(roles: string[]): Promise<{ id: string; role: string; companyId: string | null }[]> {
    return await db.select({ id: users.id, role: users.role, companyId: users.companyId })
      .from(users)
      .where(inArray(users.role, roles));
  }
}
