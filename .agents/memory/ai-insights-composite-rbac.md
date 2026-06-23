---
name: AI insights composite RBAC
description: Cross-domain AI insight endpoints/intents must enforce permission on every module they surface, not just one.
---

Any AI insight that composes data from more than one HR module must verify the
caller has access to EVERY module surfaced — at BOTH the HTTP route and the
assistant intent/orchestrator path.

**Why:** A code review rejected Phase 4 twice. First gap: admin insight routes
gated only on `userHasAccess(module)`, but `MODULE_ACCESS` lists `employee` under
attendance/leave, so a plain employee could pull company-wide aggregates (their
`allowedEmployeeIds` is often null = no restriction). Second gap: team insights
(attendance+leave) and executive summary (attendance+leave+payroll) checked only
the intent's single primary `module`, so a user with attendance access but a
revoked leave/payroll permission still read the sibling domain's aggregates.

**How to apply:**
- Routes: explicit role allowlist first (fail closed), THEN `userHasAccess` for
  each surfaced module.
- Intents: declare composite intents in `INTENT_REQUIRED_MODULES` (server/ai/
  intents/context.ts); the orchestrator loops every required module via
  `userHasAccess` (fallback `[detected.module]` for single-module intents in
  RBAC_COVERED_MODULES). `super_admin` bypasses; errors fail closed.
- Keep `INTENT_REQUIRED_MODULES` the source of truth for any NEW cross-domain
  intent, or the bypass regresses.
