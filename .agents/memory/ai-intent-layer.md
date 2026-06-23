---
name: AI intent layer (Phase 2)
description: Design rules for the deterministic HR-Assistant intent layer — when it falls back to the LLM and how it must enforce RBAC.
---

# AI intent layer — deterministic guarantees

The HR Assistant has a deterministic intent layer (server/ai/intents/) that runs
BEFORE the Phase-1 generateAiReply LLM/rule chat.

## Rule: recognized intents never fall back to the LLM
**The rule:** only an *unrecognized* message (detectIntent returns null) is handed
to generateAiReply. Once an intent is detected — even if its handler is missing
or throws — the orchestrator returns an explicit deterministic message.
**Why:** the product guarantee is "never hallucinate." Falling back to the LLM on
a handler error or unimplemented intent (e.g. company_wise) would let the model
fabricate an answer to a query we already understood.
**How to apply:** in orchestrator.ts, missing-handler and catch branches must
return handled:true with an explicit message, NOT notHandled(). Keep notHandled()
only for the detectIntent===null path.

## Rule: AI path must honor per-user RBAC revokes, not just the role table
**The rule:** authorizeIntent's static role table is the floor. For intents whose
module maps to MODULE_ACCESS (employees, attendance, leave, payroll) the
orchestrator ALSO calls userHasAccess(user, module) so explicit per-user
permission revokes block the AI path exactly as they block the REST API.
**Why:** a static role check alone is a privilege-escalation gap — a user with
role membership but an admin revoke could still read data via the assistant.
**How to apply:** recruitment/self modules have no MODULE_ACCESS row, so they stay
on the role table only (userHasAccess would wrongly fail-closed for them). Only
add a module to the userHasAccess gate if it has a real MODULE_ACCESS entry.

## Rule: scope summary counts, not just lists
Admin summary handlers (e.g. quickSummary) must filter attendance/leave records
by allowedEmployeeIds too, not only the employee list — otherwise a restricted
manager can infer org-wide totals from the counts.
