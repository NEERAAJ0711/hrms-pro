# Phase 2 — Enterprise AI Core Integration

The HR Assistant now answers questions and performs a few safe actions using
**live database data only**. It never invents numbers; when data isn't present it
says so plainly. Anything it doesn't recognize as a structured request is passed
to the existing chat assistant (Phase 1) unchanged.

## How it works

```
user message
   │
   ▼
detectIntent ──(no match)──▶ generateAiReply (Phase-1 LLM/rule chat)
   │ (match)
   ▼
authorizeIntent (role table)  +  userHasAccess (per-user revokes, covered modules)
   │ (allowed)
   ▼
team/location scoping (getAllowedEmployeeIdsForUser)
   │
   ▼
handler → live service data → masking → bilingual reply
   │
   ▼
recordUsage (ai_usage_logs) + audit (for actions)
```

Key guarantee: **once an intent is recognized, the answer is deterministic.** A
missing handler or a handler error returns an explicit message — it is never
handed to the LLM, so a recognized query cannot be hallucinated. Only
*unrecognized* messages fall back to the LLM chat.

## Security model

- **RBAC, two gates.** A static role table (`ADMIN_INTENT_ROLES`) is the floor;
  for modules that map to the app's `MODULE_ACCESS` (employees, attendance,
  leave, payroll) the orchestrator also calls `userHasAccess`, so per-user
  permission **revokes** block the AI path exactly as they block the REST API.
- **Company isolation.** Every query is scoped to `actor.companyId`
  (super-admin excepted).
- **Ownership.** Self-service intents require a linked employee; they only ever
  read the requester's own record.
- **Team scoping.** Manager/location-restricted users see only
  `getAllowedEmployeeIdsForUser` — applied to lists *and* to summary counts.
- **Masking.** Aadhaar, PAN, bank, and mobile are masked; salary is shown only
  to the owner or a privileged role.
- **Audit.** Reads are logged to `ai_usage_logs` (intent/module/action/user);
  actions (approve/reject leave) additionally write `auditService` entries.

## What's intentionally honest (no fabrication)

The employees table has no probation / contract-expiry / document-expiry date
fields, so `probation_ending`, `contract_expiry`, and `expiring_documents`
answer honestly rather than guessing.

`company_wise` (cross-company aggregate) is recognized but not implemented yet;
the assistant says so deterministically instead of falling back to the LLM.

## Example commands (English + Hindi)

### Employee self-service
1. show my attendance
2. meri haaziri dikhao
3. my leave balance
4. meri chhutti ka balance batao
5. apply leave from 2 July to 4 July
6. cancel my leave request
7. what is my shift today
8. mera shift kya hai
9. holiday list
10. chhutti ki list dikhao
11. show my latest payslip
12. meri payslip dikhao
13. my PF balance
14. mera PF kitna hai
15. my ESIC details
16. show my KYC status
17. mera KYC status
18. update my phone number to 9876543210
19. update my address
20. show my documents
21. mere documents dikhao
22. my KRA
23. my KPI
24. my appraisal status
25. my reimbursement status
26. show my profile

### HR / admin reads
27. who is absent today
28. aaj kaun absent hai
29. late employees today
30. who is on leave today
31. attendance summary for today
32. employees with missing KYC
33. department wise strength
34. department wise headcount batao
35. gender ratio
36. location wise employee count
37. total employee count
38. kitne employees hain
39. recruitment status
40. pending interviews
41. pending leave approvals
42. lambit chhutti approvals
43. pending onboarding
44. pending resignations
45. pending payroll
46. give me a quick company summary

### Actions
47. find employee by mobile 9876543210
48. find employee with PAN ABCDE1234F
49. approve Rahul's leave
50. reject leave request of Amit Kumar

## Files

- `server/ai/security/masking.ts` — masking + salary visibility
- `server/ai/intents/types.ts` — actor / intent / result types
- `server/ai/intents/detector.ts` — bilingual detection + param extraction
- `server/ai/intents/context.ts` — actor build + role authorization
- `server/ai/intents/handlers/{shared,employee-self,hr-admin,actions}.ts`
- `server/ai/intents/registry.ts` — intent → handler map
- `server/ai/intents/orchestrator.ts` — pipeline entry point
- wired into `server/ai-hr-routes.ts` chat endpoint
- tests: `server/__tests__/ai-intents.test.ts`
