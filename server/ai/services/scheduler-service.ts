import { db } from "../../db";
import { AiFollowUpRepository } from "../../repositories/ai-follow-up-repository";
import { employees, aiFollowUpTasks, users as usersTable } from "../../../shared/schema";
import { eq, and, lte, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createNotification } from "../../notifications";
import { sendAiFollowUpEmail } from "../../services/email-service";
import { AI_CONFIG } from "../config";
import type { KycStatus } from "../types";

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
      let employeeEmail: string | null = null;

      if (task.employeeId) {
        const emp = await db
          .select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName, officialEmail: employees.officialEmail })
          .from(employees)
          .where(eq(employees.id, task.employeeId))
          .limit(1);
        if (emp[0]) {
          if (!targetUserId) targetUserId = emp[0].userId;
          employeeName = `${emp[0].firstName} ${emp[0].lastName}`.trim() || "Employee";
          employeeEmail = emp[0].officialEmail;
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
        if (employeeEmail) {
          await sendAiFollowUpEmail({
            to: employeeEmail,
            recipientName: employeeName,
            taskLabel,
            message: dayMsg[task.dayNumber] ?? `Please complete your ${taskLabel}.`,
            kind: "employee",
            companyId: task.companyId,
          });
        }
        sent++;
      }

      // Day 7+: also notify HR admin(s) in the company
      if (task.dayNumber >= 7) {
        const hrAdmins = await db
          .select({ id: usersTable.id, email: usersTable.email })
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
          if (hr.email) {
            await sendAiFollowUpEmail({
              to: hr.email,
              recipientName: "HR Team",
              taskLabel,
              message: `${employeeName} has not completed ${taskLabel} for ${task.dayNumber} days. Immediate action may be required.`,
              kind: "escalation",
              employeeName,
              companyId: task.companyId,
            });
          }
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
            .select({ userId: employees.userId, officialEmail: employees.officialEmail })
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
          if (mgr[0]?.officialEmail) {
            await sendAiFollowUpEmail({
              to: mgr[0].officialEmail,
              recipientName: "Manager",
              taskLabel,
              message: `Your team member ${employeeName} has not completed ${taskLabel} for 10+ days. Please follow up directly.`,
              kind: "manager",
              employeeName,
              companyId: task.companyId,
            });
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

  const INTERVAL_MS = AI_CONFIG.scheduler.intervalMs; // every hour

  const tick = async () => {
    const { processed, sent } = await runFollowUpSweep();
    if (processed > 0) {
      console.log(`[AI Follow-up] Sweep: ${processed} tasks checked, ${sent} notifications sent`);
    }
  };

  setTimeout(tick, AI_CONFIG.scheduler.firstRunDelayMs); // first run 5s after startup
  setInterval(tick, INTERVAL_MS);
  console.log("[AI Follow-up] Scheduler started — interval: 1h");
}

// ─── Create follow-up task helper ─────────────────────────────────────────────

const aiFollowUpRepo = new AiFollowUpRepository();

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
  const existing = await aiFollowUpRepo.findPending(employeeId, taskType);

  if (existing.length > 0) {
    await aiFollowUpRepo.resetPending(existing[0].id, {
      nextReminderAt,
      dayNumber: 1,
      remindersSent: 0,
      updatedAt: now,
    });
    return;
  }

  await aiFollowUpRepo.create({
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
