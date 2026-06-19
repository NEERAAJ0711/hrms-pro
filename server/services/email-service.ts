// HRMS Pro — centralized email service (Resend).
//
// All outbound transactional email goes through this module. It degrades
// gracefully: when RESEND_API_KEY is not configured (or a send fails), the
// attempt is logged and a non-fatal result is returned — the calling flow
// (offer, leave, payroll, KYC, AI follow-up, compliance) is never broken by
// an email problem, mirroring the try/catch style in notifications.ts.
//
// Recipient resolution lives at the call sites (they already hold the
// employee/user records); template functions here only format + send.

import { Resend } from "resend";
import { companyService } from "./company-service";

// ─── Client (lazy, never cached as a module singleton beyond the key) ─────────

const FROM_ADDRESS = process.env.EMAIL_FROM || "HRMS Pro <onboarding@resend.dev>";
const DEFAULT_BRAND = "HRMS Pro";

let cachedClient: Resend | null = null;
let cachedKey: string | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new Resend(key);
  cachedKey = key;
  return cachedClient;
}

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// ─── Company-name resolution (cached, best-effort) ────────────────────────────

const companyNameCache = new Map<string, string>();

async function resolveBrand(companyId?: string | null, companyName?: string | null): Promise<string> {
  if (companyName && companyName.trim()) return companyName.trim();
  if (!companyId) return DEFAULT_BRAND;
  if (companyNameCache.has(companyId)) return companyNameCache.get(companyId)!;
  try {
    const company = await companyService.getCompany(companyId);
    const name = company?.companyName?.trim() || DEFAULT_BRAND;
    companyNameCache.set(companyId, name);
    return name;
  } catch {
    return DEFAULT_BRAND;
  }
}

