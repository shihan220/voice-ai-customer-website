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
      'admin_adjustment'
    )),
  token_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created_at
  ON token_transactions (user_id, created_at DESC);

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
