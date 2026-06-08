import 'dotenv/config';
import { ensureSchema, pool } from '../db.ts';

type SeedVoice = {
  audio_file: string | null;
  duration: number;
  id: number;
  is_active: boolean;
  name: string;
  script_text: string;
  wave_seed: number;
  order: number;
};

const seedVoices: SeedVoice[] = [
  {
    id: 1,
    name: 'Introductory business voice',
    script_text: 'নমস্কার, আমি কী পিলার এআই থেকে বলছি।',
    audio_file: null,
    duration: 2,
    wave_seed: 42,
    order: 0,
    is_active: true,
  },
  {
    id: 2,
    name: 'Time-sensitive operational status',
    script_text: 'আপনার ডেলিভারি আজ বিকেলের মধ্যে পৌঁছে যাবে।',
    audio_file: null,
    duration: 20,
    wave_seed: 43,
    order: 1,
    is_active: true,
  },
  {
    id: 3,
    name: 'Transactional reassurance',
    script_text: 'আপনার পেমেন্ট সফল হয়েছে, ধন্যবাদ।',
    audio_file: null,
    duration: 2,
    wave_seed: 44,
    order: 2,
    is_active: true,
  },
  {
    id: 4,
    name: 'Conversion-oriented customer prompt',
    script_text: 'আপনি চাইলে এখনই একটি ডেমো কল বুক করতে পারেন।',
    audio_file: null,
    duration: 2,
    wave_seed: 45,
    order: 3,
    is_active: true,
  },
  {
    id: 5,
    name: 'Trust-critical warning language',
    script_text: 'নিরাপত্তার জন্য ওটিপি বা পাসওয়ার্ড কাউকে শেয়ার করবেন না।',
    audio_file: null,
    duration: 2,
    wave_seed: 46,
    order: 4,
    is_active: true,
  },
];

async function seedVoiceCards() {
  await ensureSchema();

  await pool.query('BEGIN');

  try {
    await pool.query('UPDATE voice_cards SET is_active = FALSE, updated_at = NOW()');

    for (const voice of seedVoices) {
      await pool.query(
        `
          INSERT INTO voice_cards (
            id,
            name,
            script_text,
            audio_file,
            duration,
            wave_seed,
            display_order,
            is_active,
            updated_at
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
          voice.is_active,
        ],
      );
    }

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const result = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM voice_cards WHERE is_active = TRUE');
  console.log(`Seeded ${seedVoices.length} default voice cards. voice_cards now has ${result.rows[0]?.count ?? '0'} active rows.`);
}

seedVoiceCards()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
