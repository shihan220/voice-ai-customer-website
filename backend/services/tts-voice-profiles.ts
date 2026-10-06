import { randomUUID } from 'node:crypto';
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
import {
  assertAndRecordTtsProviderUsage,
  readBoundedIntegerEnv,
} from './tts-provider-usage.ts';
import {
  fetchSafeProviderAudio,
  readResponseBufferWithLimit,
} from './provider-audio-fetch.ts';
import {
  runMediaCommand as runCommand,
  runMediaCommandForStderr as getAudioFilterOutput,
  runMediaCommandForStdout as runCommandForStdout,
} from './process-runner.ts';

const defaultKeypillarTtsBaseUrl = 'https://api.keypillar.org';
const defaultKeypillarTtsEndpoint = '/v1/voice/generate';
const defaultKeypillarTtsFormat = 'wav';
const defaultKeypillarTtsPronunciationMode = 'english_preserve';
const defaultKeypillarTtsVoiceId = 'keypillar-bd-female';
const defaultKeypillarVoiceProfilesEndpoint = '/v1/voice-profiles';
const defaultKeypillarTtsRequestTimeoutMs = 180_000;
const defaultFixedVoiceDisplayName = 'Keypillar Bangla Female';
const defaultFfmpegPath = 'ffmpeg';
const defaultMaxActiveVoiceProfilesPerUser = 3;
const defaultVoiceProfileDailyCreateLimit = 3;
const defaultVoiceProfileDailySyncLimit = 6;
const defaultVoiceTestPreviewDailyLimit = 6;
const defaultVoiceTestPreviewCooldownMinutes = 30;
const defaultVoiceProfileMaxUploadMegabytes = 40;
const maxVoiceProfileNameLength = 80;
const maxReferenceTextLength = 4_000;
const minReferenceAudioSeconds = 120;
const maxReferenceAudioSeconds = 300;
const providerUnavailablePublicMessage = 'Keypillar voice profile API is currently unavailable. The reference WAV was saved here and can be activated after the API is back online.';
const providerDeactivateUnavailablePublicMessage = 'Keypillar voice profile API is currently unavailable. The voice was not deleted yet; please try again after the API is back online.';
const testPreviewText = 'এটি আমার কাস্টম কণ্ঠের একটি ছোট পরীক্ষামূলক অডিও। বাক্যগুলো পরিষ্কারভাবে পড়া হচ্ছে, যাতে স্বর, বিরতি এবং উচ্চারণ বোঝা যায়।';
const voiceConsentVersion = 'voice-consent-v1';

type AudioMetadata = {
  durationSeconds: number;
  sampleRate: number;
};

type NormalizedReferenceAudio = {
  audioBuffer: Buffer;
  metadata: AudioMetadata;
  normalizedAt: Date;
  qualityWarnings: string[];
};

type ProviderSyncStatus = TtsVoiceProfileRecord['provider_sync_status'];

export type TtsResolvedVoiceSelection = {
  providerVoiceProfileId: string | null;
  voiceDisplayName: string;
  voiceProfileId: number | null;
};

function withStatus(message: string, statusCode: number, publicMessage?: string) {
  const error = new Error(message);
  const enrichedError = error as Error & { publicMessage?: string; statusCode?: number };
  enrichedError.statusCode = statusCode;
  if (publicMessage) {
    enrichedError.publicMessage = publicMessage;
  }
  return error;
}

function isCloudflareOriginUnavailable(statusCode: number, responseBody: string) {
  return statusCode === 530 || /error code:\s*1033/i.test(responseBody);
}

function isProviderVoiceProfileUnavailableError(error: unknown) {
  const enrichedError = error as { publicMessage?: string; statusCode?: number };

  return enrichedError.statusCode === 503 && enrichedError.publicMessage === providerUnavailablePublicMessage;
}

const referenceQualityIssueMessages: Record<string, string> = {
  reference_audio_excessive_leading_silence: 'remove the long silence before speaking',
  reference_audio_excessive_trailing_silence: 'remove the long silence after speaking',
  reference_audio_likely_clipping: 'lower the microphone level because the audio is clipping',
  reference_audio_low_loudness: 'speak closer to the microphone because the recording is too quiet',
  reference_audio_no_usable_signal: 'record clear audible speech',
  reference_audio_sample_rate_too_low: 'record with a higher-quality microphone or browser',
  reference_audio_too_long: 'keep the recording at 5 minutes or shorter',
  reference_audio_too_much_silence: 'reduce silence and keep speaking naturally throughout the sample',
  reference_audio_too_short: 'record at least 2 minutes of speech',
};

