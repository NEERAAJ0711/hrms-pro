-- Add contractor flag to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_contractor boolean DEFAULT false;
