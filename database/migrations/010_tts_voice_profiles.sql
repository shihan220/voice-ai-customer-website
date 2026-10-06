CREATE TABLE IF NOT EXISTS tts_voice_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_profile_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  reference_audio_seconds NUMERIC(12, 3),
  reference_sample_rate INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_voice_profiles_user_active_created_at
  ON tts_voice_profiles (user_id, is_active, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_voice_profiles_user_default_unique
  ON tts_voice_profiles (user_id)
  WHERE is_default = TRUE AND is_active = TRUE;

ALTER TABLE tts_generation_jobs
  ADD COLUMN IF NOT EXISTS voice_profile_id BIGINT REFERENCES tts_voice_profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voice_display_name TEXT NOT NULL DEFAULT 'Keypillar Bangla Female',
  ADD COLUMN IF NOT EXISTS provider_voice_profile_id TEXT;
