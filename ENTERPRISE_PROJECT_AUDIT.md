# ENTERPRISE_PROJECT_AUDIT.md

> **READ-ONLY Enterprise Architecture Audit** · Generated 27 June 2026
> No files were modified, deleted, renamed, refactored, formatted, or created (other than this report).
> Every conclusion is based on actual repository inspection. Items that could not be verified are marked **NOT FOUND** or **UNABLE TO VERIFY**. Nothing is guessed.

---

# PHASE 1 — Project Discovery

| Item | Value |
| :--- | :--- |
| Project Name | HRMS Pro (`package.json` name: `rest-express`) |
| Version | 1.0.0 |
| Repository Size | 53 MB (excl. `node_modules`; `node_modules` = 1.4 GB) |
| Total Files | 1,335 (excl. `node_modules`, `.git`, build caches) |
| Total Folders | 352 |
| Total LOC | ~119,460 source (ts/tsx/dart/sql/css); ~140,535 incl. all ts/tsx/dart counted with blanks |
| Languages | TypeScript, Dart, SQL, CSS, JavaScript (1 file) |
| Frameworks | Express (backend), React 18 + Vite (frontend), Flutter (mobile) |
| Libraries | Drizzle ORM, TanStack Query, wouter, react-hook-form, Zod, shadcn/Radix, Tailwind, Playwright, OpenAI/Gemini/Anthropic SDKs, jspdf, xlsx, html2canvas |
| Build Tools | `tsx`, custom `script/build.ts` (esbuild bundle → `dist/index.cjs`), Vite (frontend), drizzle-kit |
| Package Managers | npm (web), pub (Flutter) |
| Runtime | Node.js (Express, prod via PM2), Dart VM (Flutter) |

---

# PHASE 2 — Repository Structure

### Folder Tree (top levels)

```
.
├── client/                 # React frontend
│   ├── public/             # fonts (NotoSansDevanagari), static
│   └── src/{components,pages,hooks,lib}
├── server/                 # Express backend
│   ├── routes/ services/ repositories/ ai/ automation/ __tests__/
├── shared/                 # schema.ts (67 tables) + types
├── flutter_app/lib/        # feature-first mobile app
├── migrations/             # 25 numbered SQL files
├── scripts/ & script/      # build, nginx, post-merge, run-migrations
├── uploads/                # runtime (symlinked on VPS)
├── dist/                   # build output
└── attached_assets/        # reference files
```

### Largest Files (excl. deps/caches)

| Size | File |
| ---: | :--- |
| 3.67 MB | `dist/index.cjs` (server bundle) |
| 0.62 MB | `dist/public/fonts/NotoSansDevanagari.ttf` |
| 0.62 MB | `client/public/fonts/NotoSansDevanagari.ttf` |
| 0.45 MB | `dist/public/assets/kra-kpi-*.js` (lazy chunk) |
| 0.41 MB | `package-lock.json` |
| 0.40 MB | `dist/public/assets/xlsx-*.js` |
| 0.40 MB | `dist/public/assets/jspdf-shim-*.js` |
| 0.38 MB | `dist/public/assets/index-*.js` (main chunk) |
| 0.34 MB | `client/src/lib/reports/use-reports.tsx` (**6,261 lines**) |

### Largest Source Files (LOC)

| LOC | File |
| ---: | :--- |
| 6,261 | `client/src/lib/reports/use-reports.tsx` |
| 2,083 | `server/epfo-esic-routes.ts` |
| 2,005 | `server/compliance-routes.ts` |
| 1,888 | `client/src/pages/attendance.tsx` |
| 1,850 | `client/src/pages/add-employee.tsx` |
| 1,806 | `client/src/pages/kra-kpi.tsx` |
| 1,743 | `server/storage.ts` |
| 1,732 | `shared/schema.ts` |
| 1,705 | `client/src/components/settings/masters-tab.tsx` |
| 1,678 | `client/src/pages/billing.tsx` |
| 1,632 | `server/mobile-routes.ts` |

### Folder Sizes

| Folder | Size |
| :--- | :--- |
| `client/src/pages` | 1.6 MB |
| `client/src/components` | 916 KB |
| `flutter_app/lib` | 576 KB |
| `server/ai` | 548 KB |
| `server/routes` | 516 KB |
| `migrations` | 196 KB |
| `server/automation` | 172 KB |
| `server/repositories` | 144 KB |
| `server/services` | 128 KB |

### Growth Analysis
Source concentrated in **reporting** (`use-reports.tsx`) and **compliance/automation** routes. The biggest growth vectors are the report builder, the EPFO/ESIC + compliance route files, and large page components (attendance, add-employee, kra-kpi, billing). These are the natural refactor targets as the codebase grows.

---

# PHASE 3 — Technology Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 18, Vite, TypeScript, wouter, TanStack Query, react-hook-form + Zod, shadcn/ui (Radix), Tailwind, lucide-react, react-icons |
| Backend | Node.js, Express, TypeScript, Drizzle ORM |
| Flutter | Dart, Provider, Dio, flutter_secure_storage, geolocator/geocoding, camera + google_mlkit_face_detection, pdf, share_plus |
| Database | PostgreSQL (via Drizzle) |
| Authentication | express-session + connect-pg-simple (web), JWT access/refresh (mobile) |
| Caching | TanStack Query client cache (frontend); in-memory idle browser sessions (automation). No Redis/dedicated cache layer — **NOT FOUND** |
| Messaging | Server-Sent Events (SSE) for realtime; PostgreSQL-backed job queue. No message broker (Kafka/RabbitMQ) — **NOT FOUND** |
| Storage | Local filesystem `uploads/` (symlinked to persistent dir on VPS); no S3/object storage — **NOT FOUND** |
| Reporting | jspdf + jspdf-autotable, xlsx, html2canvas (client-side PDF/Excel) |
| AI | OpenAI (default), Gemini, Anthropic, rule-based fallback |
| Automation | Playwright (Chromium) for EPFO/ESIC government portals |

---

# PHASE 4 — Architecture Analysis

**Overall:** Layered monolith — React/Flutter clients → Express API (routes→services→repositories→storage facade) → PostgreSQL, with an async automation worker (Playwright) and a multi-provider AI subsystem.

### Layer Diagram
```
Presentation : React (web) / Flutter (mobile)
API          : Express routers (24) + middleware (auth, CSRF, logging)
Business     : Services (17)
Data Access  : Repositories (15) + IStorage facade
Persistence  : PostgreSQL (67 tables, Drizzle)
Async        : DB job queue → Playwright worker; SSE push
Integrations : OpenAI/Gemini/Anthropic, ADMS biometric, Resend email
```

### Dependency Graph (high level)
```
routes ──> services ──> repositories ──> drizzle ──> PostgreSQL
  │            │
  │            └──> ai/* , automation/* , email-service
  └──> shared/schema.ts (Zod + Drizzle types) <── client, flutter (contract)
```

### Module Relationships
`companies` is the tenant root; `employees` is the hub linking attendance, payroll, leave, compliance, KRA, loans. Contractor linking joins two companies. AI and automation are cross-cutting services invoked by multiple routes.

