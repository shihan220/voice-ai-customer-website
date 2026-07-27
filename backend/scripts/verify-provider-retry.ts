export {};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('DATABASE_URL is required and must point to a disposable retry test database.');
  process.exit(1);
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (!databaseName.includes('retry_test')) {
  console.error(`Refusing to run against database ${databaseName || '(unknown)'}. Use a disposable database containing "retry_test" in its name.`);
  process.exit(1);
}

process.env.KEYPILLAR_TTS_API_KEY = 'retry-test-key';
process.env.KEYPILLAR_TTS_API_URL = 'http://127.0.0.1:9/v1/voice/generate';
process.env.KEYPILLAR_TTS_REQUEST_TIMEOUT_MS = '5000';
process.env.TTS_PROVIDER_RETRY_MAX_ATTEMPTS = '2';
process.env.TTS_PROVIDER_RETRY_BASE_DELAY_MS = '1000';
process.env.TTS_PROVIDER_RETRY_MAX_DELAY_MS = '1000';

const { ensureSchema, pool } = await import('../db.ts');
const { startTtsJobWorker, stopTtsJobWorker } = await import('../services/tts-jobs.ts');
const workerLeaderLockKey = [1_264_572_754, 1_414_809_943];

type RetryState = {
  error_message: string | null;
  processing_stage: string | null;
  provider_attempt_count: number;
  provider_next_attempt_at: Date | null;
  status: string;
};

async function readJob(jobId: number) {
  const result = await pool.query<RetryState>(
    `
      SELECT
        error_message,
        processing_stage,
        provider_attempt_count,
        provider_next_attempt_at,
        status
      FROM tts_generation_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );

  if (!result.rows[0]) {
    throw new Error(`Retry test job ${jobId} disappeared.`);
  }

  return result.rows[0];
}

async function waitForJob(jobId: number, predicate: (state: RetryState) => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readJob(jobId);
    if (predicate(state)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for retry state. Last state: ${JSON.stringify(await readJob(jobId))}`);
}

try {
  await ensureSchema();

  const userResult = await pool.query<{ id: number }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        email_verified_at,
        phone_verified_at,
        package_code,
        token_balance
      )
      VALUES ($1, 'not-a-real-password-hash', NOW(), NOW(), 'starter', 10000)
      RETURNING id
    `,
    [`provider-retry-${Date.now()}@example.test`],
  );
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error('Could not create provider retry test user.');
  }

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
        processing_stage,
        provider_voice,
        voice_display_name,
        full_generation_requested_at
      )
      VALUES ($1, 'text', 'Provider retry verifier', 'এটি একটি স্বয়ংক্রিয় পুনরায় চেষ্টা পরীক্ষা।', 7, 0, 'wav_only', 'queued', 'queued', 'keypillar-bd-female', 'Keypillar Bangla Female', NOW())
      RETURNING id
    `,
    [userId],
  );
  const jobId = jobResult.rows[0]?.id;

  if (!jobId) {
    throw new Error('Could not create provider retry test job.');
  }

  await startTtsJobWorker();

  const retryState = await waitForJob(
    jobId,
    (state) => state.status === 'queued' && state.processing_stage === 'retrying_provider',
  );

  if (Number(retryState.provider_attempt_count) !== 1 || !retryState.provider_next_attempt_at) {
    throw new Error(`First provider failure was not scheduled correctly: ${JSON.stringify(retryState)}`);
  }

  const failedState = await waitForJob(jobId, (state) => state.status === 'failed');

  if (Number(failedState.provider_attempt_count) !== 2 || failedState.provider_next_attempt_at) {
    throw new Error(`Retry exhaustion state is incorrect: ${JSON.stringify(failedState)}`);
  }

  if (!failedState.error_message?.includes('automatic retries')) {
    throw new Error(`Retry exhaustion did not return the expected customer message: ${failedState.error_message}`);
  }

  const contender = await pool.connect();
  try {
    const lockResult = await contender.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      workerLeaderLockKey,
    );

    if (lockResult.rows[0]?.acquired) {
      await contender.query('SELECT pg_advisory_unlock($1, $2)', workerLeaderLockKey);
      throw new Error('A second worker session acquired leadership while the worker was active.');
    }
  } finally {
    contender.release();
  }

  await stopTtsJobWorker();

  const postStopContender = await pool.connect();
  try {
    const lockResult = await postStopContender.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      workerLeaderLockKey,
    );

    if (!lockResult.rows[0]?.acquired) {
      throw new Error('The worker leadership lock was not released after shutdown.');
    }

    await postStopContender.query('SELECT pg_advisory_unlock($1, $2)', workerLeaderLockKey);
  } finally {
    postStopContender.release();
  }

  console.log(JSON.stringify({
    finalStatus: failedState.status,
    firstRetryAttemptCount: Number(retryState.provider_attempt_count),
    leadershipLockReleasedOnStop: true,
    retryExhaustedAttemptCount: Number(failedState.provider_attempt_count),
    retryStage: retryState.processing_stage,
  }, null, 2));
} finally {
  await stopTtsJobWorker();
  await pool.end();
}
