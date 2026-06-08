import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ensureSchema, pool } from '../db.ts';

type SourceVoice = {
  id: number;
  name: string;
  script_text: string;
  audio_file: string | null;
  duration: number;
  wave_seed: number;
  order: number;
  is_active: number;
};

const sqliteDb = process.env.SOURCE_SQLITE_DB ?? '/Users/mohammadshihan/bangla-speech-ai/db.sqlite3';

const sqliteQuery = `
  SELECT id, name, script_text, audio_file, duration, wave_seed, "order", is_active
  FROM core_voicecard
  ORDER BY "order" ASC, id ASC;
`;

function readSourceVoices() {
  if (!existsSync(sqliteDb)) {
    throw new Error(
      `SQLite source database not found: ${sqliteDb}. If you only need default website records, run "npm run db:seed:voices" instead.`,
    );
  }

  const output = execFileSync('sqlite3', ['-json', sqliteDb, sqliteQuery], {
    encoding: 'utf8',
  });

  return JSON.parse(output) as SourceVoice[];
}

async function importVoices() {
  await ensureSchema();

  const voices = readSourceVoices();

  for (const voice of voices) {
    await pool.query(
      `
        INSERT INTO voice_cards (
          id, name, script_text, audio_file, duration, wave_seed, display_order, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          script_text = EXCLUDED.script_text,
          audio_file = EXCLUDED.audio_file,
          duration = EXCLUDED.duration,
          wave_seed = EXCLUDED.wave_seed,
          display_order = EXCLUDED.display_order,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
      `,
      [
        voice.id,
        voice.name,
        voice.script_text,
        voice.audio_file,
        voice.duration,
        voice.wave_seed,
        voice.order,
        Boolean(voice.is_active),
      ],
    );
  }

  console.log(`Imported ${voices.length} voice cards from ${sqliteDb}`);
}

importVoices()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
