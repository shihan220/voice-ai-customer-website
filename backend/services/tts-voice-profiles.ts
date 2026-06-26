import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PoolClient } from 'pg';
import {
  normalizeText,
  privateMediaRoot,
  ttsVoiceProfilesMediaDirectory,
} from '../core.ts';
import {
  pool,
  type TtsVoiceProfileRecord,
} from '../db.ts';

const defaultKeypillarTtsBaseUrl = 'https://api.keypillar.org';
const defaultKeypillarVoiceProfilesEndpoint = '/v1/voice-profiles';
const defaultFixedVoiceDisplayName = 'Keypillar Bangla Female';
const defaultFfmpegPath = 'ffmpeg';
const defaultMaxActiveVoiceProfilesPerUser = 3;
const maxVoiceProfileNameLength = 80;
const maxReferenceTextLength = 4_000;
const minReferenceAudioSeconds = 1;
const maxReferenceAudioSeconds = 120;

type AudioMetadata = {
  durationSeconds: number;
  sampleRate: number;
};

export type TtsResolvedVoiceSelection = {
  providerVoiceProfileId: string | null;
  voiceDisplayName: string;
  voiceProfileId: number | null;
};

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

function getVoiceProfileConfig() {
  const apiKey = normalizeText(process.env.KEYPILLAR_TTS_API_KEY);
  const configuredApiUrl = normalizeText(process.env.KEYPILLAR_TTS_VOICE_PROFILES_API_URL);
  const baseUrl = normalizeText(process.env.KEYPILLAR_TTS_BASE_URL) ?? defaultKeypillarTtsBaseUrl;
  const endpoint = normalizeText(process.env.KEYPILLAR_TTS_VOICE_PROFILES_ENDPOINT) ?? defaultKeypillarVoiceProfilesEndpoint;
  const apiUrl = configuredApiUrl ?? new URL(endpoint, `${baseUrl.replace(/\/+$/, '')}/`).toString();
  const configuredMaxActive = Number(process.env.TTS_MAX_ACTIVE_VOICE_PROFILES ?? defaultMaxActiveVoiceProfilesPerUser);

  return {
    apiKey,
    apiUrl,
    ffmpegPath: normalizeText(process.env.FFMPEG_PATH) ?? defaultFfmpegPath,
    maxActiveProfiles: Number.isFinite(configuredMaxActive) && configuredMaxActive > 0
      ? Math.floor(configuredMaxActive)
      : defaultMaxActiveVoiceProfilesPerUser,
  };
}

function resolveFfprobePath(ffmpegPath: string) {
  if (ffmpegPath === defaultFfmpegPath) {
    return 'ffprobe';
  }

  return path.join(path.dirname(ffmpegPath), path.basename(ffmpegPath).replace(/ffmpeg$/, 'ffprobe'));
}

async function runCommandForStdout(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function assertWavBuffer(audioBuffer: Buffer) {
  const riffHeader = audioBuffer.subarray(0, 4).toString('ascii');
  const waveHeader = audioBuffer.subarray(8, 12).toString('ascii');

  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw withStatus('Upload a valid WAV file.', 400);
  }
}

async function inspectReferenceWav(audioBuffer: Buffer): Promise<AudioMetadata> {
  assertWavBuffer(audioBuffer);

  const config = getVoiceProfileConfig();
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'keypillar-reference-'));
  const tempPath = path.join(tempDirectory, `${randomUUID()}.wav`);

  try {
    await fs.writeFile(tempPath, audioBuffer);
    const stdout = await runCommandForStdout(resolveFfprobePath(config.ffmpegPath), [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'format=duration:stream=sample_rate',
      '-of',
      'json',
      tempPath,
    ]);
    const payload = JSON.parse(stdout) as {
      format?: {
        duration?: string;
      };
      streams?: Array<{
        sample_rate?: string;
      }>;
    };
    const durationSeconds = Number(payload.format?.duration);
    const sampleRate = Number(payload.streams?.[0]?.sample_rate);

    if (!Number.isFinite(durationSeconds) || durationSeconds < minReferenceAudioSeconds) {
      throw withStatus('Reference audio must be at least 1 second long.', 400);
    }

    if (durationSeconds > maxReferenceAudioSeconds) {
      throw withStatus('Reference audio must be 120 seconds or shorter.', 400);
    }

    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw withStatus('Reference audio sample rate could not be measured.', 400);
    }

    return {
      durationSeconds,
      sampleRate,
    };
  } finally {
    await fs.rm(tempDirectory, { force: true, recursive: true }).catch(() => undefined);
  }
}

