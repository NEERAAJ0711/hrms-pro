# PROJECT_SYSTEM_ANALYSIS.md

> **Read-only system inventory & architecture audit**
> Generated: 27 June 2026 · Scope: full repository (excluding `node_modules`, `.git`, build caches)
> Nature: **Documentation only — no code was modified, added, deleted, or refactored.**

---

## TABLE OF CONTENTS

1. Phase 1 — Project Discovery
2. Phase 2 — File Structure
3. Phase 3 — Project Flow
4. Phase 4 — Module Inventory
5. Phase 5 — Database Analysis
6. Phase 6 — API Inventory
7. Phase 7 — Authentication & Authorization
8. Phase 8 — Security Status
9. Phase 9 — Performance Status
10. Phase 10 — Dependency Analysis
11. Phase 11 — DevOps
12. Phase 12 — Mobile App
13. Phase 13 — Frontend
14. Phase 14 — Backend
15. Phase 15 — AI Module
16. Phase 16 — HRMS Module Status
17. Phase 17 — Code Quality
18. Phase 18 — Project Health
19. Phase 19 — Visual Diagrams
20. Phase 20 — Final Summary

---

## PHASE 1 — PROJECT DISCOVERY

**Project name:** HRMS Pro (`package.json` name: `rest-express`, v1.0.0)
**Type:** Multi-tenant enterprise Human Resource Management System with Indian statutory compliance (EPFO/ESIC/CLRA), biometric attendance, AI assistance, and a companion Flutter mobile app.
**Hosting:** Self-hosted Hostinger VPS (`tbjvisionconnect.com`) under PM2 — **not** a Replit deployment.

### Repository Metrics (excluding `node_modules`, `.git`, build output)

| Metric | Value |
| :--- | :--- |
| Total files | **1,335** |
| Total folders | **352** |
| Total lines (ts+tsx+dart+sql+css) | **~119,460** |
| Total lines incl. JSON/MD | **~133,640** |
| Repository size (excl. `node_modules`/`.git`) | **53 MB** |
| `node_modules` size | **1.4 GB** |
| Build output (`dist/`) | **8.4 MB** (server bundle `dist/index.cjs` = 3.7 MB) |

### Source Code Breakdown by Language

| Language / Type | Files | Lines |
| :--- | ---: | ---: |
| TypeScript (`.ts`) — backend + shared | 180 | 49,750 |
| TypeScript React (`.tsx`) — frontend | 120 | 56,131 |
| Dart (`.dart`) — Flutter mobile | 37 | 11,706 |
| SQL (`.sql`) — migrations | 27 | 1,628 |
| JSON (config/data) | 14 | 12,891 |
| Markdown (docs) | 36 | 1,283 |
| CSS | 1 | 245 |

### Languages, Frameworks & Tooling

| Category | Technology |
| :--- | :--- |
| Languages | TypeScript, Dart, SQL, CSS |
| Backend framework | Express.js (Node) |
| Frontend framework | React 18 + Vite |
| Mobile framework | Flutter (Dart) |
| ORM | Drizzle ORM (PostgreSQL) |
| DB | PostgreSQL |
| UI library | shadcn/ui (Radix UI + Tailwind CSS) |
| Routing (web) | wouter |
| Data fetching | TanStack Query (React Query) |
| Forms / validation | react-hook-form + Zod |
| Browser automation | Playwright (Chromium) |
| Build tool | `tsx` + custom `script/build.ts` (esbuild-based bundle) |
| Process manager | PM2 (`ecosystem.config.cjs`) |
| Package managers | npm (web), pub (Flutter) |

### High-level Folder Tree

```
.
├── client/                 # React + Vite frontend (3.6 MB)
│   ├── public/             # Static assets, fonts (NotoSansDevanagari)
│   └── src/
│       ├── components/     # Shared + domain UI (incl. ui/ = shadcn)
│       ├── pages/          # 40+ route pages
│       ├── hooks/          # Custom hooks (use-toast, etc.)
│       └── lib/            # queryClient, auth context, reports
├── server/                 # Express backend (2.3 MB)
│   ├── routes/             # 24 domain routers + index orchestrator
│   ├── services/           # 17 business-logic services
│   ├── repositories/       # 15 data-access repositories
│   ├── ai/                 # AI subsystem (providers, intents, prompts…)
│   ├── automation/         # Playwright EPFO/ESIC automation + queue worker
│   └── __tests__/          # AI test suites
├── shared/                 # Drizzle schema + shared types (104 KB)
│   └── schema.ts           # 67 tables
├── flutter_app/            # Flutter mobile app (788 KB)
│   └── lib/features/       # Feature-based modules
├── migrations/             # 25 numbered SQL migrations (196 KB)
├── scripts/ & script/      # build, nginx config, post-merge, run-migrations
├── uploads/                # Runtime uploads (symlinked on VPS)
├── dist/                   # Build output (8.4 MB)
└── attached_assets/        # User-provided reference files
```

---

## PHASE 2 — FILE STRUCTURE

