# HRMS Pro

HRMS Pro is an enterprise-grade Multi-Company Human Resource Management System for managing employees, payroll, attendance, and compliance across multiple organizations.

## Run & Operate

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string

## Stack

- **Frontend**: React, TypeScript, Wouter (routing), TanStack Query (state), Shadcn/UI, Tailwind CSS
- **Backend**: Express.js, TypeScript, PostgreSQL, Drizzle ORM, Zod (validation), `node-postgres`
- **Mobile**: Flutter, Dart, Provider (state), Dio (HTTP client), `flutter_secure_storage`
- **Build Tool**: _Populate as you build_

## Where things live

- **Frontend Source**: `src/`
- **Backend Source**: `server/`
  - DB Schema: `server/schema.ts`
  - API Routes: `server/routes.ts`, `server/mobile-routes.ts`
- **Mobile App Source**: `flutter_app/`
  - API Client: `flutter_app/lib/core/api_client.dart`
- **Static Assets**: `uploads/company-assets/` (served via `/uploads`)

## Architecture decisions

- **Multi-tenancy**: Achieved via `company_id` foreign keys and middleware-enforced data isolation for non-Super Admin roles.
- **Authentication**: Session-based for web, JWT Bearer tokens for mobile API.
- **Profile Update Workflow**: Employee profile edits require admin approval (`profileUpdateRequests` table).
- **Attendance Verification**: Mobile app uses client-side GPS (Haversine) and ML Kit face detection before server-side enforcement.
- **Credit & Billing**: Separate `cd_accounts` and `cd_transactions` tables with super admin management and company admin read-only access.

## Product

- **Multi-Company Management**: Supports multiple organizations with India compliance.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions with Super Admin, Company Admin, HR Admin, Recruiter, Manager, Employee roles.
- **Comprehensive HR Modules**: Attendance, Leave, Payroll, Employee Management, Recruitment, Loan & Advances, Reports, Settings.
- **Mobile App**: Employee/Manager self-service for attendance, leave, payslips, profile management, and team oversight.
- **Bulk Operations**: Bulk upload for employees and salary structures via Excel.
- **Full & Final Settlement**: Workflow for exited employees including calculation and approval.
- **Recruitment Management**: End-to-end job posting, application, interview scheduling, offer management, and candidate response workflow.
- **Biometric Integration**: Push punch data from devices, sync to attendance, and manage logs.

## User preferences

- I prefer simple language.
- I want iterative development.
- Ask before making major changes.

## Gotchas

- **Mobile API Base URL**: Must be updated in `flutter_app/lib/core/api_client.dart` for deployed environments.
- **Aadhaar Verification**: Integrated into employee creation, handles various employee states.
- **ESIC Calculation**: Follows specific revised norms as of Jan 2026.
- **Payroll Generation**: Duplicate payroll generation is prevented.

## Pointers

- **React Documentation**: https://react.dev/
- **Express.js Documentation**: https://expressjs.com/
- **Drizzle ORM Documentation**: https://orm.drizzle.team/docs/overview
- **Flutter Documentation**: https://docs.flutter.dev/
- **Shadcn/UI Documentation**: https://ui.shadcn.com/docs
- **Tailwind CSS Documentation**: https://tailwindcss.com/docs
- **Zod Documentation**: https://zod.dev/