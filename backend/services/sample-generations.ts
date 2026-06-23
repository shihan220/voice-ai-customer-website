import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { mediaRoot, normalizeText } from '../core.ts';
import {
  pool,
  type SampleGenerationRecord,
  type SampleRequestRecord,
  type TokenTransactionRecord,
  type UserRecord,
} from '../db.ts';
import { generateSampleAudio } from './voice-provider.ts';
const maxBillableWords = 150;
const maxScriptLength = 1200;

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

type LeadMetadata = {
  clientName: string;
  companyName: string | null;
  email: string;
  referrer: string | null;
  sourceUrl: string | null;
  userAgent: string | null;
};

type PreviewInput = LeadMetadata & {
  scriptText: string;
  selectedService: string;
  userId: number;
};

type PreviewResult = {
  request: SampleRequestRecord;
  sample: SampleGenerationRecord;
};

type FinalizeResult = {
  sample: SampleGenerationRecord;
  tokenBalance: number;
  tokensDeducted: number;
};

function normalizeScriptText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Script text is required.');
  }

  if (trimmed.length > maxScriptLength) {
    throw new Error(`Script text must stay under ${maxScriptLength} characters.`);
  }

  return trimmed;
}

export function countBillableWords(scriptText: string) {
  const normalized = normalizeScriptText(scriptText);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    throw new Error('Script text is required.');
  }

  if (words.length > maxBillableWords) {
    throw new Error(`Script text must stay under ${maxBillableWords} billable words.`);
  }

  return words.length;
}

async function assertAudioFileExists(audioFile: string) {
  const absolutePath = path.join(mediaRoot, audioFile);
  try {
    await fs.access(absolutePath);
  } catch {
    throw withStatus('Preview audio is not available for this sample yet.', 503);
  }
  return absolutePath;
}

async function insertSampleRequest(input: PreviewInput) {
  const result = await pool.query<SampleRequestRecord>(
    `
      INSERT INTO sample_requests (
        client_name,
        email,
        company_name,
        message_details,
        selected_service,
        source_url,
        referrer,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      input.clientName,
      input.email,
      input.companyName,
      input.scriptText,
      input.selectedService,
      input.sourceUrl,
      input.referrer,
      input.userAgent,
    ],
  );

  return result.rows[0];
}

export async function createPreviewGeneration(input: PreviewInput): Promise<PreviewResult> {
  const scriptText = normalizeScriptText(input.scriptText);
  const wordCount = countBillableWords(scriptText);
  const selectedService = normalizeText(input.selectedService);

  if (!selectedService) {
    throw new Error('Select a use case before generating a preview.');
  }

  const generatedAudio = await generateSampleAudio({
    scriptText,
    selectedService,
  });
  await assertAudioFileExists(generatedAudio.audioFile);

  const request = await insertSampleRequest({
    ...input,
    scriptText,
    selectedService,
  });

  const sampleResult = await pool.query<SampleGenerationRecord>(
    `
      INSERT INTO sample_generations (
        user_id,
        sample_request_id,
        script_text,
        selected_service,
        word_count,
        token_cost,
        audio_file,
        source_kind,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'preview')
      RETURNING *
    `,
    [
      input.userId,
      request.id,
      scriptText,
      selectedService,
      wordCount,
      wordCount,
      generatedAudio.audioFile,
      generatedAudio.sourceKind,
    ],
  );

  return {
    request,
    sample: sampleResult.rows[0],
  };
}

export async function getOwnedSampleGeneration(sampleId: number, userId: number) {
  const result = await pool.query<SampleGenerationRecord>(
    `
      SELECT *
      FROM sample_generations
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [sampleId, userId],
  );

  return result.rows[0] ?? null;
}

