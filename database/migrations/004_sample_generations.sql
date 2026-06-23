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
    'admin_adjustment'
  ));
