ALTER TABLE tts_generation_jobs
  ADD COLUMN IF NOT EXISTS provider_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_tts_generation_jobs_retry_schedule
  ON tts_generation_jobs (status, provider_next_attempt_at, created_at ASC);
