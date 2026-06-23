import { registerPrompt } from "./registry";

// ─── Compliance AI Co-pilot prompts ────────────────────────────────────────────
// EPFO/ESIC statutory knowledge base + deterministic rule-based fallback answers.

export function buildComplianceSystemPrompt(portal: string): string {
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

export function buildComplianceRuleResponse(message: string): string {
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

registerPrompt("compliance.system", (portal: string) => buildComplianceSystemPrompt(portal));
