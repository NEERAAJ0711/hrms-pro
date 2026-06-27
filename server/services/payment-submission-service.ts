// Shared payment-submission logic: companies report payments (the trial-expired
// wall), a super admin approves or rejects them, and an approval atomically
// credits the company's CD account. Used by BOTH the web billing routes
// (session auth) and the mobile billing routes (JWT auth) so both surfaces act
// on the same data and the sensitive approve→credit transaction lives in
// exactly one place.
import { db } from "../db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export function mapPaymentSubmission(r: any) {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name ?? null,
    amount: r.amount,
    paymentDate: r.payment_date,
    referenceNo: r.reference_no,
    note: r.note,
    status: r.status,
    reviewNote: r.review_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    submittedBy: r.submitted_by,
    createdAt: r.created_at,
  };
}

// All submissions (newest first) with the reporting company's name, for super
// admin review.
export async function listPaymentSubmissions() {
  const rows = await db.execute(sql`
    SELECT ps.*, c.company_name
    FROM payment_submissions ps
    LEFT JOIN companies c ON c.id = ps.company_id
    ORDER BY ps.created_at DESC
  `);
  return rows.rows.map(mapPaymentSubmission);
}

// Approve or reject a submission. Returns null when the submission doesn't
// exist. The whole approve/credit operation runs in one transaction so the
// status change, balance top-up and ledger entry either all commit or none do.
export async function reviewPaymentSubmission(params: {
  id: string;
  status: "approved" | "rejected";
  reviewNote?: string | null;
  reviewerUserId: string;
}) {
  const { id, status, reviewerUserId } = params;
  const reviewNote = typeof params.reviewNote === "string" ? params.reviewNote.trim().slice(0, 2000) : null;
  const now = new Date().toISOString();

  const existing = await db.execute(sql`SELECT id FROM payment_submissions WHERE id = ${id}`);
  if (!existing.rows[0]) return null;

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE payment_submissions
      SET status = ${status}, review_note = ${reviewNote || null}, reviewed_by = ${reviewerUserId}, reviewed_at = ${now}
      WHERE id = ${id}
    `);

    if (status === "approved") {
      // Atomically claim crediting: only the request that flips credited_at
      // from NULL proceeds, so the amount is added to the balance exactly once
      // even under concurrent approvals.
      const claim = await tx.execute(sql`
        UPDATE payment_submissions SET credited_at = ${now}
        WHERE id = ${id} AND credited_at IS NULL
        RETURNING amount, company_id, payment_date, reference_no
      `);
      const c = claim.rows[0] as any;
      if (c && Number(c.amount) > 0) {
        const amt = Number(c.amount);
        await tx.execute(sql`
          INSERT INTO cd_accounts (id, company_id, credit_balance, cost_per_employee_per_day, rate_effective_from, low_balance_threshold, allow_negative, notes, created_at, updated_at)
          VALUES (${randomUUID()}, ${c.company_id}, 0, 15, ${now.slice(0, 10)}, 1000, false, ${"Auto-created on payment approval"}, ${now}, ${now})
          ON CONFLICT (company_id) DO NOTHING
        `);
        const balRow = await tx.execute(sql`
          UPDATE cd_accounts SET credit_balance = credit_balance + ${amt}, updated_at = ${now}
          WHERE company_id = ${c.company_id}
          RETURNING credit_balance
        `);
        const balAfter = (balRow.rows[0] as any)?.credit_balance ?? 0;
        await tx.execute(sql`
          INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
          VALUES (${randomUUID()}, ${c.company_id}, 'credit', ${amt}, ${balAfter},
            ${`Payment approved — ${c.payment_date}`}, ${c.reference_no || null}, ${reviewerUserId}, ${now})
        `);
      }
    }
  });

  const row = await db.execute(sql`SELECT * FROM payment_submissions WHERE id = ${id}`);
  return mapPaymentSubmission(row.rows[0]);
}
