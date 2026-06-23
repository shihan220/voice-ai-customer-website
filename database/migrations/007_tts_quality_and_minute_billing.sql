ALTER TABLE tts_generation_jobs
  ADD COLUMN IF NOT EXISTS quality_preset TEXT NOT NULL DEFAULT 'premium_mp3_wav',
  ADD COLUMN IF NOT EXISTS mp3_bitrate_kbps INTEGER,
  ADD COLUMN IF NOT EXISTS generated_audio_seconds NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS billable_minutes BIGINT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE tts_generation_jobs
SET
  quality_preset = COALESCE(quality_preset, 'premium_mp3_wav'),
  mp3_bitrate_kbps = COALESCE(mp3_bitrate_kbps, 320)
WHERE quality_preset IS NULL
   OR mp3_bitrate_kbps IS NULL;

ALTER TABLE tts_generation_jobs
  DROP CONSTRAINT IF EXISTS tts_generation_jobs_quality_preset_check;

ALTER TABLE tts_generation_jobs
  ADD CONSTRAINT tts_generation_jobs_quality_preset_check
  CHECK (quality_preset IN ('premium_mp3_wav', 'high_mp3_wav', 'standard_mp3_wav', 'wav_only'));

CREATE TABLE IF NOT EXISTS tts_usage_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id BIGINT NOT NULL REFERENCES tts_generation_jobs (id) ON DELETE CASCADE,
  billable_minutes BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_usage_ledger_user_created_at
  ON tts_usage_ledger (user_id, created_at DESC);
