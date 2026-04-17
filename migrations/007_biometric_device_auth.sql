-- Bind each biometric device to a shared secret OR a pinned source IP/CIDR
-- so attackers can't fabricate ADMS pushes just by guessing a serial number.
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS allowed_ip_cidr text;

-- Backfill: any device that has been successfully pushing already gets
-- pinned to its last-known source IP, so the currently-deployed device
-- (e.g. 31.97.207.109) keeps working without manual reconfiguration.
UPDATE biometric_devices
   SET allowed_ip_cidr = last_push_ip || '/32'
 WHERE allowed_ip_cidr IS NULL
   AND push_token IS NULL
   AND last_push_ip IS NOT NULL
   AND last_push_ip <> '';
