/**
 * Queue Worker — polls automation_jobs every 10 seconds, dispatches each job
 * to the correct EPFO or ESIC service function, and handles the full lifecycle:
 * pause on CAPTCHA/OTP, resume via in-memory resolver Map, retry with
 * exponential back-off, and crash recovery every 5 minutes.
 *
 * The worker starts at most MAX_CONCURRENT (3) jobs simultaneously so it
 * matches the BrowserPool capacity.
 */
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { BrowserContext, Page } from "playwright";
import { queueService, type JobRecord } from "../queue-service";
import { portalSessionService } from "../portal-session-service";
import { browserPool, prewarmBrowsers } from "./browser-pool";
import { sessionManager, type Portal } from "./session-manager";
import * as epfo from "./epfo-service";
import * as esic from "./esic-service";
import { db } from "../db";
import { automationJobs, esicFetchedEmployees, challans } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5_000;
const RECOVERY_INTERVAL_MS = 5 * 60_000;
const MAX_CONCURRENT = 1;
const JOB_TIMEOUT_MS = 10 * 60_000; // 10-minute hard ceiling per job (govt portals are slow)
const SCREENSHOT_BASE = path.join(process.cwd(), "uploads", "automation-screenshots");
const BACKOFF_SECONDS = [30, 120, 300]; // delay after 1st, 2nd, 3rd failure

// ─── Exported resume bridge ───────────────────────────────────────────────────
/**
 * In-memory map from jobId → resolver function.
 * The resume API route calls resolver(answer) to unblock the waiting automation.
 */
export const resumeResolvers = new Map<string, (answer: string) => void>();

/**
 * In-memory map from jobId → live Playwright Page.
 * The live-screenshot API route uses this to capture the current browser state.
 */
export const activePages = new Map<string, import("playwright").Page>();

/**
 * Browser contexts kept alive after a job succeeds.
 * Reused by subsequent jobs for the same company+portal so the user never
 * has to re-login between operations.  Auto-cleaned after IDLE_TTL_MS.
 */
const IDLE_TTL_MS = 4 * 60 * 60_000; // 4 hours — keeps browser alive through a full work session
interface IdleSession {
  page: import("playwright").Page;
  context: BrowserContext;
  browser: import("playwright").Browser;
  portal: string;
  timer: ReturnType<typeof setTimeout>;
}
/** Primary index: jobId → IdleSession */
const idleSessions = new Map<string, IdleSession>();
/** Secondary index: "companyId:portal" → jobId — for fast lookup by portal */
const idleByPortal = new Map<string, string>();

/**
 * Live browser resources for jobs that are CURRENTLY executing.
 * Used by abortJob() to tear down a running job's browser on demand so a
 * "Kill" action takes effect immediately instead of waiting for recovery.
 */
interface RunningSession {
  page: Page;
  context: BrowserContext;
  browser: import("playwright").Browser;
  portal: string;
}
const runningSessions = new Map<string, RunningSession>();

/** Job ids the user asked to kill — checked in the catch/finally so the job
 *  is marked 'cancelled' (not retried) and its browser is fully torn down. */
const cancelledJobIds = new Set<string>();

/**
 * Kill a job on demand (called from the cancel/kill API route).
 * Works whether the job is running or paused:
 *  - unblocks a paused CAPTCHA/OTP wait,
 *  - closes the live page so any in-flight Playwright call aborts quickly,
 *  - marks the job so the worker records it as 'cancelled' rather than retrying.
 * The processJob finally-block performs the full context/browser teardown.
 */
export async function abortJob(jobId: string): Promise<void> {
  cancelledJobIds.add(jobId);

  // 1. Unblock a paused job waiting on a resume resolver
  const resolver = resumeResolvers.get(jobId);
  if (resolver) {
    resumeResolvers.delete(jobId);
    try { resolver("__cancelled__"); } catch { /* ignore */ }
  }

  // 2. Close the live page so the running automation call rejects immediately.
  //    Context/browser release is left to processJob's finally to avoid double-release.
  const running = runningSessions.get(jobId);
  if (running) {
    try { await running.page.close(); } catch { /* ignore */ }
  }

  // 3. If this job's session is sitting idle (already completed), tear it down fully.
  const idle = idleSessions.get(jobId);
  if (idle) {
    clearTimeout(idle.timer);
    idleSessions.delete(jobId);
    for (const [k, v] of Array.from(idleByPortal.entries())) {
      if (v === jobId) idleByPortal.delete(k);
    }
    activePages.delete(jobId);
    try { await idle.page.close(); } catch { /* ignore */ }
    try { await idle.context.close(); } catch { /* ignore */ }
    browserPool.releaseBrowser(idle.portal, idle.browser);
  }
}

/**
 * Kill the idle browser session for a given company+portal.
 * Called before a fresh login so the browser starts clean (no stale cookies/state).
 */
