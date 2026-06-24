// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  notifications, profileUpdateRequests, users as usersTable,
  contractorEmployees as contractorEmployeesTable, employees,
  insertUserSchema, insertCompanySchema, insertEmployeeSchema, insertAttendanceSchema,
  insertLeaveTypeSchema, insertLeaveRequestSchema, insertSalaryStructureSchema, insertPayrollSchema,
  insertSettingSchema, insertMasterDepartmentSchema, insertMasterDesignationSchema, insertMasterLocationSchema,
  insertEarningHeadSchema, insertDeductionHeadSchema, insertStatutorySettingsSchema, insertTimeOfficePolicySchema,
  insertFnfSettlementSchema, insertHolidaySchema, insertBiometricDeviceSchema, insertJobPostingSchema,
  insertJobApplicationSchema, insertWageGradeSchema, insertContractorMasterSchema
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { createNotification, createNotificationForMany } from "../notifications";
import { addSSEClient, removeSSEClient } from "../sse";
import { setOpenAIKeyOverride, setGeminiKeyOverride, loadAllApiKeysFromDB } from "../ai-service";
import { getAdmsActivityLog, getAdmsActivityLogFromDB, getAdmsServerStatus, processAttlog, processUserRecords } from "../adms";
import * as dnsPromises from "dns/promises";
import multer from "multer";
import { makeFileFilter, DOCUMENT_EXTENSIONS, DATA_EXTENSIONS, APK_EXTENSIONS } from "../upload-security";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
  requireAuth, requireRole, requireModuleAccess, requireAction,
  userHasAccess, MODULE_ACCESS, formatAge, resolveEmployeeUserId, getHrAdminIds,
  resolveAllowedLocationNames, getAllowedEmployeeIdsForUser,
  validateBiometricDeviceAuth, validateBiometricNetwork,
  upload, docUpload, companyAssetUpload, safeUnlinkCompanyAsset, fileToDataUri,
  COMPANY_ASSETS_DIR, DOC_UPLOAD_DIR, daysInMonth,
} from "./shared";
import { settingsService } from "../services";

// Multer for the global payment QR image (super admin uploads one shared QR)
const paymentQrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const PAYMENT_QR_KEY = "payment_qr_url";
const PAYMENT_UPI_KEY = "payment_upi_id";
const PAYMENT_NOTE_KEY = "payment_note";

async function upsertGlobalSetting(key: string, value: string): Promise<void> {
  const existing = await settingsService.getSettingByKey(null, key);
  if (existing) {
    await settingsService.updateSetting(existing.id, { value });
  } else {
    await settingsService.createSetting({ key, value, category: "payment", companyId: null });
  }
}

