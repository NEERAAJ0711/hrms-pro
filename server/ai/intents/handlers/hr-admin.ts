// Phase 2 — HR / admin read-only intent handlers.
//
// Every answer is derived from LIVE company-scoped data. We filter by the
// actor's companyId (multi-tenant isolation) and, for managers/limited roles,
// by allowedEmployeeIds. Sensitive values are masked; we never fabricate — an
// empty result becomes an honest "none found" reply.

import {
  employeeService,
  attendanceService,
  leaveService,
  recruitmentService,
  settingsService,
} from "../../../services";
import { todayIST, currentMonthIST } from "../context";
import { maskMobile } from "../../security/masking";
import { searchCandidates, type SearchableCandidate } from "../../recruitment/search";
import { computeRecruitmentDashboard } from "../../recruitment/dashboard";
import type { ParsedResume } from "../../recruitment/types";
import type { HandlerContext, IntentHandler } from "./shared";
import { t, ok, fail, fullName, noData } from "./shared";

// Active employees in the actor's company, scoped to the manager's team when set.
async function scopedEmployees(ctx: HandlerContext) {
  const companyId = ctx.actor.companyId!;
  let employees = await employeeService.getEmployeesByCompany(companyId);
  if (ctx.allowedEmployeeIds) {
    employees = employees.filter((e: any) => ctx.allowedEmployeeIds!.has(e.id));
  }
  return employees as any[];
}

const isActive = (e: any) => (e.status ?? "active") === "active" || e.status === "Active";

// Compare a Date's month/day against today (IST) — for birthdays/anniversaries.
function isSameDayMonth(dateStr: string | null | undefined, m: number, d: number): boolean {
  if (!dateStr) return false;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getMonth() + 1 === m && dt.getDate() === d;
}

export const employeeCount: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  return ok(
    t(lang, `There are ${emps.length} active employee(s) in your company.`, `आपकी कंपनी में ${emps.length} सक्रिय कर्मचारी हैं।`),
  );
};

export const genderRatio: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  if (emps.length === 0) return noData(lang, "active employees", "सक्रिय कर्मचारी");
  const counts: Record<string, number> = {};
  for (const e of emps) {
    const g = (e.gender || "unspecified").toLowerCase();
    counts[g] = (counts[g] || 0) + 1;
  }
  const lines = Object.entries(counts).map(([g, n]) => `• ${g}: ${n}`);
  return ok(t(lang, `Gender distribution (${emps.length} total):\n${lines.join("\n")}`, `लिंग वितरण (कुल ${emps.length}):\n${lines.join("\n")}`));
};

export const departmentStrength: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  if (emps.length === 0) return noData(lang, "active employees", "सक्रिय कर्मचारी");
  const counts: Record<string, number> = {};
  for (const e of emps) {
    const dpt = e.department || t(lang, "Unassigned", "अनिर्धारित");
    counts[dpt] = (counts[dpt] || 0) + 1;
  }
  const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([d, n]) => `• ${d}: ${n}`);
  return ok(t(lang, `Department-wise strength:\n${lines.join("\n")}`, `विभाग-वार संख्या:\n${lines.join("\n")}`));
};

export const locationWise: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  if (emps.length === 0) return noData(lang, "active employees", "सक्रिय कर्मचारी");
  const counts: Record<string, number> = {};
  for (const e of emps) {
    const loc = e.location || e.workLocation || t(lang, "Unassigned", "अनिर्धारित");
    counts[loc] = (counts[loc] || 0) + 1;
  }
  const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `• ${l}: ${n}`);
  return ok(t(lang, `Location-wise employees:\n${lines.join("\n")}`, `स्थान-वार कर्मचारी:\n${lines.join("\n")}`));
};

export const birthdaysToday: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const { month, year } = currentMonthIST();
  const day = Number(todayIST().slice(8, 10));
  const today = emps.filter((e) => isSameDayMonth(e.dateOfBirth, month, day));
  void year;
  if (today.length === 0) return noData(lang, "birthdays today", "आज कोई जन्मदिन");
  const lines = today.map((e) => `• ${fullName(e)}${e.department ? ` (${e.department})` : ""}`);
  return ok(t(lang, `🎂 Birthdays today:\n${lines.join("\n")}`, `🎂 आज के जन्मदिन:\n${lines.join("\n")}`));
};

