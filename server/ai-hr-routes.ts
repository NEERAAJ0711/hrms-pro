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
} from "../shared/schema";
import { eq, and, desc, sql, or, ne, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { generateAiReply, computeKycOverallStatus, createFollowUpTask, startAiFollowUpScheduler, generateComplianceReply, analyzeJobError } from "./ai-service";
import { createNotification } from "./notifications";

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

// ─── Auth middleware re-export ────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "Not logged in" });
  }
  next();
}

function requireHR(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!["super_admin", "company_admin", "hr_admin"].includes(user?.role)) {
    return res.status(403).json({ message: "HR access required" });
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateKycStatus(employeeId: string, companyId: string) {
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

async function getEmployeeForUser(userId: string, companyId: string | null) {
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

export function registerAiHrRoutes(app: Express): void {
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

      // Load KYC status for context
      const emp = (
        await db.select().from(employees).where(eq(employees.id, conv.employeeId)).limit(1)
      )[0];
      const kyc = await getOrCreateKycStatus(conv.employeeId, conv.companyId);
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Employee";

      // Generate AI reply
      const replyContent = await generateAiReply(
        conv.id,
        content.trim(),
        employeeName,
        kyc,
        conv.language,
      );

      const botMsg = {
        id: randomUUID(),
        conversationId: conv.id,
        role: "assistant",
        content: replyContent,
        attachments: null,
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
        const attachment = {
          fileName: file.originalname,
          filePath: `/uploads/kyc-docs/${file.filename}`,
          docType,
          uploadedAt: now,
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
        if (conv.language === "hindi") {
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
}
