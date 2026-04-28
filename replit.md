# HRMS Pro - Multi-Company Human Resource Management System

## Overview
HRMS Pro is an enterprise-grade Multi-Company Human Resource Management System designed for managing employees, payroll, attendance, and compliance across multiple organizations. Its purpose is to provide a comprehensive, multi-tenant solution for HR operations, enhancing efficiency and ensuring compliance across diverse business entities.

### Company Logo & Signature
- Companies have `logo` and `signature` fields (text URL path)
- Upload via POST `/api/companies/:id/assets/logo` or `/api/companies/:id/assets/signature` (multipart/form-data, field `file`)
- Delete via DELETE `/api/companies/:id/assets/logo` or `/api/companies/:id/assets/signature`
- Files stored in `uploads/company-assets/` and served statically via `/uploads`
- Edit Company dialog has a "Logo & Signature" tab with upload/remove zones
- Logo appears top-right in salary sheet PDF and payslip PDFs
- Signature appears in the signature box of payslip PDFs (right-aligned)

### CD Accounts (Credits & Billing)
- Tables: `cd_accounts` (per-company balance, rate, threshold) + `cd_transactions` (ledger)
- Tables created via startup migration in `server/routes.ts`
- Super admin: `/billing` — full management (setup accounts, add/deduct credits, view ledgers, edit rates)
- Company admin: `/billing` — read-only view of own balance, rate, daily estimate, and transaction history
- Billing sidebar entry: "Credits & Billing" (CreditCard icon) for `super_admin` + `company_admin`
- API routes: `GET /api/billing/accounts`, `POST /api/billing/accounts`, `PATCH /api/billing/accounts/:companyId`, `POST /api/billing/accounts/:companyId/credit`, `POST /api/billing/accounts/:companyId/debit`, `GET /api/billing/transactions/:companyId`, `GET /api/billing/unregistered-companies`
- Bank account & payment API linkage deferred — referenceNo field reserved for future use

## User Preferences
- I prefer simple language.
- I want iterative development.
- Ask before making major changes.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: Shadcn/UI with Tailwind CSS
- **Theme**: Professional blue enterprise theme with dark mode support

### Backend
- **Framework**: Express.js with TypeScript
- **Storage**: PostgreSQL with Drizzle ORM (DatabaseStorage class in server/database-storage.ts)
- **Session Store**: PostgreSQL via connect-pg-simple (persists across restarts)
- **Database Connection**: server/db.ts using node-postgres Pool
- **Seeding**: server/seed.ts seeds admin user and default leave types on startup
- **Authentication**: Session-based (web) + JWT Bearer tokens (mobile)
- **Validation**: Zod schemas
- **Mobile API**: `/api/mobile/*` endpoints with JWT auth (server/mobile-routes.ts, server/jwt-auth.ts)
  - `/api/mobile/attendance/punch` — unified punch (1st = clock-in, subsequent = clock-out)
  - `/api/mobile/loan-advances` GET + POST
  - `/api/mobile/notifications` GET, PATCH read/read-all, DELETE clear
  - `/api/mobile/profile` PUT → employees routed through admin approval workflow

### Mobile App (Flutter)
- **Location**: `flutter_app/` directory
- **Framework**: Flutter with Dart
- **State Management**: Provider
- **HTTP Client**: Dio with JWT interceptor (auto-refresh, concurrent 401 handling)
- **Token Storage**: flutter_secure_storage
- **Features**: Login/Signup, Dashboard, Attendance (GPS + Face verification), Leave Management, Profile (with experience CRUD), Job Board, Face Registration (admin)
- **Native Platform Files**: Complete — `android/` and `ios/` native directories are present with all permissions configured
  - Android: package=`com.hrms.hrms_mobile`, minSdkVersion=21, camera/location/storage permissions, ML Kit face detection, FileProvider
  - iOS: platform 14.0, camera/location/photo library/face ID usage descriptions in Info.plist, Podfile with permission macros
- **Attendance Verification**: GPS distance check (Haversine, client-side preview + server-side enforcement), ML Kit face detection (validates face present before submitting)
- **Face Registration**: Admin/HR screen to register/remove employee face photos (used for attendance verification)
- **Build**: Must be built locally with `flutter pub get && flutter build apk` (Android) or `flutter build ios` (iOS)
- **API Base URL**: Set in `flutter_app/lib/core/api_client.dart` — update to your deployed server URL