export async function regeneratePreviewGeneration(input: {
  sampleId: number;
  scriptText: string;
  selectedService: string;
  userId: number;
}) {
  const existing = await getOwnedSampleGeneration(input.sampleId, input.userId);

  if (!existing) {
    throw withStatus('Sample preview not found.', 404);
  }

  if (existing.status === 'finalized') {
    throw withStatus('This sample preview has already been finalized.', 409);
  }

  if (existing.regeneration_attempts_used >= existing.max_regeneration_attempts) {
    throw withStatus('Preview regeneration limit reached.', 403);
  }

  const scriptText = normalizeScriptText(input.scriptText);
  const wordCount = countBillableWords(scriptText);
  const selectedService = normalizeText(input.selectedService);

  if (!selectedService) {
    throw new Error('Select a use case before regenerating a preview.');
  }

  const generatedAudio = await generateSampleAudio({
    sampleId: existing.id,
    scriptText,
    selectedService,
  });
  await assertAudioFileExists(generatedAudio.audioFile);

  const result = await pool.query<SampleGenerationRecord>(
    `
      UPDATE sample_generations
      SET
        script_text = $3,
        selected_service = $4,
        word_count = $5,
        token_cost = $6,
        audio_file = $7,
        source_kind = $8,
        regeneration_attempts_used = regeneration_attempts_used + 1,
        updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING *
    `,
    [
      input.sampleId,
      input.userId,
      scriptText,
      selectedService,
      wordCount,
      wordCount,
      generatedAudio.audioFile,
      generatedAudio.sourceKind,
    ],
  );

  const sample = result.rows[0];

  if (!sample) {
    throw new Error('Failed to regenerate the sample preview.');
  }

  await pool.query(
    `
      UPDATE sample_requests
      SET
        message_details = $2,
        selected_service = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [sample.sample_request_id, scriptText, selectedService],
  );

  return sample;
}

async function insertTokenTransactionWithClient(input: {
  balanceAfter: number;
  notes: string;
  tokenDelta: number;
  userId: number;
}, client: PoolClient) {
  const result = await client.query<TokenTransactionRecord>(
    `
      INSERT INTO token_transactions (
        user_id,
        transaction_type,
        token_delta,
        balance_after,
        notes
      )
      VALUES ($1, 'sample_voice_finalized', $2, $3, $4)
      RETURNING *
    `,
    [input.userId, input.tokenDelta, input.balanceAfter, input.notes],
  );

  return result.rows[0];
}

export async function finalizeSampleGeneration(sampleId: number, userId: number): Promise<FinalizeResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sampleResult = await client.query<SampleGenerationRecord>(
      `
        SELECT *
        FROM sample_generations
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [sampleId, userId],
    );
    const sample = sampleResult.rows[0];

    if (!sample) {
      throw withStatus('Sample preview not found.', 404);
    }

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [userId],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw withStatus('User not found.', 404);
    }

    if (!user.email_verified_at) {
      throw withStatus('Verify your email before finalizing a sample.', 403);
    }

    if (!user.phone_verified_at) {
      throw withStatus('Verify your phone before finalizing a sample.', 403);
    }

    if (sample.status === 'finalized' && sample.token_transaction_id) {
      await client.query('COMMIT');
      return {
        sample,
        tokenBalance: Number(user.token_balance),
        tokensDeducted: 0,
      };
    }

    const tokenCost = Number(sample.token_cost);
    const currentBalance = Number(user.token_balance);

    if (currentBalance < tokenCost) {
      throw withStatus('Insufficient token balance. Upgrade or buy extra tokens.', 402);
    }

    const nextBalance = currentBalance - tokenCost;

    await client.query(
      `
        UPDATE users
        SET
          token_balance = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [user.id, nextBalance],
    );

    const tokenTransaction = await insertTokenTransactionWithClient(
      {
        balanceAfter: nextBalance,
        notes: `Finalized sample preview #${sample.id}.`,
        tokenDelta: -tokenCost,
        userId: user.id,
      },
      client,
    );

    const updatedSampleResult = await client.query<SampleGenerationRecord>(
      `
        UPDATE sample_generations
        SET
          status = 'finalized',
          token_transaction_id = $2,
          finalized_at = COALESCE(finalized_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [sample.id, tokenTransaction.id],
    );

    await client.query('COMMIT');

    return {
      sample: updatedSampleResult.rows[0],
      tokenBalance: nextBalance,
      tokensDeducted: tokenCost,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markSampleDownloaded(sampleId: number, userId: number) {
  await pool.query(
    `
      UPDATE sample_generations
      SET
        downloaded_at = COALESCE(downloaded_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
    `,
    [sampleId, userId],
  );
}

export async function getSampleAttachmentPath(sample: SampleGenerationRecord) {
  return assertAudioFileExists(sample.audio_file);
}
