/**
 * EPFO Automation Service
 *
 * Implements browser automation for the EPFO Unified Employer Portal
 * (https://unifiedportal-emp.epfindia.gov.in/epfo/).
 *
 * Each exported function receives a Playwright Page that is already navigated
 * to the EPFO portal (possibly with a valid session restored).  If any step
 * requires CAPTCHA or OTP resolution, it calls ctx.pause() which suspends
 * execution until the admin submits the answer via the resume API.
 *
 * NOTE: Portal selectors are based on the EPFO Unified Portal structure as of
 * 2025. If the portal is updated, selectors may need adjustment.
 */
import type { Page } from "playwright";
import type { AutomationContext } from "./queue-worker";

// ─── Navigation helper ────────────────────────────────────────────────────────
/**
 * Navigate to a URL with automatic retries on timeout.
 * Government portals are often slow — retry up to 3 times before failing.
 */
async function gotoWithRetry(
  page: Page,
  url: string,
  options: { waitUntil?: "domcontentloaded" | "load" | "networkidle" | "commit"; timeout?: number } = {},
  retries = 3
): Promise<void> {
  const timeout = options.timeout ?? 60000;
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await page.goto(url, { waitUntil, timeout });
      if (response) {
        const status = response.status();
        if (status === 404) {
          throw new Error(
            `EPFO portal page not found (HTTP 404) — the URL may have changed or the portal is temporarily unavailable. URL: ${url}`
          );
        }
        if (status >= 500) {
          throw new Error(
            `EPFO portal server error (HTTP ${status}) — the portal may be temporarily down. URL: ${url}`
          );
        }
      }
      return;
    } catch (err) {
      lastErr = err;
      // Don't retry explicit HTTP errors — retrying the same URL won't fix them
      if ((err as Error).message?.includes("HTTP 404") || (err as Error).message?.includes("HTTP 5")) {
        throw err;
      }
      if (attempt < retries) {
        await page.waitForTimeout(3000);
      }
    }
  }
  throw lastErr;
}

// ─── Portal URLs ──────────────────────────────────────────────────────────────
const EPFO_BASE = "https://unifiedportal-emp.epfindia.gov.in/epfo";
const EPFO_LOGIN_URL = "https://unifiedportal-emp.epfindia.gov.in/epfo/";

// ─── Selector constants ───────────────────────────────────────────────────────
const SEL = {
  // Login page
  username:          'input[name="username"], #username, input[placeholder*="User"], input[placeholder*="user"]',
  password:          'input[name="password"], #password, input[type="password"]',
  captchaInput:      [
    // EPFO unified portal — known IDs
    '#captchacode', '#captcha_code', '#Captcha', '#CaptchaCode',
    // Generic name/id patterns
    'input[name="captchacode"]', 'input[name="captcha"]', 'input[name="CaptchaCode"]',
    'input[name="captcha_code"]', 'input[name="Captcha"]',
    // ID patterns
    '#captcha', 'input[id*="captcha" i]', 'input[id*="Captcha"]',
    // Placeholder patterns
    'input[placeholder*="captcha" i]', 'input[placeholder*="verification" i]',
    'input[placeholder*="code" i][type="text"]',
    // Class patterns
    'input.captchaInput', 'input.captcha-input', '.captcha input[type="text"]',
  ].join(', '),
  captchaImage:      [
    // Image elements
    'img[id*="captcha" i]', 'img[alt*="captcha" i]', 'img[src*="captcha" i]',
    'img[id*="CaptchaImage"]', '#imgCaptcha', '#captchaImage', '#CaptchaImage',
    // Canvas (some portals render captcha on canvas)
    'canvas[id*="captcha" i]', 'canvas[class*="captcha" i]',
    // Div wrappers
    '.captchaImg', '.captcha-img', '.captcha img', '[class*="captcha" i] img',
    // EPFO specific
    'img[id="imgCaptcha"]', '#captchaimageId',
  ].join(', '),
  loginBtn:          'button[type="submit"], input[type="submit"], .loginBtn, #loginBtn',

  // Post-login employer home
  employerCode:      '.estCodeSpan, .empCode, span[id*="estCode"]',
  logoutLink:        'a[id*="logout" i], a[href*="logout" i]',

  // ECR filing
  ecrMenuLink:       'a[href*="ecr" i], a[title*="ECR" i]',
  ecrUploadBtn:      'input[type="file"][name*="ecr" i], #ecrFile',
  ecrWageMonth:      'select[name*="wageMonth" i], #wageMonth',
  ecrWageYear:       'select[name*="wageYear" i], #wageYear',
  ecrSubmitBtn:      'button[id*="submit" i], input[value*="Upload" i]',
  ecrTrrn:           '.trrn, #trrn, span[id*="trrn" i]',

  // KYC
  kycMenuLink:       'a[href*="kyc" i], a[title*="KYC" i]',
  kycUan:            'input[name*="uan" i], #uan',
  kycAadhaar:        'input[name*="aadhaar" i], #aadhaarNo',
  kycPan:            'input[name*="pan" i], #panNo',
  kycBankAccount:    'input[name*="bankAcc" i], #bankAcc',
  kycIfsc:           'input[name*="ifsc" i], #ifsc',
  kycSaveBtn:        'button[id*="save" i], input[value*="Save" i], input[value*="Update" i]',

  // Challan
  challanMenuLink:   'a[href*="challan" i]',
  challanTrrn:       'input[name*="trrn" i], #trrn',
  challanSearchBtn:  'button[id*="search" i], input[value*="Search" i]',
  challanDownBtn:    'a[href*="download" i], a[id*="download" i], button[id*="download" i]',

  // Member passbook / UAN details
  memberSearch:      'input[name*="uan" i], input[name*="member" i], #memberUan',
  memberSearchBtn:   'button[id*="search" i], input[value*="Search" i]',
  memberStatus:      '.memberStatus, td[class*="status" i]',

  // Exit management
  exitUan:           'input[name*="uan" i], #exitUan',
  exitDateInput:     'input[name*="exitDate" i], #exitDate',
  exitReasonSel:     'select[name*="exitReason" i], #exitReason',
  exitSubmitBtn:     'button[id*="submit" i], input[value*="Submit" i]',

  // OTP
  otpInput:          'input[name*="otp" i], #otp, input[placeholder*="OTP" i]',
  otpVerifyBtn:      'button[id*="verify" i], input[value*="Verify" i], button[id*="submit" i]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function safeScreenshot(page: Page, ctx: AutomationContext, label: string): Promise<string> {
  return ctx.takeScreenshot(label);
}

