import { execFile } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { pool as servicePool } from '../db.ts';
import { applyActivePronunciationRules } from '../services/tts-jobs.ts';

const execFileAsync = promisify(execFile);

type VerificationDelivery = {
  preview: string | null;
};

type SignupPayload = {
  verification: {
    email: VerificationDelivery;
    phone: VerificationDelivery;
  };
};

type TtsJob = {
  billableMinutes: number | null;
  cancelReason: string | null;
  cancellationRequestedAt: string | null;
  cancelledAt: string | null;
  errorMessage: string | null;
  fullGenerationRequestedAt: string | null;
  generatedAudioSeconds: number | null;
  id: number;
  inputText?: string;
  mp3BitrateKbps: number | null;
  mp3DownloadUrl: string | null;
  previewAudioSeconds: number | null;
  previewAudioUrl: string | null;
  previewGeneratedAt: string | null;
  qualityPreset: 'high_mp3_wav' | 'premium_mp3_wav' | 'standard_mp3_wav' | 'wav_only';
  sourceName: string | null;
  status:
    | 'cancelled'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'preview_processing'
    | 'preview_queued'
    | 'preview_ready'
    | 'processing'
    | 'queued';
  tokenCost: number;
  wavDownloadUrl: string | null;
  wordCount: number;
};

type JobResponse = {
  job: TtsJob;
};

type JobListResponse = {
  jobs: TtsJob[];
};

type UserResponse = {
  user: {
    email: string;
    emailVerified: boolean;
    id: number;
    phoneVerified: boolean;
    tokenBalance: number;
  };
};

type SessionResponse = {
  authenticated: boolean;
  user: UserResponse['user'] | null;
};

type FfprobePayload = {
  format?: {
    duration?: string;
    format_name?: string;
  };
};

const backendUrl = (process.env.BACKEND_URL ?? 'http://127.0.0.1:5181').replace(/\/+$/, '');
const verifyTimeoutMs = Number(process.env.TTS_VERIFY_TIMEOUT_MS ?? 180_000);
const cookieJar = new Map<string, string>();

function splitSetCookieHeader(value: string) {
  return value.split(/,(?=\s*[^;,=\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function storeCookies(response: Response) {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookieHeaders =
    typeof headersWithSetCookie.getSetCookie === 'function'
      ? headersWithSetCookie.getSetCookie()
      : splitSetCookieHeader(response.headers.get('set-cookie') ?? '');

  for (const setCookie of setCookieHeaders) {
    const [pair] = setCookie.split(';');
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    cookieJar.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  }
}

function getCookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    if ('error' in payload && typeof payload.error === 'string') {
      return payload.error;
    }

    if ('message' in payload && typeof payload.message === 'string') {
      return payload.message;
    }
  }

  return fallback;
}

async function requestJson<T>(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const cookieHeader = getCookieHeader();

  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(new URL(pathname, backendUrl), {
    ...init,
    headers,
  });

  storeCookies(response);

  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as unknown) : null;

  if (!response.ok) {
    throw new Error(`${pathname} failed with ${response.status}: ${getErrorMessage(payload, raw || 'Request failed.')}`);
  }

  return payload as T;
}

function requirePreview(delivery: VerificationDelivery, label: string) {
  if (!delivery.preview) {
    throw new Error(
      `${label} verification preview was not returned. For this local verifier, leave SMTP/Twilio unset so the backend returns development OTPs.`,
    );
  }

  return delivery.preview;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createSimplePdfContent(text: string) {
  const lines = text.split(/\n/);
  const streamLines = lines.flatMap((line, index) => [
    ...(index === 0 ? [] : ['T*']),
    `(${escapePdfText(line)}) Tj`,
  ]);
  const stream = `BT\n/F1 18 Tf\n18 TL\n72 720 Td\n${streamLines.join('\n')}\nET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

async function createFailedTextJobForRetry(userId: number) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://bosstanim@127.0.0.1:5432/bangla_voice_ai',
  });

  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
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
          error_message
        )
        VALUES ($1, 'text', 'Local TTS retry verifier', $2, 8, 0, 'premium_mp3_wav', 320, 'failed', 'failed', $3, 'Verifier-created failure.')
        RETURNING id
      `,
      [
        userId,
        'Retry verification text for the Bangla voice audio pipeline.',
        process.env.KEYPILLAR_TTS_VOICE_ID ?? 'keypillar-bd-female',
      ],
    );

    return Number(result.rows[0].id);
  } finally {
    await client.end();
  }
}

