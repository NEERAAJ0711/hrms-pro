/**
 * ESIC Automation Service
 *
 * Implements browser automation for the ESIC Employer Portal
 * (https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/).
 *
 * Each exported function receives a Playwright Page already navigated
 * to the ESIC portal. If CAPTCHA or OTP is required, ctx.pause() is called
 * to suspend execution until the admin submits an answer via the resume API.
 *
 * NOTE: Portal selectors are based on the ESIC employer portal structure as
 * of 2025. If the portal is updated, selectors may need adjustment.
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
            `ESIC portal page not found (HTTP 404) — the URL may have changed or the portal is temporarily unavailable. URL: ${url}`
          );
        }
        if (status >= 500) {
          throw new Error(
            `ESIC portal server error (HTTP ${status}) — the portal may be temporarily down. URL: ${url}`
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
        await page.waitForTimeout(1000);
      }
    }
  }
  throw lastErr;
}

// ─── Portal URLs ──────────────────────────────────────────────────────────────
// Canonical ESIC Employer Portal — portal.esic.gov.in.
// The "ESICInsuredPersonPortal" path is for employees (insured persons) and must
// NOT be used here. Employers log in at ESICInsurancePortal/Portal_Loginnew.aspx.
const ESIC_BASE = "https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal";
const ESIC_LOGIN_URL = "https://portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/Portal_Loginnew.aspx";

// ─── Selector constants ───────────────────────────────────────────────────────
const SEL = {
  // Login page — verified against portal.esic.gov.in/EmployerPortal/ESICInsurancePortal/Portal_Loginnew.aspx
  username:           '#txtUserName, #txtUserid, input[name*="UserName" i], input[name*="UserId" i], input[name*="username" i]',
  password:           '#txtPassword, input[type="password"]',
  // Captcha input: actual id is txtChallanCaptcha on the ESIC employer login page
  captchaInput:       [
    '#txtChallanCaptcha', '#txtCaptcha', '#txtcaptcha',
    'input[name*="captcha" i]', 'input[id*="captcha" i]',
    // Placeholder patterns — covers "Enter Captcha" shown on the login form
    'input[placeholder*="captcha" i]', 'input[placeholder*="verification" i]',
    'input[placeholder*="code" i][type="text"]',
  ].join(', '),
  // Captcha image: #img1 with src="../ChallanHandler.ashx" on Portal_Loginnew.aspx
  captchaImage:       [
    '#img1',
    'img[src*="ChallanHandler"]', 'img[src*="Captcha" i]',
    'img[id*="Captcha" i]', 'img[alt*="captcha" i]',
    // ASP.NET WebForms common patterns
    'img[src*="CaptchaImage"]', 'img[src*="GetCaptcha"]', 'img[src*="captcha"]',
    '#imgCaptcha', '#CaptchaImage', 'img[id*="captcha" i]',
    // Fallback: any image in a captcha wrapper
    '.captcha img', '[class*="captcha" i] img', '[id*="captcha" i] img',
  ].join(', '),
  loginBtn:           '#btnLogin, button[type="submit"], input[type="submit"]',

  // OTP
  otpInput:           '#txtOTP, input[name*="otp" i], input[id*="OTP"]',
  otpSubmitBtn:       '#btnOTP, button[id*="otp" i], input[value*="Submit" i]',

  // Employee registration (IP generation)
  employeeCode:       '#txtEmpCode, input[name*="empCode" i]',
  ipNameInput:        '#txtMemberName, input[name*="memberName" i]',
  ipDobInput:         '#txtDOB, input[name*="dob" i]',
  ipGenderSel:        '#ddlGender, select[name*="gender" i]',
  ipMobileInput:      '#txtMobile, input[name*="mobile" i]',
  ipAadhaarInput:     '#txtAadhaar, input[name*="aadhaar" i]',
  ipBankAccount:      '#txtBankAcc, input[name*="bankAcc" i]',
  ipIfsc:             '#txtIFSC, input[name*="ifsc" i]',
  ipFatherName:       '#txtFatherName, input[name*="fatherName" i]',
  ipJoinDate:         '#txtJoinDate, input[name*="joinDate" i]',
  ipSalary:           '#txtSalary, input[name*="salary" i]',
  ipRegisterBtn:      '#btnSave, button[id*="save" i], input[value*="Save" i]',
  ipNumber:           '#lblIPNo, span[id*="ipNo" i], .ipNumber',

  // Family declaration
  ipNoInput:          '#txtIPNo, input[name*="ipNo" i]',
  familySearchBtn:    '#btnSearch, button[id*="search" i]',
  addFamilyBtn:       '#btnAddFamily, button[id*="addFamily" i]',
  familyMemberName:   '#txtFamilyName, input[name*="familyName" i]',
  familyRelation:     '#ddlRelation, select[name*="relation" i]',
  familyDob:          '#txtFamilyDOB, input[name*="familyDob" i]',
  familySaveBtn:      '#btnFamilySave, button[id*="familySave" i]',

  // Monthly contribution filing
  contribMonth:       '#ddlMonth, select[name*="month" i]',
  contribYear:        '#ddlYear, select[name*="year" i]',
  contribFileInput:   'input[type="file"], #fileUpload',
  contribUploadBtn:   '#btnUpload, button[id*="upload" i], input[value*="Upload" i]',
  challanNo:          '#lblChallanNo, span[id*="challan" i]',

  // Challan download
  challanSearchInput: '#txtChallanNo, input[name*="challanNo" i]',
  challanSearchBtn:   '#btnSearchChallan, button[id*="search" i]',
  challanDownBtn:     '#btnDownload, a[id*="download" i], button[id*="download" i]',

  // Employee search
  ipSearchInput:      '#txtIPNo, input[name*="ipNo" i], input[name*="empCode" i]',
  ipSearchBtn:        '#btnIPSearch, button[id*="search" i]',
  ipDetails:          '#pnlIPDetails, .ipDetails, .memberDetails',

  // Contribution history
  contribHistFrom:    '#txtFromDate, input[name*="fromDate" i]',
  contribHistTo:      '#txtToDate, input[name*="toDate" i]',
  contribHistSearch:  '#btnContribSearch, button[id*="search" i]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function hasCaptcha(page: Page): Promise<boolean> {
  try {
    // 1. Check for a visible captcha image (covers #img1 / ChallanHandler)
    const imageVisible = await page.isVisible(SEL.captchaImage, { timeout: 5000 }).catch(() => false);
    if (imageVisible) return true;

    // 2. Fallback — check for a visible captcha input field.
    //    "Enter Captcha" placeholder is enough to confirm a captcha is required.
    const inputVisible = await page.isVisible(SEL.captchaInput, { timeout: 2000 }).catch(() => false);
    if (inputVisible) return true;

    // 3. Last resort — scan body text for captcha keywords
    const bodyText = await page.textContent("body", { timeout: 1000 }).catch(() => "");
    if (/captcha|verification.?code|enter.?code|security.?code/i.test(bodyText ?? "")) {
      const anyInput = await page.isVisible('input[type="text"], input[type="tel"]', { timeout: 500 }).catch(() => false);
      if (anyInput) return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function hasOtp(page: Page): Promise<boolean> {
  try {
    return await page.isVisible(SEL.otpInput, { timeout: 2000 });
  } catch {
    return false;
  }
}

async function solveCaptcha(page: Page, ctx: AutomationContext, label: string): Promise<string> {
  await ctx.log("info", `CAPTCHA detected — pausing for admin input (${label})`);
  const screenshotPath = await ctx.takeScreenshot(label);
  return ctx.pause(screenshotPath, label);
}

async function solveOtp(page: Page, ctx: AutomationContext, label: string): Promise<string> {
  await ctx.log("info", `OTP required — pausing for admin input (${label})`);
  const screenshotPath = await ctx.takeScreenshot(label);
  return ctx.pause(screenshotPath, label);
}

// ─── Login ────────────────────────────────────────────────────────────────────
// ─── Popup dismissal ──────────────────────────────────────────────────────────
/**
 * Dismisses ALL notification / alert popups on the current ESIC page.
 * Loops until no dismissible button is found (handles portals that stack
 * multiple modals one after another).
 */