### Data Models
The system employs a comprehensive set of data models to manage various HR entities:
- **Core Entities**: Company (multi-tenant with India compliance), User (role-based access), Employee (workforce records, statutory info, bank/KYC)
- **Time & Absence**: Attendance (daily records with WO/H/L status support), LeaveType (policies with carry-forward), LeaveRequest (applications with approval workflow), Holiday (company holiday calendar)
- **Payroll**: SalaryStructure (components), Payroll (monthly records), FnfSettlement (Full & Final settlement for exited employees)
- **Loan & Advance**: LoanAdvance (employee loan/advance applications with approval workflow and deduction scheduling)
- **Master Data**: MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead
- **Settings**: Setting (system/company config), StatutorySettings (PF, ESIC, LWF, PT), TimeOfficePolicy (time office rules)
- **Candidate Profile**: CandidateProfile (self-signup user profile with Aadhaar, personal/financial details)
- **Profile Update Requests**: Employee profile edits create a pending `profileUpdateRequests` record; admin must approve/reject before changes are applied
- **Biometric**: BiometricPunchLog (raw punch data from devices with duplicate/missing/processed flags)
- **Recruitment**: JobPosting (company job listings with status workflow), JobApplication (employee applications with review workflow)

### Key Features and Specifications
- **Multi-Company Management**: Supports multiple organizations with India compliance fields (PAN, GSTIN, PF, ESI).
- **Role-Based Access Control (RBAC)**: Implemented with `requireAuth`, `requireRole`, and `requireModuleAccess` middleware. Roles include Super Admin, Company Admin, HR Admin, Recruiter, Manager, and Employee.
- **Per-User Module Permissions**: Super Admin and Company Admin can grant or revoke access to individual modules (Attendance, Leave, Payroll, Employees, Reports, Recruitment, Profile) for any specific user via the Users page (ShieldCheck icon per row). Stored in `user_permissions` table. User-specific overrides take precedence over role defaults; super_admin always has full access. Endpoints: `GET /api/users/:id/permissions`, `PUT /api/users/:id/permissions`.
- **Multi-Tenant Data Isolation**: Data access is strictly controlled based on company ID for non-Super Admin roles.
- **Attendance Management**: Clock in/out tracking, monthly view, status indicators (P/A/HD/WO/H/L), Pay Days calculation (Present + Leave + Holidays + Weekly Offs, capped at month days).
- **Holiday Calendar**: Company-specific holiday management with CRUD operations, types (public/restricted/optional), and integration with attendance reports and quick entry.
- **Leave Management**: Configurable leave types (CL, SL, PL, ML, PTL), request submission, and approval workflows.
- **Bulk Upload Features**:
    - Bulk Employee Upload: Excel template download and upload with validation (duplicate employee code/Aadhaar detection, row-level error reporting).
    - Bulk Salary Structure Upload: Excel template download and upload with employee code matching, active structure duplicate prevention, and detailed results.
- **Payroll Processing**:
    - Salary structures with auto-calculation of statutory deductions (PF, ESIC, PT) based on company settings and employee applicability.
    - ESIC calculation based on revised norms (Jan 2026): contribution base on higher of Basic Salary or 50% of Gross Salary, capped at ₹21,000.
    - Monthly bonus auto-inclusion for eligible employees.
    - Prevention of duplicate payroll generation.
- **Settings Management**: General, localization, notifications, security, and specific statutory configurations.
- **Master Data Management**: Company-specific departments, designations, locations, earning, and deduction heads.
- **Reporting Module**: Client-side generation of reports (Attendance Sheet, Salary Sheet, PF Statement, ESIC Statement, Pay Slip, Employee List, Employee Pay Structure, Full & Final Settlement, Bonus Report, LWF Report) with Excel and PDF export.
- **Employee Exit & Full & Final Settlement**:
    - Functionality to mark employees as exited with various exit types and reasons.
    - Option to reinstate exited employees.
    - F&F settlement process including earnings, deductions, and net payable calculation with an approval workflow (Draft → Approved → Paid).
- **Aadhaar Verification on Employee Add**: Modal dialog for Aadhaar verification during employee creation, handling scenarios for active, exited, or new employees, with multi-tenant security for Aadhaar lookup.
- **Recruitment & Job Application (Full Cycle)**:
    - Company Admin/HR/Recruiter can create, edit, and manage job postings (draft, open, closed, on_hold).
    - **Employee Self-Signup**: Users can sign up without company tagging and browse all open positions (public job board).
    - **Application**: Employees/candidates apply with cover letter and phone; duplicate prevention by userId and employeeId.
    - **Interview Scheduling**: Admin/HR schedule interviews with date, time, location, interviewer, and notes visible to candidate.
    - **Offer Management**: Admin/HR can make offers with salary, designation, terms, and expiry date.
    - **Candidate Response**: Candidates can Accept, Negotiate (with counter-offer note), or Decline offers; workflow validation prevents invalid state transitions.
    - **Status Workflow**: applied → shortlisted → interview_scheduled → interviewed → offered → offer_accepted/offer_negotiated/offer_rejected → hired.
    - **Withdraw**: Candidates can withdraw applications at any non-final stage.
    - Multi-tenant company scoping on all routes for data isolation; unaffiliated employees see limited company info only.
