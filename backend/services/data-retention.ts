import { pool } from '../db.ts';

const retentionIntervalMs = 6 * 60 * 60 * 1_000;
const deletionBatchSize = 5_000;
let retentionTimer: NodeJS.Timeout | null = null;
let retentionRunActive = false;

type RetentionTarget = {
  cutoff: string;
  dateColumn: string;
  tableName: string;
};

const retentionTargets: RetentionTarget[] = [
  { cutoff: "NOW() - INTERVAL '90 days'", dateColumn: 'created_at', tableName: 'email_verifications' },
  { cutoff: "NOW() - INTERVAL '90 days'", dateColumn: 'created_at', tableName: 'phone_verifications' },
  { cutoff: "NOW() - INTERVAL '90 days'", dateColumn: 'created_at', tableName: 'password_resets' },
  { cutoff: "CURRENT_DATE - INTERVAL '30 days'", dateColumn: 'bucket_date', tableName: 'signup_rate_limits' },
  { cutoff: "CURRENT_DATE - INTERVAL '30 days'", dateColumn: 'bucket_date', tableName: 'public_action_rate_limits' },
  { cutoff: "NOW() - INTERVAL '90 days'", dateColumn: 'created_at', tableName: 'tts_provider_usage_events' },
];

async function deleteExpiredBatch(target: RetentionTarget) {
  // Identifiers and cutoffs come only from the static list above.
  const result = await pool.query(
    `
      WITH expired AS (
        SELECT ctid
        FROM ${target.tableName}
        WHERE ${target.dateColumn} < ${target.cutoff}
        LIMIT $1
      )
      DELETE FROM ${target.tableName}
      WHERE ctid IN (SELECT ctid FROM expired)
    `,
    [deletionBatchSize],
  );

  return result.rowCount ?? 0;
}

export async function runDataRetentionMaintenance() {
  if (retentionRunActive) {
    return;
  }

  retentionRunActive = true;
  try {
    for (const target of retentionTargets) {
      await deleteExpiredBatch(target);
    }
  } finally {
    retentionRunActive = false;
  }
}

export function startDataRetentionMaintenance() {
  if (retentionTimer) {
    return;
  }

  void runDataRetentionMaintenance().catch((error) => {
    console.error('Data retention maintenance failed.', { error });
  });
  retentionTimer = setInterval(() => {
    void runDataRetentionMaintenance().catch((error) => {
      console.error('Data retention maintenance failed.', { error });
    });
  }, retentionIntervalMs);
  retentionTimer.unref();
}

export function stopDataRetentionMaintenance() {
  if (!retentionTimer) {
    return;
  }

  clearInterval(retentionTimer);
  retentionTimer = null;
}
