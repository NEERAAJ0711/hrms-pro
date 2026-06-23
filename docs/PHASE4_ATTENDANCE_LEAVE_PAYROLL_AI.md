# Phase 4 — Attendance, Leave & Payroll AI

Read-only AI intelligence layered on top of the existing Attendance, Leave, and
Payroll modules. It **extends** (never replaces) those modules: every figure is
computed deterministically from the live database, and the LLM is only ever asked
to phrase pre-computed facts in plain language. The AI never invents numbers,
never modifies records, and only ever recommends.

## What it does

- **Attendance intelligence** — deterministic month summary (present / absent /
  half-day / leave / holiday / weekend), attendance-rate %, late/early/
  missing-punch counts, frequent-absentee detection, and anomaly flags, followed
  by a plain-language explanation + insights + recommendations.
- **Leave intelligence** — yearly leave summary by status and type, balance
  explanation, usage patterns, conflict/overlap signals, and anomaly flags, with
  an AI narrative grounded in real leave data.
- **Payroll intelligence** — payslip breakdown (gross vs net, PF / ESIC / PT /
  TDS, earnings/deductions) using the existing statutory rules, plus anomaly
  detection (missing payslip, missing components, negatives, duplicates) and a
  clear, calculation-based explanation.
- **Manager (team) insights** — team-scoped attendance + leave summary, limited
  to the manager's `allowedEmployeeIds`.
- **Executive summary** — company-wide workforce health (headcount, attendance,
  leave, payroll totals) for leadership roles only.
- **Natural-language Q&A** — the assistant routes plain-language asks (English +
  Hindi) to the right deterministic service, then phrases the result.

When **no AI key** is configured, every surface degrades gracefully: the
deterministic facts (key figures + anomalies) are still shown, and the narrative
panel explains that an API key is needed. When there is **no data**, it says so
rather than fabricating.

## Security model (same guarantees as Phase 2 / 3)

- **Auth** — every endpoint requires a session (`requireAuth`).
- **RBAC** — admin intents/endpoints are gated by an explicit role table
  (`ADMIN_INTENT_ROLES` in `context.ts`) **and**, for covered modules, the
  app-wide `userHasAccess(module)` check. Executive summary is restricted to
  `super_admin` / `company_admin` / `hr_admin`.
- **Company isolation** — all aggregates run within `user.companyId`; cross-tenant
  access is refused (super_admin excepted).
- **Manager scoping** — team views use `getAllowedEmployeeIdsForUser` so a manager
  only ever sees their own reports.
