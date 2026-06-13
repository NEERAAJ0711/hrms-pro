// AI HR Assistant Service — OpenAI → Gemini → rule-based fallback
import { db } from "./db";
import {
  aiMessages,
  aiConversations,
  kycSubmissionStatus,
  employees,
  aiFollowUpTasks,
  users as usersTable,
} from "../shared/schema";
import { eq, and, lte, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createNotification } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KycStatus {
  aadhaarSubmitted: boolean;
  panSubmitted: boolean;
  bankDetailsSubmitted: boolean;
  cancelledChequeSubmitted: boolean;
  addressProofSubmitted: boolean;
  photographSubmitted: boolean;
  aadhaarVerified: boolean;
  panVerified: boolean;
  bankVerified: boolean;
  overallStatus: string;
}

export interface Attachment {
  fileName: string;
  filePath: string;
  docType: string;
  uploadedAt: string;
}

// ── OpenAI ─────────────────────────────────────────────────────────────────────
let _openai: any = null;
let _openaiKeyOverride: string | null = null;

export function setOpenAIKeyOverride(key: string | null) {
  _openaiKeyOverride = key || null;
  _openai = null;
}

function getOpenAI(): any | null {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY || _openaiKeyOverride;
  if (!key) return null;
  try {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI({ apiKey: key });
    return _openai;
  } catch {
    return null;
  }
}

// ── Google Gemini ───────────────────────────────────────────────────────────────
let _geminiKey: string | null = null;

export function setGeminiKeyOverride(key: string | null) {
  _geminiKey = key || null;
}

function getGeminiKey(): string | null {
  return process.env.GOOGLE_GEMINI_API_KEY || _geminiKey || null;
}

async function callGemini(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string | null> {
  const key = getGeminiKey();
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });

    // Gemini requires alternating user/model turns; convert our history
    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    return result.response.text() || null;
  } catch (err: any) {
    console.warn("[AI] Gemini call failed:", err?.message);
    return null;
  }
}

// ── Startup loader — pulls both keys from DB ────────────────────────────────────
export async function loadAllApiKeysFromDB(): Promise<void> {
  try {
    const { db: dbInst } = await import("./db");
    const { settings: settingsTable } = await import("../shared/schema");
    const { isNull, eq, and } = await import("drizzle-orm");

    const rows = await dbInst
      .select()
      .from(settingsTable)
      .where(isNull(settingsTable.companyId));

    for (const row of rows) {
      if (row.key === "openai_api_key" && row.value) _openaiKeyOverride = row.value;
      if (row.key === "gemini_api_key" && row.value) _geminiKey = row.value;
    }
  } catch {
    // DB may not be ready yet — safe to skip
  }
}

/** @deprecated use loadAllApiKeysFromDB */
export async function loadOpenAIKeyFromDB(): Promise<void> {
  return loadAllApiKeysFromDB();
}