| Folder | Purpose | Technologies | Complexity | Approx. Size | Important Files |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `client/src/pages` | 40+ route-level pages (dashboard, attendance, payroll, compliance, etc.) | React, wouter, TanStack Query | High | — | `dashboard.tsx`, `payroll.tsx`, `compliances.tsx`, `epfo.tsx` |
| `client/src/components` | Shared + domain components; `ui/` holds shadcn primitives | React, Radix, Tailwind | High | 3.6 MB (whole client) | `app-sidebar.tsx`, `module-gate.tsx`, `compliances/`, `payroll/` |
| `client/src/lib` | Query client, auth context, report builders | TanStack Query | Medium | — | `queryClient.ts`, `auth.tsx`, `reports/` |
| `server/routes` | 24 domain Express routers + registration orchestrator | Express, Zod | High | — | `index.ts`, `auth-routes.ts`, `employee-routes.ts`, `shared.ts` |
| `server/services` | 17 business-logic services | TypeScript | High | — | `payroll-service.ts`, `attendance-service.ts`, `employee-link.ts` |
| `server/repositories` | 15 Drizzle-backed data-access repositories | Drizzle ORM | Medium | — | `employee-repository.ts`, `payroll-repository.ts` |
| `server/ai` | Modular AI subsystem | OpenAI/Gemini/Anthropic SDKs | High | — | `index.ts`, `providers/`, `intents/`, `prompts/` |
| `server/automation` | Government-portal browser automation | Playwright | High | — | `queue-worker.ts`, `epfo-service.ts`, `esic-service.ts`, `browser-pool.ts` |
| `shared` | Source-of-truth schema + types | Drizzle, Zod | High | 104 KB | `schema.ts` (67 tables) |
| `flutter_app/lib` | Mobile app, feature-based | Flutter/Dart, Provider, Dio | Medium | 788 KB | `features/`, `core/` |
| `migrations` | Numbered raw-SQL migrations (prod path) | SQL | Medium | 196 KB | `001…025_*.sql` |
| `scripts` | Ops glue (nginx, post-merge, migrations) | Bash, Node | Low | — | `post-merge.sh`, `run-migrations.cjs`, `configure-nginx-iclock.sh` |

**Standalone large/root files of note:** `server/compliance-routes.ts`, `server/epfo-esic-routes.ts`, `server/mobile-routes.ts`, `server/adms.ts`, `server/jwt-auth.ts`, `server/queue-service.ts`, `server/database-storage.ts`, `server/storage.ts`.

**Unused / dormant note:** `MemStorage` (in-memory `IStorage` implementation) exists primarily for testing; `queueService` import noted as intentionally unwired in one routes path (pre-existing, documented in project memory). No large blocks of obviously dead application code were detected, but a dedicated dead-code pass is recommended (see Phase 17).

---

## PHASE 3 — PROJECT FLOW

### End-to-End Flow

```
User opens app (browser / Flutter)
        ↓
Auth — web: express-session (PG store) · mobile: JWT access+refresh
        ↓
Dashboard (role- & tenant-scoped metrics)
        ↓
Navigation — wouter routes wrapped in ProtectedRouter + ModuleGate
        ↓
API call — fetch via TanStack Query (cookie) or Dio (Bearer)
        ↓
Middleware — body parse → session → correlation id → CSRF (origin/referer)
        ↓
Auth/Perm — requireAuth → requireModuleAccess / requireAction
        ↓
Route → Service → Repository (Drizzle)
        ↓
PostgreSQL (company_id-scoped queries)
        ↓
Response (JSON) ← Service ← Repository
        ↓
UI update — React Query cache update / SSE push for realtime
```

### Request Lifecycle
1. Client issues request with session cookie (web) or `Authorization: Bearer` (mobile).
2. Global middleware in `server/index.ts`: JSON/body parsing, `express-session` w/ `connect-pg-simple`, `X-Request-Id` correlation id, CSRF origin/referer check for state-changing cookie requests, security headers, per-`/api` request logging (duration + status).
3. Router orchestrator (`server/routes/index.ts`) dispatches to the domain router.
4. `requireAuth` validates identity; `requireModuleAccess(module)` / `requireAction(module, action)` enforce permissions (with `user_permissions` overrides over a `MODULE_ACCESS` role map).
5. Route validates body with Zod, calls a Service, which calls a Repository performing Drizzle queries — all scoped by `company_id`.

### Response Lifecycle
Repository result → Service shaping → Route serialises JSON → client. React Query caches by key; realtime updates pushed over **SSE** (`server/sse.ts → pushToUser`).

### Error Lifecycle
Zod failures → 400 with details; auth/permission failures → 401/403; tenant violations → 403/404; server errors caught and returned as JSON `{ error }` with 500. Frontend `getQueryFn` globally intercepts 401 to redirect to login. An `error-boundary.tsx` guards the React tree.

---

## PHASE 4 — MODULE INVENTORY

