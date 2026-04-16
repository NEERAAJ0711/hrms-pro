-- Switch biometric device default port from 4370 to 8181
ALTER TABLE biometric_devices ALTER COLUMN port SET DEFAULT 8181;

-- Migrate existing devices still on the old default
UPDATE biometric_devices SET port = 8181 WHERE port = 4370;