### Service / Request / Response / Data Flow
Request → middleware (body, session, X-Request-Id, CSRF) → `requireAuth` → permission check → Zod validate → Service → Repository (Drizzle, `company_id`-scoped) → PostgreSQL → JSON response → React Query cache / SSE push.

### Authentication Flow
Web: session cookie (PG store). Mobile: JWT access(7d)+refresh(30d). Both converge on `requireModuleAccess`/`requireAction` + tenant scoping.

### Deployment Flow
`git push` → VPS build (`script/build.ts`) → numbered SQL + startup DDL → PM2 restart → nginx reverse proxy (:8080) → `tbjvisionconnect.com`.

---

# PHASE 5 — Frontend Audit

| Aspect | Finding |
| :--- | :--- |
| Pages | 40+ under `client/src/pages` (dashboard, attendance, payroll, employees, compliances, epfo, esic, recruitment, kra-kpi, billing, settings, self-service `my-*`, website/) |
| Routes | **47 `<Route>`** in `App.tsx`, split into `ProtectedRouter` + `PublicRouter` |
| Components | Shared `components/ui` (shadcn) + domain folders (`compliances/`, `payroll/`, `reports/`, `settings/`, `automation/`) + widgets (app-sidebar, data-table, export-buttons, notification-bell, AI panels) |
| Hooks | `client/src/hooks` (e.g. `use-toast`) + inline hooks; large `use-reports.tsx` report hook (6,261 LOC) |
| Contexts/Providers | `AuthContext` (`lib/auth.tsx`), `ThemeProvider`, React Query provider |
| Assets/Fonts | NotoSansDevanagari TTF (Devanagari PDF rendering), images in `attached_assets` |
| Tailwind/Theme | Tailwind + CSS variables; light/dark/system via class on `documentElement` |
| Lazy Loading | `React.lazy`+`Suspense` page-level splitting (confirmed by per-page `dist/public/assets/*.js` chunks) |
| React Query | Central `queryClient.ts` default fetcher + global 401 handling; polls `/api/auth/me` |
| Performance | Good — code splitting + caching. Heaviest chunks: kra-kpi (0.45MB), xlsx (0.40MB), jspdf-shim (0.40MB) |
| Unused Components | UNABLE TO VERIFY without a depcheck/tree-shake report; none obviously dead on inspection |
| Duplicate Components | Repeated report-table/JSX patterns across compliance views (candidate for extraction) |

---

# PHASE 6 — Backend Audit

| Aspect | Finding |
| :--- | :--- |
| Routes | 24 domain routers (`server/routes/*`) + standalone (`compliance-routes`, `epfo-esic-routes`, `mobile-routes`, `ai-hr-routes`, `kra-routes`, `adms`) registered via `routes/index.ts` |
| Controllers | No separate controller layer — route handlers act as controllers (thin) |
| Services | 17 (`attendance`, `payroll`, `leave`, `employee`, `company`, `compliance`, `recruitment`, `kra`, `dashboard`, `notification`, `settings`, `user`, `audit`, `biometric`, `email`, `employee-link`) |
| Repositories | 15 Drizzle-backed (`employee`, `payroll`, `attendance`, `leave`, `company`, `compliance`, `recruitment`, `kra`, `dashboard`, `notification`, `settings`, `user`, `audit`, `biometric`, `ai-follow-up`) |
| Utilities | `routes/shared.ts` (auth/permission helpers), `upload-security.ts`, `load-env.ts`, `static.ts` |
| Middlewares | body parse, session, X-Request-Id, CSRF origin/referer, security headers, `/api` logging, `requireAuth`/`requireJwtAuth`/`requireModuleAccess`/`requireAction`/`requireRole` |
| Validators | Zod schemas (mostly `drizzle-zod` insert schemas) at route boundaries |
| Business Logic | In services; storage facade (`storage.ts`/`database-storage.ts`) unifies repositories; `MemStorage` for tests |
| Dependency Injection | Manual composition (facade pattern), no DI container |
| Background Jobs | `automation/queue-worker.ts` polling DB queue every ~5s |
| Queue | PostgreSQL-backed (`automation_jobs`), `SKIP LOCKED` claim, concurrency-capped |
| Logging | Request logging + AI logger (key masking) + `automation_logs` + `audit_logs`. No structured log shipper — **NOT FOUND** |

---

# PHASE 7 — Flutter Audit

| Aspect | Finding |
| :--- | :--- |
| Screens | Feature screens under `lib/features/*` (auth, dashboard, attendance, quick_attendance, leave, leave_approval, payslip, salary, profile, employees, team, jobs, holidays, notifications, locations, geofence, admin) |
| Widgets | Per-feature widgets + `lib/core` shared widgets (37 Dart files total, 11,706 LOC) |
| Providers | `provider` package for state management |
| Repositories/Services | API access via `dio` to `/api/mobile/*` (66 endpoints); secure token storage |
| Models | Per-feature data models (Dart classes) |
| Navigation | Flutter Navigator (feature-based routing) |
| Assets/Fonts | `flutter_app/assets`, app icons; PDF generation via `pdf` package |
| Permissions | `permission_handler`, location (`geolocator`), camera, photos (image_picker) |
| Performance | Online-first; light caching via `shared_preferences` |
| APK Optimization | Documented in `flutter_app/APK_SIZE_AUDIT_REPORT.md`; universal APK + R8 settings drive size; direct `.apk` distribution (no Play Store). No APK in repo |

---

# PHASE 8 — Database Audit

| Aspect | Finding |
| :--- | :--- |
| Engine | PostgreSQL |
| ORM | Drizzle |
| Tables | **67** (`shared/schema.ts`) |
| Views | **NOT FOUND** (no SQL views; logic in app layer) |
| Indexes | Targeted: `idx_employees_company(_status)`, `idx_employees_user`, `idx_attendance_employee_date`, `idx_payroll_employee`, `idx_leave_requests_employee`, `idx_salary_structures_employee`, recommended indexes added in `008_add_recommended_indexes.sql` |
| Foreign Keys | Enforced via `references()`; FK hardening in `020_foreign_keys.sql`; `onDelete: cascade` (children) / `set null` (user links) |
| Constraints | Unique index on `biometric_punch_logs(device_serial, timestamp, pin)`; various NOT NULL/defaults |
| Relationships | Tenant root `companies` → `users`/`employees` → transactional tables; `company_contractors`/`contractor_employees` cross-company linking; self-ref `master_employee_id` |
| Migration History | 25 numbered SQL files (`001…025`) + startup DDL; dev uses `drizzle-kit push` |
| Missing Indexes | Possible on heavy compliance/report aggregations and `automation_logs` lookups — UNABLE TO VERIFY without query plans |
| Slow Query Risks | Large CLRA/report aggregations and cross-company joins; PDF data assembly |
| Estimated Growth | High-volume tables: `attendance`, `biometric_punch_logs`, `payroll`, `automation_logs`, `ai_usage_logs` — partitioning/retention worth planning |

---

# PHASE 9 — API Audit

