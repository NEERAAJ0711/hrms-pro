// Phase 3 — pure-function checks for the Recruitment AI suite: resume-field
// normalization, deterministic candidate ranking, duplicate detection,
// natural-language search, recruitment dashboard metrics, intent detection and
// the RBAC authorization gate for recruitment intents. No DB / network needed.
// Run with:  node_modules/.bin/tsx --test server/__tests__/ai-recruitment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { normalizeParsedResume, isResumeExtractable, extractResumeText } from "../ai/extraction/resume";
import {
  rankCandidates,
  scoreCandidate,
  generateInterviewQuestions,
  type ScoredInput,
} from "../ai/recruitment/service";
import { findDuplicates, resumeSimilarity, type DedupeCandidate } from "../ai/recruitment/dedupe";
import { parseSearchQuery, searchCandidates, type SearchableCandidate } from "../ai/recruitment/search";
import { computeRecruitmentDashboard } from "../ai/recruitment/dashboard";
import { detectIntent } from "../ai/intents/detector";
import { authorizeIntent, buildActor } from "../ai/intents/context";
import type { DetectedIntent } from "../ai/intents/types";

// ── Resume extraction helpers ─────────────────────────────────────────────────

test("isResumeExtractable accepts PDF/DOCX/TXT only", () => {
  assert.equal(isResumeExtractable("cv.pdf"), true);
  assert.equal(isResumeExtractable("resume.DOCX"), true);
  assert.equal(isResumeExtractable("notes.txt"), true);
  assert.equal(isResumeExtractable("photo.png"), false);
  assert.equal(isResumeExtractable("data.doc"), false);
});

test("normalizeParsedResume keeps known fields, coerces types, drops junk", () => {
  const out = normalizeParsedResume({
    fullName: "  Asha Rao  ",
    email: "asha@example.com",
    totalExperienceYears: "7",
    skills: ["React", "  Node ", 42, ""],
    experience: [{ company: "Acme", designation: "Engineer", duration: "2y" }, {}],
    unknownField: "should be dropped",
  });
  assert.equal(out.fullName, "Asha Rao");
  assert.equal(out.totalExperienceYears, 7);
  // Non-strings are coerced to strings, empty entries dropped.
  assert.deepEqual(out.skills, ["React", "Node", "42"]);
  assert.equal(out.experience?.length, 1);
  assert.equal((out as any).unknownField, undefined);
});

test("normalizeParsedResume ignores a non-numeric experience value", () => {
  const out = normalizeParsedResume({ totalExperienceYears: "many" });
  assert.equal(out.totalExperienceYears, undefined);
});

// Generate a small PDF with pdfkit, write to a temp file, and confirm the
// pdf-parse@2.x extraction path returns the embedded text (regression guard for
// the v2 PDFParse API).
function makePdf(text: string): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.text(text);
    doc.end();
  });
}

