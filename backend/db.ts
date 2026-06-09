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
  audio_file: string | null;
  duration: number;
  wave_seed: number;
  display_order: number;
  is_active: boolean;
};

export type SampleRequestStatus = 'new' | 'reviewing' | 'sample_ready' | 'sent' | 'archived';
export type EmailLogStatus = 'pending' | 'sent' | 'failed';

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

export type SampleEmailLogRecord = {
  id: number;
  request_id: number | null;
  voice_sample_id: number | null;
  recipient_email: string;
  subject: string;
  message: string;
  delivery_mode: 'attachment' | 'link';
  status: EmailLogStatus;
  error_message: string | null;
  sent_at: Date | null;
  created_at: Date;
};

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_cards (
      id INTEGER PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      script_text TEXT NOT NULL,
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
      DROP COLUMN IF EXISTS include_transcript;
  `);
}