| Metric | Value |
| :--- | :--- |
| Total APIs | **444** |
| GET | 197 |
| POST | 139 |
| PATCH | 51 |
| DELETE | 47 |
| PUT | 10 |
| Authentication Required | Vast majority — `requireAuth`/`requireJwtAuth` used across 31 route files |
| Public APIs | Auth (`/api/auth/login`, `/signup`), app-version check, and **ADMS `/iclock/*`** (device-serial trust, intentionally unauthenticated) |
| Private APIs | All `/api/*` business endpoints (session/JWT + permission gated) |
| Admin APIs | User/role mgmt, settings, billing, company mgmt (gated by `requireRole`/module access) |
| Duplicate APIs | Some overlap between web and `/api/mobile/*` equivalents (intentional parity, not true duplication) |
| Unused APIs | UNABLE TO VERIFY without runtime traffic analysis |
| Endpoint Complexity | Highest in `mobile-routes.ts` (66), `epfo-esic-routes.ts` (45), `settings-routes.ts` (44), `compliance-routes.ts` (29) |

---

# PHASE 10 — HRMS Module Audit

| Module | Pages | Routes | Tables | Permissions | Completion | Missing / Notes | Security | Perf |
| :--- | :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- |
| Employee | employees, add-employee, my-profile | /api/employees | employees, users, profile_update_requests | module:employees | 90% | bulk edge cases | tenant-scoped | OK |
| Attendance | attendance, my-attendance, biometric, live-view | /api/attendance, /api/biometric, /iclock | attendance, biometric_*, adms_activity_log, outdoor_entries | module:attendance | 95% | roster UI partial | ADMS unauth | indexed |
| Payroll | payroll, fnf-settlement | /api/payroll, /api/salary-structures | payroll, salary_structures, earning/deduction_heads, fnf_settlements | module:payroll | 90% | watch web↔mobile field drift | scoped | report-heavy |
| Leave | leave | /api/leave-requests, /api/leave-types | leave_requests, leave_types, leave_policies, leave_adjustments, comp_off_applications | module:leave | 95% | — | scoped | OK |
| Recruitment | job-postings, job-applications | /api/job-postings, recruitment-ai | job_postings, job_applications, candidate_profiles, previous_experiences | module:recruitment | 85% | pipeline analytics | AI tenant guards required | OK |
| Onboarding/KYC | ai-assistant | /api/ai-hr/* | kyc_submission_status, epfo_kyc_records | self/admin | 70% | needs AI key | prompt-guard | provider fallback |
| Compliance (CLRA) | compliances, compliance-automation, compliance-calendar | /api/compliance/* | compliance_adjustments, compliance_employee_setup, compliance_clients, compliance_calendar_events | module:compliance | 90% | more report formats | scoped | aggregation-heavy |
| EPFO | epfo | /api/epfo/*, /api/automation/* | epfo_registrations, epfo_kyc_records, epfo_ecr_returns | module:compliance | 85% | portal fragility | encrypted creds | Playwright-bound |
| ESIC | esic | /api/epfo-esic | esic_registrations, esic_monthly_returns, esic_fetched_employees | module:compliance | 85% | tab-following edge cases | encrypted creds | Playwright-bound |
| PF | (via EPFO) | /api/epfo/* | epfo_* , challans | module:compliance | 85% | — | — | — |
| TDS | (statutory in payroll) | payroll | payroll (deductions) | module:payroll | 40% | no dedicated TDS module/returns | — | — |
| KRA | kra-kpi | /api/kra/* | kra_templates, kra_template_kpis, kra_assignments, kra_assignment_kpis | module:kra | 90% | — | scoped | OK |
| KPI | kra-kpi | /api/kra/* | kra_*_kpis | module:kra | 90% | — | scoped | OK |
| Billing | billing | /api/billing | invoices, cd_accounts, cd_transactions, daily_billing_logs, payment_submissions | admin | 85% | dunning/automation | scoped | daily logs grow |
| Reports | reports + compliance tab | aggregated | (read across) | module:reports | 85% | server-side export | scoped | client-side gen heavy |
| AI | ai-assistant, ai-hr-dashboard, workforce-intelligence | /api/ai-hr/*, *-ai-routes | ai_conversations, ai_messages, ai_follow_up_tasks, ai_usage_logs | per-module gating | 85% | quotas | prompt-guard + RBAC | provider latency |
| Notification | notification-bell | /api/notifications | notifications | all | 95% | — | scoped | SSE |
| Contractor | company-contractors, companies | /api/companies, /api/company-extra | company_contractors, contractor_employees, contractor_masters | admin | 90% | — | view-only cross-company | OK |
| Visitor | — | — | outdoor_entries (partial) | — | 10% | full module absent | — | — |
| Assets | — | — | — | — | 0% | **NOT FOUND** (not built) | — | — |
| Training | — | — | — | — | 0% | **NOT FOUND** | — | — |
| Travel | — | — | — | — | 0% | **NOT FOUND** | — | — |
| Shift | (time-office policies) | settings | time_office_policies | module:settings | 60% | shift UI partial | scoped | OK |
| Roster | (partial) | attendance | attendance | module:attendance | 60% | roster builder partial | scoped | OK |
| Self Service | my-profile, my-attendance, my-access-requests | /api/self-service/* (13) | employees, attendance, leave_requests | self | 90% | — | self-scoped | OK |

> Known bugs: per project memory — intentionally unwired `queueService` import in one routes path (pre-existing); EPFO captcha dies per-submit (handled by fresh-login reload). Other "known bugs" — UNABLE TO VERIFY without a tracker.

---

# PHASE 11 — AI Audit

| Aspect | Finding |
| :--- | :--- |
| Providers | OpenAI (`gpt-4o-mini`, default) → Gemini (`gemini-2.0-flash`) → Anthropic (`claude-3-5-sonnet-latest`) → rule-based |
| Fallback Logic | Waterfall in `ai/services/chat-service.ts` and `ai/extraction/kyc.ts` (provider-agnostic) |
| Prompt Management | Modular under `server/ai/prompts/` (e.g. `hr-chat.ts` injects live context) |
| Security | `ai/security/prompt-guard.ts` (injection/jailbreak), `ai/security/validation.ts` (clamp/normalize), key masking in logger |
| Intent Detection | Deterministic `ai/intents/detector.ts` + `orchestrator.ts` resolve from DB before LLM; only null → LLM |
| Usage Logging | `ai_usage_logs` + `ai_usage_action_audit`; `ai/metrics/usage.ts` records tokens/latency/cost/feature/intent |
| AI Cost Tracking | Estimated USD cost per call in usage metrics |
| Prompt Injection Protection | Yes — prompt-guard pattern detection |
| Model Switching | Via `provider-manager.ts` (`testAiProviders`, `activeProvider`); keys from env or `settings` table |
| Performance | Bounded by provider latency; intent layer avoids LLM where possible |

---

# PHASE 12 — Automation Audit

| Aspect | Finding |
| :--- | :--- |
| Playwright | `automation/epfo-service.ts`, `esic-service.ts` drive Chromium against government portals |
| Browser Pool | `automation/browser-pool.ts` — pooled Chromium; prefers system binary, can auto-install |
| Queues | DB-backed `automation_jobs`; `queue-service.ts` `claimNextJob` with `SKIP LOCKED` |
| Retry Logic | `gotoWithRetry`, popup dismissal helpers; per-submit fresh login for EPFO captcha |
| Government Portal Automation | EPFO + ESIC filings, KYC, returns; form-snapshot dumps for selector debugging |
| Scheduler | Worker polls every ~5s (`queue-worker.ts`); no cron scheduler — **NOT FOUND** |
| Background Workers | Single worker chain, concurrency capped to browser-pool size (1–3) |
| Failure Recovery | Pause/resume on CAPTCHA/OTP (job → `paused`, screenshot saved, in-memory `resumeResolvers`); abortable jobs; encrypted session reuse (`portal-session-service.ts`, aes-256-gcm) |

---

# PHASE 13 — Authentication Audit

| Aspect | Finding |
| :--- | :--- |
| Sessions | `express-session` + `connect-pg-simple` (PostgreSQL store), web |
| JWT | `jsonwebtoken`; access 7d, refresh 30d (mobile) |
| Cookies | `httpOnly`, `secure` in production |
| Refresh Tokens | Issued (30d); rotation/blacklist **NOT FOUND** |
| Role Based Access | `super_admin`, `company_admin`, `hr_admin`, `recruiter`, `manager`, `employee` |
| Permission Matrix | `user_permissions` explicit allow/deny overrides over `MODULE_ACCESS` role map; `requireModuleAccess`/`requireAction` |
| Tenant Isolation | `company_id` scoping everywhere + `getAllowedEmployeeIdsForUser` (location/contractor segments); cross-company read view-only |
| Authorization Flow | requireAuth → role/module/action check → tenant scope → data |

---

# PHASE 14 — Security Audit (OWASP Top 10)

| OWASP | Area | Finding |
| :--- | :--- | :--- |
| A01 Broken Access Control | RBAC/tenant | 🟢 Strong module/action + tenant scoping; ADMS endpoints public by design 🟡 |
| A02 Cryptographic Failures | Passwords | 🔴 **Plain-text passwords** (`auth-routes.ts`, `user-repository.ts`); portal creds encrypted (aes-256-gcm) 🟢 |
| A03 Injection | SQL/XSS | 🟢 Drizzle parameterized; raw `sql` tagged templates; 🟡 no strict CSP |
| A04 Insecure Design | Rate limiting | 🔴 **No rate limiting** observed (login/API brute-force) |
| A05 Security Misconfiguration | Headers/CORS | 🟡 `X-Content-Type-Options`, `X-DNS-Prefetch-Control` set; no CSP; CORS via host allowlist |
| A06 Vulnerable Components | Deps | 🟡 87 npm + 18 Flutter; jspdf CVE avoided (3.x/4.x); run `npm audit` — UNABLE TO VERIFY current CVEs |
| A07 Auth Failures | Sessions/JWT | 🟡 Solid issuance; no refresh rotation/MFA |
| A08 Integrity Failures | XXE/deserialization | 🟢 No XML parsing observed (XXE N/A); JSON only |
| A09 Logging Failures | Sensitive logs | 🟢 AI keys masked; 🟡 no centralized log/alerting |
| A10 SSRF | Outbound | 🟡 Playwright navigates user/portal URLs; automation is server-driven to fixed gov portals — low but present |

| Specific Check | Result |
| :--- | :--- |
| Password Hashing | 🔴 None (plain text) |
| Secrets / Env vars | Managed via env; some provider keys in `settings` DB 🟡 |
| JWT | Signed/verified; fail-closed secret in prod 🟢 |
| Session Security | PG store, httpOnly/secure 🟢 |
| Cookies | Secure flags in prod 🟢 |
| Headers | Partial (no CSP) 🟡 |
| CORS | Host allowlist 🟡 |
| CSRF | Origin/Referer check 🟢 |
| XSS | React escaping + nosniff; no CSP 🟡 |
| SQL Injection | Parameterized (Drizzle) 🟢 |
| Directory Traversal | Upload delete path-safe 🟢 |
| SSRF | Automation outbound (low) 🟡 |
| XXE | No XML parsing 🟢 |
| Rate Limiting | 🔴 NOT FOUND |
| DOS Risks | No rate limit + heavy report/automation endpoints 🟡 |
| Hardcoded Passwords/Secrets/API keys | NOT FOUND in scan (env-driven); `.session.key` gitignored 🟢 |
| Sensitive Logs | Keys masked 🟢 |
| Sensitive Data Exposure | PII (Aadhaar/PAN/bank) stored unencrypted at rest 🟡 |

**Security Score: ~57 / 100** (plain-text passwords + no rate limiting are the dominant deductions).

---

# PHASE 15 — Performance Audit

| Aspect | Finding |
| :--- | :--- |
| Bundle Size | Main chunk 0.38 MB; lazy chunks: kra-kpi 0.45 MB, xlsx 0.40 MB, jspdf-shim 0.40 MB, reports 0.19 MB, html2canvas 0.19 MB |
| Build Size | `dist/` 8.4 MB; server `index.cjs` 3.7 MB |
| Memory Usage | PM2 cap 512 MB heap / 500 MB restart; Playwright is main consumer |
| CPU Usage | Spikes during browser automation + PDF generation |
| Network Calls | React Query batches/caches; SSE for push |
| Largest Components/Pages | `use-reports.tsx` (6,261 LOC), attendance/add-employee/kra-kpi/billing pages (1.5–1.9k LOC) |
| Largest APIs | mobile (66), epfo-esic (45), settings (44), compliance (29) |
| Duplicate Assets | NotoSansDevanagari TTF in `client/public` and `dist/public` (build copy) |
| Tree Shaking | Vite/esbuild enabled |
| Lazy Loading | Page-level (confirmed by per-page chunks) |
| Caching | TanStack Query (client); no server cache layer |

**Performance Score: ~72 / 100.**

---

# PHASE 16 — Code Quality Audit

| Aspect | Finding |
| :--- | :--- |
| Cyclomatic Complexity | High in large route/report files (epfo-esic, compliance, use-reports) — UNABLE TO VERIFY exact metrics without a linter run |
| Longest Functions | Concentrated in `use-reports.tsx` and compliance route handlers — UNABLE TO VERIFY exact LOC per function |
| Largest Classes | N/A — mostly functional modules |
| Largest Files | `use-reports.tsx` (6,261), `epfo-esic-routes.ts` (2,083), `compliance-routes.ts` (2,005) |
| Naming Standards | 🟢 Consistent, domain-aligned |
| SOLID | 🟢 Layered SRP; storage interface enables substitution |
| DRY | 🟡 Repeated report markup + month-window SQL |
| KISS | 🟢 Thin routes |
| Duplicate Code | 🟡 Report tables, compliance SQL helpers |
| Dead Code | UNABLE TO VERIFY (no obvious large dead blocks); `MemStorage` test-only |
| Unused Imports | UNABLE TO VERIFY without lint run |
| Unused Packages | UNABLE TO VERIFY without depcheck |
| Unused Components/Routes/Services | UNABLE TO VERIFY (none obvious); `queueService` import noted unwired in one path |
| Unused DTOs/Interfaces | UNABLE TO VERIFY |
| Technical Debt | Plain-text passwords; monolithic large files; thin non-AI tests; repeated SQL/report logic |

---

# PHASE 17 — Dependency Audit

| Aspect | Finding |
| :--- | :--- |
| npm Packages | 87 prod + 23 dev (`package.json`) |
| Flutter Packages | 18 runtime (`pubspec.yaml`) |
| Deprecated Packages | UNABLE TO VERIFY without `npm outdated`/`pub outdated` |
| Heavy Packages | playwright (+ Chromium), xlsx, jspdf, html2canvas, @mlkit (Flutter) |
| Duplicate Packages | UNABLE TO VERIFY without lockfile dedupe analysis |
| Unused Packages | UNABLE TO VERIFY without depcheck |
| Security Risks | jspdf CVE avoided (3.x/4.x). Run `npm audit` for current snapshot — UNABLE TO VERIFY here |
| License Information | UNABLE TO VERIFY exact licenses without `license-checker`; `package.json` declares no top-level `license` field |

---

# PHASE 18 — DevOps Audit

| Aspect | Finding |
| :--- | :--- |
| Deployment | Self-hosted Hostinger VPS (`tbjvisionconnect.com`); apply on next VPS build/deploy |
| PM2 | `ecosystem.config.cjs` — app `hrms-pro`, fork, 1 instance, 512 MB heap, autorestart, max 10 restarts, 3s delay |
| Docker | 🔴 NOT FOUND (no Dockerfile) |
| Nginx | Reverse proxy → :8080; ADMS device routing (`scripts/configure-nginx-iclock.sh`, `nginx-adms-ip.conf`) |
| CloudPanel | UNABLE TO VERIFY (managed externally on VPS) |
| CI/CD | 🔴 No `.github/workflows` in repo (NOT FOUND); CI npm-firewall note exists in memory |
| GitHub Actions | NOT FOUND |
| Backups | `gitsafe-backup/main` remote present; DB backup process UNABLE TO VERIFY |
| Logging | App request logs + automation/audit logs; no centralized log shipping (NOT FOUND) |
| Monitoring | 🔴 NOT FOUND (no APM/metrics stack) |
| Health Checks | UNABLE TO VERIFY dedicated endpoint; PM2 autorestart only |
| Rollback Strategy | PM2 restart + git revert + `gitsafe-backup`; no formal blue/green |

---

# PHASE 19 — Environment Audit

### Environment variables referenced in code
`ADMS_PORT`, `AI_ANTHROPIC_MODEL`, `AI_GEMINI_MODEL`, `AI_OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `BIOMETRIC_ALLOWED_PORTS`, `BUILD_TIME`, `CLAUDE_API_KEY`, `DATABASE_URL`, `EMAIL_FROM`, `GEMINI_API_KEY`, `GIT_COMMIT`, `GOOGLE_GEMINI_API_KEY`, `JWT_SECRET`, `NODE_ENV`, `OPENAI_API_KEY`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `PLAYWRIGHT_HEADLESS`, `PORT`, `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `RESEND_API_KEY`, `SESSION_ENCRYPTION_KEY`, `SESSION_SECRET`.

| Aspect | Finding |
| :--- | :--- |
| Missing Variables | `OPENAI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `RESEND_API_KEY` reported missing in this environment (AI/email degrade to fallback) |
| Duplicate/legacy keys | Both `GEMINI_API_KEY` and `GOOGLE_GEMINI_API_KEY`; both `ANTHROPIC_API_KEY` and `CLAUDE_API_KEY` (alias handling) |
| Unused Variables | UNABLE TO VERIFY at runtime |
| Security Risk | `.env` gitignored 🟢; provider keys can also live in `settings` DB 🟡; `SESSION_ENCRYPTION_KEY`/`.session.key` gitignored 🟢 |
| Production Readiness | 🟡 `JWT_SECRET` fail-closed in prod; ensure all provider/session keys set on VPS |

---

# PHASE 20 — Git Audit

| Aspect | Finding |
| :--- | :--- |
| Branches | `main` (current), `replit-agent`, 6× `subrepl-*` working branches; remotes: `origin/main`, `gitsafe-backup/main` |
| Large Files | Tracked code is modest; `attached_assets/` (incl. 24 MB PDF) and `uploads/` are **gitignored** so excluded from history |
| History Size | 147 commits; git objects 13.23 MiB (pack 1.40 MiB, 1,721 objects) — healthy/compact |
| Ignored Files | Comprehensive `.gitignore` (node_modules, dist, .env*, uploads, attached_assets, flutter build, .session.key, caches) |
| Repository Health | 🟢 Good — no garbage, packed, small history; multiple working branches suggest active parallel work |

---

# PHASE 21 — Testing Audit

| Aspect | Finding |
| :--- | :--- |
| Unit Tests | 5 files, all AI: `server/__tests__/ai-{extraction,intents,recruitment,analytics,workforce}.test.ts` |
| Integration Tests | 🔴 NOT FOUND |
| E2E Tests | 🔴 NOT FOUND |
| Coverage | UNABLE TO VERIFY (no coverage config); effectively low — AI module only |
| Test Runner | No `vitest`/`jest` in `package.json`; `script/test.sh` present — runner config UNABLE TO VERIFY |
| Missing Tests | Frontend (0 tests), Flutter (0 tests), all backend services/repositories/routes except AI |
| Critical Untested Areas | Auth, payroll calculation, leave balance, tenant isolation, compliance reports, automation worker |

**Testing Score: ~30 / 100.**

---

# PHASE 22 — Documentation Audit

| Aspect | Finding |
| :--- | :--- |
| README (root) | 🔴 NOT FOUND (no root `README.md`; `replit.md` not present in scan either) |
| Architecture Docs | `PROJECT_SYSTEM_ANALYSIS.md` (this audit's companion), `server/ai/README.md` |
| API Docs | 🔴 NOT FOUND (no OpenAPI/Swagger) |
| Comments | Present but sparse; relies on naming. UNABLE TO VERIFY density precisely |
| Developer Guide | 🔴 NOT FOUND |
| Deployment Guide | Partial — `scripts/` + agent memory notes (`.agents/memory/*.md`, 33 topic files) capture VPS/deploy/automation knowledge |
| Flutter Docs | `flutter_app/README.md`, `flutter_app/APK_SIZE_AUDIT_REPORT.md` |

---

# PHASE 23 — Production Readiness

| Aspect | Finding |
| :--- | :--- |
| Scalability | 🟡 Single-process fork (vertical only); no clustering/horizontal scaling |
| Reliability | 🟡 PM2 autorestart; queue uses SKIP LOCKED; automation pause/resume |
| Availability | 🟡 Single instance — no HA/failover (NOT FOUND) |
| Fault Tolerance | 🟡 AI provider fallback chain; automation retry; no circuit breakers |
| Disaster Recovery | 🟡 `gitsafe-backup` remote; DB backup cadence UNABLE TO VERIFY |
| Observability | 🔴 No APM/metrics/tracing (NOT FOUND) |
| Monitoring | 🔴 NOT FOUND |

**Production Readiness Score: ~60 / 100.**

---

# PHASE 24 — Risk Assessment (Top Risks)

> Format: **Severity** · Impact · Mitigation. (Comprehensive list also consolidated in the Top-100 Risks section at the end.)

1. 🔴 Critical — Plain-text passwords · full credential compromise on DB leak · hash with bcrypt/argon2 + migrate.
2. 🔴 Critical — No rate limiting · brute-force/DoS · add express-rate-limit on auth & API.
3. 🔴 High — Unauthenticated ADMS push · attendance spoofing · device tokens + IP allowlist.
4. 🔴 High — PII unencrypted at rest (Aadhaar/PAN/bank) · privacy/compliance breach · field-level encryption.
5. 🟠 High — No monitoring/observability · blind to incidents · add APM + alerts.
6. 🟠 High — Single-process scaling · capacity ceiling/outage · cluster + load balance.
7. 🟠 High — Thin test coverage (AI only) · regressions in payroll/auth · add unit+integration+e2e.
8. 🟠 High — No CI/CD · inconsistent deploys · add GitHub Actions pipeline.
9. 🟠 Medium — No strict CSP · XSS surface · add CSP + helmet.
10. 🟠 Medium — Provider keys in DB settings · secret-at-rest · move to secret manager.
11. 🟠 Medium — Refresh tokens not rotated/revocable · token replay · rotation + blacklist.
12. 🟠 Medium — Monolithic large files · maintainability/merge conflicts · modularize.
13. 🟠 Medium — Automation portal fragility · filing failures · selector resilience + alerts.
14. 🟠 Medium — Migration drift (dev push vs prod SQL) · schema mismatch · drift checks.
15. 🟠 Medium — No DB backup verification · data loss · scheduled+tested backups.
16. 🟡 Medium — Heavy client PDF/Excel gen · memory spikes · stream/server-side export.
17. 🟡 Medium — No health/readiness endpoint · slow failover · add endpoints.
18. 🟡 Medium — Cross-tenant leak on new routes · data exposure · tenant-guard tests.
19. 🟡 Medium — AI cost/abuse without quotas · runaway spend · per-tenant quotas.
20. 🟡 Low — Duplicate font assets · minor bloat · consolidate.

---

# PHASE 25 — Recommendations (priority tiers)

**Critical Priority:** hash passwords; rate limiting; encrypt PII at rest; secure ADMS; add monitoring/alerting; add automated tests for payroll/auth/tenant-isolation.

**Quick Wins:** add CSP+helmet; add root README + API docs (OpenAPI); add health endpoint; consolidate duplicate assets; enable `npm audit`/`pub outdated` in CI; normalize duplicate env keys.

**Medium Priority:** modularize large route/report files; refresh-token rotation; server-side report streaming; migration drift checks; circuit breakers/retries for AI; per-tenant AI quotas; structured logging.

**Future Roadmap:** containerize (Docker) + CI/CD; horizontal scaling/clustering; Redis cache + SSE adapter; object storage for uploads; complete/descope Assets/Visitor/Travel/Training; MFA for admins; observability stack (metrics/tracing); data retention/PII purge workflows.

*(Full enumerated list in Top-100 Recommendations below.)*

---

# PHASE 26 — Executive Summary

| Score | /100 |
| :--- | ---: |
| Architecture | 85 |
| Backend | 82 |
| Frontend | 84 |
| Flutter | 78 |
| Database | 86 |
| Security | 57 |
| Performance | 72 |
| Code Quality | 74 |
| DevOps | 62 |
| Testing | 30 |
| Maintainability | 76 |
| Scalability | 63 |
| Production Readiness | 60 |
| **Enterprise Readiness** | **~68 / 100** |
| **Overall Score** | **~70 / 100** |

**Verdict:** A feature-rich, well-architected multi-tenant HRMS with deep Indian statutory compliance, biometric, AI, and automation capabilities. It is **functional and deployed**, but **not yet enterprise-grade** due to security hygiene (plain-text passwords, no rate limiting, unencrypted PII), near-absent automated testing, and missing DevOps maturity (no CI/CD, containers, monitoring, or horizontal scaling).

---

# TOP 100 STRENGTHS

1. Clean layered architecture (routes→services→repositories→storage).
2. Shared Drizzle schema as single source of truth.
3. Strong multi-tenant isolation via `company_id`.
4. Segment-level scoping (locations/contractors).
5. Granular module/action RBAC.
6. Per-user permission overrides.
7. Six well-defined roles with clear hierarchy.
8. Parameterized queries (SQL-injection resistant).
9. Comprehensive Zod validation at boundaries.
10. CSRF origin/referer protection.
11. Secure cookies (httpOnly/secure in prod).
12. JWT fail-closed secret in production.
13. Robust file-upload security (denylist/allowlist/limits).
14. Path-traversal-safe file deletion.
15. Multi-provider AI with graceful fallback.
16. Deterministic intent layer reduces hallucination.
17. AI prompt-injection guard.
18. AI key masking in logs.
19. AI usage/cost/token logging.
20. Provider-agnostic KYC extraction.
21. Native ADMS biometric integration.
22. Geofencing + face verification (mobile).
23. Deep EPFO/ESIC/CLRA compliance coverage.
24. EPF Form 11 report support.
25. DB-backed job queue with SKIP LOCKED.
26. Concurrency-capped automation worker.
27. Encrypted portal credentials (aes-256-gcm).
28. CAPTCHA/OTP pause-resume workflow.
29. Idle browser session reuse.
30. Abortable automation jobs.
31. Realtime via SSE.
32. Frontend code splitting (lazy pages).
33. TanStack Query caching + global 401 handling.
34. shadcn/ui consistent design system.
35. Dark/light/system theming.
36. react-hook-form + Zod forms.
37. Feature-first Flutter architecture.
38. Mobile JWT with secure storage.
39. On-device PDF payslip parity with web.
40. Targeted DB indexes on hot paths.
41. Unique dedupe index on punch logs.
42. FK integrity hardening migration.
43. Soft-delete via status columns.
44. Audit log table.
45. Standard created/updated timestamps.
46. Cross-company employee linking rules centralized.
47. Principal-employer view-only cross-company read.
48. Contractor handshake workflow.
49. CD wallet + daily billing model.
50. Modularized route registration.
51. Thin route handlers.
52. Manual but clean dependency composition.
53. MemStorage enables isolated testing.
54. AI test suites for critical AI paths.
55. Compact git history (1.4 MiB pack).
56. Comprehensive .gitignore.
57. Gitsafe backup remote.
58. PM2 autorestart + memory guard.
59. nginx reverse proxy + ADMS routing.
60. Persistent uploads via symlink.
61. Dual migration mechanism documented.
62. Startup DDL idempotency.
63. Env-driven configuration.
64. First-imported env loader ordering.
65. Provider key aliasing (Gemini/Claude).
66. Session store in PostgreSQL.
67. Correlation IDs on requests.
68. Per-/api request logging.
69. Error boundary on client.
70. Skeleton/loading states.
71. Searchable employee selectors.
72. Export buttons (PDF/Excel) across reports.
73. Notification bell + SSE.
74. Module-gate access control on UI.
75. Access-request workflow.
76. Profile-update approval workflow.
77. Rich compliance calendar.
78. KRA/KPI template scoring.
79. Loan/advance installment tracking.
80. FnF settlement support.
81. Bulk employee operations.
82. Statutory settings configurability.
83. Wage-grade-based compliance.
84. Devanagari font support for reports.
85. Mobile app version gating.
86. Self-service portal (my-*).
87. Team/manager scoping.
88. AI workforce/recruitment/analytics modules.
89. AI follow-up task tracking.
90. Composite-insight RBAC awareness.
91. Recruitment AI tenant isolation.
92. Browser-pool reuse efficiency.
93. Form-snapshot debugging for automation.
94. Live-view of automation runs.
95. Email service (Resend) integration.
96. Extensive agent-memory knowledge base (33 topics).
97. Flutter APK size audit documented.
98. Consistent domain-aligned naming.
99. SOLID-respecting service boundaries.
100. Active multi-branch development workflow.

# TOP 100 WEAKNESSES

1. Plain-text password storage.
2. No password hashing library.
3. No rate limiting.
4. No brute-force protection on login.
5. Unencrypted PII at rest.
6. Unauthenticated ADMS endpoints.
7. No strict CSP.
8. No helmet middleware.
9. No refresh-token rotation.
10. No token revocation/blacklist.
11. No MFA/2FA.
12. Provider keys can live in DB settings.
13. Near-zero non-AI test coverage.
14. No frontend tests.
15. No Flutter tests.
16. No integration tests.
17. No e2e tests.
18. No coverage reporting.
19. Ambiguous test runner config.
20. No CI/CD pipeline.
21. No GitHub Actions workflows.
22. No Dockerfile/containerization.
23. No monitoring/APM.
24. No alerting.
25. No distributed tracing.
26. No health/readiness endpoint.
27. Single-process (no clustering).
28. No horizontal scaling.
29. No HA/failover.
30. No load balancing.
31. 512 MB heap vs heavy automation.
32. Playwright memory/CPU pressure.
33. Automation fragile to portal UI changes.
34. No cron scheduler.
35. Single worker chain.
36. No circuit breakers for AI.
37. No AI per-tenant quotas.
38. AI latency-bound UX.
39. Monolithic `use-reports.tsx` (6,261 LOC).
40. Oversized route files (epfo/compliance).
41. Large page components (1.5–1.9k LOC).
42. Repeated report markup.
43. Duplicated month-window SQL.
44. No DI container.
45. No separate controller layer.
46. Duplicate font assets.
47. Client-side PDF/Excel memory spikes.
48. No server-side export streaming.
49. No server cache (Redis).
50. No object storage for uploads.
51. Uploads depend on symlink survival.
52. Migration drift risk (push vs SQL).
53. No automated DB backups verified.
54. No disaster-recovery runbook.
55. No rollback automation (blue/green).
56. No root README.
57. No API documentation.
58. No developer guide.
59. Sparse code comments.
60. No OpenAPI/Swagger.
61. Duplicate env keys (Gemini/Claude).
62. Missing AI/email keys in env.
63. CORS allowlist needs prod hardening.
64. SSRF surface via automation.
65. No WAF.
66. No security headers beyond basics.
67. No dependency CVE automation.
68. No license compliance tracking.
69. Possible unused deps (unverified).
70. Possible unused imports (unverified).
71. No tree-shake/bundle budget enforcement.
72. Large vendor chunks (xlsx/jspdf).
73. No SLA/uptime monitoring.
74. No rate-limited admin actions.
75. No idempotency keys for payroll/bulk.
76. No field-level audit on sensitive changes.
77. Inconsistent soft-delete policy across tables.
78. Partial Shift/Roster modules.
79. Minimal TDS module.
80. Assets module absent.
81. Visitor/Gate Pass module mostly absent.
82. Travel module absent.
83. Training module absent.
84. Limited mobile offline support.
85. Mobile username case-sensitivity pitfalls.
86. `queueService` import unwired in one path.
87. No load testing.
88. No performance budget/CI gate.
89. No slow-query logging.
90. Potential missing indexes on aggregations.
91. High-growth tables lack partitioning/retention.
92. No data retention/PII purge workflow.
93. No PR security checklist/template.
94. No threat model document committed.
95. No graceful AI-degradation UI guarantees.
96. No structured logging/levels.
97. No log shipping/retention.
98. No secrets rotation policy.
99. Documentation scattered in agent memory.
100. Enterprise readiness gaps overall (~68/100).

# TOP 100 RISKS

> Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

1. 🔴 Credential theft via plain-text passwords.
2. 🔴 Login brute-force (no rate limit).
3. 🔴 API DoS (no throttling).
4. 🔴 PII breach (unencrypted Aadhaar/PAN/bank).
5. 🔴 Attendance spoofing via ADMS serial guess.
6. 🟠 Undetected outages (no monitoring).
7. 🟠 Capacity ceiling/outage (single process).
8. 🟠 Production regressions (no tests).
9. 🟠 Inconsistent/broken deploys (no CI/CD).
10. 🟠 Token replay (no refresh rotation).
11. 🟠 Secret leak from DB-stored keys.
12. 🟠 Compliance filing failures (portal changes).
13. 🟠 Data loss (unverified backups).
14. 🟠 Cross-tenant data leak on new routes.
15. 🟠 Schema mismatch (migration drift).
16. 🟠 XSS exploitation (no CSP).
17. 🟠 Runaway AI spend (no quotas).
18. 🟠 Memory exhaustion (PDF/automation).
19. 🟠 Slow recovery (no health checks).
20. 🟠 SSRF via automation navigation.
21. 🟡 Session fixation/replay edge cases.
22. 🟡 CORS misconfig exposure.
23. 🟡 Sensitive data in error responses.
24. 🟡 Upload symlink breakage loses files.
25. 🟡 Vendor CVE exposure (unaudited deps).
26. 🟡 License non-compliance.
27. 🟡 Large-file merge conflicts.
28. 🟡 Payroll double-run (no idempotency).
29. 🟡 Bulk-op partial failures.
30. 🟡 Report timeout under load.
31. 🟡 DB hotspot on attendance/punch tables.
32. 🟡 Missing-index slow queries.
33. 🟡 Unbounded log/audit growth.
34. 🟡 AI provider outage degrades UX.
35. 🟡 Prompt-injection bypass.
36. 🟡 Mobile login failures (case sensitivity).
37. 🟡 Stale React Query cache.
38. 🟡 SSE connection scaling limits.
39. 🟡 Worker stall blocks all jobs.
40. 🟡 Captcha/OTP resume race conditions.
41. 🟡 Encrypted-session key loss locks portals.
42. 🟡 Env key duplication confusion.
43. 🟡 Missing AI/email keys break features silently.
44. 🟡 Manual deploy human error.
45. 🟡 No rollback automation prolongs incidents.
46. 🟡 Unscoped admin actions.
47. 🟡 Insider data access (no field audit).
48. 🟡 Inconsistent soft-delete causes data resurrection.
49. 🟡 Incomplete modules mislead users.
50. 🟡 Mobile offline gaps lose punches.
51. 🟢 Duplicate asset bloat.
52. 🟢 Bundle size creep.
53. 🟢 Documentation drift.
54. 🟢 Onboarding friction (no README).
55. 🟢 Dead code accumulation.
56. 🟢 Unused dependency bloat.
57. 🟡 No WAF in front.
58. 🟡 No DDoS protection layer.
59. 🟡 No secrets rotation.
60. 🟡 No anomaly detection on logins.
61. 🟡 Single DB instance SPOF.
62. 🟡 No read replicas under read load.
63. 🟡 Connection-pool exhaustion.
64. 🟡 Long transactions during payroll.
65. 🟡 Migration failure on deploy.
66. 🟡 Startup DDL race on multi-instance (future).
67. 🟡 Browser binary drift (auto-install).
68. 🟡 System Chromium version mismatch.
69. 🟡 Playwright lib deps missing on VPS.
70. 🟡 Government portal rate-limits/bans.
71. 🟡 KYC extraction inaccuracies.
72. 🟡 AI hallucination on null intents.
73. 🟡 Composite insight data leak if under-gated.
74. 🟡 Recruitment AI cross-posting leak.
75. 🟡 PDF font embedding failures.
76. 🟡 xlsx export memory on large datasets.
77. 🟡 html2canvas rendering inconsistencies.
78. 🟡 Timezone/locale bugs in attendance.
79. 🟡 Leave balance miscalculation.
80. 🟡 Statutory rate misconfiguration.
81. 🟡 Wage-source divergence across reports.
82. 🟡 Billing miscount (daily logs).
83. 🟡 Invoice/payment reconciliation gaps.
84. 🟡 Notification flooding.
85. 🟡 SSE memory leak on disconnects.
86. 🟡 File-type bypass on upload.
87. 🟡 Large upload abuse (size limits only).
88. 🟢 Verbose logs cost/storage.
89. 🟢 Branch sprawl (subrepl-*).
90. 🟢 Inconsistent error formats.
91. 🟡 No structured incident response.
92. 🟡 No on-call/alert routing.
93. 🟡 No capacity planning.
94. 🟡 No autoscaling.
95. 🟡 No chaos/failover testing.
96. 🟡 No data masking in non-prod.
97. 🟡 No audit of admin role changes.
98. 🟡 No PII access logging.
99. 🟡 No retention policy (legal exposure).
100. 🟡 Enterprise-readiness gap overall.

# TOP 100 RECOMMENDATIONS

1. Hash passwords (bcrypt/argon2) + migrate.
2. Add login + API rate limiting.
3. Encrypt PII at rest (column-level).
4. Authenticate/secure ADMS (tokens + IP allowlist).
5. Add APM + alerting.
6. Add automated tests (payroll/auth/tenant).
7. Add CI/CD pipeline.
8. Add CSP + helmet.
9. Add refresh-token rotation + revocation.
10. Move secrets to a secret manager.
11. Containerize with Docker.
12. Add horizontal scaling/clustering.
13. Add health/readiness endpoints.
14. Add OpenAPI/Swagger docs.
15. Add root README + dev guide.
16. Add MFA for admin roles.
17. Add per-tenant AI usage quotas.
18. Add circuit breakers/retries for AI.
19. Server-side stream PDF/Excel exports.
20. Add Redis cache + SSE adapter.
21. Add object storage for uploads.
22. Add migration drift checks.
23. Add scheduled + tested DB backups.
24. Add disaster-recovery runbook.
25. Add blue/green or rollback automation.
26. Split `use-reports.tsx` into modules.
27. Split oversized route files.
28. Extract reusable report components.
29. Extract shared month-window SQL helper.
30. Add tenant-guard lint/tests for routes.
31. Add idempotency keys (payroll/bulk).
32. Add field-level audit on sensitive data.
33. Add structured logging + log shipping.
34. Add slow-query logging.
35. Review/add missing indexes via EXPLAIN.
36. Partition/retire high-growth tables.
37. Add data retention/PII purge jobs.
38. Automate `npm audit`/`pub outdated`.
39. Pin/refresh outdated packages.
40. Add license-checker in CI.
41. Run depcheck; remove unused deps.
42. Enforce bundle-size budgets.
43. Lazy-load xlsx/jspdf on demand.
44. Consolidate duplicate font assets.
45. Harden CORS allowlist for prod.
46. Add WAF/DDoS protection.
47. Add secrets rotation policy.
48. Add anomaly detection on logins.
49. Add read replicas for read scaling.
50. Tune connection pooling.
51. Add request timeouts on heavy endpoints.
52. Add request size limits globally.
53. Normalize duplicate env keys.
54. Fail fast/visibly when AI/email keys absent.
55. Add graceful AI-degradation UI.
56. Audit composite insight gating end-to-end.
57. Verify recruitment AI cross-posting isolation.
58. Add MFA + session anomaly checks.
59. Add admin-action audit + least privilege review.
60. Add PII access logging.
61. Add automated post-deploy smoke tests.
62. Add load testing for automation/reports.
63. Add performance budget CI gate.
64. Add e2e tests (login/payroll/leave).
65. Add integration tests for tenant isolation.
66. Add frontend component tests.
67. Add Flutter widget/integration tests.
68. Add coverage reporting + thresholds.
69. Standardize error response format.
70. Add error tracking (Sentry-style).
71. Add uptime monitoring.
72. Add on-call/alert routing.
73. Add capacity planning + autoscaling.
74. Add chaos/failover testing.
75. Add data masking in non-prod.
76. Wire or remove unused `queueService` import.
77. Improve mobile username normalization.
78. Add mobile offline punch queue.
79. Add 2FA for mobile sensitive actions.
80. Strengthen upload MIME sniffing.
81. Add upload virus scanning.
82. Add SSE reconnect/cleanup hardening.
83. Add notification rate controls.
84. Complete or descope Assets module.
85. Complete or descope Visitor/Gate Pass.
86. Complete or descope Travel module.
87. Complete or descope Training module.
88. Finish Shift/Roster builders.
89. Build dedicated TDS module/returns.
90. Add billing reconciliation reports.
91. Add invoice/payment auditing.
92. Add statutory-rate validation guards.
93. Centralize wage-source logic (single util).
94. Add timezone/locale tests for attendance.
95. Add leave-balance calculation tests.
96. Add Playwright selector resilience + alerts.
97. Pin Chromium version on VPS.
98. Add government-portal change monitoring.
99. Commit a threat model + PR security checklist.
100. Track enterprise-readiness KPIs over time.

---

*End of audit — generated read-only; no project files were modified. Unverifiable items are explicitly marked NOT FOUND / UNABLE TO VERIFY.*
