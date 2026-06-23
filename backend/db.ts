import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/bangla_voice_ai`;

export const pool = new Pool({
  connectionString: databaseUrl,
});

export type VoiceCardRecord = {
  id: number;
  name: string;
  script_text: string;
  english_meaning: string | null;
  audio_file: string | null;
  duration: number;
  wave_seed: number;
  display_order: number;
  is_active: boolean;
};

export type SampleRequestStatus = 'new' | 'reviewing' | 'sample_ready' | 'sent' | 'archived';
export type EmailLogStatus = 'pending' | 'sent' | 'failed';
export type UserPackageType = 'starter' | 'gold' | 'platinum';
export type PaymentProvider = 'stripe' | 'bkash';
export type PaymentType = 'package_upgrade' | 'extra_tokens';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type SampleGenerationStatus = 'preview' | 'finalized' | 'failed';
export type SampleGenerationSourceKind = 'fallback' | 'provider';
export type TokenTransactionType =
  | 'signup_grant'
  | 'monthly_refill'
  | 'package_upgrade'
  | 'extra_purchase'
  | 'usage'
  | 'sample_voice_finalized'
  | 'admin_adjustment';

const backendRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.resolve(backendRoot, '..');
const migrationsDirectory = path.join(projectRoot, 'database', 'migrations');

export type SampleRequestRecord = {
  id: number;
  client_name: string;
  email: string;
  phone_number: string | null;
  company_name: string | null;
  message_details: string | null;
  selected_service: string | null;
  expected_monthly_volume: string | null;
  status: SampleRequestStatus;
  source_url: string | null;
  referrer: string | null;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PackageRecord = {
  package_code: UserPackageType;
  name: string;
  monthly_refill_tokens: number;
  signup_token_grant: number;
  is_premium: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
};

export type UserRecord = {
  id: number;
  email: string;
  password_hash: string;
  country_code: string | null;
  mobile_number: string | null;
  mobile_e164: string | null;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  package_code: UserPackageType;
  token_balance: number;
  starter_granted_at: Date | null;
  starter_last_refill_at: Date | null;
  account_status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
};

export type EmailVerificationRecord = {
  id: number;
  user_id: number;
  purpose: 'signup' | 'email_change';
  sent_to_email: string;
  otp_hash: string;
  otp_expires_at: Date;
  verified_at: Date | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
};

export type PhoneVerificationRecord = {
  id: number;
  user_id: number;
  purpose: 'signup' | 'phone_change';
  sent_to_phone: string;
  otp_hash: string;
  otp_expires_at: Date;
  verified_at: Date | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
};

export type PasswordResetRecord = {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

export type PaymentRecord = {
  id: number;
  user_id: number;
  provider: PaymentProvider;
  payment_type: PaymentType;
  status: PaymentStatus;
  amount: string;
  currency: string;
  package_code: UserPackageType | null;
  token_amount: number | null;
  provider_payment_id: string | null;
  provider_transaction_id: string | null;
  metadata: Record<string, unknown>;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type TokenTransactionRecord = {
  id: number;
  user_id: number;
  payment_id: number | null;
  package_upgrade_id: number | null;
  transaction_type: TokenTransactionType;
  token_delta: number;
  balance_after: number;
  notes: string | null;
  created_at: Date;
};

export type PackageUpgradeRecord = {
  id: number;
  user_id: number;
  from_package_code: UserPackageType | null;
  to_package_code: UserPackageType;
  payment_id: number | null;
  granted_token_amount: number | null;
  status: PaymentStatus;
  created_at: Date;
  updated_at: Date;
};

export type AdminActionRecord = {
  id: number;
  admin_email: string;
  action_type: string;
  target_user_id: number | null;
  payment_id: number | null;
  token_transaction_id: number | null;
  package_upgrade_id: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type UserActivityRecord = {
  id: number;
  user_id: number;
  action_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type VoiceSampleRecord = {
  id: number;
  title: string;
  request_id: number | null;
  original_filename: string;
  stored_filename: string;
  media_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: Date;
  updated_at: Date;
};

export type SampleGenerationRecord = {
  id: number;
  user_id: number;
  sample_request_id: number | null;
  script_text: string;
  selected_service: string;
  word_count: number;
  token_cost: number;
  audio_file: string;
  storage_key: string | null;
  source_kind: SampleGenerationSourceKind;
  status: SampleGenerationStatus;
  regeneration_attempts_used: number;
  max_regeneration_attempts: number;
  token_transaction_id: number | null;
  finalized_at: Date | null;
  downloaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SampleEmailLogRecord = {
  id: number;
  request_id: number | null;
  voice_sample_id: number | null;
  voice_card_id: number | null;
  recipient_email: string;
  subject: string;
  message: string;
  delivery_mode: 'attachment' | 'link';
  status: EmailLogStatus;
  error_message: string | null;
  sent_at: Date | null;
  created_at: Date;
};

async function applySqlMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  let migrationFiles: string[] = [];

  try {
    migrationFiles = (await fs.readdir(migrationsDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }

  for (const filename of migrationFiles) {
    const existingResult = await pool.query<{ filename: string }>(
      `
        SELECT filename
        FROM schema_migrations
        WHERE filename = $1
        LIMIT 1
      `,
      [filename],
    );

    if (existingResult.rowCount) {
      continue;
    }

    const migrationPath = path.join(migrationsDirectory, filename);
    const sql = await fs.readFile(migrationPath, 'utf8');

    await pool.query('BEGIN');

    try {
      await pool.query(sql);
      await pool.query(
        `
          INSERT INTO schema_migrations (filename)
          VALUES ($1)
        `,
        [filename],
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
}

export async function ensureSchema() {
  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_cards_active_order
      ON voice_cards (is_active, display_order, id);
  `);

  await pool.query(`
    ALTER TABLE voice_cards
      ADD COLUMN IF NOT EXISTS english_meaning TEXT;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sample_requests_status_created_at
      ON sample_requests (status, created_at DESC);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_samples_request_id_created_at
      ON voice_samples (request_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE voice_samples
      DROP COLUMN IF EXISTS transcript_bn,
      DROP COLUMN IF EXISTS transcript_en,
      DROP COLUMN IF EXISTS transcript_status,
      DROP COLUMN IF EXISTS transcript_error,
      DROP COLUMN IF EXISTS transcribed_at;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sample_email_logs_request_id_created_at
      ON sample_email_logs (request_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE sample_email_logs
      ADD COLUMN IF NOT EXISTS voice_card_id INTEGER REFERENCES voice_cards (id) ON DELETE SET NULL;
  `);

  await pool.query(`
    ALTER TABLE sample_email_logs
      DROP COLUMN IF EXISTS include_transcript;
  `);

  await applySqlMigrations();

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sample_generations_user_created_at
      ON sample_generations (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sample_generations_request_created_at
      ON sample_generations (sample_request_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE token_transactions
      DROP CONSTRAINT IF EXISTS token_transactions_transaction_type_check;
  `);

  await pool.query(`
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
  `);
}
