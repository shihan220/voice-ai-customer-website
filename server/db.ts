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
}
