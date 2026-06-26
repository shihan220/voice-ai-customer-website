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
export type TtsGenerationJobSourceType = 'text' | 'pdf';
export type TtsGenerationJobStatus =
  | 'cancelled'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'preview_processing'
  | 'preview_queued'
  | 'preview_ready'
  | 'processing'
  | 'queued';
export type TtsGenerationQualityPreset = 'high_mp3_wav' | 'premium_mp3_wav' | 'standard_mp3_wav' | 'wav_only';
export type TtsPronunciationRuleMatchType = 'phrase' | 'whole_word';
export type TokenTransactionType =
  | 'signup_grant'
  | 'monthly_refill'
  | 'package_upgrade'
  | 'extra_purchase'
  | 'usage'
  | 'sample_voice_finalized'
  | 'admin_adjustment'
  | 'tts_generation'
  | 'tts_generation_refund';

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
  full_name: string | null;
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

export type TtsPronunciationRuleRecord = {
  id: number;
  match_text: string;
  replacement_text: string;
  match_type: TtsPronunciationRuleMatchType;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TtsVoiceProfileRecord = {
  id: number;
  user_id: number;
  provider_profile_id: string;
  provider_sync_status: 'pending' | 'ready';
  provider_sync_error: string | null;
  provider_synced_at: Date | null;
  display_name: string;
  reference_text: string;
  reference_audio_seconds: number | null;
  reference_sample_rate: number | null;
  reference_audio_file: string | null;
  reference_audio_file_size_bytes: number | null;
  is_active: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

export type TtsGenerationJobRecord = {
  id: number;
  user_id: number;
  source_type: TtsGenerationJobSourceType;
  source_name: string | null;
  input_text: string;
  word_count: number;
  token_cost: number;
  quality_preset: TtsGenerationQualityPreset;
  mp3_bitrate_kbps: number | null;
  generated_audio_seconds: number | null;
  billable_minutes: number | null;
  status: TtsGenerationJobStatus;
  processing_stage: string | null;
  provider_voice: string;
  voice_profile_id: number | null;
  voice_display_name: string;
  provider_voice_profile_id: string | null;
  wav_file: string | null;
  mp3_file: string | null;
  preview_file: string | null;
  preview_audio_seconds: number | null;
  error_message: string | null;
  token_transaction_id: number | null;
  downloaded_at: Date | null;
  completed_at: Date | null;
  preview_generated_at: Date | null;
  full_generation_requested_at: Date | null;
  cancellation_requested_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TtsUsageLedgerRecord = {
  id: number;
  user_id: number;
  job_id: number;
  billable_minutes: number;
  reason: string;
  created_at: Date;
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
    CREATE TABLE IF NOT EXISTS tts_voice_profiles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      provider_profile_id TEXT NOT NULL,
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
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE tts_voice_profiles
      ADD COLUMN IF NOT EXISTS reference_audio_file TEXT,
      ADD COLUMN IF NOT EXISTS reference_audio_file_size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS provider_sync_status TEXT NOT NULL DEFAULT 'ready',
      ADD COLUMN IF NOT EXISTS provider_sync_error TEXT,
      ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE tts_voice_profiles
      DROP CONSTRAINT IF EXISTS tts_voice_profiles_provider_sync_status_check;
  `);

  await pool.query(`
    ALTER TABLE tts_voice_profiles
      ADD CONSTRAINT tts_voice_profiles_provider_sync_status_check
      CHECK (provider_sync_status IN ('pending', 'ready'));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_voice_profiles_user_active_created_at
      ON tts_voice_profiles (user_id, is_active, created_at DESC);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_voice_profiles_user_default_unique
      ON tts_voice_profiles (user_id)
      WHERE is_default = TRUE AND is_active = TRUE;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE tts_generation_jobs
      ADD COLUMN IF NOT EXISTS preview_file TEXT,
      ADD COLUMN IF NOT EXISTS preview_audio_seconds NUMERIC(12, 3),
      ADD COLUMN IF NOT EXISTS preview_generated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS full_generation_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
      ADD COLUMN IF NOT EXISTS voice_profile_id BIGINT REFERENCES tts_voice_profiles (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS voice_display_name TEXT NOT NULL DEFAULT 'Keypillar Bangla Female',
      ADD COLUMN IF NOT EXISTS provider_voice_profile_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE tts_generation_jobs
      DROP CONSTRAINT IF EXISTS tts_generation_jobs_status_check;
  `);

  await pool.query(`
    ALTER TABLE tts_generation_jobs
      ADD CONSTRAINT tts_generation_jobs_status_check
      CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'preview_queued', 'preview_processing', 'preview_ready', 'cancelling', 'cancelled'));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tts_usage_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      job_id BIGINT NOT NULL REFERENCES tts_generation_jobs (id) ON DELETE CASCADE,
      billable_minutes BIGINT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_usage_ledger_user_created_at
      ON tts_usage_ledger (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_generation_jobs_user_created_at
      ON tts_generation_jobs (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_generation_jobs_status_created_at
      ON tts_generation_jobs (status, created_at ASC);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_pronunciation_rules_active_created_at
      ON tts_pronunciation_rules (is_active, created_at DESC);
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
        'admin_adjustment',
        'tts_generation',
        'tts_generation_refund'
      ));
  `);
}
