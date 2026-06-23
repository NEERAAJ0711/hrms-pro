import type { EmployeeContext, KycStatus } from "../types";

// ─── Rule-based fallback responses ────────────────────────────────────────────
// Deterministic, key-free answers for the employee HR assistant. Used only when
// no AI provider is configured or every provider call fails.

// Mask a sensitive number, leaving only the last `visible` characters readable.
function maskTail(value: string, visible = 4): string {
  const v = value.replace(/\s+/g, "");
  if (v.length <= visible) return v;
  return "•".repeat(v.length - visible) + v.slice(-visible);
}

// Aadhaar is always shown as the last 4 digits only.
function maskAadhaar(value: string): string {
  const v = value.replace(/[\s-]+/g, "");
  if (v.length < 4) return v;
  return `XXXX XXXX ${v.slice(-4)}`;
}

export function buildRuleBasedResponse(
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

  // KYC status query — but don't preempt a specific Aadhaar/PAN/bank value query
  // (e.g. "kyc update my pan FDXPS…" should be handled by the PAN block below).
  if (
    msg.includes("kyc") &&
    (msg.includes("status") || msg.includes("pending") || msg.includes("complete") || msg.includes("update") || msg.includes("done") || msg.includes("स्थिति")) &&
    !/\bpan\b|aadha|adha|\bbank\b|\baccount\b|\bifsc\b|\bsalary\b|salry|payslip/.test(msg) &&
    !msg.includes("पैन") && !msg.includes("आधार") && !msg.includes("बैंक") && !msg.includes("खाता") && !msg.includes("वेतन")
  ) {
    if (pendingDocs.length === 0) {
      return isHindi
        ? `${firstName} जी, आपका KYC पूरा हो चुका है! ✅ सभी ${6} दस्तावेज़ जमा हो चुके हैं।`
        : `Great news ${firstName}! Your KYC is complete ✅. All 6 documents have been submitted. HR will verify them shortly.`;
    }
    return isHindi
      ? `${firstName} जी, अभी ${pendingDocs.length} दस्तावेज़ बाकी हैं:\n${pendingDocs.map((d, i) => `${i + 1}. ${d}`).join("\n")}\nकृपया ऊपर 📎 बटन से अपलोड करें।`
      : `${firstName}, here's your current KYC status:\n\n**Pending (${pendingDocs.length}):**\n${pendingDocs.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n\nPlease upload them using the 📎 attachment button above. Which one would you like to start with?`;
  }

  // ── Identity / statutory VALUE lookups ───────────────────────────────────────
  // Must run BEFORE the upload-guidance below. "What is my PAN / Aadhaar / bank
  // account", "is my PAN updated", or the employee typing a new value should NOT
  // be answered with "please upload your document".
  const prof = ctx?.profile;
  const wantsUploadHelp =
    /\b(upload|submit|attach|scan|photo|kaise|how do i|how to)\b/.test(msg) ||
    msg.includes("अपलोड") || msg.includes("जमा") || msg.includes("कैसे") || msg.includes("फोटो");
  const panTyped = userMessage.match(/[A-Z]{5}[0-9]{4}[A-Z]/i)?.[0]?.toUpperCase() ?? null;
  const aadhaarTyped = userMessage.replace(/[\s-]/g, "").match(/(?<!\d)\d{12}(?!\d)/)?.[0] ?? null;

  // Aadhaar query (tolerant of common spellings: aadhaar/aadhar/adhar/adhaar/aadhaa)
  if (msg.includes("aadha") || msg.includes("adha") || msg.includes("आधार")) {
    const onFile = prof?.aadhaar?.trim();
    if (aadhaarTyped) {
      return isHindi
        ? `${firstName} जी, मैंने आपका आधार नंबर नोट कर लिया है। ऊपर दिए verify कार्ड से confirm करें — फिर यह आपकी HRMS profile में सेव हो जाएगा।`
        : `Got it, ${firstName} — I've noted your Aadhaar number. Please confirm it using the verification card above and it will be saved to your HRMS profile.`;
    }
    if (!wantsUploadHelp && onFile) {
      return isHindi
        ? `${firstName} जी, आपका आधार file पर है: **${maskAadhaar(onFile)}** ✅ (सुरक्षा के लिए सिर्फ़ अंतिम 4 अंक दिखाए गए हैं)।`
        : `${firstName}, your Aadhaar on file: **${maskAadhaar(onFile)}** ✅ (last 4 digits shown for security). It's saved in your HRMS profile.`;
    }
    return isHindi
      ? `${firstName} जी, आधार कार्ड की दोनों तरफ की clear फोटो अपलोड करें, या 12-अंकों का आधार नंबर यहाँ टाइप करें। यह PF और ESIC पंजीकरण के लिए जरूरी है।`
      : `For Aadhaar, please upload clear photos/scans of **both front and back** sides, or type your 12-digit Aadhaar number here. This is required for your PF and ESIC registration. Use the 📎 button to upload.`;
  }

  // PAN query
  if (msg.includes("pan") || msg.includes("पैन")) {
    const onFile = (prof?.pan || ctx?.employeeInfo?.pan)?.trim();
    if (panTyped) {
      return isHindi
        ? `${firstName} जी, मैंने आपका PAN **${panTyped}** नोट कर लिया है। ऊपर दिए verify कार्ड से confirm करें — फिर यह आपकी HRMS profile में सेव हो जाएगा।`
        : `Got it, ${firstName} — I've noted your PAN **${panTyped}**. Please confirm it using the verification card above and it will be saved to your HRMS profile.`;
    }
    if (!wantsUploadHelp && onFile) {
      return isHindi
        ? `${firstName} जी, आपका PAN file पर है: **${onFile}** ✅ — यह आपकी HRMS profile में सेव है।`
        : `${firstName}, your PAN on file: **${onFile}** ✅ — it's saved in your HRMS profile.`;
    }
    return isHindi
      ? `${firstName} जी, PAN कार्ड की clear फोटो अपलोड करें, या 10-अंकों का PAN यहाँ टाइप करें। TDS कटौती और आयकर के लिए यह अनिवार्य है।`
      : `Please upload a clear photo/scan of your **PAN card**, or type your 10-character PAN here. This is mandatory for TDS deduction and income tax purposes. Use the 📎 button to upload.`;
  }

  // Bank details / account number / IFSC
  if (msg.includes("bank") || msg.includes("account") || msg.includes("ifsc") || msg.includes("बैंक") || msg.includes("खाता")) {
    const acc = prof?.bankAccount?.trim();
    const ifsc = prof?.ifsc?.trim();
    if (!wantsUploadHelp && (acc || ifsc)) {
      const accLine = acc
        ? `${isHindi ? "खाता संख्या" : "Account Number"}: **${maskTail(acc)}**`
        : `${isHindi ? "खाता संख्या" : "Account Number"}: ${isHindi ? "अभी file पर नहीं" : "not on file yet"}`;
      const ifscLine = `IFSC: ${ifsc ? `**${ifsc}**` : isHindi ? "अभी file पर नहीं" : "not on file yet"}`;
      return isHindi
        ? `${firstName} जी, आपके bank details (file पर) ✅:\n- ${accLine}\n- ${ifscLine}\n(सुरक्षा के लिए account number के सिर्फ़ अंतिम 4 अंक दिखाए गए हैं)।`
        : `${firstName}, your bank details on file ✅:\n- ${accLine}\n- ${ifscLine}\n(only the last 4 digits of the account number are shown for security).`;
    }
    return isHindi
      ? `${firstName} जी, bank details add/update करने के लिए कृपया दें:\n1. खाता संख्या\n2. IFSC कोड\n3. बैंक का नाम\n4. शाखा का नाम\n\nया फिर cancelled cheque की फोटो अपलोड करें।`
      : `To add or update your bank details, please share:\n1. **Account Number**\n2. **IFSC Code**\n3. **Bank Name**\n4. **Branch Name**\n\nYou can type them here or upload a **Cancelled Cheque** using the 📎 button.`;
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
  if (msg.includes("salary") || msg.includes("salry") || msg.includes("salery") || msg.includes("salay") || msg.includes("payroll") || msg.includes("payslip") || msg.includes("वेतन") || msg.includes("ctc") || msg.includes("net pay")) {
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

  // ── Personal / profile info lookups (name, father's name, address, DOB, etc.) ──
  // Answered straight from the employee's HRMS master record — works without an AI key.
  {
    const ei = ctx?.employeeInfo;
    const onRecord = (val: string | null | undefined) => (val && val.trim() ? val.trim() : null);
    const notOnRecord = isHindi
      ? "यह जानकारी अभी आपके HRMS record में दर्ज नहीं है। कृपया HR से अपडेट करवाएँ।"
      : "this isn't recorded in your HRMS profile yet. Please ask HR to update it.";

    // Father's / Husband's name
    if (msg.includes("father") || msg.includes("husband") || msg.includes("पिता") || msg.includes("पति") || msg.includes("f. name") || msg.includes("f.name") || msg.includes("f name") || msg.includes("fname")) {
      const v = onRecord(prof?.fatherHusbandName);
      return v
        ? (isHindi ? `${firstName} जी, आपके record में पिता/पति का नाम: **${v}** है।` : `${firstName}, the father's/husband's name on your record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, पिता/पति का नाम — ${notOnRecord}` : `${firstName}, your father's/husband's name — ${notOnRecord}`);
    }

    // Mother's name
    if (msg.includes("mother") || msg.includes("माता") || msg.includes("माँ") || msg.includes("मां")) {
      const v = onRecord(prof?.motherName);
      return v
        ? (isHindi ? `${firstName} जी, आपकी माता का नाम: **${v}** है।` : `${firstName}, your mother's name on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, माता का नाम — ${notOnRecord}` : `${firstName}, your mother's name — ${notOnRecord}`);
    }

    // Address (present + permanent) — but not "email address"
    if ((msg.includes("address") || msg.includes("पता") || msg.includes("residence")) && !msg.includes("email") && !msg.includes("e-mail") && !msg.includes("mail")) {
      const present = onRecord(prof?.presentAddress);
      const permanent = onRecord(prof?.permanentAddress);
      if (present || permanent) {
        const lines = [
          present ? `${isHindi ? "वर्तमान पता" : "Present Address"}: ${present}` : null,
          permanent ? `${isHindi ? "स्थायी पता" : "Permanent Address"}: ${permanent}` : null,
        ].filter(Boolean).join("\n");
        return isHindi ? `${firstName} जी, आपके record में पता:\n${lines}` : `${firstName}, the address on your record:\n${lines}`;
      }
      return isHindi ? `${firstName} जी, आपका पता — ${notOnRecord}` : `${firstName}, your address — ${notOnRecord}`;
    }

    // Date of birth
    if (msg.includes("date of birth") || msg.includes("dob") || msg.includes("born") || msg.includes("birthday") || msg.includes("जन्म")) {
      const v = onRecord(prof?.dateOfBirth);
      return v
        ? (isHindi ? `${firstName} जी, आपकी जन्म तिथि: **${v}** है।` : `${firstName}, your date of birth on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, जन्म तिथि — ${notOnRecord}` : `${firstName}, your date of birth — ${notOnRecord}`);
    }

    // Gender
    if (msg.includes("gender") || msg.includes("लिंग")) {
      const v = onRecord(prof?.gender);
      return v
        ? (isHindi ? `${firstName} जी, record में लिंग: **${v}**।` : `${firstName}, your gender on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, लिंग — ${notOnRecord}` : `${firstName}, your gender — ${notOnRecord}`);
    }

    // Mobile / phone — but not "emergency contact number" (handled below)
    if ((msg.includes("mobile") || msg.includes("phone") || msg.includes("contact number") || msg.includes("मोबाइल") || msg.includes("फोन")) && !msg.includes("emergency") && !msg.includes("आपातकालीन")) {
      const v = onRecord(prof?.mobileNumber);
      return v
        ? (isHindi ? `${firstName} जी, record में मोबाइल नंबर: **${v}**।` : `${firstName}, your mobile number on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, मोबाइल नंबर — ${notOnRecord}` : `${firstName}, your mobile number — ${notOnRecord}`);
    }

    // Email
    if (msg.includes("email") || msg.includes("e-mail") || msg.includes("ईमेल")) {
      const v = onRecord(prof?.officialEmail);
      return v
        ? (isHindi ? `${firstName} जी, record में ईमेल: **${v}**।` : `${firstName}, your email on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, ईमेल — ${notOnRecord}` : `${firstName}, your email — ${notOnRecord}`);
    }

    // Marital status
    if (msg.includes("marital") || msg.includes("married") || msg.includes("वैवाहिक") || msg.includes("शादी")) {
      const v = onRecord(prof?.maritalStatus);
      return v
        ? (isHindi ? `${firstName} जी, वैवाहिक स्थिति: **${v}**।` : `${firstName}, your marital status on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, वैवाहिक स्थिति — ${notOnRecord}` : `${firstName}, your marital status — ${notOnRecord}`);
    }

    // Blood group
    if (msg.includes("blood") || msg.includes("रक्त")) {
      const v = onRecord(prof?.bloodGroup);
      return v
        ? (isHindi ? `${firstName} जी, रक्त समूह: **${v}**।` : `${firstName}, your blood group on record is: **${v}**.`)
        : (isHindi ? `${firstName} जी, रक्त समूह — ${notOnRecord}` : `${firstName}, your blood group — ${notOnRecord}`);
    }

    // Emergency contact
    if (msg.includes("emergency") || msg.includes("आपातकालीन")) {
      const nm = onRecord(prof?.emergencyContactName);
      const num = onRecord(prof?.emergencyContactNumber);
      if (nm || num) {
        return isHindi
          ? `${firstName} जी, आपातकालीन संपर्क: ${nm ?? "—"}${num ? ` (${num})` : ""}।`
          : `${firstName}, your emergency contact: ${nm ?? "—"}${num ? ` (${num})` : ""}.`;
      }
      return isHindi ? `${firstName} जी, आपातकालीन संपर्क — ${notOnRecord}` : `${firstName}, your emergency contact — ${notOnRecord}`;
    }

    // Nominee
    if (msg.includes("nominee") || msg.includes("nomination") || msg.includes("नामांकित") || msg.includes("नामिनी")) {
      const nm = onRecord(prof?.nomineeName);
      const rel = onRecord(prof?.nomineeRelation);
      if (nm) {
        return isHindi
          ? `${firstName} जी, नामांकित व्यक्ति: **${nm}**${rel ? ` (${rel})` : ""}।`
          : `${firstName}, your nominee: **${nm}**${rel ? ` (relation: ${rel})` : ""}.`;
      }
      return isHindi ? `${firstName} जी, नामांकित व्यक्ति — ${notOnRecord}` : `${firstName}, your nominee — ${notOnRecord}`;
    }

    // Designation / department / role
    if (msg.includes("designation") || msg.includes("department") || msg.includes("my role") || msg.includes("my post") || msg.includes("पद") || msg.includes("विभाग")) {
      const desig = onRecord(ei?.designation);
      const dept = onRecord(ei?.department);
      if (desig || dept) {
        return isHindi
          ? `${firstName} जी, आपका पद: **${desig ?? "—"}**${dept ? `, विभाग: **${dept}**` : ""}।`
          : `${firstName}, your designation: **${desig ?? "—"}**${dept ? `, department: **${dept}**` : ""}.`;
      }
      return isHindi ? `${firstName} जी, पद/विभाग — ${notOnRecord}` : `${firstName}, your designation/department — ${notOnRecord}`;
    }

    // Date of joining
    if (msg.includes("joining") || msg.includes("date of join") || msg.includes("doj") || msg.includes("नियुक्ति") || msg.includes("ज्वाइन")) {
      const v = onRecord(ei?.dateOfJoining);
      return v
        ? (isHindi ? `${firstName} जी, आपकी नियुक्ति तिथि: **${v}**।` : `${firstName}, your date of joining is: **${v}**.`)
        : (isHindi ? `${firstName} जी, नियुक्ति तिथि — ${notOnRecord}` : `${firstName}, your date of joining — ${notOnRecord}`);
    }

    // General profile summary / "my name" / "my details" / "who am I"
    if (
      msg.includes("my name") || msg.includes("what is my name") || msg.includes("मेरा नाम") ||
      msg.includes("my detail") || msg.includes("my profile") || msg.includes("my information") || msg.includes("my info") ||
      msg.includes("about me") || msg.includes("who am i") || msg.includes("मेरी जानकारी") || msg.includes("मेरा विवरण") ||
      /\b(my|full|complete|legal|employee)\s+name\b/.test(msg)
    ) {
      const summary = [
        `${isHindi ? "नाम" : "Name"}: ${employeeName}`,
        ei?.designation ? `${isHindi ? "पद" : "Designation"}: ${ei.designation}${ei.department ? ` (${ei.department})` : ""}` : null,
        onRecord(prof?.fatherHusbandName) ? `${isHindi ? "पिता/पति का नाम" : "Father's/Husband's Name"}: ${prof!.fatherHusbandName}` : null,
        onRecord(prof?.dateOfBirth) ? `${isHindi ? "जन्म तिथि" : "Date of Birth"}: ${prof!.dateOfBirth}` : null,
        onRecord(prof?.presentAddress) ? `${isHindi ? "वर्तमान पता" : "Present Address"}: ${prof!.presentAddress}` : null,
        onRecord(prof?.mobileNumber) ? `${isHindi ? "मोबाइल" : "Mobile"}: ${prof!.mobileNumber}` : null,
      ].filter(Boolean).join("\n");
      return isHindi
        ? `${firstName} जी, आपके HRMS record का विवरण:\n${summary}\n\nकिसी और जानकारी के लिए पूछें।`
        : `${firstName}, here are your HRMS record details:\n${summary}\n\nAsk me for anything else you'd like to check.`;
    }
  }

  // Default response
  if (pendingDocs.length > 0) {
    return isHindi
      ? `${firstName} जी, मैं आपकी मदद करने के लिए यहाँ हूँ। अभी आपके ${pendingDocs.length} KYC दस्तावेज़ बाकी हैं। क्या आप **${pendingDocs[0]}** से शुरू करना चाहेंगे?`
      : `I'm here to help, ${firstName}! You have ${pendingDocs.length} pending KYC document(s). Let's start with **${pendingDocs[0]}** — please upload it using the 📎 button. This ensures your salary and statutory benefits are processed correctly.`;
  }

  return isHindi
    ? `${firstName} जी, मैं इनमें मदद कर सकती हूँ:\n- सैलरी / पेस्लिप\n- छुट्टी (leave)\n- अटेंडेंस\n- PAN / आधार / बैंक जानकारी\n- PF / UAN\n- KYC स्थिति\n\nआप क्या जानना चाहेंगे?`
    : `${firstName}, I can help you with:\n- Salary / payslip\n- Leave balance\n- Attendance\n- Your PAN / Aadhaar / bank details\n- PF / UAN\n- KYC status\n\nWhat would you like to know?`;
}
