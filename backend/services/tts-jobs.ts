import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { PoolClient } from 'pg';
import {
  normalizeText,
  isCustomerEmailVerified,
  isCustomerPhoneVerified,
  privateMediaRoot,
  ttsJobsMediaDirectory,
} from '../core.ts';
import {
  pool,
  type TokenTransactionRecord,
  type TtsGenerationJobRecord,
  type TtsGenerationQualityPreset,
  type TtsGenerationJobSourceType,
  type TtsPronunciationRuleMatchType,
  type TtsPronunciationRuleRecord,
  type UserRecord,
} from '../db.ts';
import {
  resolveTtsVoiceSelectionForUser,
} from './tts-voice-profiles.ts';
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
  runMediaCommandForStdout as runCommandForStdout,
} from './process-runner.ts';

const defaultKeypillarTtsApiUrl = 'https://api.keypillar.org/v1/voice/generate';
const defaultKeypillarTtsBaseUrl = 'https://api.keypillar.org';
const defaultKeypillarTtsEndpoint = '/v1/voice/generate';
const defaultKeypillarTtsFormat = 'wav';
const defaultKeypillarTtsPronunciationMode = 'english_preserve';
const defaultKeypillarTtsVoiceId = 'keypillar-bd-female';
const defaultKeypillarTtsRequestTimeoutMs = 180_000;
const defaultTtsProviderRetryMaxAttempts = 6;
const defaultTtsProviderRetryBaseDelayMs = 30_000;
const defaultTtsProviderRetryMaxDelayMs = 300_000;
const defaultFfmpegPath = 'ffmpeg';
const defaultTtsChunkMaxChars = 1_200;
const defaultCustomVoiceChunkMaxChars = defaultTtsChunkMaxChars;
const defaultCustomVoiceProviderRequestMaxChars = defaultTtsChunkMaxChars;
const defaultMaxInputCharacters = 30_000;
const defaultPreviewDailyLimitPerUser = 10;
const defaultStarterDailyFullGenerationMinutes = 30;
const defaultPaidDailyFullGenerationMinutes = 600;
const defaultPdfExtractionTimeoutMs = 20_000;
const defaultPdfMaxExtractedCharacters = 60_000;
const defaultPdfMaxConcurrentExtractions = 2;
const maxActivePreviewJobsPerUser = 2;
const maxActiveGenerationJobsPerUser = 1;
const maxActiveTtsJobsPerUser = 3;
const chunkPauseMs = 220;
const headingPauseMs = 900;
const listItemPauseMs = 450;
const paragraphPauseMs = 800;
const sentencePauseMs = 340;
const customVoiceChunkPauseMs = chunkPauseMs;
const customVoiceHeadingPauseMs = headingPauseMs;
const customVoiceListItemPauseMs = listItemPauseMs;
const customVoiceParagraphPauseMs = paragraphPauseMs;
const customVoiceSentencePauseMs = sentencePauseMs;
const customVoiceProviderBoundaryPauseMs = chunkPauseMs;
const previewWordLimit = 85;
const maxPronunciationMatchLength = 200;
const maxPronunciationReplacementLength = 500;
const maxPronunciationNotesLength = 1_000;
const pdfExtractionTimeoutMs = readBoundedIntegerEnv(
  'TTS_PDF_EXTRACTION_TIMEOUT_MS',
  defaultPdfExtractionTimeoutMs,
  5_000,
  60_000,
);
const pdfMaxExtractedCharacters = readBoundedIntegerEnv(
  'TTS_PDF_MAX_EXTRACTED_CHARS',
  defaultPdfMaxExtractedCharacters,
  30_000,
  250_000,
);
const pdfMaxConcurrentExtractions = readBoundedIntegerEnv(
  'TTS_PDF_MAX_CONCURRENT_EXTRACTIONS',
  defaultPdfMaxConcurrentExtractions,
  1,
  4,
);
let activePdfExtractions = 0;

type SpeechSegment = {
  pauseAfterMs: number;
  text: string;
};

type AudioMergePart = {
  filePath: string;
  pauseAfterMs: number;
};

type AudioStreamFormat = {
  channels: number;
  sampleRate: number;
};

type SpeechProfile = {
  allowClauseFallback: boolean;
  chunkMaxChars: number;
  chunkPauseMs: number;
  headingPauseMs: number;
  listItemPauseMs: number;
  paragraphPauseMs: number;
  sentencePauseMs: number;
};

const ttsQualityPresets: Record<TtsGenerationQualityPreset, { label: string; mp3BitrateKbps: number | null }> = {
  high_mp3_wav: {
    label: 'High MP3 192 kbps + WAV',
    mp3BitrateKbps: 192,
  },
  premium_mp3_wav: {
    label: 'Premium MP3 320 kbps + WAV',
    mp3BitrateKbps: 320,
  },
  standard_mp3_wav: {
    label: 'Standard MP3 128 kbps + WAV',
    mp3BitrateKbps: 128,
  },
  wav_only: {
    label: 'WAV only',
    mp3BitrateKbps: null,
  },
};

const workerLeaderLockKey: [number, number] = [1_264_572_754, 1_414_809_943];
let workerStarted = false;
let workerStopping = false;
let workerRunning = false;
let workerTimer: NodeJS.Timeout | null = null;
let workerCyclePromise: Promise<void> | null = null;
let workerLeaderClient: PoolClient | null = null;
let workerLeaderErrorHandler: ((error: Error) => void) | null = null;

type ServiceError = Error & {
  providerRetryable?: boolean;
  statusCode?: number;
};

function withStatus(message: string, statusCode: number, options?: { providerRetryable?: boolean }) {
  const error = new Error(message);
  (error as ServiceError).statusCode = statusCode;
  (error as ServiceError).providerRetryable = options?.providerRetryable;
  return error;
}

function safeGenerationFailureMessage() {
  return 'Voice generation failed. Please try again.';
}

