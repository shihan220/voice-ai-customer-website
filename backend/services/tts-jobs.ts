import { PDFParse } from 'pdf-parse';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import {
  normalizeText,
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

const defaultKeypillarTtsApiUrl = 'https://api.keypillar.org/v1/voice/generate';
const defaultKeypillarTtsBaseUrl = 'https://api.keypillar.org';
const defaultKeypillarTtsEndpoint = '/v1/voice/generate';
const defaultKeypillarTtsFormat = 'wav';
const defaultKeypillarTtsPronunciationMode = 'english_preserve';
const defaultKeypillarTtsVoiceId = 'keypillar-bd-female';
const defaultFfmpegPath = 'ffmpeg';
const defaultTtsChunkMaxChars = 1_200;
const defaultCustomVoiceChunkMaxChars = 220;
const maxInputCharacters = 120_000;
const maxActivePreviewJobsPerUser = 2;
const maxActiveGenerationJobsPerUser = 1;
const maxActiveTtsJobsPerUser = 3;
const chunkPauseMs = 220;
const headingPauseMs = 900;
const listItemPauseMs = 450;
const paragraphPauseMs = 800;
const sentencePauseMs = 340;
const customVoiceChunkPauseMs = 220;
const customVoiceHeadingPauseMs = 900;
const customVoiceListItemPauseMs = 420;
const customVoiceParagraphPauseMs = 750;
const customVoiceSentencePauseMs = 320;
const previewWordLimit = 85;

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

let workerStarted = false;
let workerRunning = false;
let workerTimer: NodeJS.Timeout | null = null;

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
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

  return {
    apiKey,
    apiUrl,
    chunkMaxChars: Number.isFinite(configuredChunkMaxChars) && configuredChunkMaxChars >= 300
      ? Math.floor(configuredChunkMaxChars)
      : defaultTtsChunkMaxChars,
    customVoiceChunkMaxChars: Number.isFinite(configuredCustomVoiceChunkMaxChars) &&
      configuredCustomVoiceChunkMaxChars >= 80 &&
      configuredCustomVoiceChunkMaxChars <= 500
      ? Math.floor(configuredCustomVoiceChunkMaxChars)
      : defaultCustomVoiceChunkMaxChars,
    ffmpegPath,
    format,
    pronunciationMode,
    voiceId,
  };
}

