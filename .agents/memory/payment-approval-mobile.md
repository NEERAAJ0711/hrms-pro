---
name: Payment approval (web + mobile)
description: Company-reported payment submissions reviewed by super admin; shared service powers both web (session) and mobile (JWT)
---
Companies report payments (trial-expired wall) → `payment_submissions` table; super admin approves/rejects. Approval atomically credits the company `cd_accounts` and writes a `cd_transactions` ledger row.

**Single source of truth:** the list + approve(credit) logic lives in `server/services/payment-submission-service.ts` (`listPaymentSubmissions`, `reviewPaymentSubmission`, `mapPaymentSubmission`). BOTH surfaces call it:
- Web (session auth): `server/routes/billing-routes.ts` GET `/api/billing/payment-submissions`, PATCH `/api/billing/payment-submission/:id`.
- Mobile (JWT auth): `server/routes/mobile-billing-routes.ts` GET/PATCH `/api/mobile/billing/payment-submission(s)`, gated on `user.role==='super_admin'`.

**Why:** mobile uses JWT (`requireJwtAuth`), web uses session (`requireAuth` = `req.session.userId` only) — they cannot share routes, so the money/credit logic must NOT be duplicated or it will drift. Keep the approve→credit transaction in the service only.

**How to apply:** any change to crediting/ledger behavior goes in the service. The `credited_at IS NULL` atomic claim guarantees credit-exactly-once under concurrent approvals — preserve it. reviewNote is trimmed+clamped to 2000 chars in the service.