/**
 * Fill a statutory field (nominee, marital status, mother's name, etc.) and
 * report the outcome to the job log so a real-portal run produces verifiable
 * evidence of which selectors actually matched.
 *
 * These fields use best-effort selectors. Previously a missing field was
 * swallowed silently, so a wrong selector looked identical to success. This
 * helper logs whether each field was filled, skipped (no matching element on
 * the form), or matched-but-failed — turning a silent miss into an actionable
 * warning that names the selector to correct.
 *
 * Returns the outcome so callers can build a summary line for screenshots/logs.
 */
async function fillStatutoryField(
  page: Page,
  ctx: AutomationContext,
  label: string,
  selector: string,
  value: string | undefined,
): Promise<"filled" | "skipped-no-data" | "not-found" | "fill-failed"> {
  if (!value) return "skipped-no-data";
  const el = await page
    .waitForSelector(selector, { timeout: 3000, state: "visible" })
    .catch(() => null);
  if (!el) {
    await ctx.log(
      "warn",
      `Statutory field "${label}" was NOT filled — no matching field found on the portal form. Selector may need correcting.`,
      { selector, field: label },
    );
    return "not-found";
  }
  try {
    const tag = (await el.evaluate((node) => (node as Element).tagName)).toLowerCase();
    if (tag === "select") {
      await el
        .selectOption({ label: value })
        .catch(async () => {
          await el.selectOption(value);
        });
    } else {
      await el.fill(value);
    }
    await ctx.log("info", `Statutory field "${label}" filled successfully`, {
      selector,
      field: label,
    });
    return "filled";
  } catch (err) {
    await ctx.log(
      "warn",
      `Statutory field "${label}" matched a field but could not be filled — the field type or options may differ from expected.`,
      { selector, field: label, error: (err as Error).message },
    );
    return "fill-failed";
  }
}

