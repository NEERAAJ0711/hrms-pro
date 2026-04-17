-- ADMS push mode columns. The device pushes punches to us over HTTP
-- instead of us dialing it; track when we last heard from each device.
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS last_push_at text;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS last_push_ip text;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS firmware_version text;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS push_total integer NOT NULL DEFAULT 0;

-- A device serial is the only identifier the device sends in ADMS push,
-- so it must be unique across the table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'biometric_devices_device_serial_unique'
  ) THEN
    -- Defensive: drop duplicates before adding the unique constraint
    -- so the migration is idempotent on existing data.
    DELETE FROM biometric_devices a
    USING biometric_devices b
    WHERE a.ctid < b.ctid AND a.device_serial = b.device_serial;

    CREATE UNIQUE INDEX biometric_devices_device_serial_unique
      ON biometric_devices (device_serial);
  END IF;
END $$;