function getJsonValueCandidates(payload: unknown, pathSegments: string[]) {
  let current = payload;

  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractProviderProfileId(payload: unknown) {
  const candidatePaths = [
    ['profile_id'],
    ['profileId'],
    ['voice_profile_id'],
    ['voiceProfileId'],
    ['id'],
    ['voice_profile', 'profile_id'],
    ['voice_profile', 'profileId'],
    ['voice_profile', 'voice_profile_id'],
    ['voice_profile', 'voiceProfileId'],
    ['voice_profile', 'id'],
    ['data', 'profile_id'],
    ['data', 'profileId'],
    ['data', 'voice_profile_id'],
    ['data', 'voiceProfileId'],
    ['data', 'id'],
    ['result', 'profile_id'],
    ['result', 'profileId'],
    ['result', 'voice_profile_id'],
    ['result', 'voiceProfileId'],
    ['result', 'id'],
  ];

  for (const candidatePath of candidatePaths) {
    const value = getJsonValueCandidates(payload, candidatePath);

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

async function createProviderVoiceProfile(input: {
  audioBuffer: Buffer;
  displayName: string;
  referenceText: string;
}) {
  const config = getVoiceProfileConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const response = await fetch(config.apiUrl, {
    body: JSON.stringify({
      name: input.displayName,
      reference_audio_base64: input.audioBuffer.toString('base64'),
      reference_text: input.referenceText,
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw withStatus(
      `Keypillar voice profile request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
      502,
    );
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const payload = contentType.includes('json')
    ? await response.json()
    : JSON.parse(await response.text());
  const providerProfileId = extractProviderProfileId(payload);

  if (!providerProfileId) {
    throw withStatus('Keypillar voice profile response did not include a profile id.', 502);
  }

  return providerProfileId;
}

async function deactivateProviderVoiceProfile(providerProfileId: string) {
  const config = getVoiceProfileConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const deactivateUrl = new URL(`${config.apiUrl.replace(/\/+$/, '')}/${encodeURIComponent(providerProfileId)}/deactivate`).toString();
  const response = await fetch(deactivateUrl, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw withStatus(
      `Keypillar voice profile deactivate failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
      502,
    );
  }
}

function normalizeProfileName(name: string) {
  const normalized = normalizeText(name);

  if (!normalized) {
    throw withStatus('Voice name is required.', 400);
  }

  return normalized.slice(0, maxVoiceProfileNameLength);
}

function normalizeReferenceText(referenceText: string) {
  const normalized = normalizeText(referenceText);

  if (!normalized) {
    throw withStatus('Reference text is required.', 400);
  }

  if (normalized.length > maxReferenceTextLength) {
    throw withStatus(`Reference text must stay under ${maxReferenceTextLength.toLocaleString()} characters.`, 400);
  }

  return normalized;
}

function slugifyStem(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function getVoiceProfilePaths(profile: Pick<TtsVoiceProfileRecord, 'display_name' | 'id' | 'user_id'>) {
  const userDirectory = path.join(ttsVoiceProfilesMediaDirectory, `user-${profile.user_id}`);
  const profileDirectory = path.join(userDirectory, `profile-${profile.id}`);
  const safeStem = slugifyStem(profile.display_name) || `profile-${profile.id}`;
  const referenceAbsolutePath = path.join(profileDirectory, `${safeStem}-reference.wav`);

  return {
    profileDirectory,
    referenceAbsolutePath,
    referenceRelativePath: path.relative(privateMediaRoot, referenceAbsolutePath),
    userDirectory,
  };
}

function resolvePrivateReferencePath(referenceAudioFile: string) {
  const absolutePath = path.resolve(privateMediaRoot, referenceAudioFile);
  const privateRootWithSeparator = `${privateMediaRoot}${path.sep}`;

  if (!absolutePath.startsWith(privateRootWithSeparator)) {
    throw withStatus('Reference audio file path is invalid.', 500);
  }

  return absolutePath;
}

async function countActiveProfiles(client: PoolClient, userId: number) {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM tts_voice_profiles
      WHERE user_id = $1
        AND is_active = TRUE
    `,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

export function getFixedTtsVoiceSelection(): TtsResolvedVoiceSelection {
  return {
    providerVoiceProfileId: null,
    voiceDisplayName: defaultFixedVoiceDisplayName,
    voiceProfileId: null,
  };
}

export async function resolveTtsVoiceSelectionForUser(
  client: PoolClient,
  userId: number,
  voiceProfileId: number | string | null | undefined,
): Promise<TtsResolvedVoiceSelection> {
  const normalized = typeof voiceProfileId === 'string' ? normalizeText(voiceProfileId) : voiceProfileId;

  if (normalized === null || normalized === undefined || normalized === 'fixed') {
    return getFixedTtsVoiceSelection();
  }

  const localProfileId = typeof normalized === 'number' ? normalized : Number(normalized);

  if (!Number.isInteger(localProfileId) || localProfileId <= 0) {
    throw withStatus('Choose a valid voice profile.', 400);
  }

  const result = await client.query<TtsVoiceProfileRecord>(
    `
      SELECT *
      FROM tts_voice_profiles
      WHERE id = $1
        AND user_id = $2
        AND is_active = TRUE
      LIMIT 1
    `,
    [localProfileId, userId],
  );
  const profile = result.rows[0];

  if (!profile) {
    throw withStatus('Voice profile not found.', 404);
  }

  return {
    providerVoiceProfileId: profile.provider_profile_id,
    voiceDisplayName: profile.display_name,
    voiceProfileId: Number(profile.id),
  };
}

export async function listTtsVoiceProfilesForUser(userId: number) {
  const result = await pool.query<TtsVoiceProfileRecord>(
    `
      SELECT *
      FROM tts_voice_profiles
      WHERE user_id = $1
        AND is_active = TRUE
      ORDER BY is_default DESC, created_at DESC, id DESC
    `,
    [userId],
  );

  return result.rows;
}

export async function getOwnedTtsVoiceProfileReferencePath(profileId: number, userId: number) {
  const result = await pool.query<TtsVoiceProfileRecord>(
    `
      SELECT *
      FROM tts_voice_profiles
      WHERE id = $1
        AND user_id = $2
        AND is_active = TRUE
      LIMIT 1
    `,
    [profileId, userId],
  );
  const profile = result.rows[0];

  if (!profile) {
    throw withStatus('Voice profile not found.', 404);
  }

  if (!profile.reference_audio_file) {
    throw withStatus('Reference WAV is not stored for this voice profile.', 404);
  }

  return {
    displayName: profile.display_name,
    filePath: resolvePrivateReferencePath(profile.reference_audio_file),
  };
}

export async function createTtsVoiceProfile(input: {
  audioBuffer: Buffer;
  displayName: string;
  referenceText: string;
  setDefault: boolean;
  userId: number;
}) {
  const displayName = normalizeProfileName(input.displayName);
  const referenceText = normalizeReferenceText(input.referenceText);
  const metadata = await inspectReferenceWav(input.audioBuffer);
  const config = getVoiceProfileConfig();

  const preflightResult = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM tts_voice_profiles
      WHERE user_id = $1
        AND is_active = TRUE
    `,
    [input.userId],
  );
  const currentActiveCount = Number(preflightResult.rows[0]?.count ?? 0);

  if (currentActiveCount >= config.maxActiveProfiles) {
    throw withStatus(`You can keep up to ${config.maxActiveProfiles} active custom voices. Deactivate one before creating another.`, 409);
  }

  const providerProfileId = await createProviderVoiceProfile({
    audioBuffer: input.audioBuffer,
    displayName,
    referenceText,
  });
  const client = await pool.connect();
  let profileDirectoryToClean: string | null = null;

  try {
    await client.query('BEGIN');

    const activeCount = await countActiveProfiles(client, input.userId);

    if (activeCount >= config.maxActiveProfiles) {
      throw withStatus(`You can keep up to ${config.maxActiveProfiles} active custom voices. Deactivate one before creating another.`, 409);
    }

    if (input.setDefault) {
      await client.query(
        `
          UPDATE tts_voice_profiles
          SET
            is_default = FALSE,
            updated_at = NOW()
          WHERE user_id = $1
            AND is_default = TRUE
        `,
        [input.userId],
      );
    }

    const profileResult = await client.query<TtsVoiceProfileRecord>(
      `
        INSERT INTO tts_voice_profiles (
          user_id,
          provider_profile_id,
          display_name,
          reference_text,
          reference_audio_seconds,
          reference_sample_rate,
          is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        input.userId,
        providerProfileId,
        displayName,
        referenceText,
        metadata.durationSeconds,
        metadata.sampleRate,
        input.setDefault,
      ],
    );
    const createdProfile = profileResult.rows[0];
    const profilePaths = getVoiceProfilePaths(createdProfile);
    profileDirectoryToClean = profilePaths.profileDirectory;

    await fs.mkdir(profilePaths.profileDirectory, { recursive: true });
    await fs.writeFile(profilePaths.referenceAbsolutePath, input.audioBuffer);

    const storedProfileResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          reference_audio_file = $2,
          reference_audio_file_size_bytes = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [createdProfile.id, profilePaths.referenceRelativePath, input.audioBuffer.byteLength],
    );

    await client.query('COMMIT');
    return storedProfileResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    await deactivateProviderVoiceProfile(providerProfileId).catch(() => undefined);
    if (profileDirectoryToClean) {
      await fs.rm(profileDirectoryToClean, { force: true, recursive: true }).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function setDefaultTtsVoiceProfile(profileId: number, userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const profileResult = await client.query<TtsVoiceProfileRecord>(
      `
        SELECT *
        FROM tts_voice_profiles
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        FOR UPDATE
      `,
      [profileId, userId],
    );
    const profile = profileResult.rows[0];

    if (!profile) {
      throw withStatus('Voice profile not found.', 404);
    }

    await client.query(
      `
        UPDATE tts_voice_profiles
        SET
          is_default = FALSE,
          updated_at = NOW()
        WHERE user_id = $1
          AND is_default = TRUE
      `,
      [userId],
    );

    const updatedResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          is_default = TRUE,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [profileId, userId],
    );

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateTtsVoiceProfile(profileId: number, userId: number) {
  const client = await pool.connect();
  let profileDirectoryToClean: string | null = null;
  let userDirectoryToClean: string | null = null;

  try {
    await client.query('BEGIN');

    const profileResult = await client.query<TtsVoiceProfileRecord>(
      `
        SELECT *
        FROM tts_voice_profiles
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        FOR UPDATE
      `,
      [profileId, userId],
    );
    const profile = profileResult.rows[0];

    if (!profile) {
      throw withStatus('Voice profile not found.', 404);
    }

    await deactivateProviderVoiceProfile(profile.provider_profile_id).catch((error) => {
      console.warn(
        `Provider voice profile deactivation failed for local profile ${profile.id}; deleting local profile anyway.`,
        error instanceof Error ? error.message : error,
      );
    });
    const profilePaths = getVoiceProfilePaths(profile);
    profileDirectoryToClean = profilePaths.profileDirectory;
    userDirectoryToClean = profilePaths.userDirectory;

    const updatedResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          is_active = FALSE,
          is_default = FALSE,
          reference_audio_file = NULL,
          reference_audio_file_size_bytes = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [profileId, userId],
    );

    await client.query('COMMIT');
    if (profileDirectoryToClean) {
      await fs.rm(profileDirectoryToClean, { force: true, recursive: true }).catch(() => undefined);
    }
    if (userDirectoryToClean) {
      await fs.rmdir(userDirectoryToClean).catch(() => undefined);
    }
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function getTtsVoiceProfileLimits() {
  const config = getVoiceProfileConfig();

  return {
    maxActiveProfiles: config.maxActiveProfiles,
    maxAudioBytes: 16 * 1024 * 1024,
    maxAudioSeconds: maxReferenceAudioSeconds,
    minAudioSeconds: minReferenceAudioSeconds,
  };
}
