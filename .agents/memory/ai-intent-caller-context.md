---
name: AI intent layer caller context requirement
description: Any new surface (mobile, etc.) calling handleAssistantQuery must build empCtx or self-service answers silently degrade.
---

When wiring a NEW surface (mobile, a job, another route) to the shared AI brain
`handleAssistantQuery` (server/ai/intents), the deterministic self-service intent
handlers (my attendance / leave balance / payslip) read their answers from
`ctx.empCtx` — NOT from a fresh DB query. If you call handleAssistantQuery
without passing `empCtx`, those intents return an honest "no data" instead of the
employee's real figures, even though the data exists.

**Why:** the web route prefetches live data once and threads it through; the
handlers were written to consume that prefetched context, so the data is only as
good as what the caller supplies.

**How to apply:** before calling handleAssistantQuery for an employee, resolve
the employee and build context with the (now exported) module-level helpers in
server/ai-hr-routes.ts: `getEmployeeForUser`, `fetchEmployeeContext`,
`getOrCreateKycStatus`. Pass `{ user, actor, message, employee, empCtx, kyc }`.
Admin-scope intents (find employee, absentees, approve leave) query the DB
themselves and do NOT need empCtx. The actor's `companyId` must come from the
authenticated user (JWT/session), never from the request body, to preserve
tenant isolation.
