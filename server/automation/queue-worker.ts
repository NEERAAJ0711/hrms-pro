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
import { browserPool } from "./browser-pool";
import { sessionManager, type Portal } from "./session-manager";
import * as epfo from "./epfo-service";
import * as esic from "./esic-service";
import { db } from "../db";
import { automationJobs } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;
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
 * Pages kept alive after a job succeeds so the live screen stays active.
 * Automatically cleaned up after IDLE_TTL_MS.
 */
const IDLE_TTL_MS = 5 * 60_000; // 5 minutes
interface IdleSession {
  page: import("playwright").Page;
  context: BrowserContext;
  timer: ReturnType<typeof setTimeout>;
}
const idleSessions = new Map<string, IdleSession>();

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

      return new Promise<string>((resolve) => {
        resumeResolvers.set(job.id, resolve);
      });
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
    case "esic_challan_download":
      return esic.esicChallanDownload(page, { ...(p as any), downloadDir: ctx.screenshotDir }, ctx);
    case "esic_employee_search":
      return esic.esicEmployeeSearch(page, p as any, ctx);
    case "esic_employee_list":
      return esic.esicEmployeeList(page, p as any, ctx);
    case "esic_contribution_tracking":
      return esic.contributionTracking(page, p as any, ctx);

    // ── ESIC card downloads (stub — extend when portal selectors are known) ─
    case "esic_temp_card_download":
      return esicCardDownload(page, p, "temp_card", ctx);
    case "esic_pehchan_card_download":
      return esicCardDownload(page, p, "pehchan_card", ctx);

    // ── ESIC bulk fan-out ──────────────────────────────────────────────────
    case "esic_bulk_register": {
      const employees = (p.employees as Array<Record<string, unknown>>) ?? [];
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
  activeJobCount++;
  const screenshotDir = path.join(SCREENSHOT_BASE, job.id);
  ensureDir(screenshotDir);

  let portal: Portal | null = null;
  let browser: import("playwright").Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let jobSucceeded = false;

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
    browser = await browserPool.acquireBrowser(portal);
    context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,   // EPFO/ESIC portals have self-signed / authority-invalid certs
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    page = await context.newPage();
    // Cap every individual page action at 25s so a missing selector
    // fails quickly instead of hanging for the Playwright default (30s).
    page.setDefaultTimeout(25_000);
    // Register page so the live-screenshot API can capture it
    activePages.set(job.id, page);

    // Build context with page bound for real screenshots
    const baseCtx = buildContext(job, screenshotDir);
    const ctx = bindPageToContext(baseCtx, page);

    // Login-test jobs ARE the login — they call esicLogin/epfoLogin inside dispatch().
    // All other job types need a valid session before dispatch runs.
    const isLoginTestJob = job.jobType === "epfo_login_test" || job.jobType === "esic_login_test";

    // Take before-screenshot
    await ctx.takeScreenshot("before");

    if (!isLoginTestJob) {
      // Restore saved session cookies (skip re-login if session is still valid)
      const hadSession = await sessionManager.restoreSession(job.companyId, portal, context);

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
      } else {
        // Navigate to the portal dashboard (NOT the login page) to check session validity
        const dashboardUrl = portal === "epfo"
          ? "https://unifiedportal-emp.epfindia.gov.in/epfo/"
          : "https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/Default.aspx";
        await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});

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
      }
    }

    // Execute the job
    const result = await dispatch(job, page, ctx);

    // After-screenshot
    await ctx.takeScreenshot("after");

    // Persist updated cookies
    await sessionManager.saveSession(job.companyId, portal, context);

    await queueService.markJobCompleted(job.id, result);
    await queueService.addLog(job.id, job.companyId, "info", "Job completed successfully", result);
    jobSucceeded = true;
  } catch (err: unknown) {
    let errorMessage = err instanceof Error ? err.message : String(err);

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
    if (jobSucceeded && page && context) {
      // Keep browser open so the live screen stays active after login.
      // activePages entry is intentionally NOT deleted — live-screenshot
      // keeps serving frames for the next IDLE_TTL_MS milliseconds.
      const capturedPage = page;
      const capturedCtx = context;
      const idleTimer = setTimeout(async () => {
        idleSessions.delete(job.id);
        activePages.delete(job.id);
        try { await capturedPage.close(); } catch { /* ignore */ }
        try { await capturedCtx.close(); } catch { /* ignore */ }
      }, IDLE_TTL_MS);
      idleSessions.set(job.id, { page, context, timer: idleTimer });
    } else {
      // Job failed or no page — clean up immediately
      activePages.delete(job.id);
      try { await page?.close(); } catch { /* ignore */ }
      try { await context?.close(); } catch { /* ignore */ }
    }
    // Always release the browser slot so the next job can acquire it
    if (browser && portal) {
      browserPool.releaseBrowser(portal, browser);
    }
    activeJobCount--;
  }
}

// ─── Polling loop ─────────────────────────────────────────────────────────────
async function poll(): Promise<void> {
  if (activeJobCount < MAX_CONCURRENT) {
    try {
      const job = await queueService.claimNextJob();
      if (job) {
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
    }
  }

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

  console.log(`[QueueWorker] Starting — poll interval ${POLL_INTERVAL_MS / 1000}s, max concurrent: ${MAX_CONCURRENT}`);
  setTimeout(poll, 2000);       // slight delay to let the server finish starting
  setTimeout(runRecovery, 5000); // first recovery check after 5s
}

export { queueService };
