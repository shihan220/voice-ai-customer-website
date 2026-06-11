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
