CREATE TABLE IF NOT EXISTS voice_cards (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  script_text TEXT NOT NULL,
  english_meaning TEXT,
  audio_file VARCHAR(255),
  duration DOUBLE PRECISION NOT NULL DEFAULT 4.0,
  wave_seed INTEGER NOT NULL DEFAULT 42,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_cards_active_order
  ON voice_cards (is_active, display_order, id);

ALTER TABLE voice_cards
  ADD COLUMN IF NOT EXISTS english_meaning TEXT;

CREATE TABLE IF NOT EXISTS sample_requests (
  id BIGSERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  company_name TEXT,
  message_details TEXT,
  selected_service TEXT,
  expected_monthly_volume TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'sample_ready', 'sent', 'archived')),
  source_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_requests_status_created_at
  ON sample_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_samples (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  request_id BIGINT REFERENCES sample_requests (id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  media_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_samples_request_id_created_at
  ON voice_samples (request_id, created_at DESC);

ALTER TABLE voice_samples
  DROP COLUMN IF EXISTS transcript_bn,
  DROP COLUMN IF EXISTS transcript_en,
  DROP COLUMN IF EXISTS transcript_status,
  DROP COLUMN IF EXISTS transcript_error,
  DROP COLUMN IF EXISTS transcribed_at;

CREATE TABLE IF NOT EXISTS sample_email_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT REFERENCES sample_requests (id) ON DELETE SET NULL,
  voice_sample_id BIGINT REFERENCES voice_samples (id) ON DELETE SET NULL,
  voice_card_id INTEGER REFERENCES voice_cards (id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'link'
    CHECK (delivery_mode IN ('attachment', 'link')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_email_logs_request_id_created_at
  ON sample_email_logs (request_id, created_at DESC);

ALTER TABLE sample_email_logs
  ADD COLUMN IF NOT EXISTS voice_card_id INTEGER REFERENCES voice_cards (id) ON DELETE SET NULL;

ALTER TABLE sample_email_logs
  DROP COLUMN IF EXISTS include_transcript;

CREATE TABLE IF NOT EXISTS customer_sessions (
  sid VARCHAR NOT NULL,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL,
  CONSTRAINT customer_sessions_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_expire
  ON customer_sessions (expire);

CREATE TABLE IF NOT EXISTS admin_sessions (
  sid VARCHAR NOT NULL,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'session_pkey'
      AND conrelid = 'admin_sessions'::regclass
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_sessions_pkey'
      AND conrelid = 'admin_sessions'::regclass
  ) THEN
    ALTER TABLE admin_sessions
      ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (sid);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expire
  ON admin_sessions (expire);

CREATE TABLE IF NOT EXISTS packages (
  package_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_refill_tokens BIGINT NOT NULL DEFAULT 0,
  signup_token_grant BIGINT NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO packages (package_code, name, monthly_refill_tokens, signup_token_grant, is_premium, display_order)
VALUES
  ('starter', 'Starter', 10000, 10000, FALSE, 0),
  ('gold', 'Gold', 0, 10000, TRUE, 1),
  ('platinum', 'Platinum', 0, 100000, TRUE, 2)
ON CONFLICT (package_code) DO UPDATE
SET
  name = EXCLUDED.name,
  monthly_refill_tokens = EXCLUDED.monthly_refill_tokens,
  signup_token_grant = EXCLUDED.signup_token_grant,
  is_premium = EXCLUDED.is_premium,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  country_code TEXT,
  mobile_number TEXT,
  mobile_e164 TEXT,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  package_code TEXT NOT NULL DEFAULT 'starter' REFERENCES packages (package_code),
  token_balance BIGINT NOT NULL DEFAULT 0,
  starter_granted_at TIMESTAMPTZ,
  starter_last_refill_at TIMESTAMPTZ,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_e164_unique
  ON users (mobile_e164)
  WHERE mobile_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_package_code_status
  ON users (package_code, account_status, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'signup'
    CHECK (purpose IN ('signup', 'email_change')),
  sent_to_email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_created_at
  ON email_verifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_verifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'signup'
    CHECK (purpose IN ('signup', 'phone_change')),
  sent_to_phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_user_created_at
  ON phone_verifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_created_at
  ON password_resets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL
    CHECK (provider IN ('stripe', 'bkash')),
  payment_type TEXT NOT NULL
    CHECK (payment_type IN ('package_upgrade', 'extra_tokens')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  package_code TEXT REFERENCES packages (package_code),
  token_amount BIGINT,
  provider_payment_id TEXT,
  provider_transaction_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_status_created_at
  ON payments (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_unique
  ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_payments (
  payment_id BIGINT PRIMARY KEY REFERENCES payments (id) ON DELETE CASCADE,
  checkout_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT,
  webhook_event_id TEXT,
  price_id TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bkash_payments (
  payment_id BIGINT PRIMARY KEY REFERENCES payments (id) ON DELETE CASCADE,
  bkash_payment_id TEXT,
  trx_id TEXT,
  merchant_invoice_number TEXT,
  intent TEXT,
  callback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  execute_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  query_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bkash_payments_payment_id_unique
  ON bkash_payments (bkash_payment_id)
  WHERE bkash_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS package_upgrades (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  from_package_code TEXT REFERENCES packages (package_code),
  to_package_code TEXT NOT NULL REFERENCES packages (package_code),
  payment_id BIGINT REFERENCES payments (id) ON DELETE SET NULL,
  granted_token_amount BIGINT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_upgrades_user_created_at
  ON package_upgrades (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS token_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payment_id BIGINT REFERENCES payments (id) ON DELETE SET NULL,
  package_upgrade_id BIGINT REFERENCES package_upgrades (id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN (
      'signup_grant',
      'monthly_refill',
      'package_upgrade',
      'extra_purchase',
      'usage',
      'sample_voice_finalized',
      'admin_adjustment',
      'tts_generation',
      'tts_generation_refund'
    )),
  token_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created_at
  ON token_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sample_generations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sample_request_id BIGINT REFERENCES sample_requests (id) ON DELETE SET NULL,
  script_text TEXT NOT NULL,
  selected_service TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  token_cost BIGINT NOT NULL,
  audio_file TEXT NOT NULL,
  storage_key TEXT,
  source_kind TEXT NOT NULL DEFAULT 'fallback'
    CHECK (source_kind IN ('fallback', 'provider')),
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'finalized', 'failed')),
  regeneration_attempts_used INTEGER NOT NULL DEFAULT 0,
  max_regeneration_attempts INTEGER NOT NULL DEFAULT 2,
  token_transaction_id BIGINT REFERENCES token_transactions (id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_generations_user_created_at
  ON sample_generations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sample_generations_request_created_at
  ON sample_generations (sample_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tts_voice_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_profile_id TEXT,
  provider_sync_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (provider_sync_status IN ('pending', 'ready')),
  provider_sync_error TEXT,
  provider_synced_at TIMESTAMPTZ,
  display_name TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  reference_audio_seconds NUMERIC(12, 3),
  reference_sample_rate INTEGER,
  reference_audio_file TEXT,
  reference_audio_file_size_bytes BIGINT,
  reference_normalized_at TIMESTAMPTZ,
  reference_quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_preview_file TEXT,
  test_preview_audio_seconds NUMERIC(12, 3),
  test_preview_generated_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS tts_generation_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('text', 'pdf')),
  source_name TEXT,
  input_text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  token_cost BIGINT NOT NULL,
  quality_preset TEXT NOT NULL DEFAULT 'premium_mp3_wav'
    CHECK (quality_preset IN ('premium_mp3_wav', 'high_mp3_wav', 'standard_mp3_wav', 'wav_only')),
  mp3_bitrate_kbps INTEGER,
  generated_audio_seconds NUMERIC(12, 3),
  billable_minutes BIGINT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'preview_queued', 'preview_processing', 'preview_ready', 'cancelling', 'cancelled')),
  processing_stage TEXT,
  provider_voice TEXT NOT NULL,
  voice_profile_id BIGINT REFERENCES tts_voice_profiles (id) ON DELETE SET NULL,
  voice_display_name TEXT NOT NULL DEFAULT 'Keypillar Bangla Female',
  provider_voice_profile_id TEXT,
  wav_file TEXT,
  mp3_file TEXT,
  preview_file TEXT,
  preview_audio_seconds NUMERIC(12, 3),
  error_message TEXT,
  token_transaction_id BIGINT REFERENCES token_transactions (id) ON DELETE SET NULL,
  downloaded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  preview_generated_at TIMESTAMPTZ,
  full_generation_requested_at TIMESTAMPTZ,
  cancellation_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_generation_jobs_user_created_at
  ON tts_generation_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tts_generation_jobs_status_created_at
  ON tts_generation_jobs (status, created_at ASC);

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

CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
  payment_id BIGINT REFERENCES payments (id) ON DELETE SET NULL,
  token_transaction_id BIGINT REFERENCES token_transactions (id) ON DELETE SET NULL,
  package_upgrade_id BIGINT REFERENCES package_upgrades (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON admin_actions (created_at DESC);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_created_at
  ON user_activity_logs (user_id, created_at DESC);
