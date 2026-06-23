// Phase 2 — deterministic, bilingual (Hindi + English) intent detection.
//
// Why deterministic (no LLM) for routing: the assistant must answer ONLY from
// live DB data and must work even with no AI key configured (the app commonly
// runs with the rule-based fallback). Detecting the intent with keywords, then
// fetching real data in a handler, guarantees we never hallucinate an answer.
// Anything we don't confidently recognize returns null and falls through to the
// existing LLM/rule-based chat (full backward compatibility for KYC flows).

import type { DetectedIntent, AiModule, AiActionKind } from "./types";

// ── Param extraction helpers ────────────────────────────────────────────────

export function extractMobile(text: string): string | null {
  // Indian mobile: 10 digits starting 6-9, optionally +91/0 prefixed. Avoid
  // matching inside a 12-digit Aadhaar by requiring a non-digit boundary.
  const m = text.replace(/[\s-]/g, "").match(/(?:\+?91|0)?([6-9]\d{9})(?!\d)/);
  return m ? m[1] : null;
}

export function extractPan(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{5}\d{4}[A-Z])\b/);
  return m ? m[1] : null;
}

export function extractAadhaar(text: string): string | null {
  const compact = text.replace(/[\s-]/g, "");
  const m = compact.match(/(?<!\d)(\d{12})(?!\d)/);
  return m ? m[1] : null;
}