/**
 * Single combined selector that covers every known ESIC/government portal popup.
 * Playwright evaluates this as one CSS selector-list query, so it finds the
 * first visible match across ALL patterns simultaneously — no serial waiting.
 */
/**
 * Dismisses ALL ESIC portal notification/session-warning popups.
 *
 * How ESIC popups actually work (observed from portal.esic.gov.in):
 *  - A small floating div/table appears 1–3 seconds after page load via JS
 *  - It contains a message and a plain <input type="button" value="X"> close button
 *  - There may be 1–3 stacked popups dismissed one after another
 *
 * Strategy:
 *  1. Run a JavaScript scan inside the browser (single call, fast) that:
 *     a. Finds ALL visible elements whose value/text is a close glyph
 *        (X, ×, Close, OK, I Agree — case-insensitive, trims whitespace)
 *     b. Returns what it found (clicked + outerHTML snippet for logging)
 *  2. Wait 500ms for animations, then repeat until nothing found.
 *  3. After 3 consecutive empty rounds, stop.
 */
async function dismissAllPopups(page: Page, ctx: AutomationContext, tag = ""): Promise<void> {
  let emptyRounds = 0;

  for (let round = 0; round < 15; round++) {
    // Press Escape — handles native browser dialogs and some overlay patterns
    await page.keyboard.press("Escape").catch(() => {});

    // One JavaScript call scans the entire live DOM — no CSS polling delays
    const result = await page.evaluate(function() {
      // Values that mean "dismiss this popup" — exact match, case-insensitive
      var CLOSE_VALUES = ["x", "close", "ok", "okay", "i agree", "agree", "accept",
                          "\u00d7", "\u2715", "\u2716"];

      function isElVisible(el) {
        try {
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          var s = window.getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
        } catch(e) { return false; }
      }

      // Scan inputs first (ESIC uses input[type=button] for close buttons)
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

      // Then scan buttons
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

      // Scan <a> links (only short ones — long text = navigation link, not dismiss)
      var links = document.querySelectorAll("a");
      for (var k = 0; k < links.length; k++) {
        var lnk = links[k];
        if (!isElVisible(lnk)) continue;
        var ltxt = (lnk.textContent || "").trim();
        if (ltxt.length > 10) continue; // skip nav links
        if (CLOSE_VALUES.indexOf(ltxt.toLowerCase()) !== -1) {
          lnk.click();
          return { clicked: ltxt, elTag: "A", id: lnk.id || "(no id)", html: lnk.outerHTML.slice(0, 200) };
        }
      }

      return null;
    }).catch(function() { return null; });

    if (result) {
      await ctx.log(
        "info",
        `[${tag}] Popup dismissed: "${result.clicked}" <${result.tag} id="${result.id}"> (round ${round + 1})`
      );
      emptyRounds = 0;
      await page.waitForTimeout(500); // wait for animation / next popup to render
    } else {
      emptyRounds++;
      if (emptyRounds >= 3) break; // 3 consecutive empty rounds → all clear
      await page.waitForTimeout(400);
    }
  }
}