| Module | Pages | Key API | DB Tables | Permissions | Status / Completion |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Employee | `employees`, `add-employee`, `my-profile` | `/api/employees`, profile-update requests | `employees`, `users`, `profile_update_requests` | module `employees` | ✅ ~90% |
| Attendance + Biometric | `attendance`, `my-attendance`, `biometric`, `live-view` | `/api/attendance`, `/api/biometric`, `/iclock` (ADMS) | `attendance`, `biometric_devices`, `biometric_punch_logs`, `biometric_device_users`, `adms_activity_log`, `outdoor_entries` | module `attendance` | ✅ ~95% |
| Payroll | `payroll`, `fnf-settlement` | `/api/payroll`, `/api/salary-structures` | `payroll`, `salary_structures`, `earning_heads`, `deduction_heads`, `fnf_settlements` | module `payroll` | ✅ ~90% |
| Leave | `leave` | `/api/leave-requests`, `/api/leave-types` | `leave_requests`, `leave_types`, `leave_policies`, `leave_adjustments`, `comp_off_applications` | module `leave` | ✅ ~95% |
| Recruitment + AI | `job-postings`, `job-applications` | `/api/job-postings`, `/api/job-applications`, recruitment-ai | `job_postings`, `job_applications`, `candidate_profiles`, `previous_experiences` | module `recruitment` | ✅ ~85% |
| Onboarding / KYC | `ai-assistant` (KYC flow) | `/api/ai-hr/*` | `kyc_submission_status`, `epfo_kyc_records` | self / admin | 🟡 ~70% |
| Compliance (CLRA) | `compliances`, `compliance-automation`, `compliance-calendar` | `/api/compliance/*` | `compliance_adjustments`, `compliance_employee_setup`, `compliance_clients`, `compliance_calendar_events` | module `compliance` | ✅ ~90% |
| EPFO / ESIC / PF | `epfo`, `esic` | `/api/epfo/*`, `/api/automation/*` | `epfo_registrations`, `epfo_kyc_records`, `epfo_ecr_returns`, `esic_registrations`, `esic_monthly_returns`, `esic_fetched_employees`, `challans`, `automation_jobs`, `automation_logs`, `portal_sessions` | module `compliance` | ✅ ~85% |
| Loans & Advances | `loan-advances` | `/api/loans` | `loan_advances` | module `loans` | 🟡 ~75% |
| Expenses | (in loan/adv UI) | `/api/expenses` | `expenses` | module `expenses` | 🟡 ~60% |
| KRA / KPI | `kra-kpi` | `/api/kra/*` | `kra_templates`, `kra_template_kpis`, `kra_assignments`, `kra_assignment_kpis` | module `kra` | ✅ ~90% |
| Reports | `reports` + compliance report tab | aggregated endpoints | (read across) | module `reports` | ✅ ~85% |
| Notifications | `notification-bell` (component) | `/api/notifications` | `notifications` | all roles | ✅ ~95% (SSE) |
| Company & Contractors | `companies`, `company-contractors` | `/api/companies`, `/api/company-extra` | `companies`, `company_contractors`, `contractor_employees`, `contractor_masters` | admin | ✅ ~90% |
| Role / User Mgmt | `users`, `access-requests`, `my-access-requests` | `/api/users`, `/api/module-access-requests` | `users`, `user_permissions`, `module_access_requests` | admin | ✅ ~90% |
| Billing / Invoices | `billing` | `/api/billing` | `invoices`, `cd_accounts`, `cd_transactions`, `daily_billing_logs`, `payment_submissions` | admin | ✅ ~85% |
| AI Assistant | `ai-assistant`, `ai-hr-dashboard`, `workforce-intelligence` | `/api/ai-hr/*`, workforce/analytics ai | `ai_conversations`, `ai_messages`, `ai_follow_up_tasks`, `ai_usage_logs` | gated per module | ✅ ~85% |
| Mobile | `mobile-preview` | `/api/mobile/*` (66 endpoints) | `app_versions` + shared | JWT | ✅ ~90% |

---

## PHASE 5 — DATABASE ANALYSIS

**Engine:** PostgreSQL · **ORM:** Drizzle · **Tables:** **67** (`shared/schema.ts`).

### Core Entity Relationships (multi-tenant, rooted at `companies`)

- `companies` — root tenant. `is_contractor` flag marks a company that also acts as a contractor.
- `users` → `companies` (`company_id`). Auth entity; role drives RBAC.
- `employees` → `companies` (`company_id`), optional `user_id` → `users` (self-service link), self-reference `master_employee_id` → `employees` (cross-company deployment / On-Roll master).
- Transactional: `payroll`, `attendance`, `leave_requests`, `salary_structures` → `employees` + `company_id`.
- Contractor model: `company_contractors` (link between two companies, pending/active handshake), `contractor_employees`, `contractor_masters`.
- Compliance & automation: `compliance_*`, `epfo_*`, `esic_*`, `challans`, `automation_jobs`, `automation_logs`, `portal_sessions`.
- AI: `ai_conversations`, `ai_messages`, `ai_follow_up_tasks`, `ai_usage_logs`.

### Indexes (examples)
- `idx_employees_company`, `idx_employees_company_status`, `idx_employees_user`
- `idx_attendance_employee_date` (roster generation)
- `idx_payroll_employee`, `idx_leave_requests_employee`, `idx_salary_structures_employee`
- Unique index on `biometric_punch_logs(device_serial, timestamp, pin)` (dedupe device sync)

### Foreign Keys & Constraints
`references()` enforced throughout; child records typically `onDelete: cascade`, user links `onDelete: set null`. FK hardening added in migration `020_foreign_keys.sql`.

### Soft-delete, Audit & Views
- **Soft-delete:** Master/transaction tables use `status` (`active`/`inactive`/`exited`) rather than hard deletes.
- **Audit columns:** `created_at` / `updated_at` standard; dedicated `audit_logs` table (migration 018).
- **Triggers/Views:** None material observed — logic lives in application layer.

### Migration Mechanism (dual)
- **Dev:** `drizzle-kit push` from `shared/schema.ts`.
- **Prod (VPS):** 25 numbered raw-SQL files (`001…025`) + startup DDL via `server/routes/startup-migrations.ts`. Raw constraints follow Drizzle naming so `push` stays a no-op. `scripts/run-migrations.cjs` must NOT run on dev.

---

## PHASE 6 — API INVENTORY

**Total HTTP endpoints (`app.get/post/put/patch/delete`): 444** across the server.

### Endpoint distribution (top routers)

| Router / File | Endpoints | Domain |
| :--- | ---: | :--- |
| `server/mobile-routes.ts` | 66 | Flutter mobile API (JWT) |
| `server/epfo-esic-routes.ts` | 45 | EPFO/ESIC filings & automation |
| `server/routes/settings-routes.ts` | 44 | Settings, masters, API keys |
| `server/compliance-routes.ts` | 29 | CLRA reports, adjustments, **EPF Form 11** |
| `server/routes/employee-routes.ts` | 24 | Employee CRUD, docs |
| `server/routes/billing-routes.ts` | 19 | CD wallet, invoices, billing |
| `server/ai-hr-routes.ts` | 19 | AI HR assistant |
| `server/routes/biometric-routes.ts` | 18 | Devices, punch logs |
| `server/kra-routes.ts` | 15 | KRA/KPI |
| `server/routes/loan-routes.ts` | 15 | Loans/advances |
| `server/routes/self-service-routes.ts` | 13 | Employee self-service |
| `server/routes/user-routes.ts` | 12 | Users, permissions |
| `payroll / company / company-extra` | 11 each | Payroll, company mgmt |
| `workforce-ai / recruitment / recruitment-ai` | 10 each | AI + recruitment |
| `analytics-ai` | 9 | AI analytics |
| `masters-extra` | 8 | Master data |
| `leave / notification / employee-bulk / auth / attendance / adms` | 4–7 each | Misc domains |

