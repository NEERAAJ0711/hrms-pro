-- Compliance contract-labour tables (clients/projects, employee assignments, carry-forward)

CREATE TABLE IF NOT EXISTS compliance_clients (
  id                          VARCHAR PRIMARY KEY,
  company_id                  VARCHAR NOT NULL,
  project_name                VARCHAR NOT NULL,
  client_name                 VARCHAR,
  client_address              TEXT,
  principal_employer_name     VARCHAR,
  principal_employer_address  TEXT,
  nature_of_work              VARCHAR,
  location_of_work            VARCHAR,
  project_start_date          DATE,
  project_end_date            DATE,
  status                      VARCHAR DEFAULT 'active',
  created_by                  VARCHAR,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cc_company ON compliance_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_cc_status  ON compliance_clients(status);

CREATE TABLE IF NOT EXISTS compliance_client_employees (
  id                VARCHAR PRIMARY KEY,
  client_id         VARCHAR NOT NULL,
  employee_id       VARCHAR NOT NULL,
  company_id        VARCHAR NOT NULL,
  assigned_date     DATE NOT NULL,
  deassigned_date   DATE,
  status            VARCHAR DEFAULT 'active',
  created_by        VARCHAR,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cce_client   ON compliance_client_employees(client_id);
CREATE INDEX IF NOT EXISTS idx_cce_employee ON compliance_client_employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_cce_company  ON compliance_client_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_cce_status   ON compliance_client_employees(status);

CREATE TABLE IF NOT EXISTS compliance_carry_forward (
  id                  VARCHAR PRIMARY KEY,
  company_id          VARCHAR NOT NULL,
  employee_id         VARCHAR NOT NULL,
  month               VARCHAR NOT NULL,
  year                INTEGER NOT NULL,
  carry_fwd_amount    NUMERIC(12,2) DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compliance_carry_forward_unique'
  ) THEN
    ALTER TABLE compliance_carry_forward
      ADD CONSTRAINT compliance_carry_forward_unique
      UNIQUE (company_id, employee_id, month, year);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ccf_company  ON compliance_carry_forward(company_id);
CREATE INDEX IF NOT EXISTS idx_ccf_employee ON compliance_carry_forward(employee_id);