export function killIdleSession(companyId: string, portal: string): void {
  const portalKey = `${companyId}:${portal}`;
  const idleJobId = idleByPortal.get(portalKey);
  if (!idleJobId) return;
  const idle = idleSessions.get(idleJobId);
  if (idle) {
    clearTimeout(idle.timer);
    activePages.delete(idleJobId);
    // Close browser resources async — don't await to avoid blocking the route
    idle.page.close().catch(() => {});
    idle.context.close().catch(() => {});
    browserPool.releaseBrowser(idle.portal, idle.browser);
  }
  idleSessions.delete(idleJobId);
  idleByPortal.delete(portalKey);
}

// ─── AutomationContext ─────────────────────────────────────────────────────────
/** Passed to every automation function. Provides logging, screenshots, pausing. */
export interface AutomationContext {
  jobId: string;
  companyId: string;
  screenshotDir: string;
  /** Write a log line to automation_logs */
  log(level: "info" | "warn" | "error" | "debug", message: string, meta?: Record<string, unknown>): Promise<void>;
  /** Save a screenshot and return its relative path */
  takeScreenshot(label: string): Promise<string>;
  /**
   * Pause the job (CAPTCHA or OTP). Saves screenshot, marks job paused,
   * and waits for admin to call the resume API.
   * Returns the answer provided by the admin.
   */
  pause(screenshotPath: string, reason: string): Promise<string>;
}

