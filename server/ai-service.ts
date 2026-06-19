// AI HR Assistant Service — OpenAI → Gemini → rule-based fallback
import { db } from "./db";
import { AiFollowUpRepository } from "./repositories/ai-follow-up-repository";
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

// ─── Employee Live Data Context ───────────────────────────────────────────────

export interface EmployeeContext {
  // Employee static info
  employeeInfo?: {
    uan: string | null;
    esiNumber: string | null;
    pan: string | null;
    pfApplicable: boolean;
    esiApplicable: boolean;
    otApplicable: boolean;
    otRate: string | null;
    designation: string | null;
    department: string | null;
    dateOfJoining: string | null;
  };
  // Last few payslips
  recentPayslips: Array<{
    month: string;
    year: number;
    netSalary: number;
    grossSalary: number;
    totalDeductions: number;
    basicSalary: number;
    hra: number;
    conveyance: number;
    medicalAllowance: number;
    specialAllowance: number;
    otherAllowances: number;
    customEarnings: Record<string, number>;
    pfEmployee: number;
    vpfAmount: number;
    esi: number;
    professionalTax: number;
    lwfEmployee: number;
    tds: number;
    otherDeductions: number;
    loanDeduction: number;
    customDeductions: Record<string, number>;
    bonus: number;
    otHours: string;
    otAmount: number;
    status: string;
    presentDays: string;
    workingDays: number;
    leaveDays: number;
    paidOn: string | null;
  }>;
  // Leave summary for the current year
  leaveSummary: Array<{
    leaveTypeName: string;
    leaveTypeCode: string;
    daysAllowed: number;
    daysUsed: number;
    daysPending: number;
    daysAvailable: number;
  }>;
  // Attendance for the current month
  currentMonthAttendance: {
    month: string;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    leaveDays: number;
    totalRecords: number;
  };
  // Active salary structure (CTC breakdown)
  salaryStructure?: {
    basicSalary: number;
    hra: number;
    conveyance: number;
    medicalAllowance: number;
    specialAllowance: number;
    otherAllowances: number;
    customEarnings: Record<string, number>;
    grossSalary: number;
    pfEmployee: number;
    pfEmployer: number;
    vpfAmount: number;
    esi: number;
    professionalTax: number;
    lwfEmployee: number;
    tds: number;
    otherDeductions: number;
    customDeductions: Record<string, number>;
    netSalary: number;
    effectiveFrom: string;
  } | null;
  // Active loan/advance records
  loanAdvances: Array<{
    type: string;
    amount: number;
    purpose: string | null;
    status: string;
    requestDate: string;
    totalInstallments: number | null;
    installmentAmount: number | null;
    remainingBalance: number | null;
    deductionStartMonth: string | null;
  }>;
  // KRA/KPI assignments (current year)
  kraAssignments: Array<{
    title: string;
    reviewPeriod: string;
    periodYear: number;
    status: string;
    selfScore: number | null;
    managerScore: number | null;
    totalScore: number | null;
    feedback: string | null;
    kpis: Array<{
      kpiName: string;
      weightage: number;
      targetValue: number | null;
      actualValue: number | null;
      selfScore: number | null;
      managerScore: number | null;
      computedScore: number | null;
    }>;
  }>;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function buildLiveDataSection(ctx: EmployeeContext | null): string {
  if (!ctx) return "";

  const lines: string[] = ["\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"];
  lines.push("LIVE EMPLOYEE DATA (always use these exact figures in your responses):");

  // ── Employee Info ─────────────────────────────────────────────────────────
  if (ctx.employeeInfo) {
    const ei = ctx.employeeInfo;
    lines.push("\nEMPLOYEE INFO:");
    if (ei.designation) lines.push(`  Designation: ${ei.designation}${ei.department ? `, Department: ${ei.department}` : ""}`);
    if (ei.dateOfJoining) lines.push(`  Date of Joining: ${ei.dateOfJoining}`);
    if (ei.uan) lines.push(`  UAN Number: ${ei.uan}`);
    if (ei.esiNumber) lines.push(`  ESI Number: ${ei.esiNumber}`);
    if (ei.pan) lines.push(`  PAN: ${ei.pan}`);
    lines.push(`  PF Applicable: ${ei.pfApplicable ? "Yes" : "No"}, ESI Applicable: ${ei.esiApplicable ? "Yes" : "No"}`);
    if (ei.otApplicable) lines.push(`  OT Applicable: Yes (Rate: ${ei.otRate ?? "2x"})`);
  }

  // ── Salary Structure ──────────────────────────────────────────────────────
  if (ctx.salaryStructure) {
    const ss = ctx.salaryStructure;
    lines.push(`\nSALARY STRUCTURE (effective ${ss.effectiveFrom}):`);
    lines.push(`  EARNINGS:`);
    lines.push(`    Basic Salary: ${formatCurrency(ss.basicSalary)}`);
    if (ss.hra) lines.push(`    HRA: ${formatCurrency(ss.hra)}`);
    if (ss.conveyance) lines.push(`    Conveyance: ${formatCurrency(ss.conveyance)}`);
    if (ss.medicalAllowance) lines.push(`    Medical Allowance: ${formatCurrency(ss.medicalAllowance)}`);
    if (ss.specialAllowance) lines.push(`    Special Allowance: ${formatCurrency(ss.specialAllowance)}`);
    if (ss.otherAllowances) lines.push(`    Other Allowances: ${formatCurrency(ss.otherAllowances)}`);
    Object.entries(ss.customEarnings ?? {}).forEach(([k, v]) => { if (v) lines.push(`    ${k}: ${formatCurrency(v)}`); });
    lines.push(`  Gross Salary: ${formatCurrency(ss.grossSalary)}`);
    lines.push(`  DEDUCTIONS:`);
    if (ss.pfEmployee) lines.push(`    PF (Employee): ${formatCurrency(ss.pfEmployee)}`);
    if (ss.pfEmployer) lines.push(`    PF (Employer): ${formatCurrency(ss.pfEmployer)}`);
    if (ss.vpfAmount) lines.push(`    VPF: ${formatCurrency(ss.vpfAmount)}`);
    if (ss.esi) lines.push(`    ESI: ${formatCurrency(ss.esi)}`);
    if (ss.professionalTax) lines.push(`    Professional Tax: ${formatCurrency(ss.professionalTax)}`);
    if (ss.lwfEmployee) lines.push(`    LWF: ${formatCurrency(ss.lwfEmployee)}`);
    if (ss.tds) lines.push(`    TDS: ${formatCurrency(ss.tds)}`);
    if (ss.otherDeductions) lines.push(`    Other Deductions: ${formatCurrency(ss.otherDeductions)}`);
    Object.entries(ss.customDeductions ?? {}).forEach(([k, v]) => { if (v) lines.push(`    ${k}: ${formatCurrency(v)}`); });
    lines.push(`  Net Salary (CTC take-home): ${formatCurrency(ss.netSalary)}`);
  }

  // ── Payslips ──────────────────────────────────────────────────────────────
  if (ctx.recentPayslips.length > 0) {
    lines.push("\nRECENT PAYSLIPS:");
    ctx.recentPayslips.forEach((p) => {
      const statusLabel = p.status === "paid" ? `Paid${p.paidOn ? ` on ${p.paidOn}` : ""}` : p.status === "processed" ? "Processed" : "Draft";
      lines.push(`  • ${p.month} ${p.year}: Gross ${formatCurrency(p.grossSalary)}, Net ${formatCurrency(p.netSalary)} [${statusLabel}]`);
      lines.push(`    Earnings: Basic ${formatCurrency(p.basicSalary)}, HRA ${formatCurrency(p.hra)}, Conv ${formatCurrency(p.conveyance)}, Med ${formatCurrency(p.medicalAllowance)}, Spl ${formatCurrency(p.specialAllowance)}${p.bonus ? `, Bonus ${formatCurrency(p.bonus)}` : ""}${parseFloat(p.otHours) > 0 ? `, OT ${p.otHours}hrs=${formatCurrency(p.otAmount)}` : ""}`);
      lines.push(`    Deductions: PF ${formatCurrency(p.pfEmployee)}, ESI ${formatCurrency(p.esi)}, TDS ${formatCurrency(p.tds)}${p.professionalTax ? `, PT ${formatCurrency(p.professionalTax)}` : ""}${p.lwfEmployee ? `, LWF ${formatCurrency(p.lwfEmployee)}` : ""}${p.loanDeduction ? `, Loan/Adv ${formatCurrency(p.loanDeduction)}` : ""}${p.vpfAmount ? `, VPF ${formatCurrency(p.vpfAmount)}` : ""}${p.otherDeductions ? `, Other ${formatCurrency(p.otherDeductions)}` : ""}`);
      Object.entries(p.customDeductions ?? {}).forEach(([k, v]) => { if (v) lines.push(`    Custom Deduction - ${k}: ${formatCurrency(v)}`); });
      lines.push(`    Present: ${p.presentDays}/${p.workingDays} days, Leave: ${p.leaveDays} days`);
    });
  } else {
    lines.push("\nRECENT PAYSLIPS: No payslip records found yet.");
  }

  // ── Leave Balance ─────────────────────────────────────────────────────────
  if (ctx.leaveSummary.length > 0) {
    lines.push("\nLEAVE BALANCE (current year):");
    ctx.leaveSummary.forEach((l) => {
      lines.push(`  • ${l.leaveTypeName} (${l.leaveTypeCode}): ${l.daysAvailable} days available [${l.daysUsed} used, ${l.daysPending} pending approval out of ${l.daysAllowed} total]`);
    });
  } else {
    lines.push("\nLEAVE BALANCE: No leave types configured for this company yet.");
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  const att = ctx.currentMonthAttendance;
  if (att.totalRecords > 0) {
    lines.push(`\nATTENDANCE (${att.month}): Present: ${att.presentDays} days, Absent: ${att.absentDays} days, Half-day: ${att.halfDays}, Leave: ${att.leaveDays} days`);
  } else {
    lines.push(`\nATTENDANCE (${att.month}): No attendance records for this month yet.`);
  }

  // ── Loan / Advance ────────────────────────────────────────────────────────
  if (ctx.loanAdvances && ctx.loanAdvances.length > 0) {
    lines.push("\nLOAN & ADVANCE RECORDS:");
    ctx.loanAdvances.forEach((la) => {
      const typeLabel = la.type === "loan" ? "Loan" : "Advance";
      lines.push(`  • ${typeLabel}: ${formatCurrency(la.amount)} [${la.status.toUpperCase()}]${la.purpose ? ` — Purpose: ${la.purpose}` : ""}`);
      if (la.remainingBalance != null) lines.push(`    Remaining Balance: ${formatCurrency(la.remainingBalance)}`);
      if (la.totalInstallments && la.installmentAmount) lines.push(`    EMI: ${formatCurrency(la.installmentAmount)}/month × ${la.totalInstallments} installments`);
      if (la.deductionStartMonth) lines.push(`    Deduction starts: ${la.deductionStartMonth}`);
    });
  } else {
    lines.push("\nLOAN & ADVANCE: No active loan or advance records.");
  }

  // ── KRA / KPI ─────────────────────────────────────────────────────────────
  if (ctx.kraAssignments && ctx.kraAssignments.length > 0) {
    lines.push("\nKRA / KPI ASSIGNMENTS:");
    ctx.kraAssignments.forEach((ka) => {
      lines.push(`  • ${ka.title} [${ka.reviewPeriod} ${ka.periodYear}] — Status: ${ka.status}`);
      if (ka.totalScore != null) lines.push(`    Final Score: ${ka.totalScore.toFixed(1)}/100`);
      else if (ka.managerScore != null) lines.push(`    Manager Score: ${ka.managerScore.toFixed(1)}/100`);
      else if (ka.selfScore != null) lines.push(`    Self Score: ${ka.selfScore.toFixed(1)}/100 (pending manager review)`);
      if (ka.feedback) lines.push(`    Feedback: ${ka.feedback}`);
      if (ka.kpis && ka.kpis.length > 0) {
        lines.push(`    KPIs:`);
        ka.kpis.forEach((kpi) => {
          const target = kpi.targetValue != null ? `Target: ${kpi.targetValue}` : "";
          const actual = kpi.actualValue != null ? `Actual: ${kpi.actualValue}` : "Actual: not entered";
          const score = kpi.computedScore != null ? `Score: ${kpi.computedScore.toFixed(1)}` : "";
          lines.push(`      - ${kpi.kpiName} (wt: ${kpi.weightage}%) | ${target} | ${actual}${score ? ` | ${score}` : ""}`);
        });
      }
    });
  } else {
    lines.push("\nKRA / KPI: No KRA assignments found for this year.");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  lines.push("When employees ask about salary, payslip, leave, attendance, OT, loan, advance, KRA, KPI, UAN, deductions, or salary structure — ALWAYS use the exact figures above. Do NOT say 'check the portal' for these — you already have the data.");

  return lines.join("\n");
}

// ─── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(employeeName: string, kyc: KycStatus, language: string, ctx?: EmployeeContext | null): string {
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

IMPORTANT: When an employee uploads a document (they'll mention uploading), confirm you've received it and tell them which document was updated. Always end with what the next pending document is (if any).${buildLiveDataSection(ctx ?? null)}`;
}

// ─── Rule-based fallback responses ────────────────────────────────────────────

function buildRuleBasedResponse(
  userMessage: string,
  employeeName: string,
  kyc: KycStatus,
  language: string,
  ctx?: EmployeeContext | null,
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

  // Leave query — use real data if available
  if (msg.includes("leave") || msg.includes("balance") || msg.includes("छुट्टी") || msg.includes("balance")) {
    if (ctx && ctx.leaveSummary.length > 0) {
      const leaveLines = ctx.leaveSummary.map(
        (l) => `**${l.leaveTypeName}**: ${l.daysAvailable} days available (${l.daysUsed} used, ${l.daysPending} pending)`
      ).join("\n");
      return isHindi
        ? `${firstName} जी, आपकी current leave balance:\n${ctx.leaveSummary.map(l => `**${l.leaveTypeName}**: ${l.daysAvailable} दिन उपलब्ध`).join("\n")}`
        : `${firstName}, here is your current leave balance:\n\n${leaveLines}\n\nTo apply for leave, use the **Leave** module in the sidebar.`;
    }
    return isHindi
      ? `${firstName} जी, छुट्टी के लिए कृपया Leave module में जाएं। कोई अर्जेंट छुट्टी हो तो अपने manager से बात करें।`
      : `For leave requests, please use the **Leave** module in the sidebar. For urgent leave, contact your reporting manager directly.`;
  }

  // Payroll/salary/payslip query — use real data if available
  if (msg.includes("salary") || msg.includes("payroll") || msg.includes("payslip") || msg.includes("वेतन") || msg.includes("ctc") || msg.includes("net")) {
    if (ctx && ctx.recentPayslips.length > 0) {
      const latest = ctx.recentPayslips[0];
      return isHindi
        ? `${firstName} जी, आपकी ${latest.month} ${latest.year} की salary:\n- Gross: ₹${latest.grossSalary.toLocaleString("en-IN")}\n- Deductions: ₹${latest.totalDeductions.toLocaleString("en-IN")}\n- **Net Pay: ₹${latest.netSalary.toLocaleString("en-IN")}** [${latest.status}]\n- Present: ${latest.presentDays}/${latest.workingDays} दिन`
        : `${firstName}, here's your latest payslip (${latest.month} ${latest.year}):\n\n- **Gross Salary**: ₹${latest.grossSalary.toLocaleString("en-IN")}\n- Basic: ₹${latest.basicSalary.toLocaleString("en-IN")}, HRA: ₹${latest.hra.toLocaleString("en-IN")}\n- PF Deduction: ₹${latest.pfEmployee.toLocaleString("en-IN")}, ESI: ₹${latest.esi.toLocaleString("en-IN")}, TDS: ₹${latest.tds.toLocaleString("en-IN")}\n- **Net Pay: ₹${latest.netSalary.toLocaleString("en-IN")}** [${latest.status.toUpperCase()}]\n- Present: ${latest.presentDays}/${latest.workingDays} days\n\nFor older payslips, use the **Payroll** module.`;
    }
    return isHindi
      ? `${firstName} जी, वेतन पर्ची Payroll module में मिलेगी। ध्यान रखें कि salary credit के लिए bank details का KYC पूरा होना जरूरी है।`
      : `Your payslips are available in the **Payroll** module. Note that salary credit requires your bank KYC to be complete. ${!kyc.bankDetailsSubmitted ? "You still need to submit your bank details — shall we do that now?" : "Your bank details are already on file ✅"}`;
  }

  // Attendance query — use real data if available
  if (msg.includes("attendance") || msg.includes("present") || msg.includes("absent") || msg.includes("उपस्थिति")) {
    const att = ctx?.currentMonthAttendance;
    if (att && att.totalRecords > 0) {
      return isHindi
        ? `${firstName} जी, ${att.month} की attendance:\n- Present: ${att.presentDays} दिन\n- Absent: ${att.absentDays} दिन\n- Half Day: ${att.halfDays} दिन\n- Leave: ${att.leaveDays} दिन`
        : `${firstName}, your attendance for **${att.month}**:\n- ✅ Present: ${att.presentDays} days\n- ❌ Absent: ${att.absentDays} days\n- 🔶 Half Day: ${att.halfDays} days\n- 🏖️ On Leave: ${att.leaveDays} days\n\nFor full attendance history, use the **My Attendance** module.`;
    }
    return isHindi
      ? `${firstName} जी, attendance records के लिए My Attendance module में जाएं।`
      : `For your attendance records, please check the **My Attendance** module in the sidebar.`;
  }

  // OT / Overtime query
  if (msg.includes("overtime") || msg.includes(" ot ") || msg.match(/\bot\b/) || msg.includes("ओटी") || msg.includes("ओवरटाइम")) {
    if (ctx && ctx.recentPayslips.length > 0) {
      const latest = ctx.recentPayslips[0];
      const otHrs = parseFloat(latest.otHours ?? "0");
      if (otHrs > 0) {
        return isHindi
          ? `${firstName} जी, ${latest.month} ${latest.year} में आपके OT:\n- OT Hours: ${latest.otHours} hours\n- OT Amount: ₹${latest.otAmount.toLocaleString("en-IN")}`
          : `${firstName}, your OT for **${latest.month} ${latest.year}**:\n- OT Hours: **${latest.otHours} hrs**\n- OT Amount: **₹${latest.otAmount.toLocaleString("en-IN")}**\n\nOT rate: ${ctx.employeeInfo?.otRate ?? "2x"} of basic hourly rate.`;
      }
      return isHindi
        ? `${firstName} जी, ${latest.month} ${latest.year} में कोई OT नहीं है।`
        : `${firstName}, no overtime recorded for **${latest.month} ${latest.year}**. ${ctx.employeeInfo?.otApplicable ? "OT is enabled for your profile." : "OT may not be applicable to your role — check with HR."}`;
    }
    return isHindi
      ? `${firstName} जी, OT records Payroll module में देखें।`
      : `For OT records, please check the **Payroll** module in the sidebar.`;
  }

  // Salary Structure / CTC query
  if (msg.includes("salary structure") || msg.includes("ctc") || msg.includes("structure") || msg.includes("salary breakup") || msg.includes("वेतन संरचना")) {
    if (ctx?.salaryStructure) {
      const ss = ctx.salaryStructure;
      return isHindi
        ? `${firstName} जी, आपकी salary structure (effective ${ss.effectiveFrom}):\n**Earnings:**\n- Basic: ₹${ss.basicSalary.toLocaleString("en-IN")}\n- HRA: ₹${ss.hra.toLocaleString("en-IN")}\n- Gross: ₹${ss.grossSalary.toLocaleString("en-IN")}\n**Deductions:**\n- PF: ₹${ss.pfEmployee.toLocaleString("en-IN")}\n- ESI: ₹${ss.esi.toLocaleString("en-IN")}\n- TDS: ₹${ss.tds.toLocaleString("en-IN")}\n**Net Salary: ₹${ss.netSalary.toLocaleString("en-IN")}**`
        : `${firstName}, your salary structure (effective ${ss.effectiveFrom}):\n\n**Earnings:**\n- Basic: ₹${ss.basicSalary.toLocaleString("en-IN")}\n- HRA: ₹${ss.hra.toLocaleString("en-IN")}\n- Conveyance: ₹${ss.conveyance.toLocaleString("en-IN")}\n- Special Allowance: ₹${ss.specialAllowance.toLocaleString("en-IN")}\n- **Gross: ₹${ss.grossSalary.toLocaleString("en-IN")}**\n\n**Deductions:**\n- PF (Employee): ₹${ss.pfEmployee.toLocaleString("en-IN")}\n- ESI: ₹${ss.esi.toLocaleString("en-IN")}\n- TDS: ₹${ss.tds.toLocaleString("en-IN")}${ss.professionalTax ? `\n- Professional Tax: ₹${ss.professionalTax.toLocaleString("en-IN")}` : ""}\n\n**Net Salary: ₹${ss.netSalary.toLocaleString("en-IN")}**`;
    }
    return isHindi
      ? `${firstName} जी, salary structure के लिए HR admin से संपर्क करें।`
      : `${firstName}, your salary structure hasn't been set up yet. Please contact your HR admin.`;
  }

  // Deduction details
  if (msg.includes("deduction") || msg.includes("कटौती") || msg.includes("pf deduction") || msg.includes("tds")) {
    if (ctx && ctx.recentPayslips.length > 0) {
      const p = ctx.recentPayslips[0];
      const deductionLines = [
        p.pfEmployee ? `- PF (Employee): ₹${p.pfEmployee.toLocaleString("en-IN")}` : "",
        p.vpfAmount ? `- VPF: ₹${p.vpfAmount.toLocaleString("en-IN")}` : "",
        p.esi ? `- ESI: ₹${p.esi.toLocaleString("en-IN")}` : "",
        p.tds ? `- TDS: ₹${p.tds.toLocaleString("en-IN")}` : "",
        p.professionalTax ? `- Professional Tax: ₹${p.professionalTax.toLocaleString("en-IN")}` : "",
        p.lwfEmployee ? `- LWF: ₹${p.lwfEmployee.toLocaleString("en-IN")}` : "",
        p.loanDeduction ? `- Loan/Advance EMI: ₹${p.loanDeduction.toLocaleString("en-IN")}` : "",
        p.otherDeductions ? `- Other: ₹${p.otherDeductions.toLocaleString("en-IN")}` : "",
        ...Object.entries(p.customDeductions ?? {}).filter(([, v]) => v).map(([k, v]) => `- ${k}: ₹${(v as number).toLocaleString("en-IN")}`),
      ].filter(Boolean).join("\n");
      return isHindi
        ? `${firstName} जी, ${p.month} ${p.year} की deductions:\n${deductionLines}\n**Total Deductions: ₹${p.totalDeductions.toLocaleString("en-IN")}**`
        : `${firstName}, deductions for **${p.month} ${p.year}**:\n\n${deductionLines}\n\n**Total Deductions: ₹${p.totalDeductions.toLocaleString("en-IN")}**`;
    }
    return isHindi
      ? `${firstName} जी, deduction details Payroll module में देखें।`
      : `For deduction details, check the **Payroll** module in the sidebar.`;
  }

  // Loan / Advance query
  if (msg.includes("loan") || msg.includes("advance") || msg.includes("emi") || msg.includes("लोन") || msg.includes("अग्रिम")) {
    if (ctx && ctx.loanAdvances && ctx.loanAdvances.length > 0) {
      const active = ctx.loanAdvances.filter((la) => ["active", "approved"].includes(la.status));
      const pending = ctx.loanAdvances.filter((la) => la.status === "pending");
      let reply = `${firstName}, here are your loan & advance records:\n\n`;
      if (active.length > 0) {
        reply += `**Active Records:**\n`;
        active.forEach((la) => {
          reply += `• ${la.type === "loan" ? "Loan" : "Advance"}: ₹${la.amount.toLocaleString("en-IN")} [${la.status.toUpperCase()}]`;
          if (la.remainingBalance != null) reply += ` — Remaining: ₹${la.remainingBalance.toLocaleString("en-IN")}`;
          if (la.installmentAmount) reply += `, EMI: ₹${la.installmentAmount.toLocaleString("en-IN")}/month`;
          if (la.purpose) reply += `\n  Purpose: ${la.purpose}`;
          reply += "\n";
        });
      }
      if (pending.length > 0) {
        reply += `\n**Pending Approval:**\n`;
        pending.forEach((la) => {
          reply += `• ${la.type === "loan" ? "Loan" : "Advance"}: ₹${la.amount.toLocaleString("en-IN")} (requested ${la.requestDate})\n`;
        });
      }
      return reply.trim();
    }
    return isHindi
      ? `${firstName} जी, कोई active loan/advance record नहीं है। नया apply करने के लिए Loan & Advance module में जाएं।`
      : `${firstName}, you have no active loan or advance records. To apply for one, use the **Loan & Advance** module in the sidebar.`;
  }

  // KRA / KPI query
  if (msg.includes("kra") || msg.includes("kpi") || msg.includes("performance") || msg.includes("target") || msg.includes("score") || msg.includes("प्रदर्शन")) {
    if (ctx && ctx.kraAssignments && ctx.kraAssignments.length > 0) {
      const ka = ctx.kraAssignments[0];
      let reply = `${firstName}, your KRA/KPI for **${ka.reviewPeriod} ${ka.periodYear}** — **${ka.title}** [${ka.status.toUpperCase()}]:\n\n`;
      if (ka.totalScore != null) reply += `**Final Score: ${ka.totalScore.toFixed(1)}/100**\n`;
      else if (ka.managerScore != null) reply += `Manager Score: ${ka.managerScore.toFixed(1)}/100\n`;
      else if (ka.selfScore != null) reply += `Self Score: ${ka.selfScore.toFixed(1)}/100 (manager review pending)\n`;
      if (ka.kpis && ka.kpis.length > 0) {
        reply += `\nKPIs:\n`;
        ka.kpis.forEach((kpi) => {
          reply += `• **${kpi.kpiName}** (wt: ${kpi.weightage}%): Target ${kpi.targetValue ?? "—"} | Actual ${kpi.actualValue ?? "not entered"}`;
          if (kpi.computedScore != null) reply += ` | Score: ${kpi.computedScore.toFixed(1)}`;
          reply += "\n";
        });
      }
      if (ka.feedback) reply += `\nFeedback: ${ka.feedback}`;
      return reply.trim();
    }
    return isHindi
      ? `${firstName} जी, इस साल के लिए कोई KRA/KPI assignment नहीं मिला। अपने manager से संपर्क करें।`
      : `${firstName}, no KRA/KPI assignments found for this year. Please contact your manager or HR to get your goals assigned.`;
  }

  // UAN / ESI number query
  if (msg.includes("uan") || msg.includes("epf number") || msg.includes("esi number") || msg.includes("pf number") || msg.includes("यूएएन")) {
    if (ctx?.employeeInfo) {
      const ei = ctx.employeeInfo;
      if (ei.uan) {
        return isHindi
          ? `${firstName} जी, आपका UAN Number: **${ei.uan}**${ei.esiNumber ? `\nESI Number: **${ei.esiNumber}**` : ""}`
          : `${firstName}, your UAN (Universal Account Number): **${ei.uan}**${ei.esiNumber ? `\nESI Number: **${ei.esiNumber}**` : ""}\n\nYou can use this UAN to check your PF balance at [EPFO Member Portal](https://unifiedmembersportal.epfindia.gov.in/).`;
      }
      return isHindi
        ? `${firstName} जी, आपका UAN अभी assign नहीं हुआ है। HR admin से संपर्क करें।`
        : `${firstName}, your UAN has not been assigned yet. Please contact your HR admin. ${!kyc.aadhaarSubmitted ? "Note: Your Aadhaar is still pending — UAN generation requires Aadhaar." : ""}`;
    }
    return isHindi
      ? `${firstName} जी, UAN जानकारी के लिए HR admin से संपर्क करें।`
      : `For your UAN number, please contact your HR admin.`;
  }

  // PF query
  if (msg.includes("pf") || msg.includes("provident") || msg.includes("epfo") || msg.includes("पीएफ")) {
    const uan = ctx?.employeeInfo?.uan;
    return isHindi
      ? `${firstName} जी, PF लाभ के लिए Aadhaar, PAN और bank details का KYC जरूरी है।${uan ? ` आपका UAN: **${uan}**` : ""} ${!kyc.aadhaarSubmitted ? "आपका Aadhaar अभी pending है।" : ""}`
      : `For PF benefits and UAN activation, you need Aadhaar, PAN, and bank details KYC complete.${uan ? ` Your UAN: **${uan}**` : ""} ${!kyc.aadhaarSubmitted ? "Your Aadhaar is still pending — please upload it." : "Your Aadhaar is submitted ✅"}`;
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
  ctx?: EmployeeContext | null,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(employeeName, kyc, language, ctx);

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
  return buildRuleBasedResponse(userMessage, employeeName, kyc, language, ctx);
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

// ─── Compliance AI Co-pilot ────────────────────────────────────────────────────

function buildComplianceSystemPrompt(portal: string): string {
  const scope =
    portal === "epfo"
      ? "EPFO (Employees' Provident Fund Organisation) and PF compliance"
      : portal === "esic"
      ? "ESIC (Employees' State Insurance Corporation) and ESI compliance"
      : "EPFO/PF and ESIC/ESI compliance";

  return `You are an expert Indian statutory compliance assistant specialising in ${scope}. You help HR managers, payroll teams, and compliance officers in India.

KEY RATES & RULES (as of 2026):

PF / EPFO:
- Employee contribution: 12% of PF wages (basic + DA)
- Employer contribution: 12% split as → 3.67% to EPF, 8.33% to EPS (capped at ₹15,000 wages), 0.5% to EDLI
- Wage ceiling for EPS: ₹15,000/month (employees earning above still contribute on actuals)
- UAN (Universal Account Number): 12-digit, generated via EPFO Unified Portal
- ECR (Electronic Challan cum Return): Monthly, due by 15th of following month
- TRRN: Temporary Return Reference Number, generated after ECR submission
- ECR file format: Text file with member-wise contribution details
- PF applicable employees: Salary ≤ ₹15,000 at joining (mandatory); above ₹15,000 is voluntary

ESIC:
- Employee contribution: 0.75% of gross wages (revised Jan 2025)
- Employer contribution: 3.25% of gross wages (revised Jan 2025)
- Applicability: Employees earning ≤ ₹21,000/month gross (₹25,000 for disabled persons)
- IP Number: Insurance Provident number assigned to each ESIC-registered employee
- Monthly filing due: 21st of following month
- Half-yearly returns: April–September (due Nov 11), October–March (due May 11)
- Establishments employing 10+ workers (in most states)

COMMON PORTAL ERRORS & FIXES:
- "Invalid credentials": Check username/password in Portal Settings tab; passwords expire every 90 days on EPFO portal
- "UAN not found": Employee may not be registered; run UAN generation job first
- "Aadhaar mismatch": Employee's Aadhaar name must exactly match EPFO records; update via KYC correction
- "Network timeout": Portal is congested; retry during off-peak hours (early morning or late evening)
- "Challan not generated": ECR may have errors; download the error report from the portal and fix member data
- "OTP required": Portal triggered 2FA; the automation is paused — go to Paused Jobs tab and enter the OTP
- "CAPTCHA required": Automation paused; solve CAPTCHA in the Paused Jobs tab
- "Session expired": Portal session timed out; the next job will re-login automatically

AUTOMATION JOB TYPES:
- epfo_uan_generate: Generates UAN for new employees on EPFO portal
- epfo_ecr_file: Files monthly ECR return on EPFO portal
- epfo_challan_download: Downloads challan PDF after ECR filing
- epfo_kyc_aadhaar: Links employee Aadhaar to UAN on EPFO portal
- esic_ip_generate: Generates IP number for new employees on ESIC portal
- esic_monthly_file: Files monthly ESIC contribution return
- esic_challan_download: Downloads ESIC challan after filing

COMPLIANCE DEADLINES:
- EPFO ECR: 15th of every following month (e.g., April wages → May 15)
- ESIC monthly return: 21st of every following month
- ESIC half-yearly return: November 11 and May 11
- PF interest penalty: 12% p.a. for late payment; damages up to 25% for defaults
- ESIC interest: 12% p.a. for delayed payment

INSTRUCTIONS:
1. Answer compliance questions concisely and accurately
2. For error analysis, always suggest: (a) the likely cause, (b) the exact fix, (c) whether to retry
3. Cite specific rate percentages and deadlines when relevant
4. For portal navigation issues, direct users to the relevant tab (Portal Settings, Paused Jobs, etc.)
5. Keep answers under 6 sentences unless explaining something step-by-step
6. Respond in the same language the user writes in (Hindi/English)`;
}

function buildComplianceRuleResponse(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("ecr") && (m.includes("due") || m.includes("date") || m.includes("deadline")))
    return "ECR (Electronic Challan cum Return) for EPFO is due by the **15th of every following month**. For example, wages for April must be filed by May 15th. Late filing attracts a penalty of 12% p.a. interest plus damages.";
  if (m.includes("esic") && (m.includes("due") || m.includes("date") || m.includes("deadline")))
    return "ESIC monthly returns are due by the **21st of every following month**. Half-yearly returns are due on **November 11** (for April–September) and **May 11** (for October–March).";
  if (m.includes("pf rate") || m.includes("epf rate") || (m.includes("contribution") && m.includes("pf")))
    return "PF contribution rates: **Employee 12%** of PF wages (basic + DA). **Employer 12%** split as → 3.67% to EPF + 8.33% to EPS (capped at ₹15,000 wage) + 0.5% to EDLI. For employees earning above ₹15,000, EPS contribution is capped at ₹1,250/month.";
  if (m.includes("esic rate") || (m.includes("contribution") && m.includes("esic")))
    return "ESIC contribution rates (revised 2025): **Employee 0.75%** of gross wages, **Employer 3.25%** of gross wages. Applicable for employees earning ≤ ₹21,000/month gross (₹25,000 for persons with disability).";
  if (m.includes("uan"))
    return "UAN (Universal Account Number) is a 12-digit number issued by EPFO to each PF member. It stays the same across job changes. Generate UAN for new employees using the 'EPFO UAN Generate' automation job — Aadhaar KYC must be complete first.";
  if (m.includes("ip number") || m.includes("ip no") || (m.includes("esic") && m.includes("register")))
    return "IP (Insurance Provident) Number is ESIC's unique ID for each insured employee. It is generated when you run the 'ESIC IP Generate' automation job. The employee must have Aadhaar details and salary ≤ ₹21,000/month to be eligible.";
  if (m.includes("otp") || m.includes("captcha") || m.includes("paused"))
    return "When a job is paused, the portal is waiting for an **OTP or CAPTCHA** from you. Go to the **Paused Jobs** tab in Automation Jobs, find the job, enter the OTP/answer, and click Resume.";
  if (m.includes("retry") || m.includes("failed job"))
    return "To retry a failed job: go to the **Automation Jobs** page → find the failed job → click Retry. Check the error message first to understand why it failed. Common causes are portal timeouts (retry later), wrong credentials (fix in Portal Settings), or missing employee data.";
  if (m.includes("trrn"))
    return "TRRN (Temporary Return Reference Number) is generated by the EPFO portal after a successful ECR submission. It is used to track your challan payment. You can find it in the ECR Returns section once the job completes.";
  return "I can help with EPFO/ESIC compliance questions — PF/ESI rates, due dates, UAN/IP generation, ECR filing, portal errors, and more. Ask me anything!";
}

export async function generateComplianceReply(
  message: string,
  history: Array<{ role: string; content: string }>,
  portal = "both",
): Promise<string> {
  const systemPrompt = buildComplianceSystemPrompt(portal);

  // ── 1. Try OpenAI ────────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ];
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.3,
      });
      const text = response.choices[0]?.message?.content;
      if (text) return text;
    } catch (err: any) {
      console.warn("[ComplianceAI] OpenAI failed, trying Gemini:", err?.message);
    }
  }

  // ── 2. Try Gemini ────────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const reply = await callGemini(systemPrompt, history.slice(-10), message);
    if (reply) return reply;
  }

  // ── 3. Rule-based fallback ───────────────────────────────────────────────────
  return buildComplianceRuleResponse(message);
}