export const anniversariesToday: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const { month } = currentMonthIST();
  const day = Number(todayIST().slice(8, 10));
  const today = emps.filter((e) => isSameDayMonth(e.dateOfJoining, month, day));
  if (today.length === 0) return noData(lang, "work anniversaries today", "आज कोई वर्षगाँठ");
  const lines = today.map((e) => {
    const years = e.dateOfJoining ? new Date().getFullYear() - new Date(e.dateOfJoining).getFullYear() : null;
    return `• ${fullName(e)}${years != null ? ` — ${years} ${t(lang, "yr(s)", "वर्ष")}` : ""}`;
  });
  return ok(t(lang, `🎉 Work anniversaries today:\n${lines.join("\n")}`, `🎉 आज की कार्य-वर्षगाँठ:\n${lines.join("\n")}`));
};

export const missingKyc: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const incomplete = emps.filter((e) => !e.aadhaar || !e.pan || !e.bankAccount);
  if (incomplete.length === 0) return ok(t(lang, "All active employees have complete KYC ✅.", "सभी सक्रिय कर्मचारियों का KYC पूरा है ✅।"), false);
  const lines = incomplete.slice(0, 20).map((e) => {
    const miss: string[] = [];
    if (!e.aadhaar) miss.push(t(lang, "Aadhaar", "आधार"));
    if (!e.pan) miss.push("PAN");
    if (!e.bankAccount) miss.push(t(lang, "Bank", "बैंक"));
    return `• ${fullName(e)} — ${miss.join(", ")}`;
  });
  const more = incomplete.length > 20 ? t(lang, `\n…and ${incomplete.length - 20} more.`, `\n…और ${incomplete.length - 20}।`) : "";
  return ok(t(lang, `${incomplete.length} employee(s) with incomplete KYC:\n${lines.join("\n")}${more}`, `${incomplete.length} कर्मचारियों का KYC अधूरा:\n${lines.join("\n")}${more}`));
};

export const probationEnding: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  // The employee schema has no probation-end date field, so we cannot compute
  // this precisely. Answer honestly rather than fabricate.
  const emps = (await scopedEmployees(ctx)).filter((e) => isActive(e) && (e.employmentType || "").toLowerCase().includes("probation"));
  if (emps.length === 0) {
    return ok(
      t(
        lang,
        "I don't have a probation end-date field in the records, so I can't list who is finishing probation. No employees are currently marked with a 'probation' employment type either.",
        "रिकॉर्ड में परिवीक्षा समाप्ति तिथि नहीं है, इसलिए मैं सूची नहीं बना सकता। फ़िलहाल किसी कर्मचारी का रोज़गार प्रकार 'probation' भी नहीं है।",
      ),
      false,
    );
  }
  const lines = emps.slice(0, 20).map((e) => `• ${fullName(e)} (${t(lang, "joined", "नियुक्ति")}: ${e.dateOfJoining || "—"})`);
  return ok(
    t(
      lang,
      `Employees marked on probation (no end-date field exists, so exact end dates aren't available):\n${lines.join("\n")}`,
      `परिवीक्षा पर चिह्नित कर्मचारी (समाप्ति तिथि फ़ील्ड मौजूद नहीं):\n${lines.join("\n")}`,
    ),
  );
};

export const contractExpiry: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = (await scopedEmployees(ctx)).filter((e) => isActive(e) && (e.employmentType || "").toLowerCase().includes("contract"));
  if (emps.length === 0) {
    return ok(
      t(
        lang,
        "There's no contract end-date field in the records, so I can't list contract expiries. No employees are currently marked with a 'contract' employment type either.",
        "रिकॉर्ड में अनुबंध समाप्ति तिथि नहीं है, इसलिए मैं सूची नहीं बना सकता। फ़िलहाल किसी का रोज़गार प्रकार 'contract' भी नहीं है।",
      ),
      false,
    );
  }
  const lines = emps.slice(0, 20).map((e) => `• ${fullName(e)} (${e.employmentType})`);
  return ok(
    t(
      lang,
      `Contract employees (no contract end-date field exists, so expiry dates aren't available):\n${lines.join("\n")}`,
      `अनुबंध कर्मचारी (समाप्ति तिथि फ़ील्ड मौजूद नहीं):\n${lines.join("\n")}`,
    ),
  );
};