export async function esicLogin(
  page: Page,
  payload: { username: string; password: string },
  ctx: AutomationContext
): Promise<void> {
  await ctx.log("info", "Navigating to ESIC Employer Portal login page");
  await gotoWithRetry(page, ESIC_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Dismiss any notification popups that appear on first load
  await dismissAllPopups(page, ctx, "esic-pre-login");

  // Screenshot of the raw login page — useful for verifying selectors match the real portal
  await ctx.takeScreenshot("esic-login-page");

  await page.fill(SEL.username, payload.username);
  await ctx.log("info", "Filled ESIC username");
  await page.fill(SEL.password, payload.password);
  await ctx.log("info", "Filled ESIC password");

  // Small pause — some portals render the captcha image asynchronously after the
  // page loads. Without this, hasCaptcha() can fire before the image appears.
  await page.waitForTimeout(800);

  // Handle CAPTCHA if present — retry up to 3 times if the portal rejects the answer
  const captchaVisible = await hasCaptcha(page);
  const MAX_CAPTCHA_ATTEMPTS = 3;

  if (captchaVisible) {
    let captchaAccepted = false;
    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      const label = attempt === 1 ? "esic-login-captcha" : `esic-login-captcha-retry-${attempt}`;
      const ans = await solveCaptcha(page, ctx, label);
      await page.fill(SEL.captchaInput, ans);
      await ctx.log("info", `Filled ESIC CAPTCHA answer (attempt ${attempt}/${MAX_CAPTCHA_ATTEMPTS})`);

      await page.click(SEL.loginBtn);
      await ctx.log("info", "Clicked ESIC login button");
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
    // No CAPTCHA — screenshot anyway for debugging
    await ctx.takeScreenshot("esic-login-no-captcha");
    await page.click(SEL.loginBtn);
    await ctx.log("info", "Clicked ESIC login button");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  }

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "esic-login-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpSubmitBtn);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  }

  // ── CRITICAL: wait for JS-rendered popups to appear ─────────────────────────
  // The ESIC session-warning popup ("Either last logged-in session was not
  // closed...") is rendered by a JavaScript setTimeout 1–3 seconds AFTER the
  // page finishes loading.  We must wait here or we dismiss before it exists.
  await ctx.log("info", "Waiting for post-login popups to render (2.5s)...");
  await page.waitForTimeout(2500);

  // Dismiss all stacked popups — loop until none remain
  await dismissAllPopups(page, ctx, "esic-post-login-1");
  await page.waitForTimeout(800);
  await dismissAllPopups(page, ctx, "esic-post-login-2");
  await page.waitForTimeout(800);
  await dismissAllPopups(page, ctx, "esic-post-login-3");

  // Screenshot of post-login page — captures success dashboard or error message
  await ctx.takeScreenshot("esic-login-result");

  const currentUrl = page.url();
  // Login failure: still on a login or default-redirect URL
  if (currentUrl.toLowerCase().includes("login") || currentUrl === ESIC_LOGIN_URL) {
    // 3-tier error classification:
    // 1. Try to extract a visible error message from the portal using specific selectors
    const portalError = await page
      .locator('.error-msg, .errorMessage, .alert-danger, #lblMessage, #ErrorMessage, [class*="error" i], .validation-summary-errors')
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => null);

    if (portalError?.trim()) {
      throw new Error(`Login failed — ${portalError.trim()}`);
    }

    // 2. Scan the full body for known credential-failure keywords
    const bodyText = await page.textContent("body").catch(() => "");
    const credentialError = /invalid.*password|wrong.*password|incorrect.*password|invalid.*user|user.*not.*found|invalid.*credential|authentication.*fail/i.test(bodyText ?? "");

    if (credentialError) {
      throw new Error("Login failed — the ESIC portal rejected your credentials. Check your username and password.");
    }

    // 3. Fallback: extract a useful error excerpt from the page body
    const errMatch = bodyText?.match(/(invalid|incorrect|wrong|error|fail|blocked|locked)[^.\n]{0,120}/i);
    const detail = errMatch ? errMatch[0] : bodyText?.slice(0, 200);
    throw new Error(`ESIC login failed. URL: ${currentUrl}. Portal says: ${detail}`);
  }

  await ctx.log("info", "ESIC login successful", { url: currentUrl });
}

