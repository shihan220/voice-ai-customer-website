import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ensureSchema, pool, type VoiceCardRecord } from './db.ts';

const app = express();
const port = Number(process.env.PORT ?? 5174);
const mediaRoot = process.env.VOICE_MEDIA_ROOT ?? '/Users/mohammadshihan/bangla-speech-ai/media';

app.use(cors({ origin: true }));
app.use(express.json());
app.use('/media', express.static(mediaRoot));

function toVoiceResponse(row: VoiceCardRecord) {
  return {
    id: row.id,
    name: row.name,
    scriptText: row.script_text,
    audioFile: row.audio_file,
    audioUrl: row.audio_file ? `/media/${row.audio_file}` : null,
    duration: Number(row.duration),
    waveSeed: row.wave_seed,
    order: row.display_order,
    isActive: row.is_active,
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: 'unavailable',
      message: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

app.get('/api/voices', async (_req, res) => {
  try {
    const result = await pool.query<VoiceCardRecord>(`
      SELECT id, name, script_text, audio_file, duration, wave_seed, display_order, is_active
      FROM voice_cards
      WHERE is_active = TRUE
      ORDER BY display_order ASC, id ASC
    `);

    res.json({ voices: result.rows.map(toVoiceResponse) });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load voice cards',
      message: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

app.listen(port, () => {
  console.log(`Bangla Voice API running at http://127.0.0.1:${port}`);
  console.log(`Serving voice media from ${mediaRoot}`);

  ensureSchema()
    .then(() => {
      console.log('PostgreSQL schema is ready.');
    })
    .catch((error) => {
      console.warn('PostgreSQL is not available yet. /api/voices will return an error until DATABASE_URL is reachable.');
      console.warn(error instanceof Error ? error.message : error);
    });
  });
