// Sensitive-value masking for AI-assistant replies.
//
// The AI layer must never echo a full Aadhaar / PAN / bank account / salary to
// the wrong person, and even for the owner we only ever reveal the last few
// characters. These helpers centralize that policy so every handler masks the
// same way (the rule-engine has its own private copies for the KYC chat path —
// these mirror that behavior for the Phase-2 module handlers).

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Aadhaar → show only the last 4 digits: "XXXX XXXX 9012". */
export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return "—";
  const d = digitsOnly(value);
  if (d.length < 4) return "••••";
  return `XXXX XXXX ${d.slice(-4)}`;
}

/** PAN → reveal first 2 and last 1: "AB•••••••F". */
export function maskPan(value: string | null | undefined): string {
  if (!value) return "—";
  const v = value.trim().toUpperCase();
  if (v.length < 4) return "••••";
  return `${v.slice(0, 2)}${"•".repeat(Math.max(3, v.length - 3))}${v.slice(-1)}`;
}

/** Bank account → reveal only the last 4 digits: "••••3456". */
export function maskBank(value: string | null | undefined): string {
  if (!value) return "—";
  const d = digitsOnly(value);
  if (d.length < 4) return "••••";
  return `••••${d.slice(-4)}`;
}

/** Mobile → reveal last 4: "••••••3210". */
export function maskMobile(value: string | null | undefined): string {
  if (!value) return "—";
  const d = digitsOnly(value);
  if (d.length < 4) return "••••";
  return `${"•".repeat(Math.max(2, d.length - 4))}${d.slice(-4)}`;
}

// Roles permitted to see exact salary figures. Employees may see their OWN
// salary (handlers enforce ownership separately); anyone else needs payroll
// rights, so admin handlers mask salary unless the actor is privileged.
const SALARY_PRIVILEGED = new Set(["super_admin", "company_admin", "hr_admin"]);

export function canSeeSalary(role: string | undefined, isOwner: boolean): boolean {
  if (isOwner) return true;
  return !!role && SALARY_PRIVILEGED.has(role);
}

/** Hide a salary figure when the viewer is not authorized. */
export function maskSalary(amount: number | string | null | undefined, allowed: boolean): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  if (!allowed) return "••••• (hidden)";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