function getStatusCode(error: unknown, fallback = 400) {
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  return fallback;
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

function normalizeInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function getRuntimeConfig() {
  const apiKey = normalizeText(process.env.KEYPILLAR_TTS_API_KEY);
  const configuredApiUrl = normalizeText(process.env.KEYPILLAR_TTS_API_URL);
  const baseUrl = normalizeText(process.env.KEYPILLAR_TTS_BASE_URL) ?? defaultKeypillarTtsBaseUrl;
  const endpoint = normalizeText(process.env.KEYPILLAR_TTS_ENDPOINT) ?? defaultKeypillarTtsEndpoint;
  const apiUrl = configuredApiUrl ?? new URL(endpoint, `${baseUrl.replace(/\/+$/, '')}/`).toString() ?? defaultKeypillarTtsApiUrl;
  const format = defaultKeypillarTtsFormat;
  const pronunciationMode =
    normalizeText(process.env.KEYPILLAR_TTS_PRONUNCIATION_MODE) ?? defaultKeypillarTtsPronunciationMode;
  const voiceId = normalizeText(process.env.KEYPILLAR_TTS_VOICE_ID) ?? defaultKeypillarTtsVoiceId;
  const ffmpegPath = normalizeText(process.env.FFMPEG_PATH) ?? defaultFfmpegPath;
  const configuredChunkMaxChars = Number(process.env.TTS_CHUNK_MAX_CHARS ?? defaultTtsChunkMaxChars);
  const configuredCustomVoiceChunkMaxChars = Number(
    process.env.TTS_CUSTOM_VOICE_CHUNK_MAX_CHARS ?? defaultCustomVoiceChunkMaxChars,
  );
  const configuredCustomVoiceProviderRequestMaxChars = Number(
    process.env.TTS_CUSTOM_VOICE_PROVIDER_REQUEST_MAX_CHARS ?? defaultCustomVoiceProviderRequestMaxChars,
  );
  const requestTimeoutMs = normalizeTimeoutMs(
    process.env.KEYPILLAR_TTS_REQUEST_TIMEOUT_MS,
    defaultKeypillarTtsRequestTimeoutMs,
  );
  const providerRetryMaxAttempts = normalizeInteger(
    process.env.TTS_PROVIDER_RETRY_MAX_ATTEMPTS,
    defaultTtsProviderRetryMaxAttempts,
    1,
    20,
  );
  const providerRetryBaseDelayMs = normalizeInteger(
    process.env.TTS_PROVIDER_RETRY_BASE_DELAY_MS,
    defaultTtsProviderRetryBaseDelayMs,
    1_000,
    600_000,
  );
  const providerRetryMaxDelayMs = normalizeInteger(
    process.env.TTS_PROVIDER_RETRY_MAX_DELAY_MS,
    defaultTtsProviderRetryMaxDelayMs,
    providerRetryBaseDelayMs,
    1_800_000,
  );
  const maxInputCharacters = readBoundedIntegerEnv(
    'TTS_MAX_INPUT_CHARACTERS',
    defaultMaxInputCharacters,
    1_000,
    120_000,
  );
  const previewDailyLimitPerUser = readBoundedIntegerEnv(
    'TTS_PREVIEW_DAILY_LIMIT_PER_USER',
    defaultPreviewDailyLimitPerUser,
    1,
    100,
  );
  const starterDailyFullGenerationMinutes = readBoundedIntegerEnv(
    'TTS_STARTER_DAILY_FULL_GENERATION_MINUTES',
    defaultStarterDailyFullGenerationMinutes,
    1,
    10_000,
  );
  const paidDailyFullGenerationMinutes = readBoundedIntegerEnv(
    'TTS_PAID_DAILY_FULL_GENERATION_MINUTES',
    defaultPaidDailyFullGenerationMinutes,
    1,
    100_000,
  );

  return {
    apiKey,
    apiUrl,
    chunkMaxChars: Number.isFinite(configuredChunkMaxChars) && configuredChunkMaxChars >= 300
      ? Math.floor(configuredChunkMaxChars)
      : defaultTtsChunkMaxChars,
    customVoiceChunkMaxChars: Number.isFinite(configuredCustomVoiceChunkMaxChars) &&
      configuredCustomVoiceChunkMaxChars >= 300 &&
      configuredCustomVoiceChunkMaxChars <= 12_000
      ? Math.floor(configuredCustomVoiceChunkMaxChars)
      : defaultCustomVoiceChunkMaxChars,
    customVoiceProviderRequestMaxChars: Number.isFinite(configuredCustomVoiceProviderRequestMaxChars) &&
      configuredCustomVoiceProviderRequestMaxChars >= 300 &&
      configuredCustomVoiceProviderRequestMaxChars <= 12_000
      ? Math.floor(configuredCustomVoiceProviderRequestMaxChars)
      : defaultCustomVoiceProviderRequestMaxChars,
    ffmpegPath,
    format,
    maxInputCharacters,
    paidDailyFullGenerationMinutes,
    pronunciationMode,
    previewDailyLimitPerUser,
    providerRetryBaseDelayMs,
    providerRetryMaxAttempts,
    providerRetryMaxDelayMs,
    requestTimeoutMs,
    starterDailyFullGenerationMinutes,
    voiceId,
  };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
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
      throw withStatus(timeoutMessage, 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveTtsQualityPreset(value?: string | null) {
  const preset = normalizeText(value) as TtsGenerationQualityPreset | undefined;

  if (!preset) {
    return {
      preset: 'premium_mp3_wav' as const,
      ...ttsQualityPresets.premium_mp3_wav,
    };
  }

  if (Object.prototype.hasOwnProperty.call(ttsQualityPresets, preset)) {
    return {
      preset,
      ...ttsQualityPresets[preset],
    };
  }

  throw withStatus('Choose a valid download quality.', 400);
}

function normalizeGenerationText(value: string) {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    throw withStatus('Text input is required.', 400);
  }

  const maxInputCharacters = getRuntimeConfig().maxInputCharacters;

  if (normalized.length > maxInputCharacters) {
    throw withStatus(`Text input must stay under ${maxInputCharacters.toLocaleString()} characters.`, 400);
  }

  return normalized;
}

export function countBillableWordsForTts(inputText: string) {
  const normalized = normalizeGenerationText(inputText);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    throw withStatus('Text input is required.', 400);
  }

  return words.length;
}

function sanitizeSourceName(value: string | null) {
  return value?.slice(0, 180) ?? null;
}

function buildSourceLabel(job: Pick<TtsGenerationJobRecord, 'id' | 'source_name' | 'source_type'>) {
  if (job.source_name) {
    return job.source_name;
  }

  return job.source_type === 'pdf' ? `PDF generation #${job.id}` : `Text generation #${job.id}`;
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

function getJobPaths(job: Pick<TtsGenerationJobRecord, 'id' | 'source_name' | 'source_type' | 'user_id'>) {
  const userDirectory = path.join(ttsJobsMediaDirectory, `user-${job.user_id}`);
  const jobDirectory = path.join(userDirectory, `job-${job.id}`);
  const tempDirectory = path.join(jobDirectory, 'tmp');
  const safeStem = slugifyStem(buildSourceLabel(job)) || `job-${job.id}`;

  return {
    jobDirectory,
    mp3AbsolutePath: path.join(jobDirectory, `${safeStem}.mp3`),
    mp3RelativePath: path.relative(privateMediaRoot, path.join(jobDirectory, `${safeStem}.mp3`)),
    previewAbsolutePath: path.join(jobDirectory, `${safeStem}-preview.wav`),
    previewRelativePath: path.relative(privateMediaRoot, path.join(jobDirectory, `${safeStem}-preview.wav`)),
    tempDirectory,
    userDirectory,
    wavAbsolutePath: path.join(jobDirectory, `${safeStem}.wav`),
    wavRelativePath: path.relative(privateMediaRoot, path.join(jobDirectory, `${safeStem}.wav`)),
  };
}

function isActiveJobStatus(status: TtsGenerationJobRecord['status']) {
  return status === 'queued' ||
    status === 'processing' ||
    status === 'preview_queued' ||
    status === 'preview_processing' ||
    status === 'cancelling';
}

function splitSegmentByWords(segment: string, maxChars: number) {
  const words = segment.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    for (let index = 0; index < word.length; index += maxChars) {
      chunks.push(word.slice(index, index + maxChars));
    }
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function combineUnitsIntoChunks(units: string[], maxChars: number) {
  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    if (unit.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      chunks.push(...splitSegmentByWords(unit, maxChars));
      continue;
    }

    const next = current ? `${current} ${unit}` : unit;

    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = unit;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitSegmentBySentences(segment: string, maxChars: number, allowClauseFallback = false) {
  const sentenceUnits = segment
    .split(/(?<=[.!?।])\s+/u)
    .map((value) => value.trim())
    .filter(Boolean);

  if (sentenceUnits.length > 1) {
    return combineUnitsIntoChunks(sentenceUnits, maxChars);
  }

  if (allowClauseFallback) {
    const clauseUnits = segment
      .split(/(?<=[,;:،؛，、])\s+/u)
      .map((value) => value.trim())
      .filter(Boolean);

    if (clauseUnits.length > 1) {
      return combineUnitsIntoChunks(clauseUnits, maxChars);
    }
  }

  return splitSegmentByWords(segment, maxChars);
}

function splitTextIntoSentences(segment: string) {
  const matches = segment.match(/[^.!?।]+[.!?।]+(?:["'”’)\]]+)?|[^.!?।]+$/gu) ?? [];
  return matches.map((value) => value.trim()).filter(Boolean);
}

function stripListMarker(value: string) {
  return value
    .replace(/^\s*(?:[-*•‣◦]|\d+[.)]|[a-zA-Z][.)])\s+/u, '')
    .trim();
}

function isListItem(value: string) {
  return /^\s*(?:[-*•‣◦]|\d+[.)]|[a-zA-Z][.)])\s+\S/u.test(value);
}

function isLikelyHeading(value: string) {
  const normalized = value.trim();

  if (!normalized || /[.!?।]$/.test(normalized)) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return normalized.length <= 90 && wordCount <= 12;
}

function normalizeComparablePdfLine(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isStandalonePdfPageNumber(value: string) {
  const normalized = value.trim();
  return /^\d{1,4}$/.test(normalized) || /^page\s+\d{1,4}(?:\s+(?:of|\/)\s+\d{1,4})?$/i.test(normalized);
}

function getPageEdgeLineKeys(lines: string[]) {
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const edgeLines = [
    ...nonEmptyLines.slice(0, 3),
    ...nonEmptyLines.slice(Math.max(0, nonEmptyLines.length - 3)),
  ];

  return new Set(
    edgeLines
      .filter((line) => line.length <= 120 && !isStandalonePdfPageNumber(line))
      .map(normalizeComparablePdfLine)
      .filter(Boolean),
  );
}

function findRepeatedPdfEdgeLines(pages: string[]) {
  if (pages.length < 3) {
    return new Set<string>();
  }

  const counts = new Map<string, number>();

  for (const page of pages) {
    const pageKeys = getPageEdgeLineKeys(page.split('\n'));

    for (const key of pageKeys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minimumCount = Math.ceil(pages.length * 0.6);
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= minimumCount)
      .map(([key]) => key),
  );
}

function shouldMergePdfWrappedLines(previous: string, current: string) {
  if (!previous || !current) {
    return false;
  }

  if (isListItem(previous) || isListItem(current)) {
    return false;
  }

  if (isLikelyHeading(previous) || isLikelyHeading(current)) {
    return false;
  }

  if (/[.!?।:;]$/.test(previous.trim())) {
    return false;
  }

  return previous.trim().length >= 45;
}

function mergePdfHardWrappedLines(value: string) {
  const outputLines: string[] = [];

  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      if (outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      continue;
    }

    const previous = outputLines[outputLines.length - 1] ?? '';

    if (shouldMergePdfWrappedLines(previous, line)) {
      outputLines[outputLines.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    outputLines.push(line);
  }

  return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanExtractedPdfText(rawText: string) {
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\f+/g, '\n\f\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
  const pages = normalized
    .split(/\n?\f\n?/)
    .map((page) => page.trim())
    .filter(Boolean);
  const repeatedEdgeLineKeys = findRepeatedPdfEdgeLines(pages);
  const cleanedPages = (pages.length > 0 ? pages : [normalized])
    .map((page) => {
      const lines = page
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
          if (!line) {
            return true;
          }

          if (isStandalonePdfPageNumber(line)) {
            return false;
          }

          return !repeatedEdgeLineKeys.has(normalizeComparablePdfLine(line));
        });

      return lines.join('\n').trim();
    })
    .filter(Boolean);

  return mergePdfHardWrappedLines(
    cleanedPages
      .join('\n\n')
      .replace(/(\p{L})-\n(\p{L})/gu, '$1$2'),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPronunciationPattern(matchText: string, matchType: TtsPronunciationRuleMatchType) {
  const escaped = escapeRegExp(matchText.trim()).replace(/\s+/g, '\\s+');

  if (!escaped) {
    return null;
  }

  if (matchType === 'whole_word') {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
  }

  return new RegExp(escaped, 'giu');
}

function normalizeRequiredPronunciationText(
  value: string | null,
  fieldName: string,
  maxLength: number,
) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw withStatus(`${fieldName} is required.`, 400);
  }

  if (normalized.length > maxLength) {
    throw withStatus(`${fieldName} must stay under ${maxLength.toLocaleString()} characters.`, 400);
  }

  return normalized;
}

function normalizePronunciationNotes(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (normalized && normalized.length > maxPronunciationNotesLength) {
    throw withStatus(`Notes must stay under ${maxPronunciationNotesLength.toLocaleString()} characters.`, 400);
  }

  return normalized;
}

function resolvePronunciationMatchType(value: string | null | undefined) {
  if (!value || value === 'phrase') {
    return 'phrase' as const;
  }

  if (value === 'whole_word') {
    return 'whole_word' as const;
  }

  throw withStatus('Choose phrase or whole_word matching.', 400);
}

export async function listTtsPronunciationRules() {
  const result = await pool.query<TtsPronunciationRuleRecord>(
    `
      SELECT *
      FROM tts_pronunciation_rules
      ORDER BY is_active DESC, match_text ASC, id ASC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function createTtsPronunciationRule(input: {
  isActive?: boolean;
  matchText: string;
  matchType: string | null;
  notes?: string | null;
  replacementText: string;
}) {
  const matchText = normalizeRequiredPronunciationText(
    input.matchText,
    'Match text',
    maxPronunciationMatchLength,
  );
  const replacementText = normalizeRequiredPronunciationText(
    input.replacementText,
    'Replacement text',
    maxPronunciationReplacementLength,
  );
  const matchType = resolvePronunciationMatchType(input.matchType);

  const result = await pool.query<TtsPronunciationRuleRecord>(
    `
      INSERT INTO tts_pronunciation_rules (
        match_text,
        replacement_text,
        match_type,
        is_active,
        notes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [matchText, replacementText, matchType, input.isActive ?? true, normalizePronunciationNotes(input.notes)],
  );

  return result.rows[0];
}

export async function updateTtsPronunciationRule(
  ruleId: number,
  input: {
    isActive?: boolean;
    matchText?: string;
    matchType?: string | null;
    notes?: string | null;
    replacementText?: string;
  },
) {
  const existingResult = await pool.query<TtsPronunciationRuleRecord>(
    `
      SELECT *
      FROM tts_pronunciation_rules
      WHERE id = $1
      LIMIT 1
    `,
    [ruleId],
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    throw withStatus('Pronunciation rule not found.', 404);
  }

  const matchText = input.matchText === undefined
    ? existing.match_text
    : normalizeRequiredPronunciationText(input.matchText, 'Match text', maxPronunciationMatchLength);
  const replacementText = input.replacementText === undefined
    ? existing.replacement_text
    : normalizeRequiredPronunciationText(
        input.replacementText,
        'Replacement text',
        maxPronunciationReplacementLength,
      );
  const matchType = input.matchType === undefined
    ? existing.match_type
    : resolvePronunciationMatchType(input.matchType);

  const result = await pool.query<TtsPronunciationRuleRecord>(
    `
      UPDATE tts_pronunciation_rules
      SET
        match_text = $2,
        replacement_text = $3,
        match_type = $4,
        is_active = $5,
        notes = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      ruleId,
      matchText,
      replacementText,
      matchType,
      input.isActive === undefined ? existing.is_active : input.isActive,
      input.notes === undefined ? existing.notes : normalizePronunciationNotes(input.notes),
    ],
  );

  return result.rows[0];
}

export async function deleteTtsPronunciationRule(ruleId: number) {
  const result = await pool.query<TtsPronunciationRuleRecord>(
    `
      DELETE FROM tts_pronunciation_rules
      WHERE id = $1
      RETURNING *
    `,
    [ruleId],
  );

  if (!result.rows[0]) {
    throw withStatus('Pronunciation rule not found.', 404);
  }

  return result.rows[0];
}

export async function applyActivePronunciationRules(inputText: string) {
  const rulesResult = await pool.query<TtsPronunciationRuleRecord>(
    `
      SELECT *
      FROM tts_pronunciation_rules
      WHERE is_active = TRUE
      ORDER BY LENGTH(match_text) DESC, id ASC
      LIMIT 500
    `,
  );
  let outputText = inputText;

  for (const rule of rulesResult.rows) {
    const pattern = buildPronunciationPattern(rule.match_text, rule.match_type);

    if (!pattern) {
      continue;
    }

    outputText = outputText.replace(pattern, rule.replacement_text);

    if (outputText.length > getRuntimeConfig().maxInputCharacters) {
      throw withStatus('Pronunciation rules expanded the text beyond the generation limit.', 500);
    }
  }

  return outputText;
}

function getFixedSpeechProfile(config = getRuntimeConfig()): SpeechProfile {
  return {
    allowClauseFallback: false,
    chunkMaxChars: config.chunkMaxChars,
    chunkPauseMs,
    headingPauseMs,
    listItemPauseMs,
    paragraphPauseMs,
    sentencePauseMs,
  };
}

function getCustomVoiceSpeechProfile(config = getRuntimeConfig()): SpeechProfile {
  return {
    allowClauseFallback: false,
    chunkMaxChars: config.customVoiceChunkMaxChars,
    chunkPauseMs: customVoiceChunkPauseMs,
    headingPauseMs: customVoiceHeadingPauseMs,
    listItemPauseMs: customVoiceListItemPauseMs,
    paragraphPauseMs: customVoiceParagraphPauseMs,
    sentencePauseMs: customVoiceSentencePauseMs,
  };
}

function getSpeechProfileForJob(job: Pick<TtsGenerationJobRecord, 'provider_voice_profile_id'>) {
  return job.provider_voice_profile_id ? getCustomVoiceSpeechProfile() : getFixedSpeechProfile();
}

function addSpeechTextSegment(segments: SpeechSegment[], text: string, pauseAfterMs: number, speechProfile: SpeechProfile) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return;
  }

  if (normalized.length <= speechProfile.chunkMaxChars) {
    segments.push({ pauseAfterMs, text: normalized });
    return;
  }

  const parts = splitSegmentBySentences(
    normalized,
    speechProfile.chunkMaxChars,
    speechProfile.allowClauseFallback,
  );

  for (const [index, part] of parts.entries()) {
    segments.push({
      pauseAfterMs: index === parts.length - 1 ? pauseAfterMs : speechProfile.chunkPauseMs,
      text: part,
    });
  }
}

function addSentenceSpeechSegments(
  segments: SpeechSegment[],
  sentences: string[],
  pauseAfterMs: number,
  speechProfile: SpeechProfile,
) {
  let current = '';

  const flushCurrent = (nextPauseAfterMs: number) => {
    if (!current.trim()) {
      return;
    }

    segments.push({
      pauseAfterMs: nextPauseAfterMs,
      text: current.replace(/\s+/g, ' ').trim(),
    });
    current = '';
  };

  for (const sentence of sentences) {
    const normalizedSentence = sentence.replace(/\s+/g, ' ').trim();

    if (!normalizedSentence) {
      continue;
    }

    if (normalizedSentence.length > speechProfile.chunkMaxChars) {
      flushCurrent(speechProfile.sentencePauseMs);
      addSpeechTextSegment(segments, normalizedSentence, speechProfile.sentencePauseMs, speechProfile);
      continue;
    }

    const candidate = current ? `${current} ${normalizedSentence}` : normalizedSentence;

    if (candidate.length <= speechProfile.chunkMaxChars) {
      current = candidate;
      continue;
    }

    flushCurrent(speechProfile.sentencePauseMs);
    current = normalizedSentence;
  }

  if (current.trim()) {
    flushCurrent(pauseAfterMs);
  } else if (segments.length > 0) {
    segments[segments.length - 1].pauseAfterMs = pauseAfterMs;
  }
}

function addParagraphSpeechSegments(segments: SpeechSegment[], paragraph: string, speechProfile: SpeechProfile) {
  const lines = paragraph
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  if (lines.every(isListItem)) {
    for (const [index, line] of lines.entries()) {
      addSpeechTextSegment(
        segments,
        stripListMarker(line),
        index === lines.length - 1 ? speechProfile.paragraphPauseMs : speechProfile.listItemPauseMs,
        speechProfile,
      );
    }
    return;
  }

  const paragraphText = lines.join(' ').trim();

  if (isLikelyHeading(paragraphText)) {
    addSpeechTextSegment(segments, paragraphText, speechProfile.headingPauseMs, speechProfile);
    return;
  }

  const sentences = splitTextIntoSentences(paragraphText);

  if (sentences.length === 0) {
    addSpeechTextSegment(segments, paragraphText, speechProfile.paragraphPauseMs, speechProfile);
    return;
  }

  addSentenceSpeechSegments(segments, sentences, speechProfile.paragraphPauseMs, speechProfile);
}

function prepareSpeechSegmentsForTts(inputText: string, speechProfile: SpeechProfile) {
  const normalized = normalizeGenerationText(inputText);
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const segments: SpeechSegment[] = [];

  for (const paragraph of paragraphs) {
    addParagraphSpeechSegments(segments, paragraph, speechProfile);
  }

  const finalSegments = segments.filter((segment) => segment.text);

  if (finalSegments.length > 0) {
    finalSegments[finalSegments.length - 1].pauseAfterMs = 0;
  }

  return finalSegments;
}

function normalizeProviderParagraph(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function splitOversizedProviderParagraph(paragraph: string, maxChars: number) {
  const normalized = normalizeProviderParagraph(paragraph);

  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChars) {
    return [normalized];
  }

  return splitSegmentBySentences(normalized, maxChars, true);
}

function prepareCustomVoiceProviderSegments(inputText: string, maxChars: number) {
  const normalized = normalizeGenerationText(inputText);
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const providerMaxChars = Math.max(1_000, Math.min(12_000, Math.floor(maxChars)));
  const segments: SpeechSegment[] = [];
  let current = '';

  const flushCurrent = (pauseAfterMs = customVoiceProviderBoundaryPauseMs) => {
    if (!current.trim()) {
      return;
    }

    segments.push({
      pauseAfterMs,
      text: current.trim(),
    });
    current = '';
  };

  for (const paragraph of paragraphs) {
    const paragraphParts = splitOversizedProviderParagraph(paragraph, providerMaxChars);

    for (const part of paragraphParts) {
      const candidate = current ? `${current}\n\n${part}` : part;

      if (candidate.length <= providerMaxChars) {
        current = candidate;
        continue;
      }

      flushCurrent();
      current = part;
    }
  }

  flushCurrent(0);

  if (segments.length > 0) {
    segments[segments.length - 1].pauseAfterMs = 0;
  }

  return segments;
}

function prepareFullSpeechSegmentsForJob(inputText: string, job: Pick<TtsGenerationJobRecord, 'provider_voice_profile_id'>) {
  return prepareSpeechSegmentsForTts(inputText, getSpeechProfileForJob(job));
}

function countWordsInSegment(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function takeFirstWords(value: string, wordLimit: number) {
  return value.split(/\s+/).filter(Boolean).slice(0, wordLimit).join(' ');
}

function preparePreviewSpeechSegments(inputText: string, speechProfile: SpeechProfile) {
  const fullSegments = prepareSpeechSegmentsForTts(inputText, speechProfile);
  const previewSegments: SpeechSegment[] = [];
  let remainingWords = previewWordLimit;

  for (const segment of fullSegments) {
    if (remainingWords <= 0) {
      break;
    }

    const segmentWordCount = countWordsInSegment(segment.text);

    if (segmentWordCount <= remainingWords) {
      previewSegments.push({ ...segment });
      remainingWords -= segmentWordCount;
      continue;
    }

    const slicedText = takeFirstWords(segment.text, remainingWords);

    if (slicedText) {
      previewSegments.push({
        pauseAfterMs: 0,
        text: slicedText,
      });
    }

    break;
  }

  if (previewSegments.length > 0) {
    previewSegments[previewSegments.length - 1].pauseAfterMs = 0;
  }

  return previewSegments;
}

function getJsonValueCandidates(payload: unknown, pathSegments: string[]): unknown {
  let current = payload;

  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractBase64AudioPayload(payload: unknown) {
  const candidatePaths = [
    ['audio'],
    ['audioBase64'],
    ['audio_base64'],
    ['audioContent'],
    ['wav'],
    ['data', 'audio'],
    ['data', 'audioBase64'],
    ['data', 'audio_base64'],
    ['data', 'audioContent'],
    ['result', 'audio'],
    ['result', 'audioBase64'],
    ['result', 'audio_base64'],
    ['result', 'audioContent'],
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
    ['url'],
    ['audioUrl'],
    ['audio_url'],
    ['audio'],
    ['data', 'url'],
    ['data', 'audioUrl'],
    ['data', 'audio_url'],
    ['data', 'audio'],
    ['result', 'url'],
    ['result', 'audioUrl'],
    ['result', 'audio_url'],
    ['result', 'audio'],
  ];

  for (const candidatePath of candidatePaths) {
    const value = getJsonValueCandidates(payload, candidatePath);

    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function shouldRetryAudioFetch(statusCode: number) {
  return statusCode === 404 || statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

async function fetchAudioUrlWithRetry(audioUrl: string, config: ReturnType<typeof getRuntimeConfig>) {
  const delaysMs = [0, 500, 1_000, 1_500, 2_500, 4_000];
  let lastStatusCode: number | null = null;
  let lastFailureWasRetryable = false;

  for (const [attemptIndex, delayMs] of delaysMs.entries()) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    let response: Response;

    try {
      response = await fetchSafeProviderAudio({
        apiKey: config.apiKey,
        audioUrl,
        baseHeaders: {
          Accept: 'audio/wav,audio/*,application/octet-stream,*/*',
        },
        providerApiUrl: config.apiUrl,
        timeoutMs: config.requestTimeoutMs,
      });
    } catch (error) {
      const statusCode = getStatusCode(error, 0);

      if (statusCode === 504 || error instanceof TypeError) {
        throw withStatus(
          error instanceof Error ? error.message : 'Generated audio could not be downloaded from the voice service.',
          statusCode || 502,
          { providerRetryable: true },
        );
      }

      throw error;
    }

    if (response.ok) {
      return readResponseBufferWithLimit(response);
    }

    lastStatusCode = response.status;
    lastFailureWasRetryable = shouldRetryAudioFetch(response.status);
    await response.body?.cancel().catch(() => undefined);

    const hasMoreAttempts = attemptIndex < delaysMs.length - 1;
    if (!hasMoreAttempts || !shouldRetryAudioFetch(response.status)) {
      break;
    }
  }

  throw withStatus(
    `Audio fetch failed with status ${lastStatusCode ?? 'unknown'}.`,
    502,
    { providerRetryable: lastFailureWasRetryable },
  );
}

async function fetchAudioFromJsonPayload(payload: unknown, config: ReturnType<typeof getRuntimeConfig>) {
  const directAudio = extractBase64AudioPayload(payload);

  if (directAudio) {
    return directAudio;
  }

  const audioUrl = extractAudioUrlFromPayload(payload);

  if (audioUrl) {
    return fetchAudioUrlWithRetry(audioUrl, config);
  }

  throw withStatus('Keypillar TTS response did not include downloadable audio.', 502);
}

function getProviderIdempotencyKey(job: TtsGenerationJobRecord, text: string, segmentIndex: number) {
  const phase = job.status === 'preview_processing' ? 'preview' : 'full';
  const textDigest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `website-tts-${job.id}-${phase}-${segmentIndex + 1}-${textDigest}`;
}

async function generateWavChunk(text: string, job: TtsGenerationJobRecord, segmentIndex: number) {
  const config = getRuntimeConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const providerVoiceProfileId = job.provider_voice_profile_id ?? 'fixed';

  let response: Response;

  try {
    response = await fetchWithTimeout(
      config.apiUrl,
      {
        body: JSON.stringify({
          format: config.format,
          pronunciation_mode: config.pronunciationMode,
          speed: 1.0,
          text,
          voice: job.provider_voice || config.voiceId,
          voice_profile_id: providerVoiceProfileId,
        }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': getProviderIdempotencyKey(job, text, segmentIndex),
        },
        method: 'POST',
      },
      config.requestTimeoutMs,
      `Keypillar TTS request timed out after ${Math.round(config.requestTimeoutMs / 1_000)} seconds.`,
    );
  } catch (error) {
    const statusCode = getStatusCode(error, 0);

    if (statusCode === 504 || error instanceof TypeError) {
      throw withStatus(
        error instanceof Error ? error.message : 'Keypillar TTS request could not reach the voice service.',
        statusCode || 502,
        { providerRetryable: true },
      );
    }

    throw error;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw withStatus(
      `Keypillar TTS request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
      502,
      {
        providerRetryable: response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500,
      },
    );
  }

  if (contentType.includes('audio') || contentType.includes('octet-stream')) {
    return readResponseBufferWithLimit(response);
  }

  if (contentType.includes('json')) {
    return fetchAudioFromJsonPayload(await response.json(), config);
  }

  const rawBody = await response.text();
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    throw withStatus('Keypillar TTS returned an unsupported response format.', 502);
  }

  return fetchAudioFromJsonPayload(parsedPayload, config);
}

function resolveFfprobePath(ffmpegPath: string) {
  if (ffmpegPath === defaultFfmpegPath) {
    return 'ffprobe';
  }

  return path.join(path.dirname(ffmpegPath), path.basename(ffmpegPath).replace(/ffmpeg$/, 'ffprobe'));
}

async function getAudioDurationSeconds(inputPath: string) {
  const config = getRuntimeConfig();
  const stdout = await runCommandForStdout(resolveFfprobePath(config.ffmpegPath), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const durationSeconds = Number(stdout.trim());

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw withStatus('Generated audio duration could not be measured.', 500);
  }

  return durationSeconds;
}

async function getAudioStreamFormat(inputPath: string): Promise<AudioStreamFormat> {
  const config = getRuntimeConfig();
  const stdout = await runCommandForStdout(resolveFfprobePath(config.ffmpegPath), [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=sample_rate,channels',
    '-of',
    'json',
    inputPath,
  ]);
  const payload = JSON.parse(stdout) as {
    streams?: Array<{
      channels?: number;
      sample_rate?: string;
    }>;
  };
  const stream = payload.streams?.[0];
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(channels) || channels <= 0) {
    throw withStatus('Generated audio stream format could not be measured.', 500);
  }

  return {
    channels,
    sampleRate,
  };
}

function calculateBillableMinutes(audioSeconds: number) {
  return Math.max(1, Math.ceil(audioSeconds / 60));
}

function calculateEstimatedMinutesFromWords(wordCount: number) {
  return wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 150)) : 0;
}