// ─── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(employeeName: string, kyc: KycStatus, language: string): string {
  const pendingDocs: string[] = [];
  if (!kyc.aadhaarSubmitted) pendingDocs.push("Aadhaar Card");
  if (!kyc.panSubmitted) pendingDocs.push("PAN Card");
  if (!kyc.bankDetailsSubmitted) pendingDocs.push("Bank Account Details (Account No + IFSC)");
  if (!kyc.cancelledChequeSubmitted) pendingDocs.push("Cancelled Cheque");
  if (!kyc.addressProofSubmitted) pendingDocs.push("Address Proof");
  if (!kyc.photographSubmitted) pendingDocs.push("Passport-size Photograph");

  const langInstruction =
    language === "hindi"
      ? "Always respond in Hindi (Devanagari script). If the employee writes in English, still respond in Hindi unless they explicitly ask you to switch."
      : "Respond in English by default. If the employee writes in Hindi, you may respond in Hindi to be helpful.";

  return `You are Priya, an AI HR Assistant for an Indian company. You are warm, professional, and empathetic. Your primary role is to help employees complete their KYC documentation and handle onboarding tasks.

Employee Name: ${employeeName}
${langInstruction}

Current KYC Status for ${employeeName}:
- Aadhaar Card: ${kyc.aadhaarSubmitted ? "✅ Submitted" + (kyc.aadhaarVerified ? " & Verified" : " (Pending Verification)") : "❌ Pending"}
- PAN Card: ${kyc.panSubmitted ? "✅ Submitted" + (kyc.panVerified ? " & Verified" : " (Pending Verification)") : "❌ Pending"}
- Bank Details: ${kyc.bankDetailsSubmitted ? "✅ Submitted" + (kyc.bankVerified ? " & Verified" : " (Pending Verification)") : "❌ Pending"}
- Cancelled Cheque: ${kyc.cancelledChequeSubmitted ? "✅ Submitted" : "❌ Pending"}
- Address Proof: ${kyc.addressProofSubmitted ? "✅ Submitted" : "❌ Pending"}
- Photograph: ${kyc.photographSubmitted ? "✅ Submitted" : "❌ Pending"}
- Overall KYC Status: ${kyc.overallStatus.toUpperCase()}

${pendingDocs.length > 0 ? `PENDING DOCUMENTS (${pendingDocs.length}): ${pendingDocs.join(", ")}` : "🎉 All KYC documents have been submitted!"}

YOUR RESPONSIBILITIES:
1. Guide ${employeeName} to submit their pending KYC documents by uploading them in this chat
2. Explain WHY each document is required (Aadhaar for ESIC/PF, PAN for TDS, Bank details for salary credit)
3. If an employee provides bank details in text (account no, IFSC), acknowledge and note it
4. When a document is uploaded, confirm receipt and update them on what's still pending
5. Answer HR-related questions: leave policy, payroll dates, salary components, PF/ESIC benefits
6. Be encouraging — remind them that KYC completion is needed for salary disbursement and statutory benefits
7. For Aadhaar: ask for front and back side clear photo/scan
8. For Bank Details: collect Account Number, IFSC Code, Bank Name, Branch Name
9. For Address Proof: accept Passport, Voter ID, Driving License, or utility bill
10. Keep responses concise (2-4 sentences) unless explaining something complex

IMPORTANT: When an employee uploads a document (they'll mention uploading), confirm you've received it and tell them which document was updated. Always end with what the next pending document is (if any).`;
}

// ─── Rule-based fallback responses ────────────────────────────────────────────

