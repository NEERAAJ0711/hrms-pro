-- Contractor → Employee tagging
CREATE TABLE IF NOT EXISTS contractor_employees (
  id VARCHAR(36) PRIMARY KEY,
  company_contractor_id VARCHAR(36) NOT NULL REFERENCES company_contractors(id) ON DELETE CASCADE,
  employee_id VARCHAR(36) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE(company_contractor_id, employee_id)
);
