UPDATE packages
SET
  monthly_refill_tokens = 10000,
  signup_token_grant = 10000,
  updated_at = NOW()
WHERE package_code = 'starter';

ALTER TABLE tts_voice_profiles
  ADD COLUMN IF NOT EXISTS reference_audio_file TEXT,
  ADD COLUMN IF NOT EXISTS reference_audio_file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS provider_sync_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS provider_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reference_normalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reference_quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS test_preview_file TEXT,
  ADD COLUMN IF NOT EXISTS test_preview_audio_seconds NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS test_preview_generated_at TIMESTAMPTZ;

ALTER TABLE tts_voice_profiles
  ALTER COLUMN provider_profile_id DROP NOT NULL;

UPDATE tts_voice_profiles
SET provider_profile_id = NULL
WHERE provider_profile_id = '';

ALTER TABLE tts_voice_profiles
  DROP CONSTRAINT IF EXISTS tts_voice_profiles_provider_sync_status_check;

ALTER TABLE tts_voice_profiles
  ADD CONSTRAINT tts_voice_profiles_provider_sync_status_check
  CHECK (provider_sync_status IN ('pending', 'ready'));