export const attendanceSummary: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const date = todayIST();
  const records = (await attendanceService.getAttendanceByDate(companyId, date)) as any[];
  const scoped = ctx.allowedEmployeeIds ? records.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId)) : records;
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const present = scoped.filter((r) => (r.status || "").toLowerCase() === "present").length;
  const half = scoped.filter((r) => (r.status || "").toLowerCase().includes("half")).length;
  const onLeave = scoped.filter((r) => (r.status || "").toLowerCase().includes("leave")).length;
  const marked = scoped.length;
  const absent = Math.max(0, emps.length - present - half - onLeave);
  return ok(
    t(
      lang,
      `Attendance summary for ${date}:\n• Total employees: ${emps.length}\n• Present: ${present}\n• Half-day: ${half}\n• On leave: ${onLeave}\n• Not marked/absent: ${absent}`,
      `${date} की हाज़िरी सारांश:\n• कुल कर्मचारी: ${emps.length}\n• उपस्थित: ${present}\n• आधा दिन: ${half}\n• छुट्टी पर: ${onLeave}\n• अचिह्नित/अनुपस्थित: ${absent}`,
    ),
    marked > 0,
  );
};

export const absenteesToday: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const date = todayIST();
  const records = (await attendanceService.getAttendanceByDate(companyId, date)) as any[];
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const markedIds = new Set(records.filter((r) => (r.status || "").toLowerCase() === "present").map((r) => r.employeeId));
  const absent = emps.filter((e) => !markedIds.has(e.id));
  if (absent.length === 0) return ok(t(lang, "Everyone is present today ✅.", "आज सभी उपस्थित हैं ✅।"), false);
  const lines = absent.slice(0, 25).map((e) => `• ${fullName(e)}${e.department ? ` (${e.department})` : ""}`);
  const more = absent.length > 25 ? t(lang, `\n…and ${absent.length - 25} more.`, `\n…और ${absent.length - 25}।`) : "";
  return ok(t(lang, `${absent.length} not marked present today:\n${lines.join("\n")}${more}`, `आज ${absent.length} उपस्थित नहीं:\n${lines.join("\n")}${more}`));
};

export const lateEmployees: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const date = todayIST();
  const records = (await attendanceService.getAttendanceByDate(companyId, date)) as any[];
  const scoped = ctx.allowedEmployeeIds ? records.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId)) : records;
  const late = scoped.filter((r) => (r.status || "").toLowerCase().includes("late"));
  if (late.length === 0) return ok(t(lang, "No late arrivals recorded today.", "आज कोई देरी से आगमन दर्ज नहीं।"), false);
  const emps = await scopedEmployees(ctx);
  const byId = new Map(emps.map((e) => [e.id, e]));
  const lines = late.slice(0, 25).map((r) => {
    const e = byId.get(r.employeeId);
    return `• ${e ? fullName(e) : r.employeeId}${r.clockIn ? ` — ${r.clockIn}` : ""}`;
  });
  return ok(t(lang, `Late today (${late.length}):\n${lines.join("\n")}`, `आज देरी से (${late.length}):\n${lines.join("\n")}`));
};