async function createQueuedTextJobForCancel(userId: number) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://bosstanim@127.0.0.1:5432/bangla_voice_ai',
  });

  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
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
          provider_voice
        )
        VALUES ($1, 'text', 'Local TTS cancel verifier', $2, 7, 0, 'premium_mp3_wav', 320, 'queued', 'queued', $3)
        RETURNING id
      `,
      [
        userId,
        'Cancel verification text should never generate audio.',
        process.env.KEYPILLAR_TTS_VOICE_ID ?? 'keypillar-bd-female',
      ],
    );

    return Number(result.rows[0].id);
  } finally {
    await client.end();
  }
}

async function verifyPronunciationRules() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://bosstanim@127.0.0.1:5432/bangla_voice_ai',
  });
  const insertedIds: number[] = [];

  await client.connect();

  try {
    const wholeWordRule = await client.query<{ id: string }>(
      `
        INSERT INTO tts_pronunciation_rules (match_text, replacement_text, match_type, is_active, notes)
        VALUES ('ABC', 'A B C', 'whole_word', TRUE, 'Verifier active whole word')
        RETURNING id
      `,
    );
    const phraseRule = await client.query<{ id: string }>(
      `
        INSERT INTO tts_pronunciation_rules (match_text, replacement_text, match_type, is_active, notes)
        VALUES ('Key Pillar', 'Keypillar', 'phrase', TRUE, 'Verifier active phrase')
        RETURNING id
      `,
    );
    const inactiveRule = await client.query<{ id: string }>(
      `
        INSERT INTO tts_pronunciation_rules (match_text, replacement_text, match_type, is_active, notes)
        VALUES ('IGNORE', 'USED', 'phrase', FALSE, 'Verifier inactive rule')
        RETURNING id
      `,
    );

    insertedIds.push(Number(wholeWordRule.rows[0].id), Number(phraseRule.rows[0].id), Number(inactiveRule.rows[0].id));

    const transformed = await applyActivePronunciationRules('ABC ABCD Key Pillar IGNORE');

    if (transformed !== 'A B C ABCD Keypillar IGNORE') {
      throw new Error(`Pronunciation rules transformed text incorrectly: ${transformed}`);
    }

    return {
      insertedRuleIds: insertedIds,
      transformed,
    };
  } finally {
    if (insertedIds.length > 0) {
      await client.query('DELETE FROM tts_pronunciation_rules WHERE id = ANY($1::bigint[])', [insertedIds]);
    }

    await client.end();
  }
}

function resolveFfprobePath() {
  const configuredFfprobePath = process.env.FFPROBE_PATH?.trim();

  if (configuredFfprobePath) {
    return configuredFfprobePath;
  }

  const configuredFfmpegPath = process.env.FFMPEG_PATH?.trim();

  if (!configuredFfmpegPath || configuredFfmpegPath === 'ffmpeg') {
    return 'ffprobe';
  }

  return path.join(path.dirname(configuredFfmpegPath), path.basename(configuredFfmpegPath).replace(/ffmpeg$/, 'ffprobe'));
}

async function ffprobeAudio(filePath: string) {
  const ffprobePath = resolveFfprobePath();

  try {
    const { stdout } = await execFileAsync(
      ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration,format_name', '-of', 'json', filePath],
      { encoding: 'utf8' },
    );
    const payload = JSON.parse(stdout) as FfprobePayload;
    const durationSeconds = Number(payload.format?.duration);

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`ffprobe returned an invalid duration for ${filePath}.`);
    }

    return {
      durationSeconds,
      formatName: payload.format?.format_name ?? 'unknown',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`ffprobe was not found at "${ffprobePath}". Install ffmpeg/ffprobe or set FFPROBE_PATH.`);
    }

    throw error;
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollJob(jobId: number) {
  const deadline = Date.now() + verifyTimeoutMs;

  while (Date.now() < deadline) {
    const payload = await requestJson<JobResponse>(`/api/tts/jobs/${jobId}`);

    if (payload.job.status === 'completed') {
      return payload.job;
    }

    if (payload.job.status === 'failed') {
      throw new Error(`TTS job ${jobId} failed: ${payload.job.errorMessage ?? 'No error message returned.'}`);
    }

    if (payload.job.status === 'cancelled') {
      throw new Error(`TTS job ${jobId} was cancelled before completion.`);
    }

    await sleep(3000);
  }

  throw new Error(`Timed out waiting for TTS job ${jobId} after ${Math.round(verifyTimeoutMs / 1000)} seconds.`);
}

async function pollJobStatus(jobId: number, expectedStatuses: TtsJob['status'][]) {
  const deadline = Date.now() + verifyTimeoutMs;
  const expected = new Set(expectedStatuses);

  while (Date.now() < deadline) {
    const payload = await requestJson<JobResponse>(`/api/tts/jobs/${jobId}`);

    if (expected.has(payload.job.status)) {
      return payload.job;
    }

    if (payload.job.status === 'failed') {
      throw new Error(`TTS job ${jobId} failed: ${payload.job.errorMessage ?? 'No error message returned.'}`);
    }

    await sleep(3000);
  }

  throw new Error(`Timed out waiting for TTS job ${jobId} to reach ${expectedStatuses.join('/')} after ${Math.round(verifyTimeoutMs / 1000)} seconds.`);
}

async function downloadAudio(downloadUrl: string, outputPath: string) {
  const cookieHeader = getCookieHeader();
  const response = await fetch(new URL(downloadUrl, backendUrl), {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Download ${downloadUrl} failed with ${response.status}.`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

  const fileStat = await stat(outputPath);

  if (fileStat.size < 1000) {
    throw new Error(`Downloaded file is unexpectedly small: ${outputPath} (${fileStat.size} bytes).`);
  }

  return {
    bytes: fileStat.size,
    outputPath,
  };
}

