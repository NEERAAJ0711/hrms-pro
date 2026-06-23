# Phase 6 — Enterprise AI Intelligence, Decision Support & Strategic HR Copilot

Phase 6 **extends** (never replaces) the read-only AI platform from Phases 1–5
with explainable **workforce decision-support engines**. Every answer is a set of
**deterministic facts + transparent scoring** computed from the live database;
the LLM is only ever used to *phrase* a narrative over numbers that were already
computed. It never invents a number, a score, a category, or a name, and it never
implies an action was taken — this is strictly decision **support**, not
automation.

## What it does

Nine deterministic engines, one strategic copilot, all surfaced through the
assistant (natural language) and dedicated API endpoints:

1. **Performance Intelligence** — top performers, needs-improvement, department/
   team performance, per-employee summary (from KRA scores + trend).
2. **Promotion Readiness** — readiness score with reasoning + missing
   requirements (performance, tenure, consistency).
3. **Increment Intelligence** — suggested raise range + justification + internal
   parity + confidence. *(Payroll-sensitive.)*
4. **Attrition Risk** — low/medium/high with the drivers behind the rating and a
   suggested intervention (attendance trend, leave burn, performance decline).
5. **Succession Planning** — high-potential bench candidates for critical roles,
   with the reasoning behind each.
6. **Learning & Development** — course / skill / certification recommendations
   from detected gaps and role.
7. **Internal Mobility** — best internal fit for each open job posting + skill
   gaps + readiness. *(Reads recruitment job postings.)*
8. **Organizational Health** — company and per-department health scores with the
   factors driving them and recommended actions.
9. **Executive Decision Support** — a CEO/CHRO leadership briefing that composes
   the engines above into one company-wide read. *(Names individuals.)*
10. **Strategic HR Copilot** — answers free-text strategic questions by routing
    them to the right engine(s) and grounding the answer in deterministic facts.

## Design contract (deterministic facts, AI only phrases)

- Each engine exposes `compute*(signals)` → a `DecisionFacts` object: a list of
  `Decision`s (subject, recommendation, score, category, confidence, **reasons**,
  **supportingData**, **businessImpact**, **risks**, **alternatives**), plus
  `anomalies` and `coverage`.
- The optional `explain*()` layer calls the LLM **only** to phrase an
  `explanation / insights / recommendations` narrative over those exact numbers.
- With **no AI key**, every engine still returns full deterministic facts and a
  readable briefing — the UI shows the figures and notes that AI narration is
  unavailable. With **no data**, engines return an empty decision set + a clear
  "not enough data" note instead of fabricating an answer.

## Security model (same guarantees as Phase 2–4, plus topic-aware gating)

- **Company isolation**: every engine reads through `computeWorkforceSignals`
  scoped to the caller's `companyId`.
- **Role allowlists** (fail-closed): general engines allow Super Admin / Company
  Admin / HR Admin / Manager; salary-sensitive (Increment), leadership
  (Executive), and the Copilot are HR-only.
- **Manager team-scoping**: managers are limited to their own team via
  `allowedEmployeeIds`.
- **Per-user module revokes are honored** through the app's real `userHasAccess`,
  and crucially **composite / topic-aware**:
  - Internal Mobility requires **both** `employees` **and** `recruitment`.
  - The Executive briefing requires `employees` + `attendance` + `leave` (it
    composes employee-derived performance/promotion/succession, incl. names).
  - The **Copilot classifies the question's topic first, then gates on the
    modules that topic actually reads** (e.g. an increment question requires
    `payroll`, a mobility question requires `employees` + `recruitment`). A user
    with a revoked `payroll` or `recruitment` permission cannot reach that data
    through the copilot. The single source of truth is
    `STRATEGY_TOPIC_MODULES` / `strategyTopicModules(topic)`.

## Verify (run from project root)

```bash
# ── Type check (Phase 6 files are clean; pre-existing storage.ts / user-routes.ts
#    errors are unrelated and predate this work) ────────────────────────────────
node_modules/.bin/tsc --noEmit -p tsconfig.json

# ── Tests (node:test + tsx) ──────────────────────────────────────────────────
node_modules/.bin/tsx --test server/__tests__/ai-workforce.test.ts

# ── Full AI suite (no regressions) ───────────────────────────────────────────
for f in ai-intents ai-analytics ai-recruitment ai-extraction ai-workforce; do \
  node_modules/.bin/tsx --test server/__tests__/$f.test.ts; done

# ── Production build (both client + server artifacts emitted) ─────────────────
npm run build
```

## Reused infrastructure (nothing re-created)

- Provider manager, prompt registry, AI cache, logger, usage metrics, output
  masking (Phase 1/2).