- **Biometric Device Integration**:
    - Push punch data from biometric devices (deviceEmployeeId, punchTime, punchDate, punchType).
    - Sync to attendance using First In, Last Out logic.
    - Duplicate detection (ignore same device+timestamp+date).
    - Missing punch flagging (single punch in a day).
    - Employee mapping via biometricDeviceId field.
    - UI page for viewing punch logs, uploading data, and syncing to attendance.

### Mobile App New Features (Feb 2026)
- **Holiday Calendar**: View company holidays with type indicators and today highlight
- **Pay Slips**: View monthly payslips with detailed earnings/deductions breakdown
- **Salary Structure**: View active salary structure with full component breakdown
- **Leave Approval**: Managers can view, approve, and reject team leave requests
- **My Team**: Manager view of all active team members with search and detail modal
- **Birthday List**: Company-wide birthday calendar with month filter and today highlight
- **Quick Attendance Entry**: Managers can enter attendance records for team members
- **Monthly Attendance Entry**: Bulk monthly attendance with Pay Days & OT Hours (auto-generates daily records)
- **Employee Registration**: Full employee registration form with KYC, statutory, bank details
- **Salary Structure Management**: Create/update salary structures with full earnings/deductions breakdown
- **Job Posting Management**: Create, edit, publish, hold, close, delete job postings with application count
- **Role-Based Navigation**: Home screen "More" tab shows Employee Services and Manager Tools based on role

### Mobile API Endpoints Added
- `GET /api/mobile/team-leave-requests` - Team leave requests (manager+)
- `PATCH /api/mobile/leave-requests/:id` - Approve/reject leave (manager+)
- `GET /api/mobile/payslips` - Employee payslip list
- `GET /api/mobile/payslips/:month/:year` - Detailed payslip with employee info
- `GET /api/mobile/salary-structure` - Active salary structure (view own)
- `GET /api/mobile/holidays` - Company holiday list
- `GET /api/mobile/my-team` - Team member list (manager+)
- `GET /api/mobile/birthdays` - Birthday list with month filter
- `POST /api/mobile/quick-attendance` - Quick attendance entry (manager+)
- `POST /api/mobile/monthly-attendance-entry` - Monthly attendance with pay days & OT (manager+)
- `POST /api/mobile/employees` - Employee registration (admin+)
- `GET /api/mobile/departments` - Company departments list
- `GET /api/mobile/designations` - Company designations list
- `GET /api/mobile/locations` - Company locations list
- `POST /api/mobile/salary-structures` - Create salary structure (admin+)
- `PATCH /api/mobile/salary-structures/:id` - Update salary structure (admin+)
- `GET /api/mobile/salary-structures/employee/:id` - Get employee salary structures (admin+)
- `GET /api/mobile/job-postings/manage` - List company job postings with app count (admin/recruiter+)
- `POST /api/mobile/job-postings` - Create job posting (admin/recruiter+)
- `PUT /api/mobile/job-postings/:id` - Update job posting (admin/recruiter+)
- `DELETE /api/mobile/job-postings/:id` - Delete job posting (admin+)
- `GET /api/mobile/job-postings/:id/applications` - View applications for posting (admin/recruiter+)

### UI/UX Decisions
- Professional blue enterprise theme with dark mode support.
- Sidebar menu items are dynamically filtered based on user roles.

### Project Cleanup (Mar 2026)
- Removed `marpayrollnode/` (old backup project copy) and `marpayrollnode.zip`.
- Removed `hs_err_pid*.log` JVM crash log and `attached_assets/` development images.
- Removed 21 unused shadcn/ui components (accordion, aspect-ratio, breadcrumb, calendar, carousel, chart, collapsible, command, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, progress, radio-group, resizable, scroll-area, slider, toggle-group).
- Active shadcn/ui components (26): alert, alert-dialog, avatar, badge, button, card, checkbox, dialog, dropdown-menu, form, input, label, popover, select, separator, sheet, sidebar, skeleton, switch, table, tabs, textarea, toast, toaster, toggle, tooltip.

## External Dependencies
- **React**: Frontend UI library.
- **TypeScript**: Superset of JavaScript for type-safe code.
- **Wouter**: Small routing library for React.
- **TanStack Query (React Query)**: Data fetching and state management.
- **Shadcn/UI**: UI component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Express.js**: Backend web application framework.
- **Zod**: TypeScript-first schema declaration and validation library.
- **PostgreSQL**: Persistent database storage via Drizzle ORM.
- **jsPDF**: Client-side PDF generation library.
- **xlsx (SheetJS)**: Client-side Excel file generation.