export function resolveTtsQualityPreset(value?: string | null) {
  const preset = normalizeText(value) as TtsGenerationQualityPreset | undefined;

  if (preset && preset in ttsQualityPresets) {
    return {
      preset,
      ...ttsQualityPresets[preset],
    };
  }

  return {
    preset: 'premium_mp3_wav' as const,
    ...ttsQualityPresets.premium_mp3_wav,
  };
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

export async function listTtsPronunciationRules() {
  const result = await pool.query<TtsPronunciationRuleRecord>(
    `
      SELECT *
      FROM tts_pronunciation_rules
      ORDER BY is_active DESC, match_text ASC, id ASC
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
  const matchText = normalizeText(input.matchText);
  const replacementText = normalizeText(input.replacementText);
  const matchType = input.matchType === 'whole_word' ? 'whole_word' : 'phrase';

  if (!matchText) {
    throw withStatus('Match text is required.', 400);
  }

  if (!replacementText) {
    throw withStatus('Replacement text is required.', 400);
  }

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
    [matchText, replacementText, matchType, input.isActive ?? true, normalizeText(input.notes ?? null)],
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

  const matchText = input.matchText === undefined ? existing.match_text : normalizeText(input.matchText);
  const replacementText = input.replacementText === undefined ? existing.replacement_text : normalizeText(input.replacementText);
  const matchType = input.matchType === undefined
    ? existing.match_type
    : input.matchType === 'whole_word'
      ? 'whole_word'
      : 'phrase';

  if (!matchText) {
    throw withStatus('Match text is required.', 400);
  }

  if (!replacementText) {
    throw withStatus('Replacement text is required.', 400);
  }

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
      input.notes === undefined ? existing.notes : normalizeText(input.notes),
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
    `,
  );
  let outputText = inputText;

  for (const rule of rulesResult.rows) {
    const pattern = buildPronunciationPattern(rule.match_text, rule.match_type);

    if (!pattern) {
      continue;
    }

    outputText = outputText.replace(pattern, rule.replacement_text);
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
    allowClauseFallback: true,
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

  for (const [index, sentence] of sentences.entries()) {
    addSpeechTextSegment(
      segments,
      sentence,
      index === sentences.length - 1 ? speechProfile.paragraphPauseMs : speechProfile.sentencePauseMs,
      speechProfile,
    );
  }
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
    ['data', 'url'],
    ['data', 'audioUrl'],
    ['data', 'audio_url'],
    ['result', 'url'],
    ['result', 'audioUrl'],
    ['result', 'audio_url'],
  ];

  for (const candidatePath of candidatePaths) {
    const value = getJsonValueCandidates(payload, candidatePath);

    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function resolveProviderAudioUrl(audioUrl: string, apiUrl: string) {
  try {
    return new URL(audioUrl, apiUrl).toString();
  } catch {
    throw withStatus('Keypillar TTS response included an invalid audio URL.', 502);
  }
}

function shouldRetryAudioFetch(statusCode: number) {
  return statusCode === 404 || statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

async function fetchAudioUrlWithRetry(audioUrl: string, config: ReturnType<typeof getRuntimeConfig>) {
  const resolvedUrl = resolveProviderAudioUrl(audioUrl, config.apiUrl);
  const providerOrigin = new URL(config.apiUrl).origin;
  const audioOrigin = new URL(resolvedUrl).origin;
  const delaysMs = [0, 500, 1_000, 1_500, 2_500, 4_000];
  let lastStatusCode: number | null = null;

  for (const [attemptIndex, delayMs] of delaysMs.entries()) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const headers: Record<string, string> = {
      Accept: 'audio/wav,audio/*,application/octet-stream,*/*',
    };

    if (audioOrigin === providerOrigin) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(resolvedUrl, { headers });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    lastStatusCode = response.status;
    await response.arrayBuffer().catch(() => undefined);

    const hasMoreAttempts = attemptIndex < delaysMs.length - 1;
    if (!hasMoreAttempts || !shouldRetryAudioFetch(response.status)) {
      break;
    }
  }

  throw withStatus(`Audio fetch failed with status ${lastStatusCode ?? 'unknown'}.`, 502);
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

async function generateWavChunk(text: string, job: TtsGenerationJobRecord) {
  const config = getRuntimeConfig();

  if (!config.apiKey) {
    throw withStatus('KEYPILLAR_TTS_API_KEY is missing.', 503);
  }

  const providerVoiceProfileId = job.provider_voice_profile_id ?? 'fixed';

  const response = await fetch(config.apiUrl, {
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
      'Idempotency-Key': randomUUID(),
    },
    method: 'POST',
  });

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw withStatus(
      `Keypillar TTS request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : '.'}`,
      502,
    );
  }

  if (contentType.includes('audio') || contentType.includes('octet-stream')) {
    return Buffer.from(await response.arrayBuffer());
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

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
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

    const updatedJobResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'preview_ready',
          processing_stage = 'preview_ready',
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

    if (job.status === 'failed' || job.status === 'cancelled') {
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

async function claimNextQueuedJob() {
  const result = await pool.query<TtsGenerationJobRecord>(
    `
      WITH next_job AS (
        SELECT id, status
        FROM tts_generation_jobs
        WHERE status IN ('queued', 'preview_queued')
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

    const chunkAudio = await generateWavChunk(segment.text, job);

    if (await isJobCancellationRequested(job.id)) {
      await markJobCancelled(job.id);
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
    await completePreviewJob(job.id, jobPaths.previewRelativePath, previewAudioSeconds);
  } catch (error) {
    console.error('TTS preview generation failed.', {
      error,
      jobId: job.id,
      statusCode: getStatusCode(error, 500),
      userId: job.user_id,
    });
    await markJobFailed(job.id, safeGenerationFailureMessage());
  } finally {
    await fs.rm(jobPaths.tempDirectory, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function processFullGenerationJob(job: TtsGenerationJobRecord) {
  const jobPaths = getJobPaths(job);
  const generationText = await applyActivePronunciationRules(job.input_text);
  const segments = prepareSpeechSegmentsForTts(generationText, getSpeechProfileForJob(job));
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
      await markJobCancelled(job.id);
      return;
    }

    if (quality.mp3BitrateKbps) {
      await updateJobStage(job.id, 'converting_mp3');
      await convertWavToMp3(jobPaths.wavAbsolutePath, jobPaths.mp3AbsolutePath, quality.mp3BitrateKbps);
      await assertFileExists(jobPaths.mp3AbsolutePath, 'MP3 output is missing after generation.');
    }

    if (await isJobCancellationRequested(job.id)) {
      await markJobCancelled(job.id);
      return;
    }

    await completeJobAndDeductUsage(job.id, jobPaths.wavRelativePath, mp3RelativePath, generatedAudioSeconds, billableMinutes);
  } catch (error) {
    console.error('TTS generation failed.', {
      error,
      jobId: job.id,
      statusCode: getStatusCode(error, 500),
      userId: job.user_id,
    });
    await markJobFailed(job.id, safeGenerationFailureMessage());
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
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    while (await processNextQueuedJob()) {
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
          WHEN status = 'preview_processing' THEN 'queued'
          WHEN status = 'cancelling' THEN 'cancelled'
          ELSE 'queued'
        END,
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

export async function startTtsJobWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  await resetStaleProcessingJobs();
  void drainQueue();
  workerTimer = setInterval(() => {
    void drainQueue();
  }, 2_000);
}

export async function stopTtsJobWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  workerStarted = false;
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
  const activePreviewStatuses = ['preview_queued', 'preview_processing'];
  const activeGenerationStatuses = ['queued', 'processing'];
  const activeStatuses = [...activePreviewStatuses, ...activeGenerationStatuses];
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

function assertUserCanQueueTtsJob(user: UserRecord) {
  if (user.account_status !== 'active') {
    throw withStatus('This account is disabled.', 403);
  }

  if (!user.email_verified_at) {
    throw withStatus('Verify your email before creating audio jobs.', 403);
  }

  if (!user.phone_verified_at) {
    throw withStatus('Verify your phone before creating audio jobs.', 403);
  }

  const currentBalance = Number(user.token_balance);

  if (currentBalance <= 0) {
    throw withStatus('No generation minutes remain. Upgrade or add allowance before creating audio.', 402);
  }

  return currentBalance;
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

    const currentBalance = assertUserCanQueueTtsJob(user);
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
          provider_voice_profile_id
        )
        VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13)
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

    await client.query('COMMIT');
    void drainQueue();

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

    const currentBalance = assertUserCanQueueTtsJob(user);
    await assertUserCanQueueMoreTtsJobs(client, userId, 'queued');

    const startResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = 'queued',
          processing_stage = 'queued',
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
    void drainQueue();

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

    const currentBalance = assertUserCanQueueTtsJob(user);
    const retryStatus = job.full_generation_requested_at ? 'queued' : 'preview_queued';
    const retryStage = retryStatus === 'queued' ? 'queued' : 'preview_queued';
    await assertUserCanQueueMoreTtsJobs(client, userId, retryStatus);

    const retryResult = await client.query<TtsGenerationJobRecord>(
      `
        UPDATE tts_generation_jobs
        SET
          status = $3,
          processing_stage = $4,
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
    void drainQueue();

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

    if (isActiveJobStatus(job.status)) {
      throw withStatus('Cancel this active audio job before deleting it.', 409);
    }

    await fs.rm(getJobPaths(job).jobDirectory, {
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

    await fs.rmdir(getJobPaths(job).userDirectory).catch(() => undefined);

    return job;
  } catch (error) {
    await client.query('ROLLBACK');
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

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    const rawText = parsed.text ?? '';

    try {
      return normalizeGenerationText(cleanExtractedPdfText(rawText));
    } catch (error) {
      if (error instanceof Error && error.message === 'Text input is required.') {
        throw withStatus('The PDF does not contain extractable text.', 400);
      }

      throw error;
    }
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function getTtsRuntimeStatus() {
  const config = getRuntimeConfig();

  return {
    apiUrl: config.apiUrl,
    chunkMaxChars: config.chunkMaxChars,
    configured: Boolean(config.apiKey),
    ffmpegPath: config.ffmpegPath,
    providerVoice: config.voiceId,
    qualityPresets: ttsQualityPresets,
    requestedFormat: config.format,
  };
}
