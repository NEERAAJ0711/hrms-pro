CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