function getFfmpegChannelLayout(channels: number) {
  if (channels === 1) {
    return 'mono';
  }

  if (channels === 2) {
    return 'stereo';
  }

  return 'mono';
}

async function createSilenceWav(outputPath: string, durationMs: number, format: AudioStreamFormat) {
  await runCommand(getRuntimeConfig().ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${format.sampleRate}:cl=${getFfmpegChannelLayout(format.channels)}`,
    '-t',
    (durationMs / 1_000).toFixed(3),
    '-ac',
    String(format.channels),
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
}

function escapeConcatPath(filePath: string) {
  return filePath.replace(/'/g, `'\\''`);
}

async function mergeWavChunks(parts: AudioMergePart[], outputPath: string, tempDirectory: string) {
  if (parts.length === 0) {
    throw withStatus('No generated audio chunks were produced.', 500);
  }

  if (parts.length === 1 && parts[0].pauseAfterMs <= 0) {
    await fs.copyFile(parts[0].filePath, outputPath);
    return;
  }

  const audioFormat = await getAudioStreamFormat(parts[0].filePath);
  const mergePaths: string[] = [];

  for (const [index, part] of parts.entries()) {
    mergePaths.push(part.filePath);

    if (part.pauseAfterMs <= 0 || index === parts.length - 1) {
      continue;
    }

    const silencePath = path.join(tempDirectory, `silence-${String(index + 1).padStart(3, '0')}.wav`);
    await createSilenceWav(silencePath, part.pauseAfterMs, audioFormat);
    mergePaths.push(silencePath);
  }

  const listPath = `${outputPath}.concat.txt`;
  const concatFileContents = mergePaths
    .map((filePath) => `file '${escapeConcatPath(filePath)}'`)
    .join('\n');

  await fs.writeFile(listPath, concatFileContents, 'utf8');

  try {
    await runCommand(getRuntimeConfig().ffmpegPath, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:a',
      'pcm_s16le',
      outputPath,
    ]);
  } finally {
    await fs.unlink(listPath).catch(() => undefined);
  }
}