async function verifyDownloads(job: TtsJob, label: string, options: { expectMp3: boolean }) {
  if (!job.wavDownloadUrl) {
    throw new Error(`Completed ${label} job ${job.id} did not return a WAV download URL.`);
  }

  if (options.expectMp3 && !job.mp3DownloadUrl) {
    throw new Error(`Completed ${label} job ${job.id} did not return an MP3 download URL.`);
  }

  if (!options.expectMp3 && job.mp3DownloadUrl) {
    throw new Error(`WAV-only ${label} job ${job.id} unexpectedly returned an MP3 download URL.`);
  }

  const outputDir = path.join(os.tmpdir(), 'voice-ai-customer-tts-verification');
  const wav = await downloadAudio(job.wavDownloadUrl, path.join(outputDir, `${label}-${job.id}.wav`));
  const wavProbe = await ffprobeAudio(wav.outputPath);
  const mp3 = job.mp3DownloadUrl
    ? await downloadAudio(job.mp3DownloadUrl, path.join(outputDir, `${label}-${job.id}.mp3`))
    : null;
  const mp3Probe = mp3 ? await ffprobeAudio(mp3.outputPath) : null;

  return {
    mp3: mp3 && mp3Probe
      ? {
          ...mp3,
          ...mp3Probe,
        }
      : null,
    wav: {
      ...wav,
      ...wavProbe,
    },
  };
}

