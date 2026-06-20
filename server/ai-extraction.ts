// Pure, side-effect-free helpers for the AI HR assistant's "apply extraction"
// flow. Kept separate from the route handler so the security-sensitive logic
// (which employee-master columns may be written, and who may write them) can be
// unit-tested without booting the server or a database.

export const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function normalizeDob(s: string): string {
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

export function normalizeGender(s: string): string {
  const t = s.trim().toLowerCase();
  if (t.startsWith("m")) return "Male";
  if (t.startsWith("f")) return "Female";
  if (t) return "Other";
  return "";
}

// Map verified extraction fields onto employee-master columns. Each docType has
// its own fixed whitelist of columns — caller-supplied keys can never choose a
// column directly, so arbitrary columns can't be written. Returns null for an
// unsupported docType so the caller can respond with a 400.
export function mapExtractionToUpdates(
  docType: string,
  fields: Record<string, string>,
): Record<string, any> | null {
  const updates: Record<string, any> = {};
  const setIf = (col: string, val: string) => {
    if (val) updates[col] = val;
  };

  if (docType === "aadhaar") {
    setIf("aadhaar", clean(fields.aadhaarNumber).replace(/\s+/g, ""));
    if (clean(fields.dateOfBirth)) updates.dateOfBirth = normalizeDob(clean(fields.dateOfBirth));
    if (clean(fields.gender)) updates.gender = normalizeGender(clean(fields.gender));
    setIf("presentAddress", clean(fields.address));
  } else if (docType === "pan") {
    setIf("pan", clean(fields.panNumber).toUpperCase());
    setIf("fatherHusbandName", clean(fields.fatherName));
    if (clean(fields.dateOfBirth)) updates.dateOfBirth = normalizeDob(clean(fields.dateOfBirth));
  } else if (docType === "bank_details" || docType === "cancelled_cheque") {
    setIf("bankAccount", clean(fields.accountNumber).replace(/\s+/g, ""));
    setIf("ifsc", clean(fields.ifsc).replace(/\s+/g, "").toUpperCase());
  } else if (docType === "address_proof") {
    setIf("presentAddress", clean(fields.address));
  } else if (docType === "profile") {
    // Statutory / HRMS profile details the employee typed (ESIC, EPFO, HRMS).
    // Whitelist: only these employee-master columns may be written here.
    setIf("gender", normalizeGender(clean(fields.gender)));
    if (clean(fields.dateOfBirth)) updates.dateOfBirth = normalizeDob(clean(fields.dateOfBirth));
    setIf("mobileNumber", clean(fields.mobileNumber).replace(/\s+/g, ""));
    setIf("officialEmail", clean(fields.officialEmail));
    setIf("fatherHusbandName", clean(fields.fatherHusbandName));
    setIf("uan", clean(fields.uan).replace(/\s+/g, ""));
    setIf("esiNumber", clean(fields.esiNumber).replace(/\s+/g, ""));
    setIf("pan", clean(fields.pan).replace(/\s+/g, "").toUpperCase());
    setIf("aadhaar", clean(fields.aadhaar).replace(/\s+/g, ""));
    setIf("bankAccount", clean(fields.bankAccount).replace(/\s+/g, ""));
    setIf("ifsc", clean(fields.ifsc).replace(/\s+/g, "").toUpperCase());
    setIf("presentAddress", clean(fields.presentAddress));
    setIf("permanentAddress", clean(fields.permanentAddress));
  } else {
    return null;
  }

  return updates;
}

// Authorize access to a conversation: a conversation may only be acted on by the
// user who owns it. Returns a decision the caller maps to 404 / 403 / proceed.
export function checkConversationAccess(
  conv: { userId: string } | undefined | null,
  userId: string,
): "not_found" | "forbidden" | "ok" {
  if (!conv) return "not_found";
  if (conv.userId !== userId) return "forbidden";
  return "ok";
}