async function convertWavToMp3(inputPath: string, outputPath: string, bitrateKbps: number) {
  const config = getRuntimeConfig();

  await runCommand(config.ffmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-codec:a',
    'libmp3lame',
    '-b:a',
    `${bitrateKbps}k`,
    outputPath,
  ]);
}

function resolvePrivateTtsPath(relativePath: string) {
  const resolvedPath = path.resolve(privateMediaRoot, relativePath);
  const allowedRoot = path.resolve(ttsJobsMediaDirectory);

  if (resolvedPath !== allowedRoot && !resolvedPath.startsWith(`${allowedRoot}${path.sep}`)) {
    throw withStatus('Audio output path is invalid.', 500);
  }

  return resolvedPath;
}

function getOwnedDownloadPath(job: Pick<TtsGenerationJobRecord, 'mp3_file' | 'wav_file'>, format: 'mp3' | 'wav') {
  const relativePath = format === 'mp3' ? job.mp3_file : job.wav_file;

  if (!relativePath) {
    throw withStatus(`${format.toUpperCase()} output is not available for this job yet.`, 409);
  }

  return resolvePrivateTtsPath(relativePath);
}

function getOwnedPreviewPath(job: Pick<TtsGenerationJobRecord, 'preview_file'>) {
  if (!job.preview_file) {
    throw withStatus('Preview audio is not available for this job yet.', 409);
  }

  return resolvePrivateTtsPath(job.preview_file);
}