/** Check if current page looks like a CAPTCHA challenge */
async function hasCaptcha(page: Page): Promise<boolean> {
  try {
    // 1. Check for a visible captcha image or canvas (give slow portals time to load)
    const imageVisible = await page.isVisible(SEL.captchaImage, { timeout: 5000 }).catch(() => false);
    if (imageVisible) return true;

    // 2. Check for a visible captcha input field (if input exists, captcha is required)
    const inputVisible = await page.isVisible(SEL.captchaInput, { timeout: 3000 }).catch(() => false);
    if (inputVisible) return true;

    // 3. Scan page text for captcha keywords — some portals just show a text prompt
    const bodyText = await page.textContent("body", { timeout: 1000 }).catch(() => "");
    if (/captcha|verification.?code|enter.?code|security.?code/i.test(bodyText ?? "")) {
      // Only trigger if there's also a visible text input
      const anyInput = await page.isVisible('input[type="text"], input[type="tel"]', { timeout: 500 }).catch(() => false);
      if (anyInput) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/** Check if current page looks like an OTP challenge */
async function hasOtp(page: Page): Promise<boolean> {
  try {
    const visible = await page.isVisible(SEL.otpInput, { timeout: 2000 });
    return visible;
  } catch {
    return false;
  }
}

/** Handle CAPTCHA: pause job and wait for admin to supply the answer */
async function solveCaptcha(
  page: Page,
  ctx: AutomationContext,
  label = "captcha"
): Promise<string> {
  await ctx.log("info", `CAPTCHA detected — pausing for admin input (${label})`);
  const screenshotPath = await safeScreenshot(page, ctx, label);
  const answer = await ctx.pause(screenshotPath, label);
  return answer;
}

/** Handle OTP: pause job and wait for admin to supply the OTP */
async function solveOtp(page: Page, ctx: AutomationContext, label = "otp"): Promise<string> {
  await ctx.log("info", `OTP required — pausing for admin input (${label})`);
  const screenshotPath = await safeScreenshot(page, ctx, label);
  const answer = await ctx.pause(screenshotPath, label);
  return answer;
}

// ─── Popup dismissal ──────────────────────────────────────────────────────────
/**
 * Dismisses ALL notification / alert popups on the current EPFO page.
 *
 * Uses a single JS evaluate call per round (same approach as ESIC service):
 *  - Scans inputs first (government portals use input[type=button] for close)
 *  - Then buttons, then short <a> links
 *  - Stops after 3 consecutive empty rounds
 *  - Does NOT break on first miss (old bug) — waits up to ~5s total
 *
 * Also dumps visible page text on first run so logs show what popup says.
 */
async function dismissAllPopups(page: Page, ctx: AutomationContext, tag = ""): Promise<void> {
  let emptyRounds = 0;
  let dumpedDom = false;

  for (let round = 0; round < 15; round++) {
    // Escape handles some native dialogs
    await page.keyboard.press("Escape").catch(() => {});

    // On first round, dump visible text so we can see what the popup says in logs
    if (!dumpedDom) {
      dumpedDom = true;
      const visibleText = await page.evaluate(function() {
        return (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 600);
      }).catch(() => "");
      await ctx.log("info", `[${tag}] Page visible text: ${visibleText}`);
    }

    const result = await page.evaluate(function() {
      var CLOSE_VALUES = [
        "x", "close", "ok", "okay", "i agree", "agree", "accept",
        "yes", "proceed", "continue", "okay", "dismiss", "got it",
        "\u00d7", "\u2715", "\u2716", "\u2713"
      ];

      function isElVisible(el) {
        try {
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          var s = window.getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
        } catch(e) { return false; }
      }

      // 1. input[type=button] / input[type=submit] — government portals love these
      var inputs = document.querySelectorAll('input[type="button"], input[type="submit"]');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (!isElVisible(inp)) continue;
        var val = (inp.value || "").trim().toLowerCase();
        if (CLOSE_VALUES.indexOf(val) !== -1) {
          inp.click();
          return { clicked: inp.value, elTag: "INPUT", id: inp.id || "(no id)", html: inp.outerHTML.slice(0, 200) };
        }
      }

      // 2. <button> elements
      var btns = document.querySelectorAll("button");
      for (var j = 0; j < btns.length; j++) {
        var btn = btns[j];
        if (!isElVisible(btn)) continue;
        var txt = (btn.textContent || "").trim().toLowerCase();
        if (CLOSE_VALUES.indexOf(txt) !== -1) {
          btn.click();
          return { clicked: btn.textContent.trim(), elTag: "BUTTON", id: btn.id || "(no id)", html: btn.outerHTML.slice(0, 200) };
        }
      }

      // 3. Short <a> links (navigation links have long text — skip them)
      var links = document.querySelectorAll("a");
      for (var k = 0; k < links.length; k++) {
        var lnk = links[k];
        if (!isElVisible(lnk)) continue;
        var ltxt = (lnk.textContent || "").trim();
        if (ltxt.length > 10) continue;
        if (CLOSE_VALUES.indexOf(ltxt.toLowerCase()) !== -1) {
          lnk.click();
          return { clicked: ltxt, elTag: "A", id: lnk.id || "(no id)", html: lnk.outerHTML.slice(0, 200) };
        }
      }

      // 4. ID-based close buttons (ASP.NET WebForms pattern)
      var idPatterns = ["btnOk", "btnOK", "btnClose", "btnAgree", "btnIAgree", "btnAccept",
                        "lnkClose", "lnkOk", "cmdClose", "cmdOk"];
      for (var m = 0; m < idPatterns.length; m++) {
        var el = document.getElementById(idPatterns[m]);
        if (el && isElVisible(el)) {
          el.click();
          return { clicked: idPatterns[m], elTag: el.tagName, id: el.id, html: el.outerHTML.slice(0, 200) };
        }
      }

      return null;
    }).catch(function() { return null; });

    if (result) {
      await ctx.log(
        "info",
        `[${tag}] Popup dismissed: "${result.clicked}" <${result.elTag} id="${result.id}"> html="${result.html}" (round ${round + 1})`
      );
      emptyRounds = 0;
      await page.waitForTimeout(500);
    } else {
      emptyRounds++;
      if (emptyRounds >= 3) break;
      await page.waitForTimeout(400);
    }
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
/**
 * Log in to the EPFO Unified Employer Portal.
 * Returns true on success, throws on persistent failure.
 */
export async function epfoLogin(
  page: Page,
  payload: { username: string; password: string },
  ctx: AutomationContext
): Promise<void> {
  await ctx.log("info", "Navigating to EPFO login page");
  await gotoWithRetry(page, EPFO_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // ── CRITICAL: wait for JS-rendered notification popups ──────────────────────
  // EPFO shows a "Notification" or "Important Notice" popup 1–3 seconds AFTER
  // page load via JavaScript.  If we dismiss immediately (before it appears)
  // the popup stays open and blocks the login form.
  await ctx.log("info", "Waiting 2.5s for EPFO notification popup to render...");
  await page.waitForTimeout(2500);

  // First dismiss pass — clears any notification on the login page
  await dismissAllPopups(page, ctx, "epfo-pre-login-1");
  await page.waitForTimeout(600);
  await dismissAllPopups(page, ctx, "epfo-pre-login-2");

  // Screenshot of the login page — confirms popup was cleared
  await safeScreenshot(page, ctx, "epfo-login-page");

  // Fill credentials
  await page.fill(SEL.username, payload.username);
  await ctx.log("info", "Filled username");
  await page.fill(SEL.password, payload.password);
  await ctx.log("info", "Filled password");

  // EPFO can render the captcha image asynchronously after page load
  await page.waitForTimeout(800);

  // ── DISMISS AGAIN right before clicking Login ────────────────────────────────
  // The notification popup can appear (or re-appear) while we were filling the
  // form. If it's covering the login button the click will miss.
  await dismissAllPopups(page, ctx, "epfo-pre-click");
  await safeScreenshot(page, ctx, "epfo-before-click");

  // Handle CAPTCHA if present — retry up to 3 times if the portal rejects the answer
  const captchaVisible = await hasCaptcha(page);
  const MAX_CAPTCHA_ATTEMPTS = 3;

  if (captchaVisible) {
    let captchaAccepted = false;
    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      const label = attempt === 1 ? "login-captcha" : `login-captcha-retry-${attempt}`;
      const captchaAnswer = await solveCaptcha(page, ctx, label);
      await page.fill(SEL.captchaInput, captchaAnswer);
      await ctx.log("info", `Filled CAPTCHA answer (attempt ${attempt}/${MAX_CAPTCHA_ATTEMPTS})`);

      // Dismiss one more time right before the actual click
      await dismissAllPopups(page, ctx, `epfo-pre-loginbtn-${attempt}`);

      await page.click(SEL.loginBtn);
      await ctx.log("info", "Clicked login button");
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

      // If a CAPTCHA is still visible the portal rejected the answer and showed a new one
      if (await hasCaptcha(page)) {
        if (attempt < MAX_CAPTCHA_ATTEMPTS) {
          await ctx.log("warn", `CAPTCHA rejected by portal (attempt ${attempt}/${MAX_CAPTCHA_ATTEMPTS}) — pausing for new answer`);
          continue;
        } else {
          throw new Error(`CAPTCHA was entered incorrectly ${MAX_CAPTCHA_ATTEMPTS} times. Please start a new login test.`);
        }
      }

      captchaAccepted = true;
      break;
    }
  } else {
    // No CAPTCHA — screenshot for debugging, then click
    await safeScreenshot(page, ctx, "epfo-login-no-captcha");
    await dismissAllPopups(page, ctx, "epfo-pre-loginbtn-nocaptcha");
    await page.click(SEL.loginBtn);
    await ctx.log("info", "Clicked login button");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  }

  // Check for OTP challenge
  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "login-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  }

  // ── Wait for post-login JS-rendered popups, then dismiss all ────────────────
  // EPFO shows session/notification popups 1–3 seconds after landing on dashboard
  await ctx.log("info", "Waiting 2.5s for EPFO post-login popups to render...");
  await page.waitForTimeout(2500);
  await dismissAllPopups(page, ctx, "epfo-post-login-1");
  await page.waitForTimeout(600);
  await dismissAllPopups(page, ctx, "epfo-post-login-2");
  await page.waitForTimeout(600);
  await dismissAllPopups(page, ctx, "epfo-post-login-3");

  // Screenshot after login attempt — captures the result page for debugging
  await safeScreenshot(page, ctx, "epfo-login-result");

  // Verify login success:
  // 1. Check for portal-specific error messages first (most reliable)
  const portalError = await page
    .locator('.error-msg, .alert-danger, #errorMessage, #lblMessage, .validation-summary-errors, [class*="error" i]')
    .first()
    .textContent({ timeout: 3000 })
    .catch(() => null);
  if (portalError?.trim()) {
    throw new Error(`EPFO login failed — ${portalError.trim()}`);
  }

  // 2. Check if the login form (username input) is still visible — means we're still on the login page
  const loginFormVisible = await page.$(SEL.username).catch(() => null);
  if (loginFormVisible) {
    const bodyText = await page.textContent("body").catch(() => "");
    const credentialError = /invalid.*password|wrong.*password|invalid.*user|user.*not.*found|invalid.*credential|authentication.*fail/i.test(bodyText ?? "");
    if (credentialError) {
      throw new Error("EPFO login failed — portal rejected your credentials. Check username and password.");
    }
    const errMatch = bodyText?.match(/(invalid|incorrect|wrong|error|fail|blocked|locked)[^.\n]{0,120}/i);
    const detail = errMatch ? errMatch[0] : bodyText?.slice(0, 200);
    throw new Error(`EPFO login failed. URL: ${page.url()}. Portal says: ${detail}`);
  }

  await ctx.log("info", "EPFO login successful", { url: page.url() });
}

// ─── UAN Generation ───────────────────────────────────────────────────────────
export async function uanGenerate(
  page: Page,
  payload: {
    employeeId: string;
    name: string;
    dob: string;
    aadhaar?: string;
    pan?: string;
    dateOfJoining: string;
    gender: string;
    fatherName?: string;
    mobileNumber?: string;
    maritalStatus?: string;
    motherName?: string;
    nomineeName?: string;
    nomineeRelation?: string;
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting UAN generation", { employeeId: payload.employeeId });

  // Navigate to member registration
  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/memberRegistration.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "uan-generate-start");
  // Save a copy of the rendered registration form (HTML + distilled field list)
  // so mismatched selectors can be corrected offline from this one run.
  await ctx.saveFormSnapshot("uan-generate-form");

  // Fill core employee details — routed through fillStatutoryField (same as the
  // statutory fields below) so each field's outcome (filled / not-found /
  // fill-failed) is logged. This gives a real-portal run verifiable evidence of
  // which selectors matched for ALL fields, not only the newer statutory ones —
  // previously a wrong core selector was swallowed silently with no signal.
  const coreFields: Array<[string, string, string | undefined]> = [
    ["Name", 'input[name*="memberName" i], #memberName', payload.name],
    ["Date of Birth", 'input[name*="dob" i], #dob', payload.dob],
    ["Gender", 'input[name*="gender" i], select[name*="gender" i]', payload.gender],
    ["Father's Name", 'input[name*="fatherName" i], #fatherName', payload.fatherName],
    ["Aadhaar", 'input[name*="aadhaar" i], #aadhaarNo', payload.aadhaar],
    ["Mobile", 'input[name*="mobile" i], #mobile', payload.mobileNumber],
    ["Date of Joining", 'input[name*="doj" i], #doj', payload.dateOfJoining],
  ];

  // New statutory fields — filled best-effort and the outcome of each is logged
  // (filled / not-found / fill-failed) so a real-portal run produces verifiable
  // evidence of which selectors matched. Marital status and nominee relation are
  // commonly <select> dropdowns; mother's name and nominee name are text inputs.
  const statutoryFields: Array<[string, string, string | undefined]> = [
    [
      "Marital Status",
      '#maritalStatus, #ddlMaritalStatus, select[name*="marital" i], select[id*="marital" i], input[name*="marital" i]',
      payload.maritalStatus,
    ],
    [
      "Mother's Name",
      '#motherName, input[name*="motherName" i], input[name*="mother" i], input[id*="mother" i]',
      payload.motherName,
    ],
    [
      "Nominee Name",
      '#nomineeName, input[name*="nominee" i][name*="name" i], input[id*="nominee" i][id*="name" i], input[name*="nominee" i]:not([name*="relation" i])',
      payload.nomineeName,
    ],
    [
      "Nominee Relation",
      '#nomineeRelation, #ddlNomineeRelation, select[name*="nominee" i][name*="relation" i], select[id*="nominee" i][id*="relation" i], select[name*="relation" i], input[name*="nominee" i][name*="relation" i]',
      payload.nomineeRelation,
    ],
  ];

  const fieldOutcomes: Record<string, string> = {};
  for (const [label, selector, value] of [...coreFields, ...statutoryFields]) {
    fieldOutcomes[label] = await fillStatutoryField(page, ctx, label, selector, value);
  }
  await ctx.log("info", "UAN field fill summary", fieldOutcomes);

  // Handle CAPTCHA/OTP if it appears before submit
  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "uan-generate-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  // Submit
  await page.click('button[type="submit"], input[value*="Submit" i], input[value*="Register" i]');
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await safeScreenshot(page, ctx, "uan-generate-after-submit");

  // OTP verification
  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "uan-generate-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  // Extract UAN from result page
  const uanEl = await page.$('.uan, #uan, span[id*="uan" i], td:has-text("UAN") + td');
  const uan = uanEl ? (await uanEl.textContent())?.trim() : null;

  await ctx.log("info", "UAN generation complete", { uan });
  await safeScreenshot(page, ctx, "uan-generate-done");

  return { uan, employeeId: payload.employeeId };
}

// ─── Aadhaar KYC ──────────────────────────────────────────────────────────────
export async function aadhaarKyc(
  page: Page,
  payload: { uan: string; aadhaar: string; name: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting Aadhaar KYC update", { uan: payload.uan });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/kycUpdate.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "aadhaar-kyc-start");

  // Route every field fill through fillStatutoryField so a wrong selector is
  // logged (filled / not-found / fill-failed) instead of silently swallowed.
  const fieldOutcomes: Record<string, string> = {};
  fieldOutcomes["UAN"] = await fillStatutoryField(page, ctx, "UAN", SEL.kycUan, payload.uan);
  await page.click('button[id*="search" i], input[value*="Search" i]');
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Select Aadhaar KYC type
  const aadhaarRadio = await page.$('input[value*="AADHAR" i], input[value*="Aadhaar" i]');
  if (aadhaarRadio) await aadhaarRadio.click();

  fieldOutcomes["Aadhaar Number"] = await fillStatutoryField(page, ctx, "Aadhaar Number", SEL.kycAadhaar, payload.aadhaar);
  fieldOutcomes["Name (as per Aadhaar)"] = await fillStatutoryField(page, ctx, "Name (as per Aadhaar)", 'input[name*="docName" i], #docName', payload.name);
  await ctx.log("info", "Aadhaar KYC field fill summary", fieldOutcomes);

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "aadhaar-kyc-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.kycSaveBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "aadhaar-kyc-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const successText = await page.$(".success, .alert-success, .successMsg");
  const resultMsg = successText ? (await successText.textContent())?.trim() : null;

  await ctx.log("info", "Aadhaar KYC update submitted", { result: resultMsg });
  await safeScreenshot(page, ctx, "aadhaar-kyc-done");

  return { uan: payload.uan, type: "aadhaar", result: resultMsg };
}

// ─── PAN KYC ──────────────────────────────────────────────────────────────────
export async function panKyc(
  page: Page,
  payload: { uan: string; pan: string; name: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting PAN KYC update", { uan: payload.uan });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/kycUpdate.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "pan-kyc-start");

  await page.fill(SEL.kycUan, payload.uan);
  await page.click('button[id*="search" i], input[value*="Search" i]');
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const panRadio = await page.$('input[value*="PAN" i]');
  if (panRadio) await panRadio.click();

  await page.fill(SEL.kycPan, payload.pan);
  const nameField = await page.$('input[name*="docName" i], #docName');
  if (nameField) await nameField.fill(payload.name);

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "pan-kyc-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.kycSaveBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "pan-kyc-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const resultMsg = await page.$eval(".success, .alert-success, .successMsg", (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "PAN KYC update submitted", { result: resultMsg });
  await safeScreenshot(page, ctx, "pan-kyc-done");

  return { uan: payload.uan, type: "pan", result: resultMsg };
}

// ─── Bank Account KYC ─────────────────────────────────────────────────────────
export async function bankKyc(
  page: Page,
  payload: { uan: string; accountNumber: string; ifsc: string; bankName: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting bank KYC update", { uan: payload.uan });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/kycUpdate.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "bank-kyc-start");

  await page.fill(SEL.kycUan, payload.uan);
  await page.click('button[id*="search" i], input[value*="Search" i]');
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const bankRadio = await page.$('input[value*="BANK" i], input[value*="Bank" i]');
  if (bankRadio) await bankRadio.click();

  await page.fill(SEL.kycBankAccount, payload.accountNumber);
  await page.fill(SEL.kycIfsc, payload.ifsc);

  const bankNameField = await page.$('input[name*="bankName" i], #bankName, select[name*="bankName" i]');
  if (bankNameField) await bankNameField.fill(payload.bankName).catch(() => {});

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "bank-kyc-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.kycSaveBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "bank-kyc-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const resultMsg = await page.$eval(".success, .alert-success, .successMsg", (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "Bank KYC update submitted", { result: resultMsg });
  await safeScreenshot(page, ctx, "bank-kyc-done");

  return { uan: payload.uan, type: "bank", result: resultMsg };
}

// ─── ECR Monthly Filing ───────────────────────────────────────────────────────
export async function ecrFiling(
  page: Page,
  payload: {
    wageMonth: string;    // "January" … "December"
    wageYear: string;     // "2025"
    ecrFilePath: string;  // absolute path to the ECR .txt file
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting ECR filing", { month: payload.wageMonth, year: payload.wageYear });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/ecr/ecrUpload.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "ecr-filing-start");

  // Select wage month and year
  const monthSel = await page.$(SEL.ecrWageMonth);
  if (monthSel) await monthSel.selectOption({ label: payload.wageMonth });

  const yearSel = await page.$(SEL.ecrWageYear);
  if (yearSel) await yearSel.selectOption({ value: payload.wageYear });

  // Upload ECR file
  const fileInput = await page.$(SEL.ecrUploadBtn);
  if (fileInput) {
    await fileInput.setInputFiles(payload.ecrFilePath);
    await ctx.log("info", "ECR file attached");
  } else {
    throw new Error("ECR file input not found on page");
  }

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "ecr-filing-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.ecrSubmitBtn);
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await safeScreenshot(page, ctx, "ecr-filing-after-upload");

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "ecr-filing-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  // Extract TRRN
  const trrn = await page.$eval(SEL.ecrTrrn, (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "ECR filing submitted", { trrn });
  await safeScreenshot(page, ctx, "ecr-filing-done");

  return { trrn, wageMonth: payload.wageMonth, wageYear: payload.wageYear };
}

// ─── Challan Download ─────────────────────────────────────────────────────────
export async function challanDownload(
  page: Page,
  payload: { trrn: string; downloadDir: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Downloading EPFO challan", { trrn: payload.trrn });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/ecr/challanDetails.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "challan-download-start");

  await page.fill(SEL.challanTrrn, payload.trrn);
  await page.click(SEL.challanSearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Trigger download
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click(SEL.challanDownBtn),
  ]);

  const suggestedFilename = download.suggestedFilename();
  const filePath = `${payload.downloadDir}/${suggestedFilename}`;
  await download.saveAs(filePath);

  await ctx.log("info", "Challan downloaded", { filePath, trrn: payload.trrn });
  await safeScreenshot(page, ctx, "challan-download-done");

  return { trrn: payload.trrn, filePath, filename: suggestedFilename };
}

// ─── TRRN Tracking ────────────────────────────────────────────────────────────
export async function trrnTrack(
  page: Page,
  payload: { trrn: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Checking TRRN status", { trrn: payload.trrn });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/ecr/challanDetails.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.challanTrrn, payload.trrn);
  await page.click(SEL.challanSearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "trrn-track");

  const statusEl = await page.$('.challanStatus, td:has-text("Status") + td, .status');
  const status = statusEl ? (await statusEl.textContent())?.trim() : null;

  const amountEl = await page.$('.challanAmount, td:has-text("Amount") + td');
  const amount = amountEl ? (await amountEl.textContent())?.trim() : null;

  await ctx.log("info", "TRRN status fetched", { trrn: payload.trrn, status, amount });

  return { trrn: payload.trrn, status, amount };
}

// ─── Passbook Status ──────────────────────────────────────────────────────────
export async function passbookStatus(
  page: Page,
  payload: { uan: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Checking passbook status", { uan: payload.uan });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/passbookStatus.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.memberSearch, payload.uan);
  await page.click(SEL.memberSearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "passbook-status");

  const statusEl = await page.$(SEL.memberStatus);
  const status = statusEl ? (await statusEl.textContent())?.trim() : null;

  const rows = await page.$$eval("table tr", (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim()))
  ).catch(() => [] as string[][]);

  await ctx.log("info", "Passbook status fetched", { uan: payload.uan, status });

  return { uan: payload.uan, status, tableRows: rows.slice(0, 10) };
}

// ─── Exit Management ─────────────────────────────────────────────────────────
export async function exitManagement(
  page: Page,
  payload: {
    uan: string;
    exitDate: string;
    exitReason: string;  // "resignation" | "retirement" | "termination" | etc.
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Processing exit management", { uan: payload.uan });

  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/exitMgmt.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await safeScreenshot(page, ctx, "exit-mgmt-start");

  await page.fill(SEL.exitUan, payload.uan);
  await page.click('button[id*="search" i], input[value*="Search" i]');
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.exitDateInput, payload.exitDate);
  await page.selectOption(SEL.exitReasonSel, { label: payload.exitReason }).catch(() => {});

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "exit-mgmt-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.exitSubmitBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "exit-mgmt-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const resultMsg = await page.$eval(".success, .alert-success", (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "Exit management submitted", { uan: payload.uan, result: resultMsg });
  await safeScreenshot(page, ctx, "exit-mgmt-done");

  return { uan: payload.uan, exitDate: payload.exitDate, result: resultMsg };
}

// ─── Bulk fan-out helpers (no browser needed) ─────────────────────────────────
/**
 * Fan out bulk UAN registration into one epfo_uan_generate job per employee.
 */
export function getBulkRegisterJobs(
  payload: { employees: Array<Record<string, unknown>> }
): Array<{ jobType: string; payload: Record<string, unknown> }> {
  return payload.employees.map((emp) => ({
    jobType: "epfo_uan_generate",
    payload: emp,
  }));
}

// ─── Employee List ────────────────────────────────────────────────────────────
/**
 * Fetches the full member list from the EPFO Unified Portal.
 * Navigates to the member management section and scrapes all registered members.
 * Handles pagination automatically (up to 50 pages).
 */
export async function epfoEmployeeList(
  page: Page,
  payload: Record<string, unknown>,
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Fetching EPFO member list");

  // Navigate to the member search page and search without criteria to get all members
  await gotoWithRetry(page, `${EPFO_BASE}/employer/member/memberSearch.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await ctx.takeScreenshot("epfo-member-list-page");

  // Try clicking "Search" without filling any criteria to get the full list
  await page.click('button[type="submit"], input[value*="Search" i], button:has-text("Search")').catch(() => {});
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await ctx.takeScreenshot("epfo-member-list-results");

  const allEmployees: Record<string, string>[] = [];

  async function scrapeTable(): Promise<number> {
    const headers = await page.$$eval(
      "table thead tr th, table tr:first-child th",
      (ths) => ths.map((th) => th.textContent?.trim().replace(/\s+/g, " ") ?? "")
    ).catch(() => [] as string[]);

    const rows = await page.$$eval("table tbody tr, table tr", (trs) =>
      trs
        .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim().replace(/\s+/g, " ") ?? ""))
        .filter((r) => r.some((c) => c !== ""))
    ).catch(() => [] as string[][]);

    for (const row of rows) {
      const emp: Record<string, string> = {};
      if (headers.length > 0) {
        headers.forEach((h, i) => { if (h) emp[h] = row[i] ?? ""; });
      } else {
        const keys = ["SNo", "UAN", "Name", "DOJ", "DOE", "Status"];
        row.forEach((cell, i) => { emp[keys[i] ?? `col${i + 1}`] = cell; });
      }
      allEmployees.push(emp);
    }
    return rows.length;
  }

  await scrapeTable();

  // Follow pagination
  let pageNum = 1;
  while (pageNum < 50) {
    const nextLink = await page.$(
      'a:has-text("Next >"), a:has-text(">>"), a[id*="Next" i]:not([disabled]), li.next:not(.disabled) a'
    );
    if (!nextLink) break;
    const ariaDisabled = await nextLink.getAttribute("aria-disabled");
    if (ariaDisabled === "true") break;
    await nextLink.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    const count = await scrapeTable();
    pageNum++;
    if (count === 0) break;
  }

  await ctx.log("info", `EPFO member list complete: ${allEmployees.length} members across ${pageNum} page(s)`);
  return {
    employees: allEmployees,
    count: allEmployees.length,
    pages: pageNum,
    fetchedAt: new Date().toISOString(),
  };
}

export function getBulkEcrJobs(
  payload: { filings: Array<Record<string, unknown>> }
): Array<{ jobType: string; payload: Record<string, unknown> }> {
  return payload.filings.map((filing) => ({
    jobType: "epfo_ecr_file",
    payload: filing,
  }));
}
