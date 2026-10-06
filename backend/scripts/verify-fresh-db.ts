import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export {};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('DATABASE_URL is required and must point to a disposable database containing "fresh_test" in its name.');
  process.exit(1);
}

let databaseName = '';

try {
  databaseName = new URL(databaseUrl).pathname.replace(/^\/+/, '');
} catch {
  console.error('DATABASE_URL is invalid.');
  process.exit(1);
}

if (!databaseName.toLowerCase().includes('fresh_test')) {
  console.error(
    `Refusing to run against database ${databaseName || '(unknown)'}. Use a disposable database containing "fresh_test" in its name.`,
  );
  process.exit(1);
}

const privateMediaRoot = path.join(
  os.tmpdir(),
  `bangla-speech-ai-fresh-test-${process.pid}-${Date.now()}`,
);
process.env.PRIVATE_MEDIA_ROOT = privateMediaRoot;

const { ensureSchema, pool } = await import('../db.ts');
const {
  isCustomerEmailVerificationRequired,
  isCustomerPhoneVerificationRequired,
} = await import('../core.ts');
const {
  createEmailVerification,
  createPhoneVerification,
  finalizeCompletedPayment,
  incrementEmailVerificationAttempts,
  incrementPhoneVerificationAttempts,
  verifyOtpCode,
} = await import('../services/customers.ts');
const {
  deactivateTtsVoiceProfile,
  resolveTtsVoiceSelectionForUser,
} = await import('../services/tts-voice-profiles.ts');
const {
  applyActivePronunciationRules,
  createTtsPronunciationRule,
  deleteOwnedTtsGenerationJob,
  retryTtsGenerationJob,
} = await import('../services/tts-jobs.ts');
const {
  assertAndRecordTtsProviderUsage,
} = await import('../services/tts-provider-usage.ts');
const {
  runDataRetentionMaintenance,
} = await import('../services/data-retention.ts');

function assertStatusCode(error: unknown, expectedStatusCode: number, label: string) {
  const actualStatusCode = error instanceof Error && 'statusCode' in error
    ? (error as Error & { statusCode?: unknown }).statusCode
    : undefined;

  if (actualStatusCode !== expectedStatusCode) {
    throw new Error(`${label} returned ${String(actualStatusCode)} instead of ${expectedStatusCode}.`);
  }
}

function assertVerificationDefaults() {
  if (isCustomerEmailVerificationRequired() || isCustomerPhoneVerificationRequired()) {
    throw new Error('Customer verification must remain disabled by default until delivery providers are configured.');
  }
}

