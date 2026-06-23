UPDATE packages
SET
  monthly_refill_tokens = 10000,
  signup_token_grant = 10000,
  updated_at = NOW()
WHERE package_code = 'starter';