test("extractResumeText reads text from a real PDF (pdf-parse v2)", async () => {
  const marker = "Asha Rao Senior Engineer React Node";
  const pdf = await makePdf(marker);
  const tmp = path.join(os.tmpdir(), `resume-test-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, pdf);
  try {
    const result = await extractResumeText(tmp, "resume.pdf");
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.text.includes("Asha Rao"), `expected marker in: ${result.text}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("extractResumeText reads a TXT file and rejects unsupported types", async () => {
  const tmp = path.join(os.tmpdir(), `resume-test-${Date.now()}.txt`);
  fs.writeFileSync(tmp, "Plain text resume for Asha Rao");
  try {
    const ok = await extractResumeText(tmp, "resume.txt");
    assert.equal(ok.ok, true);
    const bad = await extractResumeText(tmp, "resume.png");
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "unsupported_format");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ── Deterministic ranking ──────────────────────────────────────────────────────

test("rankCandidates orders by score desc, tie-broken by recommendation then name", () => {
  const input: ScoredInput[] = [
    { applicationId: "a", candidateName: "Charlie", score: 80, recommendation: "hire" },
    { applicationId: "b", candidateName: "Alice", score: 90, recommendation: "hire" },
    { applicationId: "c", candidateName: "Bob", score: 80, recommendation: "strong_hire" },
  ];
  const ranked = rankCandidates(input);
  assert.deepEqual(ranked.map((r) => r.applicationId), ["b", "c", "a"]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test("rankCandidates is deterministic (stable across calls)", () => {
  const input: ScoredInput[] = [
    { applicationId: "x", candidateName: "Zoe", score: 50, recommendation: "maybe" },
    { applicationId: "y", candidateName: "Amy", score: 50, recommendation: "maybe" },
  ];
  const a = rankCandidates(input).map((r) => r.applicationId);
  const b = rankCandidates(input).map((r) => r.applicationId);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["y", "x"]); // tie → name asc
});

// ── Service no-data guards (return before any AI call) ──────────────────────────

test("scoreCandidate returns no_data when candidate has no resume/skills", async () => {
  const r = await scoreCandidate(
    { title: "Engineer" },
    { name: "Empty", parsed: null, resumeText: null, skills: null },
  );
  assert.equal(r.available, false);
  if (!r.available) assert.equal(r.reason, "no_data");
});

test("generateInterviewQuestions returns no_data without candidate evidence", async () => {
  const r = await generateInterviewQuestions(
    { title: "Engineer" },
    { name: "Empty", parsed: null, resumeText: null, skills: null },
  );
  assert.equal(r.available, false);
  if (!r.available) assert.equal(r.reason, "no_data");
});

// ── Duplicate detection ────────────────────────────────────────────────────────

test("findDuplicates flags same email as high confidence and skips self", () => {
  const target: DedupeCandidate = { applicationId: "1", name: "Ravi K", email: "ravi@x.com" };
  const existing: DedupeCandidate[] = [
    { applicationId: "1", name: "Ravi K", email: "ravi@x.com" }, // self — ignored
    { applicationId: "2", name: "Ravi Kumar", email: "RAVI@x.com" }, // same email (case-insensitive)
    { applicationId: "3", name: "Other", email: "other@x.com" },
  ];
  const matches = findDuplicates(target, existing);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].applicationId, "2");
  assert.equal(matches[0].confidence, "high");
});

test("findDuplicates matches phone ignoring formatting/country code", () => {
  const target: DedupeCandidate = { applicationId: "1", phone: "+91 98765 43210" };
  const existing: DedupeCandidate[] = [{ applicationId: "2", phone: "9876543210" }];
  const matches = findDuplicates(target, existing);
  assert.equal(matches.length, 1);
  assert.ok(matches[0].reasons.some((r) => r.includes("phone")));
});

test("resumeSimilarity is 1 for identical text and 0 for disjoint text", () => {
  assert.equal(resumeSimilarity("react node typescript", "react node typescript"), 1);
  assert.equal(resumeSimilarity("react node", "python django"), 0);
  assert.equal(resumeSimilarity("", "anything"), 0);
});

// ── Natural-language search ─────────────────────────────────────────────────────

test("parseSearchQuery extracts experience, location and terms", () => {
  const p = parseSearchQuery("find React developers with 5 years in Pune");
  assert.equal(p.minExperience, 5);
  assert.equal(p.location, "pune");
  assert.ok(p.terms.includes("react"));
});

test("searchCandidates applies hard experience filter and ranks skill hits", () => {
  const candidates: SearchableCandidate[] = [
    { applicationId: "1", name: "Junior", status: "applied", location: "Pune", skills: ["React"], experienceYears: 2 },
    { applicationId: "2", name: "Senior", status: "applied", location: "Pune", skills: ["React", "Node"], experienceYears: 6 },
  ];
  const results = searchCandidates("React developers with 5 years in Pune", candidates);
  // Junior (2 yrs) filtered out by the 5-year hard filter.
  assert.equal(results.length, 1);
  assert.equal(results[0].applicationId, "2");
  assert.ok(results[0].matchedOn.some((m) => m.includes("react")));
});

test("searchCandidates returns nothing for an unrelated query", () => {
  const candidates: SearchableCandidate[] = [
    { applicationId: "1", name: "Dev", status: "applied", skills: ["React"], experienceYears: 4 },
  ];
  assert.equal(searchCandidates("golang kubernetes", candidates).length, 0);
});

// ── Recruitment dashboard metrics ───────────────────────────────────────────────

test("computeRecruitmentDashboard derives live counts and rates", () => {
  const d = computeRecruitmentDashboard(
    [{ status: "open" }, { status: "closed" }, { status: "active" }],
    [
      { status: "applied" },
      { status: "interview_scheduled" },
      { status: "offered" },
      { status: "offer_accepted" },
      { status: "hired" },
    ],
  );
  assert.equal(d.openPositions, 2);
  assert.equal(d.totalApplications, 5);
  // 4 of 5 reached the interview stage or beyond → 80% conversion.
  assert.equal(d.interviewConversionRate, 80);
  // offered/offer_accepted/hired = 3 extended; offer_accepted+hired = 2 accepted.
  assert.equal(d.offersExtended, 3);
  assert.equal(d.offersAccepted, 2);
});

test("computeRecruitmentDashboard handles empty data without dividing by zero", () => {
  const d = computeRecruitmentDashboard([], []);
  assert.equal(d.openPositions, 0);
  assert.equal(d.totalApplications, 0);
  assert.equal(d.interviewConversionRate, 0);
  assert.equal(d.offerAcceptanceRate, 0);
  assert.equal(d.averageTimeToHireDays, null);
});

// ── Intent detection (recruitment) ──────────────────────────────────────────────

test("detects recruitment dashboard and candidate search intents", () => {
  assert.equal(detectIntent("show me the recruitment dashboard")?.intent, "recruitment_dashboard");
  assert.equal(detectIntent("hiring funnel metrics")?.intent, "recruitment_dashboard");
  const search = detectIntent("find candidates with React and 5 years experience");
  assert.equal(search?.intent, "candidate_search");
  assert.equal(search?.params.query, "find candidates with React and 5 years experience");
});

test("recruitment_dashboard wins over generic status/summary intents", () => {
  assert.equal(detectIntent("recruitment dashboard")?.intent, "recruitment_dashboard");
  assert.equal(detectIntent("hiring funnel metrics")?.intent, "recruitment_dashboard");
  assert.equal(detectIntent("recruitment dashboard summary")?.intent, "recruitment_dashboard");
  // Plain status ask (no dashboard noun) still routes to recruitment_status.
  assert.equal(detectIntent("what is the recruitment status")?.intent, "recruitment_status");
});

test("explicit candidate search beats dashboard for 'find candidates in pipeline'", () => {
  assert.equal(detectIntent("find candidates in pipeline")?.intent, "candidate_search");
  // Without a search verb, 'recruitment pipeline' is the dashboard.
  assert.equal(detectIntent("recruitment pipeline")?.intent, "recruitment_dashboard");
});

test("recruitment intents are admin-scoped on the recruitment module", () => {
  const i = detectIntent("search applicants in Pune");
  assert.equal(i?.module, "recruitment");
  assert.equal(i?.scope, "admin");
});

// ── RBAC authorization for recruitment intents ──────────────────────────────────

function di(intent: string): DetectedIntent {
  return { intent, module: "recruitment", kind: "read", scope: "admin", params: {}, confidence: 1 };
}

test("recruiter role may use recruitment intents; plain manager may not", () => {
  const recruiter = buildActor({ userId: "u1", role: "recruiter", companyId: "c1", userName: "R" });
  const manager = buildActor({ userId: "u2", role: "manager", companyId: "c1", userName: "M" });
  assert.equal(authorizeIntent(recruiter, di("candidate_search")).ok, true);
  assert.equal(authorizeIntent(recruiter, di("recruitment_dashboard")).ok, true);
  assert.equal(authorizeIntent(manager, di("candidate_search")).ok, false);
});

test("recruitment intent without a company is denied (super_admin still allowed)", () => {
  const orphan = buildActor({ userId: "u3", role: "hr_admin", companyId: null, userName: "H" });
  assert.equal(authorizeIntent(orphan, di("recruitment_dashboard")).ok, false);
  const su = buildActor({ userId: "u4", role: "super_admin", companyId: null, userName: "S" });
  assert.equal(authorizeIntent(su, di("recruitment_dashboard")).ok, true);
});
