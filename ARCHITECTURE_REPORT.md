# HRMS Pro — Architecture Audit & Analysis Report

**Generated:** June 13, 2026  
**Last updated:** June 20, 2026 — Phase-3 performance + error-handling/security hardening applied (see status banners below)  
**Scope:** Full-stack codebase — Backend (Express/Node), Frontend (React/Vite), Database (PostgreSQL/Drizzle), Mobile (Flutter)  
**Analyst:** AI Architecture Reviewer  

> **Phase-1 update (June 19, 2026):** The four critical security issues and the "zero database indexes" gap identified in this report have been **resolved**. Sections affected are annotated with `✅ RESOLVED` banners that preserve the original findings for traceability. See `CHANGELOG.md` for the exact diff.

> **Phase-3 update (June 20, 2026):** Two further workstreams landed:
> - **Performance (Task #9, merged):** route-level code splitting (`App.tsx` `React.lazy`/`Suspense`), on-demand TensorFlow/face-api loading (no longer loaded at boot), a 30s TTL cache on dashboard stats, tuned TanStack Query `gcTime`, and virtualization of the employees table (`@tanstack/react-virtual`). Initial JS bundle dropped from **2,807 kB → 393 kB**. Metrics in `docs/performance-optimization.md`.
> - **Error handling, logging & security (Task #10):** a React **error boundary** wraps the app; the backend gained **per-request correlation IDs** (`X-Request-Id`), **structured request/error logging**, a **hardened centralized error handler** (no stack/detail leak to clients on 5xx in production), **baseline security headers**, an **Origin/Referer CSRF check** for cookie-authenticated mutations, and **download path-traversal containment**. The live JWT secret committed in `.replit` is being **rotated** to a managed Secret. Details in `docs/security-review.md`.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack Report](#2-technology-stack-report)
3. [Folder Structure Analysis](#3-folder-structure-analysis)
4. [Module Analysis](#4-module-analysis)
5. [Backend Architecture Review](#5-backend-architecture-review)
6. [Frontend Architecture Review](#6-frontend-architecture-review)
7. [Database Architecture Review](#7-database-architecture-review)
8. [Dependency Audit](#8-dependency-audit)
9. [Performance Audit](#9-performance-audit)
10. [Security Audit](#10-security-audit)
11. [Dead Code Analysis](#11-dead-code-analysis)
12. [Technical Debt Report](#12-technical-debt-report)
13. [Refactoring Roadmap](#13-refactoring-roadmap)
14. [Final Recommendations](#14-final-recommendations)

---

## 1. Executive Summary

### Overall Health Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Overall Application Health** | **7 / 10** | Phase-1 security/indexing + Phase-3 perf & error-handling fixes applied; architectural debt (god-file, no service layer) remains |
| **Maintainability** | 4.5 / 10 | God-object routes file & 6k-line page components remain; error boundary + structured logging improve operability |
| **Scalability** | 6 / 10 | ✅ DB indexes added; ✅ dashboard cache + table virtualization; single PM2 instance & no query pagination remain |
| **Security** | 7.5 / 10 | ✅ Secret fallbacks removed, auth-bypass route removed, upload allow-list, CSRF Origin-check, download path-traversal containment, security headers, no-stack-leak error responses; ⚠️ JWT secret rotation in progress, ADMS auth & committed `SESSION_ENCRYPTION_KEY` still open |
| **Performance** | 7.5 / 10 | ✅ Indexes + route code-splitting (bundle 2,807→393 kB), lazy TensorFlow, 30s dashboard cache, table virtualization; synchronous PDF gen remains |
| **Code Quality** | 5.5 / 10 | Inconsistent validation & scattered PDF logic remain; centralized error handling + correlation IDs added |

### Key Numbers at a Glance

| Metric | Value |
|--------|-------|
| Total API Routes | **~300** |
| Database Tables | **55** |
| Largest Backend File | **7,398 lines** (`server/routes.ts`) |
| Largest Frontend File | **6,379 lines** (`client/src/pages/reports.tsx`) |
| Total Backend Lines (core) | **~15,900** |
| Total Frontend Page Lines (top 6) | **~20,700** |
| SQL Migration Files | 21 (incl. Phase-1 index migration) |
| Unused npm Packages (direct) | 3 confirmed |
| Critical Security Issues | 0–1 ⚠️ (4 code-level issues resolved Jun 19 2026; CSRF + path-traversal + headers added Jun 20 2026; live JWT secret rotation in progress; committed `SESSION_ENCRYPTION_KEY` newly flagged) |

### Technical Debt Assessment

The application is a **monolithic, feature-complete HRMS** that has grown organically without enforced architectural boundaries. The core functionality (payroll, attendance, EPFO/ESIC, AI assistant, biometric) works, but the codebase is accumulating debt at an accelerating rate:

- The single `server/routes.ts` file at 7,398 lines will break under team collaboration.
- ✅ *(Resolved June 19, 2026)* ~~No database indexes means every join on `company_id` or `employee_id` is a full table scan at scale.~~ 19 indexes now cover the high-traffic foreign-key and filter columns.
- ✅ *(Resolved June 19, 2026)* ~~Hardcoded fallback secrets pose a production security risk.~~ Fallbacks removed; the server fails fast if `JWT_SECRET` / `SESSION_SECRET` are unset.
- Page-level components with 4,000–6,000 lines cannot be tested, reused, or understood in isolation.

Estimated technical debt: **~35% of codebase** requires architectural rework to ensure long-term maintainability. Phase-1 closed the critical security and indexing gaps; the bulk of remaining debt is the monolithic routes file, missing service layer, and oversized page components.

---

## 2. Technology Stack Report

### Frontend

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | React | 18.3.1 | — |
| Build Tool | Vite | 7.3.0 | Client bundler |
| Language | TypeScript | 5.6.3 | `strict` mode not verified |
| Routing | Wouter | 3.3.5 | Lightweight, good choice |
| State (Server) | TanStack Query | v5.60.5 | Good usage throughout |
| State (Auth) | React Context | — | Custom `AuthProvider` |
| Forms | React Hook Form + Zod | — | Inconsistently applied |
| UI Components | Shadcn/UI + Radix UI | — | 25+ Radix primitives |
| Icons | Lucide React + react-icons | — | Duplicate (react-icons unused) |
| Charts | Recharts | 2.15.2 | — |
| Animation | Framer Motion | 11.13.1 | — |
| PDF Export | jsPDF + jspdf-autotable + html2canvas | — | Scattered across pages |
| Excel Export | xlsx (SheetJS) | 0.18.5 | Multiple usages |

### Backend

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Express | 5.0.1 | — |
| Runtime | Node.js | ~20 LTS | Via `tsx` in dev, esbuild for prod |
| Language | TypeScript | 5.6.3 | — |
| ORM | Drizzle ORM | 0.39.3 | Good choice, but underutilized |
| Validation | Zod + drizzle-zod | — | Inconsistently applied |
| Session Auth | Passport (passport-local) + express-session | — | Web interface |
| JWT Auth | jsonwebtoken | 9.0.3 | Mobile/API interface |
| Session Store | connect-pg-simple + PostgreSQL | — | Good for persistence |
| File Uploads | Multer | 2.0.2 | ✅ Extension allow-list + dangerous-extension blocklist added (`server/upload-security.ts`); validates by extension, not MIME content |
| Email | Not detected | — | **No email service integrated** |
| PDF Gen (Server) | PDFKit | 0.18.0 | Used for compliance reports |
| Rate Limiting | express-rate-limit | 8.3.2 | Applied but scope unknown |
| WebSocket | ws | 8.18.0 | Used for SSE/live screen |
| Process Manager | PM2 | — | Single fork instance, 512MB cap |

### Database

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | PostgreSQL | Production via `DATABASE_URL` |
| ORM | Drizzle ORM | Schema-first, 55 tables |
| Migrations | Manual SQL files | 21 files in `migrations/` |
| Session Store | PostgreSQL (connect-pg-simple) | — |
| Indexes | ✅ 19 added in schema (high-traffic FK/filter cols) | FK-constraint coverage still absent |
| Foreign Keys | **None enforced** | Application-level only |

### AI & Automation

| Component | Technology | Notes |
|-----------|-----------|-------|
| Primary AI | OpenAI GPT-4o-mini | Key from DB or env |
| Fallback AI | Google Gemini 1.5 Flash | Key from DB or env |
| Rule-Based Fallback | Custom logic | Triggers when both AI keys absent |
| Face Matching | @vladmandic/face-api + TensorFlow.js | Server-side, heavy dependency |
| Portal Automation | Playwright + Playwright Core | Both listed — potential redundancy |
| Browser Pool | Custom `browser-pool.ts` | Manages Chromium instances |

### Mobile

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Flutter/Dart | — |
| State | Provider | — |
| HTTP | Dio | — |
| Storage | flutter_secure_storage | — |
| Auth | JWT Bearer token | Shares backend JWT endpoint |

### External Integrations

| Service | Integration | Status |
|---------|------------|--------|
| EPFO Portal | Playwright automation | Functional |
| ESIC Portal | Playwright automation | Functional |
| ZKTeco Biometric | zkteco-js + ADMS protocol | Functional, unauthenticated |
| OpenAI | REST API | Configurable |
| Google Gemini | SDK | Configurable |
| GitHub | Replit integration | Configured |
| Email Service | **None** | **Missing** |
| SMS/OTP | **None** | **Missing** |

---

## 3. Folder Structure Analysis

```
hrms-pro/
├── client/                      # React frontend (Vite)
│   └── src/
│       ├── pages/               # 40+ page components — many oversized
│       │   └── website/         # Public marketing pages
│       ├── components/          # Shared UI components
│       │   ├── ui/              # Shadcn/UI primitives (25 files)
│       │   └── automation/      # live-screen.tsx
│       ├── hooks/               # 4 custom hooks
│       ├── lib/                 # Utilities (auth, queryClient, PDF shims)
│       └── App.tsx              # Router
├── server/                      # Express backend
│   ├── automation/              # Playwright automation sub-system
│   │   ├── browser-pool.ts      # Chromium lifecycle management
│   │   ├── epfo-service.ts      # EPFO portal automation
│   │   ├── esic-service.ts      # ESIC portal automation
│   │   ├── queue-worker.ts      # Job queue processor
│   │   └── session-manager.ts   # Portal session handling
│   ├── routes.ts                # ⚠️ GOD FILE — 7,398 lines
│   ├── epfo-esic-routes.ts      # EPFO/ESIC API routes (1,899 lines)
│   ├── compliance-routes.ts     # Compliance API routes (1,641 lines)
│   ├── ai-hr-routes.ts          # AI HR assistant routes (776 lines)
│   ├── ai-service.ts            # AI multi-provider service (819 lines)
│   ├── storage.ts               # IStorage interface (1,993 lines)
│   ├── database-storage.ts      # Storage implementation (1,403 lines)
│   ├── mobile-routes.ts         # Mobile JWT API
│   ├── kra-routes.ts            # KRA/KPI routes
│   ├── index.ts                 # Server entry point (630 lines)
│   ├── db.ts                    # Drizzle DB connection
│   ├── jwt-auth.ts              # JWT middleware
│   ├── notifications.ts         # Notification helpers
│   ├── adms.ts                  # Biometric ADMS protocol handler
│   ├── biometric-attendance-sync.ts
│   ├── biometric-sync.ts
│   ├── face-match.ts            # TensorFlow face matching
│   ├── portal-session-service.ts
│   ├── queue-service.ts
│   ├── sse.ts                   # Server-Sent Events
│   ├── seed.ts                  # Dev seed data
│   └── static.ts                # Static file serving
├── shared/
│   ├── schema.ts                # 55 tables, 1,579 lines
│   └── permissions.ts           # RBAC definitions
├── migrations/                  # 21 manual SQL migration files
├── flutter_app/                 # Flutter mobile app
├── script/build.ts              # esbuild production bundler
├── scripts/                     # Deployment scripts
└── uploads/                     # File upload storage
```

### Files with Unclear Responsibility

| File | Issue |
|------|-------|
| `server/routes.ts` | Contains auth, payroll, attendance, employees, biometric, reports, KYC — should be 8+ separate files |
| `server/adms.ts` | Mixes network protocol parsing, device authentication, and DB writes in one file |
| `server/index.ts` | 630 lines — mixes middleware setup, session config, route registration, and server boot |
| `client/src/pages/settings.tsx` | 3,761 lines — mixes company settings, user management, API key config, salary heads, and statutory settings |
| `client/src/pages/reports.tsx` | 6,379 lines — contains PDF/Excel generation, data queries, and UI all in one file |

### Files Violating Separation of Concerns

| File | Violation |
|------|-----------|
| `server/routes.ts` | Route handlers contain multi-page business logic (payroll calculation, PDF generation) |
| `server/compliance-routes.ts` | PDF layout code embedded directly in route handlers |
| `client/src/pages/reports.tsx` | Data transformation, PDF styling, and React UI in one file |
| `server/ai-service.ts` | DB queries (`db.select`) mixed with AI provider orchestration |

---

## 4. Module Analysis

### Module Map

| # | Module | Purpose | Key Files | Complexity | Refactor Priority |
|---|--------|---------|-----------|------------|-------------------|
| 1 | **Employee Management** | CRUD, profiles, org chart | `routes.ts`, `employees.tsx`, `add-employee.tsx` | High | 🔴 High |
| 2 | **Attendance** | Clock-in/out, GPS, biometric sync | `routes.ts`, `attendance.tsx`, `my-attendance.tsx` | High | 🟡 Medium |
| 3 | **Leave Management** | Requests, approvals, adjustments | `routes.ts`, `leave.tsx` | Medium | 🟢 Low |
| 4 | **Payroll** | Salary calculation, payslips, FNF | `routes.ts`, `payroll.tsx` | Very High | 🔴 High |
| 5 | **Compliance (General)** | PT, LWF, Bonus registers | `compliance-routes.ts`, `compliances.tsx` | Very High | 🔴 High |
| 6 | **PF / EPFO** | UAN, ECR filing, KYC, challans | `epfo-esic-routes.ts`, `epfo.tsx` | Very High | 🟡 Medium |
| 7 | **ESIC** | IP registration, monthly returns | `epfo-esic-routes.ts`, `esic.tsx` | Very High | 🟡 Medium |
| 8 | **Automation Jobs** | Playwright job queue | `automation/`, `automation-jobs.tsx` | High | 🟡 Medium |
| 9 | **Recruitment** | Job postings, applications, interviews | `routes.ts`, `job-postings.tsx`, `job-applications.tsx` | Medium | 🟢 Low |
| 10 | **Biometric** | ZKTeco device sync, punch logs | `adms.ts`, `routes.ts`, `biometric.tsx` | High | 🟡 Medium |
| 11 | **AI Assistant** | Employee KYC chat, HR dashboard | `ai-hr-routes.ts`, `ai-service.ts`, `ai-assistant.tsx` | Medium | 🟢 Low |
| 12 | **Compliance AI** | EPFO/ESIC co-pilot, error analysis | `ai-service.ts`, `compliance-ai-panel.tsx` | Low | 🟢 Low |
| 13 | **KRA/KPI** | Goal setting, performance tracking | `kra-routes.ts`, `kra-kpi.tsx` | Medium | 🟢 Low |
| 14 | **Loan & Advances** | Employee loan management | `routes.ts`, `loan-advances.tsx` | Low | 🟢 Low |
| 15 | **Reports** | PDF/Excel exports across all modules | `routes.ts`, `reports.tsx` | Very High | 🔴 High |
| 16 | **Settings** | Company config, salary heads, API keys | `routes.ts`, `settings.tsx` | High | 🟡 Medium |
| 17 | **Notifications** | In-app notification system | `notifications.ts`, `notification-bell.tsx` | Low | 🟢 Low |
| 18 | **Billing / CD Wallet** | Credit deductions, billing | `routes.ts`, `billing.tsx` | Medium | 🟢 Low |
| 19 | **Mobile App** | Employee self-service | `flutter_app/`, `mobile-routes.ts` | Medium | 🟢 Low |
| 20 | **Public Website** | Marketing landing pages | `pages/website/` | Low | 🟢 Low |

### Module with No Email Integration

> ⚠️ **Gap Identified:** Multiple modules (recruitment offers, leave approval notifications, payroll payslips, KYC follow-ups) logically require email delivery. Currently, the system only has in-app notifications. There is no SMTP/SES/SendGrid integration. The `ai_follow_up_tasks` scheduler creates reminders but cannot email them.

---

## 5. Backend Architecture Review

### Route File Summary

| File | Lines | Routes | Role |
|------|-------|--------|------|
| `server/routes.ts` | **7,398** | ~218 | Primary monolith — all core business logic |
| `server/epfo-esic-routes.ts` | 1,899 | 44 | EPFO/ESIC automation & filings |
| `server/compliance-routes.ts` | 1,641 | 23 | Legal registers, PT, LWF, Bonus |
| `server/ai-hr-routes.ts` | 776 | 15 | AI assistant, KYC, compliance chat |
| `server/kra-routes.ts` | ~400 | ~10 | KRA/KPI management |
| `server/mobile-routes.ts` | ~300 | ~12 | Flutter app API (JWT) |
| **Total** | **~12,400** | **~300** | — |

### Critical Backend Issues

#### Issue 1: God-Object Route File
`server/routes.ts` at **7,398 lines** handles authentication, employees, payroll, attendance, biometric, recruitment, and more. This is the single most urgent architectural problem:

```
Domains mixed in routes.ts:
  ├── Auth (login, logout, me)           ~200 lines
  ├── Users & Permissions                ~300 lines  
  ├── Employees (CRUD, bulk upload)      ~800 lines
  ├── Attendance & Leave                 ~600 lines
  ├── Payroll (calculations, payslips)   ~1,200 lines
  ├── Biometric (ADMS, devices, sync)    ~800 lines
  ├── Recruitment (postings, apps)       ~500 lines
  ├── Settings & Configuration           ~600 lines
  ├── Reports & Exports                  ~800 lines
  └── Miscellaneous (holidays, loans)    ~600 lines
```

#### Issue 2: Duplicate Route with Auth Bypass

```
POST /api/automation/jobs/:id/resume
  ├── server/epfo-esic-routes.ts:1805  → requireAuth + adminRoles ✅
  └── server/routes.ts:7368            → requireAuth only ⚠️ SECURITY RISK
```

Any authenticated user (including `employee` role) can resume automation jobs via the `routes.ts` endpoint.

#### Issue 3: Inline Business Logic in Route Handlers

```typescript
// Example from routes.ts — payroll calculation inside route handler
app.post("/api/payroll/generate", requireAuth, async (req, res) => {
  // 200+ lines of salary calculation, PF/ESIC computation,
  // loan deduction, and PDF generation — all inline
});
```

No service layer exists. Business logic is tightly coupled to HTTP request/response.

#### Issue 4: Inconsistent Input Validation

```
Routes WITH Zod validation:   ~40% of routes (mostly EPFO/ESIC module)
Routes WITHOUT validation:    ~60% of routes (most of routes.ts)

Example vulnerable patterns:
  app.post("/api/biometric/devices", ...)  → No schema validation
  app.post("/api/employees/:id/...", ...)  → Uses req.body directly
  req.params.id                            → No UUID format check
```

#### Issue 5: Storage Layer Complexity

`server/storage.ts` defines `IStorage` with **200+ methods** across 1,993 lines. This interface is too coarse — it mixes read/write operations for 55 tables without any domain grouping. The implementation in `database-storage.ts` (1,403 lines) partially implements this interface.

#### Issue 6: AI Service — Direct DB Access

`server/ai-service.ts` imports `db` directly from `./db`, bypassing the `IStorage` abstraction:

```typescript
// ai-service.ts — bypasses storage layer
import { db } from "./db";
const records = await db.select(...).from(aiMessages).where(...);
```

This creates circular dependencies and makes the service untestable in isolation.

#### Architecture Pattern Summary

```
Current (Monolithic):
  HTTP Request → routes.ts → inline logic → db direct → HTTP Response

Recommended (Layered):
  HTTP Request → Route Handler → Service Layer → Repository → DB → Response
```

---

## 6. Frontend Architecture Review

### Page Size Analysis

| Page | Lines | Problem |
|------|-------|---------|
| `reports.tsx` | **6,379** | Monolith: PDF logic + queries + UI + Excel generation |
| `compliances.tsx` | **4,673** | 10+ compliance registers in one file |
| `settings.tsx` | **3,761** | Company config + users + salary heads + API keys |
| `payroll.tsx` | **2,512** | Salary generation + payslip + FNF UI in one file |
| `esic.tsx` | **1,806** | Reasonable for scope, but inline sub-components |
| `epfo.tsx` | **1,566** | Reasonable for scope |

### Component Architecture Issues

#### 1. Inline Sub-Components (Most Critical)
Almost every large page defines its own internal components (e.g., `function RegistrationTab()`, `function ReturnFilingTab()`) that are never exported and cannot be tested or reused:

```typescript
// settings.tsx — typical pattern
function ApiKeysTab() { /* 200 lines */ }
function CompanyProfileTab() { /* 300 lines */ }
function SalaryHeadsTab() { /* 400 lines */ }

export default function Settings() {
  // All tabs rendered inline — not extractable
}
```

#### 2. Repeated PDF/Excel Logic
`jsPDF`, `jspdf-autotable`, and `xlsx` are imported and configured independently in **at least 6 files** (reports.tsx, compliances.tsx, payroll.tsx, epfo.tsx, esic.tsx). Header styling, footer text, and table formatting are duplicated.

#### 3. Repeated API Fetching Patterns
Every page defines its own `queryFn` inline rather than using a centralized API client layer:

```typescript
// Pattern repeated 50+ times across pages
const { data } = useQuery({
  queryKey: ["/api/employees"],
  queryFn: async () => {
    const res = await fetch("/api/employees", { credentials: "include" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  }
});
```

A typed API client (e.g., `api.employees.list()`) would eliminate this duplication.

#### 4. State Management — Good Foundation, Inconsistent Application

```
Auth State:   AuthProvider (React Context) — Good ✅
Server State: TanStack Query v5 — Good ✅
Local UI:     useState/useReducer — Appropriate ✅
Missing:      No global UI state store (e.g., active company for super_admin)
```

The `companyId` for super_admin is often passed as a prop through 3–4 levels rather than via context.

#### 5. Missing Features

| Feature | Status |
|---------|--------|
| Error Boundaries | ✅ Added (Jun 20 2026) — `error-boundary.tsx` wraps the app with a friendly fallback |
| Suspense/Loading skeletons | ✅ Route-level `Suspense` added (Jun 19 2026, code-splitting); per-section skeletons still inconsistent |
| Accessibility (ARIA) | Minimal — only data-testid attributes |
| SEO meta tags | Present on website pages only |
| Dark Mode | Theme provider exists but not all pages honour it |

#### Component Inventory

```
Shared Components (client/src/components/):
  ✅ app-sidebar.tsx           — Navigation shell
  ✅ compliance-ai-panel.tsx   — AI co-pilot panel
  ✅ module-gate.tsx           — Permission wrapper
  ✅ notification-bell.tsx     — Notification UI
  ✅ searchable-employee-select.tsx — Reusable picker
  ✅ sortable-head.tsx         — Table sort header
  ✅ theme-provider.tsx        — Dark mode
  ✅ trial-banner.tsx          — Trial state
  ⚠️ coming-soon.tsx (page)   — Unused placeholder

Missing Shared Components (currently inlined in pages):
  ❌ DataTable (generic)       — Reinvented 20+ times
  ❌ PageHeader                — Duplicated structure in every page
  ❌ ConfirmDialog             — Reinvented in multiple places
  ❌ StatusBadge               — Each page defines its own color map
  ❌ ExportButtons             — PDF/Excel buttons duplicated everywhere
```

---

## 7. Database Architecture Review

### Entity Relationship Overview

```
companies (1) ──────────── employees (N)
companies (1) ──────────── users (N)
employees (1) ──────────── attendance (N)
employees (1) ──────────── leave_requests (N)
employees (1) ──────────── payroll (N)
employees (1) ──────────── salary_structures (N)
employees (1) ──────────── epfo_registrations (N)
employees (1) ──────────── esic_registrations (N)
employees (1) ──────────── biometric_punch_logs (N)
employees (1) ──────────── ai_conversations (N)
companies (1) ──────────── automation_jobs (N)
companies (1) ──────────── cd_accounts (1)
companies (1) ──────────── portal_sessions (N)
job_postings (1) ──────── job_applications (N)
automation_jobs (1) ─────── automation_logs (N)
```

> All relationships are **application-enforced only** — no FK constraints exist in the database.

### Table Inventory (55 Tables)

| Domain | Tables | Count |
|--------|--------|-------|
| Core / Organization | companies, company_contractors, contractor_employees, master_departments, master_designations, master_locations, contractor_masters | 7 |
| Users & Employees | users, employees, candidate_profiles, previous_experiences, profile_update_requests | 5 |
| Time & Attendance | attendance, leave_types, leave_requests, leave_adjustments, comp_off_applications, outdoor_entries, time_office_policies, holidays | 8 |
| Payroll & Statutory | salary_structures, payroll, earning_heads, deduction_heads, statutory_settings, wage_grades, fnf_settlements, loan_advances, compliance_adjustments | 9 |
| Biometric | biometric_devices, biometric_punch_logs, biometric_device_users, adms_activity_log | 4 |
| Recruitment | job_postings, job_applications | 2 |
| Billing | cd_accounts, cd_transactions, daily_billing_logs, invoices | 4 |
| EPFO/ESIC Automation | automation_jobs, automation_logs, portal_sessions, epfo_registrations, epfo_kyc_records, epfo_ecr_returns, esic_registrations, esic_monthly_returns, esic_fetched_employees, challans, compliance_calendar_events | 11 |
| AI & System | ai_conversations, ai_messages, ai_follow_up_tasks, kyc_submission_status, settings, user_permissions, module_access_requests, notifications | 8 |
| KRA | (kra_assignments, kra_templates, etc.) | ~3 |

### Critical Database Issues

#### Issue 1: Zero Indexes (Highest Severity) — ✅ RESOLVED (June 19, 2026)

> **Fixed:** 19 indexes were added in `shared/schema.ts` and shipped as an idempotent migration (`migrations/008_add_recommended_indexes.sql`, using `CREATE INDEX IF NOT EXISTS`). Coverage: `employees(company_id; company_id,status; user_id)`, `attendance(employee_id,date; company_id,date)`, `leave_requests(company_id; employee_id; status)`, `salary_structures(employee_id; company_id)`, `payroll(company_id,month,year; employee_id)`, `biometric_punch_logs(company_id,punch_date; employee_id)`, `notifications(user_id,is_read)`, `automation_jobs(company_id,job_type,status; job_type,status,completed_at)`, `automation_logs(job_id)`, `esic_fetched_employees(company_id)`. Verified-applied to the dev DB; apply to prod via `psql -f` or `npm run db:push`. *(Original finding preserved below.)*

Previously, the `shared/schema.ts` file defined **no `.index()` calls** whatsoever. Every query that filtered or joined on these columns did a full table scan:

```sql
-- Missing critical indexes (now added):
employees.company_id          -- Used in every multi-tenant query
attendance.employee_id        -- Used in every attendance query  
attendance.date               -- Used in date-range queries
payroll.employee_id           -- Used in salary calculations
leave_requests.employee_id    -- Used in leave balance queries
biometric_punch_logs.employee_id  -- High-volume table
biometric_punch_logs.punch_time   -- Used in date-range queries
automation_jobs.company_id    -- Used in job list queries
automation_jobs.status        -- Used in queue worker
ai_messages.conversation_id   -- Used in chat history queries
notifications.user_id         -- Used in notification fetching
```

> **Impact:** At 1,000 employees with 300 days of attendance = 300,000 rows. A query filtering by `company_id` without an index scans all 300,000 rows. At 10,000 employees, this becomes catastrophic.

#### Issue 2: No Foreign Key Constraints

```
Risk: Deleting a company does not cascade-delete employees, payroll, or attendance.
Risk: Deleting an employee leaves orphaned payroll, leave, and biometric records.
Risk: No referential integrity — corrupt data can silently enter the system.
```

#### Issue 3: Mixed Numeric Types for Financial Data

| Table | Column | Type | Risk |
|-------|--------|------|------|
| `contractor_masters` | `service_charge_percent` | `real` | Floating-point precision loss |
| `salary_structures` | `grossSalary`, `basicSalary` | `integer` | Cannot represent paise |
| `cd_accounts` | `creditBalance`, `costPerEmployee` | `numeric` | Correct |
| `payroll` | `grossPay`, `netPay` | `integer` | Truncates decimals |

Financial columns should consistently use `numeric(12,2)` or store amounts in paise as `integer`.

#### Issue 4: Redundant / Overlapping Tables

| Tables | Overlap |
|--------|---------|
| `candidate_profiles` + `employees` | Both store PAN, Aadhaar, bank details, address |
| `profile_update_requests` + `kyc_submission_status` | Both track employee data update workflows |
| `esic_fetched_employees` | Shadow copy of employee data from ESIC portal — no clear sync strategy |

#### Issue 5: Manual Migration Management

21 SQL files in `migrations/` are applied manually. There is no migration tracking table (like Drizzle Migrate or Flyway) to know which migrations have run on a given environment. (The Phase-1 index migration `008_add_recommended_indexes.sql` is idempotent — safe to re-run — which partially mitigates this for that file, but the underlying gap remains.)

### Query Optimization Opportunities

> ✅ *(June 19, 2026)* The indexes in the "Recommended" column below have now been implemented (see Issue 1). The automation-queue index was shipped as `(job_type, status, completed_at)`.

| Query Pattern | Current | Recommended |
|---------------|---------|-------------|
| Monthly attendance by company | Full scan on `attendance` | Index on `(company_id, date)` |
| Employee list by company | Full scan on `employees` | Index on `(company_id, status)` |
| Automation job queue | Full scan on `automation_jobs` | Index on `(status, scheduled_at)` |
| Notification unread | Full scan on `notifications` | Index on `(user_id, is_read)` |
| Punch log processing | Full scan on `biometric_punch_logs` | Index on `(employee_id, punch_time)` |

---

## 8. Dependency Audit

### Confirmed Unused Packages (Safe to Remove)

| Package | Evidence | Savings |
|---------|---------|---------|
| `react-icons` | No imports found in `client/src/` | ~1.2MB bundle |
| `@replit/connectors-sdk` | No imports found anywhere | ~0.2MB |
| `tw-animate-css` | No imports found | ~0.1MB |
| `@jridgewell/trace-mapping` | Transitive dep explicitly listed | Should be implicit |

### Duplicate / Redundant Packages

| Situation | Packages | Recommendation |
|-----------|---------|----------------|
| Both Playwright versions | `playwright` + `playwright-core` | Evaluate if both needed; `playwright` includes `playwright-core` |
| Two icon libraries | `lucide-react` + `react-icons` | Remove `react-icons` |
| Two session stores | `memorystore` + `connect-pg-simple` | `memorystore` is dev-only; ensure prod uses pg store |

### Potentially Outdated / Risky Packages

| Package | Concern |
|---------|---------|
| `xlsx` 0.18.5 | SheetJS Community version — known licensing change; latest is 0.20.x |
| `playwright` 1.60.0 | Generally current; EPFO/ESIC portals may require specific Chrome version |
| `@tensorflow/tfjs-node` 4.22.0 | Very heavy (~500MB with native binaries); only used for face matching |
| `express` 5.0.1 | Express 5 is stable but has breaking changes from 4.x; confirm compatibility |

### Heavy Dependencies Assessment

| Package | Size | Usage | Alternative |
|---------|------|-------|-------------|
| `@tensorflow/tfjs-node` | ~500MB | Face detection for mobile attendance | Move to cloud API or remove if mobile handles it |
| `playwright` | ~300MB | EPFO/ESIC automation | Keep — core feature |
| `@vladmandic/face-api` | ~60MB | Face detection | Same concern as TensorFlow |

> ⚠️ TensorFlow.js Node + face-api together add ~560MB to the server footprint. On the PM2 config with `max_memory_restart: "500M"`, this may cause frequent restarts if face matching is active concurrently with Playwright.

---

## 9. Performance Audit

### Backend Performance Issues

| Issue | Severity | Impact |
|-------|---------|--------|
| ~~No DB indexes on FK columns~~ ✅ Resolved (Jun 19 2026) | — | 19 indexes added on high-traffic FK/filter columns |
| ~~No query result caching~~ ✅ Resolved for dashboard (Jun 19 2026) | — | 30s TTL cache on dashboard stats; other endpoints still uncached |
| Synchronous PDF generation in request handlers | 🟡 Medium | Blocks Node.js event loop for large reports |
| ~~TensorFlow loaded at server startup~~ ✅ Resolved (Jun 19 2026) | — | Face-api/TensorFlow now loaded on-demand at first face match |
| No pagination on some list endpoints | 🟡 Medium | Returning all records on large tables |
| Playwright + TensorFlow concurrent memory | 🟡 Medium | Lower baseline now that TF loads lazily; can still spike under concurrent face-match + Playwright |

### Frontend Performance Issues

| Issue | Severity | Impact |
|-------|---------|--------|
| 6,379-line reports.tsx | 🟡 Medium | Large initial parse time; re-renders whole page on any state change |
| `refetchInterval: 5000` on automation jobs | 🟢 Low | Constant polling even when no jobs running |
| Inline `queryFn` in each component | 🟢 Low | Prevents React Query from deduplicating identical requests |
| ~~No virtualization on large tables~~ ✅ Resolved for employees (Jun 19 2026) | — | Employees table virtualized via `@tanstack/react-virtual`; other large tables still un-virtualized |
| PDF generation on main thread | 🟡 Medium | Blocks UI during large report generation |
| ~~No code splitting by route~~ ✅ Resolved (Jun 19 2026) | — | Route-level `React.lazy`/`Suspense`; initial bundle 2,807 → 393 kB |

### Slow Query Patterns (Estimated)

```sql
-- Pattern 1: Monthly payroll report (no index)
SELECT * FROM payroll 
WHERE company_id = $1 AND month = $2 AND year = $3
-- → Full table scan on payroll

-- Pattern 2: Attendance dashboard (no index)
SELECT * FROM attendance 
WHERE company_id = $1 AND date BETWEEN $2 AND $3
-- → Full table scan on attendance (potentially largest table)

-- Pattern 3: Punch log processing (no index, high volume)
SELECT * FROM biometric_punch_logs 
WHERE is_processed = false
-- → Full table scan on highest-volume table
```

### API Response Times (Estimated at Scale)

| Endpoint | At 100 employees | At 5,000 employees |
|----------|-----------------|-------------------|
| `GET /api/employees` | ~50ms | ~2,000ms (no index) |
| `GET /api/attendance` | ~80ms | ~5,000ms (no index) |
| `GET /api/payroll` | ~60ms | ~3,000ms (no index) |
| `POST /api/reports/...` (PDF) | ~500ms | ~3,000ms (synchronous) |

---

## 10. Security Audit

### Security Issue Summary

| Issue | Severity | Location |
|-------|---------|---------|
| ~~Hardcoded JWT secret fallback~~ ✅ Resolved (Jun 19 2026) | — | `server/jwt-auth.ts` |
| ~~Hardcoded session secret fallback~~ ✅ Resolved (Jun 19 2026) | — | `server/index.ts` |
| ~~Duplicate resume route bypasses admin check~~ ✅ Resolved (Jun 19 2026) | — | `server/routes.ts` |
| ~~No mimetype filter on employee doc uploads~~ ✅ Resolved (Jun 19 2026) | — | `server/upload-security.ts` |
| ⚠️ Live JWT secret committed to version control | 🔴 Critical → 🟠 In progress (Jun 20 2026) | `.replit` (git-tracked) — rotation to managed Secret underway |
| ⚠️ `SESSION_ENCRYPTION_KEY` committed to version control | 🟠 High (newly flagged Jun 20 2026) | `.replit` `[userenv.shared]` — used by `portal-session-service.ts`; needs dedicated rotation |
| ADMS protocol unauthenticated | 🟡 Medium | `server/adms.ts` |
| MemStorage hardcoded admin/admin123 | 🟡 Medium | `server/storage.ts` |
| JWT 7-day expiry with no revocation | 🟡 Medium | `server/jwt-auth.ts` |
| ~~No CSRF protection~~ ✅ Resolved (Jun 20 2026) | — | `server/index.ts` — Origin/Referer check on cookie-auth mutations |
| ~~File path traversal risk in downloads~~ ✅ Hardened (Jun 20 2026) | — | ESIC report download now does resolved-path containment |
| `req as any` bypasses TypeScript checks | 🟢 Low | Throughout `routes.ts` |

### Issue Deep-Dives

#### 1. Hardcoded Secret Fallbacks (Critical) — ✅ RESOLVED (June 19, 2026)

> **Fixed:** Both fallback strings were removed. `server/jwt-auth.ts` and `server/index.ts` now throw on startup if `JWT_SECRET` / `SESSION_SECRET` are unset (fail-fast). `.env` loading was extracted to `server/load-env.ts` and imported **first** in `server/index.ts`, so secrets are loaded before any import-time check executes (ES module imports are hoisted, so the old inline loader ran too late). *(Original finding preserved below.)*

```typescript
// server/jwt-auth.ts (BEFORE)
const JWT_SECRET = process.env.JWT_SECRET || "hrms-jwt-secret-key-2026";
//                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                             Public fallback = predictable tokens

// server/index.ts
secret: process.env.SESSION_SECRET || "hrms-dev-secret-key-2026",
//                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                     Anyone can forge session cookies
```

**Risk:** If `SESSION_SECRET` or `JWT_SECRET` are not set in production, any attacker knowing the fallback value can forge valid sessions and tokens.

#### 2. Authorization Bypass on Automation Resume (High) — ✅ RESOLVED (June 19, 2026)

> **Fixed:** The duplicate `requireAuth`-only handler in `server/routes.ts` was removed. The authoritative route in `server/epfo-esic-routes.ts` (`requireAuth` + admin roles + company isolation) is now the only handler, so non-admin users can no longer resume automation jobs. *(Original finding preserved below.)*

```typescript
// routes.ts (BEFORE) — only requireAuth
app.post("/api/automation/jobs/:id/resume", requireAuth, ...)

// epfo-esic-routes.ts (line 1805) — correct, with adminRoles
app.post("/api/automation/jobs/:id/resume", requireAuth, adminRoles, ...)
```

Since Express registers both, the less restrictive route (registered first in `index.ts` presumably) wins, allowing any logged-in user (including `employee` role) to resume portal automation jobs.

#### 3. File Upload Without Mimetype Validation — ✅ RESOLVED (June 19, 2026)

> **Fixed:** `server/upload-security.ts` now provides a dangerous-extension blocklist plus per-uploader allow-lists: `docUpload` → PDF/JPG/JPEG/PNG/DOC/DOCX; bulk `upload` → spreadsheet/CSV/text (xlsx/xls/csv/txt/dat, preserving bulk + biometric import); `apkUpload` → apk only; mobile `faceUpload` → images only. Rejected files return HTTP 400. *(Original finding preserved below.)*

```typescript
// BEFORE — no filter:
const docUpload = multer({
  storage: diskStorage,   // writes to uploads/employee-docs/
  limits: { fileSize: 10MB }
  // No fileFilter!
});

// Allows: .exe, .php, .sh, .js uploaded as "documents"
```

**Risk:** An attacker can upload a PHP/shell script to the public `uploads/` directory. If the web server executes files from that path, this is Remote Code Execution.

#### 4. ADMS Biometric Protocol (Unauthenticated by Design)

The ZKTeco ADMS protocol on `/iclock/...` is inherently unauthenticated. While a `pushToken` and CIDR check exist as optional, **they appear to be opt-in**, meaning by default any host on the network can push punch data to the HRMS.

#### 5. No CSRF Protection — ✅ RESOLVED (June 20, 2026)

> **Fixed:** An OWASP-recommended Origin/Referer check was added in `server/index.ts` for state-changing methods (POST/PUT/PATCH/DELETE). Requests are blocked (`403`) when a browser-supplied `Origin`/`Referer` host does not match the request host (or `REPLIT_DEV_DOMAIN`/`REPLIT_DOMAINS`). Exemptions: safe methods, `Bearer`-token (mobile/JWT) requests, ADMS device paths, and requests with no Origin/Referer (non-browser clients). *(Original finding preserved below.)*

The web interface uses session cookies (`sameSite: "lax"` in dev, `"none"` in production with `secure: true`). With `sameSite: "none"`, CSRF is possible from cross-origin requests unless explicitly blocked.

#### 6. Error Handling, Logging & Response Hygiene — ✅ ADDED (June 20, 2026)

- **Per-request correlation IDs:** an `X-Request-Id` is assigned (reusing an inbound header when present) and echoed on the response; it appears in every `/api` access log, CSRF-block log, and error log/response, so a single user report is traceable end-to-end.
- **Hardened centralized error handler:** logs structured context (id, method, path, status, stack on 5xx) but returns a generic `"Internal Server Error"` to clients on 5xx in production — internal details/stack no longer leak.
- **Baseline security headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`. Frame-blocking headers are intentionally omitted (app runs in the Replit preview iframe and embeds the mobile preview).
- **Frontend error boundary:** render-time crashes now show a friendly fallback instead of a blank screen.

### Authentication Architecture

```
Web Interface:
  └── Passport (passport-local) + express-session
      └── Session stored in PostgreSQL (connect-pg-simple)
      └── Cookie: httpOnly, secure (prod), sameSite: none/lax

Mobile API:
  └── POST /api/mobile/login → returns { accessToken, refreshToken }
      └── accessToken: 7-day JWT (long for a mobile token)
      └── refreshToken: 30-day JWT
      └── No token revocation mechanism
```

### RBAC Analysis

```
Roles (least → most privileged):
  employee → manager → recruiter → hr_admin → company_admin → super_admin

Permission Check Priority:
  super_admin (bypass all) 
  → explicit action allow 
  → explicit module allow 
  → explicit action deny 
  → explicit module deny 
  → default MODULE_ACCESS table
```

The RBAC system is well-designed but the `user_permissions` table in the DB is separate from `shared/permissions.ts` defaults — this dual-source-of-truth can cause confusion.

---

## 11. Dead Code Analysis

### Potentially Unused Files

| File | Evidence of Non-Use |
|------|-------------------|
| `client/src/pages/coming-soon.tsx` | No `<Route>` registration in `App.tsx` found |
| `client/src/pages/mobile-preview.tsx` | Purpose unclear; likely a dev tool page |
| `server/seed.ts` | Dev-only seed file; not needed in production |
| `server/face-match.ts` | Functionality may be duplicated with `@vladmandic/face-api` in routes |

### Unused npm Packages

| Package | Status |
|---------|--------|
| `react-icons` | No imports in source |
| `@replit/connectors-sdk` | No imports in source |
| `tw-animate-css` | No imports in source |

### Unused Database Tables (Suspected)

| Table | Reason for Suspicion |
|-------|---------------------|
| `compliance_adjustments` | Described as "shadow table for reporting" — unclear active usage |
| `esic_fetched_employees` | Appears to be a temporary staging table with no clear cleanup policy |
| `adms_activity_log` | Debug log with `bigserial` ID — may grow unbounded; no retention policy |

### Unused API Endpoints (Suspected)

| Endpoint | Concern |
|----------|---------|
| `POST /api/automation/jobs/:id/resume` (in routes.ts) | Duplicate of the same in epfo-esic-routes.ts |
| `GET /api/live-view` | Only serves a page; unclear if still maintained |

### Unused UI Components / Imports

- `Sparkles` icon imported in `automation-jobs.tsx` — now used for AI Analyze button ✅
- Multiple Radix UI primitives installed (`@radix-ui/react-accordion`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-hover-card`) — usage in shadcn but possibly not all are rendered in the app

---

## 12. Technical Debt Report

### Debt Inventory (Ranked by Severity)

| Rank | Issue | Severity | Files Affected | Estimated Fix Effort |
|------|-------|---------|---------------|---------------------|
| 1 | `server/routes.ts` God Object | 🔴 Critical | 1 | 5–7 days |
| 2 | ~~No database indexes~~ ✅ Resolved (Jun 19 2026) | Done | `schema.ts` + `migrations/008` | — |
| 3 | ~~Hardcoded secret fallbacks~~ ✅ Resolved (Jun 19 2026) | Done | `index.ts`, `jwt-auth.ts`, `load-env.ts` | — |
| 4 | ~~Duplicate automation resume route~~ ✅ Resolved (Jun 19 2026) | Done | `routes.ts` | — |
| 5 | No FK constraints in DB | 🔴 High | `schema.ts` + migrations | 2–3 days |
| 6 | 6,379-line reports.tsx | 🟠 High | `reports.tsx` | 3–5 days |
| 7 | ~~No file upload mimetype filter~~ ✅ Resolved (Jun 19 2026) | Done | `upload-security.ts` | — |
| 8 | No service layer (business logic in routes) | 🟠 High | All route files | 10–15 days |
| 9 | Inline sub-components in pages | 🟡 Medium | 10+ page files | 5–8 days |
| 10 | Inconsistent Zod validation | 🟡 Medium | `routes.ts` | 3–5 days |
| 11 | Storage interface too large | 🟡 Medium | `storage.ts` | 3–4 days |
| 12 | No database migration tracking | 🟡 Medium | `migrations/` | 1 day |
| 13 | Repeated PDF/Excel generation code | 🟡 Medium | 6 page files | 2–3 days |
| 14 | ~~Missing React Error Boundaries~~ ✅ Resolved (Jun 20 2026) | Done | `App.tsx`, `error-boundary.tsx` | — |
| 15 | ~~TensorFlow loaded at startup~~ ✅ Resolved (Jun 19 2026) | Done | `server/index.ts` | — |
| 16 | No email service integration | 🟡 Medium | — | 2–3 days |
| 17 | JWT 7-day access token lifetime | 🟢 Low | `jwt-auth.ts` | 1 hour |
| 18 | `req as any` type escapes | 🟢 Low | `routes.ts` | Ongoing |
| 19 | Unused npm packages (3) | 🟢 Low | `package.json` | 30 min |
| 20 | ~~No code splitting by route~~ ✅ Resolved (Jun 19 2026) | Done | `client/src/App.tsx` | — |
| 21 | ⚠️ `SESSION_ENCRYPTION_KEY` committed in `.replit` | 🟠 High | `.replit`, `portal-session-service.ts` | 1–2 hr (rotation invalidates stored portal sessions) |

### Large Files Summary

| File | Lines | Debt Level |
|------|-------|-----------|
| `client/src/pages/reports.tsx` | 6,379 | 🔴 Unmaintainable |
| `server/routes.ts` | 7,398 | 🔴 Unmaintainable |
| `client/src/pages/compliances.tsx` | 4,673 | 🔴 Very High |
| `client/src/pages/settings.tsx` | 3,761 | 🟠 High |
| `client/src/pages/payroll.tsx` | 2,512 | 🟡 Medium |
| `server/storage.ts` | 1,993 | 🟡 Medium |

---

## 13. Refactoring Roadmap

### Phase 1 — Critical Fixes (Immediate / Week 1) — ✅ MOSTLY COMPLETE (June 19, 2026)
**Estimated effort:** 3–5 days | **Risk:** Low | **Do NOT defer**

| Task | Action | File(s) | Status |
|------|--------|---------|--------|
| Remove hardcoded secrets | Enforce `process.env` required, remove fallback strings; load `.env` first | `server/index.ts`, `server/jwt-auth.ts`, `server/load-env.ts` | ✅ Done |
| Fix auth bypass | Remove duplicate resume route from `routes.ts` | `server/routes.ts` | ✅ Done |
| Add upload mimetype filter | Add allow-list `fileFilter` + dangerous-ext blocklist | `server/upload-security.ts` | ✅ Done |
| Add missing DB indexes | Added **19** indexes on FK/filter columns (more than the 10 originally scoped) | `shared/schema.ts` + `migrations/008_add_recommended_indexes.sql` | ✅ Done (apply to prod) |
| Remove unused packages | `npm uninstall react-icons @replit/connectors-sdk tw-animate-css` | `package.json` | ⬜ Pending |

**Expected benefit:** Closes 4 security vulnerabilities; 30–50% query speedup for attendance/payroll APIs.
**Actual:** 4/5 tasks shipped & merged. Unused-package removal deferred. Index migration verified on dev DB — **must still be applied to production** (`psql "$DATABASE_URL" -f migrations/008_add_recommended_indexes.sql` or `npm run db:push`).

---

### Phase 2 — Architecture Cleanup (Month 1–2)
**Estimated effort:** 3–4 weeks | **Risk:** Medium | **Highest ROI**

| Task | Action | Files |
|------|--------|-------|
| Split `server/routes.ts` | Extract into: `auth-routes.ts`, `employee-routes.ts`, `payroll-routes.ts`, `attendance-routes.ts`, `biometric-routes.ts`, `recruitment-routes.ts`, `settings-routes.ts`, `reports-routes.ts` | `routes.ts` → 8 files |
| Introduce service layer | Create `server/services/payroll-service.ts`, `attendance-service.ts`, etc. Move business logic out of handlers | New `server/services/` folder |
| Extract page sub-components | Move `RegistrationTab`, `ReturnFilingTab`, etc. to `components/epfo/`, `components/esic/` | `epfo.tsx`, `esic.tsx` |
| Centralize PDF/Excel utilities | Create `client/src/lib/report-utils.ts` with reusable header/table builders | 6 page files |
| Add DB migration tracking | Integrate Drizzle Migrate or a migration version table | `migrations/` |
| Split storage interface | Domain-specific interfaces: `IEmployeeStorage`, `IPayrollStorage`, etc. | `storage.ts` |

**Expected benefit:** 40% reduction in largest file sizes; significantly improved team-based development.

---

### Phase 3 — Performance Optimization (Month 2–3) — ✅ MOSTLY COMPLETE (June 19, 2026)
**Estimated effort:** 2–3 weeks | **Risk:** Low–Medium**

| Task | Action | Impact | Status |
|------|--------|--------|--------|
| Add all DB indexes | Complete index coverage for all FK and filter columns | 🔴 High | ✅ Done (19 indexes, Jun 19 2026) |
| Add FK constraints | Add `.references()` in Drizzle schema | 🟡 Medium | ⬜ Pending |
| Add in-memory cache | Cache dashboard stats for 30s | 🟡 Medium | ✅ Done (dashboard; other endpoints pending) |
| Lazy-load TensorFlow | Load face-api only on demand, not at startup | 🟡 Medium | ✅ Done |
| Route-level code splitting | `React.lazy()`/`Suspense` for pages | 🟢 Low | ✅ Done (bundle 2,807→393 kB) |
| Virtualize large tables | Use `@tanstack/react-virtual` for 100+ row tables | 🟡 Medium | ✅ Done (employees; other tables pending) |
| Async PDF generation | Move report generation to background queue | 🟡 Medium | ⬜ Pending |

**Expected benefit:** API response time improvement of 60–80% at scale; frontend TTI improved by ~30%.
**Actual:** Initial JS bundle cut ~86% (2,807 → 393 kB); TensorFlow no longer in the boot path; dashboard stats cached (30s). FK constraints, broader caching, more table virtualization, and async PDF remain. Metrics in `docs/performance-optimization.md`.

---

### Phase 4 — AI Assistant Integration (Month 3–4)
**Estimated effort:** 2–3 weeks | **Risk:** Low**

| Task | Action |
|------|--------|
| Email service integration | Add Nodemailer/Resend for follow-up task emails, payslip delivery |
| AI follow-up scheduler | Complete the automated reminder email delivery in `ai-follow_up_tasks` |
| AI compliance insights | Dashboard widget with AI-powered compliance health score |
| AI-powered payroll anomaly detection | Flag unusual salary changes before payroll generation |
| Expand compliance AI | Add PF passbook analysis and challan verification via AI |

**Expected benefit:** Closes the email gap; unlocks the full value of the AI follow-up system already built.

---

### Phase 5 — EPFO & ESIC Automation Hardening (Month 4–5)
**Estimated effort:** 2–3 weeks | **Risk:** Medium (external portal dependency)**

| Task | Action |
|------|--------|
| Portal error retry intelligence | AI-driven retry strategy based on error classification |
| Automated ECR validation | Pre-validate ECR data before submitting to portal to reduce failures |
| ESIC wage ceiling enforcement | Auto-flag employees crossing ₹21,000 ceiling before monthly filing |
| Audit trail for portal operations | Immutable log of every portal action with before/after state |
| Browser pool scaling | Scale Chromium instances based on job queue depth |

**Expected benefit:** Reduces portal automation failure rate; enables proactive compliance management.

---

## 14. Final Recommendations

### Top 20 Improvement Opportunities

| # | Recommendation | Priority | Effort |
|---|---------------|---------|--------|
| 1 | ~~**Remove hardcoded JWT/session secret fallbacks**~~ ✅ Done (Jun 19 2026) | — | — |
| 2 | ~~**Remove duplicate automation resume route (auth bypass)**~~ ✅ Done (Jun 19 2026) | — | — |
| 3 | ~~**Add mimetype filter to employee document uploads**~~ ✅ Done (Jun 19 2026) | — | — |
| 4 | ~~**Add indexes on FK/filter columns in schema.ts**~~ ✅ Done (Jun 19 2026, 19 indexes) | — | — |
| 5 | **Split server/routes.ts into 8 domain-specific files** | 🔴 Critical | 5 days |
| 6 | **Introduce a service layer** | 🟠 High | 10 days |
| 7 | **Extract reports.tsx into separate report modules** | 🟠 High | 4 days |
| 8 | **Add FK constraints via Drizzle schema** | 🟠 High | 2 days |
| 9 | **Remove react-icons, @replit/connectors-sdk, tw-animate-css** | 🟡 Medium | 30 min |
| 10 | **Standardize Zod validation on all POST/PATCH routes** | 🟡 Medium | 3 days |
| 11 | ~~**Add React Error Boundaries**~~ ✅ Done (Jun 20 2026) | — | — |
| 12 | **Integrate email delivery service (Resend/Nodemailer)** | 🟡 Medium | 2 days |
| 13 | **Centralize PDF/Excel utility functions** | 🟡 Medium | 2 days |
| 14 | ~~**Lazy-load TensorFlow/face-api**~~ ✅ Done (Jun 19 2026) | — | — |
| 15 | **Add migration version tracking** | 🟡 Medium | 1 day |
| 16 | ~~**Cache dashboard endpoints**~~ ✅ Done (Jun 19 2026, 30s in-memory; broaden later) | — | — |
| 17 | **Add table virtualization for remaining large lists** (employees ✅ done) | 🟡 Medium | 1 day |
| 18 | **Split storage.ts into domain interfaces** | 🟡 Medium | 3 days |
| 19 | **Reduce JWT access token lifetime to 1 hour** | 🟢 Low | 1 hr |
| 20 | ~~**Route-level code splitting**~~ ✅ Done (Jun 19 2026) | — | — |
| 21 | **Rotate & untrack `SESSION_ENCRYPTION_KEY` from `.replit`** | 🟠 High | 1–2 hr |
| 22 | **Add per-device pushToken/CIDR enforcement on ADMS endpoints** | 🟡 Medium | 1 day |

### Estimated Outcomes After Full Roadmap

| Metric | Current | After Roadmap | Improvement |
|--------|---------|--------------|-------------|
| Largest backend file | 7,398 lines | ~900 lines (avg) | **~88% reduction** |
| Largest frontend file | 6,379 lines | ~800 lines (avg) | **~87% reduction** |
| API response time (at scale) | 2,000–5,000ms | 100–300ms | **~85% faster** |
| Security vulnerabilities | ⚠️ 0–1 critical (4 code-level resolved Jun 19 2026; CSRF + path-traversal + headers + error-hygiene added Jun 20 2026; JWT secret rotation in progress; `SESSION_ENCRYPTION_KEY` newly flagged) | 0 critical | **In progress** |
| Initial JS bundle | ✅ 393 kB (was 2,807 kB before code-splitting, Jun 19 2026) | <400 kB | **~86% smaller** |
| Codebase maintainability | 4/10 | 8/10 | **+100%** |
| Bundle size | ~Current | ~25% smaller | **react-icons + dead code removed** |
| Test coverage (potential) | 0% | Testable architecture | **Unblocked** |

### Final Note

HRMS Pro is a **feature-rich, production-capable system** that covers the entire HR lifecycle including complex India-specific compliance. The architecture has served well during rapid feature development. The technical debt is expected for a system of this scope and age. The most impactful single action is **splitting `server/routes.ts`** — it unblocks all other architectural improvements and significantly reduces the risk of introducing regressions when adding features.

Phases 1 and 2 combined (critical fixes + architecture cleanup) represent approximately **4–6 weeks of focused engineering effort** and will transform the maintainability and security posture of the system substantially.

---

*Report ends. No code was modified during this analysis.*
