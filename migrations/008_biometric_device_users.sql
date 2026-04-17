-- Track users enrolled on each biometric device, populated from USER/USERINFO
-- records the device pushes via ADMS. Lets the View Users dialog show every
-- enrolled employee, not just those who have already punched.
CREATE TABLE IF NOT EXISTS biometric_device_users (
  id                 VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  device_id          VARCHAR(36) NOT NULL,
  device_employee_id TEXT        NOT NULL,
  name               TEXT,
  privilege          TEXT,
  card               TEXT,
  password_set       BOOLEAN     DEFAULT false,
  fingerprint_count  INTEGER     DEFAULT 0,
  first_seen_at      TEXT,
  last_seen_at       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS biometric_device_users_unique
  ON biometric_device_users (device_id, device_employee_id);