function getProviderVoiceProfileValidationMessage(statusCode: number, responseBody: string) {
  if (statusCode === 413) {
    return 'The reference recording is too large for the Keypillar voice service. Keep it between 2 and 5 minutes and try again.';
  }

  try {
    const payload = JSON.parse(responseBody) as {
      error?: unknown;
      reference_quality?: {
        blocking_issues?: unknown;
      };
    };

    if (payload.error === 'reference_audio_quality_failed') {
      const blockingIssues = Array.isArray(payload.reference_quality?.blocking_issues)
        ? payload.reference_quality.blocking_issues
          .filter((issue): issue is string => typeof issue === 'string')
          .map((issue) => referenceQualityIssueMessages[issue])
          .filter((message): message is string => Boolean(message))
        : [];

      if (blockingIssues.length > 0) {
        return `The reference recording did not pass quality checks: ${blockingIssues.join('; ')}. Re-record it and try again.`;
      }

      return 'The reference recording did not pass Keypillar quality checks. Re-record clear speech in a quiet room and try again.';
    }
  } catch {
    // The provider can return plain text for proxy and infrastructure errors.
  }

  return 'Keypillar rejected the reference recording. Check that it is a clear 2 to 5 minute WAV matching the displayed script.';
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(5_000, Math.floor(parsed));
}

