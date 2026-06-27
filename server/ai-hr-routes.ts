// AI HR Assistant Routes
import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  aiConversations,
  aiMessages,
  aiFollowUpTasks,
  kycSubmissionStatus,
  employees,
  users as usersTable,
  notifications,
  payroll,
  leaveRequests,
  leaveTypes,
  attendance,
  salaryStructures,
  loanAdvances,
  kraAssignments,
  kraAssignmentKpis,
} from "../shared/schema";
import { eq, and, desc, sql, or, ne, count, gte, lte, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { generateAiReply, computeKycOverallStatus, createFollowUpTask, startAiFollowUpScheduler, generateComplianceReply, analyzeJobError, extractKycDocument, isKycExtractable, extractProfileFromText, type EmployeeContext } from "./ai-service";
import { handleAssistantQuery, buildActor } from "./ai";
import { createNotification } from "./notifications";
import { sendKycReminderEmail, sendAiFollowUpEmail } from "./services/email-service";
import { mapExtractionToUpdates, checkConversationAccess } from "./ai-extraction";

// ─── Multer for KYC document uploads ─────────────────────────────────────────

const kycDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "kyc-docs");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const kycUpload = multer({
  storage: kycDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".pdf", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// requireAuth is injected by routes.ts (uses session-based auth, not Passport)
// requireHR checks that the logged-in user has an HR-level role
function requireHR(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!["super_admin", "company_admin", "hr_admin"].includes(user?.role)) {
    return res.status(403).json({ message: "HR access required" });
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getOrCreateKycStatus(employeeId: string, companyId: string) {
  const existing = await db
    .select()
    .from(kycSubmissionStatus)
    .where(eq(kycSubmissionStatus.employeeId, employeeId))
    .limit(1);

  if (existing[0]) return existing[0];

  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    employeeId,
    companyId,
    aadhaarSubmitted: false,
    panSubmitted: false,
    bankDetailsSubmitted: false,
    cancelledChequeSubmitted: false,
    addressProofSubmitted: false,
    photographSubmitted: false,
    aadhaarVerified: false,
    panVerified: false,
    bankVerified: false,
    overallStatus: "pending",
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(kycSubmissionStatus).values(record);
  return record;
}

// ─── Fetch live employee data for AI context ──────────────────────────────────
export async function fetchEmployeeContext(employeeId: string, companyId: string): Promise<EmployeeContext> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const monthStart = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;

  // Run all independent DB queries in parallel for speed
  const [
    rawPayslips,
    allLeaveTypes,
    allLeaveReqs,
    monthAttendance,
    rawSalaryStructure,
    rawLoans,
    rawKraAssignments,
    empRow,
  ] = await Promise.all([
    // Recent payslips (last 3)
    db.select().from(payroll)
      .where(and(eq(payroll.employeeId, employeeId), eq(payroll.companyId, companyId)))
      .orderBy(desc(payroll.year), desc(payroll.generatedAt))
      .limit(3),
    // Leave types
    db.select().from(leaveTypes)
      .where(and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.status, "active"))),
    // Leave requests (current year)
    db.select().from(leaveRequests).where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.companyId, companyId),
        gte(leaveRequests.startDate, `${currentYear}-01-01`),
        lte(leaveRequests.endDate, `${currentYear}-12-31`),
      ),
    ),
    // Attendance (current month)
    db.select().from(attendance).where(
      and(
        eq(attendance.employeeId, employeeId),
        eq(attendance.companyId, companyId),
        gte(attendance.date, monthStart),
        lte(attendance.date, monthEnd),
      ),
    ),
    // Active salary structure (most recent)
    db.select().from(salaryStructures)
      .where(and(eq(salaryStructures.employeeId, employeeId), eq(salaryStructures.companyId, companyId), eq(salaryStructures.status, "active")))
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1),
    // Loan & advances
    db.select().from(loanAdvances)
      .where(and(eq(loanAdvances.employeeId, employeeId), eq(loanAdvances.companyId, companyId)))
      .orderBy(desc(loanAdvances.createdAt))
      .limit(10),
    // KRA assignments (current year)
    db.select().from(kraAssignments)
      .where(and(eq(kraAssignments.employeeId, employeeId), eq(kraAssignments.companyId, companyId), eq(kraAssignments.periodYear, currentYear)))
      .orderBy(desc(kraAssignments.createdAt))
      .limit(5),
    // Employee row for static info (UAN, ESI, etc.)
    db.select().from(employees).where(eq(employees.id, employeeId)).limit(1),
  ]);

  // ── Employee Info ─────────────────────────────────────────────────────────
  const emp = empRow[0];
  const employeeInfo = emp ? {
    uan: emp.uan ?? null,
    esiNumber: emp.esiNumber ?? null,
    pan: emp.pan ?? null,
    pfApplicable: emp.pfApplicable ?? false,
    esiApplicable: emp.esiApplicable ?? false,
    otApplicable: emp.otApplicable ?? false,
    otRate: emp.otRate ?? null,
    designation: emp.designation ?? null,
    department: emp.department ?? null,
    dateOfJoining: emp.dateOfJoining ?? null,
  } : undefined;

  // ── Statutory / HRMS master profile (for ESIC, EPFO & HRMS completion) ──────
  const profile = emp ? {
    gender: emp.gender ?? null,
    dateOfBirth: emp.dateOfBirth ?? null,
    mobileNumber: emp.mobileNumber ?? null,
    officialEmail: emp.officialEmail ?? null,
    fatherHusbandName: emp.fatherHusbandName ?? null,
    uan: emp.uan ?? null,
    esiNumber: emp.esiNumber ?? null,
    pan: emp.pan ?? null,
    aadhaar: emp.aadhaar ?? null,
    bankAccount: emp.bankAccount ?? null,
    ifsc: emp.ifsc ?? null,
    presentAddress: emp.presentAddress ?? null,
    permanentAddress: emp.permanentAddress ?? null,
    maritalStatus: emp.maritalStatus ?? null,
    motherName: emp.motherName ?? null,
    bloodGroup: emp.bloodGroup ?? null,
    nomineeName: emp.nomineeName ?? null,
    nomineeRelation: emp.nomineeRelation ?? null,
    emergencyContactName: emp.emergencyContactName ?? null,
    emergencyContactNumber: emp.emergencyContactNumber ?? null,
  } : undefined;

  // ── Recent payslips ───────────────────────────────────────────────────────
  const recentPayslips = rawPayslips.map((p) => ({
    month: p.month,
    year: p.year,
    netSalary: p.netSalary ?? 0,
    grossSalary: (p.basicSalary ?? 0) + (p.hra ?? 0) + (p.conveyance ?? 0) + (p.medicalAllowance ?? 0) + (p.specialAllowance ?? 0) + (p.otherAllowances ?? 0) + (p.bonus ?? 0) + (p.otAmount ?? 0),
    totalDeductions: p.totalDeductions ?? 0,
    basicSalary: p.basicSalary ?? 0,
    hra: p.hra ?? 0,
    conveyance: p.conveyance ?? 0,
    medicalAllowance: p.medicalAllowance ?? 0,
    specialAllowance: p.specialAllowance ?? 0,
    otherAllowances: p.otherAllowances ?? 0,
    customEarnings: (p.customEarnings ?? {}) as Record<string, number>,
    pfEmployee: p.pfEmployee ?? 0,
    vpfAmount: p.vpfAmount ?? 0,
    esi: p.esi ?? 0,
    professionalTax: p.professionalTax ?? 0,
    lwfEmployee: p.lwfEmployee ?? 0,
    tds: p.tds ?? 0,
    otherDeductions: p.otherDeductions ?? 0,
    loanDeduction: p.loanDeduction ?? 0,
    customDeductions: (p.customDeductions ?? {}) as Record<string, number>,
    bonus: p.bonus ?? 0,
    otHours: String(p.otHours ?? "0"),
    otAmount: p.otAmount ?? 0,
    status: p.status,
    presentDays: String(p.presentDays ?? "0"),
    workingDays: p.workingDays ?? 0,
    leaveDays: p.leaveDays ?? 0,
    paidOn: p.paidOn ?? null,
  }));

  // ── Leave balance ─────────────────────────────────────────────────────────
  const leaveSummary = allLeaveTypes.map((lt) => {
    const reqs = allLeaveReqs.filter((r) => r.leaveTypeId === lt.id);
    const daysUsed = reqs.filter((r) => r.status === "approved").reduce((sum, r) => sum + parseFloat(String(r.days ?? 0)), 0);
    const daysPending = reqs.filter((r) => r.status === "pending").reduce((sum, r) => sum + parseFloat(String(r.days ?? 0)), 0);
    const daysAllowed = lt.daysPerYear ?? 0;
    return {
      leaveTypeName: lt.name,
      leaveTypeCode: lt.code,
      daysAllowed,
      daysUsed: Math.round(daysUsed * 10) / 10,
      daysPending: Math.round(daysPending * 10) / 10,
      daysAvailable: Math.max(0, Math.round((daysAllowed - daysUsed) * 10) / 10),
    };
  });

  // ── Attendance ────────────────────────────────────────────────────────────
  const presentDays = monthAttendance.filter((a) => a.status === "present").length;
  const absentDays = monthAttendance.filter((a) => a.status === "absent").length;
  const halfDays = monthAttendance.filter((a) => a.status === "half_day").length;
  const leaveDaysAtt = monthAttendance.filter((a) => a.status === "on_leave").length;

  // ── Salary Structure ──────────────────────────────────────────────────────
  const ss = rawSalaryStructure[0];
  const salaryStructure = ss ? {
    basicSalary: ss.basicSalary,
    hra: ss.hra ?? 0,
    conveyance: ss.conveyance ?? 0,
    medicalAllowance: ss.medicalAllowance ?? 0,
    specialAllowance: ss.specialAllowance ?? 0,
    otherAllowances: ss.otherAllowances ?? 0,
    customEarnings: (ss.customEarnings ?? {}) as Record<string, number>,
    grossSalary: ss.grossSalary,
    pfEmployee: ss.pfEmployee ?? 0,
    pfEmployer: ss.pfEmployer ?? 0,
    vpfAmount: ss.vpfAmount ?? 0,
    esi: ss.esi ?? 0,
    professionalTax: ss.professionalTax ?? 0,
    lwfEmployee: ss.lwfEmployee ?? 0,
    tds: ss.tds ?? 0,
    otherDeductions: ss.otherDeductions ?? 0,
    customDeductions: (ss.customDeductions ?? {}) as Record<string, number>,
    netSalary: ss.netSalary,
    effectiveFrom: ss.effectiveFrom,
  } : null;

  // ── Loan & Advances ───────────────────────────────────────────────────────
  const loanAdvancesList = rawLoans.map((la) => ({
    type: la.type,
    amount: la.amount,
    purpose: la.purpose ?? null,
    status: la.status,
    requestDate: la.requestDate,
    totalInstallments: la.totalInstallments ?? null,
    installmentAmount: la.installmentAmount ?? null,
    remainingBalance: la.remainingBalance ?? null,
    deductionStartMonth: la.deductionStartMonth ?? null,
  }));

  // ── KRA Assignments with KPIs ─────────────────────────────────────────────
  const kraList = await Promise.all(
    rawKraAssignments.map(async (ka) => {
      const kpis = await db.select().from(kraAssignmentKpis).where(eq(kraAssignmentKpis.assignmentId, ka.id));
      return {
        title: ka.title,
        reviewPeriod: ka.reviewPeriod,
        periodYear: ka.periodYear,
        status: ka.status,
        selfScore: ka.selfScore ?? null,
        managerScore: ka.managerScore ?? null,
        totalScore: ka.totalScore ?? null,
        feedback: ka.feedback ?? null,
        kpis: kpis.map((kpi) => ({
          kpiName: kpi.kpiName,
          weightage: kpi.weightage,
          targetValue: kpi.targetValue ?? null,
          actualValue: kpi.actualValue ?? null,
          selfScore: kpi.selfScore ?? null,
          managerScore: kpi.managerScore ?? null,
          computedScore: kpi.computedScore ?? null,
        })),
      };
    }),
  );

  return {
    employeeInfo,
    profile,
    recentPayslips,
    leaveSummary,
    currentMonthAttendance: {
      month: currentMonth,
      presentDays,
      absentDays,
      halfDays,
      leaveDays: leaveDaysAtt,
      totalRecords: monthAttendance.length,
    },
    salaryStructure,
    loanAdvances: loanAdvancesList,
    kraAssignments: kraList,
  };
}

