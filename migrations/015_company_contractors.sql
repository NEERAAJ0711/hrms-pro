-- Company-Contractor relationship table
CREATE TABLE IF NOT EXISTS company_contractors (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contractor_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  UNIQUE(company_id, contractor_id)
);
