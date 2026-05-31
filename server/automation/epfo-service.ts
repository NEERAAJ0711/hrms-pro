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
  captchaInput:      'input[name="captcha"], #captcha, input[placeholder*="captcha" i], input[placeholder*="Captcha"]',
  captchaImage:      'img[id*="captcha" i], img[alt*="captcha" i], .captchaImg',
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

/** Wait for selector with a reasonable timeout */
async function waitFor(page: Page, selector: string, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout, state: "visible" });
    return true;
  } catch {
    return false;
  }
}

/** Check if current page looks like a CAPTCHA challenge */
async function hasCaptcha(page: Page): Promise<boolean> {
  try {
    const visible = await page.isVisible(SEL.captchaImage, { timeout: 2000 });
    return visible;
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
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Screenshot of the raw login page — useful for verifying selectors match
  await safeScreenshot(page, ctx, "epfo-login-page");

  // Fill credentials
  await page.fill(SEL.username, payload.username);
  await ctx.log("info", "Filled username");
  await page.fill(SEL.password, payload.password);
  await ctx.log("info", "Filled password");

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

      await page.click(SEL.loginBtn);
      await ctx.log("info", "Clicked login button");
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

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
    // No CAPTCHA found — take a screenshot anyway so we can see the form state
    await safeScreenshot(page, ctx, "epfo-login-no-captcha");
    await page.click(SEL.loginBtn);
    await ctx.log("info", "Clicked login button");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  // Check for OTP challenge
  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "login-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpVerifyBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

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

  // Fill employee details
  const fieldMap: Array<[string, string]> = [
    ['input[name*="memberName" i], #memberName', payload.name],
    ['input[name*="dob" i], #dob', payload.dob],
    ['input[name*="gender" i], select[name*="gender" i]', payload.gender],
    ['input[name*="fatherName" i], #fatherName', payload.fatherName ?? ""],
    ['input[name*="aadhaar" i], #aadhaarNo', payload.aadhaar ?? ""],
    ['input[name*="mobile" i], #mobile', payload.mobileNumber ?? ""],
    ['input[name*="doj" i], #doj', payload.dateOfJoining],
  ];

  for (const [selector, value] of fieldMap) {
    if (!value) continue;
    const exists = await waitFor(page, selector, 3000);
    if (exists) {
      await page.fill(selector, value).catch(() => {});
    }
  }

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

  await page.fill(SEL.kycUan, payload.uan);
  await page.click('button[id*="search" i], input[value*="Search" i]');
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Select Aadhaar KYC type
  const aadhaarRadio = await page.$('input[value*="AADHAR" i], input[value*="Aadhaar" i]');
  if (aadhaarRadio) await aadhaarRadio.click();

  await page.fill(SEL.kycAadhaar, payload.aadhaar);
  const nameField = await page.$('input[name*="docName" i], #docName');
  if (nameField) await nameField.fill(payload.name);

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