// ─── Core send (graceful, never throws) ───────────────────────────────────────

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer | string }[];
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0 && t.includes("@"));
  return Array.from(new Set(list));
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(params.to);
  if (recipients.length === 0) {
    console.warn(`[Email] Skipped (no valid recipient): "${params.subject}"`);
    return { ok: false, skipped: true, error: "no_recipient" };
  }

  const client = getClient();
  if (!client) {
    console.warn(`[Email] Skipped (RESEND_API_KEY not configured): "${params.subject}" -> ${recipients.join(", ")}`);
    return { ok: false, skipped: true, error: "not_configured" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    });
    if (error) {
      console.error(`[Email] Send failed for "${params.subject}":`, error);
      return { ok: false, error: String((error as any)?.message || error) };
    }
    console.log(`[Email] Sent "${params.subject}" -> ${recipients.join(", ")} (id=${data?.id})`);
    return { ok: true, id: data?.id };
  } catch (err: any) {
    console.error(`[Email] Send threw for "${params.subject}":`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Shared HTML layout ───────────────────────────────────────────────────────

const BRAND_COLOR = "#1e40af"; // matches app primary (blue)

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: {
  brand: string;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accent?: string;
}): string {
  const accent = opts.accent || BRAND_COLOR;
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<tr><td style="padding:8px 0 24px;">
         <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:14px;">${escapeHtml(opts.ctaLabel)}</a>
       </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:${accent};padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">${escapeHtml(opts.brand)}</span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${opts.intro}</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${opts.bodyHtml}
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">This is an automated message from ${escapeHtml(opts.brand)}. Please do not reply directly to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailRows(rows: { label: string; value: string }[]): string {
  return `<tr><td style="padding:0 0 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      ${rows.map((r, i) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#64748b;${i ? "border-top:1px solid #e2e8f0;" : ""}width:40%;">${escapeHtml(r.label)}</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;${i ? "border-top:1px solid #e2e8f0;" : ""}">${escapeHtml(r.value)}</td>
      </tr>`).join("")}
    </table>
  </td></tr>`;
}

function paragraph(html: string): string {
  return `<tr><td style="padding:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">${html}</td></tr>`;
}

// ─── Typed template functions ─────────────────────────────────────────────────

export interface OfferLetterEmailParams {
  to: string;
  candidateName: string;
  jobTitle?: string | null;
  offerDetails?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

export async function sendOfferLetterEmail(p: OfferLetterEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const rows = [{ label: "Position", value: p.jobTitle || "—" }, { label: "Status", value: "Offer Extended" }];
  const body =
    detailRows(rows) +
    (p.offerDetails ? paragraph(`<strong>Offer details:</strong><br>${escapeHtml(p.offerDetails).replace(/\n/g, "<br>")}`) : "") +
    paragraph("Please log in to your candidate portal to review the full offer and submit your response.");
  return sendEmail({
    to: p.to,
    subject: `Your offer from ${brand}${p.jobTitle ? ` — ${p.jobTitle}` : ""}`,
    html: layout({
      brand,
      heading: `Congratulations, ${p.candidateName || "Candidate"}!`,
      intro: `We are pleased to extend you an offer${p.jobTitle ? ` for the role of <strong>${escapeHtml(p.jobTitle)}</strong>` : ""}.`,
      bodyHtml: body,
    }),
  });
}

export interface LeaveDecisionEmailParams {
  to: string;
  employeeName: string;
  status: "approved" | "rejected";
  startDate?: string | null;
  endDate?: string | null;
  rejectionReason?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

export async function sendLeaveDecisionEmail(p: LeaveDecisionEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const approved = p.status === "approved";
  const accent = approved ? "#16a34a" : "#dc2626";
  const rows = [
    { label: "Decision", value: approved ? "Approved" : "Rejected" },
    { label: "From", value: p.startDate || "—" },
    { label: "To", value: p.endDate || "—" },
  ];
  const body =
    detailRows(rows) +
    (!approved && p.rejectionReason ? paragraph(`<strong>Reason:</strong> ${escapeHtml(p.rejectionReason)}`) : "") +
    paragraph(approved
      ? "Your leave has been approved. Enjoy your time off!"
      : "Your leave request could not be approved. Please reach out to your HR team if you have questions.");
  return sendEmail({
    to: p.to,
    subject: `Leave request ${approved ? "approved" : "rejected"}`,
    html: layout({
      brand,
      accent,
      heading: `Leave ${approved ? "Approved ✓" : "Rejected"}`,
      intro: `Hi ${escapeHtml(p.employeeName || "there")}, here is the decision on your recent leave request.`,
      bodyHtml: body,
    }),
  });
}

export interface PayslipEmailParams {
  to: string;
  employeeName: string;
  month: string;
  year: number | string;
  netPay?: number | null;
  status: "processed" | "paid" | string;
  companyId?: string | null;
  companyName?: string | null;
  pdf?: { filename: string; content: Buffer } | null;
}

export async function sendPayslipEmail(p: PayslipEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const paid = p.status === "paid";
  const rows = [
    { label: "Period", value: `${p.month} ${p.year}` },
    { label: "Status", value: paid ? "Salary Credited" : "Payslip Ready" },
  ];
  if (typeof p.netPay === "number") {
    rows.push({ label: "Net Pay", value: `₹${Number(p.netPay).toLocaleString("en-IN")}` });
  }
  const body =
    detailRows(rows) +
    paragraph(paid
      ? `Your salary for <strong>${escapeHtml(p.month)} ${escapeHtml(p.year)}</strong> has been credited.`
      : `Your payslip for <strong>${escapeHtml(p.month)} ${escapeHtml(p.year)}</strong> is now available. ${p.pdf ? "It is attached to this email and " : ""}you can also view it under My Finance → Payslips.`);
  return sendEmail({
    to: p.to,
    subject: `Payslip for ${p.month} ${p.year}${paid ? " — Salary Credited" : ""}`,
    html: layout({
      brand,
      accent: "#0891b2",
      heading: paid ? "Salary Credited" : "Your Payslip is Ready",
      intro: `Hi ${escapeHtml(p.employeeName || "there")}, ${paid ? "your salary has been paid." : "your latest payslip has been generated."}`,
      bodyHtml: body,
    }),
    attachments: p.pdf ? [{ filename: p.pdf.filename, content: p.pdf.content }] : undefined,
  });
}

export interface KycReminderEmailParams {
  to: string;
  employeeName: string;
  note?: string | null;
  missingItems?: string[];
  companyId?: string | null;
  companyName?: string | null;
}

export async function sendKycReminderEmail(p: KycReminderEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const items = (p.missingItems || []).filter(Boolean);
  const body =
    (items.length
      ? `<tr><td style="padding:0 0 16px;font-size:14px;color:#334155;"><strong>Pending items:</strong><ul style="margin:8px 0 0;padding-left:20px;">${items.map((i) => `<li style="margin:4px 0;">${escapeHtml(i)}</li>`).join("")}</ul></td></tr>`
      : "") +
    (p.note ? paragraph(`<strong>Note from HR:</strong> ${escapeHtml(p.note)}`) : "") +
    paragraph("Please complete your KYC verification so we can finish setting up your profile. Use the AI Assistant in the app to submit your documents.");
  return sendEmail({
    to: p.to,
    subject: "Action required: Complete your KYC verification",
    html: layout({
      brand,
      accent: "#d97706",
      heading: "KYC Verification Reminder",
      intro: `Hi ${escapeHtml(p.employeeName || "there")}, your KYC verification is still incomplete.`,
      bodyHtml: body,
    }),
  });
}

export interface AiFollowUpEmailParams {
  to: string;
  recipientName: string;
  taskLabel: string;
  message: string;
  kind: "employee" | "escalation" | "manager";
  employeeName?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

export async function sendAiFollowUpEmail(p: AiFollowUpEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const headingMap: Record<AiFollowUpEmailParams["kind"], string> = {
    employee: `Reminder: ${p.taskLabel} Pending`,
    escalation: `Escalation: ${p.employeeName || "Employee"} — ${p.taskLabel}`,
    manager: `Manager Alert: ${p.taskLabel} Overdue`,
  };
  const accent = p.kind === "employee" ? "#d97706" : "#dc2626";
  const body = paragraph(escapeHtml(p.message));
  return sendEmail({
    to: p.to,
    subject: headingMap[p.kind],
    html: layout({
      brand,
      accent,
      heading: headingMap[p.kind],
      intro: `Hi ${escapeHtml(p.recipientName || "there")},`,
      bodyHtml: body,
    }),
  });
}

export interface ComplianceReminderEmailParams {
  to: string | string[];
  title: string;
  dueDate?: string | null;
  eventType?: string | null;
  description?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

export async function sendComplianceReminderEmail(p: ComplianceReminderEmailParams): Promise<SendEmailResult> {
  const brand = await resolveBrand(p.companyId, p.companyName);
  const rows = [
    { label: "Event", value: p.title },
    { label: "Type", value: (p.eventType || "Compliance").toUpperCase() },
    { label: "Due Date", value: p.dueDate || "—" },
  ];
  const body =
    detailRows(rows) +
    (p.description ? paragraph(escapeHtml(p.description)) : "") +
    paragraph("Please ensure this compliance obligation is met before the due date.");
  return sendEmail({
    to: p.to,
    subject: `Compliance reminder: ${p.title}${p.dueDate ? ` (due ${p.dueDate})` : ""}`,
    html: layout({
      brand,
      accent: "#7c3aed",
      heading: "Compliance Reminder",
      intro: "A compliance event requires your attention.",
      bodyHtml: body,
    }),
  });
}