async function removeGeneratedAudioFiles(filePaths: string[]) {
  await Promise.all(filePaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
}

async function assertFileExists(filePath: string, message: string) {
  try {
    await fs.access(filePath);
  } catch {
    throw withStatus(message, 503);
  }
}

async function updateJobStage(jobId: number, stage: string) {
  await pool.query(
    `
      UPDATE tts_generation_jobs
      SET
        processing_stage = $2,
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('processing', 'preview_processing')
    `,
    [jobId, stage],
  );
}

async function isJobCancellationRequested(jobId: number) {
  const result = await pool.query<{ status: string }>(
    `
      SELECT status
      FROM tts_generation_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );

  return result.rows[0]?.status === 'cancelling' || result.rows[0]?.status === 'cancelled';
}

async function markJobCancelled(jobId: number, reason = 'Cancelled by customer.') {
  await pool.query(
    `
      UPDATE tts_generation_jobs
      SET
        status = 'cancelled',
        processing_stage = 'cancelled',
        cancel_reason = COALESCE(cancel_reason, $2),
        cancelled_at = COALESCE(cancelled_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('queued', 'processing', 'preview_queued', 'preview_processing', 'cancelling')
    `,
    [jobId, reason.slice(0, 500)],
  );
}

async function completeJobAndDeductUsage(
  jobId: number,
  wavRelativePath: string,
  mp3RelativePath: string | null,
  generatedAudioSeconds: number,
  billableMinutes: number,
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [jobId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw new Error('TTS job was not found while completing generation.');
    }

    if (job.status === 'completed') {
      await client.query('COMMIT');
      return job;
    }

    if (job.status === 'cancelled' || job.status === 'cancelling') {
      await client.query('COMMIT');
      return null;
    }

    if (job.status !== 'processing') {
      await client.query('COMMIT');
      return null;
    }

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [job.user_id],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found while billing completed TTS job.');
    }

    if (user.account_status !== 'active') {
      await client.query(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'failed',
            processing_stage = 'failed',
            error_message = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [job.id, 'This account is disabled.'],
      );
      await client.query('COMMIT');
      return null;
    }

    const currentBalance = Number(user.token_balance);

    if (currentBalance < billableMinutes) {
      await client.query(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'failed',
            processing_stage = 'failed',
            generated_audio_seconds = $2,
            billable_minutes = $3,
            error_message = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          job.id,
          generatedAudioSeconds,
          billableMinutes,
          `Generated audio requires ${billableMinutes} minute${billableMinutes === 1 ? '' : 's'}, but only ${currentBalance} minute${currentBalance === 1 ? '' : 's'} remain.`,
        ],
      );
      await client.query('COMMIT');
      return null;
    }

    const nextBalance = currentBalance - billableMinutes;
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

    const transactionResult = await client.query<TokenTransactionRecord>(
      `
        INSERT INTO token_transactions (
          user_id,
          transaction_type,
          token_delta,
          balance_after,
          notes
        )
        VALUES ($1, 'tts_generation', $2, $3, $4)
        RETURNING *
      `,
      [user.id, -billableMinutes, nextBalance, `Completed TTS generation job #${job.id}`],
    );
    const transaction = transactionResult.rows[0];

    await client.query(
      `
        INSERT INTO tts_usage_ledger (
          user_id,
          job_id,
          billable_minutes,
          reason
        )
        VALUES ($1, $2, $3, $4)
      `,
      [user.id, job.id, billableMinutes, 'tts_generation_completed'],
    );

    const updatedJobResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'completed',
          processing_stage = 'completed',
          provider_next_attempt_at = NULL,
          provider_last_error = NULL,
          wav_file = $2,
          mp3_file = $3,
          generated_audio_seconds = $4,
          billable_minutes = $5,
          token_cost = $5,
          token_transaction_id = $6,
          error_message = NULL,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [job.id, wavRelativePath, mp3RelativePath, generatedAudioSeconds, billableMinutes, transaction.id],
    );

    await client.query('COMMIT');
    return updatedJobResult.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function completePreviewJob(jobId: number, previewRelativePath: string, previewAudioSeconds: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [jobId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw new Error('TTS job was not found while completing preview.');
    }

    if (job.status === 'cancelled' || job.status === 'cancelling') {
      await client.query(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'cancelled',
            processing_stage = 'cancelled',
            cancel_reason = COALESCE(cancel_reason, 'Cancelled by customer.'),
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
        `,
        [job.id],
      );
      await client.query('COMMIT');
      return null;
    }

    if (job.status === 'preview_ready') {
      await client.query('COMMIT');
      return job;
    }

    if (job.status !== 'preview_processing') {
      await client.query('COMMIT');
      return null;
    }

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [job.user_id],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found while completing preview.');
    }

    if (user.account_status !== 'active') {
      await client.query(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'failed',
            processing_stage = 'failed',
            error_message = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [job.id, 'This account is disabled.'],
      );
      await client.query('COMMIT');
      return null;
    }

    const updatedJobResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'preview_ready',
          processing_stage = 'preview_ready',
          provider_next_attempt_at = NULL,
          provider_last_error = NULL,
          preview_file = $2,
          preview_audio_seconds = $3,
          preview_generated_at = NOW(),
          error_message = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [job.id, previewRelativePath, previewAudioSeconds],
    );

    await client.query('COMMIT');
    return updatedJobResult.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function isRetryableProviderFailure(error: unknown) {
  return error instanceof Error && (error as ServiceError).providerRetryable === true;
}

function getProviderRetryDelayMs(failedAttemptCount: number, config: ReturnType<typeof getRuntimeConfig>) {
  const exponentialDelay = config.providerRetryBaseDelayMs * (2 ** Math.max(0, failedAttemptCount - 1));
  return Math.min(config.providerRetryMaxDelayMs, exponentialDelay);
}

async function scheduleProviderRetry(job: TtsGenerationJobRecord, error: unknown) {
  const config = getRuntimeConfig();
  const failedAttemptCount = Number(job.provider_attempt_count ?? 0) + 1;
  const providerError = error instanceof Error ? error.message : String(error);

  if (failedAttemptCount >= config.providerRetryMaxAttempts) {
    await pool.query(
      `
        UPDATE tts_generation_jobs
        SET
          provider_attempt_count = $2,
          provider_next_attempt_at = NULL,
          provider_last_error = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [job.id, failedAttemptCount, providerError.slice(0, 1_000)],
    );
    return false;
  }

  const delayMs = getProviderRetryDelayMs(failedAttemptCount, config);
  const result = await pool.query<TtsGenerationJobRecord>(
    `
      UPDATE tts_generation_jobs
      SET
        status = CASE
          WHEN status = 'preview_processing' THEN 'preview_queued'
          ELSE 'queued'
        END,
        processing_stage = 'retrying_provider',
        provider_attempt_count = $2,
        provider_next_attempt_at = NOW() + ($3 * INTERVAL '1 millisecond'),
        provider_last_error = $4,
        error_message = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('processing', 'preview_processing')
      RETURNING *
    `,
    [job.id, failedAttemptCount, delayMs, providerError.slice(0, 1_000)],
  );

  return Boolean(result.rows[0]);
}

async function handleJobProcessingFailure(job: TtsGenerationJobRecord, error: unknown) {
  if (isRetryableProviderFailure(error)) {
    const retryScheduled = await scheduleProviderRetry(job, error);

    if (retryScheduled) {
      return;
    }

    await markJobFailed(
      job.id,
      'The voice service stayed unavailable after several automatic retries. Please try again later.',
    );
    return;
  }

  await markJobFailed(job.id, safeGenerationFailureMessage());
}

async function markJobFailed(jobId: number, errorMessage: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [jobId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      await client.query('ROLLBACK');
      return;
    }

    if (!['processing', 'preview_processing', 'cancelling'].includes(job.status)) {
      await client.query('COMMIT');
      return;
    }

    if (job.status === 'cancelling') {
      await client.query(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'cancelled',
            processing_stage = 'cancelled',
            cancel_reason = COALESCE(cancel_reason, 'Cancelled by customer.'),
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
        `,
        [job.id],
      );
      await client.query('COMMIT');
      return;
    }

    if (job.token_transaction_id && Number(job.token_cost) > 0) {
      const userResult = await client.query<UserRecord>(
        `
          SELECT *
          FROM users
          WHERE id = $1
          FOR UPDATE
        `,
        [job.user_id],
      );
      const user = userResult.rows[0];

      if (!user) {
        throw new Error('User not found while refunding failed job.');
      }

      const refundBalance = Number(user.token_balance) + Number(job.token_cost);
      const updatedUserResult = await client.query<UserRecord>(
        `
          UPDATE users
          SET
            token_balance = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [user.id, refundBalance],
      );
      const updatedUser = updatedUserResult.rows[0];

      if (!updatedUser) {
        throw new Error('Failed to refund minute balance for failed TTS job.');
      }

      await client.query<TokenTransactionRecord>(
        `
          INSERT INTO token_transactions (
            user_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, 'tts_generation_refund', $2, $3, $4)
        `,
        [user.id, Number(job.token_cost), refundBalance, `Refund for failed TTS generation job #${job.id}`],
      );
    }

    await client.query(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'failed',
          processing_stage = 'failed',
          provider_next_attempt_at = NULL,
          error_message = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [job.id, errorMessage.slice(0, 1_000)],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function failJobIfOwnerInactive(job: Pick<TtsGenerationJobRecord, 'id' | 'user_id'>) {
  const result = await pool.query<Pick<UserRecord, 'account_status'>>(
    `
      SELECT account_status
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [job.user_id],
  );
  const user = result.rows[0];

  if (user?.account_status === 'active') {
    return false;
  }

  await markJobFailed(job.id, user ? 'This account is disabled.' : 'User account not found.');
  return true;
}

async function claimNextQueuedJob() {
  const result = await pool.query<TtsGenerationJobRecord>(
    `
      WITH next_job AS (
        SELECT id, status
        FROM tts_generation_jobs
        WHERE status IN ('queued', 'preview_queued')
          AND (provider_next_attempt_at IS NULL OR provider_next_attempt_at <= NOW())
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE tts_generation_jobs AS jobs
      SET
        status = CASE
          WHEN next_job.status = 'preview_queued' THEN 'preview_processing'
          ELSE 'processing'
        END,
        processing_stage = CASE
          WHEN next_job.status = 'preview_queued' THEN 'preparing_preview'
          ELSE 'starting'
        END,
        provider_next_attempt_at = NULL,
        error_message = NULL,
        updated_at = NOW()
      FROM next_job
      WHERE jobs.id = next_job.id
      RETURNING jobs.*
    `,
  );

  return result.rows[0] ?? null;
}

async function generateSegmentsToWav(job: TtsGenerationJobRecord, segments: SpeechSegment[], outputPath: string, tempDirectory: string) {
  await updateJobStage(job.id, 'calling_provider');

  const mergeParts: AudioMergePart[] = [];

  for (const [index, segment] of segments.entries()) {
    if (await isJobCancellationRequested(job.id)) {
      await markJobCancelled(job.id);
      return false;
    }

    if (await failJobIfOwnerInactive(job)) {
      return false;
    }

    const chunkAudio = await generateWavChunk(segment.text, job, index);

    if (await isJobCancellationRequested(job.id)) {
      await markJobCancelled(job.id);
      return false;
    }

    if (await failJobIfOwnerInactive(job)) {
      return false;
    }

    const chunkPath = path.join(tempDirectory, `chunk-${String(index + 1).padStart(3, '0')}.wav`);
    await fs.writeFile(chunkPath, chunkAudio);
    mergeParts.push({
      filePath: chunkPath,
      pauseAfterMs: segment.pauseAfterMs,
    });
  }

  if (await isJobCancellationRequested(job.id)) {
    await markJobCancelled(job.id);
    return false;
  }

  if (await failJobIfOwnerInactive(job)) {
    return false;
  }

  await updateJobStage(job.id, 'merging_wav');
  await mergeWavChunks(mergeParts, outputPath, tempDirectory);

  return true;
}

async function processPreviewJob(job: TtsGenerationJobRecord) {
  const jobPaths = getJobPaths(job);
  const generationText = await applyActivePronunciationRules(job.input_text);
  const segments = preparePreviewSpeechSegments(generationText, getSpeechProfileForJob(job));

  await fs.mkdir(jobPaths.tempDirectory, { recursive: true });

  try {
    const completed = await generateSegmentsToWav(job, segments, jobPaths.previewAbsolutePath, jobPaths.tempDirectory);

    if (!completed) {
      return;
    }

    await assertFileExists(jobPaths.previewAbsolutePath, 'Preview WAV output is missing after generation.');

    const previewAudioSeconds = await getAudioDurationSeconds(jobPaths.previewAbsolutePath);
    const completedPreviewJob = await completePreviewJob(job.id, jobPaths.previewRelativePath, previewAudioSeconds);

    if (!completedPreviewJob) {
      await removeGeneratedAudioFiles([jobPaths.previewAbsolutePath]);
    }
  } catch (error) {
    console.error('TTS preview generation failed.', {
      error,
      jobId: job.id,
      statusCode: getStatusCode(error, 500),
      userId: job.user_id,
    });
    await removeGeneratedAudioFiles([jobPaths.previewAbsolutePath]);
    await handleJobProcessingFailure(job, error);
  } finally {
    await fs.rm(jobPaths.tempDirectory, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function processFullGenerationJob(job: TtsGenerationJobRecord) {
  const jobPaths = getJobPaths(job);
  const generationText = await applyActivePronunciationRules(job.input_text);
  const segments = prepareFullSpeechSegmentsForJob(generationText, job);
  const quality = resolveTtsQualityPreset(job.quality_preset);

  await fs.mkdir(jobPaths.tempDirectory, { recursive: true });

  try {
    const completed = await generateSegmentsToWav(job, segments, jobPaths.wavAbsolutePath, jobPaths.tempDirectory);

    if (!completed) {
      return;
    }

    await assertFileExists(jobPaths.wavAbsolutePath, 'WAV output is missing after generation.');

    const generatedAudioSeconds = await getAudioDurationSeconds(jobPaths.wavAbsolutePath);
    const billableMinutes = calculateBillableMinutes(generatedAudioSeconds);
    const mp3RelativePath = quality.mp3BitrateKbps
      ? jobPaths.mp3RelativePath
      : null;

    if (await isJobCancellationRequested(job.id)) {
      await removeGeneratedAudioFiles([jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath]);
      await markJobCancelled(job.id);
      return;
    }

    if (quality.mp3BitrateKbps) {
      await updateJobStage(job.id, 'converting_mp3');
      await convertWavToMp3(jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath, quality.mp3BitrateKbps);
      await assertFileExists(jobPaths.mp3AbsolutePath, 'MP3 output is missing after generation.');
    }

    if (await isJobCancellationRequested(job.id)) {
      await removeGeneratedAudioFiles([jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath]);
      await markJobCancelled(job.id);
      return;
    }

    const completedJob = await completeJobAndDeductUsage(
      job.id,
      jobPaths.wavRelativePath,
      mp3RelativePath,
      generatedAudioSeconds,
      billableMinutes,
    );

    if (!completedJob) {
      await removeGeneratedAudioFiles([jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath]);
    }
  } catch (error) {
    console.error('TTS generation failed.', {
      error,
      jobId: job.id,
      statusCode: getStatusCode(error, 500),
      userId: job.user_id,
    });
    await removeGeneratedAudioFiles([jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath]);
    await handleJobProcessingFailure(job, error);
  } finally {
    await fs.rm(jobPaths.tempDirectory, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function processClaimedJob(job: TtsGenerationJobRecord) {
  const jobPaths = getJobPaths(job);

  if (job.status === 'preview_processing') {
    await fs.rm(jobPaths.tempDirectory, { force: true, recursive: true }).catch(() => undefined);
    await processPreviewJob(job);
    return;
  }

  await Promise.all([
    fs.rm(jobPaths.tempDirectory, { force: true, recursive: true }).catch(() => undefined),
    fs.rm(jobPaths.wavAbsolutePath, { force: true }).catch(() => undefined),
    fs.rm(jobPaths.mp3AbsolutePath, { force: true }).catch(() => undefined),
  ]);
  await processFullGenerationJob(job);
}

async function processNextQueuedJob() {
  const nextJob = await claimNextQueuedJob();

  if (!nextJob) {
    return false;
  }

  await processClaimedJob(nextJob);
  return true;
}

async function drainQueue() {
  if (workerRunning || !workerStarted || workerStopping || !workerLeaderClient) {
    return;
  }

  workerRunning = true;

  try {
    while (workerStarted && !workerStopping && workerLeaderClient && await processNextQueuedJob()) {
      // Keep draining until the queue is empty.
    }
  } catch (error) {
    console.error('TTS worker loop failed.', error);
  } finally {
    workerRunning = false;
  }
}

async function resetStaleProcessingJobs() {
  await pool.query(
    `
      UPDATE tts_generation_jobs
      SET
        status = CASE
          WHEN status = 'preview_processing' THEN 'preview_queued'
          WHEN status = 'cancelling' THEN 'cancelled'
          ELSE 'queued'
        END,
        processing_stage = CASE
          WHEN status = 'preview_processing' THEN 'preview_queued'
          WHEN status = 'cancelling' THEN 'cancelled'
          ELSE 'queued'
        END,
        provider_next_attempt_at = NULL,
        cancelled_at = CASE
          WHEN status = 'cancelling' THEN COALESCE(cancelled_at, NOW())
          ELSE cancelled_at
        END,
        cancel_reason = CASE
          WHEN status = 'cancelling' THEN COALESCE(cancel_reason, 'Cancelled by customer.')
          ELSE cancel_reason
        END,
        updated_at = NOW()
      WHERE status IN ('processing', 'preview_processing', 'cancelling')
    `,
  );
}

async function acquireWorkerLeadership() {
  if (workerLeaderClient) {
    return true;
  }

  const candidate = await pool.connect();
  let candidateReleased = false;

  try {
    const result = await candidate.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      workerLeaderLockKey,
    );

    if (!result.rows[0]?.acquired) {
      candidate.release();
      candidateReleased = true;
      return false;
    }

    workerLeaderErrorHandler = (error: Error) => {
      if (workerLeaderClient !== candidate) {
        return;
      }

      console.error('TTS worker leader database connection failed; terminating to prevent split-brain processing.', {
        error,
      });
      workerLeaderClient = null;
      workerStarted = false;
      process.exitCode = 1;
      setImmediate(() => process.exit(1));
    };
    candidate.on('error', workerLeaderErrorHandler);
    workerLeaderClient = candidate;

    try {
      await resetStaleProcessingJobs();
    } catch (error) {
      workerLeaderClient = null;
      candidate.removeListener('error', workerLeaderErrorHandler);
      workerLeaderErrorHandler = null;
      await candidate
        .query('SELECT pg_advisory_unlock($1, $2)', workerLeaderLockKey)
        .catch(() => undefined);
      candidate.release();
      candidateReleased = true;
      throw error;
    }

    console.log('TTS job worker leadership acquired.');
    return true;
  } catch (error) {
    if (!candidateReleased && workerLeaderClient !== candidate) {
      candidate.release(true);
    }
    throw error;
  }
}

async function releaseWorkerLeadership() {
  const client = workerLeaderClient;

  if (!client) {
    return;
  }

  workerLeaderClient = null;
  if (workerLeaderErrorHandler) {
    client.removeListener('error', workerLeaderErrorHandler);
    workerLeaderErrorHandler = null;
  }

  try {
    await client.query('SELECT pg_advisory_unlock($1, $2)', workerLeaderLockKey);
  } finally {
    client.release();
  }
}

function runWorkerCycle() {
  if (workerCyclePromise || !workerStarted || workerStopping) {
    return workerCyclePromise ?? Promise.resolve();
  }

  workerCyclePromise = (async () => {
    const isLeader = await acquireWorkerLeadership();

    if (isLeader) {
      await drainQueue();
    }
  })()
    .catch((error) => {
      console.error('TTS worker coordination failed.', error);
    })
    .finally(() => {
      workerCyclePromise = null;
    });

  return workerCyclePromise;
}

export async function startTtsJobWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  workerStopping = false;
  await acquireWorkerLeadership();
  void runWorkerCycle();
  workerTimer = setInterval(() => {
    void runWorkerCycle();
  }, 2_000);
  workerTimer.unref();
}

export async function stopTtsJobWorker() {
  workerStopping = true;

  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  workerStarted = false;
  await workerCyclePromise;
  await releaseWorkerLeadership();
  workerStopping = false;
}

async function getLockedUser(client: PoolClient, userId: number) {
  const result = await client.query<UserRecord>(
    `
      SELECT *
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function countActiveTtsJobs(client: PoolClient, userId: number, statuses: string[]) {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM tts_generation_jobs
      WHERE user_id = $1
        AND status = ANY($2::text[])
    `,
    [userId, statuses],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function assertUserCanQueueMoreTtsJobs(
  client: PoolClient,
  userId: number,
  targetStatus: 'preview_queued' | 'queued',
) {
  const activePreviewStatuses = ['preview_queued', 'preview_processing', 'cancelling'];
  const activeGenerationStatuses = ['queued', 'processing', 'cancelling'];
  const activeStatuses = Array.from(new Set([...activePreviewStatuses, ...activeGenerationStatuses]));
  const activePreviewCount = await countActiveTtsJobs(client, userId, activePreviewStatuses);
  const activeGenerationCount = await countActiveTtsJobs(client, userId, activeGenerationStatuses);
  const activeTotalCount = await countActiveTtsJobs(client, userId, activeStatuses);

  if (activeTotalCount >= maxActiveTtsJobsPerUser) {
    throw withStatus('Too many audio jobs are already running. Wait for one to finish before starting another.', 429);
  }

  if (targetStatus === 'preview_queued' && activePreviewCount >= maxActivePreviewJobsPerUser) {
    throw withStatus('Too many previews are already running. Wait for a preview to finish before starting another.', 429);
  }

  if (targetStatus === 'queued' && activeGenerationCount >= maxActiveGenerationJobsPerUser) {
    throw withStatus('A full audio generation is already running. Wait for it to finish before starting another.', 429);
  }
}

async function assertJobVoiceProfileStillUsable(
  client: PoolClient,
  job: Pick<TtsGenerationJobRecord, 'provider_voice_profile_id' | 'user_id' | 'voice_profile_id'>,
) {
  if (!job.voice_profile_id && !job.provider_voice_profile_id) {
    return;
  }

  if (!job.voice_profile_id) {
    throw withStatus('This custom voice is no longer available. Create a new job with an active voice.', 409);
  }

  const profileResult = await client.query<{
    is_active: boolean;
    provider_profile_id: string | null;
    provider_sync_status: string;
  }>(
    `
      SELECT is_active, provider_profile_id, provider_sync_status
      FROM tts_voice_profiles
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [job.voice_profile_id, job.user_id],
  );
  const profile = profileResult.rows[0];

  if (!profile?.is_active) {
    throw withStatus('This custom voice was deleted. Create a new job with an active voice.', 409);
  }

  if (profile.provider_sync_status !== 'ready' || !profile.provider_profile_id) {
    throw withStatus('This custom voice is not active yet. Activate the voice before generating audio.', 409);
  }
}

function assertUserCanUseTtsWorkspace(user: UserRecord) {
  if (user.account_status !== 'active') {
    throw withStatus('This account is disabled.', 403);
  }

  if (!isCustomerEmailVerified(user)) {
    throw withStatus('Verify your email before creating audio jobs.', 403);
  }

  if (!isCustomerPhoneVerified(user)) {
    throw withStatus('Verify your phone before creating audio jobs.', 403);
  }

  return Number(user.token_balance);
}

function assertUserHasGenerationMinutes(user: UserRecord, estimatedMinutes = 1) {
  const currentBalance = Number(user.token_balance);
  const requiredMinutes = Math.max(1, estimatedMinutes);

  if (currentBalance < requiredMinutes) {
    const message = currentBalance <= 0
      ? 'No generation minutes remain. Upgrade or add allowance before generating full audio.'
      : `This job is estimated at ${requiredMinutes} minute${requiredMinutes === 1 ? '' : 's'}, but your current balance is ${currentBalance.toLocaleString()}. Add minutes before generating full audio.`;
    throw withStatus(message, 402);
  }

  return currentBalance;
}

async function assertAndRecordFullGenerationUsage(
  client: PoolClient,
  user: UserRecord,
  estimatedMinutes: number,
  resourceId?: number | null,
) {
  const config = getRuntimeConfig();
  const dailyLimit = user.package_code === 'starter'
    ? config.starterDailyFullGenerationMinutes
    : config.paidDailyFullGenerationMinutes;

  await assertAndRecordTtsProviderUsage(client, {
    deduplicateResource: Boolean(resourceId),
    eventType: 'job_full',
    limit: dailyLimit,
    limitMessage: `Your plan allows up to ${dailyLimit.toLocaleString()} estimated full-generation minutes in a rolling 24-hour period. Try again after earlier usage expires.`,
    resourceId,
    units: Math.max(1, estimatedMinutes),
    userId: user.id,
  });
}

async function createQueuedTtsGenerationJob(
  input: {
    inputText: string;
    qualityPreset?: string | null;
    sourceName?: string | null;
    sourceType: TtsGenerationJobSourceType;
    userId: number;
    voiceProfileId?: number | string | null;
  },
  initialStatus: 'preview_queued' | 'queued',
) {
  const normalizedText = normalizeGenerationText(input.inputText);
  const wordCount = countBillableWordsForTts(normalizedText);
  const quality = resolveTtsQualityPreset(input.qualityPreset);
  const config = getRuntimeConfig();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const user = await getLockedUser(client, input.userId);

    if (!user) {
      throw withStatus('User not found.', 404);
    }

    const currentBalance = assertUserCanUseTtsWorkspace(user);
    let estimatedMinutes: number | null = null;
    if (initialStatus === 'queued') {
      estimatedMinutes = calculateEstimatedMinutesFromWords(wordCount);
      assertUserHasGenerationMinutes(user, estimatedMinutes);
    }
    await assertUserCanQueueMoreTtsJobs(client, user.id, initialStatus);
    const voiceSelection = await resolveTtsVoiceSelectionForUser(client, user.id, input.voiceProfileId);
    const stage = initialStatus === 'preview_queued' ? 'preview_queued' : 'queued';

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        INSERT INTO tts_generation_jobs (
          user_id,
          source_type,
          source_name,
          input_text,
          word_count,
          token_cost,
          quality_preset,
          mp3_bitrate_kbps,
          status,
          processing_stage,
          provider_voice,
          voice_profile_id,
          voice_display_name,
          provider_voice_profile_id,
          full_generation_requested_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          0,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          CASE WHEN $8 = 'queued' THEN NOW() ELSE NULL END
        )
        RETURNING *
      `,
      [
        user.id,
        input.sourceType,
        sanitizeSourceName(normalizeText(input.sourceName)),
        normalizedText,
        wordCount,
        quality.preset,
        quality.mp3BitrateKbps,
        initialStatus,
        stage,
        config.voiceId,
        voiceSelection.voiceProfileId,
        voiceSelection.voiceDisplayName,
        voiceSelection.providerVoiceProfileId,
      ],
    );
    const createdJob = jobResult.rows[0];

    if (initialStatus === 'queued' && estimatedMinutes !== null) {
      await assertAndRecordFullGenerationUsage(
        client,
        user,
        estimatedMinutes,
        createdJob.id,
      );
    } else {
      await assertAndRecordTtsProviderUsage(client, {
        deduplicateResource: true,
        eventType: 'job_preview',
        limit: config.previewDailyLimitPerUser,
        limitMessage: `You can create up to ${config.previewDailyLimitPerUser} free previews in 24 hours. Generate full audio from an existing preview or try again later.`,
        resourceId: createdJob.id,
        userId: user.id,
      });
    }

    await client.query('COMMIT');
    void runWorkerCycle();

    return {
      job: createdJob,
      tokenBalance: currentBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queueTtsGenerationJob(input: {
  inputText: string;
  qualityPreset?: string | null;
  sourceName?: string | null;
  sourceType: TtsGenerationJobSourceType;
  userId: number;
  voiceProfileId?: number | string | null;
}) {
  return createQueuedTtsGenerationJob(input, 'queued');
}

export async function queueTtsPreviewJob(input: {
  inputText: string;
  qualityPreset?: string | null;
  sourceName?: string | null;
  sourceType: TtsGenerationJobSourceType;
  userId: number;
  voiceProfileId?: number | string | null;
}) {
  return createQueuedTtsGenerationJob(input, 'preview_queued');
}

export async function startTtsGenerationFromPreview(jobId: number, userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [jobId, userId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw withStatus('Audio generation job not found.', 404);
    }

    if (job.status !== 'preview_ready') {
      throw withStatus('Only preview-ready audio jobs can be started.', 409);
    }

    const user = await getLockedUser(client, userId);

    if (!user) {
      throw withStatus('User not found.', 404);
    }

    assertUserCanUseTtsWorkspace(user);
    await assertJobVoiceProfileStillUsable(client, job);
    const estimatedMinutes = calculateEstimatedMinutesFromWords(Number(job.word_count));
    const currentBalance = assertUserHasGenerationMinutes(user, estimatedMinutes);
    await assertUserCanQueueMoreTtsJobs(client, userId, 'queued');
    await assertAndRecordFullGenerationUsage(client, user, estimatedMinutes, job.id);

    const startResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'queued',
          processing_stage = 'queued',
          provider_attempt_count = 0,
          provider_next_attempt_at = NULL,
          provider_last_error = NULL,
          error_message = NULL,
          wav_file = NULL,
          mp3_file = NULL,
          generated_audio_seconds = NULL,
          billable_minutes = NULL,
          token_cost = 0,
          token_transaction_id = NULL,
          full_generation_requested_at = NOW(),
          completed_at = NULL,
          downloaded_at = NULL,
          cancellation_requested_at = NULL,
          cancelled_at = NULL,
          cancel_reason = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [jobId, userId],
    );

    await client.query('COMMIT');
    void runWorkerCycle();

    return {
      job: startResult.rows[0],
      tokenBalance: currentBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function retryTtsGenerationJob(jobId: number, userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [jobId, userId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw withStatus('Audio generation job not found.', 404);
    }

    if (job.status !== 'failed') {
      throw withStatus('Only failed audio jobs can be retried.', 409);
    }

    const user = await getLockedUser(client, userId);

    if (!user) {
      throw withStatus('User not found.', 404);
    }

    const retryStatus = job.full_generation_requested_at ? 'queued' : 'preview_queued';
    const retryStage = retryStatus === 'queued' ? 'queued' : 'preview_queued';
    const currentBalance = assertUserCanUseTtsWorkspace(user);
    await assertJobVoiceProfileStillUsable(client, job);
    if (retryStatus === 'queued') {
      const estimatedMinutes = calculateEstimatedMinutesFromWords(Number(job.word_count));
      assertUserHasGenerationMinutes(user, estimatedMinutes);
      await assertAndRecordFullGenerationUsage(client, user, estimatedMinutes, job.id);
    } else {
      const config = getRuntimeConfig();
      await assertAndRecordTtsProviderUsage(client, {
        deduplicateResource: true,
        eventType: 'job_preview',
        limit: config.previewDailyLimitPerUser,
        limitMessage: `You can create up to ${config.previewDailyLimitPerUser} free previews in 24 hours. Generate full audio from an existing preview or try again later.`,
        resourceId: job.id,
        userId: user.id,
      });
    }
    await assertUserCanQueueMoreTtsJobs(client, userId, retryStatus);

    const retryResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = $3,
          processing_stage = $4,
          provider_attempt_count = 0,
          provider_next_attempt_at = NULL,
          provider_last_error = NULL,
          error_message = NULL,
          wav_file = NULL,
          mp3_file = NULL,
          preview_file = CASE WHEN $3 = 'preview_queued' THEN NULL ELSE preview_file END,
          preview_audio_seconds = CASE WHEN $3 = 'preview_queued' THEN NULL ELSE preview_audio_seconds END,
          generated_audio_seconds = NULL,
          billable_minutes = NULL,
          token_cost = 0,
          token_transaction_id = NULL,
          completed_at = NULL,
          preview_generated_at = CASE WHEN $3 = 'preview_queued' THEN NULL ELSE preview_generated_at END,
          downloaded_at = NULL,
          cancellation_requested_at = NULL,
          cancelled_at = NULL,
          cancel_reason = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [jobId, userId, retryStatus, retryStage],
    );

    await client.query('COMMIT');
    void runWorkerCycle();

    return {
      job: retryResult.rows[0],
      tokenBalance: currentBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTtsGenerationJob(jobId: number, userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [jobId, userId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw withStatus('Audio generation job not found.', 404);
    }

    if (job.status === 'queued' || job.status === 'preview_queued') {
      const cancelledResult = await client.query<TtsGenerationJobRecord>(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'cancelled',
            processing_stage = 'cancelled',
            cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
            cancelled_at = NOW(),
            cancel_reason = 'Cancelled by customer.',
            updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
          RETURNING *
        `,
        [jobId, userId],
      );

      await client.query('COMMIT');
      return cancelledResult.rows[0];
    }

    if (job.status === 'processing' || job.status === 'preview_processing') {
      const cancellingResult = await client.query<TtsGenerationJobRecord>(
        `
          UPDATE tts_generation_jobs
          SET
            status = 'cancelling',
            processing_stage = 'cancelling',
            cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
            cancel_reason = 'Cancelled by customer.',
            updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
          RETURNING *
        `,
        [jobId, userId],
      );

      await client.query('COMMIT');
      return cancellingResult.rows[0];
    }

    throw withStatus('Only queued or processing audio jobs can be cancelled.', 409);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listTtsGenerationJobsForUser(userId: number) {
  const result = await pool.query<TtsGenerationJobRecord>(
    `
      SELECT *
      FROM tts_generation_jobs
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `,
    [userId],
  );

  return result.rows;
}

export async function getOwnedTtsGenerationJob(jobId: number, userId: number) {
  const result = await pool.query<TtsGenerationJobRecord>(
    `
      SELECT *
      FROM tts_generation_jobs
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [jobId, userId],
  );

  return result.rows[0] ?? null;
}

export async function markTtsGenerationJobDownloaded(jobId: number, userId: number) {
  await pool.query(
    `
      UPDATE tts_generation_jobs
      SET
        downloaded_at = COALESCE(downloaded_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
    `,
    [jobId, userId],
  );
}

export async function deleteOwnedTtsGenerationJob(jobId: number, userId: number) {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const jobResult = await client.query<TtsGenerationJobRecord>(
      `
        SELECT *
        FROM tts_generation_jobs
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [jobId, userId],
    );
    const job = jobResult.rows[0];

    if (!job) {
      throw withStatus('Audio generation job not found.', 404);
    }

    if (isActiveJobStatus(job.status)) {
      throw withStatus('Cancel this active audio job before deleting it.', 409);
    }

    const jobPaths = getJobPaths(job);

    // Remove private output first. If disk cleanup fails, keep the database row
    // so the owner can retry and the files never become an untracked orphan.
    await fs.rm(jobPaths.jobDirectory, {
      force: true,
      recursive: true,
    });

    await client.query(
      `
        DELETE FROM tts_generation_jobs
        WHERE id = $1
          AND user_id = $2
      `,
      [jobId, userId],
    );

    await client.query('COMMIT');
    transactionOpen = false;
    await fs.rmdir(jobPaths.userDirectory).catch(() => undefined);

    return job;
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getTtsGenerationAttachmentPath(
  job: Pick<TtsGenerationJobRecord, 'id' | 'mp3_file' | 'status' | 'wav_file'>,
  format: 'mp3' | 'wav',
) {
  if (job.status !== 'completed') {
    throw withStatus('This audio job is not completed yet.', 409);
  }

  const absolutePath = getOwnedDownloadPath(job, format);
  await assertFileExists(absolutePath, `${format.toUpperCase()} output is not available for this job.`);
  return absolutePath;
}

export async function getTtsGenerationPreviewPath(
  job: Pick<TtsGenerationJobRecord, 'preview_file'>,
) {
  const absolutePath = getOwnedPreviewPath(job);
  await assertFileExists(absolutePath, 'Preview audio is not available for this job.');
  return absolutePath;
}

function assertValidPdfHeader(buffer: Buffer) {
  const pdfHeader = Buffer.from('%PDF-', 'ascii');
  const headerSearchWindow = buffer.subarray(0, Math.min(buffer.byteLength, 1_024));

  if (buffer.byteLength < pdfHeader.byteLength || !headerSearchWindow.includes(pdfHeader)) {
    throw withStatus('Upload a valid PDF file.', 400);
  }
}

async function extractValidatedPdfText(workerData: { data?: Buffer; filePath?: string }) {
  if (activePdfExtractions >= pdfMaxConcurrentExtractions) {
    throw withStatus('PDF processing is busy. Try again shortly.', 503);
  }

  activePdfExtractions += 1;
  try {
    const rawText = await extractPdfTextInWorker(workerData);

    try {
      return normalizeGenerationText(cleanExtractedPdfText(rawText));
    } catch (error) {
      if (error instanceof Error && error.message === 'Text input is required.') {
        throw withStatus('The PDF does not contain extractable text.', 400);
      }

      throw error;
    }
  } finally {
    activePdfExtractions = Math.max(0, activePdfExtractions - 1);
  }
}

export async function extractPdfText(buffer: Buffer) {
  assertValidPdfHeader(buffer);
  return extractValidatedPdfText({ data: buffer });
}

export async function extractPdfTextFromFile(filePath: string) {
  const fileHandle = await fs.open(filePath, 'r');
  const headerBuffer = Buffer.alloc(1_024);

  try {
    const { bytesRead } = await fileHandle.read(headerBuffer, 0, headerBuffer.byteLength, 0);
    assertValidPdfHeader(headerBuffer.subarray(0, bytesRead));
  } finally {
    await fileHandle.close();
  }

  return extractValidatedPdfText({ filePath });
}

function extractPdfTextInWorker(workerData: { data?: Buffer; filePath?: string }) {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/pdf-text-worker.mjs', import.meta.url),
      {
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
        workerData: {
          ...workerData,
          maxTextCharacters: pdfMaxExtractedCharacters,
        },
      },
    );
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => {
        reject(withStatus(
          'The PDF took too long to process. Try a smaller text-based PDF.',
          408,
        ));
      });
    }, pdfExtractionTimeoutMs);

    worker.once('message', (message: unknown) => {
      const payload = message as {
        code?: unknown;
        message?: unknown;
        ok?: unknown;
        text?: unknown;
      };

      if (payload?.ok === true && typeof payload.text === 'string') {
        finish(() => resolve(payload.text as string));
        return;
      }

      if (payload?.code === 'TEXT_TOO_LARGE') {
        finish(() => {
          reject(withStatus(
            `PDF extracted text must stay under ${pdfMaxExtractedCharacters.toLocaleString()} characters.`,
            400,
          ));
        });
        return;
      }

      finish(() => {
        reject(withStatus(
          'The PDF could not be read. Upload a text-based PDF instead of a scanned or damaged file.',
          400,
        ));
      });
    });

    worker.once('error', () => {
      finish(() => {
        reject(withStatus(
          'The PDF could not be read. Upload a text-based PDF instead of a scanned or damaged file.',
          400,
        ));
      });
    });

    worker.once('exit', (_exitCode) => {
      if (settled) {
        return;
      }

      finish(() => {
        reject(withStatus(
          'The PDF could not be read. Upload a text-based PDF instead of a scanned or damaged file.',
          400,
        ));
      });
    });
  });
}

export function getTtsRuntimeStatus() {
  const config = getRuntimeConfig();

  return {
    apiUrl: config.apiUrl,
    chunkMaxChars: config.chunkMaxChars,
    customVoiceProviderRequestMaxChars: config.customVoiceProviderRequestMaxChars,
    configured: Boolean(config.apiKey),
    ffmpegPath: config.ffmpegPath,
    providerVoice: config.voiceId,
    qualityPresets: ttsQualityPresets,
    requestedFormat: config.format,
  };
}