async function main() {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `codex-tts-${uniqueSuffix}@example.com`;
  const password = 'CodexTts123!';
  const phone = `17${Date.now().toString().slice(-8)}`;

  const signup = await requestJson<SignupPayload>('/api/auth/signup', {
    body: JSON.stringify({
      confirmPassword: password,
      countryCode: '+880',
      email,
      fullName: 'Codex TTS Verifier',
      mobileNumber: phone,
      password,
    }),
    method: 'POST',
  });

  await requestJson<UserResponse>('/api/auth/verify-email-otp', {
    body: JSON.stringify({ otp: requirePreview(signup.verification.email, 'Email') }),
    method: 'POST',
  });
  const verifiedPhone = await requestJson<UserResponse>('/api/auth/verify-phone-otp', {
    body: JSON.stringify({ otp: requirePreview(signup.verification.phone, 'Phone') }),
    method: 'POST',
  });
  const initialMinuteBalance = verifiedPhone.user.tokenBalance;
  const pronunciationCheck = await verifyPronunciationRules();

  const previewJobPayload = await requestJson<JobResponse>('/api/tts/jobs/text/preview', {
    body: JSON.stringify({
      inputText: 'Preview verification for the customer TTS workflow before full audio generation.',
      sourceName: 'Local TTS verifier preview',
    }),
    method: 'POST',
  });
  if (previewJobPayload.job.status !== 'preview_queued') {
    throw new Error(`Text preview job ${previewJobPayload.job.id} was not queued as preview_queued.`);
  }
  const previewReadyJob = await pollJobStatus(previewJobPayload.job.id, ['preview_ready']);
  if (!previewReadyJob.previewAudioUrl || !previewReadyJob.previewAudioSeconds) {
    throw new Error(`Text preview job ${previewReadyJob.id} did not produce preview audio.`);
  }
  const previewDownload = await downloadAudio(
    previewReadyJob.previewAudioUrl,
    path.join(os.tmpdir(), 'voice-ai-customer-tts-verification', `preview-${previewReadyJob.id}.wav`),
  );
  const previewProbe = await ffprobeAudio(previewDownload.outputPath);
  const sessionAfterPreview = await requestJson<SessionResponse>('/api/user/me');
  if (sessionAfterPreview.user?.tokenBalance !== initialMinuteBalance) {
    throw new Error('Preview generation deducted minutes before full generation was approved.');
  }

  const startPreviewJobPayload = await requestJson<JobResponse>(`/api/tts/jobs/${previewReadyJob.id}/start`, {
    method: 'POST',
  });
  if (startPreviewJobPayload.job.id !== previewReadyJob.id || startPreviewJobPayload.job.status !== 'queued') {
    throw new Error(`Starting full generation did not reuse preview job ${previewReadyJob.id}.`);
  }
  const previewFullJob = await pollJob(previewReadyJob.id);
  if (!previewFullJob.billableMinutes || !previewFullJob.generatedAudioSeconds) {
    throw new Error(`Preview-approved job ${previewFullJob.id} did not record duration and billable minutes.`);
  }
  const previewFullDownloads = await verifyDownloads(previewFullJob, 'preview-full', { expectMp3: true });

  const textJobPayload = await requestJson<JobResponse>('/api/tts/jobs/text', {
    body: JSON.stringify({
      inputText: 'Local text verification for the Bangla voice audio generation pipeline.',
      sourceName: 'Local TTS verifier text',
    }),
    method: 'POST',
  });
  const textJob = await pollJob(textJobPayload.job.id);
  if (textJob.qualityPreset !== 'premium_mp3_wav' || textJob.mp3BitrateKbps !== 320) {
    throw new Error(`Default quality was not Premium MP3 320 kbps + WAV for text job ${textJob.id}.`);
  }
  if (!textJob.billableMinutes || !textJob.generatedAudioSeconds) {
    throw new Error(`Text job ${textJob.id} did not record generated duration and billable minutes.`);
  }
  const textDownloads = await verifyDownloads(textJob, 'text', { expectMp3: true });

  const failedRetryJobId = await createFailedTextJobForRetry(verifiedPhone.user.id);
  const retryJobPayload = await requestJson<JobResponse>(`/api/tts/jobs/${failedRetryJobId}/retry`, {
    method: 'POST',
  });

  if (retryJobPayload.job.id !== failedRetryJobId || retryJobPayload.job.status !== 'queued') {
    throw new Error(`Retry did not reuse and queue failed job ${failedRetryJobId}.`);
  }

  const retriedJob = await pollJob(failedRetryJobId);
  if (retriedJob.qualityPreset !== 'premium_mp3_wav' || retriedJob.mp3BitrateKbps !== 320) {
    throw new Error(`Retried job ${retriedJob.id} did not keep the original quality preset.`);
  }
  if (!retriedJob.billableMinutes || !retriedJob.generatedAudioSeconds) {
    throw new Error(`Retried job ${retriedJob.id} did not record generated duration and billable minutes.`);
  }
  const retryDownloads = await verifyDownloads(retriedJob, 'retry', { expectMp3: true });

  const queuedCancelJobId = await createQueuedTextJobForCancel(verifiedPhone.user.id);
  const cancelPayload = await requestJson<JobResponse>(`/api/tts/jobs/${queuedCancelJobId}/cancel`, {
    method: 'POST',
  });
  const cancelledJob = cancelPayload.job.status === 'cancelled'
    ? cancelPayload.job
    : await pollJobStatus(queuedCancelJobId, ['cancelled']);
  if (cancelledJob.wavDownloadUrl || cancelledJob.mp3DownloadUrl || cancelledJob.billableMinutes) {
    throw new Error(`Cancelled job ${cancelledJob.id} unexpectedly exposed downloads or billable minutes.`);
  }

  const formData = new FormData();
  const noisyPdfText = [
    'Bangla Speech AI Report',
    'Page 1',
    'This verification paragraph is deliberately long enough to represent a hard wrapped PDF line for verifi-',
    'cation after extraction.',
    '',
    '- First cleaned list item.',
    '- Second cleaned list item.',
  ].join('\n');
  formData.append(
    'file',
    new Blob([createSimplePdfContent(noisyPdfText)], {
      type: 'application/pdf',
    }),
    'local-tts-verification.pdf',
  );
  formData.append('sourceName', 'Local TTS verifier PDF');
  formData.append('qualityPreset', 'standard_mp3_wav');

  const pdfJobPayload = await requestJson<JobResponse>('/api/tts/jobs/pdf', {
    body: formData,
    method: 'POST',
  });
  if (pdfJobPayload.job.inputText?.includes('Page 1')) {
    throw new Error(`PDF cleanup did not remove standalone page number text for job ${pdfJobPayload.job.id}.`);
  }
  if (pdfJobPayload.job.inputText?.includes('verifi-\ncation')) {
    throw new Error(`PDF cleanup did not repair hyphenated line wrapping for job ${pdfJobPayload.job.id}.`);
  }
  const pdfJob = await pollJob(pdfJobPayload.job.id);
  if (pdfJob.qualityPreset !== 'standard_mp3_wav' || pdfJob.mp3BitrateKbps !== 128) {
    throw new Error(`PDF job ${pdfJob.id} did not keep Standard MP3 128 kbps + WAV quality.`);
  }
  if (!pdfJob.billableMinutes || !pdfJob.generatedAudioSeconds) {
    throw new Error(`PDF job ${pdfJob.id} did not record generated duration and billable minutes.`);
  }
  const pdfDownloads = await verifyDownloads(pdfJob, 'pdf', { expectMp3: true });

  const previewPdfFormData = new FormData();
  previewPdfFormData.append(
    'file',
    new Blob([createSimplePdfContent(noisyPdfText)], {
      type: 'application/pdf',
    }),
    'local-tts-preview-verification.pdf',
  );
  previewPdfFormData.append('sourceName', 'Local TTS verifier PDF preview');
  const pdfPreviewPayload = await requestJson<JobResponse>('/api/tts/jobs/pdf/preview', {
    body: previewPdfFormData,
    method: 'POST',
  });
  if (pdfPreviewPayload.job.inputText?.includes('Page 1')) {
    throw new Error(`PDF preview cleanup did not remove standalone page number text for job ${pdfPreviewPayload.job.id}.`);
  }
  const pdfPreviewReadyJob = await pollJobStatus(pdfPreviewPayload.job.id, ['preview_ready']);
  if (!pdfPreviewReadyJob.previewAudioUrl || !pdfPreviewReadyJob.previewAudioSeconds) {
    throw new Error(`PDF preview job ${pdfPreviewReadyJob.id} did not produce preview audio.`);
  }

  const wavOnlyJobPayload = await requestJson<JobResponse>('/api/tts/jobs/text', {
    body: JSON.stringify({
      inputText: 'Local WAV only verification.',
      qualityPreset: 'wav_only',
      sourceName: 'Local TTS verifier WAV only',
    }),
    method: 'POST',
  });
  const wavOnlyJob = await pollJob(wavOnlyJobPayload.job.id);
  if (wavOnlyJob.qualityPreset !== 'wav_only' || wavOnlyJob.mp3BitrateKbps !== null) {
    throw new Error(`WAV-only job ${wavOnlyJob.id} did not keep the WAV-only quality preset.`);
  }
  if (!wavOnlyJob.billableMinutes || !wavOnlyJob.generatedAudioSeconds) {
    throw new Error(`WAV-only job ${wavOnlyJob.id} did not record generated duration and billable minutes.`);
  }
  const wavOnlyDownloads = await verifyDownloads(wavOnlyJob, 'wav-only', { expectMp3: false });
  const previewOnlyJobs = [pdfPreviewReadyJob, cancelledJob];
  const { jobs } = await requestJson<JobListResponse>('/api/tts/jobs');
  const totalBillableMinutes = [previewFullJob, textJob, retriedJob, pdfJob, wavOnlyJob].reduce(
    (total, job) => total + (job.billableMinutes ?? 0),
    0,
  );
  const sessionAfterJobs = await requestJson<SessionResponse>('/api/user/me');

  if (!sessionAfterJobs.user) {
    throw new Error('Session was lost before usage balance verification.');
  }

  const expectedBalance = initialMinuteBalance - totalBillableMinutes;
  if (sessionAfterJobs.user.tokenBalance !== expectedBalance) {
    throw new Error(`Minute balance mismatch. Expected ${expectedBalance}, received ${sessionAfterJobs.user.tokenBalance}.`);
  }

  await requestJson<{ authenticated: false }>('/api/auth/logout', { method: 'POST' });
  await requestJson<UserResponse>('/api/auth/login', {
    body: JSON.stringify({
      email,
      password,
    }),
    method: 'POST',
  });
  const historyAfterRelogin = await requestJson<JobListResponse>('/api/tts/jobs');

  for (const expectedJob of [previewFullJob, textJob, retriedJob, pdfJob, wavOnlyJob]) {
    if (!historyAfterRelogin.jobs.some((job) => job.id === expectedJob.id && job.status === 'completed')) {
      throw new Error(`Completed job ${expectedJob.id} was not visible after logout/login.`);
    }
  }
  for (const expectedJob of previewOnlyJobs) {
    if (!historyAfterRelogin.jobs.some((job) => job.id === expectedJob.id && job.status === expectedJob.status)) {
      throw new Error(`Preview/cancelled job ${expectedJob.id} was not visible after logout/login.`);
    }
  }

  await requestJson<{ authenticated: false }>('/api/auth/logout', { method: 'POST' });
  const secondSignup = await requestJson<SignupPayload>('/api/auth/signup', {
    body: JSON.stringify({
      confirmPassword: password,
      countryCode: '+880',
      email: `codex-tts-other-${uniqueSuffix}@example.com`,
      fullName: 'Codex TTS Verifier Other',
      mobileNumber: `18${Date.now().toString().slice(-8)}`,
      password,
    }),
    method: 'POST',
  });
  await requestJson<UserResponse>('/api/auth/verify-email-otp', {
    body: JSON.stringify({ otp: requirePreview(secondSignup.verification.email, 'Second email') }),
    method: 'POST',
  });
  await requestJson<UserResponse>('/api/auth/verify-phone-otp', {
    body: JSON.stringify({ otp: requirePreview(secondSignup.verification.phone, 'Second phone') }),
    method: 'POST',
  });
  let nonOwnerDenied = false;
  try {
    await requestJson<JobResponse>(`/api/tts/jobs/${previewFullJob.id}`);
  } catch (error) {
    nonOwnerDenied = error instanceof Error && error.message.includes('404');
  }

  if (!nonOwnerDenied) {
    throw new Error(`Non-owner could access TTS job ${previewFullJob.id}.`);
  }

  console.log(
    JSON.stringify(
      {
        backendUrl,
        createdUser: email,
        expectedMinuteBalance: expectedBalance,
        initialMinuteBalance,
        jobsInHistory: jobs.length,
        cancelledJob: {
          id: cancelledJob.id,
          status: cancelledJob.status,
        },
        pdfPreviewJob: {
          id: pdfPreviewReadyJob.id,
          previewAudioSeconds: pdfPreviewReadyJob.previewAudioSeconds,
          status: pdfPreviewReadyJob.status,
        },
        pdfJob: {
          billableMinutes: pdfJob.billableMinutes,
          downloads: pdfDownloads,
          generatedAudioSeconds: pdfJob.generatedAudioSeconds,
          id: pdfJob.id,
          mp3BitrateKbps: pdfJob.mp3BitrateKbps,
          qualityPreset: pdfJob.qualityPreset,
          wordCount: pdfJob.wordCount,
        },
        reloginHistoryCount: historyAfterRelogin.jobs.length,
        retryJob: {
          billableMinutes: retriedJob.billableMinutes,
          downloads: retryDownloads,
          generatedAudioSeconds: retriedJob.generatedAudioSeconds,
          id: retriedJob.id,
          mp3BitrateKbps: retriedJob.mp3BitrateKbps,
          qualityPreset: retriedJob.qualityPreset,
          wordCount: retriedJob.wordCount,
        },
        pronunciationCheck,
        previewFullJob: {
          billableMinutes: previewFullJob.billableMinutes,
          downloads: previewFullDownloads,
          generatedAudioSeconds: previewFullJob.generatedAudioSeconds,
          id: previewFullJob.id,
          preview: {
            bytes: previewDownload.bytes,
            durationSeconds: previewProbe.durationSeconds,
            formatName: previewProbe.formatName,
          },
          status: previewFullJob.status,
        },
        textJob: {
          billableMinutes: textJob.billableMinutes,
          downloads: textDownloads,
          generatedAudioSeconds: textJob.generatedAudioSeconds,
          id: textJob.id,
          mp3BitrateKbps: textJob.mp3BitrateKbps,
          qualityPreset: textJob.qualityPreset,
          wordCount: textJob.wordCount,
        },
        totalBillableMinutes,
        wavOnlyJob: {
          billableMinutes: wavOnlyJob.billableMinutes,
          downloads: wavOnlyDownloads,
          generatedAudioSeconds: wavOnlyJob.generatedAudioSeconds,
          id: wavOnlyJob.id,
          mp3BitrateKbps: wavOnlyJob.mp3BitrateKbps,
          qualityPreset: wavOnlyJob.qualityPreset,
          wordCount: wavOnlyJob.wordCount,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await servicePool.end().catch(() => undefined);
  });
