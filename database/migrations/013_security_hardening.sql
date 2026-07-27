ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_auth_version_positive;

ALTER TABLE users
  ADD CONSTRAINT users_auth_version_positive
  CHECK (auth_version > 0);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_token_balance_nonnegative;

ALTER TABLE users
  ADD CONSTRAINT users_token_balance_nonnegative
  CHECK (token_balance >= 0);

CREATE TABLE IF NOT EXISTS signup_rate_limits (
  ip_key_hash TEXT NOT NULL,
  bucket_date DATE NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip_key_hash, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_signup_rate_limits_updated_at
  ON signup_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS public_action_rate_limits (
  action_type TEXT NOT NULL,
  ip_key_hash TEXT NOT NULL,
  bucket_date DATE NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (action_type, ip_key_hash, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_public_action_rate_limits_updated_at
  ON public_action_rate_limits (updated_at);

ALTER TABLE tts_voice_profiles
  ADD COLUMN IF NOT EXISTS consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS provider_sync_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_deactivated_at TIMESTAMPTZ;

ALTER TABLE tts_voice_profiles
  DROP CONSTRAINT IF EXISTS tts_voice_profiles_provider_sync_status_check;

ALTER TABLE tts_voice_profiles
  ADD CONSTRAINT tts_voice_profiles_provider_sync_status_check
  CHECK (provider_sync_status IN ('pending', 'syncing', 'ready'));

CREATE TABLE IF NOT EXISTS tts_provider_usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('job_full', 'job_preview', 'sample_preview', 'voice_profile_create', 'voice_profile_sync', 'voice_test_preview')),
  resource_id BIGINT,
  usage_units INTEGER NOT NULL DEFAULT 1
    CHECK (usage_units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tts_provider_usage_events
  ADD COLUMN IF NOT EXISTS usage_units INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tts_provider_usage_events
  DROP CONSTRAINT IF EXISTS tts_provider_usage_events_event_type_check;

ALTER TABLE tts_provider_usage_events
  ADD CONSTRAINT tts_provider_usage_events_event_type_check
  CHECK (event_type IN ('job_full', 'job_preview', 'sample_preview', 'voice_profile_create', 'voice_profile_sync', 'voice_test_preview'));

ALTER TABLE tts_provider_usage_events
  DROP CONSTRAINT IF EXISTS tts_provider_usage_events_usage_units_check;

ALTER TABLE tts_provider_usage_events
  ADD CONSTRAINT tts_provider_usage_events_usage_units_check
  CHECK (usage_units > 0);

CREATE INDEX IF NOT EXISTS idx_tts_provider_usage_events_user_type_created_at
  ON tts_provider_usage_events (user_id, event_type, created_at DESC);

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_amount_positive,
  DROP CONSTRAINT IF EXISTS payments_currency_format,
  DROP CONSTRAINT IF EXISTS payments_purchase_shape;

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive
    CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT payments_currency_format
    CHECK (currency ~ '^[A-Z]{3}$') NOT VALID,
  ADD CONSTRAINT payments_purchase_shape
    CHECK (
      (payment_type = 'package_upgrade' AND package_code IS NOT NULL AND token_amount IS NULL)
      OR
      (payment_type = 'extra_tokens' AND package_code IS NULL AND token_amount > 0)
    ) NOT VALID;

ALTER TABLE package_upgrades
  DROP CONSTRAINT IF EXISTS package_upgrades_granted_tokens_nonnegative;

ALTER TABLE package_upgrades
  ADD CONSTRAINT package_upgrades_granted_tokens_nonnegative
    CHECK (granted_token_amount IS NULL OR granted_token_amount >= 0) NOT VALID;

ALTER TABLE token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_balance_after_nonnegative;

ALTER TABLE token_transactions
  ADD CONSTRAINT token_transactions_balance_after_nonnegative
    CHECK (balance_after >= 0) NOT VALID;

ALTER TABLE sample_generations
  DROP CONSTRAINT IF EXISTS sample_generations_numeric_invariants;

ALTER TABLE sample_generations
  ADD CONSTRAINT sample_generations_numeric_invariants
    CHECK (
      word_count > 0
      AND token_cost >= 0
      AND regeneration_attempts_used >= 0
      AND max_regeneration_attempts >= 0
      AND regeneration_attempts_used <= max_regeneration_attempts
    ) NOT VALID;

ALTER TABLE tts_voice_profiles
  DROP CONSTRAINT IF EXISTS tts_voice_profiles_audio_metadata_positive;

ALTER TABLE tts_voice_profiles
  ADD CONSTRAINT tts_voice_profiles_audio_metadata_positive
    CHECK (
      (reference_audio_seconds IS NULL OR reference_audio_seconds > 0)
      AND (reference_sample_rate IS NULL OR reference_sample_rate > 0)
      AND (reference_audio_file_size_bytes IS NULL OR reference_audio_file_size_bytes > 0)
      AND (test_preview_audio_seconds IS NULL OR test_preview_audio_seconds > 0)
    ) NOT VALID;

ALTER TABLE tts_generation_jobs
  DROP CONSTRAINT IF EXISTS tts_generation_jobs_numeric_invariants;

ALTER TABLE tts_generation_jobs
  ADD CONSTRAINT tts_generation_jobs_numeric_invariants
    CHECK (
      word_count > 0
      AND token_cost >= 0
      AND provider_attempt_count >= 0
      AND (generated_audio_seconds IS NULL OR generated_audio_seconds > 0)
      AND (billable_minutes IS NULL OR billable_minutes > 0)
      AND (preview_audio_seconds IS NULL OR preview_audio_seconds > 0)
    ) NOT VALID;

ALTER TABLE tts_usage_ledger
  DROP CONSTRAINT IF EXISTS tts_usage_ledger_billable_minutes_positive;

ALTER TABLE tts_usage_ledger
  ADD CONSTRAINT tts_usage_ledger_billable_minutes_positive
    CHECK (billable_minutes > 0) NOT VALID;