// ─── IP Number Generation ─────────────────────────────────────────────────────
export async function ipNumberGenerate(
  page: Page,
  payload: {
    employeeCode: string;
    name: string;
    dob: string;
    gender: string;
    fatherName?: string;
    mobile?: string;
    aadhaar?: string;
    bankAccount?: string;
    ifsc?: string;
    dateOfJoining: string;
    grossSalary: number;
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting IP number generation", { employeeCode: payload.employeeCode });

  await gotoWithRetry(page, `${ESIC_BASE}/IPRegistration.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await ctx.takeScreenshot("ip-generate-start");

  // Fill employee details
  if (payload.employeeCode) await page.fill(SEL.employeeCode, payload.employeeCode).catch(() => {});
  await page.fill(SEL.ipNameInput, payload.name).catch(() => {});
  await page.fill(SEL.ipDobInput, payload.dob).catch(() => {});
  await page.selectOption(SEL.ipGenderSel, { label: payload.gender }).catch(() => {});
  if (payload.fatherName) await page.fill(SEL.ipFatherName, payload.fatherName).catch(() => {});
  if (payload.mobile) await page.fill(SEL.ipMobileInput, payload.mobile).catch(() => {});
  if (payload.aadhaar) await page.fill(SEL.ipAadhaarInput, payload.aadhaar).catch(() => {});
  if (payload.bankAccount) await page.fill(SEL.ipBankAccount, payload.bankAccount).catch(() => {});
  if (payload.ifsc) await page.fill(SEL.ipIfsc, payload.ifsc).catch(() => {});
  await page.fill(SEL.ipJoinDate, payload.dateOfJoining).catch(() => {});
  await page.fill(SEL.ipSalary, String(payload.grossSalary)).catch(() => {});

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "ip-generate-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.ipRegisterBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "ip-generate-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpSubmitBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const ipNumber = await page.$eval(SEL.ipNumber, (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "IP number generated", { ipNumber });
  await ctx.takeScreenshot("ip-generate-done");

  return { ipNumber, employeeCode: payload.employeeCode };
}

// ─── Family Declaration ───────────────────────────────────────────────────────
export async function familyDeclaration(
  page: Page,
  payload: {
    ipNumber: string;
    familyMembers: Array<{
      name: string;
      relation: string;
      dob: string;
    }>;
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting family declaration", { ipNumber: payload.ipNumber });

  await gotoWithRetry(page, `${ESIC_BASE}/FamilyDeclaration.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.fill(SEL.ipNoInput, payload.ipNumber);
  await page.click(SEL.familySearchBtn);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  await ctx.takeScreenshot("family-decl-start");

  const results: Array<Record<string, unknown>> = [];

  for (const member of payload.familyMembers) {
    await page.click(SEL.addFamilyBtn).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});

    await page.fill(SEL.familyMemberName, member.name).catch(() => {});
    await page.selectOption(SEL.familyRelation, { label: member.relation }).catch(() => {});
    await page.fill(SEL.familyDob, member.dob).catch(() => {});

    await page.click(SEL.familySaveBtn);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const resultMsg = await page.$eval(".success, .alert-success", (el) => el.textContent?.trim()).catch(() => null);
    results.push({ member: member.name, result: resultMsg });
    await ctx.log("info", `Family member added: ${member.name}`, { result: resultMsg });
  }

  await ctx.takeScreenshot("family-decl-done");
  return { ipNumber: payload.ipNumber, membersAdded: results };
}

