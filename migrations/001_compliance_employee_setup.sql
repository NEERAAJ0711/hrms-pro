-- Compliance employee setup table (rates & overrides per employee per company)
CREATE TABLE IF NOT EXISTS compliance_employee_setup (
  id              VARCHAR PRIMARY KEY,
  company_id      VARCHAR NOT NULL,
  employee_id     VARCHAR NOT NULL,
  department      VARCHAR,
  designation     VARCHAR,
  weekly_off      VARCHAR DEFAULT 'sunday',
  ot_type         VARCHAR DEFAULT 'na',
  payment_mode    VARCHAR DEFAULT 'actual',
  diff_adjustments TEXT DEFAULT '',
  pf_type         VARCHAR DEFAULT 'na',
  esic_type       VARCHAR DEFAULT 'na',
  lwf_type        VARCHAR DEFAULT 'na',
  bonus_type      VARCHAR DEFAULT 'na',
  basic_salary    NUMERIC(12,2) DEFAULT 0,
  gross_salary    NUMERIC(12,2) DEFAULT 0,
  same_as_actual  BOOLEAN DEFAULT true,
  created_by      VARCHAR,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compliance_employee_setup_company_employee_unique'
  ) THEN
    ALTER TABLE compliance_employee_setup
      ADD CONSTRAINT compliance_employee_setup_company_employee_unique
      UNIQUE (company_id, employee_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ces_company  ON compliance_employee_setup(company_id);
CREATE INDEX IF NOT EXISTS idx_ces_employee ON compliance_employee_setup(employee_id);
