// Automated checks that the AI HR assistant only saves approved fields, blocks
// access to other people's conversations, and degrades gracefully without an AI
// key. Run with:  node_modules/.bin/tsx --test server/__tests__/ai-extraction.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapExtractionToUpdates,
  checkConversationAccess,
  normalizeDob,
  normalizeGender,
} from "../ai-extraction";
import { messageMayContainProfileInfo, extractProfileFromText, setOpenAIKeyOverride } from "../ai-service";

// The exact set of employee-master columns the "profile" flow is allowed to write.
const PROFILE_ALLOWED_COLUMNS = new Set([
  "gender",
  "dateOfBirth",
  "mobileNumber",
  "officialEmail",
  "fatherHusbandName",
  "uan",
  "esiNumber",
  "pan",
  "aadhaar",
  "bankAccount",
  "ifsc",
  "presentAddress",
  "permanentAddress",
]);

// ── Whitelist: profile docType only writes approved columns ───────────────────

test("profile extraction writes only whitelisted columns", () => {
  const updates = mapExtractionToUpdates("profile", {
    uan: "100200300400",
    esiNumber: "3100000000",
    mobileNumber: "9876543210",
    presentAddress: "12 MG Road, Pune",
  });
  assert.ok(updates, "expected an updates object");
  for (const key of Object.keys(updates!)) {
    assert.ok(
      PROFILE_ALLOWED_COLUMNS.has(key),
      `column "${key}" is not in the profile whitelist`,
    );
  }
});

test("profile extraction ignores fields not in the whitelist", () => {
  const updates = mapExtractionToUpdates("profile", {
    uan: "100200300400",
    // Attempts to write columns that must NEVER be settable via this flow:
    role: "super_admin",
    salary: "9999999",
    isActive: "true",
    companyId: "some-other-company",
    password: "hacked",
  } as Record<string, string>);
  assert.deepEqual(updates, { uan: "100200300400" });
  assert.ok(!("role" in updates!));
  assert.ok(!("salary" in updates!));
  assert.ok(!("companyId" in updates!));
  assert.ok(!("password" in updates!));
});

test("profile extraction normalizes values", () => {
  const updates = mapExtractionToUpdates("profile", {
    gender: "male",
    dateOfBirth: "05/09/1990",
    pan: "abcde 1234 f",
    aadhaar: "1234 5678 9012",
    ifsc: "hdfc 0001234",
  });
  assert.equal(updates!.gender, "Male");
  assert.equal(updates!.dateOfBirth, "1990-09-05");
  assert.equal(updates!.pan, "ABCDE1234F");
  assert.equal(updates!.aadhaar, "123456789012");
  assert.equal(updates!.ifsc, "HDFC0001234");
});

test("empty profile fields produce no updates", () => {
  const updates = mapExtractionToUpdates("profile", { uan: "  ", gender: "" });
  assert.deepEqual(updates, {});
});

test("unsupported docType returns null", () => {
  assert.equal(mapExtractionToUpdates("unknown_doc", { foo: "bar" }), null);
  assert.equal(mapExtractionToUpdates("", {}), null);
});

test("document docTypes still map to their own whitelisted columns", () => {
  assert.deepEqual(
    mapExtractionToUpdates("aadhaar", { aadhaarNumber: "1234 5678 9012", gender: "F" }),
    { aadhaar: "123456789012", gender: "Female" },
  );
  assert.deepEqual(
    mapExtractionToUpdates("pan", { panNumber: "abcde1234f", fatherName: "Ram" }),
    { pan: "ABCDE1234F", fatherHusbandName: "Ram" },
  );
  assert.deepEqual(
    mapExtractionToUpdates("bank_details", { accountNumber: "00112233", ifsc: "sbin0000123" }),
    { bankAccount: "00112233", ifsc: "SBIN0000123" },
  );
});

// ── Normalizers ───────────────────────────────────────────────────────────────

test("normalizeDob converts DD/MM/YYYY and leaves others untouched", () => {
  assert.equal(normalizeDob("5/9/1990"), "1990-09-05");
  assert.equal(normalizeDob("05-09-1990"), "1990-09-05");
  assert.equal(normalizeDob("1990-09-05"), "1990-09-05");
});

test("normalizeGender maps to canonical values", () => {
  assert.equal(normalizeGender("male"), "Male");
  assert.equal(normalizeGender("F"), "Female");
  assert.equal(normalizeGender("other"), "Other");
  assert.equal(normalizeGender(""), "");
});

// ── Access control: only the conversation owner may act on it ─────────────────

test("conversation access is granted only to the owner", () => {
  assert.equal(checkConversationAccess({ userId: "u1" }, "u1"), "ok");
});

test("conversation access is forbidden for a different user", () => {
  assert.equal(checkConversationAccess({ userId: "u1" }, "attacker"), "forbidden");
});

test("missing conversation is reported as not_found", () => {
  assert.equal(checkConversationAccess(undefined, "u1"), "not_found");
  assert.equal(checkConversationAccess(null, "u1"), "not_found");
});

// ── Graceful degradation when no AI key is configured ─────────────────────────

test("a message with no profile hint never calls the AI and returns unavailable", async () => {
  const res = await extractProfileFromText("hello, how are you today?");
  assert.equal(res.available, false);
  assert.equal(res.reason, "no_hint");
});

test("with no AI key, profile extraction degrades gracefully (no crash)", async () => {
  const savedEnvKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  setOpenAIKeyOverride(null);
  try {
    // This message DOES contain hints (digits, "uan"), so it passes the cheap
    // gate and reaches the AI-key check — which must fail closed, not throw.
    const res = await extractProfileFromText("my uan is 100200300400 and mobile 9876543210");
    assert.equal(res.available, false);
    assert.equal(res.reason, "no_ai_key");
  } finally {
    if (savedEnvKey !== undefined) process.env.OPENAI_API_KEY = savedEnvKey;
    setOpenAIKeyOverride(null);
  }
});

test("messageMayContainProfileInfo gates plausible profile messages", () => {
  assert.equal(messageMayContainProfileInfo("my pan is ABCDE1234F"), true);
  assert.equal(messageMayContainProfileInfo("thanks!"), false);
});
