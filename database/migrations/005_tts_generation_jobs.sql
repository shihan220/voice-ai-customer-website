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
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  processing_stage TEXT,
  provider_voice TEXT NOT NULL,
  wav_file TEXT,
  mp3_file TEXT,
  error_message TEXT,
  token_transaction_id BIGINT REFERENCES token_transactions (id) ON DELETE SET NULL,
  downloaded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
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

ALTER TABLE token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_transaction_type_check;

ALTER TABLE token_transactions
  ADD CONSTRAINT token_transactions_transaction_type_check
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
  ));
