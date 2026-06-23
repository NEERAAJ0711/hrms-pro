---
name: AI insights composite RBAC
description: Cross-domain AI insight endpoints/intents must enforce permission on every module they surface, not just one.
---

Any AI insight that composes data from more than one HR module must verify the
caller has access to EVERY module surfaced — at BOTH the HTTP route and the
assistant intent/orchestrator path.

**Why:** Two real gaps caused cross-domain leaks. First: admin insight routes
gated only on `userHasAccess(module)`, but `MODULE_ACCESS` lists `employee` under
attendance/leave, so a plain employee could pull company-wide aggregates (their
`allowedEmployeeIds` is often null = no restriction). Second: team insights
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

**Topic-aware (runtime-classified) gating — Phase 6 copilot:** when ONE endpoint/
intent routes to different engines based on the request content (the HR copilot
classifies a free-text question into a topic, then computes that engine), the
upfront `INTENT_REQUIRED_MODULES` check can only cover a baseline. The modules
actually read depend on the runtime topic (increment→payroll, mobility→employees+
recruitment, leadership→employees+attendance+leave). Fix: `STRATEGY_TOPIC_MODULES`
/ `strategyTopicModules(topic)` in server/ai/workforce/copilot.ts is the single
source of truth; the HTTP route classifies topic BEFORE gating, and the intent
HANDLER (not the orchestrator — it can't know the runtime topic) does its own
fail-closed `userHasAccess` loop over the topic's modules before computing.
Also note composing engines inherit their inputs' modules: the executive/
leadership briefing names individuals so it requires `employees`, not just
attendance/leave. Keep route gate + INTENT_REQUIRED_MODULES + STRATEGY_TOPIC_MODULES
synchronized for any new topic/engine.