// ─── Monthly Contribution Filing ──────────────────────────────────────────────
export async function monthlyContributionFiling(
  page: Page,
  payload: {
    month: string;   // "01" … "12"
    year: string;    // "2025"
    filePath: string; // absolute path to the contribution file
  },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Starting monthly contribution filing", {
    month: payload.month,
    year: payload.year,
  });

  await gotoWithRetry(page, `${ESIC_BASE}/MonthlyContribution.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await ctx.takeScreenshot("contribution-filing-start");

  await page.selectOption(SEL.contribMonth, { value: payload.month }).catch(() => {});
  await page.selectOption(SEL.contribYear, { value: payload.year }).catch(() => {});

  const fileInput = await page.$(SEL.contribFileInput);
  if (fileInput) {
    await fileInput.setInputFiles(payload.filePath);
  } else {
    throw new Error("Contribution file input not found");
  }

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "contribution-filing-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.contribUploadBtn);
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await ctx.takeScreenshot("contribution-filing-after-upload");

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "contribution-filing-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpSubmitBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const challanNo = await page.$eval(SEL.challanNo, (el) => el.textContent?.trim()).catch(() => null);
  await ctx.log("info", "Monthly contribution filed", { challanNo });
  await ctx.takeScreenshot("contribution-filing-done");

  return { challanNo, month: payload.month, year: payload.year };
}

// ─── Challan Download ─────────────────────────────────────────────────────────
export async function esicChallanDownload(
  page: Page,
  payload: { challanNo: string; downloadDir: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Downloading ESIC challan", { challanNo: payload.challanNo });

  await gotoWithRetry(page, `${ESIC_BASE}/ChallanDownload.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.challanSearchInput, payload.challanNo);
  await page.click(SEL.challanSearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await ctx.takeScreenshot("esic-challan-download-start");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click(SEL.challanDownBtn),
  ]);

  const suggestedFilename = download.suggestedFilename();
  const filePath = `${payload.downloadDir}/${suggestedFilename}`;
  await download.saveAs(filePath);

  await ctx.log("info", "ESIC challan downloaded", { filePath });
  await ctx.takeScreenshot("esic-challan-download-done");

  return { challanNo: payload.challanNo, filePath, filename: suggestedFilename };
}

