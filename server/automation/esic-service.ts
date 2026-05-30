/**
 * ESIC Automation Service
 *
 * Implements browser automation for the ESIC Employer Portal
 * (https://www.esic.in/EmployerPortal/).
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
      await page.goto(url, { waitUntil, timeout });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await page.waitForTimeout(3000);
      }
    }
  }
  throw lastErr;
}

// ─── Portal URLs ──────────────────────────────────────────────────────────────
const ESIC_BASE = "https://esic.gov.in/EmployerPortal";
const ESIC_LOGIN_URL = "https://esic.gov.in/EmployerPortal/ESICInsuredPersonPortal/ESICInsuredPersonLogin.aspx";

// ─── Selector constants ───────────────────────────────────────────────────────
const SEL = {
  // Login page
  username:           '#txtUserid, input[name*="UserId" i], input[name*="username" i]',
  password:           '#txtPassword, input[type="password"]',
  captchaInput:       '#txtCaptcha, input[name*="captcha" i], input[id*="captcha" i]',
  captchaImage:       'img[id*="Captcha" i], img[alt*="captcha" i]',
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
    return await page.isVisible(SEL.captchaImage, { timeout: 2000 });
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
export async function esicLogin(
  page: Page,
  payload: { username: string; password: string },
  ctx: AutomationContext
): Promise<void> {
  await ctx.log("info", "Navigating to ESIC login page");
  await gotoWithRetry(page, ESIC_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.username, payload.username);
  await page.fill(SEL.password, payload.password);

  if (await hasCaptcha(page)) {
    const ans = await solveCaptcha(page, ctx, "esic-login-captcha");
    await page.fill(SEL.captchaInput, ans);
  }

  await page.click(SEL.loginBtn);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  if (await hasOtp(page)) {
    const otp = await solveOtp(page, ctx, "esic-login-otp");
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.otpSubmitBtn);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  const currentUrl = page.url();
  if (currentUrl.toLowerCase().includes("login")) {
    // Try to extract a visible error message from the portal
    const portalError = await page
      .locator('.error-msg, .errorMessage, .alert-danger, #lblMessage, #ErrorMessage, [class*="error" i], .validation-summary-errors')
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => null);

    if (portalError?.trim()) {
      throw new Error(`Login failed — ${portalError.trim()}`);
    }

    // Scan the full body for known credential-failure keywords
    const bodyText = await page.textContent("body").catch(() => "");
    const credentialError = /invalid.*password|wrong.*password|incorrect.*password|invalid.*user|user.*not.*found|invalid.*credential|authentication.*fail/i.test(bodyText ?? "");

    if (credentialError) {
      throw new Error("Login failed — the ESIC portal rejected your credentials. Check your username and password.");
    }

    throw new Error("Login failed — still on the ESIC login page after submitting. The portal may have changed or credentials are wrong.");
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
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
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
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.fill(SEL.ipNoInput, payload.ipNumber);
  await page.click(SEL.familySearchBtn);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
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
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
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