**Per-endpoint contract pattern:** Method + URL → `requireAuth` (+ `attachUser`) → `requireModuleAccess`/`requireAction`/`requireRole` → Zod-validated request body → Service → Repository → JSON response. Mobile endpoints authenticate via `requireJwtAuth` (Bearer). ADMS `/iclock/*` endpoints are intentionally unauthenticated (device-serial trust).

---

## PHASE 7 — AUTHENTICATION & AUTHORIZATION

### Login / Logout
- **Web:** `POST /api/auth/login` → `express-session` (PostgreSQL store via `connect-pg-simple`); session cookie `httpOnly`, `secure` in production. Logout clears session.
- **Mobile:** `POST /api/mobile/auth/login` → issues **JWT access (7d)** + **refresh (30d)**.
- **Signup:** `POST /api/auth/signup` supports `company_admin` (creates company + user) and `employee`; validated with `insertUserSchema`.

### Token / JWT (`server/jwt-auth.ts`)
- `generateAccessToken` (7d), `generateRefreshToken` (30d), `verifyToken` via `jwt.verify`.
- `requireJwtAuth` extracts Bearer token, verifies, attaches `req.user`.
- `JWT_SECRET` from `process.env`. In non-production a random ephemeral secret is generated; in production the server **fails closed** (refuses to start) without it.

### RBAC
- **Roles** (`shared/schema.ts` enum): `super_admin`, `company_admin`, `hr_admin`, `recruiter`, `manager`, `employee` (default `employee`).
- **Hierarchy:** `super_admin` (all companies) → `company_admin`/`hr_admin` (own `company_id`) → `manager` (team scope) → `employee` (self-service only).
- **Middleware** (`server/routes/shared.ts`): `requireAuth`, `requireRole(...)`, `requireModuleAccess(module)`, `requireAction(module, action)`. Granular permissions check `user_permissions` (explicit allow/deny overrides) before falling back to a `MODULE_ACCESS` role map.
- **Tenant isolation:** queries filtered by `company_id`. `getAllowedEmployeeIdsForUser` further restricts by `accessLocations` / `accessContractors` segments. Principal employers may **view** (not edit) employees of approved contractors.

### Permission Matrix (summary)

| Capability | super_admin | company_admin | hr_admin | manager | employee |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Cross-company access | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage employees/payroll | ✅ | ✅ | ✅ | partial | ❌ |
| Approvals (leave/loan) | ✅ | ✅ | ✅ | team | ❌ |
| Self-service (my-*) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings / users / billing | ✅ | ✅ | partial | ❌ | ❌ |

---

## PHASE 8 — SECURITY STATUS

| Area | Status | Notes |
| :--- | :--- | :--- |
| Authentication | 🟡 | Session (web) + JWT (mobile); solid token handling, fail-closed `JWT_SECRET` in prod. |
| Authorization | ✅ | Granular module/action RBAC + tenant scoping + segment restrictions. |
| **Password hashing** | 🔴 **CRITICAL** | Passwords appear stored & compared in **plain text** (`auth-routes.ts`, `user-repository.ts`). No bcrypt/argon2. |
| JWT | ✅ | Signed, verified, sensible expiries; secret fail-closed in prod. |
| Secrets / env | 🟡 | `JWT_SECRET` managed; provider API keys via env or DB. AI logger masks keys. Avoid DB-stored secrets long-term. |
| SQL injection | ✅ | Drizzle parameterized queries; raw `sql` uses tagged templates. |
| XSS | 🟡 | `X-Content-Type-Options: nosniff` set; **no strict CSP**. |
| CSRF | ✅ | Custom Origin/Referer check for cookie state-changing requests; Bearer (mobile) exempt. |
| CORS | 🟡 | Host validation via `allowedRequestHosts`; review allowlist for prod. |
| Rate limiting | 🔴 | **Not observed** — login/API brute-force exposure. |
| File upload | ✅ | Denylist of dangerous extensions, purpose-specific allowlists, multer size limits, path-traversal-safe deletes. |
| Validation | ✅ | Zod schemas across routes; AI input clamped + prompt-guard. |
| Encryption | 🟡 | Portal credentials/cookies encrypted (`aes-256-gcm`); passwords not hashed (see above). |
| ADMS endpoints | 🟡 | `/iclock/*` unauthenticated by design (device-serial trust) — spoofing risk if serials guessed. |

**Security Score: ~58 / 100** (driven down primarily by plain-text passwords and absent rate limiting; strong on injection, validation, RBAC, upload, and CSRF).

### Critical Risks (security)
1. **Plain-text password storage/comparison** — highest priority remediation.
2. **No rate limiting** on auth/API.
3. **Unauthenticated ADMS push** — possible attendance spoofing via known serials.
4. **No strict CSP** — residual XSS surface.

---

## PHASE 9 — PERFORMANCE STATUS