// ─── Employee Search ──────────────────────────────────────────────────────────
export async function esicEmployeeSearch(
  page: Page,
  payload: { ipNumber?: string; employeeCode?: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Searching ESIC employee", payload);

  await gotoWithRetry(page, `${ESIC_BASE}/IPSearch.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const searchVal = payload.ipNumber ?? payload.employeeCode ?? "";
  await page.fill(SEL.ipSearchInput, searchVal);
  await page.click(SEL.ipSearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await ctx.takeScreenshot("esic-employee-search");

  const details = await page.$eval(SEL.ipDetails, (el) => el.textContent?.trim()).catch(() => null);
  const rows = await page.$$eval("table tr", (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim()))
  ).catch(() => [] as string[][]);

  await ctx.log("info", "ESIC employee search complete", { found: !!details });

  return { searchVal, details, tableRows: rows.slice(0, 20) };
}

// ─── Exported popup dismissal ─────────────────────────────────────────────────
/**
 * Public wrapper so queue-worker can dismiss ESIC popups after restoring a
 * session / navigating to the dashboard (before dispatching any job).
 */
export async function dismissEsicPopups(page: Page, ctx: AutomationContext): Promise<void> {
  await dismissAllPopups(page, ctx, "esic-session");
}

// ─── Employee List (FormThree) ────────────────────────────────────────────────
/**
 * Fetches the full list of registered employees from the ESIC portal.
 *
 * Navigation strategy — NO direct URL jumps, only clicks:
 *  1. Kill ALL popup stacks (ESIC shows up to 3 overlapping alerts after login).
 *  2. Click "List of Employees" from the left-hand Employee menu.
 *     If the link is inside a collapsed accordion, click the section header first.
 *  3. Kill any new popups that appear after the page loads.
 *  4. Scrape the employee table with automatic pagination.
 *
 * The browser context is NEVER closed here — it is returned to the idle pool
 * by queue-worker after this function returns so the session stays live for
 * subsequent operations.
 */
export async function esicEmployeeList(
  page: Page,
  payload: Record<string, unknown>,
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Fetching ESIC employee list via menu click");

  // ── Step 1: Kill ALL popups ──────────────────────────────────────────────────
  // ESIC session-warning popups are JS-rendered 1–3s after page load.
  // Wait 2.5s first so the popup has time to appear, then dismiss.
  await ctx.log("info", "Waiting 2.5s for JS-rendered popups to appear...");
  await page.waitForTimeout(2500);
  await dismissAllPopups(page, ctx, "popup-pass-1");
  await page.waitForTimeout(800);
  await dismissAllPopups(page, ctx, "popup-pass-2");
  await page.waitForTimeout(800);
  await dismissAllPopups(page, ctx, "popup-pass-3");

  await ctx.takeScreenshot("esic-dashboard-clean");
  await ctx.log("info", "All popups cleared — current page: " + page.url());

  // ── Debug: dump all links on the page so we can see what's available ────────
  const allPageLinks = await page.$$eval("a", (anchors) =>
    anchors
      .filter((a) => (a.textContent ?? "").trim().length > 0)
      .map((a) => ({
        text: (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
        href: (a as HTMLAnchorElement).href?.slice(0, 100) ?? "",
      }))
  ).catch(() => [] as { text: string; href: string }[]);
  await ctx.log("info", `Links on page (${allPageLinks.length}): ` +
    allPageLinks.slice(0, 30).map((l) => `"${l.text}" → ${l.href}`).join(" | ")
  );

  // ── Step 2: Click "List of Employees" from the Employee menu ────────────────
  // Try progressively broader strategies until one works.
  // Strategy 1: direct text match
  // Strategy 2: href fragment match (FormThree / ListofEmployees)
  // Strategy 3: expand Employee accordion section first, then retry
  // Strategy 4: full DOM scan (any link whose text contains the phrase)
  // Strategy 5: click via onclick evaluation (last resort for JS-only links)

  let clicked = false;
  let clickedText = "";

  // ── Strategy 1 & 2: direct selectors (text + href) ─────────────────────────
  const DIRECT_SELS = [
    'a:has-text("List of Employees")',
    'a:has-text("List Of Employees")',
    'a:has-text("LIST OF EMPLOYEES")',
    'a:has-text("Employees List")',
    'a[href*="FormThree"]',
    'a[href*="ListofEmployees"]',
    'a[href*="listofemployees" i]',
    'a[href*="Employee/Form"]',
    'a[href*="ListEmployee"]',
    'a[href*="listemployee" i]',
  ];

  for (const sel of DIRECT_SELS) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: 2000 });
      clickedText = await loc.textContent().catch(() => sel) ?? sel;
      await loc.click({ force: true });
      clicked = true;
      await ctx.log("info", `Clicked via direct selector "${sel}": "${clickedText.trim()}"`);
      break;
    } catch { /* try next */ }
  }

  // ── Strategy 3: expand Employee accordion, then retry ──────────────────────
  if (!clicked) {
    await ctx.log("info", "Direct selectors failed — expanding Employee menu section");
    const SECTION_SELS = [
      'a:has-text("EMPLOYEE")',
      'a:has-text("Employee")',
      'a:has-text("Insured Person")',
      'li:has-text("EMPLOYEE") > a',
      'li:has-text("Employee") > a',
      'span:has-text("EMPLOYEE")',
    ];
    for (const sel of SECTION_SELS) {
      try {
        await page.locator(sel).first().click({ force: true, timeout: 3000 });
        await page.waitForTimeout(800);
        await ctx.log("info", `Clicked section header: "${sel}"`);
        await dismissAllPopups(page, ctx, "after-section-expand");
        break;
      } catch { /* try next section selector */ }
    }

    // Retry direct selectors after accordion open
    for (const sel of DIRECT_SELS) {
      try {
        const loc = page.locator(sel).first();
        await loc.waitFor({ state: "visible", timeout: 3000 });
        clickedText = await loc.textContent().catch(() => sel) ?? sel;
        await loc.click({ force: true });
        clicked = true;
        await ctx.log("info", `Clicked after accordion expand via "${sel}"`);
        break;
      } catch { /* try next */ }
    }
  }

  // ── Strategy 4: full DOM text scan ─────────────────────────────────────────
  if (!clicked) {
    await ctx.log("warn", "Accordion expand failed — scanning all links by text");
    const links = await page.$$("a, span[onclick], div[onclick], td[onclick]");
    for (const link of links) {
      const text = (await link.textContent().catch(() => "")).trim().toLowerCase();
      if (
        text.includes("list of employee") ||
        text.includes("listofemployee") ||
        text.includes("employee list") ||
        text.includes("form three") ||
        text.includes("formthree")
      ) {
        await link.click({ force: true } as Parameters<typeof link.click>[0]).catch(() => {});
        clickedText = text;
        clicked = true;
        await ctx.log("info", `Clicked via full DOM scan: "${text}"`);
        break;
      }
    }
  }

  // ── Strategy 5: JS onclick evaluation ──────────────────────────────────────
  if (!clicked) {
    await ctx.log("warn", "Text scan failed — trying JS onclick patterns");
    try {
      const found = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll("[onclick]")) as HTMLElement[];
        const target = allEls.find((el) => {
          const oc = (el.getAttribute("onclick") ?? "").toLowerCase();
          const tx = (el.textContent ?? "").toLowerCase();
          return (
            oc.includes("formthree") ||
            oc.includes("listofemployee") ||
            tx.includes("list of employee") ||
            tx.includes("employee list")
          );
        });
        if (target) {
          target.click();
          return target.textContent?.trim() ?? "found";
        }
        return null;
      });
      if (found) {
        clicked = true;
        clickedText = found;
        await ctx.log("info", `Clicked via JS onclick evaluation: "${found}"`);
      }
    } catch { /* ignore */ }
  }

  if (!clicked) {
    // Take a debug screenshot and return an error result WITHOUT throwing —
    // this keeps the browser alive so the user can inspect it.
    await ctx.takeScreenshot("esic-employee-list-nav-failed");
    await ctx.log("error",
      "Could not find 'List of Employees' link. " +
      `Page URL: ${page.url()}. ` +
      `Links found: ${allPageLinks.map((l) => `"${l.text}"`).join(", ") || "(none)"}`
    );
    return {
      employees: [],
      count: 0,
      pages: 0,
      error: "Navigation failed: 'List of Employees' link not found on the portal. " +
             "Please check the live view and try logging in again.",
      pageUrl: page.url(),
      linksFound: allPageLinks.map((l) => l.text),
    };
  }

  // ── Step 3: Wait for the list page and kill new popups ───────────────────────
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  await dismissAllPopups(page, ctx, "after-list-nav");
  await dismissAllPopups(page, ctx, "after-list-nav-2");

  await ctx.takeScreenshot("esic-employee-list-page");
  await ctx.log("info", "On employee list page: " + page.url());

  const allEmployees: Record<string, string>[] = [];

  async function scrapeTable(): Promise<number> {
    // Extract headers from the first header row
    const headers = await page.$$eval(
      "table thead tr th, table tr:first-child th",
      (ths) => ths.map((th) => th.textContent?.trim().replace(/\s+/g, " ") ?? "")
    ).catch(() => [] as string[]);

    // Extract data rows — skip empty rows
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
        // Fallback: use positional keys matching common ESIC columns
        const keys = ["SNo", "IPNo", "EmployeeCode", "Name", "FatherName", "DOB", "DOJ", "Wages", "Status"];
        row.forEach((cell, i) => { emp[keys[i] ?? `col${i + 1}`] = cell; });
      }
      allEmployees.push(emp);
    }
    return rows.length;
  }

  await scrapeTable();

  // Follow pagination links
  let pageNum = 1;
  while (pageNum < 50) {
    const nextLink = await page.$(
      'a:has-text("Next >"), a:has-text(">>"), a[id*="Next" i]:not([disabled]), input[value="Next >"]'
    );
    if (!nextLink) break;
    const ariaDisabled = await nextLink.getAttribute("aria-disabled");
    const disabled = await nextLink.getAttribute("disabled");
    if (ariaDisabled === "true" || disabled !== null) break;
    await nextLink.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    const count = await scrapeTable();
    pageNum++;
    if (count === 0) break;
  }

  await ctx.log("info", `ESIC employee list complete: ${allEmployees.length} employees across ${pageNum} page(s)`);
  return {
    employees: allEmployees,
    count: allEmployees.length,
    pages: pageNum,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Contribution Tracking ────────────────────────────────────────────────────
export async function contributionTracking(
  page: Page,
  payload: { ipNumber: string; fromDate: string; toDate: string },
  ctx: AutomationContext
): Promise<Record<string, unknown>> {
  await ctx.log("info", "Fetching contribution history", { ipNumber: payload.ipNumber });

  await gotoWithRetry(page, `${ESIC_BASE}/ContributionHistory.aspx`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.ipNoInput, payload.ipNumber);
  await page.fill(SEL.contribHistFrom, payload.fromDate).catch(() => {});
  await page.fill(SEL.contribHistTo, payload.toDate).catch(() => {});
  await page.click(SEL.contribHistSearch);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await ctx.takeScreenshot("contribution-tracking");

  const rows = await page.$$eval("table#tblContrib tr, table tr", (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim()))
  ).catch(() => [] as string[][]);

  const totalRow = rows.find((r) => r.some((c) => c?.toLowerCase().includes("total")));

  await ctx.log("info", "Contribution history fetched", { rowCount: rows.length });

  return {
    ipNumber: payload.ipNumber,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    rows: rows.slice(0, 50),
    total: totalRow ?? null,
  };
}