export async function registerBillingRoutes(app: Express): Promise<void> {
  // ===== CD Accounts (Credits & Billing) =====

  // Auto-create CD accounts for companies whose trial has completed
  async function autoCreateCdAccounts() {
    try {
      const now = new Date();
      const companies = await db.execute(sql`
        SELECT id, company_name, trial_start_date, trial_days, trial_extended_days
        FROM companies
        WHERE trial_start_date IS NOT NULL
          AND id NOT IN (SELECT company_id FROM cd_accounts)
      `);
      for (const c of companies.rows as any[]) {
        const startDate = new Date(c.trial_start_date);
        const totalDays = (c.trial_days ?? 3) + (c.trial_extended_days ?? 0);
        const expiryDate = new Date(startDate);
        expiryDate.setDate(expiryDate.getDate() + totalDays);
        if (now >= expiryDate) {
          const id = randomUUID();
          const ts = now.toISOString();
          await db.execute(sql`
            INSERT INTO cd_accounts (id, company_id, credit_balance, cost_per_employee_per_day, rate_effective_from, low_balance_threshold, allow_negative, notes, created_at, updated_at)
            VALUES (${id}, ${c.id}, 0, 15, ${ts.slice(0,10)}, 1000, false, 'Auto-created on trial completion', ${ts}, ${ts})
          `).catch(() => {});
        }
      }
    } catch (_) {}
  }

  // Run auto-creation on startup + every hour
  autoCreateCdAccounts();

  // ── Monthly Invoice Auto-Generation ─────────────────────────────────────
  function isLastDayOfMonth(d: Date): boolean {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return next.getDate() === 1;
  }

  // ── Daily Billing Engine ──────────────────────────────────────────────────
  // Runs every hour. For each company, bills every unbilled day from account
  // creation up to today — skipping any month that already has a monthly invoice.
  // Each daily entry deducts from the CD balance immediately.
  async function runDailyBilling() {
    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

      const accounts = await db.execute(sql`
        SELECT a.company_id, a.cost_per_employee_per_day, a.created_at,
          c.trial_start_date, c.trial_days, c.trial_extended_days,
          (SELECT COUNT(*) FROM employees e WHERE e.company_id = a.company_id AND e.status = 'active') as emp_count
        FROM cd_accounts a
        JOIN companies c ON c.id = a.company_id
      `);

      let billedDays = 0;
      for (const acct of accounts.rows as any[]) {
        const empCount = parseInt(acct.emp_count) || 0;
        const rate = parseFloat(acct.cost_per_employee_per_day) || 0;
        const acctCreatedDate = acct.created_at.slice(0, 10);

        // No billing during the free-trial period. Billing starts the day AFTER
        // the trial expires (trial_start + trial_days + extended, then +1 day).
        let billStartDate = acctCreatedDate;
        if (acct.trial_start_date) {
          const total = (parseInt(acct.trial_days) || 3) + (parseInt(acct.trial_extended_days) || 0);
          const firstBillable = new Date(acct.trial_start_date);
          firstBillable.setDate(firstBillable.getDate() + total + 1);
          const firstBillableStr = firstBillable.toISOString().slice(0, 10);
          if (firstBillableStr > billStartDate) billStartDate = firstBillableStr;
        }

        // Find all dates from billing start to today that:
        // 1. Don't already have a daily_billing_log
        // 2. Don't belong to a month that already has a monthly invoice
        //    (prevents double-deduction if an invoice was already generated)
        const missingDates = await db.execute(sql`
          SELECT gs::date::text AS date
          FROM generate_series(
            ${billStartDate}::date,
            ${todayStr}::date,
            '1 day'::interval
          ) gs
          WHERE gs::date::text NOT IN (
            SELECT date FROM daily_billing_logs WHERE company_id = ${acct.company_id}
          )
          AND LEFT(gs::date::text, 7) NOT IN (
            SELECT period_month FROM invoices WHERE company_id = ${acct.company_id}
          )
          ORDER BY gs::date
        `);

        for (const row of missingDates.rows as any[]) {
          const date = row.date;
          const amount = empCount * rate;
          const ts = now.toISOString();
          const logId = randomUUID();

          // Insert daily log (ON CONFLICT DO NOTHING as safety)
          await db.execute(sql`
            INSERT INTO daily_billing_logs (id, company_id, date, employee_count, rate_per_day, amount, created_at)
            VALUES (${logId}, ${acct.company_id}, ${date}, ${empCount}, ${rate}, ${amount}, ${ts})
            ON CONFLICT (company_id, date) DO NOTHING
          `);

          // Only deduct if the log was actually inserted (not a duplicate)
          const inserted = await db.execute(sql`
            SELECT id FROM daily_billing_logs WHERE id = ${logId}
          `);
          if ((inserted.rows as any[]).length === 0) continue;

          // Deduct from CD balance
          await db.execute(sql`
            UPDATE cd_accounts SET credit_balance = credit_balance - ${amount}, updated_at = ${ts}
            WHERE company_id = ${acct.company_id}
          `);

          // Record transaction
          const balRow = await db.execute(sql`SELECT credit_balance FROM cd_accounts WHERE company_id = ${acct.company_id}`);
          const balAfter = (balRow.rows[0] as any)?.credit_balance ?? 0;
          const txId = randomUUID();
          await db.execute(sql`
            INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
            VALUES (${txId}, ${acct.company_id}, 'debit', ${amount}, ${balAfter},
              ${`Daily charge: ${date} — ${empCount} emp × ₹${rate}/day`}, ${date}, null, ${ts})
          `);

          billedDays++;
        }
      }

      if (billedDays > 0) {
        console.log(`[DailyBilling] Processed ${billedDays} day(s) across all accounts`);
      }
    } catch (err) {
      console.error("[DailyBilling] Error:", err);
    }
  }

  // ── Monthly Invoice Generation ────────────────────────────────────────────
  // Runs on the last day of each month. Sums up daily_billing_logs for the
  // month and creates a summary invoice. NO balance deduction here — daily
  // billing already deducted each day.
  async function generateMonthlyInvoices(force = false) {
    try {
      const now = new Date();
      if (!force && !isLastDayOfMonth(now)) return;

      // Ensure today's daily billing is done before generating invoice
      await runDailyBilling();

      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const periodMonth = `${year}-${String(month).padStart(2, "0")}`;
      const periodFrom = `${periodMonth}-01`;
      const days = daysInMonth(year, month);
      const periodTo = `${periodMonth}-${String(days).padStart(2, "0")}`;

      // Get companies that have daily logs this month but no invoice yet
      const accounts = await db.execute(sql`
        SELECT DISTINCT dbl.company_id, c.company_name
        FROM daily_billing_logs dbl
        JOIN companies c ON c.id = dbl.company_id
        WHERE LEFT(dbl.date, 7) = ${periodMonth}
          AND dbl.company_id NOT IN (
            SELECT company_id FROM invoices WHERE period_month = ${periodMonth}
          )
      `);

      let generatedCount = 0;
      for (const acct of accounts.rows as any[]) {
        // Aggregate this month's daily logs
        const summary = await db.execute(sql`
          SELECT
            COUNT(*)::integer AS days_billed,
            SUM(amount) AS total_amount,
            ROUND(AVG(employee_count))::integer AS avg_emp_count,
            MIN(rate_per_day) AS rate_per_day
          FROM daily_billing_logs
          WHERE company_id = ${acct.company_id}
            AND date >= ${periodFrom} AND date <= ${periodTo}
        `);
        const s = summary.rows[0] as any;
        const daysBilled = parseInt(s?.days_billed) || 0;
        const totalAmount = parseFloat(s?.total_amount) || 0;
        const avgEmpCount = parseInt(s?.avg_emp_count) || 0;
        const ratePerDay = parseFloat(s?.rate_per_day) || 0;

        if (daysBilled === 0) continue;

        const seqRow = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM invoices WHERE period_month = ${periodMonth}
        `);
        const seq = (parseInt((seqRow.rows[0] as any)?.cnt) || 0) + 1;
        const invoiceNo = `INV-${periodMonth.replace("-", "")}-${String(seq).padStart(4, "0")}`;

        const invoiceId = randomUUID();
        const ts = now.toISOString();

        // Insert invoice — balance already deducted daily, no re-deduction
        await db.execute(sql`
          INSERT INTO invoices (id, invoice_no, company_id, period_month, period_from, period_to, employee_count, rate_per_day, days_in_period, total_amount, status, notes, created_at)
          VALUES (${invoiceId}, ${invoiceNo}, ${acct.company_id}, ${periodMonth}, ${periodFrom}, ${periodTo},
            ${avgEmpCount}, ${ratePerDay}, ${daysBilled}, ${totalAmount},
            'credited', ${`Auto-generated for ${periodMonth} — ${daysBilled} days billed`}, ${ts})
        `);

        generatedCount++;
        console.log(`[Invoice] Generated ${invoiceNo} for ${acct.company_name} — ₹${totalAmount} (${daysBilled} days)`);
      }

      if (generatedCount > 0) {
        console.log(`[Invoice] ${generatedCount} invoice(s) generated for ${periodMonth}`);
      }
    } catch (err) {
      console.error("[Invoice] Error generating monthly invoices:", err);
    }
  }

  // Run daily billing on startup + every hour; invoice check and CD account creation also runs hourly
  runDailyBilling();
  setInterval(() => {
    autoCreateCdAccounts();   // Create CD accounts for newly-expired trials
    runDailyBilling();        // Bill each company for today
    generateMonthlyInvoices(); // Generate monthly invoice on last day of month
  }, 60 * 60 * 1000);

  // Get all CD accounts (super_admin) or own (company_admin)
  app.get("/api/billing/accounts", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      let rows;
      if (user.role === "super_admin") {
        rows = await db.execute(sql`
          SELECT a.*, c.company_name, c.status as company_status,
            (SELECT COUNT(*) FROM employees e WHERE e.company_id = a.company_id AND e.status = 'active') as active_employee_count
          FROM cd_accounts a
          JOIN companies c ON c.id = a.company_id
          ORDER BY c.company_name ASC
        `);
      } else {
        rows = await db.execute(sql`
          SELECT a.*, c.company_name, c.status as company_status,
            (SELECT COUNT(*) FROM employees e WHERE e.company_id = a.company_id AND e.status = 'active') as active_employee_count
          FROM cd_accounts a
          JOIN companies c ON c.id = a.company_id
          WHERE a.company_id = ${user.companyId}
        `);
      }
      const accounts = (rows.rows as any[]).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        companyName: r.company_name,
        companyStatus: r.company_status,
        creditBalance: r.credit_balance,
        costPerEmployeePerDay: r.cost_per_employee_per_day,
        rateEffectiveFrom: r.rate_effective_from,
        lowBalanceThreshold: r.low_balance_threshold,
        allowNegative: r.allow_negative,
        negativeLimit: r.negative_limit,
        notes: r.notes,
        activeEmployeeCount: r.active_employee_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch billing accounts" });
    }
  });

  // Get companies without a CD account (for setup)
  app.get("/api/billing/unregistered-companies", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT c.id, c.company_name FROM companies c
        WHERE c.id NOT IN (SELECT company_id FROM cd_accounts)
        ORDER BY c.company_name ASC
      `);
      res.json(rows.rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unregistered companies" });
    }
  });

  // Create CD account for a company
  app.post("/api/billing/accounts", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { companyId, costPerEmployeePerDay, rateEffectiveFrom, lowBalanceThreshold, allowNegative, negativeLimit, notes } = req.body;
      if (!companyId) return res.status(400).json({ error: "companyId is required" });
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO cd_accounts (id, company_id, credit_balance, cost_per_employee_per_day, rate_effective_from, low_balance_threshold, allow_negative, negative_limit, notes, created_at, updated_at)
        VALUES (${id}, ${companyId}, 0, ${Number(costPerEmployeePerDay) || 15}, ${rateEffectiveFrom || now.slice(0,10)}, ${Number(lowBalanceThreshold) || 1000}, ${allowNegative === true}, ${Math.max(0, Number(negativeLimit) || 0)}, ${notes || null}, ${now}, ${now})
      `);
      const row = await db.execute(sql`
        SELECT a.*, c.company_name, c.status as company_status,
          (SELECT COUNT(*) FROM employees e WHERE e.company_id = a.company_id AND e.status = 'active') as active_employee_count
        FROM cd_accounts a JOIN companies c ON c.id = a.company_id WHERE a.id = ${id}
      `);
      res.json(row.rows[0]);
    } catch (error: any) {
      if (error?.message?.includes("unique")) return res.status(409).json({ error: "CD account already exists for this company" });
      res.status(500).json({ error: "Failed to create billing account" });
    }
  });

  // Update CD account settings (rate, threshold, allowNegative, notes)
  app.patch("/api/billing/accounts/:companyId", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { companyId } = req.params;
      const { costPerEmployeePerDay, lowBalanceThreshold, allowNegative, negativeLimit, rateEffectiveFrom, notes } = req.body;
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE cd_accounts
        SET cost_per_employee_per_day = ${Number(costPerEmployeePerDay) ?? 15},
            rate_effective_from = ${rateEffectiveFrom ?? null},
            low_balance_threshold = ${Number(lowBalanceThreshold) ?? 1000},
            allow_negative = ${allowNegative === true},
            negative_limit = ${Math.max(0, Number(negativeLimit) || 0)},
            notes = ${notes ?? null},
            updated_at = ${now}
        WHERE company_id = ${companyId}
      `);
      const row = await db.execute(sql`
        SELECT a.*, c.company_name, c.status as company_status,
          (SELECT COUNT(*) FROM employees e WHERE e.company_id = a.company_id AND e.status = 'active') as active_employee_count
        FROM cd_accounts a JOIN companies c ON c.id = a.company_id WHERE a.company_id = ${companyId}
      `);
      res.json(row.rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update billing account" });
    }
  });

  // Toggle allow-negative for a company
  app.patch("/api/billing/accounts/:companyId/toggle-negative", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { companyId } = req.params;
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE cd_accounts SET allow_negative = NOT allow_negative, updated_at = ${now}
        WHERE company_id = ${companyId}
      `);
      const row = await db.execute(sql`SELECT allow_negative FROM cd_accounts WHERE company_id = ${companyId}`);
      res.json({ allowNegative: row.rows[0]?.allow_negative });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle allow-negative" });
    }
  });

  // Add credits (super_admin manual top-up)
  app.post("/api/billing/accounts/:companyId/credit", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { companyId } = req.params;
      const { amount, description, referenceNo } = req.body;
      const amt = Number(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: "Amount must be positive" });
      const user = (req as any).user;
      const now = new Date().toISOString();
      // Update balance
      await db.execute(sql`UPDATE cd_accounts SET credit_balance = credit_balance + ${amt}, updated_at = ${now} WHERE company_id = ${companyId}`);
      const acct = await db.execute(sql`SELECT credit_balance FROM cd_accounts WHERE company_id = ${companyId}`);
      const balAfter = acct.rows[0]?.credit_balance ?? 0;
      const txId = randomUUID();
      await db.execute(sql`
        INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
        VALUES (${txId}, ${companyId}, 'credit', ${amt}, ${balAfter}, ${description || "Manual top-up"}, ${referenceNo || null}, ${user.id}, ${now})
      `);
      res.json({ success: true, balanceAfter: Number(balAfter) });
    } catch (error) {
      res.status(500).json({ error: "Failed to add credits" });
    }
  });

  // Deduct credits (super_admin manual adjustment)
  app.post("/api/billing/accounts/:companyId/debit", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { companyId } = req.params;
      const { amount, description, referenceNo } = req.body;
      const amt = Number(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: "Amount must be positive" });
      const user = (req as any).user;
      const now = new Date().toISOString();
      await db.execute(sql`UPDATE cd_accounts SET credit_balance = credit_balance - ${amt}, updated_at = ${now} WHERE company_id = ${companyId}`);
      const acct = await db.execute(sql`SELECT credit_balance FROM cd_accounts WHERE company_id = ${companyId}`);
      const balAfter = acct.rows[0]?.credit_balance ?? 0;
      const txId = randomUUID();
      await db.execute(sql`
        INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
        VALUES (${txId}, ${companyId}, 'debit', ${amt}, ${balAfter}, ${description || "Manual debit"}, ${referenceNo || null}, ${user.id}, ${now})
      `);
      res.json({ success: true, balanceAfter: Number(balAfter) });
    } catch (error) {
      res.status(500).json({ error: "Failed to debit credits" });
    }
  });

  // ── Invoice Routes ──────────────────────────────────────────────────────

  // List all invoices (super_admin) or own (company_admin)
  app.get("/api/billing/invoices", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      let rows;
      if (user.role === "super_admin") {
        rows = await db.execute(sql`
          SELECT i.*, c.company_name FROM invoices i
          JOIN companies c ON c.id = i.company_id
          ORDER BY i.period_month DESC, i.created_at DESC
          LIMIT 500
        `);
      } else {
        rows = await db.execute(sql`
          SELECT i.*, c.company_name FROM invoices i
          JOIN companies c ON c.id = i.company_id
          WHERE i.company_id = ${user.companyId}
          ORDER BY i.period_month DESC, i.created_at DESC
        `);
      }
      const invoices = (rows.rows as any[]).map((r) => ({
        id: r.id,
        invoiceNo: r.invoice_no,
        companyId: r.company_id,
        companyName: r.company_name,
        periodMonth: r.period_month,
        periodFrom: r.period_from,
        periodTo: r.period_to,
        employeeCount: r.employee_count,
        ratePerDay: r.rate_per_day,
        daysInPeriod: r.days_in_period,
        totalAmount: r.total_amount,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      }));
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // Manual trigger invoice generation for a specific month (super_admin only)
  app.post("/api/billing/invoices/generate", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      await generateMonthlyInvoices(true);
      res.json({ success: true, message: "Invoice generation triggered for current month." });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate invoices" });
    }
  });

  // Get daily billing logs for a company (optionally filtered by month YYYY-MM)
  app.get("/api/billing/daily-logs/:companyId", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.params;
      const { month } = req.query as { month?: string };
      if (user.role === "company_admin" && user.companyId !== companyId) return res.status(403).json({ error: "Forbidden" });
      const rows = await db.execute(sql`
        SELECT * FROM daily_billing_logs
        WHERE company_id = ${companyId}
          ${month ? sql`AND LEFT(date, 7) = ${month}` : sql``}
        ORDER BY date DESC
        LIMIT 400
      `);
      const logs = (rows.rows as any[]).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        date: r.date,
        employeeCount: r.employee_count,
        ratePerDay: r.rate_per_day,
        amount: r.amount,
        createdAt: r.created_at,
      }));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch daily billing logs" });
    }
  });

  // Manual trigger for daily billing (super_admin only)
  app.post("/api/billing/daily/run", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      await runDailyBilling();
      res.json({ success: true, message: "Daily billing run completed." });
    } catch (error) {
      res.status(500).json({ error: "Failed to run daily billing" });
    }
  });

  // Get transactions for a company
  app.get("/api/billing/transactions/:companyId", requireAuth, requireRole("super_admin", "company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.params;
      if (user.role === "company_admin" && user.companyId !== companyId) return res.status(403).json({ error: "Forbidden" });
      const rows = await db.execute(sql`
        SELECT t.*, u.first_name, u.last_name
        FROM cd_transactions t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.company_id = ${companyId}
        ORDER BY t.created_at DESC
        LIMIT 200
      `);
      const txs = (rows.rows as any[]).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        type: r.type,
        amount: r.amount,
        balanceAfter: r.balance_after,
        description: r.description,
        referenceNo: r.reference_no,
        firstName: r.first_name,
        lastName: r.last_name,
        createdAt: r.created_at,
      }));
      res.json(txs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // ===== Payment QR (global, super admin managed) =====

  // Get the payment QR + details — visible to any logged-in user (shown to blocked admins)
  app.get("/api/billing/payment-qr", requireAuth, async (_req, res) => {
    try {
      const [qrRow, upiRow, noteRow] = await Promise.all([
        settingsService.getSettingByKey(null, PAYMENT_QR_KEY),
        settingsService.getSettingByKey(null, PAYMENT_UPI_KEY),
        settingsService.getSettingByKey(null, PAYMENT_NOTE_KEY),
      ]);
      res.json({
        qrUrl: qrRow?.value || null,
        upiId: upiRow?.value || null,
        note: noteRow?.value || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment QR" });
    }
  });

  // Upload / update the payment QR + details (super admin only)
  app.post("/api/billing/payment-qr", requireAuth, requireRole("super_admin"), (req, res, next) => {
    paymentQrUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ error: msg });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const { upiId, note } = req.body as { upiId?: string; note?: string };
      if (req.file) {
        const prev = await settingsService.getSettingByKey(null, PAYMENT_QR_KEY);
        const oldPath = prev?.value || null;
        const urlPath = fileToDataUri(req.file);
        await upsertGlobalSetting(PAYMENT_QR_KEY, urlPath);
        if (oldPath && oldPath !== urlPath) safeUnlinkCompanyAsset(oldPath);
      }
      if (typeof upiId === "string") await upsertGlobalSetting(PAYMENT_UPI_KEY, upiId.trim());
      if (typeof note === "string") await upsertGlobalSetting(PAYMENT_NOTE_KEY, note.trim());

      const [qrRow, upiRow, noteRow] = await Promise.all([
        settingsService.getSettingByKey(null, PAYMENT_QR_KEY),
        settingsService.getSettingByKey(null, PAYMENT_UPI_KEY),
        settingsService.getSettingByKey(null, PAYMENT_NOTE_KEY),
      ]);
      res.json({
        qrUrl: qrRow?.value || null,
        upiId: upiRow?.value || null,
        note: noteRow?.value || null,
      });
    } catch (error) {
      console.error("Payment QR upload error:", error);
      res.status(500).json({ error: "Failed to save payment QR" });
    }
  });

  // Remove the payment QR image (super admin only)
  app.delete("/api/billing/payment-qr", requireAuth, requireRole("super_admin"), async (_req, res) => {
    try {
      const prev = await settingsService.getSettingByKey(null, PAYMENT_QR_KEY);
      if (prev?.value) {
        safeUnlinkCompanyAsset(prev.value);
        await settingsService.updateSetting(prev.id, { value: "" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove payment QR" });
    }
  });

  // ===== Payment Submissions (company-reported payments, super admin reviews) =====

  const paymentSubmissionSchema = z.object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    paymentDate: z.string().min(1, "Payment date is required"),
    referenceNo: z.string().min(1, "Reference number is required"),
    note: z.string().optional(),
  });

  function mapSubmission(r: any) {
    return {
      id: r.id,
      companyId: r.company_id,
      companyName: r.company_name ?? null,
      amount: r.amount,
      paymentDate: r.payment_date,
      referenceNo: r.reference_no,
      note: r.note,
      status: r.status,
      reviewNote: r.review_note,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      submittedBy: r.submitted_by,
      createdAt: r.created_at,
    };
  }

  // Company admin reports a payment from the trial-expired wall. Access is
  // granted immediately (status 'pending') until a super admin decides.
  app.post("/api/billing/payment-submission", requireAuth, requireRole("company_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.companyId) return res.status(400).json({ error: "No company associated with this account" });
      const parsed = paymentSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payment details" });
      }
      const { amount, paymentDate, referenceNo, note } = parsed.data;
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO payment_submissions
          (id, company_id, amount, payment_date, reference_no, note, status, submitted_by, created_at)
        VALUES
          (${id}, ${user.companyId}, ${amount}, ${paymentDate}, ${referenceNo}, ${note || null}, 'pending', ${user.id}, ${now})
      `);
      const row = await db.execute(sql`SELECT * FROM payment_submissions WHERE id = ${id}`);
      res.status(201).json(mapSubmission(row.rows[0]));
    } catch (error) {
      console.error("Payment submission error:", error);
      res.status(500).json({ error: "Failed to submit payment" });
    }
  });

  // Latest submission for the logged-in user's company (powers the wall status)
  app.get("/api/billing/payment-submission/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.companyId) return res.json(null);
      const row = await db.execute(sql`
        SELECT * FROM payment_submissions
        WHERE company_id = ${user.companyId}
        ORDER BY created_at DESC
        LIMIT 1
      `);
      res.json(row.rows[0] ? mapSubmission(row.rows[0]) : null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment submission" });
    }
  });

  // All submissions for super admin review
  app.get("/api/billing/payment-submissions", requireAuth, requireRole("super_admin"), async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT ps.*, c.company_name
        FROM payment_submissions ps
        LEFT JOIN companies c ON c.id = ps.company_id
        ORDER BY ps.created_at DESC
      `);
      res.json(rows.rows.map(mapSubmission));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment submissions" });
    }
  });

  // Approve / reject a submission. Rejecting re-locks the company immediately.
  app.patch("/api/billing/payment-submission/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { status, reviewNote } = req.body as { status?: string; reviewNote?: string };
      if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }
      const now = new Date().toISOString();

      const existing = await db.execute(sql`SELECT id FROM payment_submissions WHERE id = ${req.params.id}`);
      if (!existing.rows[0]) return res.status(404).json({ error: "Submission not found" });

      // Whole approve/credit operation runs in one transaction so the status
      // change, balance top-up and ledger entry either all commit or none do.
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          UPDATE payment_submissions
          SET status = ${status}, review_note = ${reviewNote || null}, reviewed_by = ${user.id}, reviewed_at = ${now}
          WHERE id = ${req.params.id}
        `);

        if (status === "approved") {
          // Atomically claim crediting: only the request that flips credited_at
          // from NULL proceeds, so the amount is added to the balance exactly
          // once even under concurrent approvals.
          const claim = await tx.execute(sql`
            UPDATE payment_submissions SET credited_at = ${now}
            WHERE id = ${req.params.id} AND credited_at IS NULL
            RETURNING amount, company_id, payment_date, reference_no
          `);
          const c = claim.rows[0] as any;
          if (c && Number(c.amount) > 0) {
            const amt = Number(c.amount);
            await tx.execute(sql`
              INSERT INTO cd_accounts (id, company_id, credit_balance, cost_per_employee_per_day, rate_effective_from, low_balance_threshold, allow_negative, notes, created_at, updated_at)
              VALUES (${randomUUID()}, ${c.company_id}, 0, 15, ${now.slice(0, 10)}, 1000, false, ${"Auto-created on payment approval"}, ${now}, ${now})
              ON CONFLICT (company_id) DO NOTHING
            `);
            const balRow = await tx.execute(sql`
              UPDATE cd_accounts SET credit_balance = credit_balance + ${amt}, updated_at = ${now}
              WHERE company_id = ${c.company_id}
              RETURNING credit_balance
            `);
            const balAfter = (balRow.rows[0] as any)?.credit_balance ?? 0;
            await tx.execute(sql`
              INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
              VALUES (${randomUUID()}, ${c.company_id}, 'credit', ${amt}, ${balAfter},
                ${`Payment approved — ${c.payment_date}`}, ${c.reference_no || null}, ${user.id}, ${now})
            `);
          }
        }
      });

      const row = await db.execute(sql`SELECT * FROM payment_submissions WHERE id = ${req.params.id}`);
      res.json(mapSubmission(row.rows[0]));
    } catch (error) {
      res.status(500).json({ error: "Failed to update payment submission" });
    }
  });
}