export async function getEmployeeForUser(userId: string, companyId: string | null) {
  if (!companyId) return null;

  // Primary lookup: by userId field directly on the employee record
  const byUserId = await db
    .select()
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.companyId, companyId)))
    .limit(1);
  if (byUserId[0]) return byUserId[0];

  // Fallback: match via the user's email against officialEmail
  // (covers employees created before the userId-link system, or accounts
  //  where the admin hasn't run "Create Login" but the email matches)
  const userRow = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const userEmail = userRow[0]?.email;
  if (!userEmail) return null;

  const byEmail = await db
    .select()
    .from(employees)
    .where(and(eq(employees.officialEmail, userEmail), eq(employees.companyId, companyId)))
    .limit(1);

  if (byEmail[0]) {
    // Auto-link: set userId on the employee so future lookups are instant
    await db
      .update(employees)
      .set({ userId })
      .where(eq(employees.id, byEmail[0].id));
    return { ...byEmail[0], userId };
  }

  return null;
}

// ─── Route Registration ────────────────────────────────────────────────────────

export async function registerAiHrRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: Function) => void,
): Promise<void> {
  // ── Startup migrations: create AI tables if they don't exist yet ────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id            VARCHAR(36)  PRIMARY KEY,
      employee_id   VARCHAR(36)  NOT NULL,
      user_id       VARCHAR(36)  NOT NULL,
      company_id    VARCHAR(36)  NOT NULL,
      session_type  TEXT         NOT NULL DEFAULT 'kyc',
      status        TEXT         NOT NULL DEFAULT 'active',
      language      TEXT         NOT NULL DEFAULT 'english',
      created_at    TEXT         NOT NULL,
      updated_at    TEXT         NOT NULL
    )
  `).catch((err: any) => console.error("[AI HR migrations] ai_conversations:", err.message));

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id              VARCHAR(36) PRIMARY KEY,
      conversation_id VARCHAR(36) NOT NULL,
      role            TEXT        NOT NULL,
      content         TEXT        NOT NULL,
      attachments     JSONB,
      created_at      TEXT        NOT NULL
    )
  `).catch((err: any) => console.error("[AI HR migrations] ai_messages:", err.message));

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_follow_up_tasks (
      id               VARCHAR(36) PRIMARY KEY,
      employee_id      VARCHAR(36) NOT NULL,
      user_id          VARCHAR(36),
      company_id       VARCHAR(36) NOT NULL,
      task_type        TEXT        NOT NULL,
      status           TEXT        NOT NULL DEFAULT 'pending',
      day_number       INTEGER     NOT NULL DEFAULT 1,
      reminders_sent   INTEGER     NOT NULL DEFAULT 0,
      last_reminder_at TEXT,
      next_reminder_at TEXT        NOT NULL,
      escalated_at     TEXT,
      escalated_to     VARCHAR(36),
      metadata         JSONB,
      created_at       TEXT        NOT NULL,
      updated_at       TEXT        NOT NULL
    )
  `).catch((err: any) => console.error("[AI HR migrations] ai_follow_up_tasks:", err.message));

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kyc_submission_status (
      id                        VARCHAR(36)  PRIMARY KEY,
      employee_id               VARCHAR(36)  NOT NULL UNIQUE,
      company_id                VARCHAR(36)  NOT NULL,
      aadhaar_submitted         BOOLEAN      NOT NULL DEFAULT FALSE,
      pan_submitted             BOOLEAN      NOT NULL DEFAULT FALSE,
      bank_details_submitted    BOOLEAN      NOT NULL DEFAULT FALSE,
      cancelled_cheque_submitted BOOLEAN     NOT NULL DEFAULT FALSE,
      address_proof_submitted   BOOLEAN      NOT NULL DEFAULT FALSE,
      photograph_submitted      BOOLEAN      NOT NULL DEFAULT FALSE,
      aadhaar_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
      pan_verified              BOOLEAN      NOT NULL DEFAULT FALSE,
      bank_verified             BOOLEAN      NOT NULL DEFAULT FALSE,
      overall_status            TEXT         NOT NULL DEFAULT 'pending',
      completed_at              TEXT,
      created_at                TEXT         NOT NULL,
      updated_at                TEXT         NOT NULL
    )
  `).catch((err: any) => console.error("[AI HR migrations] kyc_submission_status:", err.message));

  console.log("[AI HR] Table migrations complete");
  startAiFollowUpScheduler();

  // ── GET /api/ai-hr/my-conversation ─────────────────────────────────────────
  // Returns (or creates) the active conversation for the logged-in employee.
  // For admin/HR users without a linked employee record, returns isAdminMode:true
  // so the frontend can show the compliance chat instead of the KYC flow.
  app.get("/api/ai-hr/my-conversation", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;

      // Super admin has no company — they should use the system-level admin panel
      if (!companyId) {
        return res.status(200).json({ isAdminMode: true, isSuperAdmin: true });
      }

      const emp = await getEmployeeForUser(user.id, companyId);

      // Admin/HR users without a linked employee record get compliance-chat mode
      const adminRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!emp && adminRoles.includes(user.role)) {
        return res.status(200).json({ isAdminMode: true, isSuperAdmin: false });
      }

      if (!emp) return res.status(404).json({ message: "Employee record not found" });

      // Find active conversation
      let conv = (
        await db
          .select()
          .from(aiConversations)
          .where(
            and(
              eq(aiConversations.userId, user.id),
              eq(aiConversations.companyId, companyId),
              eq(aiConversations.status, "active"),
            ),
          )
          .orderBy(desc(aiConversations.createdAt))
          .limit(1)
      )[0];

      if (!conv) {
        const now = new Date().toISOString();
        conv = {
          id: randomUUID(),
          employeeId: emp.id,
          userId: user.id,
          companyId,
          sessionType: "kyc",
          status: "active",
          language: "english",
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(aiConversations).values(conv);
      }

      const kyc = await getOrCreateKycStatus(emp.id, companyId);
      return res.json({ conversation: conv, kyc, employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`.trim() } });
    } catch (err: any) {
      console.error("[AI HR] my-conversation error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── GET /api/ai-hr/conversations/:id/messages ───────────────────────────────
  app.get("/api/ai-hr/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const conv = (
        await db.select().from(aiConversations).where(eq(aiConversations.id, req.params.id)).limit(1)
      )[0];
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.userId !== user.id && !["super_admin", "company_admin", "hr_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const msgs = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, req.params.id))
        .orderBy(aiMessages.createdAt);

      return res.json(msgs);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/conversations/:id/messages ──────────────────────────────
  // Send a message and get AI reply
  app.post("/api/ai-hr/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { content, language } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

      const conv = (
        await db.select().from(aiConversations).where(eq(aiConversations.id, req.params.id)).limit(1)
      )[0];
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.userId !== user.id) return res.status(403).json({ message: "Access denied" });

      const now = new Date().toISOString();

      // Update language preference if provided
      if (language && language !== conv.language) {
        await db
          .update(aiConversations)
          .set({ language, updatedAt: now })
          .where(eq(aiConversations.id, conv.id));
        conv.language = language;
      }

      // Save user message
      const userMsg = {
        id: randomUUID(),
        conversationId: conv.id,
        role: "user",
        content: content.trim(),
        attachments: null,
        createdAt: now,
      };
      await db.insert(aiMessages).values(userMsg);

      // Load KYC status, employee info, and live HR data for context
      const emp = (
        await db.select().from(employees).where(eq(employees.id, conv.employeeId)).limit(1)
      )[0];
      const kyc = await getOrCreateKycStatus(conv.employeeId, conv.companyId);
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Employee";

      // Fetch live payslip / leave / attendance data (non-blocking — if it fails, chat still works)
      let empCtx = null;
      try {
        empCtx = await fetchEmployeeContext(conv.employeeId, conv.companyId);
      } catch (ctxErr: any) {
        console.warn("[AI HR] fetchEmployeeContext failed (non-fatal):", ctxErr?.message);
      }

      // Phase 2 — try the deterministic, RBAC-checked intent layer first. It
      // answers module questions and safe actions straight from live DB data
      // (no hallucination). If no intent matches (or it errors), it returns
      // handled:false and we fall back to the existing LLM/rule-based chat.
      let replyContent: string | null = null;
      try {
        const actor = buildActor({
          userId: user.id,
          role: user.role,
          companyId: conv.companyId,
          userName: user.name || user.username || employeeName,
          employeeId: conv.employeeId,
          employeeName,
          language: conv.language,
        });
        const intentResult = await handleAssistantQuery({
          user,
          actor,
          message: content.trim(),
          employee: emp,
          empCtx,
          kyc,
        });
        if (intentResult.handled && intentResult.text) {
          replyContent = intentResult.text;
        }
      } catch (intentErr: any) {
        console.warn("[AI HR] intent layer failed (non-fatal):", intentErr?.message);
      }

      // Fallback: generate AI reply with live context injected into system prompt
      if (!replyContent) {
        replyContent = await generateAiReply(
          conv.id,
          content.trim(),
          employeeName,
          kyc,
          conv.language,
          empCtx,
        );
      }

      // Detect statutory/HRMS profile details the employee typed (live server with
      // AI key). If found, attach them so the employee can verify & save to master.
      let profileAttachments: any = null;
      try {
        const pres = await extractProfileFromText(content.trim());
        if (pres.available && pres.fields && Object.keys(pres.fields).length > 0) {
          profileAttachments = [
            {
              fileName: "Details you typed",
              filePath: "",
              docType: "profile",
              uploadedAt: new Date().toISOString(),
              extracted: pres.fields,
            },
          ];
        }
      } catch (pErr: any) {
        console.warn("[AI HR] profile extraction failed (non-fatal):", pErr?.message);
      }

      const botMsg = {
        id: randomUUID(),
        conversationId: conv.id,
        role: "assistant",
        content: replyContent,
        attachments: profileAttachments,
        createdAt: new Date().toISOString(),
      };
      await db.insert(aiMessages).values(botMsg);

      await db
        .update(aiConversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(aiConversations.id, conv.id));

      return res.json({ userMessage: userMsg, botMessage: botMsg });
    } catch (err: any) {
      console.error("[AI HR] send message error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/conversations/:id/upload ────────────────────────────────
  // Upload a KYC document within the chat
  app.post(
    "/api/ai-hr/conversations/:id/upload",
    requireAuth,
    kycUpload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const { docType } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        if (!docType) return res.status(400).json({ message: "docType required" });

        const conv = (
          await db.select().from(aiConversations).where(eq(aiConversations.id, req.params.id)).limit(1)
        )[0];
        if (!conv) return res.status(404).json({ message: "Conversation not found" });
        if (conv.userId !== user.id) return res.status(403).json({ message: "Access denied" });

        const now = new Date().toISOString();

        // Immediately read the document with a vision model (live server has the
        // AI key). Extracted fields are attached so the employee can verify them.
        let extracted: Record<string, string> | undefined;
        if (isKycExtractable(docType)) {
          try {
            const absPath = path.join(process.cwd(), "uploads", "kyc-docs", file.filename);
            const result = await extractKycDocument(absPath, file.mimetype, docType);
            if (result.available && result.fields && Object.keys(result.fields).length > 0) {
              extracted = result.fields;
            }
          } catch (e: any) {
            console.warn("[AI HR] KYC extraction error:", e?.message);
          }
        }

        const attachment = {
          fileName: file.originalname,
          filePath: `/uploads/kyc-docs/${file.filename}`,
          docType,
          uploadedAt: now,
          ...(extracted ? { extracted } : {}),
        };

        const docTypeLabels: Record<string, string> = {
          aadhaar: "Aadhaar Card",
          pan: "PAN Card",
          bank_details: "Bank Details / Cancelled Cheque",
          cancelled_cheque: "Cancelled Cheque",
          address_proof: "Address Proof",
          photograph: "Photograph",
        };

        const label = docTypeLabels[docType] ?? docType;

        // Save upload message
        const uploadMsg = {
          id: randomUUID(),
          conversationId: conv.id,
          role: "user",
          content: `[Document uploaded: ${label}]`,
          attachments: [attachment] as any,
          createdAt: now,
        };
        await db.insert(aiMessages).values(uploadMsg);

        // Update KYC status
        const kyc = await getOrCreateKycStatus(conv.employeeId, conv.companyId);
        const kycUpdate: Record<string, any> = { updatedAt: now };

        if (docType === "aadhaar") kycUpdate.aadhaarSubmitted = true;
        else if (docType === "pan") kycUpdate.panSubmitted = true;
        else if (docType === "bank_details" || docType === "cancelled_cheque") {
          kycUpdate.bankDetailsSubmitted = true;
          kycUpdate.cancelledChequeSubmitted = true;
        } else if (docType === "address_proof") kycUpdate.addressProofSubmitted = true;
        else if (docType === "photograph") kycUpdate.photographSubmitted = true;

        const updatedKyc = { ...kyc, ...kycUpdate };
        const overallStatus = computeKycOverallStatus(updatedKyc);
        kycUpdate.overallStatus = overallStatus;
        if (overallStatus === "complete") kycUpdate.completedAt = now;

        await db
          .update(kycSubmissionStatus)
          .set(kycUpdate)
          .where(eq(kycSubmissionStatus.employeeId, conv.employeeId));

        const refreshedKyc = await getOrCreateKycStatus(conv.employeeId, conv.companyId);

        // Dismiss follow-up task if KYC is now complete
        if (overallStatus === "complete") {
          await db
            .update(aiFollowUpTasks)
            .set({ status: "completed", updatedAt: now })
            .where(
              and(
                eq(aiFollowUpTasks.employeeId, conv.employeeId),
                eq(aiFollowUpTasks.taskType, "kyc_pending"),
                eq(aiFollowUpTasks.status, "pending"),
              ),
            );
        }

        // Generate AI acknowledgment
        const pendingDocs: string[] = [];
        if (!refreshedKyc.aadhaarSubmitted) pendingDocs.push("Aadhaar Card");
        if (!refreshedKyc.panSubmitted) pendingDocs.push("PAN Card");
        if (!refreshedKyc.bankDetailsSubmitted) pendingDocs.push("Bank Details");
        if (!refreshedKyc.cancelledChequeSubmitted) pendingDocs.push("Cancelled Cheque");
        if (!refreshedKyc.addressProofSubmitted) pendingDocs.push("Address Proof");
        if (!refreshedKyc.photographSubmitted) pendingDocs.push("Photograph");

        let ackContent = "";
        if (extracted) {
          // We read details off the document — ask the employee to verify them.
          if (conv.language === "hindi") {
            ackContent = `✅ **${label}** मिल गया और मैंने उसकी जानकारी पढ़ ली है! 📄 कृपया नीचे दी गई जानकारी जाँचें — सही होने पर **"प्रोफ़ाइल में सेव करें"** दबाएँ।`;
          } else {
            ackContent = `✅ **${label}** received — and I've read the details from it! 📄 Please check the information below, correct anything that's wrong, and tap **"Save to my profile"** to confirm.`;
          }
        } else if (conv.language === "hindi") {
          ackContent =
            pendingDocs.length === 0
              ? `✅ ${label} मिल गया! शानदार — आपका KYC अब पूरा हो गया है! 🎉 HR टीम जल्द ही verify करेगी।`
              : `✅ ${label} सफलतापूर्वक मिल गया! अब बाकी हैं: **${pendingDocs.join(", ")}**। क्या आप अगला दस्तावेज़ अपलोड करना चाहेंगे?`;
        } else {
          ackContent =
            pendingDocs.length === 0
              ? `✅ **${label}** received! Excellent — your KYC is now **complete**! 🎉 HR will review and verify your documents shortly.`
              : `✅ **${label}** received and recorded! Still pending: **${pendingDocs.join(", ")}**. Shall we continue with the next one?`;
        }

        const botMsg = {
          id: randomUUID(),
          conversationId: conv.id,
          role: "assistant",
          content: ackContent,
          attachments: null,
          createdAt: new Date().toISOString(),
        };
        await db.insert(aiMessages).values(botMsg);

        await db
          .update(aiConversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(aiConversations.id, conv.id));

        return res.json({ uploadMessage: uploadMsg, botMessage: botMsg, kyc: refreshedKyc });
      } catch (err: any) {
        console.error("[AI HR] upload error:", err);
        return res.status(500).json({ message: "Server error" });
      }
    },
  );

  // ── POST /api/ai-hr/conversations/:id/apply-extraction ──────────────────────
  // The employee verified the fields the AI read from a KYC document; save the
  // confirmed values into their own employee master record.
  app.post(
    "/api/ai-hr/conversations/:id/apply-extraction",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const { docType, fields } = req.body as {
          docType?: string;
          fields?: Record<string, string>;
        };
        if (!docType) return res.status(400).json({ message: "docType required" });
        if (!fields || typeof fields !== "object")
          return res.status(400).json({ message: "fields required" });

        const conv = (
          await db.select().from(aiConversations).where(eq(aiConversations.id, req.params.id)).limit(1)
        )[0];
        const access = checkConversationAccess(conv, user.id);
        if (access === "not_found") return res.status(404).json({ message: "Conversation not found" });
        if (access === "forbidden") return res.status(403).json({ message: "Access denied" });

        // Map the verified fields onto a fixed whitelist of employee-master columns.
        const updates = mapExtractionToUpdates(docType, fields ?? {});
        if (updates === null) {
          return res.status(400).json({ message: "Unsupported docType" });
        }

        const updatedKeys = Object.keys(updates);
        if (updatedKeys.length === 0) {
          return res.status(400).json({ message: "No valid fields to save" });
        }

        await db.update(employees).set(updates).where(eq(employees.id, conv.employeeId));

        const now = new Date().toISOString();
        const fieldNames: Record<string, string> = {
          aadhaar: "Aadhaar number",
          dateOfBirth: "Date of birth",
          gender: "Gender",
          presentAddress: "Present address",
          permanentAddress: "Permanent address",
          pan: "PAN",
          fatherHusbandName: "Father's / Husband's name",
          bankAccount: "Bank account",
          ifsc: "IFSC",
          mobileNumber: "Mobile number",
          officialEmail: "Email",
          uan: "UAN (EPFO)",
          esiNumber: "ESIC IP number",
          maritalStatus: "Marital status",
          motherName: "Mother's name",
          bloodGroup: "Blood group",
          nomineeName: "Nominee name",
          nomineeRelation: "Nominee relationship",
          emergencyContactName: "Emergency contact name",
          emergencyContactNumber: "Emergency contact number",
        };
        const savedLabels = updatedKeys.map((k) => fieldNames[k] ?? k).join(", ");
        const botContent =
          conv.language === "hindi"
            ? `✅ हो गया! मैंने आपकी प्रोफ़ाइल में यह जानकारी सेव कर दी है: **${savedLabels}**। HR टीम इसे verify करेगी।`
            : `✅ Done! I've saved this to your profile: **${savedLabels}**. The HR team will verify it.`;

        const botMsg = {
          id: randomUUID(),
          conversationId: conv.id,
          role: "assistant",
          content: botContent,
          attachments: null,
          createdAt: now,
        };
        await db.insert(aiMessages).values(botMsg);
        await db
          .update(aiConversations)
          .set({ updatedAt: now })
          .where(eq(aiConversations.id, conv.id));

        return res.json({ saved: updatedKeys, botMessage: botMsg });
      } catch (err: any) {
        console.error("[AI HR] apply-extraction error:", err);
        return res.status(500).json({ message: "Server error" });
      }
    },
  );

  // ── GET /api/ai-hr/kyc-status ───────────────────────────────────────────────
  // Returns KYC status for the logged-in employee
  app.get("/api/ai-hr/kyc-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;
      if (!companyId) return res.status(400).json({ message: "No company" });

      const emp = await getEmployeeForUser(user.id, companyId);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const kyc = await getOrCreateKycStatus(emp.id, companyId);
      return res.json(kyc);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── PATCH /api/ai-hr/kyc-status/:employeeId ─────────────────────────────────
  // HR verifies documents
  app.patch("/api/ai-hr/kyc-status/:employeeId", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const updates = { ...req.body, updatedAt: now };

      // Compute overall status
      const existing = await db
        .select()
        .from(kycSubmissionStatus)
        .where(eq(kycSubmissionStatus.employeeId, req.params.employeeId))
        .limit(1);

      if (!existing[0]) return res.status(404).json({ message: "KYC record not found" });

      const merged = { ...existing[0], ...updates };
      const overallStatus = computeKycOverallStatus(merged);
      updates.overallStatus = overallStatus;
      if (overallStatus === "complete" && !existing[0].completedAt) updates.completedAt = now;

      await db
        .update(kycSubmissionStatus)
        .set(updates)
        .where(eq(kycSubmissionStatus.employeeId, req.params.employeeId));

      const refreshed = await db
        .select()
        .from(kycSubmissionStatus)
        .where(eq(kycSubmissionStatus.employeeId, req.params.employeeId))
        .limit(1);

      // Email a KYC reminder to the employee when verification is still incomplete
      if (overallStatus !== "complete") {
        try {
          const emp = (await db.select().from(employees).where(eq(employees.id, req.params.employeeId as string)).limit(1))[0];
          if (emp?.officialEmail) {
            await sendKycReminderEmail({
              to: emp.officialEmail,
              employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
              note: req.body.rejectionReason ?? null,
              companyId: emp.companyId,
            });
          }
        } catch (err) {
          console.error("[Email] KYC reminder failed:", err);
        }
      }

      return res.json(refreshed[0]);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/self-link ────────────────────────────────────────────────
  // Allows an employee to self-link their user account to an employee record
  // by providing their employee code. Only links if:
  //   1. The employee code exists in the same company
  //   2. That employee record is not already linked to a different user
  app.post("/api/ai-hr/self-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;
      if (!companyId) return res.status(400).json({ message: "No company associated with your account" });

      const { employeeCode } = req.body;
      if (!employeeCode?.trim()) return res.status(400).json({ message: "Employee code is required" });

      // Look up employee by code within the same company
      const emp = (
        await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.employeeCode, employeeCode.trim().toUpperCase()),
              eq(employees.companyId, companyId),
            ),
          )
          .limit(1)
      )[0];

      if (!emp) {
        return res.status(404).json({ message: "No employee found with that code in your company. Please check and try again." });
      }

      // Don't allow linking if the employee is already linked to a different user
      if (emp.userId && emp.userId !== user.id) {
        return res.status(409).json({ message: "This employee record is already linked to another account. Please contact HR." });
      }

      // Already linked to this user — nothing to do
      if (emp.userId === user.id) {
        return res.json({ success: true, employeeName: `${emp.firstName} ${emp.lastName}`.trim(), alreadyLinked: true });
      }

      // Link the employee record to this user
      await db
        .update(employees)
        .set({ userId: user.id })
        .where(eq(employees.id, emp.id));

      return res.json({ success: true, employeeName: `${emp.firstName} ${emp.lastName}`.trim(), alreadyLinked: false });
    } catch (err: any) {
      console.error("[AI HR] self-link error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── PATCH /api/ai-hr/conversations/:id/language ──────────────────────────────
  app.patch("/api/ai-hr/conversations/:id/language", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { language } = req.body;
      if (!["english", "hindi"].includes(language)) return res.status(400).json({ message: "Invalid language" });

      const conv = (
        await db.select().from(aiConversations).where(eq(aiConversations.id, req.params.id)).limit(1)
      )[0];
      if (!conv || conv.userId !== user.id) return res.status(403).json({ message: "Access denied" });

      await db
        .update(aiConversations)
        .set({ language, updatedAt: new Date().toISOString() })
        .where(eq(aiConversations.id, req.params.id));

      return res.json({ language });
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── GET /api/ai-hr/dashboard ────────────────────────────────────────────────
  // HR dashboard stats
  app.get("/api/ai-hr/dashboard", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.companyId;
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const [pendingKyc, partialKyc, completedKyc] = await Promise.all([
        db
          .select({ count: count() })
          .from(kycSubmissionStatus)
          .where(and(eq(kycSubmissionStatus.companyId, companyId), eq(kycSubmissionStatus.overallStatus, "pending"))),
        db
          .select({ count: count() })
          .from(kycSubmissionStatus)
          .where(and(eq(kycSubmissionStatus.companyId, companyId), eq(kycSubmissionStatus.overallStatus, "partial"))),
        db
          .select({ count: count() })
          .from(kycSubmissionStatus)
          .where(and(eq(kycSubmissionStatus.companyId, companyId), eq(kycSubmissionStatus.overallStatus, "complete"))),
      ]);

      const activeTasks = await db
        .select({ count: count() })
        .from(aiFollowUpTasks)
        .where(and(eq(aiFollowUpTasks.companyId, companyId), eq(aiFollowUpTasks.status, "pending")));

      const escalatedTasks = await db
        .select({ count: count() })
        .from(aiFollowUpTasks)
        .where(and(eq(aiFollowUpTasks.companyId, companyId), eq(aiFollowUpTasks.status, "escalated")));

      const activeConversations = await db
        .select({ count: count() })
        .from(aiConversations)
        .where(and(eq(aiConversations.companyId, companyId), eq(aiConversations.status, "active")));

      return res.json({
        pendingKyc: Number(pendingKyc[0]?.count ?? 0),
        partialKyc: Number(partialKyc[0]?.count ?? 0),
        completedKyc: Number(completedKyc[0]?.count ?? 0),
        activeTasks: Number(activeTasks[0]?.count ?? 0),
        escalatedTasks: Number(escalatedTasks[0]?.count ?? 0),
        activeConversations: Number(activeConversations[0]?.count ?? 0),
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── GET /api/ai-hr/pending-kyc ──────────────────────────────────────────────
  // List employees with pending/partial KYC
  app.get("/api/ai-hr/pending-kyc", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.companyId;
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const records = await db
        .select({
          kycId: kycSubmissionStatus.id,
          employeeId: kycSubmissionStatus.employeeId,
          overallStatus: kycSubmissionStatus.overallStatus,
          aadhaarSubmitted: kycSubmissionStatus.aadhaarSubmitted,
          panSubmitted: kycSubmissionStatus.panSubmitted,
          bankDetailsSubmitted: kycSubmissionStatus.bankDetailsSubmitted,
          cancelledChequeSubmitted: kycSubmissionStatus.cancelledChequeSubmitted,
          addressProofSubmitted: kycSubmissionStatus.addressProofSubmitted,
          photographSubmitted: kycSubmissionStatus.photographSubmitted,
          aadhaarVerified: kycSubmissionStatus.aadhaarVerified,
          panVerified: kycSubmissionStatus.panVerified,
          bankVerified: kycSubmissionStatus.bankVerified,
          completedAt: kycSubmissionStatus.completedAt,
          updatedAt: kycSubmissionStatus.updatedAt,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          mobileNumber: employees.mobileNumber,
          department: employees.department,
          designation: employees.designation,
        })
        .from(kycSubmissionStatus)
        .leftJoin(employees, eq(employees.id, kycSubmissionStatus.employeeId))
        .where(
          and(
            eq(kycSubmissionStatus.companyId, companyId),
            ne(kycSubmissionStatus.overallStatus, "complete"),
          ),
        )
        .orderBy(desc(kycSubmissionStatus.updatedAt))
        .limit(200);

      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── GET /api/ai-hr/follow-up-tasks ──────────────────────────────────────────
  app.get("/api/ai-hr/follow-up-tasks", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.companyId;
      const statusFilter = (req.query.status as string) || "pending";

      const baseQuery = db
        .select({
          task: aiFollowUpTasks,
          firstName: employees.firstName,
          lastName: employees.lastName,
          employeeCode: employees.employeeCode,
          department: employees.department,
        })
        .from(aiFollowUpTasks)
        .leftJoin(employees, eq(employees.id, aiFollowUpTasks.employeeId))
        .where(
          and(
            companyId ? eq(aiFollowUpTasks.companyId, companyId) : undefined,
            statusFilter !== "all" ? eq(aiFollowUpTasks.status, statusFilter) : undefined,
          ),
        )
        .orderBy(desc(aiFollowUpTasks.updatedAt))
        .limit(200);

      const tasks = await baseQuery;
      return res.json(tasks);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/follow-up-tasks ─────────────────────────────────────────
  // HR manually creates a follow-up task for an employee
  app.post("/api/ai-hr/follow-up-tasks", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { employeeId, taskType } = req.body;
      if (!employeeId || !taskType) return res.status(400).json({ message: "employeeId and taskType required" });

      const emp = (await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1))[0];
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      await createFollowUpTask(employeeId, emp.userId ?? null, emp.companyId, taskType);

      // Notify the employee
      if (emp.userId) {
        await createNotification({
          userId: emp.userId,
          companyId: emp.companyId,
          type: "ai_followup",
          title: "Action Required: HR Request",
          message: `Your HR team has requested you to complete: ${taskType.replace(/_/g, " ")}. Please use the AI Assistant to submit.`,
          link: "/ai-assistant",
        });
      }
      if (emp.officialEmail) {
        const label = taskType.replace(/_/g, " ");
        await sendAiFollowUpEmail({
          to: emp.officialEmail,
          recipientName: `${emp.firstName} ${emp.lastName}`.trim(),
          taskLabel: label,
          message: `Your HR team has requested you to complete: ${label}. Please use the AI Assistant in the app to submit.`,
          kind: "employee",
          companyId: emp.companyId,
        });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── PATCH /api/ai-hr/follow-up-tasks/:id ────────────────────────────────────
  app.patch("/api/ai-hr/follow-up-tasks/:id", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      await db
        .update(aiFollowUpTasks)
        .set({ ...req.body, updatedAt: now })
        .where(eq(aiFollowUpTasks.id, req.params.id));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/initialize-kyc-for-all ──────────────────────────────────
  // HR bulk-initializes KYC records for all employees in the company
  app.post("/api/ai-hr/initialize-kyc-for-all", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;
      if (!companyId) return res.status(400).json({ message: "No company" });

      const allEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

      const existing = await db
        .select({ employeeId: kycSubmissionStatus.employeeId })
        .from(kycSubmissionStatus)
        .where(eq(kycSubmissionStatus.companyId, companyId));

      const existingSet = new Set(existing.map((e) => e.employeeId));
      const now = new Date().toISOString();
      let created = 0;

      for (const emp of allEmployees) {
        if (!existingSet.has(emp.id)) {
          await db.insert(kycSubmissionStatus).values({
            id: randomUUID(),
            employeeId: emp.id,
            companyId,
            aadhaarSubmitted: false,
            panSubmitted: false,
            bankDetailsSubmitted: false,
            cancelledChequeSubmitted: false,
            addressProofSubmitted: false,
            photographSubmitted: false,
            aadhaarVerified: false,
            panVerified: false,
            bankVerified: false,
            overallStatus: "pending",
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }

      return res.json({ initialized: created, total: allEmployees.length });
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── POST /api/ai-hr/compliance-chat ────────────────────────────────────────
  // Stateless compliance Q&A — no conversation stored in DB
  app.post("/api/ai-hr/compliance-chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const { message, history = [], portal = "both" } = req.body as {
        message: string;
        history?: Array<{ role: string; content: string }>;
        portal?: string;
      };
      if (!message?.trim()) return res.status(400).json({ message: "message is required" });
      const reply = await generateComplianceReply(message.trim(), history, portal);
      return res.json({ reply });
    } catch (err: any) {
      return res.status(500).json({ message: "AI service error" });
    }
  });

  // ── POST /api/ai-hr/analyze-job-error ──────────────────────────────────────
  // Analyzes a failed automation job error and returns structured diagnosis
  app.post("/api/ai-hr/analyze-job-error", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobType, errorMessage, logs } = req.body as {
        jobType: string;
        errorMessage: string;
        logs?: string[];
      };
      if (!jobType || !errorMessage) return res.status(400).json({ message: "jobType and errorMessage are required" });
      const analysis = await analyzeJobError(jobType, errorMessage, logs ?? []);
      return res.json(analysis);
    } catch (err: any) {
      return res.status(500).json({ message: "AI service error" });
    }
  });

  // ── GET /api/ai-hr/all-kyc ──────────────────────────────────────────────────
  // All KYC records for the company (for HR complete overview)
  app.get("/api/ai-hr/all-kyc", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.companyId;
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const records = await db
        .select({
          kycId: kycSubmissionStatus.id,
          employeeId: kycSubmissionStatus.employeeId,
          overallStatus: kycSubmissionStatus.overallStatus,
          aadhaarSubmitted: kycSubmissionStatus.aadhaarSubmitted,
          panSubmitted: kycSubmissionStatus.panSubmitted,
          bankDetailsSubmitted: kycSubmissionStatus.bankDetailsSubmitted,
          cancelledChequeSubmitted: kycSubmissionStatus.cancelledChequeSubmitted,
          addressProofSubmitted: kycSubmissionStatus.addressProofSubmitted,
          photographSubmitted: kycSubmissionStatus.photographSubmitted,
          aadhaarVerified: kycSubmissionStatus.aadhaarVerified,
          panVerified: kycSubmissionStatus.panVerified,
          bankVerified: kycSubmissionStatus.bankVerified,
          completedAt: kycSubmissionStatus.completedAt,
          updatedAt: kycSubmissionStatus.updatedAt,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          department: employees.department,
          designation: employees.designation,
        })
        .from(kycSubmissionStatus)
        .leftJoin(employees, eq(employees.id, kycSubmissionStatus.employeeId))
        .where(eq(kycSubmissionStatus.companyId, companyId))
        .orderBy(desc(kycSubmissionStatus.updatedAt))
        .limit(500);

      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── GET /api/ai-hr/kyc-documents/:employeeId ────────────────────────────────
  // Uploaded KYC document files + typed values for an employee, for HR review.
  app.get("/api/ai-hr/kyc-documents/:employeeId", requireAuth, requireHR, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const employeeId = String(req.params.employeeId);

      const emp = (
        await db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            aadhaar: employees.aadhaar,
            pan: employees.pan,
            bankAccount: employees.bankAccount,
            ifsc: employees.ifsc,
          })
          .from(employees)
          .where(eq(employees.id, employeeId))
          .limit(1)
      )[0];
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      // Multi-tenancy: non-super-admin can only view their own company's employees.
      if (user.role !== "super_admin" && emp.companyId !== user.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Gather uploaded documents from the employee's AI conversation messages.
      const rows = await db
        .select({ attachments: aiMessages.attachments, createdAt: aiMessages.createdAt })
        .from(aiMessages)
        .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
        .where(
          and(
            eq(aiConversations.employeeId, employeeId),
            isNotNull(aiMessages.attachments),
            user?.role === "super_admin"
              ? undefined
              : eq(aiConversations.companyId, emp.companyId),
          ),
        )
        .orderBy(desc(aiMessages.createdAt));

      type DocOut = {
        docType: string;
        fileName: string;
        filePath: string;
        uploadedAt: string;
        extracted?: Record<string, string>;
      };
      const latestByType: Record<string, DocOut> = {};
      for (const r of rows) {
        const atts = Array.isArray(r.attachments) ? (r.attachments as any[]) : [];
        for (const a of atts) {
          if (!a?.docType || !a?.filePath) continue;
          const uploadedAt: string = a.uploadedAt ?? r.createdAt;
          const existing = latestByType[a.docType];
          if (!existing || uploadedAt > existing.uploadedAt) {
            latestByType[a.docType] = {
              docType: a.docType,
              fileName: a.fileName ?? "document",
              filePath: a.filePath,
              uploadedAt,
              extracted: a.extracted ?? undefined,
            };
          }
        }
      }

      return res.json({
        values: {
          aadhaar: emp.aadhaar ?? null,
          pan: emp.pan ?? null,
          bankAccount: emp.bankAccount ?? null,
          ifsc: emp.ifsc ?? null,
        },
        documents: Object.values(latestByType),
      });
    } catch (err: any) {
      console.error("[AI HR] kyc-documents error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
}