export function extractEmployeeCode(text: string): string | null {
  // "employee id EMP123", "emp code A-100", "employee number 4521"
  const m = text.match(/\b(?:employee|emp|staff)\s*(?:id|code|no\.?|number|#)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_\-/]{1,19})\b/i);
  if (!m) return null;
  const token = m[1];
  // Reject bare verbs/words accidentally captured ("id", "number", etc.).
  if (/^(id|code|no|number|of|by|the|details)$/i.test(token)) return null;
  return token;
}

// Pull a person's name out of an approve/reject command.
export function extractPersonName(raw: string): string | null {
  const patterns: RegExp[] = [
    /(?:approve|reject|decline|deny|sanction|grant)\s+(?:the\s+)?(?:leave\s+(?:request\s+)?(?:of|for)\s+)?([A-Za-z][A-Za-z .'-]{1,40}?)(?:'s)?\s+(?:leave|chhutti|chutti|avkash)/i,
    /(?:leave\s+(?:request\s+)?(?:of|for))\s+([A-Za-z][A-Za-z .'-]{1,40})/i,
    /([A-Za-z][A-Za-z .'-]{1,40}?)(?:'s)\s+(?:leave|chhutti|chutti)/i,
  ];
  // Trailing filler/politeness words that may get swallowed by a greedy capture.
  const STOP = /\b(please|now|today|asap|kindly|thanks|thank you|jaldi|abhi)\b/gi;
  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) {
      const name = m[1].replace(STOP, "").trim().replace(/\s+/g, " ").replace(/[.'-]+$/, "").trim();
      if (name.length >= 2 && !/^(the|a|an|my|his|her|their)$/i.test(name)) return name;
    }
  }
  return null;
}

// ── Matcher table ───────────────────────────────────────────────────────────

interface Matcher {
  intent: string;
  module: AiModule;
  kind: AiActionKind;
  scope: "self" | "admin";
  // Returns extracted params when it matches, otherwise null.
  test: (lower: string, raw: string) => Record<string, string> | null;
}

const has = (lower: string, ...words: string[]) => words.some((w) => lower.includes(w));
const all = (lower: string, ...words: string[]) => words.every((w) => lower.includes(w));

// Keyword groups reused across matchers (English + common Hindi/Hinglish).
const KW = {
  show: ["show", "what", "tell", "give", "get", "check", "view", "see", "dikha", "batao", "bata", "kya", "dekhe", "dekho", "chahiye"],
  my: ["my", "mera", "meri", "mere", "apna", "apni", "khud"],
  today: ["today", "today's", "aaj", "aaj ka", "aaj ki"],
  leave: ["leave", "chhutti", "chutti", "avkash", "chuttiyan"],
  attendance: ["attendance", "haaziri", "haziri", "upasthiti", "present day", "presence"],
  salary: ["salary", "payslip", "pay slip", "salary slip", "vetan", "tankhwah", "tankhah", "ctc", "pay"],
  // Phase 4 — AI analytics asks ("explain / analyze / insights / anomalies").
  insight: ["insight", "insights", "analyze", "analyse", "analysis", "explain", "breakdown", "break down", "anomaly", "anomalies", "unusual", "trend", "trends", "intelligence", "samjhao", "vishleshan", "why", "kyon", "kyu"],
};

const MATCHERS: Matcher[] = [
  // ── Natural-language ACTIONS (highest priority — they carry params) ─────────
  {
    intent: "approve_leave", module: "leave", kind: "action", scope: "admin",
    test: (l, raw) => {
      if (!has(l, "approve", "sanction", "grant", "manzoor", "manjoor", "swikar")) return null;
      if (!has(l, ...KW.leave)) return null;
      const name = extractPersonName(raw);
      return name ? { name } : { name: "" };
    },
  },
  {
    intent: "reject_leave", module: "leave", kind: "action", scope: "admin",
    test: (l, raw) => {
      if (!has(l, "reject", "decline", "deny", "namanzoor", "asvikar", "khaarij", "kharij")) return null;
      if (!has(l, ...KW.leave)) return null;
      const name = extractPersonName(raw);
      return name ? { name } : { name: "" };
    },
  },

  // ── Find / search employee by identifier (admin) ───────────────────────────
  {
    intent: "find_employee", module: "employees", kind: "read", scope: "admin",
    test: (l, raw) => {
      const wantsSearch = has(l, "find", "search", "lookup", "look up", "locate", "khojo", "dhundo", "dhoondo", "open", "profile of", "details of");
      const pan = extractPan(raw);
      const aadhaar = extractAadhaar(raw);
      const mobile = extractMobile(raw);
      const code = extractEmployeeCode(raw);
      const byKeyword = has(l, "mobile", "phone", "pan", "aadhaar", "aadhar", "employee id", "emp id", "employee code", "emp code");
      if (!wantsSearch && !byKeyword) return null;
      if (pan) return { by: "pan", value: pan };
      if (aadhaar) return { by: "aadhaar", value: aadhaar };
      if (mobile) return { by: "mobile", value: mobile };
      if (code) return { by: "code", value: code };
      // Search intent stated but no usable identifier — let the handler explain.
      if (wantsSearch && has(l, "employee", "karmchari", "staff")) return { by: "", value: "" };
      return null;
    },
  },

  // ── Phase 4 AI analytics — self (must precede the broad my_* readers) ───────
  {
    intent: "explain_my_attendance", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, ...KW.insight) && has(l, ...KW.attendance) && has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "explain_my_leave", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, ...KW.insight) && has(l, ...KW.leave) && has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "explain_my_payslip", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, ...KW.insight) && has(l, ...KW.salary) && has(l, ...KW.my) ? {} : null,
  },

  // ── Employee self-service (scope: self) ────────────────────────────────────
  {
    intent: "my_leave_balance", module: "self", kind: "read", scope: "self",
    test: (l) => (has(l, ...KW.leave) && has(l, "balance", "remaining", "available", "kitni", "bachi", "shesh", "baki")) || all(l, "leave", "summary") ? {} : null,
  },
  {
    intent: "apply_leave", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "apply", "request", "take", "lagana", "lagao", "leni", "lena", "chahiye") && has(l, ...KW.leave) ? {} : null,
  },
  {
    intent: "cancel_leave", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "cancel", "withdraw", "radd", "wapas") && has(l, ...KW.leave) ? {} : null,
  },
  {
    intent: "my_attendance", module: "self", kind: "read", scope: "self",
    // "show attendance insights" (no "my") is an analytics ask → let the admin
    // attendance_insights matcher claim it; only grab a plain "show attendance".
    test: (l) => has(l, ...KW.attendance) && (has(l, ...KW.my) || (has(l, ...KW.show) && !has(l, ...KW.insight))) ? {} : null,
  },
  {
    intent: "my_shift", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "shift", "timing", "duty", "samay") && (has(l, ...KW.my) || has(l, ...KW.today)) ? {} : null,
  },
  {
    intent: "holiday_list", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "holiday", "holidays", "chhuttiyon ki list", "avkash list", "festival") ? {} : null,
  },
  {
    intent: "my_payslip", module: "self", kind: "read", scope: "self",
    // Salary keyword, BUT yield to the admin payroll_insights matcher when the
    // ask is a company/department analytics/cost question that lacks "my".
    test: (l) => has(l, ...KW.salary) && !(has(l, ...KW.insight, "cost", "department", "dept", "wage", "wages") && !has(l, ...KW.my)) ? {} : null,
  },
  {
    intent: "my_pf", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "pf number", "pf no", "uan", "provident", "epf") || all(l, "pf", "number") ? {} : null,
  },
  {
    intent: "my_esic", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "esic", "esi number", "esi no") || all(l, "esi", "number") ? {} : null,
  },
  {
    intent: "my_kyc", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "kyc") && has(l, "pending", "status", "show", "check", "mera", "my") ? {} : null,
  },
  {
    intent: "update_phone", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "update", "change", "badlo", "badal", "naya") && has(l, "phone", "mobile", "number", "contact") ? {} : null,
  },
  {
    intent: "update_address", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "update", "change", "badlo", "badal", "naya") && has(l, "address", "pata") ? {} : null,
  },
  {
    intent: "my_documents", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "document", "documents", "dastavej", "papers", "files") && (has(l, ...KW.my) || has(l, ...KW.show) || has(l, "download")) ? {} : null,
  },
  {
    intent: "my_kra", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "kra") ? {} : null,
  },
  {
    intent: "my_kpi", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "kpi") ? {} : null,
  },
  {
    intent: "my_appraisal", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "appraisal", "performance review", "review history", "rating") ? {} : null,
  },
  {
    intent: "my_reimbursement", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "reimbursement", "loan", "advance", "udhaar", "karz") ? {} : null,
  },
  {
    intent: "my_profile", module: "self", kind: "read", scope: "self",
    test: (l) => has(l, "profile", "my detail", "my details", "meri jankari", "mera profile", "about me") ? {} : null,
  },

  // ── HR / Admin (scope: admin) ──────────────────────────────────────────────
  // Phase 4 AI analytics — admin (precede attendance_summary / quick_summary).
  {
    intent: "attendance_insights", module: "attendance", kind: "read", scope: "admin",
    test: (l) => has(l, ...KW.insight) && has(l, ...KW.attendance) && !has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "leave_insights", module: "leave", kind: "read", scope: "admin",
    test: (l) => has(l, ...KW.insight) && has(l, ...KW.leave) && !has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "team_insights", module: "attendance", kind: "read", scope: "admin",
    // Note: NO !my guard — "my team update" legitimately contains "my".
    test: (l) => has(l, "team", "meri team", "my team") && has(l, ...KW.insight, "briefing", "brief", "update", "how is", "how's", "status", "overview") ? {} : null,
  },
  {
    intent: "payroll_insights", module: "payroll", kind: "read", scope: "admin",
    // Company/department payroll analytics (NOT "my" payslip). Must precede
    // pending_payroll so an analytics ask isn't grabbed as a pending-payroll read.
    test: (l) => has(l, ...KW.insight, "cost", "department cost", "dept cost", "payroll cost") && has(l, "payroll", "salary cost", "salaries", "wage", "wages", "ctc", "payroll cost") && !has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "executive_summary", module: "employees", kind: "read", scope: "admin",
    test: (l) =>
      has(l, "executive summary", "leadership summary", "executive report", "leadership brief", "company health", "workforce health", "org health", "organisation health", "organization health")
        || (has(l, "executive", "leadership", "ceo", "management") && has(l, "summary", "report", "brief", "overview", "dashboard"))
        ? {}
        : null,
  },
  {
    intent: "absentees_today", module: "attendance", kind: "read", scope: "admin",
    test: (l) => has(l, "absent", "gair haazir", "anupasthit", "not present") && has(l, ...KW.today, "list", "who") ? {} : null,
  },
  {
    intent: "late_employees", module: "attendance", kind: "read", scope: "admin",
    test: (l) => has(l, "late", "deri", "der se") && has(l, "employee", "staff", "who", "list", ...KW.today) ? {} : null,
  },
  {
    intent: "on_leave_today", module: "leave", kind: "read", scope: "admin",
    test: (l) => has(l, ...KW.leave) && has(l, "on leave", "who", "today", "aaj") && !has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "attendance_summary", module: "attendance", kind: "read", scope: "admin",
    test: (l) => has(l, ...KW.attendance) && has(l, "summary", "report", "overview", "saaransh") ? {} : null,
  },
  {
    intent: "missing_kyc", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "kyc") && has(l, "missing", "pending", "incomplete", "without", "adhura") && !has(l, ...KW.my) ? {} : null,
  },
  {
    intent: "expiring_documents", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "document", "documents") && has(l, "expir", "expiry", "samapt") ? {} : null,
  },
  {
    intent: "probation_ending", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "probation", "pariveksha") ? {} : null,
  },
  {
    intent: "contract_expiry", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "contract") && has(l, "expir", "ending", "end", "samapt") ? {} : null,
  },
  {
    intent: "birthdays_today", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "birthday", "birthdays", "janmdin", "born today") ? {} : null,
  },
  {
    intent: "anniversaries_today", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "anniversary", "anniversaries", "work anniversary", "varshganth") ? {} : null,
  },
  {
    intent: "department_strength", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "department", "vibhag", "dept") && has(l, "strength", "count", "distribution", "wise", "headcount", "kitne") ? {} : null,
  },
  {
    intent: "gender_ratio", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "gender", "male female", "ratio", "ling") ? {} : null,
  },
  {
    intent: "location_wise", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "location", "branch", "office", "site", "sthan") && has(l, "wise", "employee", "count", "distribution", "kitne") ? {} : null,
  },
  {
    intent: "company_wise", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "company wise", "company-wise", "per company", "across companies", "all companies") ? {} : null,
  },
  {
    intent: "employee_count", module: "employees", kind: "read", scope: "admin",
    test: (l) => (has(l, "employee", "staff", "headcount", "karmchari") && has(l, "count", "total", "how many", "number of", "kitne")) || has(l, "total employees", "total staff") ? {} : null,
  },
  {
    intent: "recruitment_status", module: "recruitment", kind: "read", scope: "admin",
    // Yield to recruitment_dashboard when dashboard/funnel/metrics terms are present
    // (that intent is defined later in this array, so guard here to reach it).
    test: (l) =>
      has(l, "recruitment", "hiring", "job posting", "openings", "vacancies", "bharti")
        && !has(l, "dashboard", "funnel", "pipeline", "metrics", "analytics", "conversion", "time to hire", "acceptance")
        ? {}
        : null,
  },
  {
    intent: "pending_interviews", module: "recruitment", kind: "read", scope: "admin",
    test: (l) => has(l, "interview", "interviews", "sakshatkar") && has(l, "pending", "scheduled", "upcoming", "today", "baaki") ? {} : null,
  },
  {
    intent: "pending_approvals", module: "leave", kind: "read", scope: "admin",
    test: (l) => has(l, "pending") && has(l, "approval", "approvals", "request", "requests", "manjoori") && !has(l, "interview", "onboard", "resign", "payroll") ? {} : null,
  },
  {
    intent: "pending_onboarding", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "onboard", "onboarding", "joining") && has(l, "pending", "new", "upcoming", "baaki") ? {} : null,
  },
  {
    intent: "pending_resignations", module: "employees", kind: "read", scope: "admin",
    test: (l) => has(l, "resignation", "resign", "exit", "istifa") && has(l, "pending", "list", "upcoming", "baaki") ? {} : null,
  },
  {
    intent: "pending_payroll", module: "payroll", kind: "read", scope: "admin",
    test: (l) => has(l, "payroll") && has(l, "pending", "due", "not generated", "baaki", "draft") ? {} : null,
  },
  {
    intent: "quick_summary", module: "employees", kind: "read", scope: "admin",
    // Yield to recruitment_dashboard for recruitment-scoped dashboard/funnel asks
    // (e.g. "recruitment dashboard summary") so they reach the hiring metrics view.
    test: (l) =>
      has(l, "quick summary", "overview", "dashboard summary", "company summary", "give me a summary", "overall summary", "saaransh")
        && !(has(l, "recruitment", "hiring", "candidate", "candidates", "applicant", "applicants", "bharti")
          && has(l, "dashboard", "funnel", "pipeline", "metrics", "analytics", "conversion", "time to hire", "acceptance"))
        ? {}
        : null,
  },
  // ── Recruitment AI (scope: admin) ──────────────────────────────────────────
  {
    // Recruitment dashboard snapshot — must be checked BEFORE candidate_search
    // and recruitment_status so "recruitment dashboard / hiring funnel" routes
    // to the metrics view rather than the generic status reply.
    intent: "recruitment_dashboard", module: "recruitment", kind: "read", scope: "admin",
    test: (l) => {
      const topic = has(l, "recruitment", "hiring", "candidate", "candidates", "applicant", "applicants", "bharti");
      if (!topic) return null;
      // Strong dashboard nouns always route here.
      if (has(l, "dashboard", "funnel", "metrics", "analytics", "conversion", "time to hire", "acceptance")) return {};
      // "pipeline" alone is dashboard ONLY when it is not an explicit candidate
      // search ("find candidates in pipeline" should be a search, not the dashboard).
      const wantsSearch = has(l, "find", "search", "lookup", "look up", "list", "khojo", "dhundo", "dhoondo", "get", "which");
      if (has(l, "pipeline") && !wantsSearch) return {};
      return null;
    },
  },
  {
    // NL candidate search — "find candidates with React 5 years in Pune".
    // Carries the full query so the handler can parse skill/experience/location.
    intent: "candidate_search", module: "recruitment", kind: "read", scope: "admin",
    test: (l, raw) => {
      const wantsSearch = has(l, "find", "search", "lookup", "look up", "show", "list", "khojo", "dhundo", "dhoondo", "get", "which");
      const aboutCandidates = has(l, "candidate", "candidates", "applicant", "applicants", "resume", "resumes", "cv", "umeedwar", "ummedwar");
      if (!wantsSearch || !aboutCandidates) return null;
      return { query: raw };
    },
  },
];

/**
 * Detect a single intent in a user message. Returns null when nothing is
 * confidently recognized so the caller can fall back to LLM/rule-based chat.
 */
export function detectIntent(message: string): DetectedIntent | null {
  if (!message || !message.trim()) return null;
  const raw = message.trim();
  const lower = raw.toLowerCase();
  for (const m of MATCHERS) {
    const params = m.test(lower, raw);
    if (params) {
      return {
        intent: m.intent,
        module: m.module,
        kind: m.kind,
        scope: m.scope,
        params,
        confidence: 1,
      };
    }
  }
  return null;
}
