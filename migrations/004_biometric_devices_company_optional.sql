-- Allow a single biometric device to serve multiple companies' data
-- by making company_id optional on biometric_devices
ALTER TABLE biometric_devices ALTER COLUMN company_id DROP NOT NULL;