function buildRuleBasedResponse(
  userMessage: string,
  employeeName: string,
  kyc: KycStatus,
  language: string,
): string {
  const msg = userMessage.toLowerCase();
  const firstName = employeeName.split(" ")[0];
  const isHindi = language === "hindi";

  const pendingDocs: string[] = [];
  if (!kyc.aadhaarSubmitted) pendingDocs.push("Aadhaar Card");
  if (!kyc.panSubmitted) pendingDocs.push("PAN Card");
  if (!kyc.bankDetailsSubmitted) pendingDocs.push("Bank Account Details");
  if (!kyc.cancelledChequeSubmitted) pendingDocs.push("Cancelled Cheque");
  if (!kyc.addressProofSubmitted) pendingDocs.push("Address Proof");
  if (!kyc.photographSubmitted) pendingDocs.push("Photograph");

  // Greeting
  if (msg.match(/^(hi|hello|hey|hii|namaste|नमस्ते|हेलो)/)) {
    if (isHindi) {
      return `नमस्ते ${firstName} जी! 😊 मैं प्रिया हूँ, आपकी AI HR असिस्टेंट। ${
        pendingDocs.length > 0
          ? `आपके KYC में अभी ${pendingDocs.length} दस्तावेज़ बाकी हैं: ${pendingDocs.join(", ")}। क्या आप इन्हें अभी अपलोड करना चाहेंगे?`
          : "आपके सभी KYC दस्तावेज़ जमा हो चुके हैं! 🎉"
      }`;
    }
    return `Hello ${firstName}! 😊 I'm Priya, your AI HR Assistant. ${
      pendingDocs.length > 0
        ? `You have ${pendingDocs.length} pending KYC document(s): **${pendingDocs.join(", ")}**. Shall we complete them today? It only takes a few minutes!`
        : "Great news — all your KYC documents are submitted! 🎉 Is there anything else I can help you with?"
    }`;
  }

  // KYC status query
  if (msg.includes("kyc") && (msg.includes("status") || msg.includes("pending") || msg.includes("complete") || msg.includes("स्थिति"))) {
    if (pendingDocs.length === 0) {
      return isHindi
        ? `${firstName} जी, आपका KYC पूरा हो चुका है! ✅ सभी ${6} दस्तावेज़ जमा हो चुके हैं।`
        : `Great news ${firstName}! Your KYC is complete ✅. All 6 documents have been submitted. HR will verify them shortly.`;
    }
    return isHindi
      ? `${firstName} जी, अभी ${pendingDocs.length} दस्तावेज़ बाकी हैं:\n${pendingDocs.map((d, i) => `${i + 1}. ${d}`).join("\n")}\nकृपया ऊपर 📎 बटन से अपलोड करें।`
      : `${firstName}, here's your current KYC status:\n\n**Pending (${pendingDocs.length}):**\n${pendingDocs.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n\nPlease upload them using the 📎 attachment button above. Which one would you like to start with?`;
  }

  // Aadhaar query
  if (msg.includes("aadhaar") || msg.includes("aadhar") || msg.includes("आधार")) {
    return isHindi
      ? `${firstName} जी, आधार कार्ड की दोनों तरफ की clear फोटो अपलोड करें। यह PF और ESIC पंजीकरण के लिए जरूरी है।`
      : `For Aadhaar, please upload clear photos/scans of **both front and back** sides. This is required for your PF and ESIC registration. Use the 📎 button to upload.`;
  }

  // PAN query
  if (msg.includes("pan") || msg.includes("पैन")) {
    return isHindi
      ? `${firstName} जी, PAN कार्ड की clear फोटो अपलोड करें। TDS कटौती और आयकर के लिए यह अनिवार्य है।`
      : `Please upload a clear photo/scan of your **PAN card**. This is mandatory for TDS deduction and income tax purposes. Use the 📎 button to upload.`;
  }

  // Bank details
  if (msg.includes("bank") || msg.includes("account") || msg.includes("salary") || msg.includes("बैंक") || msg.includes("खाता")) {
    return isHindi
      ? `${firstName} जी, कृपया अपना बैंक विवरण दें:\n1. खाता संख्या\n2. IFSC कोड\n3. बैंक का नाम\n4. शाखा का नाम\n\nया फिर cancelled cheque की फोटो अपलोड करें।`
      : `To process your salary, I need your bank details:\n1. **Account Number**\n2. **IFSC Code**\n3. **Bank Name**\n4. **Branch Name**\n\nYou can type them here or upload a **Cancelled Cheque** using the 📎 button.`;
  }

  // Leave query
  if (msg.includes("leave") || msg.includes("छुट्टी")) {
    return isHindi
      ? `${firstName} जी, छुट्टी के लिए कृपया Leave module में जाएं। कोई अर्जेंट छुट्टी हो तो अपने manager से बात करें।`
      : `For leave requests, please use the **Leave** module in the sidebar. For urgent leave, contact your reporting manager directly. Is there anything else about KYC I can help with?`;
  }

  // Payroll/salary query
  if (msg.includes("salary") || msg.includes("payroll") || msg.includes("payslip") || msg.includes("वेतन")) {
    return isHindi
      ? `${firstName} जी, वेतन पर्ची Payroll module में मिलेगी। ध्यान रखें कि salary credit के लिए bank details और cancelled cheque का KYC पूरा होना जरूरी है।`
      : `Your payslips are available in the **Payroll** module. Note that salary credit requires your bank KYC to be complete. ${!kyc.bankDetailsSubmitted ? "You still need to submit your bank details — shall we do that now?" : "Your bank details are already on file ✅"}`;
  }

  // PF query
  if (msg.includes("pf") || msg.includes("provident") || msg.includes("epfo") || msg.includes("पीएफ")) {
    return isHindi
      ? `${firstName} जी, PF लाभ के लिए Aadhaar, PAN और bank details का KYC जरूरी है। ${!kyc.aadhaarSubmitted ? "आपका Aadhaar अभी pending है।" : ""}`
      : `For PF benefits and UAN activation, you need Aadhaar, PAN, and bank details KYC complete. ${!kyc.aadhaarSubmitted ? "Your Aadhaar is still pending — please upload it." : "Your Aadhaar is submitted ✅"}`;
  }

  // Thank you
  if (msg.match(/(thank|thanks|धन्यवाद|शुक्रिया)/)) {
    return isHindi
      ? `कोई बात नहीं ${firstName} जी! 😊 कोई और मदद चाहिए तो बताएं।`
      : `You're welcome, ${firstName}! 😊 I'm here whenever you need help. ${pendingDocs.length > 0 ? `Don't forget — ${pendingDocs[0]} is still pending!` : ""}`;
  }

  // Document upload acknowledgment
  if (msg.includes("upload") || msg.includes("uploaded") || msg.includes("sent") || msg.includes("अपलोड")) {
    const nextPending = pendingDocs[0];
    return isHindi
      ? `धन्यवाद ${firstName} जी! दस्तावेज़ मिल गया ✅। ${nextPending ? `अगला: कृपया ${nextPending} अपलोड करें।` : "सभी दस्तावेज़ जमा हो गए! 🎉"}`
      : `Thank you, ${firstName}! Document received ✅. ${nextPending ? `Next, please upload your **${nextPending}**.` : "All documents submitted! 🎉 HR will review and verify them shortly."}`;
  }

  // Default response
  if (pendingDocs.length > 0) {
    return isHindi
      ? `${firstName} जी, मैं आपकी मदद करने के लिए यहाँ हूँ। अभी आपके ${pendingDocs.length} KYC दस्तावेज़ बाकी हैं। क्या आप **${pendingDocs[0]}** से शुरू करना चाहेंगे?`
      : `I'm here to help, ${firstName}! You have ${pendingDocs.length} pending KYC document(s). Let's start with **${pendingDocs[0]}** — please upload it using the 📎 button. This ensures your salary and statutory benefits are processed correctly.`;
  }

  return isHindi
    ? `${firstName} जी, आपका KYC पूरा है! 🎉 कोई और जानकारी चाहिए तो पूछें।`
    : `${firstName}, your KYC is complete! 🎉 Feel free to ask me anything about HR policies, leave, payroll, or any other queries.`;
}