| Aspect | Observation |
| :--- | :--- |
| Repo size (excl deps) | 53 MB — reasonable |
| Build size | `dist/` 8.4 MB; server bundle `index.cjs` 3.7 MB (acceptable for a single-process Node app) |
| Frontend bundle | Mitigated via `React.lazy` + `Suspense` page-level code splitting |
| Backend memory | PM2 capped: `--max-old-space-size=512`, `max_memory_restart: 500M` |
| DB performance | Targeted indexes on hot paths (employee/company/attendance-date); unique dedupe index on punch logs |
| Largest files (project) | 24 MB reference PDF in `attached_assets/`; 0.62 MB Devanagari font (×2 copies, client + dist) |
| Bottleneck candidates | Playwright automation (CPU/RAM heavy — concurrency capped 1–3 via `BrowserPool`); large CLRA/PDF report generation |
| Duplicate assets | `NotoSansDevanagari.ttf` exists in both `client/public/fonts` and `dist/public/fonts` (build copy — expected) |
| Memory risks | Single-process fork (PM2 `instances: 1`) — vertical scaling only; browser pool is the main memory consumer |

**Performance Score: ~72 / 100.** Good index coverage and code splitting; main constraints are single-process scaling and browser-automation resource pressure.

---

## PHASE 10 — DEPENDENCY ANALYSIS

- **npm:** **87 dependencies + 23 devDependencies** (`package.json`, name `rest-express`).
- **Flutter:** 18 runtime dependencies (`pubspec.yaml`).

### Key npm dependencies (by purpose)

| Purpose | Packages |
| :--- | :--- |
| Server | express, express-session, connect-pg-simple |
| DB/ORM | drizzle-orm, drizzle-kit, drizzle-zod, pg |
| Auth | jsonwebtoken |
| Validation | zod |
| Frontend | react, react-dom, wouter, @tanstack/react-query, react-hook-form, @hookform/resolvers |
| UI | Radix UI primitives, tailwindcss, lucide-react, react-icons |
| AI | OpenAI SDK (+ Gemini/Anthropic provider integrations) |
| Automation | playwright |
| PDF/report | jspdf, jspdf-autotable, html2canvas |
| Build | tsx, esbuild (via build script), vite |

### Key Flutter dependencies
`dio`, `provider`, `flutter_secure_storage`, `geolocator`, `geocoding`, `permission_handler`, `image_picker`, `camera`, `google_mlkit_face_detection`, `intl`, `pdf`, `share_plus`, `package_info_plus`, `url_launcher`, `flutter_svg`.

### Observations
- **Unused packages:** none confirmed without a depcheck pass (recommended, read-only audit did not run installers).
- **Outdated/security:** project memory notes a firewall-blocked `jspdf@2.5.1` (CVE) — uses 3.x/4.x. Run `npm audit` / `flutter pub outdated` for a current CVE snapshot.
- **Heaviest footprint:** Playwright + browser binaries dominate `node_modules` (1.4 GB).

---

## PHASE 11 — DEVOPS

| Item | Status |
| :--- | :--- |
| Deployment | Self-hosted **Hostinger VPS** (`tbjvisionconnect.com`), reverse-proxied by **nginx** to app on port 8080. Deploys apply on next VPS build/deploy (not Replit). |
| Build flow | `npm run build` → `script/build.ts` produces `dist/index.cjs` + `dist/public`. Frontend served by Express static in prod. |
| Process manager | **PM2** (`ecosystem.config.cjs`): app `hrms-pro`, fork mode, 1 instance, 512 MB heap cap, autorestart, 10 max restarts. |
| Docker readiness | ❌ No Dockerfile — not containerized. |
| CloudPanel / nginx | nginx config managed; `scripts/configure-nginx-iclock.sh`, `scripts/nginx-adms-ip.conf` for ADMS device routing. |
| GitHub Actions / CI | Repo includes CI considerations (memory note on npm firewall URLs); no `.github/workflows` detected in scan. |
| Migrations on deploy | Numbered SQL + startup DDL; `scripts/post-merge.sh`, `scripts/run-migrations.cjs`. |
| Env vars | `JWT_SECRET` (set on VPS), optional `OPENAI_API_KEY`/`GOOGLE_GEMINI_API_KEY`/`RESEND_API_KEY`. Loaded via first-imported `server/load-env.ts`. |
| Uploads persistence | VPS deploy move-replaces app dir; `uploads/` symlinked to persistent `$HOME/hrms-uploads`. |
| Production readiness | 🟡 Functional & deployed, but blocked from "production-grade" by plain-text passwords, no rate limiting, single-instance scaling, no container/CI pipeline. |

---

## PHASE 12 — MOBILE APP (Flutter)

| Aspect | Detail |
| :--- | :--- |
| Files / size | 37 Dart files, 11,706 lines, `flutter_app/` 788 KB |
| Architecture | **Feature-first** under `lib/features/` (auth, dashboard, attendance, quick_attendance, leave, leave_approval, payslip, salary, profile, employees, team, jobs, holidays, notifications, locations, geofence, admin) + `lib/core/` |
| State management | **Provider** |
| API layer | **Dio** HTTP client → backend `/api/mobile/*` (66 endpoints) |
| Authentication | JWT access+refresh stored via `flutter_secure_storage`; case-sensitive username (mobile keyboard auto-capitalize caveat noted in memory) |
| Device features | Geolocation/geofencing (`geolocator`/`geocoding`), camera + ML Kit face detection (attendance verification), image picker (KYC docs) |
| Offline support | Limited — `shared_preferences` for light caching; primarily online-first |
| Reports | On-device PDF payslip generation (`pdf` + `share_plus`), mirrors web payslip layout |
| Performance / APK | APK size dominated by universal build + R8 settings (per memory). Distributed as direct `.apk` (no Play Store). No APK currently in repo. |

---

## PHASE 13 — FRONTEND (React)

