import type { PoolClient } from 'pg';

export type TtsProviderUsageEventType =
  | 'job_full'
  | 'job_preview'
  | 'sample_preview'
  | 'voice_profile_create'
  | 'voice_profile_sync'
  | 'voice_test_preview';

type ProviderUsageLimitInput = {
  deduplicateResource?: boolean;
  eventType: TtsProviderUsageEventType;
  limit: number;
  limitMessage: string;
  resourceId?: number | null;
  units?: number;
  userId: number;
};

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

export function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

export async function assertAndRecordTtsProviderUsage(
  client: PoolClient,
  input: ProviderUsageLimitInput,
) {
  const units = Math.max(1, Math.floor(input.units ?? 1));

  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [input.userId]);

  if (input.deduplicateResource && input.resourceId) {
    const existingResult = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM tts_provider_usage_events
          WHERE user_id = $1
            AND event_type = $2
            AND resource_id = $3
            AND created_at >= NOW() - INTERVAL '24 hours'
        ) AS exists
      `,
      [input.userId, input.eventType, input.resourceId],
    );

    if (existingResult.rows[0]?.exists) {
      return;
    }
  }

  const result = await client.query<{ usage_total: string }>(
    `
      SELECT COALESCE(SUM(usage_units), 0)::text AS usage_total
      FROM tts_provider_usage_events
      WHERE user_id = $1
        AND event_type = $2
        AND created_at >= NOW() - INTERVAL '24 hours'
    `,
    [input.userId, input.eventType],
  );
  const usageTotal = Number(result.rows[0]?.usage_total ?? 0);

  if (usageTotal + units > input.limit) {
    throw withStatus(input.limitMessage, 429);
  }

  await client.query(
    `
      INSERT INTO tts_provider_usage_events (
        user_id,
        event_type,
        resource_id,
        usage_units
      )
      VALUES ($1, $2, $3, $4)
    `,
    [input.userId, input.eventType, input.resourceId ?? null, units],
  );
}