// ─── Main AI Reply Generator ────────────────────────────────────────────────

export async function generateAiReply(
  conversationId: string,
  userMessage: string,
  employeeName: string,
  kyc: KycStatus,
  language: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(employeeName, kyc, language);

  // Load conversation history (last 12 messages) — shared by all providers
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(aiMessages.createdAt)
    .limit(50);
  const recentHistory = history.slice(-12);

  // ── 1. Try OpenAI ───────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...recentHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: userMessage },
      ];
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 400,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) return text;
    } catch (err: any) {
      console.warn("[AI] OpenAI call failed, trying Gemini:", err?.message);
    }
  }

  // ── 2. Try Google Gemini ────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const geminiReply = await callGemini(
      systemPrompt,
      recentHistory.map((m) => ({ role: m.role, content: m.content })),
      userMessage,
    );
    if (geminiReply) return geminiReply;
    console.warn("[AI] Gemini also failed — falling back to rule-based.");
  }

  // ── 3. Rule-based fallback ──────────────────────────────────────────────────
  return buildRuleBasedResponse(userMessage, employeeName, kyc, language);
}

// ─── KYC Status Helpers ───────────────────────────────────────────────────────

export function computeKycOverallStatus(kyc: Partial<KycStatus>): string {
  const fields = [
    kyc.aadhaarSubmitted,
    kyc.panSubmitted,
    kyc.bankDetailsSubmitted,
    kyc.cancelledChequeSubmitted,
    kyc.addressProofSubmitted,
    kyc.photographSubmitted,
  ];
  const submittedCount = fields.filter(Boolean).length;
  if (submittedCount === 0) return "pending";
  if (submittedCount === fields.length) return "complete";
  return "partial";
}