export async function analyzeJobError(
  jobType: string,
  errorMessage: string,
  logs: string[] = [],
): Promise<{ summary: string; likelyCause: string; suggestedFix: string; canRetry: boolean }> {
  const prompt = buildComplianceSystemPrompt("both");
  const userMsg = `Analyze this automation job failure and provide a structured response.

Job Type: ${jobType.replace(/_/g, " ").toUpperCase()}
Error Message: ${errorMessage}
${logs.length > 0 ? `Recent Logs:\n${logs.slice(-5).join("\n")}` : ""}

Respond ONLY as valid JSON with these exact keys:
{
  "summary": "one sentence plain-English summary of what failed",
  "likelyCause": "the most probable root cause",
  "suggestedFix": "step-by-step action to fix it",
  "canRetry": true or false
}`;

  // ── 1. Try OpenAI ────────────────────────────────────────────────────────────
  const openai = getOpenAI();
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: 400,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const text = response.choices[0]?.message?.content;
      if (text) return JSON.parse(text);
    } catch (err: any) {
      console.warn("[JobErrorAI] OpenAI failed:", err?.message);
    }
  }

  // ── 2. Try Gemini ────────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    const reply = await callGemini(prompt, [], userMsg);
    if (reply) {
      try {
        const cleaned = reply.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned);
      } catch {
        // fall through
      }
    }
  }

  // ── 3. Rule-based fallback ───────────────────────────────────────────────────
  const em = errorMessage.toLowerCase();
  const canRetry = !em.includes("invalid credentials") && !em.includes("aadhaar mismatch") && !em.includes("not found");
  return {
    summary: `The ${jobType.replace(/_/g, " ")} job failed.`,
    likelyCause: em.includes("timeout") || em.includes("network")
      ? "Portal network timeout — the EPFO/ESIC portal was temporarily unreachable."
      : em.includes("credential") || em.includes("password") || em.includes("login")
      ? "Invalid portal credentials — the stored username/password may be wrong or expired."
      : em.includes("otp") || em.includes("captcha")
      ? "Portal is waiting for OTP/CAPTCHA verification from a human operator."
      : "An unexpected portal error occurred.",
    suggestedFix: em.includes("credential") || em.includes("password")
      ? "Go to Portal Settings tab → update the username and password → retry the job."
      : em.includes("otp") || em.includes("captcha")
      ? "Go to the Paused Jobs tab → find this job → enter the OTP/CAPTCHA answer → click Resume."
      : "Check the portal for maintenance notices, then retry the job during off-peak hours (early morning).",
    canRetry,
  };
}
