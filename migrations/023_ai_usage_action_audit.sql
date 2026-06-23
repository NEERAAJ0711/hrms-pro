-- Phase 2 — AI-assistant action auditing columns on the existing usage log.
-- Additive & nullable so existing usage rows and best-effort recording keep
-- working; lets the AI layer record user/intent/module/action per action.
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS intent  TEXT;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS module  TEXT;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS action  TEXT;