- Intent detector + orchestrator + `userHasAccess` / `getAllowedEmployeeIdsForUser`
  RBAC (Phase 2).
- The `explainFacts`-style narrative envelope and `AiResult` shape (Phase 3/4).
- `computeWorkforceSignals` data backbone (employees + attendance + leave + KRA).

## New AI engines (deterministic facts + narrative)

- `server/ai/workforce/signals.ts` — per-employee + per-department signals.
- `server/ai/decision/types.ts` — reusable `Decision` / `DecisionFacts` +
  `score100`, `band`, `confidenceFrom`, `completenessOf`.
- `performance.ts`, `promotion.ts`, `increment.ts`, `attrition.ts`,
  `succession.ts`, `learning.ts`, `mobility.ts`, `health.ts`, `executive.ts`.
- `copilot.ts` — `classifyStrategicTopic`, `computeStrategyFacts`,
  `answerCopilot`, and the topic→module RBAC map.

## API endpoints (`server/routes/workforce-ai-routes.ts`)

All `requireAuth` + company-isolated + RBAC-gated; each returns `{ facts, ai }`
(the copilot also returns `topic`).

- `GET  /api/ai/workforce/performance`
- `GET  /api/ai/workforce/promotion`
- `GET  /api/ai/workforce/increment`   *(HR-only — payroll)*
- `GET  /api/ai/workforce/attrition`
- `GET  /api/ai/workforce/succession`
- `GET  /api/ai/workforce/learning`
- `GET  /api/ai/workforce/mobility`     *(employees + recruitment)*
- `GET  /api/ai/workforce/org-health`
- `GET  /api/ai/workforce/executive`    *(HR-only — employees + attendance + leave)*
- `POST /api/ai/workforce/copilot`      *(HR-only — topic-aware gating)*

## Intent engine wiring

- `server/ai/intents/detector.ts` — Phase 6 matchers. `hr_copilot` is matched
  **first** among Phase 6 intents so explicit copilot/strategy framing wins over
  a topic keyword; the performance matcher only yields to self-appraisal on
  genuine self phrases ("my performance/appraisal/rating/kpi/kra/score").
- `server/ai/intents/context.ts` — role allowlists + `INTENT_REQUIRED_MODULES`
  (composite gates for mobility, leadership, copilot baseline).
- `server/ai/intents/handlers/workforce.ts` — one handler per intent; the copilot
  handler performs a **topic-aware** `userHasAccess` check before computing.

## Frontend surfaces

- `client/src/components/workforce-decision-panel.tsx` — reusable panel that
  consumes the `{ facts, ai }` envelope, renders the AI narrative when available,
  and **always** renders the deterministic decisions (accordion of
  reasons / supporting data / business impact / risks / alternatives), anomalies,
  and coverage — even when the AI key is absent.
- `client/src/components/ui/accordion.tsx` — standard shadcn accordion.
- `client/src/pages/workforce-intelligence.tsx` — `/workforce-intelligence` page
  with 10 tabs (9 engine panels + the Strategic Copilot chat). The copilot view
  always shows the deterministic findings list, regardless of AI availability.
- Registered in `App.tsx`; nav entry (Brain icon) + `workforce_intelligence`
  permission in `app-sidebar.tsx`.

## Example assistant commands (150+)

These are natural-language prompts the assistant routes to Phase 6 engines.
RBAC still applies — an employee gets a polite denial for admin-scoped asks.

### Performance — overview
- show me the top performers
- who are our top performers this quarter
- list the best performing employees
- which employees are top rated
- show high performers in the company
- who is performing the best
- top performers by score
- rank employees by performance
- show me our star performers
- who exceeded their KRAs

### Performance — needs improvement
- who needs performance improvement
- which employees are underperforming
- show me low performers
- who is below the performance bar
- list employees who need coaching
- which employees have a declining performance trend
- who is at risk on performance
- show me the weakest performers
- which employees missed their KRA targets
- who needs a performance improvement plan

### Performance — by team / department
- show performance by department
- which department performs best
- compare team performance
- department wise performance scores
- how is the engineering team performing
- show me the lowest performing department
- team performance breakdown
- which teams are underperforming
- average performance per department
- rank departments by performance

### Promotion readiness
- who is ready for promotion
- which employees should be promoted
- show promotion-ready employees
- who deserves a promotion this cycle
- promotion readiness for the team
- which employees are next in line for promotion
- who is ready to move up
- show me promotion candidates
- list employees ready for the next level
- what is blocking promotions for my team
- why is this employee not promotion-ready
- who has met the promotion criteria