function getVoiceProfileConfig() {
  const apiKey = normalizeText(process.env.KEYPILLAR_TTS_API_KEY);
  const configuredTtsApiUrl = normalizeText(process.env.KEYPILLAR_TTS_API_URL);
  const configuredApiUrl = normalizeText(process.env.KEYPILLAR_TTS_VOICE_PROFILES_API_URL);
  const baseUrl = normalizeText(process.env.KEYPILLAR_TTS_BASE_URL) ?? defaultKeypillarTtsBaseUrl;
  const ttsEndpoint = normalizeText(process.env.KEYPILLAR_TTS_ENDPOINT) ?? defaultKeypillarTtsEndpoint;
  const endpoint = normalizeText(process.env.KEYPILLAR_TTS_VOICE_PROFILES_ENDPOINT) ?? defaultKeypillarVoiceProfilesEndpoint;
  const apiUrl = configuredApiUrl ?? new URL(endpoint, `${baseUrl.replace(/\/+$/, '')}/`).toString();
  const ttsApiUrl = configuredTtsApiUrl ?? new URL(ttsEndpoint, `${baseUrl.replace(/\/+$/, '')}/`).toString();
  const configuredMaxActive = Number(process.env.TTS_MAX_ACTIVE_VOICE_PROFILES ?? defaultMaxActiveVoiceProfilesPerUser);
  const requestTimeoutMs = normalizeTimeoutMs(
    process.env.KEYPILLAR_TTS_REQUEST_TIMEOUT_MS,
    defaultKeypillarTtsRequestTimeoutMs,
  );
  const dailyCreateLimit = readBoundedIntegerEnv(
    'TTS_VOICE_PROFILE_DAILY_CREATE_LIMIT_PER_USER',
    defaultVoiceProfileDailyCreateLimit,
    1,
    20,
  );
  const dailySyncLimit = readBoundedIntegerEnv(
    'TTS_VOICE_PROFILE_DAILY_SYNC_LIMIT_PER_USER',
    defaultVoiceProfileDailySyncLimit,
    1,
    50,
  );
  const dailyTestPreviewLimit = readBoundedIntegerEnv(
    'TTS_VOICE_TEST_PREVIEW_DAILY_LIMIT_PER_USER',
    defaultVoiceTestPreviewDailyLimit,
    1,
    50,
  );
  const testPreviewCooldownMinutes = readBoundedIntegerEnv(
    'TTS_VOICE_TEST_PREVIEW_COOLDOWN_MINUTES',
    defaultVoiceTestPreviewCooldownMinutes,
    1,
    1_440,
  );
  const maxUploadMegabytes = readBoundedIntegerEnv(
    'TTS_VOICE_PROFILE_MAX_UPLOAD_MB',
    defaultVoiceProfileMaxUploadMegabytes,
    16,
    64,
  );

  return {
    apiKey,
    apiUrl,
    dailyCreateLimit,
    dailySyncLimit,
    dailyTestPreviewLimit,
    ffmpegPath: normalizeText(process.env.FFMPEG_PATH) ?? defaultFfmpegPath,
    format: defaultKeypillarTtsFormat,
    maxActiveProfiles: Number.isFinite(configuredMaxActive) && configuredMaxActive > 0
      ? Math.floor(configuredMaxActive)
      : defaultMaxActiveVoiceProfilesPerUser,
    maxAudioBytes: maxUploadMegabytes * 1024 * 1024,
    pronunciationMode: normalizeText(process.env.KEYPILLAR_TTS_PRONUNCIATION_MODE) ?? defaultKeypillarTtsPronunciationMode,
    requestTimeoutMs,
    testPreviewCooldownMs: testPreviewCooldownMinutes * 60_000,
    ttsApiUrl,
    voiceId: normalizeText(process.env.KEYPILLAR_TTS_VOICE_ID) ?? defaultKeypillarTtsVoiceId,
  };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  publicMessage?: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw withStatus(timeoutMessage, 504, publicMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveFfprobePath(ffmpegPath: string) {
  if (ffmpegPath === defaultFfmpegPath) {
    return 'ffprobe';
  }

  return path.join(path.dirname(ffmpegPath), path.basename(ffmpegPath).replace(/ffmpeg$/, 'ffprobe'));
}

function assertWavBuffer(audioBuffer: Buffer) {
  const riffHeader = audioBuffer.subarray(0, 4).toString('ascii');
  const waveHeader = audioBuffer.subarray(8, 12).toString('ascii');

  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw withStatus('Upload a valid WAV file.', 400);
  }
}

async function inspectReferenceWav(audioBuffer: Buffer, options: { enforceDurationLimits?: boolean } = {}): Promise<AudioMetadata> {
  assertWavBuffer(audioBuffer);
  const enforceDurationLimits = options.enforceDurationLimits ?? true;

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

    if (!Number.isFinite(durationSeconds) || (enforceDurationLimits && durationSeconds < minReferenceAudioSeconds)) {
      throw withStatus('Reference audio must be at least 2 minutes long.', 400);
    }

    if (enforceDurationLimits && durationSeconds > maxReferenceAudioSeconds) {
      throw withStatus('Reference audio must be 5 minutes or shorter.', 400);
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

function parseVolumeDb(output: string, key: 'max_volume' | 'mean_volume') {
  const match = output.match(new RegExp(`${key}:\\s*(-?[0-9.]+)\\s*dB`));
  return match ? Number(match[1]) : null;
}

function parseSilenceWarnings(output: string, durationSeconds: number) {
  const warnings: string[] = [];
  const silenceStarts = [...output.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const silenceEnds = [...output.matchAll(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g)]
    .map((match) => ({
      duration: Number(match[2]),
      end: Number(match[1]),
    }));
  const firstSilenceEnd = silenceEnds[0];
  const lastSilenceEnd = silenceEnds[silenceEnds.length - 1];

  if (
    silenceStarts.some((start) => Number.isFinite(start) && start <= 0.15) &&
    firstSilenceEnd &&
    Number.isFinite(firstSilenceEnd.duration) &&
    firstSilenceEnd.duration > 1
  ) {
    warnings.push('Reference audio still has more than 1 second of leading silence.');
  }

  if (
    lastSilenceEnd &&
    Number.isFinite(lastSilenceEnd.end) &&
    Number.isFinite(lastSilenceEnd.duration) &&
    durationSeconds - lastSilenceEnd.end <= 0.2 &&
    lastSilenceEnd.duration > 1
  ) {
    warnings.push('Reference audio still has more than 1 second of trailing silence.');
  }

  return warnings;
}

async function buildReferenceQualityWarnings(filePath: string, metadata: AudioMetadata) {
  const config = getVoiceProfileConfig();
  const warnings: string[] = [];

  if (metadata.durationSeconds < minReferenceAudioSeconds) {
    warnings.push('Reference audio is shorter than 2 minutes. A 2-5 minute sample gives better custom voice quality.');
  }

  if (metadata.durationSeconds > maxReferenceAudioSeconds) {
    warnings.push('Reference audio is longer than 5 minutes. Keep the reference focused between 2 and 5 minutes.');
  }

  try {
    const volumeOutput = await getAudioFilterOutput(config.ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]);
    const meanVolume = parseVolumeDb(volumeOutput, 'mean_volume');
    const maxVolume = parseVolumeDb(volumeOutput, 'max_volume');

    if (meanVolume !== null && meanVolume < -35) {
      warnings.push('Reference audio is very quiet. Record closer to the microphone or increase input level.');
    }

    if (maxVolume !== null && maxVolume > -0.5) {
      warnings.push('Reference audio may be clipping. Lower the microphone input level and avoid speaking too close to the mic.');
    }
  } catch {
    warnings.push('Reference audio loudness could not be fully checked.');
  }

  try {
    const silenceOutput = await getAudioFilterOutput(config.ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'silencedetect=n=-45dB:d=0.3',
      '-f',
      'null',
      '-',
    ]);
    warnings.push(...parseSilenceWarnings(silenceOutput, metadata.durationSeconds));
  } catch {
    warnings.push('Reference audio silence could not be fully checked.');
  }

  return [...new Set(warnings)];
}

async function normalizeReferenceAudio(audioBuffer: Buffer): Promise<NormalizedReferenceAudio> {
  const config = getVoiceProfileConfig();

  if (audioBuffer.byteLength > config.maxAudioBytes) {
    throw withStatus(
      `Reference WAV files must stay under ${Math.floor(config.maxAudioBytes / (1024 * 1024))} MB.`,
      413,
    );
  }

  assertWavBuffer(audioBuffer);
  await inspectReferenceWav(audioBuffer);

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'keypillar-reference-normalize-'));
  const inputPath = path.join(tempDirectory, `${randomUUID()}-input.wav`);
  const outputPath = path.join(tempDirectory, `${randomUUID()}-normalized.wav`);

  try {
    await fs.writeFile(inputPath, audioBuffer);
    await runCommand(config.ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-af',
      [
        'silenceremove=start_periods=1:start_duration=0.2:start_threshold=-50dB',
        'areverse',
        'silenceremove=start_periods=1:start_duration=0.4:start_threshold=-50dB',
        'areverse',
        'loudnorm=I=-20:TP=-3:LRA=11',
      ].join(','),
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'pcm_s16le',
      outputPath,
    ]);

    const normalizedBuffer = await fs.readFile(outputPath);
    const metadata = await inspectReferenceWav(normalizedBuffer, { enforceDurationLimits: false });
    const qualityWarnings = await buildReferenceQualityWarnings(outputPath, metadata);

    return {
      audioBuffer: normalizedBuffer,
      metadata,
      normalizedAt: new Date(),
      qualityWarnings,
    };
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    throw withStatus(
      `Reference audio could not be normalized: ${error instanceof Error ? error.message : String(error)}`,
      400,
      'Reference WAV could not be processed. Upload a clean PCM WAV file and try again.',
    );
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

function extractBase64AudioPayload(payload: unknown): Buffer | null {
  const candidatePaths = [
    ['audio_base64'],
    ['audioBase64'],
    ['audio'],
    ['wav_base64'],
    ['wavBase64'],
    ['data', 'audio_base64'],
    ['data', 'audioBase64'],
    ['data', 'audio'],
    ['result', 'audio_base64'],
    ['result', 'audioBase64'],
    ['result', 'audio'],
  ];

  for (const candidatePath of candidatePaths) {
    const value = getJsonValueCandidates(payload, candidatePath);

    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }

    if (/^https?:\/\//i.test(value.trim())) {
      continue;
    }

    const cleanedValue = value.includes('base64,') ? value.split('base64,').pop() ?? '' : value;

    if (!/^[a-z0-9+/=\s_-]+$/i.test(cleanedValue)) {
      continue;
    }

    try {
      return Buffer.from(cleanedValue, 'base64');
    } catch {
      continue;
    }
  }

  return null;
}

