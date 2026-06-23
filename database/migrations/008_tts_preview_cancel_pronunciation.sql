ALTER TABLE tts_generation_jobs
  ADD COLUMN IF NOT EXISTS preview_file TEXT,
  ADD COLUMN IF NOT EXISTS preview_audio_seconds NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS preview_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS full_generation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE tts_generation_jobs
  DROP CONSTRAINT IF EXISTS tts_generation_jobs_status_check;

ALTER TABLE tts_generation_jobs
  ADD CONSTRAINT tts_generation_jobs_status_check
  CHECK (status IN (
    'queued',
    'processing',
    'completed',
    'failed',
    'preview_queued',
    'preview_processing',
    'preview_ready',
    'cancelling',
    'cancelled'
  ));

CREATE TABLE IF NOT EXISTS tts_pronunciation_rules (
  id BIGSERIAL PRIMARY KEY,
  match_text TEXT NOT NULL,
  replacement_text TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'phrase'
    CHECK (match_type IN ('phrase', 'whole_word')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_pronunciation_rules_active_created_at
  ON tts_pronunciation_rules (is_active, created_at DESC);
