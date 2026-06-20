-- Add statutory profile fields (nominee, marital status, mother's name, emergency contact, blood group)
-- needed for ESIC/EPFO so the AI HR assistant can save them.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nominee_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nominee_relation TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT;