- **Composite (cross-domain) checks** — insights that combine domains require
  module access to **every** domain they surface, honoring per-user revokes:
  team insights need attendance **and** leave; the executive summary needs
  attendance **and** leave **and** payroll. Enforced both at the HTTP routes and
  in the assistant via `INTENT_REQUIRED_MODULES` (so a user with one module but a
  revoked sibling module cannot read the other's aggregates through either path).
- **Masking** — payroll explanation is owner-or-payroll-privileged only; the
  existing masking layer (`server/ai/security/masking.ts`) governs any sensitive
  field exposure. The LLM only receives already-computed facts.
- **Read-only** — no endpoint writes attendance, leave, or payroll records.

## Verify (run from project root)

```bash
# ── Type check (no NEW errors from Phase 4; pre-existing storage.ts /
#    upload-security.ts errors are unrelated and predate this work) ────────────
npx tsc --noEmit -p tsconfig.json

# ── Tests (node:test + tsx) ──────────────────────────────────────────────────
node_modules/.bin/tsx --test server/__tests__/ai-analytics.test.ts   # 9 pass
node_modules/.bin/tsx --test server/__tests__/ai-intents.test.ts     # 16 pass (regression)

# ── Production build (both artifacts emitted) ────────────────────────────────
npm run build
ls -la dist/index.cjs dist/public/index.html
```

## Reused infrastructure (nothing re-created)

- Provider manager (OpenAI → Gemini fallback) — `server/ai/providers/`
- Prompt registry — `server/ai/prompts/registry.ts` (5 new analytics prompts)
- AI cache (stable key per facts hash) — `server/ai/cache/`
- Usage metrics — `server/ai/metrics/usage.ts`
- Masking — `server/ai/security/masking.ts`
- Intent engine (detector → context → registry → orchestrator → handlers)
- Existing repositories / services for attendance, leave, payroll (no duplicate
  DB queries; no new tables — Phase 4 is read-only over existing data).

## New AI services (deterministic facts + narrative)

- `server/ai/attendance/service.ts` — `computeAttendanceFacts`, `explainAttendance`
- `server/ai/leave/service.ts` — `computeLeaveFacts`, `explainLeave`
- `server/ai/payroll/service.ts` — `computePayrollFacts`, `explainPayroll`
- `server/ai/insights/service.ts` — `computeManagerInsights`/`explainManagerInsights`,
  `computeExecutiveSummary`/`explainExecutiveSummary`
- `server/ai/analytics/` — shared `types.ts` (envelope + `noKey`/`noData`/`aiError`
  + `Anomaly`), `prompts.ts`, `narrative.ts` (`explainFacts`), `ai-json.ts`.

## API endpoints (`server/routes/analytics-ai-routes.ts`)

Each returns `{ facts, ai }` — `facts` is deterministic and always usable; `ai`
is the (possibly unavailable) narrative envelope.

| Method & path | Scope | Who |
| --- | --- | --- |
| `GET /api/ai/me/attendance?month&year` | self | any linked employee |
| `GET /api/ai/me/leave?year` | self | any linked employee |
| `GET /api/ai/me/payslip?month&year` | self | any linked employee |
| `GET /api/ai/attendance/insights?month&year` | company/team | attendance access |
| `GET /api/ai/leave/insights?year` | company/team | leave access |
| `GET /api/ai/insights/team?month&year` | team | manager+ (attendance access) |
| `GET /api/ai/insights/executive?month&year` | company | super/company/hr admin |
| `GET /api/ai/payroll/explain/:employeeId?month&year` | one employee | owner OR payroll access |

## Intent engine wiring

New intents in `detector.ts` / `registry.ts` / `context.ts`, handled by
`server/ai/intents/handlers/analytics.ts`:

- Self: `explain_my_attendance`, `explain_my_leave`, `explain_my_payslip`
- Admin: `attendance_insights`, `leave_insights`, `team_insights`,
  `executive_summary`

Detector ordering: the self analytics matchers precede the broad `my_*` readers;
the admin analytics matchers precede `attendance_summary` / `quick_summary`. The
existing `my_attendance` matcher was tightened so an analytics ask without "my"
(e.g. "show attendance insights") falls through to the admin matcher.

## Frontend surfaces (no new dashboards)

A single reusable, read-only panel — `client/src/components/ai-insights-panel.tsx`
— renders key figures, colour-coded anomalies, and the AI narrative (explanation
/ insights / recommendations) with graceful fallback. It is embedded into:

- `client/src/pages/my-attendance.tsx` → `/api/ai/me/attendance`
- `client/src/pages/leave.tsx` → `/api/ai/me/leave` (employee) and
  `/api/ai/leave/insights` (admin)
- `client/src/pages/attendance.tsx` → `/api/ai/attendance/insights` (admin)
- `client/src/pages/payroll.tsx` → `/api/ai/insights/executive` (leadership)

## Example assistant commands (~75)

### Attendance — self
1. explain my attendance
2. analyze my attendance
3. break down my attendance this month
4. why is my attendance low
5. meri haaziri samjhao
6. meri attendance ka vishleshan
7. show my attendance trend
8. any anomalies in my attendance
9. explain my attendance for this month
10. how is my attendance

### Attendance — admin / team
11. show attendance insights
12. attendance insights for the company
13. analyze attendance this month
14. attendance anomalies
15. attendance analysis
16. unusual attendance patterns
17. attendance breakdown for the team
18. company attendance intelligence
19. haaziri ka vishleshan
20. attendance trends this month

### Team / manager
21. give me a team briefing
22. team update
23. how is my team doing
24. meri team ka status
25. team status
26. team overview
27. how's my team this month
28. team brief
29. team attendance briefing
30. my team update

### Leave — self
31. explain my leave
32. analyze my leave
33. break down my leave this year
34. why is my leave high
35. meri chhutti samjhao
36. my leave analysis
37. show my leave trend
38. any anomalies in my leave
39. explain my leave balance
40. how is my leave usage

### Leave — admin
41. show leave insights
42. leave analysis for the company
43. leave anomalies
44. analyze leave this year
45. unusual leave patterns
46. leave breakdown
47. company leave intelligence
48. chhutti ka vishleshan
49. leave trends
50. leave insights for the team

### Payroll — self
51. explain my payslip
52. explain my salary
53. break down my salary
54. why is my net pay this amount
55. explain my pf deduction
56. explain my esic
57. explain my tds
58. mera vetan samjhao
59. salary slip explanation
60. payslip breakdown

### Payroll / executive
61. executive summary
62. leadership summary
63. company health
64. workforce health
65. org health overview
66. executive report
67. leadership brief
68. management overview
69. company health for leadership
70. executive dashboard summary

### Graceful / edge
71. explain my attendance (no AI key → facts only + notice)
72. explain my payslip (no payslip → "no payslip for this period")
73. attendance insights (employee → access denied)
74. executive summary (manager → access denied)
75. explain my leave (no employee link → asks to link profile)

## Test results

- `server/__tests__/ai-analytics.test.ts` — **9/9 pass** (self + admin intent
  detection, RBAC gate per role, company-context requirement, graceful helpers).
- `server/__tests__/ai-intents.test.ts` — **16/16 pass** (no regression).
- `npx tsc --noEmit` — no new errors from Phase 4 files (pre-existing
  `server/storage.ts` / `server/upload-security.ts` errors are unrelated).
- `npm run build` — both `dist/index.cjs` and `dist/public/index.html` emitted.

## Known limitations

- AI narrative quality depends on a configured key (OpenAI or Gemini); without
  one, only deterministic facts + anomalies are shown.
- Forecasting is simple history-based summarization, not predictive modelling
  (predictive analytics is explicitly out of scope).
- Super-admins without a company context cannot view company-wide aggregates
  (by design — they must operate within a company).

## Future work

- Department-level drill-down panels and period-over-period comparison.
- Configurable anomaly thresholds per company policy.
- Caching/precompute of executive summaries for very large headcounts.

## Files

- `server/ai/analytics/{types,prompts,narrative,ai-json}.ts`
- `server/ai/{attendance,leave,payroll,insights}/service.ts`
- `server/ai/intents/handlers/analytics.ts`
- `server/ai/intents/{detector,registry,context}.ts` (wiring)
- `server/ai/config.ts` (analytics AiFeature values + temperatures/maxTokens)
- `server/ai/index.ts` (barrel exports)
- `server/routes/analytics-ai-routes.ts` (+ registration in `server/routes/index.ts`)
- `client/src/components/ai-insights-panel.tsx`
- `client/src/pages/{my-attendance,attendance,leave,payroll}.tsx`
- `server/__tests__/ai-analytics.test.ts`
