-- 025_employee_master_link.sql
-- Cross-company employee association.
--
-- A single person (identified by PAN/Aadhaar) may be employed at two companies
-- with different employment details in each (e.g. On-Roll in Company A,
-- Contractual in Company B). The second-company record points at the On-Roll
-- ("master") record via master_employee_id so the two are linked as the same
-- person. NULL = this record is the master, or the person works at one company.
--
-- Additive and nullable; existing rows keep working unchanged.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS master_employee_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS employees_master_employee_idx ON employees (master_employee_id);
