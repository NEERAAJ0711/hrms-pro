-- AI usage/observability log. Additive, intentionally has NO foreign keys so it
-- can be written best-effort by the AI metrics recorder without coupling to
-- other tables' lifecycles.
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                 VARCHAR(36)   PRIMARY KEY,
  company_id         VARCHAR(36),
  employee_id        VARCHAR(36),
  feature            TEXT          NOT NULL,
  provider           TEXT          NOT NULL,
  model              TEXT,
  prompt_tokens      INTEGER       NOT NULL DEFAULT 0,
  completion_tokens  INTEGER       NOT NULL DEFAULT 0,
  total_tokens       INTEGER       NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms         INTEGER       NOT NULL DEFAULT 0,
  success            BOOLEAN       NOT NULL DEFAULT true,
  error              TEXT,
  created_at         TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_company_created_idx
  ON ai_usage_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx
  ON ai_usage_logs (feature, created_at DESC);