// ─── Worker state ─────────────────────────────────────────────────────────────
let activeJobCount = 0;
let workerRunning = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map job_type prefix to portal */
function getPortal(jobType: string): Portal {
  if (jobType.startsWith("epfo_") || jobType === "epfo_login_test") return "epfo";
  if (jobType.startsWith("esic_") || jobType === "esic_login_test") return "esic";
  throw new Error(`Unknown portal for job type: ${jobType}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Build the AutomationContext for a given job */
function buildContext(job: JobRecord, screenshotDir: string): AutomationContext {
  ensureDir(screenshotDir);
  let screenshotIndex = 0;

  return {
    jobId: job.id,
    companyId: job.companyId,
    screenshotDir,

    async log(level, message, meta) {
      try {
        await queueService.addLog(job.id, job.companyId, level, message, meta);
      } catch {
        console.error(`[QueueWorker] addLog failed: ${message}`);
      }
    },

    async takeScreenshot(label) {
      // This is called from service functions — we need a page reference.
      // The page is held in processJob's closure; service functions call this
      // indirectly. We return a placeholder path here; actual screenshot is
      // taken in processJob which has direct page access.
      const filename = `${String(screenshotIndex++).padStart(3, "0")}-${label}.png`;
      return path.join(screenshotDir, filename);
    },

    async pause(screenshotPath, reason) {
      await queueService.markJobPaused(job.id, screenshotPath);
      await queueService.addLog(job.id, job.companyId, "info", `Job paused: ${reason}`, { screenshotPath });

      // ── Release the active slot so the rest of the queue keeps moving ────────
      // Without this, a paused CAPTCHA/OTP job would block every other job
      // because activeJobCount stays at MAX_CONCURRENT indefinitely.
      activeJobCount--;

      const answer = await new Promise<string>((resolve) => {
        resumeResolvers.set(job.id, resolve);
      });

      // Reclaim the slot now that we are about to resume execution
      activeJobCount++;

      // A killed job unblocks the pause with this sentinel — abort immediately
      // instead of feeding it to the automation as a CAPTCHA/OTP answer, so no
      // further form fills or clicks happen on the portal.
      if (answer === "__cancelled__") {
        throw new Error("Job cancelled by user");
      }
      return answer;
    },
  };
}

/**
 * Override takeScreenshot in the context so the actual Playwright page is used.
 * Called after the page is available in processJob.
 */
function bindPageToContext(ctx: AutomationContext, page: Page): AutomationContext {
  let screenshotIndex = 0;
  return {
    ...ctx,
    async takeScreenshot(label: string): Promise<string> {
      const filename = `${String(screenshotIndex++).padStart(3, "0")}-${label}.png`;
      const filePath = path.join(ctx.screenshotDir, filename);
      try {
        await page.screenshot({ path: filePath, fullPage: true });
      } catch {
        // Page may already be closed — non-fatal
      }
      return filePath;
    },
  };
}

// ─── Job dispatcher ───────────────────────────────────────────────────────────
/**
 * Routes a job to the correct service function.
 * Uses the canonical job type names from shared/schema.ts automationJobTypes.
 * Returns the result object or throws.
 */
async function dispatch(
  job: JobRecord,
  page: Page,
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  const p = job.payload as Record<string, unknown>;

  switch (job.jobType) {
    // ── EPFO individual operations ─────────────────────────────────────────
    case "epfo_login_test": {
      const creds = await portalSessionService.getCredentials(job.companyId, "epfo");
      if (!creds) throw new Error("No EPFO credentials saved for this company");
      await epfo.epfoLogin(page, creds, ctx);
      return { ok: true };
    }
    case "epfo_uan_generate":
      return epfo.uanGenerate(page, p as any, ctx);
    case "epfo_kyc_aadhaar":
      return epfo.aadhaarKyc(page, p as any, ctx);
    case "epfo_kyc_pan":
      return epfo.panKyc(page, p as any, ctx);
    case "epfo_kyc_bank":
      return epfo.bankKyc(page, p as any, ctx);
    case "epfo_ecr_file":
      return epfo.ecrFiling(page, p as any, ctx);
    case "epfo_challan_download":
      return epfo.challanDownload(page, { ...(p as any), downloadDir: ctx.screenshotDir }, ctx);
    case "epfo_trrn_track":
      return epfo.trrnTrack(page, p as any, ctx);
    case "epfo_passbook_status":
      return epfo.passbookStatus(page, p as any, ctx);
    case "epfo_exit_management":
      return epfo.exitManagement(page, p as any, ctx);
    case "epfo_employee_list":
      return epfo.epfoEmployeeList(page, p as any, ctx);

    // ── EPFO bulk fan-out (no browser — just enqueue child jobs) ──────────
    case "epfo_bulk_register": {
      const jobs = epfo.getBulkRegisterJobs(p as any);
      if (jobs.length === 0) throw new Error("No employees eligible for EPFO registration — nothing was enqueued.");
      for (const j of jobs) {
        await queueService.enqueueJob({
          jobType: j.jobType,
          companyId: job.companyId,
          payload: j.payload,
          maxRetries: 3,
          createdBy: job.createdBy ?? undefined,
        });
      }
      return { enqueued: jobs.length };
    }
    case "epfo_bulk_ecr": {
      const jobs = epfo.getBulkEcrJobs(p as any);
      if (jobs.length === 0) throw new Error("No ECR filings to process — nothing was enqueued.");
      for (const j of jobs) {
        await queueService.enqueueJob({
          jobType: j.jobType,
          companyId: job.companyId,
          payload: j.payload,
          maxRetries: 3,
          createdBy: job.createdBy ?? undefined,
        });
      }
      return { enqueued: jobs.length };
    }

    // ── ESIC individual operations ─────────────────────────────────────────
    case "esic_login_test": {
      const creds = await portalSessionService.getCredentials(job.companyId, "esic");
      if (!creds) throw new Error("No ESIC credentials saved for this company");
      await esic.esicLogin(page, creds, ctx);
      return { ok: true };
    }
    case "esic_ip_generate":
      return esic.ipNumberGenerate(page, p as any, ctx);
    case "esic_family_declaration":
      return esic.familyDeclaration(page, p as any, ctx);
    case "esic_monthly_file":
      return esic.monthlyContributionFiling(page, p as any, ctx);
    case "esic_challan_download": {
      const result = await esic.esicChallanDownload(page, { ...(p as any), downloadDir: ctx.screenshotDir }, ctx);
      if (result.challanNo) {
        const now = new Date().toISOString();
        await db.insert(challans).values({
          id: randomUUID(),
          companyId: job.companyId,
          portal: "esic",
          month: String(result.month ?? ""),
          year: Number(result.year ?? new Date().getFullYear()),
          challanNo: String(result.challanNo),
          filePath: result.filePath ? String(result.filePath) : null,
          status: "downloaded",
          jobId: job.id,
          createdBy: job.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing().catch(() => {});
      }
      return result;
    }
    case "esic_employee_search":
      return esic.esicEmployeeSearch(page, p as any, ctx);
    case "esic_employee_list":
      return esic.esicEmployeeList(page, p as any, ctx);
    case "esic_contribution_tracking":
      return esic.contributionTracking(page, p as any, ctx);
    case "esic_contribution_pdf": {
      const REPORT_DIR = path.join(process.cwd(), "uploads", "esic-reports");
      if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
      return esic.contributionHistoryPdf(page, { ...(p as any), reportDir: REPORT_DIR }, ctx);
    }

    // ── ESIC card downloads (stub — extend when portal selectors are known) ─
    case "esic_temp_card_download":
      return esicCardDownload(page, p, "temp_card", ctx);
    case "esic_pehchan_card_download":
      return esicCardDownload(page, p, "pehchan_card", ctx);

    // ── ESIC bulk fan-out ──────────────────────────────────────────────────
    case "esic_bulk_register": {
      const employees = (p.employees as Array<Record<string, unknown>>) ?? [];
      if (employees.length === 0) throw new Error("No employees eligible for ESIC registration — nothing was enqueued.");
      for (const emp of employees) {
        await queueService.enqueueJob({
          jobType: "esic_ip_generate",
          companyId: job.companyId,
          payload: emp,
          maxRetries: 3,
          createdBy: job.createdBy ?? undefined,
        });
      }
      return { enqueued: employees.length };
    }

    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

/** Shared helper for ESIC card downloads (temp card / Pehchan card) */
async function esicCardDownload(
  page: Page,
  payload: Record<string, unknown>,
  cardType: string,
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  const ESIC_BASE = "https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal";
  const urlMap: Record<string, string> = {
    temp_card: `${ESIC_BASE}/TempCard.aspx`,
    pehchan_card: `${ESIC_BASE}/PehchanCard.aspx`,
  };
  await ctx.log("info", `Downloading ESIC ${cardType}`, payload);
  await page.goto(urlMap[cardType] ?? ESIC_BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const ipNumber = (payload.ipNumber as string) ?? "";
  if (ipNumber) {
    await page.fill('#txtIPNo, input[name*="ipNo" i]', ipNumber).catch(() => {});
    await page.click('#btnSearch, button[id*="search" i]').catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }

  await ctx.takeScreenshot(`${cardType}-page`);
  const downloadDir = ctx.screenshotDir;
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click('#btnDownload, a[id*="download" i]'),
    ]);
    const filePath = `${downloadDir}/${download.suggestedFilename()}`;
    await download.saveAs(filePath);
    await ctx.log("info", `${cardType} downloaded`, { filePath });
    return { cardType, ipNumber, filePath };
  } catch {
    // Download button not found or download didn't trigger — return page text
    const content = await page.textContent("body").catch(() => "");
    return { cardType, ipNumber, pageContent: content?.slice(0, 500) };
  }
}

// ─── Bulk jobs (no browser needed) ───────────────────────────────────────────
const BROWSER_FREE_JOB_TYPES = new Set(["epfo_bulk_register", "epfo_bulk_ecr", "esic_bulk_register"]);

// ─── Main job processor ───────────────────────────────────────────────────────
async function processJob(job: JobRecord): Promise<void> {
  // NOTE: the activeJobCount slot is reserved by tryClaimAndRun() before this
  // job is claimed; processJob's finally releases it. Do not increment here.
  const screenshotDir = path.join(SCREENSHOT_BASE, job.id);
  ensureDir(screenshotDir);

  let portal: Portal | null = null;
  let browser: import("playwright").Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let jobSucceeded = false;
  let contextIsReused = false; // true when we borrowed an existing idle context
  const isLoginTestJob = job.jobType === "epfo_login_test" || job.jobType === "esic_login_test";

  try {
    await queueService.addLog(job.id, job.companyId, "info", `Starting job: ${job.jobType}`, {
      jobType: job.jobType,
      attempt: job.retryCount + 1,
    });

    // Browser-free jobs (bulk fan-out) don't need a browser
    if (BROWSER_FREE_JOB_TYPES.has(job.jobType)) {
      const ctx = buildContext(job, screenshotDir);
      const result = await dispatch(job, null as any, ctx);
      await queueService.markJobCompleted(job.id, result);
      await queueService.addLog(job.id, job.companyId, "info", "Job completed (no browser)", result);
      return;
    }

    portal = getPortal(job.jobType);

    // ── Reuse existing idle session for this company+portal if available ────────
    // This keeps ONE browser context alive across all operations so the user
    // never has to re-login between actions.
    const portalKey = `${job.companyId}:${portal}`;
    const idleJobId = idleByPortal.get(portalKey);
    if (idleJobId) {
      const idle = idleSessions.get(idleJobId);
      if (idle && idle.context) {
        // Cancel the auto-close timer — we're taking over this context
        clearTimeout(idle.timer);
        idleSessions.delete(idleJobId);
        idleByPortal.delete(portalKey);
        activePages.delete(idleJobId);

        browser = idle.browser;
        context = idle.context;
        contextIsReused = true;
        await queueService.addLog(job.id, job.companyId, "info",
          "Reusing existing browser session — no re-login needed");
      }
    }

    if (!context) {
      // No reusable session — acquire browser and create a fresh context
      browser = await browserPool.acquireBrowser(portal);
      context = await browser.newContext({
        acceptDownloads: true,
        ignoreHTTPSErrors: true,   // EPFO/ESIC portals have self-signed / authority-invalid certs
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
    }

    page = await context.newPage();
    // Cap every individual page action at 25s so a missing selector
    // fails quickly instead of hanging for the Playwright default (30s).
    page.setDefaultTimeout(25_000);
    // Auto-dismiss any browser-native JS alert/confirm/prompt dialogs immediately.
    // Government portals sometimes use alert() for session warnings.
    page.on("dialog", dialog => { dialog.dismiss().catch(() => {}); });
    // Register page so the live-screenshot API can capture it
    activePages.set(job.id, page);
    // Register live browser resources so abortJob() can kill this job on demand
    if (browser && portal) {
      runningSessions.set(job.id, { page, context, browser, portal });
    }
    // If a kill arrived before the page was ready, honour it now
    if (cancelledJobIds.has(job.id)) {
      throw new Error("Job cancelled by user");
    }

    // Build context with page bound for real screenshots
    const baseCtx = buildContext(job, screenshotDir);
    const ctx = bindPageToContext(baseCtx, page);

    // Login-test jobs ARE the login — they call esicLogin/epfoLogin inside dispatch().
    // All other job types need a valid session before dispatch runs.
    const isLoginTestJob = job.jobType === "epfo_login_test" || job.jobType === "esic_login_test";

    // Take before-screenshot
    await ctx.takeScreenshot("before");

    if (!isLoginTestJob) {
      // If context is reused it already has live cookies — skip DB restore
      const hadSession = contextIsReused
        ? true
        : await sessionManager.restoreSession(job.companyId, portal, context);

      if (!hadSession) {
        const creds = await portalSessionService.getCredentials(job.companyId, portal);
        if (!creds) {
          throw new Error(`No ${portal.toUpperCase()} credentials saved for company ${job.companyId}`);
        }
        if (portal === "epfo") {
          await epfo.epfoLogin(page, creds, ctx);
        } else {
          await esic.esicLogin(page, creds, ctx);
        }
        await sessionManager.saveSession(job.companyId, portal, context);
        // Kill any popups that appeared right after login before handing off to dispatch
        if (portal === "esic") {
          await esic.dismissEsicPopups(page, ctx);
          await page.waitForTimeout(500);
          await esic.dismissEsicPopups(page, ctx);
        }
      } else if (contextIsReused) {
        // ── Context reused from a completed login job ─────────────────────────
        // The session is ALREADY live — no URL navigation needed.
        // Just clear any popups that are still open on the current page.
        await ctx.log("info", "Reused session — clearing popups on current page (no URL jump)");
        if (portal === "esic") {
          await esic.dismissEsicPopups(page, ctx);
          await page.waitForTimeout(600);
          await esic.dismissEsicPopups(page, ctx);
          await page.waitForTimeout(600);
          await esic.dismissEsicPopups(page, ctx);
        }
      } else {
        // ── Cookies restored from DB — navigate to dashboard to validate session ─
        const dashboardUrl = portal === "epfo"
          ? "https://unifiedportal-emp.epfindia.gov.in/epfo/"
          : "https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/Default.aspx";
        await ctx.log("info", `Checking DB-restored session — navigating to dashboard`);
        await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});

        if (sessionManager.isLoginPage(page.url(), portal)) {
          await ctx.log("info", "Session expired — re-logging in");
          await sessionManager.clearSession(job.companyId, portal);
          const creds = await portalSessionService.getCredentials(job.companyId, portal);
          if (!creds) throw new Error(`No ${portal.toUpperCase()} credentials after session expiry`);
          if (portal === "epfo") {
            await epfo.epfoLogin(page, creds, ctx);
          } else {
            await esic.esicLogin(page, creds, ctx);
          }
          await sessionManager.saveSession(job.companyId, portal, context);
        }
        // Dismiss all popups on the dashboard (ESIC stacks 3 notification alerts)
        if (portal === "esic") {
          await esic.dismissEsicPopups(page, ctx);
          await page.waitForTimeout(800);
          await esic.dismissEsicPopups(page, ctx);
          await page.waitForTimeout(800);
          await esic.dismissEsicPopups(page, ctx);
        }
      }
    }

    // Execute the job
    const result = await dispatch(job, page, ctx);

    // After esic_employee_list: persist normalized employees to DB
    if (job.jobType === "esic_employee_list" && Array.isArray(result?.employees) && result.employees.length > 0) {
      try {
        const fetchedAt = (result.fetchedAt as string) ?? new Date().toISOString();
        const now = new Date().toISOString();
        const emps = result.employees as Array<{ ipNo: string; name: string; dateOfRegistration: string }>;
        // Replace all previous records for this company with the fresh list
        await db.execute(sql`DELETE FROM esic_fetched_employees WHERE company_id = ${job.companyId}`);
        for (const emp of emps) {
          if (!emp.ipNo && !emp.name) continue;
          await db.execute(sql`
            INSERT INTO esic_fetched_employees (id, company_id, ip_no, name, date_of_registration, job_id, fetched_at, created_at)
            VALUES (${randomUUID()}, ${job.companyId}, ${emp.ipNo ?? ""}, ${emp.name ?? ""}, ${emp.dateOfRegistration ?? null}, ${job.id}, ${fetchedAt}, ${now})
          `);
        }
        await ctx.log("info", `Saved ${emps.length} ESIC employees to DB`);
      } catch (saveErr) {
        await ctx.log("warn", `Failed to save ESIC employees to DB: ${saveErr}`);
      }
    }

    // After-screenshot
    await ctx.takeScreenshot("after");

    // Persist updated cookies
    await sessionManager.saveSession(job.companyId, portal, context);

    await queueService.markJobCompleted(job.id, result);
    await queueService.addLog(job.id, job.companyId, "info", "Job completed successfully", result);
    jobSucceeded = true;
  } catch (err: unknown) {
    let errorMessage = err instanceof Error ? err.message : String(err);

    // ── User-requested kill ──────────────────────────────────────────────────
    // If this job was cancelled on demand, record it as 'cancelled' (never retry)
    // and skip the error translation / back-off logic entirely.
    if (cancelledJobIds.has(job.id)) {
      const now = new Date().toISOString();
      await db.update(automationJobs)
        .set({ status: "cancelled", completedAt: now, updatedAt: now })
        .where(eq(automationJobs.id, job.id))
        .catch(() => {});
      await queueService.addLog(job.id, job.companyId, "info", "Job cancelled by user").catch(() => {});
      return; // finally-block handles teardown
    }

    const portal = job.jobType.startsWith("epfo") ? "EPFO" : "ESIC";

    // Translate cryptic Playwright / network errors into plain-language messages.
    if (errorMessage.includes("Executable doesn't exist at")) {
      // ── Chromium binary file literally missing ─────────────────────────────
      errorMessage =
        "Chromium browser not found on server. " +
        `SSH in and run (from the app directory):  cd ${process.cwd()} && npx playwright install chromium  — then restart the server.`;
    } else if (
      errorMessage.includes("browserType.launch") ||
      errorMessage.includes("Failed to launch") ||
      errorMessage.includes("error while loading shared libraries")
    ) {
      // ── Binary found but cannot execute — missing system shared libraries ──
      // On Ubuntu 24.04 the t64 package transition means apt-get names changed.
      // `playwright install-deps` knows the exact package list for the installed
      // Chromium revision and handles the t64 naming automatically.
      const firstUsefulLine = errorMessage
        .split(/\n/)
        .find(l => l.includes("error") || l.includes("cannot") || l.includes("No such") || l.includes("SIGSEGV"))
        ?? errorMessage.substring(0, 300);
      const appDir = process.cwd();
      errorMessage =
        "Chromium is installed but cannot launch — missing system libraries on the server.\n" +
        "SSH in as root and run:\n" +
        `  export PATH="/home/workeazy-hrms/.nvm/versions/node/$(ls /home/workeazy-hrms/.nvm/versions/node | tail -1)/bin:$PATH"\n` +
        `  cd ${appDir} && node_modules/.bin/playwright install-deps chromium\n` +
        `  su - workeazy-hrms -c "pm2 restart hrms-pro --update-env"\n` +
        `Details: ${firstUsefulLine.trim()}`;
    } else if (
      errorMessage.includes("net::ERR_NAME_NOT_RESOLVED") ||
      errorMessage.includes("ERR_NAME_NOT_RESOLVED")
    ) {
      // ── DNS / no internet ──────────────────────────────────────────────────
      errorMessage =
        `${portal} portal could not be reached — the server cannot resolve the domain name. ` +
        "Check that the server has internet access and try again.";
    } else if (
      errorMessage.includes("net::ERR_CONNECTION_REFUSED") ||
      errorMessage.includes("ERR_CONNECTION_REFUSED")
    ) {
      // ── Connection refused ─────────────────────────────────────────────────
      errorMessage =
        `${portal} portal refused the connection — it may be temporarily down or blocking the server's IP. Try again in a few minutes.`;
    } else if (
      errorMessage.includes("net::ERR_INTERNET_DISCONNECTED") ||
      errorMessage.includes("ERR_INTERNET_DISCONNECTED") ||
      errorMessage.includes("net::ERR_NETWORK_CHANGED") ||
      errorMessage.includes("ERR_NETWORK_CHANGED")
    ) {
      // ── Network disconnected ───────────────────────────────────────────────
      errorMessage =
        `${portal} portal could not be reached — the server lost its internet connection. Try again in a few minutes.`;
    } else if (
      errorMessage.includes("ERR_HTTP_RESPONSE_CODE_FAILURE") ||
      errorMessage.includes("HTTP 404") ||
      errorMessage.includes("HTTP 40") ||
      errorMessage.includes("HTTP 50")
    ) {
      // ── HTTP error response from portal (4xx / 5xx) ────────────────────────
      const is404 = errorMessage.includes("404");
      errorMessage = is404
        ? `${portal} portal returned "Page Not Found" (HTTP 404). The portal URL may have changed or the server is temporarily unavailable. ` +
          "Please verify the portal is accessible from the server and try again."
        : `${portal} portal returned a server error. The portal may be temporarily down. Try again in a few minutes.`;
    } else if (
      errorMessage.includes("net::ERR_") ||
      errorMessage.includes("ERR_CONNECTION") ||
      errorMessage.includes("ERR_TIMED_OUT")
    ) {
      // ── Other network errors ───────────────────────────────────────────────
      errorMessage =
        `${portal} portal could not be reached (network error). The portal may be down or slow. Try again in a few minutes.`;
    } else if (
      (errorMessage.includes("Timeout") || errorMessage.includes("timeout")) &&
      (errorMessage.includes("navigation") ||
        errorMessage.includes("goto") ||
        errorMessage.includes("waiting for") ||
        errorMessage.includes("exceeded"))
    ) {
      // ── Navigation / wait timeout ──────────────────────────────────────────
      errorMessage =
        `${portal} portal took too long to respond — it may be slow or temporarily down. ` +
        "Try again in a few minutes. If this keeps happening, try opening the portal manually to check its status.";
    }

    console.error(`[QueueWorker] Job ${job.id} (${job.jobType}) failed:`, errorMessage);

    await queueService.addLog(job.id, job.companyId, "error", `Job failed: ${errorMessage}`, {
      stack: err instanceof Error ? err.stack : undefined,
    }).catch(() => {});

    // markJobFailed sets status to 'pending' if retries remain, else 'failed'
    await queueService.markJobFailed(job.id, errorMessage).catch(() => {});

    // Apply exponential back-off by updating scheduled_at for the next retry
    const backoffIdx = Math.min(job.retryCount, BACKOFF_SECONDS.length - 1);
    const backoffMs = BACKOFF_SECONDS[backoffIdx] * 1000;
    const scheduledAt = new Date(Date.now() + backoffMs).toISOString();

    // Only set scheduled_at if the job was re-queued (not permanently failed)
    if (job.retryCount + 1 < job.maxRetries) {
      await db
        .update(automationJobs)
        .set({ scheduledAt, updatedAt: new Date().toISOString() })
        .where(eq(automationJobs.id, job.id))
        .catch(() => {});
      await queueService.addLog(
        job.id,
        job.companyId,
        "warn",
        `Job re-queued with ${backoffMs / 1000}s backoff (attempt ${job.retryCount + 1}/${job.maxRetries})`
      ).catch(() => {});
    }
  } finally {
    const wasCancelled = cancelledJobIds.delete(job.id);
    runningSessions.delete(job.id);
    if (wasCancelled) {
      // ── Killed by user — full teardown, never revive an idle session ─────────
      activePages.delete(job.id);
      try { await page?.close(); } catch { /* ignore */ }
      try { await context?.close(); } catch { /* ignore */ }
      if (browser && portal) browserPool.releaseBrowser(portal, browser);
    } else if (jobSucceeded && page && context && browser && portal) {
      // ── Keep context alive for reuse by the next job ─────────────────────────
      // activePages entry is kept so live-screenshot keeps serving frames.
      // The secondary idleByPortal index lets the next job find this session.
      const capturedPage = page;
      const capturedCtx = context;
      const capturedBrowser = browser;
      const capturedPortal = portal;
      const portalKey = `${job.companyId}:${portal}`;

      const idleTimer = setTimeout(async () => {
        idleSessions.delete(job.id);
        idleByPortal.delete(portalKey);
        activePages.delete(job.id);
        try { await capturedPage.close(); } catch { /* ignore */ }
        try { await capturedCtx.close(); } catch { /* ignore */ }
        browserPool.releaseBrowser(capturedPortal, capturedBrowser);
      }, IDLE_TTL_MS);

      idleSessions.set(job.id, { page, context, browser, portal, timer: idleTimer });
      idleByPortal.set(portalKey, job.id);
      // Don't release the browser — it's still in use by the idle session
    } else if (jobSucceeded) {
      // Job succeeded but no page/context — shouldn't happen; clean up defensively
      activePages.delete(job.id);
    } else {
      // Job failed — clean up page. Keep context alive if it was reused
      // (so a future retry can still use the same session).
      activePages.delete(job.id);
      try { await page?.close(); } catch { /* ignore */ }
      if (!contextIsReused) {
        // Fresh context we created — close it
        try { await context?.close(); } catch { /* ignore */ }
        // Release the browser slot
        if (browser && portal) browserPool.releaseBrowser(portal, browser);
      }
      // If context was reused and job failed, put it back into idle so
      // the next job can try again with the same session.
      if (contextIsReused && context && browser && portal) {
        const portalKey = `${job.companyId}:${portal}`;
        const capturedCtx = context;
        const capturedBrowser = browser;
        const capturedPortal = portal;
        // Create a blank idle page so live-screenshot still works
        const idlePage = await context.newPage().catch(() => null);
        if (idlePage) {
          activePages.set(job.id + ":idle", idlePage);
          const idleTimer = setTimeout(async () => {
            idleSessions.delete(job.id);
            idleByPortal.delete(portalKey);
            activePages.delete(job.id + ":idle");
            try { await idlePage.close(); } catch { /* ignore */ }
            try { await capturedCtx.close(); } catch { /* ignore */ }
            browserPool.releaseBrowser(capturedPortal, capturedBrowser);
          }, IDLE_TTL_MS);
          idleSessions.set(job.id, { page: idlePage, context, browser, portal, timer: idleTimer });
          idleByPortal.set(portalKey, job.id);
        } else {
          // Couldn't create idle page — close everything
          try { await capturedCtx.close(); } catch { /* ignore */ }
          browserPool.releaseBrowser(capturedPortal, capturedBrowser);
        }
      }
    }
    activeJobCount--;
    // Drain the queue continuously: after EVERY job finishes (success, failure,
    // or cancellation) immediately try to claim the next one instead of waiting
    // the full 5s POLL_INTERVAL. This lets a real multi-step job flow straight
    // through to completion rather than stalling between steps. We call
    // tryClaimAndRun (not poll) so we don't spawn an extra recurring timer chain.
    setImmediate(() => tryClaimAndRun().catch(() => {}));
  }
}