- **Stack:** React 18 + Vite + TypeScript; shadcn/ui (Radix + Tailwind).
- **Routing:** `wouter`; **47 `<Route>`** registrations in `App.tsx`, split into `ProtectedRouter` (auth) and `PublicRouter` (landing/auth). Pages lazy-loaded with `React.lazy`/`Suspense`.
- **Permission gating:** `ModuleGate` / `module-gate.tsx` wraps protected pages; `access-denied.tsx` fallback.
- **State / data:** TanStack Query is the server-state source of truth; `queryClient.ts` provides a default fetcher with global 401 handling. Auth state via `AuthContext` (`lib/auth.tsx`), polling `/api/auth/me` for trial/billing status.
- **Components:** shared primitives in `components/ui`; domain folders `compliances/`, `payroll/`, `reports/`, `settings/`, `automation/`; cross-cutting widgets (`app-sidebar`, `data-table`, `export-buttons`, `notification-bell`, AI panels).
- **Theme:** `ThemeProvider` (light/dark/system) toggling a class on `documentElement`.
- **Forms:** `react-hook-form` + Zod resolvers using shared insert schemas.
- **Performance:** route-level code splitting; query caching; skeleton/loading states.

---

## PHASE 14 — BACKEND (Express)

- **Layering:** Routes (24 routers) → Services (17) → Repositories (15) → Drizzle/PostgreSQL, fronted by a unified `IStorage` facade (`storage.ts` / `database-storage.ts`; `MemStorage` for tests).
- **Middleware:** body parsing, `express-session` (PG store), `X-Request-Id`, CSRF origin/referer, security headers, `/api` request logging (duration + status).
- **Validation:** Zod at the route boundary using shared schemas.
- **Error handling:** centralized JSON errors; correlation id aids tracing; `error-boundary` on the client.
- **Logging:** request logs + AI logger (key-masking) + automation logs (`automation_logs`).
- **Background jobs / cron:** PostgreSQL-backed queue (`queue-service.ts`) consumed by `automation/queue-worker.ts` (polls ~5s, `SKIP LOCKED` claim, concurrency capped to browser-pool size).
- **Realtime:** SSE (`sse.ts`, `pushToUser`) for notifications and job state.
- **Special integrations:** ADMS push protocol (`adms.ts`) for ZKTeco biometric devices; biometric sync services; email (`email-service.ts`, Resend).

---

## PHASE 15 — AI MODULE

| Aspect | Detail |
| :--- | :--- |
| Providers | **OpenAI** (`gpt-4o-mini`, default) → **Gemini** (`gemini-2.0-flash`) → **Anthropic** (`claude-3-5-sonnet-latest`) → **rule-based** fallback |
| Provider manager | `server/ai/providers/provider-manager.ts` — key loading, `testAiProviders`, `activeProvider` selection; keys from env or `settings` table |
| Fallback chain | Waterfall in `chat-service.ts` and KYC `extraction/kyc.ts` (provider-agnostic; Gemini-only key previously caused empty KYC — now multi-provider) |
| Intent layer | `ai/intents/` — deterministic `detector.ts` + `orchestrator.ts` resolve recognized intents from DB **before** any LLM call (reduces hallucination); only `null` detection falls through to LLM |
| Prompts | Modular under `ai/prompts/` (e.g. `hr-chat.ts` injects live employee context) |
| Domains | workforce, recruitment, attendance, leave, payroll, analytics, insights, decision |
| Usage logging | `ai_usage_logs` + `ai_usage_action_audit`; `metrics/usage.ts` records tokens, latency, estimated USD cost, feature, intent |
| Security | `security/prompt-guard.ts` (injection/jailbreak detection), `security/validation.ts` (length clamp/normalize); RBAC via `authorizeIntent`/`userHasAccess` — composite cross-domain insights must gate **every** surfaced module; logger masks keys |
| Tests | `server/__tests__/ai-*.test.ts` (analytics, extraction, intents, recruitment, workforce) |

---

## PHASE 16 — HRMS MODULE STATUS

| Module | Completion | Health | Notable issues |
| :--- | :--- | :--- | :--- |
| Employee | 90% | 🟢 | Cross-company linking rules centralized |
| Attendance | 95% | 🟢 | ADMS unauth by design |
| Payroll | 90% | 🟢 | Watch field-name drift web↔mobile payslip |
| Leave | 95% | 🟢 | — |
| Recruitment | 85% | 🟢 | AI tenant-isolation guards required |
| Onboarding/KYC | 70% | 🟡 | Needs valid AI key; provider-agnostic now |
| Compliance (CLRA) | 90% | 🟢 | Wage source must mirror Adjustment tab |
| EPFO | 85% | 🟢 | Captcha per-submit reload; tab-following |
| ESIC | 85% | 🟢 | Opens new tabs — follow active page |
| PF | 85% | 🟢 | Via EPFO automation |
| TDS | 40% | 🟠 | Statutory deduction present; dedicated TDS module minimal |
| Shift / Roster | 60% | 🟡 | Time-office policies exist; roster UI partial |
| Assets | 0% | ⚪ | Not implemented |
| Visitor / Gate Pass | 10% | ⚪ | `outdoor_entries` only; no full module |
| Expense | 60% | 🟡 | Basic claim/approval |
| Travel | 0% | ⚪ | Not implemented |
| Training | 0% | ⚪ | Not implemented |
| KRA / KPI | 90% | 🟢 | Template-based scoring |
| Reports | 85% | 🟢 | CLRA + EPF Form 11 + statutory exports |
| Notifications | 95% | 🟢 | SSE realtime |
| Company Mgmt | 90% | 🟢 | Principal–contractor mapping |
| Role Mgmt | 90% | 🟢 | Granular per-module/action |

> Modules marked ⚪ (Assets, Visitor/Gate Pass, Travel, Training) are listed in the requested taxonomy but are **not yet built** in this codebase.

---

## PHASE 17 — CODE QUALITY