export const onLeaveToday: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const date = todayIST();
  const requests = (await leaveService.getLeaveRequestsByCompany(companyId)) as any[];
  let onLeave = requests.filter(
    (r) => (r.status || "").toLowerCase() === "approved" && String(r.startDate) <= date && String(r.endDate) >= date,
  );
  if (ctx.allowedEmployeeIds) onLeave = onLeave.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId));
  if (onLeave.length === 0) return ok(t(lang, "No one is on approved leave today.", "आज कोई स्वीकृत छुट्टी पर नहीं है।"), false);
  const emps = await scopedEmployees(ctx);
  const byId = new Map(emps.map((e) => [e.id, e]));
  const lines = onLeave.slice(0, 25).map((r) => {
    const e = byId.get(r.employeeId);
    return `• ${e ? fullName(e) : r.employeeId} (${r.startDate} → ${r.endDate})`;
  });
  return ok(t(lang, `On leave today (${onLeave.length}):\n${lines.join("\n")}`, `आज छुट्टी पर (${onLeave.length}):\n${lines.join("\n")}`));
};

export const pendingApprovals: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const requests = (await leaveService.getLeaveRequestsByCompany(companyId)) as any[];
  let pending = requests.filter((r) => (r.status || "").toLowerCase() === "pending");
  if (ctx.allowedEmployeeIds) pending = pending.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId));
  if (pending.length === 0) return ok(t(lang, "No pending leave approvals 🎉.", "कोई लंबित छुट्टी मंज़ूरी नहीं 🎉।"), false);
  const emps = await scopedEmployees(ctx);
  const byId = new Map(emps.map((e) => [e.id, e]));
  const lines = pending.slice(0, 25).map((r) => {
    const e = byId.get(r.employeeId);
    return `• ${e ? fullName(e) : r.employeeId}: ${r.startDate} → ${r.endDate} (${r.days || "?"} ${t(lang, "day(s)", "दिन")})`;
  });
  return ok(
    t(
      lang,
      `${pending.length} pending leave request(s):\n${lines.join("\n")}\n\nSay e.g. "approve <name>'s leave" to action one.`,
      `${pending.length} लंबित छुट्टी अनुरोध:\n${lines.join("\n")}\n\nकार्रवाई के लिए कहें: "<नाम> की छुट्टी मंज़ूर करो"।`,
    ),
  );
};

export const pendingOnboarding: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = await scopedEmployees(ctx);
  const onboarding = emps.filter((e) => ["pending", "onboarding", "invited", "draft"].includes((e.status || "").toLowerCase()));
  if (onboarding.length === 0) return ok(t(lang, "No employees are pending onboarding.", "कोई कर्मचारी ऑनबोर्डिंग के लिए लंबित नहीं।"), false);
  const lines = onboarding.slice(0, 20).map((e) => `• ${fullName(e)} (${e.status})`);
  return ok(t(lang, `Pending onboarding (${onboarding.length}):\n${lines.join("\n")}`, `लंबित ऑनबोर्डिंग (${onboarding.length}):\n${lines.join("\n")}`));
};

export const pendingResignations: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const emps = await scopedEmployees(ctx);
  const resigning = emps.filter((e) => ["resigned", "notice", "notice_period", "exit_pending", "serving_notice"].includes((e.status || "").toLowerCase()) || (!!e.exitDate && (e.status || "").toLowerCase() !== "inactive"));
  if (resigning.length === 0) return ok(t(lang, "No pending resignations / exits.", "कोई लंबित त्यागपत्र / निकासी नहीं।"), false);
  const lines = resigning.slice(0, 20).map((e) => `• ${fullName(e)}${e.exitDate ? ` (${t(lang, "exit", "निकासी")}: ${e.exitDate})` : ` (${e.status})`}`);
  return ok(t(lang, `Pending resignations/exits (${resigning.length}):\n${lines.join("\n")}`, `लंबित त्यागपत्र/निकासी (${resigning.length}):\n${lines.join("\n")}`));
};

export const pendingPayroll: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const { monthName, year } = currentMonthIST();
  return ok(
    t(
      lang,
      `To check payroll status for ${monthName} ${year}, open Payroll → Generate. I can confirm pending payroll once you tell me the month, or you can review it directly there.`,
      `${monthName} ${year} की पेरोल स्थिति के लिए Payroll → Generate खोलें। महीना बताएँ तो मैं लंबित पेरोल बता सकता हूँ।`,
    ),
    false,
  );
};