// ─── Follow-up Escalation Engine ──────────────────────────────────────────────

// Day schedule: 1 → 3 → 5 → 7 → 10
const DAY_SCHEDULE = [1, 3, 5, 7, 10];

function getNextDayNumber(current: number): number | null {
  const idx = DAY_SCHEDULE.indexOf(current);
  if (idx === -1 || idx >= DAY_SCHEDULE.length - 1) return null;
  return DAY_SCHEDULE[idx + 1];
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysFromDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const DAY_GAPS: Record<number, number> = { 1: 2, 3: 2, 5: 2, 7: 3, 10: 0 };

const TASK_TYPE_LABELS: Record<string, string> = {
  kyc_pending: "KYC Document Submission",
  pf_kyc: "PF KYC Update",
  esic_pending: "ESIC Registration",
  bank_details: "Bank Details Submission",
  onboarding: "Onboarding Tasks",
  exit: "Exit Formalities",
};

async function runFollowUpSweep(): Promise<{ processed: number; sent: number }> {
  const now = new Date().toISOString();
  let processed = 0;
  let sent = 0;

  try {
    const dueTasks = await db
      .select()
      .from(aiFollowUpTasks)
      .where(and(eq(aiFollowUpTasks.status, "pending"), lte(aiFollowUpTasks.nextReminderAt, now)));

    for (const task of dueTasks) {
      processed++;
      const taskLabel = TASK_TYPE_LABELS[task.taskType] ?? task.taskType;

      // Resolve employee user
      let targetUserId = task.userId;
      let employeeName = "Employee";

      if (!targetUserId && task.employeeId) {
        const emp = await db
          .select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, task.employeeId))
          .limit(1);
        if (emp[0]) {
          targetUserId = emp[0].userId;
          employeeName = `${emp[0].firstName} ${emp[0].lastName}`.trim();
        }
      }

      // Send notification to employee
      if (targetUserId) {
        const dayMsg: Record<number, string> = {
          1: `Reminder: Please complete your ${taskLabel}.`,
          3: `Follow-up: Your ${taskLabel} is still pending. Please take action today.`,
          5: `Urgent: Your ${taskLabel} remains incomplete. HR has been informed.`,
          7: `Action Required: Your ${taskLabel} is overdue. Your manager has been notified.`,
          10: `Final Notice: Your ${taskLabel} is critically overdue. Please contact HR immediately.`,
        };

        await createNotification({
          userId: targetUserId,
          companyId: task.companyId,
          type: "ai_followup",
          title: `AI HR: ${taskLabel} Pending`,
          message: dayMsg[task.dayNumber] ?? `Please complete your ${taskLabel}.`,
          link: "/ai-assistant",
        });
        sent++;
      }

      // Day 7+: also notify HR admin(s) in the company
      if (task.dayNumber >= 7) {
        const hrAdmins = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.companyId, task.companyId),
              or(eq(usersTable.role, "hr_admin"), eq(usersTable.role, "company_admin")),
            ),
          );

        for (const hr of hrAdmins) {
          await createNotification({
            userId: hr.id,
            companyId: task.companyId,
            type: "ai_escalation",
            title: `Escalation: ${employeeName} — ${taskLabel}`,
            message: `${employeeName} has not completed ${taskLabel} for ${task.dayNumber} days. Immediate action may be required.`,
            link: "/ai-hr-dashboard",
          });
          sent++;
        }

        await db
          .update(aiFollowUpTasks)
          .set({ escalatedAt: now, updatedAt: now })
          .where(eq(aiFollowUpTasks.id, task.id));
      }

      // Day 10+: notify reporting manager
      if (task.dayNumber >= 10) {
        const emp = await db
          .select({ reportingManager: employees.reportingManager })
          .from(employees)
          .where(eq(employees.id, task.employeeId))
          .limit(1);

        const managerId = emp[0]?.reportingManager;
        if (managerId) {
          const mgr = await db
            .select({ userId: employees.userId })
            .from(employees)
            .where(eq(employees.id, managerId))
            .limit(1);

          if (mgr[0]?.userId) {
            await createNotification({
              userId: mgr[0].userId,
              companyId: task.companyId,
              type: "ai_manager_alert",
              title: `Manager Alert: ${employeeName} — ${taskLabel} Overdue`,
              message: `Your team member ${employeeName} has not completed ${taskLabel} for 10+ days. Please follow up directly.`,
              link: "/ai-hr-dashboard",
            });
            sent++;
          }
        }

        await db
          .update(aiFollowUpTasks)
          .set({ status: "escalated", updatedAt: now })
          .where(eq(aiFollowUpTasks.id, task.id));
        continue;
      }

      // Advance to next day in schedule
      const nextDay = getNextDayNumber(task.dayNumber);
      if (nextDay === null) {
        await db
          .update(aiFollowUpTasks)
          .set({ status: "escalated", remindersSent: task.remindersSent + 1, lastReminderAt: now, updatedAt: now })
          .where(eq(aiFollowUpTasks.id, task.id));
      } else {
        const gapDays = DAY_GAPS[task.dayNumber] ?? 2;
        const nextReminderAt = daysFromDate(now, gapDays);
        await db
          .update(aiFollowUpTasks)
          .set({
            dayNumber: nextDay,
            remindersSent: task.remindersSent + 1,
            lastReminderAt: now,
            nextReminderAt,
            updatedAt: now,
          })
          .where(eq(aiFollowUpTasks.id, task.id));
      }
    }
  } catch (err) {
    console.error("[AI Follow-up] Sweep error:", err);
  }

  return { processed, sent };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _schedulerStarted = false;