| Dimension | Assessment |
| :--- | :--- |
| Architecture | 🟢 Clean layered separation (routes→services→repositories→storage facade); shared schema as single source of truth |
| Naming | 🟢 Consistent, domain-aligned file and symbol naming |
| SOLID | 🟢 Repositories/services respect single-responsibility; storage interface enables substitution |
| DRY | 🟡 Some duplicated report-view markup and SQL window logic (e.g. month-window code repeated across compliance endpoints) |
| KISS | 🟢 Routes kept thin; logic pushed to services |
| Duplication | 🟡 Inline table/JSX repetition in compliance report tab; reusable view components would help |
| Complexity | 🟡 A few very large files (`compliance-routes.ts`, `epfo-esic-routes.ts` ~1,800 lines, `mobile-routes.ts`) concentrate complexity |
| Maintainability | 🟢 Modularized routes/services; memory/docs capture non-obvious decisions |
| Technical debt | 🟡 Plain-text passwords, large monolithic route files, repeated SQL helpers, limited automated test coverage outside AI |

---

## PHASE 18 — PROJECT HEALTH

| Category | Score /100 |
| :--- | ---: |
| Architecture | 85 |
| Backend | 82 |
| Frontend | 84 |
| Flutter | 78 |
| Database | 86 |
| Security | 58 |
| Performance | 72 |
| DevOps | 68 |
| Testing | 45 |
| Documentation | 70 |
| Maintainability | 78 |
| Scalability | 65 |
| **Overall Health** | **~72 / 100** |

**Summary:** A mature, feature-rich, well-layered HRMS with strong compliance/biometric/AI capabilities. Health is held back chiefly by **security hygiene (plain-text passwords, no rate limiting)**, **thin automated testing**, and **single-process scalability**.

---

## PHASE 19 — VISUAL DIAGRAMS

### Architecture Diagram

```
┌──────────────┐     ┌──────────────────┐
│  Web (React) │     │ Mobile (Flutter) │
│  wouter +    │     │ Provider + Dio   │
│  React Query │     │ secure_storage   │
└──────┬───────┘     └────────┬─────────┘
       │ cookie/session        │ JWT Bearer
       └───────────┬───────────┘
                   ▼
        ┌─────────────────────┐
        │  Express (server/)  │
        │  middleware → auth  │
        │  routes(24)         │
        │  services(17)       │
        │  repositories(15)   │
        │  storage facade     │
        └───┬────────┬────────┘
            │        │
   ┌────────▼──┐  ┌──▼────────────┐
   │PostgreSQL │  │ AI providers  │
   │ 67 tables │  │ OpenAI/Gemini │
   └───────────┘  │ /Anthropic    │
            ▲      └───────────────┘
   ┌────────┴──────────┐
   │ Automation worker │  Playwright → EPFO/ESIC portals
   │ (DB queue, SSE)   │  + ADMS push (biometric devices)
   └───────────────────┘
```

### Authentication Flow

```
Web:    login → express-session (PG store) → httpOnly cookie → requireAuth
Mobile: login → JWT access(7d)+refresh(30d) → secure_storage → requireJwtAuth
        ↓ both
   requireModuleAccess / requireAction (user_permissions over MODULE_ACCESS map)
        ↓
   company_id-scoped data access
```

### Request Flow

```
Client → body parse → session → X-Request-Id → CSRF check
       → requireAuth → permission check → Zod validate
       → Service → Repository (Drizzle) → PostgreSQL
       → JSON response → React Query cache / SSE push
```

### Database Flow (multi-tenant)

```
companies ─┬─ users ─┐
           ├─ employees ──┬─ payroll
           │              ├─ attendance
           │              ├─ leave_requests
           │              └─ salary_structures
           ├─ company_contractors ─ contractor_employees
           └─ compliance_* / epfo_* / esic_* / automation_jobs / ai_*
```

### Deployment Flow

```
git push → VPS build (script/build.ts) → dist/index.cjs
        → numbered SQL + startup DDL migrations
        → PM2 restart (hrms-pro, fork, 512MB)
        → nginx reverse proxy (:8080) → tbjvisionconnect.com
        (uploads/ symlinked to persistent $HOME/hrms-uploads)
```

---

## PHASE 20 — FINAL SUMMARY

| Attribute | Value |
| :--- | :--- |
| Project name | HRMS Pro (`rest-express`) |
| Version | 1.0.0 |
| Technology stack | React+Vite+TS, Express, Drizzle/PostgreSQL, Flutter, Playwright, OpenAI/Gemini/Anthropic |
| Total files | 1,335 |
| Total folders | 352 |
| Total lines of code | ~119,460 (source) / ~133,640 (incl. JSON/MD) |
| Repository size | 53 MB (excl. `node_modules` 1.4 GB) |
| Build size | 8.4 MB (`dist/index.cjs` 3.7 MB) |
| Flutter APK size | Not built in repo (universal `.apk`, direct distribution) |
| Backend size | 2.3 MB (`server/`) |
| Frontend size | 3.6 MB (`client/`) |
| Database tables | 67 |
| API count | 444 endpoints |
| Module count | ~18 functional areas (4 taxonomy modules unbuilt) |
| Dependencies | 87 npm prod + 23 dev; 18 Flutter |
| Security status | 🔴 Needs work (plain-text passwords, no rate limiting) — ~58/100 |
| Performance status | 🟡 Good (~72/100) |
| Production readiness | 🟡 Deployed & functional; security + scalability gaps before "production-grade" |

