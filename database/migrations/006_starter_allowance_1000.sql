UPDATE packages
SET
  monthly_refill_tokens = 1000,
  signup_token_grant = 1000,
  updated_at = NOW()
WHERE package_code = 'starter';