export function startAiFollowUpScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  const INTERVAL_MS = 60 * 60 * 1000; // every hour

  const tick = async () => {
    const { processed, sent } = await runFollowUpSweep();
    if (processed > 0) {
      console.log(`[AI Follow-up] Sweep: ${processed} tasks checked, ${sent} notifications sent`);
    }
  };

  setTimeout(tick, 5000); // first run 5s after startup
  setInterval(tick, INTERVAL_MS);
  console.log("[AI Follow-up] Scheduler started — interval: 1h");
}

// ─── Create follow-up task helper ─────────────────────────────────────────────

export async function createFollowUpTask(
  employeeId: string,
  userId: string | null,
  companyId: string,
  taskType: string,
  metadata?: Record<string, any>,
): Promise<void> {
  const now = new Date().toISOString();
  const nextReminderAt = daysFromNow(1);

  // Upsert: if a pending task of same type exists, reset it
  const existing = await db
    .select()
    .from(aiFollowUpTasks)
    .where(
      and(
        eq(aiFollowUpTasks.employeeId, employeeId),
        eq(aiFollowUpTasks.taskType, taskType),
        eq(aiFollowUpTasks.status, "pending"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiFollowUpTasks)
      .set({ nextReminderAt, dayNumber: 1, remindersSent: 0, updatedAt: now })
      .where(eq(aiFollowUpTasks.id, existing[0].id));
    return;
  }

  await db.insert(aiFollowUpTasks).values({
    id: randomUUID(),
    employeeId,
    userId: userId ?? undefined,
    companyId,
    taskType,
    status: "pending",
    dayNumber: 1,
    remindersSent: 0,
    nextReminderAt,
    metadata: metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });
}
