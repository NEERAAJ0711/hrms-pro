-- Persist the ADMS command queue in the database so queued commands
-- (e.g. DATA UPDATE ATTLOG, DATA UPDATE USERINFO) survive server restarts.
-- Previously the queue was in-memory only; now both are kept in sync and the
-- DB acts as the authoritative store.
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS pending_commands JSONB NOT NULL DEFAULT '[]'::jsonb;