export const recruitmentStatus: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const postings = (await recruitmentService.getJobPostingsByCompany(companyId)) as any[];
  const open = postings.filter((p) => ["open", "active", "published"].includes((p.status || "").toLowerCase()));
  const apps = (await recruitmentService.getJobApplicationsByCompany(companyId)) as any[];
  if (postings.length === 0) return noData(lang, "job postings", "कोई जॉब पोस्टिंग");
  const byStatus: Record<string, number> = {};
  for (const a of apps) {
    const s = (a.status || "applied").toLowerCase();
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const appLines = Object.entries(byStatus).map(([s, n]) => `   - ${s}: ${n}`);
  return ok(
    t(
      lang,
      `Recruitment status:\n• Open positions: ${open.length} (of ${postings.length} total)\n• Applications: ${apps.length}\n${appLines.join("\n")}`,
      `भर्ती स्थिति:\n• खुले पद: ${open.length} (कुल ${postings.length})\n• आवेदन: ${apps.length}\n${appLines.join("\n")}`,
    ),
  );
};

export const pendingInterviews: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const apps = (await recruitmentService.getJobApplicationsByCompany(companyId)) as any[];
  const today = todayIST();
  const upcoming = apps
    .filter((a) => (a.status || "").toLowerCase().includes("interview") && a.interviewDate && String(a.interviewDate) >= today)
    .sort((a, b) => String(a.interviewDate).localeCompare(String(b.interviewDate)));
  if (upcoming.length === 0) return ok(t(lang, "No upcoming interviews scheduled.", "कोई आगामी साक्षात्कार निर्धारित नहीं।"), false);
  const lines = upcoming.slice(0, 20).map((a) => `• ${a.applicantName || "Candidate"} — ${a.interviewDate}${a.interviewTime ? ` ${a.interviewTime}` : ""}`);
  return ok(t(lang, `Upcoming interviews (${upcoming.length}):\n${lines.join("\n")}`, `आगामी साक्षात्कार (${upcoming.length}):\n${lines.join("\n")}`));
};

export const quickSummary: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const date = todayIST();
  const emps = (await scopedEmployees(ctx)).filter(isActive);
  const [records, requests] = await Promise.all([
    attendanceService.getAttendanceByDate(companyId, date) as Promise<any[]>,
    leaveService.getLeaveRequestsByCompany(companyId) as Promise<any[]>,
  ]);
  // Apply the same team/location scope as the employee list so restricted
  // managers can't infer org-wide attendance/leave counts.
  const scopedRecords = ctx.allowedEmployeeIds
    ? records.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId))
    : records;
  const scopedRequests = ctx.allowedEmployeeIds
    ? requests.filter((r) => ctx.allowedEmployeeIds!.has(r.employeeId))
    : requests;
  const present = scopedRecords.filter((r) => (r.status || "").toLowerCase() === "present").length;
  const pendingLeaves = scopedRequests.filter((r) => (r.status || "").toLowerCase() === "pending").length;
  const incompleteKyc = emps.filter((e) => !e.aadhaar || !e.pan || !e.bankAccount).length;
  return ok(
    t(
      lang,
      `Company snapshot (${date}):\n• Active employees: ${emps.length}\n• Present today: ${present}\n• Pending leave approvals: ${pendingLeaves}\n• Incomplete KYC: ${incompleteKyc}`,
      `कंपनी झलक (${date}):\n• सक्रिय कर्मचारी: ${emps.length}\n• आज उपस्थित: ${present}\n• लंबित छुट्टी मंज़ूरी: ${pendingLeaves}\n• अधूरा KYC: ${incompleteKyc}`,
    ),
  );
};

