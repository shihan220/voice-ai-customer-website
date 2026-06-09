import 'dotenv/config';
import { ensureSchema, pool } from '../db.ts';

type SeedVoice = {
  audio_file: string;
  duration: number;
  english_meaning: string;
  id: number;
  is_active: boolean;
  name: string;
  order: number;
  script_text: string;
  wave_seed: number;
};

const seedVoices: SeedVoice[] = [
  {
    id: 1,
    name: 'AI Self Service Agent',
    script_text: 'আমি আপনার এআই সেলফ-সার্ভিস এজেন্ট, কীভাবে সাহায্য করতে পারি?',
    english_meaning: 'An AI self-service agent for handling routine customer requests.',
    audio_file: 'voices/public/ai-self-service-agent.wav',
    duration: 9.72,
    wave_seed: 42,
    order: 0,
    is_active: true,
  },
  {
    id: 2,
    name: 'Business Consultant',
    script_text: 'আমি আপনার ব্যবসার প্রয়োজন বুঝে সঠিক সমাধান সাজিয়ে দিতে পারি।',
    english_meaning: 'A consultant voice for business guidance and solution discovery.',
    audio_file: 'voices/public/business-consultant.wav',
    duration: 10.07,
    wave_seed: 43,
    order: 1,
    is_active: true,
  },
  {
    id: 3,
    name: 'Office Receptionist',
    script_text: 'অফিস রিসেপশনে স্বাগতম, আপনার কলটি সঠিক বিভাগে যুক্ত করছি।',
    english_meaning: 'A front-desk style voice for greeting and call routing.',
    audio_file: 'voices/public/office-receptionist.wav',
    duration: 8.16,
    wave_seed: 44,
    order: 2,
    is_active: true,
  },
  {
    id: 4,
    name: 'Appointment Taker',
    script_text: 'আপনার সুবিধামতো সময় অনুযায়ী আমি অ্যাপয়েন্টমেন্ট বুক করে দিতে পারি।',
    english_meaning: 'A scheduling voice for collecting availability and booking appointments.',
    audio_file: 'voices/public/appointment-taker.wav',
    duration: 9.56,
    wave_seed: 45,
    order: 3,
    is_active: true,
  },
  {
    id: 5,
    name: 'Healthcare Assistant',
    script_text: 'স্বাস্থ্যসেবা সংক্রান্ত তথ্য, সময়সূচি ও সহায়তায় আমি আপনার পাশে আছি।',
    english_meaning: 'A care-support voice for patient information and appointment guidance.',
    audio_file: 'voices/public/healthcare-assistant.wav',
    duration: 9.12,
    wave_seed: 46,
    order: 4,
    is_active: true,
  },
  {
    id: 6,
    name: 'Ecommerce Support',
    script_text: 'অর্ডার, ডেলিভারি ও রিটার্ন সংক্রান্ত সহায়তা আমি এখনই দিতে পারি।',
    english_meaning: 'A support voice for ecommerce order, delivery, and return workflows.',
    audio_file: 'voices/public/ecommerce-support.wav',
    duration: 8.67,
    wave_seed: 47,
    order: 5,
    is_active: true,
  },
  {
    id: 7,
    name: 'Banking Fintech Support',
    script_text: 'ব্যাংকিং ও ফিনটেক সেবার আপডেট এবং সহায়তা দ্রুত জানাতে পারি।',
    english_meaning: 'A financial-support voice for banking and fintech service communication.',
    audio_file: 'voices/public/banking-fintech-support.wav',
    duration: 8.88,
    wave_seed: 48,
    order: 6,
    is_active: true,
  },
  {
    id: 8,
    name: 'Real Estate Lead Qualifier',
    script_text: 'প্রপার্টি আগ্রহ, বাজেট ও লোকেশন বুঝে আমি লিড কোয়ালিফাই করি।',
    english_meaning: 'A lead-qualification voice for real estate inquiry screening.',
    audio_file: 'voices/public/real-estate-lead-qualifier.wav',
    duration: 8.22,
    wave_seed: 49,
    order: 7,
    is_active: true,
  },
  {
    id: 9,
    name: 'Education Admission Counsellor',
    script_text: 'ভর্তি, কোর্স ও আবেদন প্রক্রিয়া নিয়ে আমি পরিষ্কার দিকনির্দেশনা দিতে পারি।',
    english_meaning: 'A counsellor voice for admissions, courses, and application support.',
    audio_file: 'voices/public/education-admission-counsellor.wav',
    duration: 9.32,
    wave_seed: 50,
    order: 8,
    is_active: true,
  },
  {
    id: 10,
    name: 'Restaurant Hospitality Reservation',
    script_text: 'রেস্টুরেন্ট ও হসপিটালিটি রিজার্ভেশন দ্রুত নিশ্চিত করতে আমি সাহায্য করি।',
    english_meaning: 'A reservation voice for restaurant and hospitality booking flows.',
    audio_file: 'voices/public/restaurant-hospitality-reservation.wav',
    duration: 8.79,
    wave_seed: 51,
    order: 9,
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
            english_meaning,
            audio_file,
            duration,
            wave_seed,
            display_order,
            is_active,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            script_text = EXCLUDED.script_text,
            english_meaning = EXCLUDED.english_meaning,
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
          voice.english_meaning,
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
