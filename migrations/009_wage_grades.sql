-- Per-company wage grades (minimum-wage bands). Each employee can be tagged
-- with one grade via employees.wage_grade_id; minimum_wage is monthly INR.
CREATE TABLE IF NOT EXISTS wage_grades (
  id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id   VARCHAR(36) NOT NULL,
  name         TEXT        NOT NULL,
  code         TEXT,
  minimum_wage INTEGER     NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS wage_grades_company_idx ON wage_grades (company_id);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS wage_grade_id VARCHAR(36);

ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS period TEXT;

ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS effective_from TEXT;
