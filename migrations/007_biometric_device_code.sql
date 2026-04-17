-- 007: Add a short, friendly machine code to biometric devices.
-- Admins use this to refer to a specific machine when assigning
-- employees. It is intentionally separate from device_serial so
-- the visible label can be renamed without changing identity.

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS code TEXT;
