-- Track the highest ATTLOG record timestamp acknowledged per device.
-- Returned as ATTLOGStamp in GET /cdata so the device only pushes new records
-- rather than re-uploading everything on every scheduled cycle.
-- Set to 0 to force a full re-upload on next device connection.
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS last_attlog_stamp INTEGER NOT NULL DEFAULT 0;
