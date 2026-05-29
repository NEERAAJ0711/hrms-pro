-- ─── EPFO & ESIC Automation Tables ───────────────────────────────────────────
-- Migration 019: EPFO & ESIC Automation Engine Foundation
-- Created: 2026-05-29

-- Automation Jobs (queue table)
CREATE TABLE IF NOT EXISTS automation_jobs (
  id                VARCHAR(36)   PRIMARY KEY,
  company_id        VARCHAR(36)   NOT NULL,
  job_type          TEXT          NOT NULL,
  status            TEXT          NOT NULL DEFAULT 'pending',
  payload           JSONB         NOT NULL DEFAULT '{}',
  result            JSONB,
  screenshot_path   TEXT,
  error_message     TEXT,
  retry_count       INTEGER       NOT NULL DEFAULT 0,
  max_retries       INTEGER       NOT NULL DEFAULT 3,
  scheduled_at      TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  created_by        VARCHAR(36),
  created_at        TEXT          NOT NULL,
  updated_at        TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_company_id  ON automation_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status      ON automation_jobs (status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_job_type    ON automation_jobs (job_type);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at  ON automation_jobs (created_at DESC);
-- Partial index for queue polling (only pending/paused jobs)
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pending     ON automation_jobs (created_at ASC) WHERE status = 'pending';

-- Automation Logs (detailed per-job activity)
CREATE TABLE IF NOT EXISTS automation_logs (
  id          VARCHAR(36)   PRIMARY KEY,
  job_id      VARCHAR(36)   NOT NULL,
  company_id  VARCHAR(36)   NOT NULL,
  level       TEXT          NOT NULL DEFAULT 'info',
  message     TEXT          NOT NULL,
  meta        JSONB,
  created_at  TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_job_id      ON automation_logs (job_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_company_id  ON automation_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at  ON automation_logs (created_at DESC);

-- Portal Sessions (encrypted credentials & browser cookies)
CREATE TABLE IF NOT EXISTS portal_sessions (
  id                    VARCHAR(36)   PRIMARY KEY,
  company_id            VARCHAR(36)   NOT NULL,
  portal                TEXT          NOT NULL,
  username              TEXT          NOT NULL,
  encrypted_password    TEXT          NOT NULL,
  encrypted_cookies     TEXT,
  last_login_at         TEXT,
  session_valid_until   TEXT,
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TEXT          NOT NULL,
  updated_at            TEXT          NOT NULL,
  UNIQUE (company_id, portal)
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_company_portal ON portal_sessions (company_id, portal);

-- EPFO Registrations
CREATE TABLE IF NOT EXISTS epfo_registrations (
  id                  VARCHAR(36)   PRIMARY KEY,
  company_id          VARCHAR(36)   NOT NULL,
  employee_id         VARCHAR(36)   NOT NULL,
  uan                 TEXT,
  pf_code             TEXT,
  member_id_at_epfo   TEXT,
  status              TEXT          NOT NULL DEFAULT 'pending',
  job_id              VARCHAR(36),
  submitted_at        TEXT,
  uan_generated_at    TEXT,
  error_message       TEXT,
  remarks             TEXT,
  created_by          VARCHAR(36),
  created_at          TEXT          NOT NULL,
  updated_at          TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_epfo_registrations_company_id   ON epfo_registrations (company_id);
CREATE INDEX IF NOT EXISTS idx_epfo_registrations_employee_id  ON epfo_registrations (employee_id);
CREATE INDEX IF NOT EXISTS idx_epfo_registrations_uan          ON epfo_registrations (uan);
CREATE UNIQUE INDEX IF NOT EXISTS idx_epfo_registrations_emp_unique ON epfo_registrations (company_id, employee_id);

-- EPFO KYC Records
CREATE TABLE IF NOT EXISTS epfo_kyc_records (
  id               VARCHAR(36)   PRIMARY KEY,
  company_id       VARCHAR(36)   NOT NULL,
  employee_id      VARCHAR(36)   NOT NULL,
  uan              TEXT,
  kyc_type         TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending',
  document_number  TEXT,
  job_id           VARCHAR(36),
  submitted_at     TEXT,
  approved_at      TEXT,
  error_message    TEXT,
  created_by       VARCHAR(36),
  created_at       TEXT          NOT NULL,
  updated_at       TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_epfo_kyc_company_id   ON epfo_kyc_records (company_id);
CREATE INDEX IF NOT EXISTS idx_epfo_kyc_employee_id  ON epfo_kyc_records (employee_id);

-- EPFO ECR Returns
CREATE TABLE IF NOT EXISTS epfo_ecr_returns (
  id                          VARCHAR(36)   PRIMARY KEY,
  company_id                  VARCHAR(36)   NOT NULL,
  month                       TEXT          NOT NULL,
  year                        INTEGER       NOT NULL,
  total_employees             INTEGER       DEFAULT 0,
  total_pf_wages              INTEGER       DEFAULT 0,
  total_employee_contribution INTEGER       DEFAULT 0,
  total_employer_contribution INTEGER       DEFAULT 0,
  total_amount                INTEGER       DEFAULT 0,
  trrn                        TEXT,
  challan_no                  TEXT,
  status                      TEXT          NOT NULL DEFAULT 'pending',
  ecr_file_path               TEXT,
  challan_file_path           TEXT,
  job_id                      VARCHAR(36),
  filed_at                    TEXT,
  due_date                    TEXT,
  error_message               TEXT,
  created_by                  VARCHAR(36),
  created_at                  TEXT          NOT NULL,
  updated_at                  TEXT          NOT NULL,
  UNIQUE (company_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_epfo_ecr_returns_company_id  ON epfo_ecr_returns (company_id);
CREATE INDEX IF NOT EXISTS idx_epfo_ecr_returns_year_month  ON epfo_ecr_returns (year DESC, month);

-- ESIC Registrations
CREATE TABLE IF NOT EXISTS esic_registrations (
  id               VARCHAR(36)   PRIMARY KEY,
  company_id       VARCHAR(36)   NOT NULL,
  employee_id      VARCHAR(36)   NOT NULL,
  ip_number        TEXT,
  esic_code        TEXT,
  status           TEXT          NOT NULL DEFAULT 'pending',
  job_id           VARCHAR(36),
  submitted_at     TEXT,
  ip_generated_at  TEXT,
  error_message    TEXT,
  remarks          TEXT,
  created_by       VARCHAR(36),
  created_at       TEXT          NOT NULL,
  updated_at       TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_esic_registrations_company_id   ON esic_registrations (company_id);
CREATE INDEX IF NOT EXISTS idx_esic_registrations_employee_id  ON esic_registrations (employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_esic_registrations_emp_unique ON esic_registrations (company_id, employee_id);

-- ESIC Monthly Returns
CREATE TABLE IF NOT EXISTS esic_monthly_returns (
  id                          VARCHAR(36)   PRIMARY KEY,
  company_id                  VARCHAR(36)   NOT NULL,
  month                       TEXT          NOT NULL,
  year                        INTEGER       NOT NULL,
  total_employees             INTEGER       DEFAULT 0,
  total_esic_wages            INTEGER       DEFAULT 0,
  total_employee_contribution INTEGER       DEFAULT 0,
  total_employer_contribution INTEGER       DEFAULT 0,
  total_amount                INTEGER       DEFAULT 0,
  challan_no                  TEXT,
  status                      TEXT          NOT NULL DEFAULT 'pending',
  return_file_path            TEXT,
  challan_file_path           TEXT,
  job_id                      VARCHAR(36),
  filed_at                    TEXT,
  due_date                    TEXT,
  error_message               TEXT,
  created_by                  VARCHAR(36),
  created_at                  TEXT          NOT NULL,
  updated_at                  TEXT          NOT NULL,
  UNIQUE (company_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_esic_monthly_returns_company_id  ON esic_monthly_returns (company_id);
CREATE INDEX IF NOT EXISTS idx_esic_monthly_returns_year_month  ON esic_monthly_returns (year DESC, month);

-- Challans (unified EPFO + ESIC)
CREATE TABLE IF NOT EXISTS challans (
  id          VARCHAR(36)   PRIMARY KEY,
  company_id  VARCHAR(36)   NOT NULL,
  portal      TEXT          NOT NULL,
  month       TEXT          NOT NULL,
  year        INTEGER       NOT NULL,
  challan_no  TEXT,
  trrn        TEXT,
  amount      INTEGER       DEFAULT 0,
  due_date    TEXT,
  paid_date   TEXT,
  status      TEXT          NOT NULL DEFAULT 'generated',
  file_path   TEXT,
  job_id      VARCHAR(36),
  created_at  TEXT          NOT NULL,
  updated_at  TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_challans_company_id  ON challans (company_id);
CREATE INDEX IF NOT EXISTS idx_challans_portal       ON challans (portal);
CREATE INDEX IF NOT EXISTS idx_challans_year_month  ON challans (year DESC, month);

-- Compliance Calendar Events
CREATE TABLE IF NOT EXISTS compliance_calendar_events (
  id                VARCHAR(36)   PRIMARY KEY,
  company_id        VARCHAR(36)   NOT NULL,
  event_type        TEXT          NOT NULL,
  title             TEXT          NOT NULL,
  description       TEXT,
  due_date          TEXT          NOT NULL,
  period_month      TEXT,
  period_year       INTEGER,
  status            TEXT          NOT NULL DEFAULT 'upcoming',
  related_return_id VARCHAR(36),
  created_at        TEXT          NOT NULL,
  updated_at        TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_calendar_company_id  ON compliance_calendar_events (company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_due_date    ON compliance_calendar_events (due_date ASC);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_status      ON compliance_calendar_events (status);