### Increment / compensation (HR-only)
- suggest salary increments
- who deserves a raise
- recommend pay hikes for top performers
- salary increment recommendations
- which employees should get a raise
- suggest a fair increment range
- compensation review suggestions
- who is underpaid relative to peers
- pay parity analysis
- justify an increment for this employee
- plan increments for the team
- appraisal pay recommendations

### Attrition / retention risk
- who is at risk of leaving
- show me attrition risk
- which employees are flight risks
- who might quit soon
- show high attrition-risk employees
- retention risk for my team
- who is likely to resign
- what is driving attrition
- which employees show churn signals
- show me turnover risk
- how do we retain at-risk employees
- why is this employee a flight risk

### Succession planning (HR-only)
- show me the succession plan
- who can replace our managers
- succession candidates for critical roles
- who is on the leadership bench
- backup candidates for key roles
- show me the leadership pipeline
- who are our high-potential employees
- succession readiness for managers
- which roles have no backup
- build a succession bench

### Learning & development
- what training do my employees need
- show learning recommendations
- which skills should we develop
- recommend courses for the team
- who needs upskilling
- skill gap analysis
- development plan for low performers
- what certifications should we pursue
- reskilling recommendations
- learning needs by role

### Internal mobility (employees + recruitment)
- who is the best internal fit for our open roles
- internal mobility candidates
- match employees to open positions
- who can we move into the open manager role
- internal hiring suggestions
- which employees fit the open jobs
- show internal candidates for open roles
- internal transfer recommendations
- best fit for open positions
- can we fill this role internally

### Organizational health
- how healthy is the organization
- show me organizational health
- company health score
- department health breakdown
- which department is least healthy
- engagement and morale overview
- show me the weakest departments
- org health factors
- what is hurting organizational health
- wellbeing overview by team

### Executive / leadership briefing (HR-only)
- give me an executive briefing
- leadership report
- CEO workforce summary
- CHRO briefing
- company-wide workforce strategy
- executive decision summary
- board-level HR overview
- strategic workforce report
- leadership dashboard summary
- workforce strategy briefing

### Strategic copilot (free-text, HR-only)
- what should I do about attrition this quarter
- where are our biggest talent risks
- how do I improve organizational health
- who should we prioritize for promotion
- how should we plan increments this year
- what is our succession risk
- how do we close our skill gaps
- can we fill open roles from within
- what does the workforce data say about morale
- give me a strategy for retaining top performers
- what are the top three workforce priorities
- how is the company doing overall

### Graceful / edge
- (no AI key) show top performers → deterministic facts + "AI narration unavailable"
- (no data month) attrition risk → "not enough data" note, no fabricated risk
- (employee role) who is ready for promotion → polite permission denial
- (payroll revoked) plan increments → copilot denies the increment topic
- (recruitment revoked) internal mobility → denied (composite gate)
- "my performance this quarter" → self-appraisal, not the admin engine
- "my top performers" → admin performance ask (possessive ≠ self)

## Test results

`server/__tests__/ai-workforce.test.ts` — 25 tests, all passing. Covers:
deterministic scoring helpers; each engine's categorization, ordering, and
dedupe; empty-workforce / no-review graceful handling; `classifyStrategicTopic`
routing; Phase 6 intent detection (incl. copilot-wins-over-topic and possessive
"my top performers"); admin-scope RBAC; and the **topic-aware module gates**
(increment→payroll, mobility→employees+recruitment, leadership→employees, plus a
fail-closed default). Full AI suite: 91 tests passing across five files
(`ai-intents` 16, `ai-analytics` 13, `ai-recruitment` 23, `ai-extraction` 14,
`ai-workforce` 25). `npm run build` emits both client and server artifacts.

## Known limitations

- Mobility/skill matching is keyword + role/department affinity, not a learned
  model; treat fit scores as a ranked shortlist, not a verdict.
- Performance signals depend on KRA data being filled; thin data lowers
  confidence (surfaced via the `confidence` field), it does not fabricate.
- The copilot routes to a single primary topic per question; multi-topic
  questions answer on the strongest match.

## Files

- Engines: `server/ai/workforce/*.ts`, `server/ai/decision/types.ts`
- Routes: `server/routes/workforce-ai-routes.ts` (registered in `routes/index.ts`)
- Intents: `server/ai/intents/{detector,context}.ts`,
  `server/ai/intents/handlers/workforce.ts`
- Frontend: `client/src/pages/workforce-intelligence.tsx`,
  `client/src/components/workforce-decision-panel.tsx`,
  `client/src/components/ui/accordion.tsx`, `client/src/App.tsx`,
  `client/src/components/app-sidebar.tsx`
- Tests: `server/__tests__/ai-workforce.test.ts`
