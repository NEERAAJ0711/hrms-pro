-- Phase 3 — Recruitment AI Suite. Additive & nullable columns that hold parsed
-- resume data and AI results (score, breakdown, summary, interview questions,
-- duplicate links). Back-compatible: existing recruitment rows/endpoints are
-- unaffected. Each column is guarded with IF NOT EXISTS for idempotency.

-- Job applications: where uploaded resumes live and scoring happens per job.
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS resume_text       TEXT;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS parsed_resume     JSONB;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_score          INTEGER;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_scored_job_id  VARCHAR(36);
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_scored_at      TEXT;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_summary        TEXT;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_questions      JSONB;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS duplicate_of      VARCHAR(36);

-- Candidate profiles (self-signup): parsed resume + AI summary.
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS resume_text   TEXT;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS parsed_resume JSONB;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS ai_summary    TEXT;
