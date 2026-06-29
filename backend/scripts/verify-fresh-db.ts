export {};

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required. Point it at a disposable fresh database before running verify:db:fresh.');
  process.exit(1);
}

const { ensureSchema, pool } = await import('../db.ts');

async function assertStarterAllowance() {
  const result = await pool.query<{
    monthly_refill_tokens: string;
    signup_token_grant: string;
  }>(
    `
      SELECT monthly_refill_tokens, signup_token_grant
      FROM packages
      WHERE package_code = 'starter'
      LIMIT 1
    `,
  );
  const starter = result.rows[0];

  if (!starter) {
    throw new Error('Starter package was not created.');
  }

  if (Number(starter.monthly_refill_tokens) !== 10000 || Number(starter.signup_token_grant) !== 10000) {
    throw new Error('Starter package allowance must be 10000 monthly and 10000 signup.');
  }
}

async function assertVoiceProfileSchema() {
  const expectedColumns = [
    'provider_sync_status',
    'provider_sync_error',
    'provider_synced_at',
    'reference_audio_file',
    'reference_audio_file_size_bytes',
    'reference_normalized_at',
    'reference_quality_warnings',
    'test_preview_file',
    'test_preview_audio_seconds',
    'test_preview_generated_at',
  ];
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tts_voice_profiles'
        AND column_name = ANY($1::text[])
    `,
    [expectedColumns],
  );
  const foundColumns = new Set(result.rows.map((row) => row.column_name));
  const missingColumns = expectedColumns.filter((column) => !foundColumns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(`Missing tts_voice_profiles columns: ${missingColumns.join(', ')}`);
  }

  const nullabilityResult = await pool.query<{ is_nullable: 'YES' | 'NO' }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tts_voice_profiles'
        AND column_name = 'provider_profile_id'
      LIMIT 1
    `,
  );

  if (nullabilityResult.rows[0]?.is_nullable !== 'YES') {
    throw new Error('tts_voice_profiles.provider_profile_id must be nullable for pending profiles.');
  }
}

async function assertPendingVoiceProfileInsert() {
  const userResult = await pool.query<{ id: number }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        package_code,
        token_balance,
        starter_granted_at,
        starter_last_refill_at
      )
      VALUES (
        'fresh-db-voice-profile-check@example.test',
        'not-a-real-password-hash',
        'starter',
        10000,
        NOW(),
        NOW()
      )
      RETURNING id
    `,
  );
  const user = userResult.rows[0];

  if (!user) {
    throw new Error('Fresh DB test user was not created.');
  }

  await pool.query(
    `
      INSERT INTO tts_voice_profiles (
        user_id,
        provider_profile_id,
        provider_sync_status,
        display_name,
        reference_text
      )
      VALUES ($1, NULL, 'pending', 'Pending test voice', 'আমি একটি পরীক্ষামূলক কণ্ঠ সংরক্ষণ করছি।')
    `,
    [user.id],
  );
}

try {
  await ensureSchema();
  await assertStarterAllowance();
  await assertVoiceProfileSchema();
  await assertPendingVoiceProfileInsert();
  console.log(`Fresh database schema verification passed for ${process.env.DATABASE_URL}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