### Top 25 Risks
1. Plain-text password storage/comparison.
2. No API/login rate limiting.
3. Unauthenticated ADMS biometric push (serial-trust spoofing).
4. No strict Content-Security-Policy.
5. Single-process PM2 (no horizontal scaling / no clustering).
6. Thin automated test coverage outside AI module.
7. No Docker/containerization or formal CI pipeline.
8. Very large monolithic route files (compliance/epfo/mobile).
9. Provider API keys stored in DB `settings` (secret-at-rest concern).
10. 512 MB heap cap vs. memory-heavy Playwright automation.
11. Browser-automation fragility against government-portal UI changes.
12. Uploads depend on a symlink surviving deploys.
13. Cross-company data-leak surface if tenant guards are missed on new routes.
14. Dual migration mechanism (dev push vs. prod SQL) risks drift.
15. CLRA wage-source logic must stay in lockstep across reports.
16. AI cost/abuse without per-tenant usage quotas.
17. Composite AI insights could leak sibling-module aggregates if under-gated.
18. No refresh-token rotation/blacklist observed.
19. CORS allowlist must be tightly verified in production.
20. PDF generation memory spikes on large registers.
21. Duplicate font assets / asset bloat (minor).
22. No observability/APM stack noted.
23. Mobile offline support minimal (online-first).
24. Limited dependency CVE monitoring automation.
25. TDS/Shift/Roster modules partial; Assets/Visitor/Travel/Training absent.

### Top 25 Strengths
1. Clean layered backend (routes→services→repositories→storage facade).
2. Shared Drizzle schema as single source of truth.
3. Strong multi-tenant isolation via `company_id` + segment scoping.
4. Granular module/action RBAC with per-user overrides.
5. Parameterized queries (Drizzle) → robust SQL-injection resistance.
6. Comprehensive Zod validation at boundaries.
7. Solid file-upload security (denylist/allowlist/limits/path-safety).
8. CSRF protection via origin/referer for cookie requests.
9. Multi-provider AI with deterministic intent layer + rule fallback.
10. AI usage logging (tokens/cost/latency) and key masking.
11. Native ADMS biometric integration (ZKTeco push).
12. Deep Indian statutory compliance (EPFO/ESIC/CLRA, EPF Form 11).
13. Robust DB-backed job queue with `SKIP LOCKED` concurrency.
14. Encrypted portal session credentials (`aes-256-gcm`).
15. Realtime via SSE.
16. Frontend code splitting + React Query caching.
17. Feature-first, maintainable Flutter app.
18. Targeted DB indexing on hot paths + dedupe constraints.
19. FK integrity + soft-delete + audit logs.
20. Well-documented non-obvious decisions (project memory).
21. Lazy-loaded, permission-gated routing.
22. Reusable shadcn/ui design system + dark mode.
23. PM2 self-healing (autorestart, memory-restart).
24. Cross-company employee linking rules centralized.
25. AI test suites present for critical AI paths.

### Top 50 Recommendations
1. **Hash passwords** with bcrypt/argon2; migrate existing rows.
2. Add login + API **rate limiting** (e.g. express-rate-limit).
3. Authenticate/secure **ADMS** (device tokens, IP allowlist — partially present via nginx).
4. Add a strict **Content-Security-Policy** + helmet.
5. Introduce **refresh-token rotation** and revocation list.
6. Add **CI pipeline** (lint, typecheck, tests, build) on push.
7. Containerize with a **Dockerfile** for reproducible deploys.
8. Move all secrets to env/secret-manager; stop DB-stored API keys.
9. Add **horizontal scaling** (PM2 cluster or multi-instance + sticky/SSE adapter).
10. Expand **automated tests** beyond AI (services/repositories/routes).
11. Add **integration tests** for tenant-isolation guarantees.
12. Split monolithic route files (compliance/epfo/mobile) into sub-modules.
13. Extract repeated **month-window/SQL helpers** into shared utilities.
14. Factor compliance report views into **reusable components**.
15. Add **APM/observability** (metrics, tracing, error tracking).
16. Add **structured logging** with log levels and shipping.
17. Enforce a **tenant-guard lint/test** for every new route.
18. Add **per-tenant AI usage quotas** + budget alerts.
19. Audit **composite AI insight gating** across all surfaced modules.
20. Automate **dependency CVE scanning** (npm audit / Dependabot, flutter pub outdated).
21. Pin/refresh outdated packages; verify jspdf 3.x/4.x usage.
22. Add **DB backup/restore** runbook + scheduled backups.
23. Add **health/readiness endpoints** + uptime monitoring.
24. Introduce **migration drift checks** between dev push and prod SQL.
25. Add **rate-limited, audited** admin/destructive actions.
26. Harden **CORS allowlist** for production domains only.
27. Add **request size limits** + timeouts on heavy report endpoints.
28. Stream/paginate large **PDF/Excel** generation to bound memory.
29. Cache expensive **dashboard aggregates** with invalidation.
30. Add **idempotency keys** for payroll finalize/bulk operations.
31. Consolidate **duplicate font/static assets**.
32. Add **e2e tests** for critical flows (login, payroll run, leave approval).
33. Document **API contract** (OpenAPI/Swagger) for 444 endpoints.
34. Add **field-level audit** for sensitive employee/payroll changes.
35. Implement **soft-delete consistency** policy across all tables.
36. Add **mobile offline queue** for attendance punches.
37. Strengthen **mobile username handling** (trim/lowercase normalization).
38. Add **2FA/MFA** for admin roles.
39. Encrypt **PII at rest** (Aadhaar/PAN/bank) beyond app-layer.
40. Add **data retention/PII purge** workflows for compliance.
41. Add **Playwright selector resilience** + portal-change alerts.
42. Add **circuit breaker/retry** policies for AI provider calls.
43. Provide **graceful degradation UI** when AI keys absent.
44. Add **feature flags** for partial modules (TDS/Shift/Roster).
45. Complete or formally **descope** Assets/Visitor/Travel/Training.
46. Add **load testing** for automation + report endpoints.
47. Introduce **DB connection pooling** tuning + slow-query logging.
48. Add **role-change audit** + least-privilege review process.
49. Add **automated post-deploy smoke tests**.
50. Establish a **security review checklist** in PR template.

---

*End of report — generated read-only; no project files were modified.*
