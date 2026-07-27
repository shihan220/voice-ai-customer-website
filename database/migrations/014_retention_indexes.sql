CREATE INDEX IF NOT EXISTS idx_email_verifications_created_at
  ON email_verifications (created_at);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_created_at
  ON phone_verifications (created_at);

CREATE INDEX IF NOT EXISTS idx_password_resets_created_at
  ON password_resets (created_at);

CREATE INDEX IF NOT EXISTS idx_signup_rate_limits_bucket_date
  ON signup_rate_limits (bucket_date);

CREATE INDEX IF NOT EXISTS idx_public_action_rate_limits_bucket_date
  ON public_action_rate_limits (bucket_date);

CREATE INDEX IF NOT EXISTS idx_tts_provider_usage_events_created_at
  ON tts_provider_usage_events (created_at);
