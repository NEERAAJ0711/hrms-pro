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
}
