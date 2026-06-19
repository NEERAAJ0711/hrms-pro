-- Phase-1: Recommended performance indexes on high-traffic foreign-key and
-- filter columns. Indexes ONLY — no table/column/structure changes.
--
-- All statements use CREATE INDEX IF NOT EXISTS so this migration is safe to
-- run repeatedly and against the existing production database. Index names and
-- columns mirror the index definitions added to shared/schema.ts, so applying
-- this file (psql) and running `drizzle-kit push` produce the same indexes.
--
-- Apply manually with:  psql "$DATABASE_URL" -f migrations/008_add_recommended_indexes.sql
-- (or) via the schema:   npm run db:push

-- employees: tenant scans, status filters, and user->employee lookups
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees (company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_status ON employees (company_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees (user_id);

-- attendance: per-employee and per-company day lookups
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance (employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON attendance (company_id, date);

-- leave_requests: tenant lists, employee history, status filtering (approvals)
CREATE INDEX IF NOT EXISTS idx_leave_requests_company ON leave_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status);

-- salary_structures: per-employee and per-company lookups
CREATE INDEX IF NOT EXISTS idx_salary_structures_employee ON salary_structures (employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_company ON salary_structures (company_id);

-- payroll: monthly run scans (company+month+year) and per-employee history
CREATE INDEX IF NOT EXISTS idx_payroll_company_month_year ON payroll (company_id, month, year);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll (employee_id);

-- biometric_punch_logs: company+date feeds and per-employee punch history
CREATE INDEX IF NOT EXISTS idx_biometric_punch_company_date ON biometric_punch_logs (company_id, punch_date);
CREATE INDEX IF NOT EXISTS idx_biometric_punch_employee ON biometric_punch_logs (employee_id);

-- notifications: unread badge / list per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);

-- automation_jobs: queue polling by company/type/status and worker claim scans
CREATE INDEX IF NOT EXISTS idx_automation_jobs_company_type_status ON automation_jobs (company_id, job_type, status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_type_status_completed ON automation_jobs (job_type, status, completed_at);

-- automation_logs: detailed log fetch per job
CREATE INDEX IF NOT EXISTS idx_automation_logs_job ON automation_logs (job_id);

-- esic_fetched_employees: per-company fetched lists
CREATE INDEX IF NOT EXISTS idx_esic_fetched_company ON esic_fetched_employees (company_id);