// ─── Polling loop ─────────────────────────────────────────────────────────────
/**
 * Claim and start at most one job if there is spare capacity.
 *
 * The capacity slot is reserved *synchronously* (activeJobCount++) BEFORE the
 * async claim, so two callers racing here (the recurring poll timer and an
 * immediate post-job drain) can never both pass the capacity check and
 * over-claim beyond MAX_CONCURRENT. If nothing is claimed, the reservation is
 * released; otherwise ownership of the slot passes to processJob's finally.
 *
 * This function never re-arms the recurring timer — that is poll()'s job — so
 * calling it for an immediate drain does not spawn extra polling chains.
 */
async function tryClaimAndRun(): Promise<void> {
  if (activeJobCount >= MAX_CONCURRENT) return;
  activeJobCount++; // reserve the slot before the async claim
  let started = false;
  try {
    const job = await queueService.claimNextJob();
    if (job) {
      started = true; // slot ownership handed off to processJob's finally
      // Wrap every job in a hard timeout so a hung Playwright call can never
      // leave a job stuck in "running" forever.
      const jobPromise = processJob(job);
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000}s`)),
          JOB_TIMEOUT_MS
        )
      );
      Promise.race([jobPromise, timeoutPromise]).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[QueueWorker] Job ${job.id} (${job.jobType}) error: ${msg}`);
        // Best-effort: mark the job failed if it is still in a running state
        await queueService.markJobFailed(job.id, msg).catch(() => {});
      });
    }
  } catch (err) {
    console.error("[QueueWorker] poll error:", err);
  } finally {
    if (!started) activeJobCount--; // release the reservation — nothing claimed
  }
}