function extractAudioUrlFromPayload(payload: unknown) {
  const candidatePaths = [
    ['audio_url'],
    ['audioUrl'],
    ['audio'],
    ['url'],
    ['download_url'],
    ['downloadUrl'],
    ['data', 'audio_url'],
    ['data', 'audioUrl'],
    ['data', 'audio'],
    ['data', 'url'],
    ['result', 'audio_url'],
    ['result', 'audioUrl'],
    ['result', 'audio'],
    ['result', 'url'],
  ];

  for (const candidatePath of candidatePaths) {
    const value = getJsonValueCandidates(payload, candidatePath);

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

async function fetchProviderAudioUrl(audioUrl: string, config: ReturnType<typeof getVoiceProfileConfig>) {
  const delaysMs = [0, 500, 1_000, 1_500, 2_500, 4_000];
  let lastStatusCode: number | null = null;

  for (const [attemptIndex, delayMs] of delaysMs.entries()) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const response = await fetchSafeProviderAudio({
      apiKey: config.apiKey,
      audioUrl,
      providerApiUrl: config.ttsApiUrl,
      timeoutMs: config.requestTimeoutMs,
    });

    if (response.ok) {
      return readResponseBufferWithLimit(response);
    }

    lastStatusCode = response.status;
    await response.body?.cancel().catch(() => undefined);

    const hasMoreAttempts = attemptIndex < delaysMs.length - 1;
    const retryable = response.status === 404 ||
      response.status === 408 ||
      response.status === 409 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;

    if (!hasMoreAttempts || !retryable) {
      break;
    }
  }

  throw withStatus(`Test preview audio fetch failed with status ${lastStatusCode ?? 'unknown'}.`, 502);
}

async function fetchAudioFromJsonPayload(payload: unknown, config: ReturnType<typeof getVoiceProfileConfig>) {
  const directAudio = extractBase64AudioPayload(payload);

  if (directAudio) {
    return directAudio;
  }

  const audioUrl = extractAudioUrlFromPayload(payload);

  if (audioUrl) {
    return fetchProviderAudioUrl(audioUrl, config);
  }

  throw withStatus('Keypillar TTS response did not include downloadable audio.', 502);
}

async function generateProviderTestPreview(input: {
  providerVoiceProfileId: string;
}) {
  const config = getVoiceProfileConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const response = await fetchWithTimeout(
    config.ttsApiUrl,
    {
      body: JSON.stringify({
        format: config.format,
        pronunciation_mode: config.pronunciationMode,
        speed: 1.0,
        text: testPreviewText,
        voice: config.voiceId,
        voice_profile_id: input.providerVoiceProfileId,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      method: 'POST',
    },
    config.requestTimeoutMs,
    `Keypillar TTS test preview timed out after ${Math.round(config.requestTimeoutMs / 1_000)} seconds.`,
    'Keypillar TTS API is currently unavailable. Try the custom voice test again after the API is back online.',
  ).catch((error: unknown) => {
    throw withStatus(
      `Keypillar TTS test preview request failed: ${error instanceof Error ? error.message : String(error)}`,
      503,
      'Keypillar TTS API is currently unavailable. Try the custom voice test again after the API is back online.',
    );
  });

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (isCloudflareOriginUnavailable(response.status, errorBody)) {
      throw withStatus(
        `Keypillar TTS API unavailable with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
        503,
        'Keypillar TTS API is currently unavailable. Try the custom voice test again after the API is back online.',
      );
    }

    throw withStatus(
      `Keypillar TTS test preview failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
      502,
    );
  }

  if (contentType.includes('audio') || contentType.includes('octet-stream')) {
    return readResponseBufferWithLimit(response);
  }

  if (contentType.includes('json')) {
    return fetchAudioFromJsonPayload(await response.json(), config);
  }

  const rawBody = await response.text();

  try {
    return fetchAudioFromJsonPayload(JSON.parse(rawBody), config);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw withStatus('Keypillar TTS returned an unsupported response format.', 502);
    }

    throw error;
  }
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

  const response = await fetchWithTimeout(
    config.apiUrl,
    {
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
    },
    config.requestTimeoutMs,
    `Keypillar voice profile request timed out after ${Math.round(config.requestTimeoutMs / 1_000)} seconds.`,
    providerUnavailablePublicMessage,
  ).catch((error: unknown) => {
    throw withStatus(
      `Keypillar voice profile API request failed: ${error instanceof Error ? error.message : String(error)}`,
      503,
      providerUnavailablePublicMessage,
    );
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (response.status >= 500 || isCloudflareOriginUnavailable(response.status, errorBody)) {
      throw withStatus(
        `Keypillar voice profile API unavailable with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
        503,
        providerUnavailablePublicMessage,
      );
    }

    if (response.status >= 400 && response.status < 500) {
      throw withStatus(
        `Keypillar voice profile request rejected with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 500)}` : '.'}`,
        400,
        getProviderVoiceProfileValidationMessage(response.status, errorBody),
      );
    }

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

async function tryDeactivateProviderVoiceProfile(providerProfileId: string | null) {
  if (!providerProfileId) {
    return;
  }

  await deactivateProviderVoiceProfile(providerProfileId).catch(() => undefined);
}

async function deactivateProviderVoiceProfile(providerProfileId: string) {
  const config = getVoiceProfileConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const deactivateUrl = new URL(`${config.apiUrl.replace(/\/+$/, '')}/${encodeURIComponent(providerProfileId)}/deactivate`).toString();
  const response = await fetchWithTimeout(
    deactivateUrl,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      method: 'POST',
    },
    config.requestTimeoutMs,
    `Keypillar voice profile deactivate timed out after ${Math.round(config.requestTimeoutMs / 1_000)} seconds.`,
    providerDeactivateUnavailablePublicMessage,
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (response.status === 404 || response.status === 410) {
      return;
    }
    if (isCloudflareOriginUnavailable(response.status, errorBody)) {
      throw withStatus(
        `Keypillar voice profile deactivate unavailable with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
        503,
        providerDeactivateUnavailablePublicMessage,
      );
    }
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
  const testPreviewAbsolutePath = path.join(profileDirectory, `${safeStem}-test-preview.wav`);

  return {
    profileDirectory,
    referenceAbsolutePath,
    referenceRelativePath: path.relative(privateMediaRoot, referenceAbsolutePath),
    testPreviewAbsolutePath,
    testPreviewRelativePath: path.relative(privateMediaRoot, testPreviewAbsolutePath),
    userDirectory,
  };
}

function resolvePrivateReferencePath(referenceAudioFile: string) {
  const absolutePath = path.resolve(privateMediaRoot, referenceAudioFile);
  const allowedRoot = path.resolve(ttsVoiceProfilesMediaDirectory);

  if (absolutePath !== allowedRoot && !absolutePath.startsWith(`${allowedRoot}${path.sep}`)) {
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

async function countBlockingJobsForVoiceProfile(client: PoolClient, profileId: number, userId: number) {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM tts_generation_jobs
      WHERE user_id = $1
        AND voice_profile_id = $2
        AND status IN (
          'queued',
          'processing',
          'preview_queued',
          'preview_processing',
          'preview_ready',
          'cancelling'
        )
    `,
    [userId, profileId],
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

  if (!Number.isSafeInteger(localProfileId) || localProfileId <= 0) {
    throw withStatus('Choose a valid voice profile.', 400);
  }

  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [-Math.abs(localProfileId)]);
  const result = await client.query<TtsVoiceProfileRecord>(
    `
      SELECT *
      FROM tts_voice_profiles
      WHERE id = $1
        AND user_id = $2
        AND is_active = TRUE
      LIMIT 1
      FOR SHARE
    `,
    [localProfileId, userId],
  );
  const profile = result.rows[0];

  if (!profile) {
    throw withStatus('Voice profile not found.', 404);
  }

  if (profile.provider_sync_status !== 'ready' || !profile.provider_profile_id) {
    throw withStatus(
      'This custom voice is saved but not active yet. Retry activation after the Keypillar API is back online.',
      409,
    );
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
  consentConfirmed: boolean;
  displayName: string;
  referenceText: string;
  setDefault: boolean;
  userId: number;
}) {
  if (!input.consentConfirmed) {
    throw withStatus('Confirm that this is your voice or that you have explicit permission to use it.', 400);
  }

  const displayName = normalizeProfileName(input.displayName);
  const referenceText = normalizeReferenceText(input.referenceText);
  const config = getVoiceProfileConfig();
  let normalizedReference: NormalizedReferenceAudio | null = null;
  let providerProfileId: string | null = null;
  const client = await pool.connect();
  let profileDirectoryToClean: string | null = null;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [input.userId]);

    const activeCount = await countActiveProfiles(client, input.userId);

    if (activeCount >= config.maxActiveProfiles) {
      throw withStatus(`You can keep up to ${config.maxActiveProfiles} active custom voices. Deactivate one before creating another.`, 409);
    }

    await assertAndRecordTtsProviderUsage(client, {
      eventType: 'voice_profile_create',
      limit: config.dailyCreateLimit,
      limitMessage: `You can create up to ${config.dailyCreateLimit} custom voice profiles in 24 hours. Try again later.`,
      userId: input.userId,
    });

    normalizedReference = await normalizeReferenceAudio(input.audioBuffer);

    let providerSyncStatus: ProviderSyncStatus = 'ready';
    let providerSyncError: string | null = null;

    try {
      providerProfileId = await createProviderVoiceProfile({
        audioBuffer: normalizedReference.audioBuffer,
        displayName,
        referenceText,
      });
    } catch (error) {
      if (!isProviderVoiceProfileUnavailableError(error)) {
        throw error;
      }

      providerSyncStatus = 'pending';
      providerSyncError = (error as { publicMessage?: string }).publicMessage ?? providerUnavailablePublicMessage;
    }

    const canSetDefault = input.setDefault && providerSyncStatus === 'ready';

    if (canSetDefault) {
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
          provider_sync_status,
          provider_sync_error,
          provider_synced_at,
          display_name,
          reference_text,
          reference_audio_seconds,
          reference_sample_rate,
          reference_normalized_at,
          reference_quality_warnings,
          consent_confirmed_at,
          consent_version,
          is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), $12, $13)
        RETURNING *
      `,
      [
        input.userId,
        providerProfileId,
        providerSyncStatus,
        providerSyncError,
        providerSyncStatus === 'ready' ? new Date() : null,
        displayName,
        referenceText,
        normalizedReference.metadata.durationSeconds,
        normalizedReference.metadata.sampleRate,
        normalizedReference.normalizedAt,
        JSON.stringify(normalizedReference.qualityWarnings),
        voiceConsentVersion,
        canSetDefault,
      ],
    );
    const createdProfile = profileResult.rows[0];
    const profilePaths = getVoiceProfilePaths(createdProfile);
    profileDirectoryToClean = profilePaths.profileDirectory;

    await fs.mkdir(profilePaths.profileDirectory, { recursive: true });
    await fs.writeFile(profilePaths.referenceAbsolutePath, normalizedReference.audioBuffer);

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
      [createdProfile.id, profilePaths.referenceRelativePath, normalizedReference.audioBuffer.byteLength],
    );

    await client.query('COMMIT');
    return storedProfileResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    await tryDeactivateProviderVoiceProfile(providerProfileId);
    if (profileDirectoryToClean) {
      await fs.rm(profileDirectoryToClean, { force: true, recursive: true }).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function syncTtsVoiceProfileWithProvider(profileId: number, userId: number) {
  const config = getVoiceProfileConfig();
  const client = await pool.connect();
  let providerProfileId: string | null = null;
  let transactionFinished = false;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [-Math.abs(profileId)]);

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

    if (profile.provider_sync_status === 'ready' && profile.provider_profile_id) {
      await client.query('COMMIT');
      transactionFinished = true;
      return profile;
    }

    if (!profile.reference_audio_file) {
      throw withStatus('Reference WAV is not stored for this voice profile.', 409);
    }

    await assertAndRecordTtsProviderUsage(client, {
      eventType: 'voice_profile_sync',
      limit: config.dailySyncLimit,
      limitMessage: `You can retry custom voice activation up to ${config.dailySyncLimit} times in 24 hours. Try again later.`,
      resourceId: profileId,
      userId,
    });

    await client.query(
      `
        UPDATE tts_voice_profiles
        SET
          provider_sync_status = 'syncing',
          provider_sync_started_at = NOW(),
          provider_sync_error = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
      `,
      [profileId, userId],
    );

    const referenceAudioPath = resolvePrivateReferencePath(profile.reference_audio_file);
    const audioBuffer = await fs.readFile(referenceAudioPath).catch((error: unknown) => {
      throw withStatus(
        `Reference WAV is missing: ${error instanceof Error ? error.message : String(error)}`,
        409,
        'Reference WAV is missing. Delete this voice and create a new one.',
      );
    });
    const normalizedReference = await normalizeReferenceAudio(audioBuffer);

    try {
      providerProfileId = await createProviderVoiceProfile({
        audioBuffer: normalizedReference.audioBuffer,
        displayName: profile.display_name,
        referenceText: profile.reference_text,
      });
    } catch (error) {
      const publicMessage = error instanceof Error
        && 'publicMessage' in error
        && typeof (error as Error & { publicMessage?: unknown }).publicMessage === 'string'
        ? (error as Error & { publicMessage: string }).publicMessage
        : 'Custom voice activation failed. Try again later.';

      await client.query(
        `
          UPDATE tts_voice_profiles
          SET
            provider_sync_status = 'pending',
            provider_sync_started_at = NULL,
            provider_sync_error = $3,
            updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
        `,
        [
          profileId,
          userId,
          publicMessage,
        ],
      );

      await client.query('COMMIT');
      transactionFinished = true;
      throw error;
    }

    const profilePaths = getVoiceProfilePaths(profile);
    await fs.mkdir(profilePaths.profileDirectory, { recursive: true });
    await fs.writeFile(profilePaths.referenceAbsolutePath, normalizedReference.audioBuffer);

    const updatedResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          provider_profile_id = $3,
          provider_sync_status = 'ready',
          provider_sync_started_at = NULL,
          provider_sync_error = NULL,
          provider_synced_at = NOW(),
          reference_audio_seconds = $4,
          reference_sample_rate = $5,
          reference_audio_file = $6,
          reference_audio_file_size_bytes = $7,
          reference_normalized_at = $8,
          reference_quality_warnings = $9::jsonb,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        RETURNING *
      `,
      [
        profileId,
        userId,
        providerProfileId,
        normalizedReference.metadata.durationSeconds,
        normalizedReference.metadata.sampleRate,
        profilePaths.referenceRelativePath,
        normalizedReference.audioBuffer.byteLength,
        normalizedReference.normalizedAt,
        JSON.stringify(normalizedReference.qualityWarnings),
      ],
    );
    const updatedProfile = updatedResult.rows[0];

    if (!updatedProfile) {
      throw withStatus('Voice profile not found.', 404);
    }

    await client.query('COMMIT');
    transactionFinished = true;
    return updatedProfile;
  } catch (error) {
    if (!transactionFinished) {
      await client.query('ROLLBACK').catch(() => undefined);
      await tryDeactivateProviderVoiceProfile(providerProfileId);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function generateTtsVoiceProfileTestPreview(profileId: number, userId: number) {
  const config = getVoiceProfileConfig();
  const client = await pool.connect();
  let transactionFinished = false;
  let providerUsageRecorded = false;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [-Math.abs(profileId)]);

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

    if (profile.provider_sync_status !== 'ready' || !profile.provider_profile_id) {
      throw withStatus('Activate this voice before generating a test preview.', 409);
    }

    const profilePaths = getVoiceProfilePaths(profile);
    const generatedAtMs = profile.test_preview_generated_at?.getTime?.() ?? 0;
    const cacheIsFresh = Boolean(
      profile.test_preview_file
      && generatedAtMs > 0
      && Date.now() - generatedAtMs < config.testPreviewCooldownMs,
    );

    if (cacheIsFresh) {
      const cachedPreviewExists = await fs.access(profilePaths.testPreviewAbsolutePath)
        .then(() => true)
        .catch(() => false);

      if (cachedPreviewExists) {
        await client.query('COMMIT');
        transactionFinished = true;
        return profile;
      }
    }

    await assertAndRecordTtsProviderUsage(client, {
      eventType: 'voice_test_preview',
      limit: config.dailyTestPreviewLimit,
      limitMessage: `You can generate up to ${config.dailyTestPreviewLimit} custom voice tests in 24 hours. Reuse the existing test audio or try again later.`,
      resourceId: profileId,
      userId,
    });
    providerUsageRecorded = true;

    let previewAudio: Buffer;
    try {
      previewAudio = await generateProviderTestPreview({
        providerVoiceProfileId: profile.provider_profile_id,
      });
    } catch (error) {
      await client.query('COMMIT');
      transactionFinished = true;
      throw error;
    }

    const metadata = await inspectReferenceWav(previewAudio, { enforceDurationLimits: false });
    await fs.mkdir(profilePaths.profileDirectory, { recursive: true });
    await fs.writeFile(profilePaths.testPreviewAbsolutePath, previewAudio);

    const updatedResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          test_preview_file = $3,
          test_preview_audio_seconds = $4,
          test_preview_generated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        RETURNING *
      `,
      [profileId, userId, profilePaths.testPreviewRelativePath, metadata.durationSeconds],
    );
    const updatedProfile = updatedResult.rows[0];

    if (!updatedProfile) {
      throw withStatus('Voice profile not found.', 404);
    }

    await client.query('COMMIT');
    transactionFinished = true;
    return updatedProfile;
  } catch (error) {
    if (!transactionFinished && providerUsageRecorded) {
      await client.query('COMMIT')
        .then(() => {
          transactionFinished = true;
        })
        .catch(() => undefined);
    }
    if (!transactionFinished) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getOwnedTtsVoiceProfileTestPreviewPath(profileId: number, userId: number) {
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

  if (!profile.test_preview_file) {
    throw withStatus('Test preview is not available for this voice profile yet.', 404);
  }

  return {
    displayName: profile.display_name,
    filePath: resolvePrivateReferencePath(profile.test_preview_file),
  };
}

export async function setDefaultTtsVoiceProfile(profileId: number, userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [-Math.abs(profileId)]);

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

    if (profile.provider_sync_status !== 'ready' || !profile.provider_profile_id) {
      throw withStatus('Activate this voice before setting it as your default.', 409);
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
  let userDirectoryToClean: string | null = null;
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [-Math.abs(profileId)]);

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

    const blockingJobCount = await countBlockingJobsForVoiceProfile(client, profileId, userId);

    if (blockingJobCount > 0) {
      throw withStatus(
        'This voice is still attached to an active or preview-ready audio job. Cancel, finish, or delete those jobs before deleting the voice.',
        409,
      );
    }

    if (profile.provider_profile_id) {
      await deactivateProviderVoiceProfile(profile.provider_profile_id);
    }

    const profilePaths = getVoiceProfilePaths(profile);
    userDirectoryToClean = profilePaths.userDirectory;

    // Do not redact the database row until the private reference and previews
    // are gone. A filesystem failure remains visible and retryable to the owner.
    await fs.rm(profilePaths.profileDirectory, { force: true, recursive: true });

    const updatedResult = await client.query<TtsVoiceProfileRecord>(
      `
        UPDATE tts_voice_profiles
        SET
          is_active = FALSE,
          is_default = FALSE,
          provider_profile_id = NULL,
          provider_sync_status = 'pending',
          provider_sync_error = NULL,
          provider_sync_started_at = NULL,
          provider_deactivated_at = NOW(),
          reference_text = '[deleted]',
          reference_audio_seconds = NULL,
          reference_sample_rate = NULL,
          reference_audio_file = NULL,
          reference_audio_file_size_bytes = NULL,
          reference_normalized_at = NULL,
          reference_quality_warnings = '[]'::jsonb,
          test_preview_file = NULL,
          test_preview_audio_seconds = NULL,
          test_preview_generated_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [profileId, userId],
    );

    await client.query('COMMIT');
    transactionOpen = false;
    if (userDirectoryToClean) {
      await fs.rmdir(userDirectoryToClean).catch(() => undefined);
    }
    return updatedResult.rows[0];
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export function getTtsVoiceProfileLimits() {
  const config = getVoiceProfileConfig();

  return {
    maxActiveProfiles: config.maxActiveProfiles,
    maxAudioBytes: config.maxAudioBytes,
    maxAudioSeconds: maxReferenceAudioSeconds,
    minAudioSeconds: minReferenceAudioSeconds,
  };
}
