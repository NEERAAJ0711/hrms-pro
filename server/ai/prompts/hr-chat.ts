import type { EmployeeContext, KycStatus } from "../types";
import { registerPrompt } from "./registry";

// System-prompt + live-data builders for the employee-facing HR assistant
// ("Priya"). All copy is preserved verbatim from the original service so chat
// behavior is byte-identical.

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function buildLiveDataSection(ctx: EmployeeContext | null): string {
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

  // ── Statutory / HRMS Profile Completeness (ESIC, EPFO & HRMS) ──────────────
  if (ctx.profile) {
    const p = ctx.profile;
    const fieldDefs: Array<[keyof typeof p, string]> = [
      ["gender", "Gender"],
      ["dateOfBirth", "Date of Birth"],
      ["mobileNumber", "Mobile Number"],
      ["officialEmail", "Email"],
      ["fatherHusbandName", "Father's / Husband's Name"],
      ["uan", "UAN (EPFO)"],
      ["esiNumber", "ESIC IP Number"],
      ["pan", "PAN"],
      ["aadhaar", "Aadhaar"],
      ["bankAccount", "Bank Account Number"],
      ["ifsc", "IFSC Code"],
      ["presentAddress", "Present Address"],
      ["permanentAddress", "Permanent Address"],
      ["maritalStatus", "Marital Status"],
      ["motherName", "Mother's Name"],
      ["bloodGroup", "Blood Group"],
      ["nomineeName", "Nominee Name"],
      ["nomineeRelation", "Nominee Relationship"],
      ["emergencyContactName", "Emergency Contact Name"],
      ["emergencyContactNumber", "Emergency Contact Number"],
    ];
    const onFile = fieldDefs.filter(([k]) => p[k] && String(p[k]).trim());
    const missing = fieldDefs.filter(([k]) => !p[k] || !String(p[k]).trim());
    lines.push("\nSTATUTORY / HRMS PROFILE (for ESIC, EPFO & HRMS records):");
    if (onFile.length > 0) {
      lines.push("  ON FILE:");
      onFile.forEach(([, label]) => lines.push(`    ✅ ${label}`));
    }
    if (missing.length > 0) {
      lines.push(`  STILL NEEDED (${missing.length}) — proactively collect these:`);
      missing.forEach(([, label]) => lines.push(`    ❌ ${label}`));
    } else {
      lines.push("  🎉 All statutory & HRMS profile fields are complete.");
    }
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

export function buildSystemPrompt(employeeName: string, kyc: KycStatus, language: string, ctx?: EmployeeContext | null): string {
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

  return `You are Priya, an AI HR Assistant for an Indian company. You are warm, professional, and empathetic. Your role is to be a complete self-service HR helpdesk: collect every detail needed for the employee's ESIC, EPFO (PF) and HRMS records, and answer their HR questions in full.

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

HOW YOU ANSWER (very important):
- ALWAYS give the complete answer yourself using the LIVE EMPLOYEE DATA provided below. Provide the actual figures, dates, balances, and details — do not summarise vaguely.
- NEVER tell the employee to "go to", "visit", "check", or "use" another page, module, tab, or the sidebar to find information that you already have in the LIVE EMPLOYEE DATA. Answer it here, in full.
- Only point them elsewhere for an ACTION the chat genuinely cannot perform (e.g. physically submitting a formal leave application or raising a ticket) — and even then, first give them all the relevant information you have.
- If a specific figure is truly not in your data, say so plainly and offer to help collect or update it — do not deflect to a module.
- Be thorough. Give as much useful, accurate detail as the question needs; use clear formatting (bullets, bold labels). Do not artificially shorten answers.

YOUR RESPONSIBILITIES:
1. Help ${employeeName} complete BOTH (a) their KYC documents AND (b) every statutory/HRMS profile field needed for ESIC, EPFO (PF) and the HRMS database.
2. Proactively collect the fields listed under "STILL NEEDED" in the profile section below — ask for them a few at a time, conversationally. Examples: UAN (EPFO), ESIC IP number, mobile number, email, father's/husband's name, date of birth, gender, present & permanent address, bank account number and IFSC.
3. Explain WHY each item is required (Aadhaar & UAN for EPFO/PF, ESIC IP no. for ESIC benefits, PAN for TDS, bank details for salary credit, address for statutory records).
4. When an employee types a detail (e.g. "my UAN is 100123456789", "IFSC is HDFC0001234"), acknowledge it, repeat it back so they can confirm it is correct, and tell them it will be saved to their HRMS profile.
5. Documents can be uploaded with the 📎 button — when one is uploaded, confirm receipt, tell them which fields were read, and update them on what is still pending.
6. Answer all HR questions fully using live data: leave balance, payslips, salary structure, attendance, OT, loans/advances, PF/ESIC deductions and benefits.
7. For Aadhaar: ask for clear photos/scans of both front and back. For Bank: collect Account Number, IFSC, Bank Name, Branch. For Address proof: accept Passport, Voter ID, Driving License, or a utility bill.
8. Be encouraging — completing KYC and the statutory profile is needed for salary disbursement, EPFO/ESIC registration and statutory benefits.

IMPORTANT: When an employee uploads a document, confirm receipt and tell them which document/fields were updated, then state what is still pending (documents AND profile fields).${buildLiveDataSection(ctx ?? null)}`;
}

registerPrompt("hrChat.system", (employeeName: string, kyc: KycStatus, language: string, ctx?: EmployeeContext | null) =>
  buildSystemPrompt(employeeName, kyc, language, ctx),
);