// Natural-language candidate search over live applications (deterministic — the
// query is parsed into skill/experience/location/status filters, never sent to
// an LLM, so results are always real candidates).
export const candidateSearch: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const query = (ctx.detected.params?.query || "").trim();
  if (!query) {
    return ok(
      t(
        lang,
        "Tell me what to look for, e.g. \"find candidates with React and 5 years experience in Pune\".",
        "बताइए क्या ढूँढना है, जैसे \"React और 5 साल अनुभव वाले उम्मीदवार Pune में खोजें\"।",
      ),
      false,
    );
  }
  const apps = (await recruitmentService.getJobApplicationsByCompany(companyId)) as any[];
  const searchable: SearchableCandidate[] = apps.map((a) => {
    const parsed = (a.parsedResume || {}) as ParsedResume;
    return {
      applicationId: a.id,
      name: a.applicantName || "Unknown",
      status: a.status,
      location: parsed.location || null,
      skills: parsed.skills || null,
      experienceYears: parsed.totalExperienceYears ?? null,
      resumeText: a.resumeText,
      appliedAt: a.appliedAt,
    };
  });
  const results = searchCandidates(query, searchable);
  if (results.length === 0) {
    return ok(
      t(lang, `No candidates matched "${query}".`, `"${query}" से मेल खाता कोई उम्मीदवार नहीं मिला।`),
      false,
    );
  }
  const lines = results
    .slice(0, 15)
    .map((r) => {
      const exp = r.experienceYears != null ? `, ${r.experienceYears} yr` : "";
      return `• ${r.name} (${r.status}${exp}) — ${r.matchedOn.slice(0, 4).join(", ")}`;
    });
  return ok(
    t(
      lang,
      `Found ${results.length} candidate(s) for "${query}":\n${lines.join("\n")}`,
      `"${query}" के लिए ${results.length} उम्मीदवार मिले:\n${lines.join("\n")}`,
    ),
  );
};

// Recruitment dashboard snapshot — deterministic metrics from live data.
export const recruitmentDashboard: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const companyId = ctx.actor.companyId!;
  const [postings, apps] = await Promise.all([
    recruitmentService.getJobPostingsByCompany(companyId) as Promise<any[]>,
    recruitmentService.getJobApplicationsByCompany(companyId) as Promise<any[]>,
  ]);
  if (postings.length === 0 && apps.length === 0) {
    return noData(lang, "recruitment activity", "कोई भर्ती गतिविधि");
  }
  const d = computeRecruitmentDashboard(
    postings.map((p) => ({ status: p.status })),
    apps.map((a) => ({ status: a.status, appliedAt: a.appliedAt, hiredAt: a.status === "hired" ? a.reviewedAt : null })),
  );
  const stageLines = Object.entries(d.pipelineByStage).map(([s, n]) => `   - ${s}: ${n}`);
  return ok(
    t(
      lang,
      `Recruitment dashboard:\n• Open positions: ${d.openPositions}\n• Total applications: ${d.totalApplications}\n• Interview conversion: ${d.interviewConversionRate}%\n• Offers extended: ${d.offersExtended} (accepted ${d.offersAccepted}, ${d.offerAcceptanceRate}%)${d.averageTimeToHireDays != null ? `\n• Avg time to hire: ${d.averageTimeToHireDays} day(s)` : ""}\nPipeline:\n${stageLines.join("\n")}`,
      `भर्ती डैशबोर्ड:\n• खुले पद: ${d.openPositions}\n• कुल आवेदन: ${d.totalApplications}\n• साक्षात्कार रूपांतरण: ${d.interviewConversionRate}%\n• ऑफर दिए: ${d.offersExtended} (स्वीकृत ${d.offersAccepted}, ${d.offerAcceptanceRate}%)${d.averageTimeToHireDays != null ? `\n• औसत हायर समय: ${d.averageTimeToHireDays} दिन` : ""}\nपाइपलाइन:\n${stageLines.join("\n")}`,
    ),
  );
};

// Documents-expiry: the schema has no document expiry-date field, so answer honestly.
export const expiringDocuments: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  void settingsService;
  return ok(
    t(
      lang,
      "Employee documents don't carry an expiry date in the system, so I can't list expiring documents. You can review uploaded documents per employee under their profile.",
      "सिस्टम में कर्मचारी दस्तावेज़ों की समाप्ति तिथि नहीं होती, इसलिए मैं सूची नहीं बना सकता। प्रत्येक कर्मचारी की प्रोफ़ाइल में दस्तावेज़ देखें।",
    ),
    false,
  );
};