/** The single recurring poll chain. Only this re-arms the timer. */
async function poll(): Promise<void> {
  await tryClaimAndRun();
  setTimeout(poll, POLL_INTERVAL_MS);
}

// ─── Recovery cron ────────────────────────────────────────────────────────────
async function runRecovery(): Promise<void> {
  try {
    const recovered = await queueService.recoverStuckJobs(3);
    if (recovered > 0) {
      console.log(`[QueueWorker] Recovered ${recovered} stuck job(s)`);
    }
  } catch (err) {
    console.error("[QueueWorker] Recovery cron error:", err);
  }
  setTimeout(runRecovery, RECOVERY_INTERVAL_MS);
}

// ─── Public start function ────────────────────────────────────────────────────
/**
 * Start the queue worker. Idempotent — calling twice has no effect.
 * Called from server/routes.ts after all routes are registered.
 */
export function startQueueWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  ensureDir(SCREENSHOT_BASE);

  // ── Startup recovery ────────────────────────────────────────────────────────
  // On a fresh start all browser contexts from the previous process are gone.
  // Reset any jobs that were left in "running" or "paused" state so they are
  // re-queued and retried cleanly.  This fires immediately (0-minute cutoff)
  // because no active jobs can exist yet in a brand-new process.
  db.execute(sql`
    UPDATE automation_jobs
    SET status   = 'pending',
        started_at = NULL,
        updated_at = ${new Date().toISOString()}
    WHERE status IN ('running', 'paused')
  `).then((r: any) => {
    const n = r.rowCount ?? 0;
    if (n > 0) console.log(`[QueueWorker] Startup: reset ${n} orphaned running/paused job(s) to pending`);
  }).catch(() => {});

  console.log(`[QueueWorker] Starting — poll interval ${POLL_INTERVAL_MS / 1000}s, max concurrent: ${MAX_CONCURRENT}`);
  setTimeout(poll, 2000);       // slight delay to let the server finish starting
  setTimeout(runRecovery, 5000); // first recovery check after 5s

  // Pre-warm both portal browsers in the background so the first job
  // gets an already-running Chromium instead of waiting for a cold launch.
  setTimeout(() => prewarmBrowsers(["esic", "epfo"]), 3000);
}

export { queueService };
