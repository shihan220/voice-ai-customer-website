export {};

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required. Point it at a disposable fresh database before running verify:db:fresh.');
  process.exit(1);
}

const { ensureSchema, pool } = await import('../db.ts');
const {
  deactivateTtsVoiceProfile,
} = await import('../services/tts-voice-profiles.ts');
const {
  retryTtsGenerationJob,
} = await import('../services/tts-jobs.ts');
const {
  finalizeCompletedPayment,
} = await import('../services/customers.ts');

function assertStatusCode(error: unknown, expectedStatusCode: number, label: string) {
  const actualStatusCode = error instanceof Error && 'statusCode' in error
    ? (error as Error & { statusCode?: unknown }).statusCode
    : undefined;

  if (actualStatusCode !== expectedStatusCode) {
    throw new Error(`${label} returned ${String(actualStatusCode)} instead of ${expectedStatusCode}.`);
  }
}

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

async function assertVoiceProfileLifecycleGuards() {
  const userResult = await pool.query<{ id: number }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        email_verified_at,
        phone_verified_at,
        package_code,
        token_balance,
        starter_granted_at,
        starter_last_refill_at
      )
      VALUES (
        'fresh-db-voice-lifecycle-check@example.test',
        'not-a-real-password-hash',
        NOW(),
        NOW(),
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
    throw new Error('Fresh DB lifecycle test user was not created.');
  }

  const profileResult = await pool.query<{ id: number }>(
    `
      INSERT INTO tts_voice_profiles (
        user_id,
        provider_profile_id,
        provider_sync_status,
        display_name,
        reference_text
      )
      VALUES ($1, 'provider-profile-fresh-db-check', 'ready', 'Lifecycle voice', 'আমি একটি পরীক্ষামূলক কণ্ঠ সংরক্ষণ করছি।')
      RETURNING id
    `,
    [user.id],
  );
  const profile = profileResult.rows[0];

  if (!profile) {
    throw new Error('Fresh DB lifecycle voice profile was not created.');
  }

  const activeJobResult = await pool.query<{ id: number }>(
    `
      INSERT INTO tts_generation_jobs (
        user_id,
        source_type,
        input_text,
        word_count,
        token_cost,
        quality_preset,
        status,
        processing_stage,
        provider_voice,
        voice_profile_id,
        voice_display_name,
        provider_voice_profile_id
      )
      VALUES (
        $1,
        'text',
        'আমি একটি সক্রিয় অডিও কাজ পরীক্ষা করছি।',
        7,
        0,
        'premium_mp3_wav',
        'preview_ready',
        'preview_ready',
        'keypillar-bd-female',
        $2,
        'Lifecycle voice',
        'provider-profile-fresh-db-check'
      )
      RETURNING id
    `,
    [user.id, profile.id],
  );

  if (!activeJobResult.rows[0]) {
    throw new Error('Fresh DB active lifecycle job was not created.');
  }

  try {
    await deactivateTtsVoiceProfile(profile.id, user.id);
    throw new Error('Voice profile deactivation unexpectedly succeeded while a preview-ready job used it.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('unexpectedly succeeded')) {
      throw error;
    }

    assertStatusCode(error, 409, 'Voice profile deactivation guard');
  }

  await pool.query(
    `
      UPDATE tts_generation_jobs
      SET status = 'failed'
      WHERE id = $1
    `,
    [activeJobResult.rows[0].id],
  );
  await pool.query(
    `
      UPDATE tts_voice_profiles
      SET is_active = FALSE
      WHERE id = $1
    `,
    [profile.id],
  );

  try {
    await retryTtsGenerationJob(activeJobResult.rows[0].id, user.id);
    throw new Error('TTS job retry unexpectedly succeeded with a deleted custom voice.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('unexpectedly succeeded')) {
      throw error;
    }

    assertStatusCode(error, 409, 'Deleted custom voice retry guard');
  }
}

async function assertStarterExtraTokenPaymentBlocked() {
  const userResult = await pool.query<{ id: number }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        email_verified_at,
        phone_verified_at,
        package_code,
        token_balance,
        starter_granted_at,
        starter_last_refill_at
      )
      VALUES (
        'fresh-db-starter-extra-token-check@example.test',
        'not-a-real-password-hash',
        NOW(),
        NOW(),
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
    throw new Error('Fresh DB starter extra-token test user was not created.');
  }

  const paymentResult = await pool.query<{ id: number }>(
    `
      INSERT INTO payments (
        user_id,
        provider,
        payment_type,
        status,
        amount,
        currency,
        token_amount,
        metadata
      )
      VALUES ($1, 'bkash', 'extra_tokens', 'pending', 49, 'BDT', 5000, '{}'::jsonb)
      RETURNING id
    `,
    [user.id],
  );
  const payment = paymentResult.rows[0];

  if (!payment) {
    throw new Error('Fresh DB starter extra-token test payment was not created.');
  }

  const finalizedPayment = await finalizeCompletedPayment(payment.id);

  if (finalizedPayment.status === 'completed') {
    throw new Error('Starter extra-token payment was completed even though the account is not Gold or Platinum.');
  }

  if ((finalizedPayment.metadata as { finalizationBlockedReason?: unknown }).finalizationBlockedReason !== 'extra_tokens_require_paid_plan') {
    throw new Error('Starter extra-token payment did not record the expected blocked reason.');
  }

  const balanceResult = await pool.query<{ token_balance: string }>(
    `
      SELECT token_balance
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [user.id],
  );

  if (Number(balanceResult.rows[0]?.token_balance) !== 10000) {
    throw new Error('Starter extra-token payment changed the customer balance.');
  }

  const transactionResult = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM token_transactions
      WHERE user_id = $1
        AND transaction_type = 'extra_purchase'
    `,
    [user.id],
  );

  if (Number(transactionResult.rows[0]?.count ?? 0) !== 0) {
    throw new Error('Starter extra-token payment created an extra_purchase transaction.');
  }
}

try {
  await ensureSchema();
  await assertStarterAllowance();
  await assertVoiceProfileSchema();
  await assertPendingVoiceProfileInsert();
  await assertVoiceProfileLifecycleGuards();
  await assertStarterExtraTokenPaymentBlocked();
  console.log(`Fresh database schema verification passed for ${process.env.DATABASE_URL}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