async function createDisposableUser(emailLabel: string) {
  const result = await pool.query<{ id: number }>(
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
      VALUES ($1, 'not-a-real-password-hash', NOW(), NOW(), 'starter', 10000, NOW(), NOW())
      RETURNING id
    `,
    [`fresh-db-${emailLabel}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`],
  );
  const user = result.rows[0];

  if (!user) {
    throw new Error(`Fresh DB ${emailLabel} user was not created.`);
  }

  return user;
}

async function assertCheckViolation(
  label: string,
  query: string,
  values: unknown[],
) {
  try {
    await pool.query(query, values);
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === '23514'
    ) {
      return;
    }

    throw new Error(`${label} failed with an unexpected database error.`);
  }

  throw new Error(`${label} unexpectedly accepted an invalid record.`);
}

async function assertDatabaseInvariants() {
  const user = await createDisposableUser('constraint-check');

  await assertCheckViolation(
    'Negative customer balance constraint',
    'UPDATE users SET token_balance = -1 WHERE id = $1',
    [user.id],
  );
  await assertCheckViolation(
    'Non-positive auth version constraint',
    'UPDATE users SET auth_version = 0 WHERE id = $1',
    [user.id],
  );
  await assertCheckViolation(
    'Non-positive payment amount constraint',
    `
      INSERT INTO payments (
        user_id, provider, payment_type, status, amount, currency, token_amount
      )
      VALUES ($1, 'bkash', 'extra_tokens', 'pending', 0, 'BDT', 1)
    `,
    [user.id],
  );
  await assertCheckViolation(
    'Payment currency format constraint',
    `
      INSERT INTO payments (
        user_id, provider, payment_type, status, amount, currency, token_amount
      )
      VALUES ($1, 'bkash', 'extra_tokens', 'pending', 1, 'bdt', 1)
    `,
    [user.id],
  );
  await assertCheckViolation(
    'Payment purchase-shape constraint',
    `
      INSERT INTO payments (
        user_id, provider, payment_type, status, amount, currency, token_amount
      )
      VALUES ($1, 'bkash', 'package_upgrade', 'pending', 1, 'BDT', 1)
    `,
    [user.id],
  );
  await assertCheckViolation(
    'Negative token transaction balance constraint',
    `
      INSERT INTO token_transactions (
        user_id, transaction_type, token_delta, balance_after
      )
      VALUES ($1, 'admin_adjustment', -1, -1)
    `,
    [user.id],
  );
  await assertCheckViolation(
    'Zero provider usage units constraint',
    `
      INSERT INTO tts_provider_usage_events (
        user_id, event_type, usage_units
      )
      VALUES ($1, 'job_preview', 0)
    `,
    [user.id],
  );
  await assertCheckViolation(
    'Invalid TTS job numeric constraint',
    `
      INSERT INTO tts_generation_jobs (
        user_id,
        source_type,
        input_text,
        word_count,
        token_cost,
        quality_preset,
        status,
        provider_voice,
        voice_display_name
      )
      VALUES ($1, 'text', 'invalid', 0, 0, 'wav_only', 'failed', 'fixed', 'Fixed')
    `,
    [user.id],
  );
}

async function assertOtpAttemptConcurrency() {
  const user = await createDisposableUser('otp-race');
  const otpCode = '384271';
  const emailVerification = await createEmailVerification(
    user.id,
    'fresh-db-otp-race@example.test',
    otpCode,
  );
  const phoneVerification = await createPhoneVerification(
    user.id,
    '+447700900123',
    otpCode,
  );

  if (
    !verifyOtpCode(emailVerification.record.otp_hash, otpCode)
    || verifyOtpCode(emailVerification.record.otp_hash, '000000')
  ) {
    throw new Error('HMAC-protected OTP verification did not distinguish the correct code.');
  }

  const [emailAttempts, phoneAttempts] = await Promise.all([
    Promise.all(
      Array.from(
        { length: 12 },
        () => incrementEmailVerificationAttempts(emailVerification.record.id, 5),
      ),
    ),
    Promise.all(
      Array.from(
        { length: 12 },
        () => incrementPhoneVerificationAttempts(phoneVerification.record.id, 5),
      ),
    ),
  ]);

  if (emailAttempts.filter(Boolean).length !== 5 || phoneAttempts.filter(Boolean).length !== 5) {
    throw new Error('Concurrent OTP attempts exceeded or undershot the five-attempt limit.');
  }

  const attemptResult = await pool.query<{ email_attempts: number; phone_attempts: number }>(
    `
      SELECT
        (SELECT attempts FROM email_verifications WHERE id = $1)::integer AS email_attempts,
        (SELECT attempts FROM phone_verifications WHERE id = $2)::integer AS phone_attempts
    `,
    [emailVerification.record.id, phoneVerification.record.id],
  );

  if (
    attemptResult.rows[0]?.email_attempts !== 5
    || attemptResult.rows[0]?.phone_attempts !== 5
  ) {
    throw new Error('OTP attempt counters were not atomically capped at five.');
  }
}

async function assertProviderUsageConcurrency() {
  const user = await createDisposableUser('provider-usage-race');
  const reservations = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await assertAndRecordTtsProviderUsage(client, {
          eventType: 'job_preview',
          limit: 5,
          limitMessage: 'Provider usage test limit reached.',
          userId: user.id,
        });
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);

        if (
          error instanceof Error
          && 'statusCode' in error
          && error.statusCode === 429
        ) {
          return false;
        }

        throw error;
      } finally {
        client.release();
      }
    }),
  );

  if (reservations.filter(Boolean).length !== 5) {
    throw new Error('Concurrent provider usage reservations bypassed the configured limit.');
  }

  const usageResult = await pool.query<{ total: string }>(
    `
      SELECT COALESCE(SUM(usage_units), 0)::text AS total
      FROM tts_provider_usage_events
      WHERE user_id = $1
        AND event_type = 'job_preview'
    `,
    [user.id],
  );

  if (Number(usageResult.rows[0]?.total) !== 5) {
    throw new Error('Provider usage ledger did not record exactly five accepted units.');
  }

  const retryUser = await createDisposableUser('provider-usage-retry-race');
  const retryResourceId = 88_001;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await assertAndRecordTtsProviderUsage(client, {
          deduplicateResource: true,
          eventType: 'job_full',
          limit: 1,
          limitMessage: 'Provider retry usage should be idempotent.',
          resourceId: retryResourceId,
          userId: retryUser.id,
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }),
  );

  const retryUsageResult = await pool.query<{ count: string; total: string }>(
    `
      SELECT COUNT(*)::text AS count, COALESCE(SUM(usage_units), 0)::text AS total
      FROM tts_provider_usage_events
      WHERE user_id = $1
        AND event_type = 'job_full'
        AND resource_id = $2
    `,
    [retryUser.id, retryResourceId],
  );

  if (
    Number(retryUsageResult.rows[0]?.count) !== 1
    || Number(retryUsageResult.rows[0]?.total) !== 1
  ) {
    throw new Error('Concurrent retries recorded duplicate provider usage for the same job.');
  }
}

async function assertPronunciationRuleBoundaries() {
  const rejectedInputs = [
    {
      input: {
        matchText: 'term',
        matchType: 'regex',
        replacementText: 'replacement',
      },
      label: 'Invalid pronunciation match type',
    },
    {
      input: {
        matchText: 'm'.repeat(201),
        matchType: 'phrase',
        replacementText: 'replacement',
      },
      label: 'Oversized pronunciation match text',
    },
    {
      input: {
        matchText: 'term',
        matchType: 'phrase',
        replacementText: 'r'.repeat(501),
      },
      label: 'Oversized pronunciation replacement text',
    },
    {
      input: {
        matchText: 'term',
        matchType: 'phrase',
        notes: 'n'.repeat(1_001),
        replacementText: 'replacement',
      },
      label: 'Oversized pronunciation notes',
    },
  ];

  for (const { input, label } of rejectedInputs) {
    try {
      await createTtsPronunciationRule(input);
    } catch (error) {
      assertStatusCode(error, 400, label);
      continue;
    }

    throw new Error(`${label} unexpectedly succeeded.`);
  }

  const expansionRule = await createTtsPronunciationRule({
    matchText: 'x',
    matchType: 'whole_word',
    replacementText: 'y'.repeat(500),
  });

  try {
    await applyActivePronunciationRules(
      Array.from({ length: 100 }, () => 'x').join(' '),
    );
  } catch (error) {
    assertStatusCode(error, 500, 'Pronunciation expansion guard');
    return;
  } finally {
    await pool.query(
      'DELETE FROM tts_pronunciation_rules WHERE id = $1',
      [expansionRule.id],
    );
  }

  throw new Error('Pronunciation expansion guard unexpectedly accepted expanded text.');
}

async function assertPrivateGenerationDeletion() {
  const user = await createDisposableUser('generation-delete');
  const jobResult = await pool.query<{ id: number }>(
    `
      INSERT INTO tts_generation_jobs (
        user_id,
        source_type,
        source_name,
        input_text,
        word_count,
        token_cost,
        quality_preset,
        status,
        provider_voice,
        voice_display_name
      )
      VALUES ($1, 'text', 'Private deletion test', 'private test', 2, 0, 'wav_only', 'failed', 'fixed', 'Fixed')
      RETURNING id
    `,
    [user.id],
  );
  const jobId = jobResult.rows[0]?.id;

  if (!jobId) {
    throw new Error('Private deletion test job was not created.');
  }

  const userDirectory = path.join(privateMediaRoot, 'tts-jobs', `user-${user.id}`);
  const jobDirectory = path.join(userDirectory, `job-${jobId}`);
  const privateFile = path.join(jobDirectory, 'private.wav');
  await fs.mkdir(jobDirectory, { recursive: true });
  await fs.writeFile(privateFile, 'private-audio-data');

  await deleteOwnedTtsGenerationJob(jobId, user.id);

  const [jobCount, fileExists] = await Promise.all([
    pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tts_generation_jobs WHERE id = $1',
      [jobId],
    ),
    fs.access(privateFile).then(() => true).catch(() => false),
  ]);

  if (Number(jobCount.rows[0]?.count) !== 0 || fileExists) {
    throw new Error('Generation deletion did not remove both the database row and private audio.');
  }
}

async function assertPrivateVoiceProfileDeletion() {
  const user = await createDisposableUser('voice-delete');
  const profileResult = await pool.query<{ id: number }>(
    `
      INSERT INTO tts_voice_profiles (
        user_id,
        provider_profile_id,
        provider_sync_status,
        display_name,
        reference_text,
        reference_audio_file
      )
      VALUES ($1, NULL, 'pending', 'Private deletion voice', 'private reference text', 'placeholder.wav')
      RETURNING id
    `,
    [user.id],
  );
  const profileId = profileResult.rows[0]?.id;

  if (!profileId) {
    throw new Error('Private deletion test voice profile was not created.');
  }

  const userDirectory = path.join(privateMediaRoot, 'tts-voice-profiles', `user-${user.id}`);
  const profileDirectory = path.join(userDirectory, `profile-${profileId}`);
  const privateFile = path.join(profileDirectory, 'private-reference.wav');
  await fs.mkdir(profileDirectory, { recursive: true });
  await fs.writeFile(privateFile, 'private-reference-data');

  await deactivateTtsVoiceProfile(profileId, user.id);

  const [profileResultAfterDelete, fileExists] = await Promise.all([
    pool.query<{
      is_active: boolean;
      reference_audio_file: string | null;
      reference_text: string;
    }>(
      `
        SELECT is_active, reference_audio_file, reference_text
        FROM tts_voice_profiles
        WHERE id = $1
      `,
      [profileId],
    ),
    fs.access(privateFile).then(() => true).catch(() => false),
  ]);
  const deletedProfile = profileResultAfterDelete.rows[0];

  if (
    !deletedProfile
    || deletedProfile.is_active
    || deletedProfile.reference_audio_file !== null
    || deletedProfile.reference_text !== '[deleted]'
    || fileExists
  ) {
    throw new Error('Voice profile deletion did not redact metadata and remove private audio.');
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
    'consent_confirmed_at',
    'consent_version',
    'provider_deactivated_at',
    'provider_sync_started_at',
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

async function assertVoiceProfileSelectionDeletionSerialization() {
  const user = await createDisposableUser('voice-selection-race');
  const profileResult = await pool.query<{ id: number }>(
    `
      INSERT INTO tts_voice_profiles (
        user_id,
        provider_profile_id,
        provider_sync_status,
        display_name,
        reference_text,
        consent_confirmed_at,
        consent_version
      )
      VALUES (
        $1,
        'provider-profile-selection-race',
        'ready',
        'Selection race voice',
        'আমি একটি সমসাময়িক নির্বাচন পরীক্ষা করছি।',
        NOW(),
        'fresh-test'
      )
      RETURNING id
    `,
    [user.id],
  );
  const profile = profileResult.rows[0];

  if (!profile) {
    throw new Error('Voice selection race profile was not created.');
  }

  const deletingClient = await pool.connect();
  const selectingClient = await pool.connect();
  let deletingTransactionOpen = false;
  let selectingTransactionOpen = false;

  try {
    await deletingClient.query('BEGIN');
    deletingTransactionOpen = true;
    await deletingClient.query(
      'SELECT pg_advisory_xact_lock($1::bigint)',
      [-Math.abs(profile.id)],
    );
    await deletingClient.query(
      `
        UPDATE tts_voice_profiles
        SET is_active = FALSE
        WHERE id = $1
      `,
      [profile.id],
    );

    await selectingClient.query('BEGIN');
    selectingTransactionOpen = true;
    let selectionSettled = false;
    const selectionResult = resolveTtsVoiceSelectionForUser(
      selectingClient,
      user.id,
      profile.id,
    ).then(
      (value) => {
        selectionSettled = true;
        return { error: null, value };
      },
      (error: unknown) => {
        selectionSettled = true;
        return { error, value: null };
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    if (selectionSettled) {
      throw new Error('Voice selection did not wait for the concurrent deletion lock.');
    }

    await deletingClient.query('COMMIT');
    deletingTransactionOpen = false;
    const outcome = await selectionResult;

    if (!outcome.error) {
      throw new Error('Voice selection succeeded after the profile was concurrently deleted.');
    }
    assertStatusCode(outcome.error, 404, 'Concurrent deleted voice selection');

    await selectingClient.query('ROLLBACK');
    selectingTransactionOpen = false;
  } finally {
    if (deletingTransactionOpen) {
      await deletingClient.query('ROLLBACK').catch(() => undefined);
    }
    if (selectingTransactionOpen) {
      await selectingClient.query('ROLLBACK').catch(() => undefined);
    }
    deletingClient.release();
    selectingClient.release();
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

  if (finalizedPayment.status !== 'completed') {
    throw new Error('Paid Starter extra-token payment was not recorded as completed for refund review.');
  }

  if ((finalizedPayment.metadata as { finalizationBlockedReason?: unknown }).finalizationBlockedReason !== 'extra_tokens_require_paid_plan') {
    throw new Error('Starter extra-token payment did not record the expected blocked reason.');
  }

  if ((finalizedPayment.metadata as { requiresManualRefundReview?: unknown }).requiresManualRefundReview !== true) {
    throw new Error('Blocked paid Starter extra-token payment was not marked for manual refund review.');
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

async function assertPackageUpgradePreservesExistingBalance() {
  const user = await createDisposableUser('upgrade-balance');
  const existingBalance = 15_000;
  await pool.query(
    `
      UPDATE users
      SET token_balance = $2
      WHERE id = $1
    `,
    [user.id, existingBalance],
  );
  const paymentResult = await pool.query<{ id: number }>(
    `
      INSERT INTO payments (
        user_id,
        provider,
        payment_type,
        status,
        amount,
        currency,
        package_code
      )
      VALUES ($1, 'stripe', 'package_upgrade', 'pending', 149, 'USD', 'gold')
      RETURNING id
    `,
    [user.id],
  );
  const paymentId = paymentResult.rows[0]?.id;

  if (!paymentId) {
    throw new Error('Package upgrade balance test payment was not created.');
  }

  await finalizeCompletedPayment(paymentId);
  await finalizeCompletedPayment(paymentId);

  const result = await pool.query<{
    package_code: string;
    token_balance: string;
    upgrade_count: string;
  }>(
    `
      SELECT
        u.package_code,
        u.token_balance::text,
        (
          SELECT COUNT(*)::text
          FROM package_upgrades pu
          WHERE pu.payment_id = $2
        ) AS upgrade_count
      FROM users u
      WHERE u.id = $1
    `,
    [user.id, paymentId],
  );
  const upgradedUser = result.rows[0];

  if (
    upgradedUser?.package_code !== 'gold'
    || Number(upgradedUser.token_balance) !== existingBalance
    || Number(upgradedUser.upgrade_count) !== 1
  ) {
    throw new Error('Package upgrade reduced the existing balance or was finalized more than once.');
  }
}

async function assertSecurityDataRetention() {
  const user = await createDisposableUser('retention-check');

  await pool.query(
    `
      INSERT INTO email_verifications (
        user_id,
        purpose,
        sent_to_email,
        otp_hash,
        otp_expires_at,
        created_at
      )
      VALUES
        ($1, 'signup', 'old-retention@example.test', 'old-hash', NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days'),
        ($1, 'signup', 'current-retention@example.test', 'current-hash', NOW() + INTERVAL '10 minutes', NOW())
    `,
    [user.id],
  );
  await pool.query(
    `
      INSERT INTO phone_verifications (
        user_id,
        purpose,
        sent_to_phone,
        otp_hash,
        otp_expires_at,
        created_at
      )
      VALUES
        ($1, 'signup', '+447700900191', 'old-hash', NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days'),
        ($1, 'signup', '+447700900192', 'current-hash', NOW() + INTERVAL '10 minutes', NOW())
    `,
    [user.id],
  );
  await pool.query(
    `
      INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
      VALUES
        ($1, 'old-retention-token', NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days'),
        ($1, 'current-retention-token', NOW() + INTERVAL '10 minutes', NOW())
    `,
    [user.id],
  );
  await pool.query(
    `
      INSERT INTO signup_rate_limits (ip_key_hash, bucket_date, attempt_count)
      VALUES
        ('old-retention-key', CURRENT_DATE - 40, 1),
        ('current-retention-key', CURRENT_DATE, 1)
    `,
  );
  await pool.query(
    `
      INSERT INTO public_action_rate_limits (action_type, ip_key_hash, bucket_date, attempt_count)
      VALUES
        ('sample_request', 'old-retention-key', CURRENT_DATE - 40, 1),
        ('sample_request', 'current-retention-key', CURRENT_DATE, 1)
    `,
  );
  await pool.query(
    `
      INSERT INTO tts_provider_usage_events (
        user_id,
        event_type,
        usage_units,
        created_at
      )
      VALUES
        ($1, 'job_preview', 1, NOW() - INTERVAL '100 days'),
        ($1, 'job_preview', 1, NOW())
    `,
    [user.id],
  );

  await runDataRetentionMaintenance();

  const checks = await Promise.all([
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE sent_to_email = 'old-retention@example.test')::text AS old_count,
          COUNT(*) FILTER (WHERE sent_to_email = 'current-retention@example.test')::text AS current_count
        FROM email_verifications
      `,
    ),
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE sent_to_phone = '+447700900191')::text AS old_count,
          COUNT(*) FILTER (WHERE sent_to_phone = '+447700900192')::text AS current_count
        FROM phone_verifications
      `,
    ),
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE token_hash = 'old-retention-token')::text AS old_count,
          COUNT(*) FILTER (WHERE token_hash = 'current-retention-token')::text AS current_count
        FROM password_resets
      `,
    ),
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE ip_key_hash = 'old-retention-key')::text AS old_count,
          COUNT(*) FILTER (WHERE ip_key_hash = 'current-retention-key')::text AS current_count
        FROM signup_rate_limits
      `,
    ),
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE ip_key_hash = 'old-retention-key')::text AS old_count,
          COUNT(*) FILTER (WHERE ip_key_hash = 'current-retention-key')::text AS current_count
        FROM public_action_rate_limits
      `,
    ),
    pool.query<{ old_count: string; current_count: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')::text AS old_count,
          COUNT(*) FILTER (WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day')::text AS current_count
        FROM tts_provider_usage_events
      `,
      [user.id],
    ),
  ]);

  for (const [index, result] of checks.entries()) {
    const row = result.rows[0];
    if (Number(row?.old_count ?? 0) !== 0 || Number(row?.current_count ?? 0) < 1) {
      throw new Error(`Security retention check ${index + 1} did not remove only expired records.`);
    }
  }
}

try {
  await ensureSchema();
  assertVerificationDefaults();
  await assertStarterAllowance();
  await assertDatabaseInvariants();
  await assertOtpAttemptConcurrency();
  await assertProviderUsageConcurrency();
  await assertPronunciationRuleBoundaries();
  await assertVoiceProfileSchema();
  await assertPendingVoiceProfileInsert();
  await assertVoiceProfileLifecycleGuards();
  await assertVoiceProfileSelectionDeletionSerialization();
  await assertPrivateGenerationDeletion();
  await assertPrivateVoiceProfileDeletion();
  await assertStarterExtraTokenPaymentBlocked();
  await assertPackageUpgradePreservesExistingBalance();
  await assertSecurityDataRetention();
  console.log(`Fresh database schema verification passed for ${databaseName}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await fs.rm(privateMediaRoot, { force: true, recursive: true }).catch(() => undefined);
  await pool.end();
}
