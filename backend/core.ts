import rateLimit from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';
import {
  pool,
  type EmailLogStatus,
  type SampleEmailLogRecord,
  type SampleRequestRecord,
  type SampleRequestStatus,
  type UserRecord,
  type VoiceCardRecord,
  type VoiceSampleRecord,
} from './db.ts';

export const port = Number(process.env.PORT ?? 5181);
export const backendRoot = fileURLToPath(new URL('.', import.meta.url));
export const projectRoot = path.resolve(backendRoot, '..');
export const bundledMediaRoot = path.join(backendRoot, 'media');
export const mediaRoot = path.resolve(process.env.VOICE_MEDIA_ROOT ?? path.join(backendRoot, 'media'));
export const privateMediaRoot = path.resolve(process.env.PRIVATE_MEDIA_ROOT ?? path.join(backendRoot, 'private-media'));
export const voiceMediaDirectory = path.join(mediaRoot, 'voices');
export const voiceInboxDirectory = path.join(voiceMediaDirectory, 'inbox');
export const voicePublicDirectory = path.join(voiceMediaDirectory, 'public');
export const ttsJobsMediaDirectory = path.join(privateMediaRoot, 'tts-jobs');
export const ttsVoiceProfilesMediaDirectory = path.join(privateMediaRoot, 'tts-voice-profiles');
export const frontendDistRoot = path.join(projectRoot, 'frontend', 'dist');
export const adminDistRoot = path.join(projectRoot, 'admin-frontend', 'dist');
export const adminSessionSecret = process.env.ADMIN_SESSION_SECRET ?? randomUUID();
export const adminSessionCookieName = 'bangla_voice_admin';
export const customerSessionSecret = process.env.CUSTOMER_SESSION_SECRET ?? randomUUID();
export const customerSessionCookieName = normalizeText(process.env.CUSTOMER_SESSION_COOKIE_NAME) ?? 'bangla_voice_user';
export const maxAudioFileSizeBytes = 25 * 1024 * 1024;

const allowedMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/webm',
  'video/mp4',
]);

const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.webm', '.mp4']);

export const validRequestStatuses = new Set<SampleRequestStatus>([
  'new',
  'reviewing',
  'sample_ready',
  'sent',
  'archived',
]);

export const validDeliveryModes = new Set(['attachment', 'link']);

export function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function requireText(value: unknown, message: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  return normalized;
}

export function toPublicApiError(error: unknown, fallback: string) {
  const statusCode = error instanceof Error
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    && error.statusCode >= 400
    && error.statusCode <= 599
    ? error.statusCode
    : 500;

  return {
    message: statusCode < 500 && error instanceof Error ? error.message : fallback,
    statusCode,
  };
}

export function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = normalizeText(process.env[name]);

  if (!value) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

export function isCustomerEmailVerificationRequired() {
  return readBooleanEnv('CUSTOMER_EMAIL_VERIFICATION_REQUIRED', false);
}

export function isCustomerPhoneVerificationRequired() {
  return readBooleanEnv('CUSTOMER_PHONE_VERIFICATION_REQUIRED', false);
}

export function isCustomerEmailVerified(user: Pick<UserRecord, 'email_verified_at'>) {
  return !isCustomerEmailVerificationRequired() || Boolean(user.email_verified_at);
}

export function isCustomerPhoneVerified(user: Pick<UserRecord, 'phone_verified_at'>) {
  return !isCustomerPhoneVerificationRequired() || Boolean(user.phone_verified_at);
}

export function isCustomerFullyVerified(user: Pick<UserRecord, 'email_verified_at' | 'phone_verified_at'>) {
  return isCustomerEmailVerified(user) && isCustomerPhoneVerified(user);
}

export function getAdminCredentials() {
  const email = normalizeText(process.env.ADMIN_EMAIL);
  const password = normalizeText(process.env.ADMIN_PASSWORD);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export function getAdminCredentialFingerprint() {
  const credentials = getAdminCredentials();

  if (!credentials) {
    return null;
  }

  return createHmac('sha256', adminSessionSecret)
    .update(credentials.email)
    .update('\0')
    .update(credentials.password)
    .digest('hex');
}

export function isAdminSessionValid(req: Request) {
  const sessionAdmin = req.session.adminUser;
  const expectedFingerprint = getAdminCredentialFingerprint();

  if (!sessionAdmin || !expectedFingerprint) {
    return false;
  }

  const actual = Buffer.from(sessionAdmin.credentialFingerprint ?? '', 'hex');
  const expected = Buffer.from(expectedFingerprint, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getSmtpConfig() {
  const host = normalizeText(process.env.SMTP_HOST);
  const portValue = normalizeText(process.env.SMTP_PORT);
  const user = normalizeText(process.env.SMTP_USER);
  const pass = normalizeText(process.env.SMTP_PASS);
  const from = normalizeText(process.env.SMTP_FROM);

  if (!host || !portValue || !user || !pass || !from) {
    return null;
  }

  const portNumber = Number(portValue);

  if (!Number.isFinite(portNumber)) {
    return null;
  }

  return {
    from,
    host,
    pass,
    port: portNumber,
    requireTls: portNumber === 587,
    secure: portNumber === 465,
    user,
  };
}

export function getFrontendUrl() {
  return normalizeText(process.env.FRONTEND_URL) ?? `http://127.0.0.1:5175`;
}

export function getAdminFrontendUrl() {
  return normalizeText(process.env.ADMIN_FRONTEND_URL);
}

export function getBackendUrl() {
  return normalizeText(process.env.BACKEND_URL) ?? `http://127.0.0.1:${port}`;
}

function toOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getAllowedCorsOrigins() {
  const origins = new Set<string>();

  for (const value of [getFrontendUrl(), getAdminFrontendUrl()]) {
    const origin = toOrigin(value);

    if (origin) {
      origins.add(origin);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const origin of [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5175',
      'http://localhost:5175',
      'http://127.0.0.1:5176',
      'http://localhost:5176',
      'http://127.0.0.1:5181',
      'http://localhost:5181',
    ]) {
      origins.add(origin);
    }
  }

  return origins;
}

function assertSecureProductionUrl(name: string) {
  const value = normalizeText(process.env[name]);

  if (!value) {
    throw new Error(`${name} is required in production.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

export function validateRuntimeConfiguration() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const requiredSecrets = [
    'ADMIN_SESSION_SECRET',
    'CUSTOMER_SESSION_SECRET',
  ] as const;

  if (!normalizeText(process.env.DATABASE_URL)) {
    throw new Error('DATABASE_URL is required in production.');
  }

  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const resolvedPublicMediaRoot = path.resolve(mediaRoot);
  const resolvedPrivateMediaRoot = path.resolve(privateMediaRoot);
  if (
    resolvedPrivateMediaRoot === resolvedPublicMediaRoot
    || resolvedPrivateMediaRoot.startsWith(`${resolvedPublicMediaRoot}${path.sep}`)
  ) {
    throw new Error('PRIVATE_MEDIA_ROOT must be outside VOICE_MEDIA_ROOT so private audio cannot be served publicly.');
  }

  for (const name of requiredSecrets) {
    const value = normalizeText(process.env[name]);
    if (!value || value.length < 32 || /replace|change-me|example/i.test(value)) {
      throw new Error(`${name} must be a non-placeholder secret of at least 32 characters.`);
    }
  }

  const ttsApiKey = normalizeText(process.env.KEYPILLAR_TTS_API_KEY);
  if (!ttsApiKey || ttsApiKey.length < 20) {
    throw new Error('KEYPILLAR_TTS_API_KEY is required in production.');
  }

  assertSecureProductionUrl('FRONTEND_URL');
  assertSecureProductionUrl('BACKEND_URL');

  const adminEmail = normalizeText(process.env.ADMIN_EMAIL);
  const adminPassword = normalizeText(process.env.ADMIN_PASSWORD);
  if ((adminEmail && !adminPassword) || (!adminEmail && adminPassword)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must either both be configured or both be omitted.');
  }
  if (adminPassword && (adminPassword.length < 12 || /change-me|password|example/i.test(adminPassword))) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and must not be a placeholder.');
  }

  if (isCustomerEmailVerificationRequired() && !getSmtpConfig()) {
    throw new Error('SMTP must be configured when customer email verification is required.');
  }

  if (isCustomerPhoneVerificationRequired()) {
    const twilioConfigured = Boolean(
      normalizeText(process.env.TWILIO_ACCOUNT_SID)
      && normalizeText(process.env.TWILIO_AUTH_TOKEN)
      && normalizeText(process.env.TWILIO_PHONE_NUMBER),
    );
    if (!twilioConfigured) {
      throw new Error('Twilio must be configured when customer phone verification is required.');
    }
  }
}

export function createJsonRateLimiter(config: {
  maxDevelopment: number;
  maxProduction: number;
  message?: string;
  windowMs: number;
}) {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return rateLimit({
    handler: (_req, res) => {
      res.status(429).json({
        error: config.message ?? 'Too many requests. Please try again later.',
      });
    },
    legacyHeaders: false,
    limit: isDevelopment ? config.maxDevelopment : config.maxProduction,
    standardHeaders: 'draft-7',
    windowMs: config.windowMs,
  });
}

export function getSmtpStatus() {
  const requiredEntries = [
    ['SMTP_HOST', normalizeText(process.env.SMTP_HOST)],
    ['SMTP_PORT', normalizeText(process.env.SMTP_PORT)],
    ['SMTP_USER', normalizeText(process.env.SMTP_USER)],
    ['SMTP_PASS', normalizeText(process.env.SMTP_PASS)],
    ['SMTP_FROM', normalizeText(process.env.SMTP_FROM)],
  ] as const;

  const missing = requiredEntries.filter(([, value]) => !value).map(([key]) => key);
  const config = getSmtpConfig();

  return {
    configured: missing.length === 0 && Boolean(config),
    from: config?.from ?? null,
    host: config?.host ?? null,
    message:
      missing.length > 0
        ? `SMTP is not configured. Set ${missing.join(', ')}.`
        : config
          ? 'SMTP is configured.'
          : 'SMTP is not configured. Check SMTP_PORT and other SMTP variables.',
    missing,
    port: config?.port ?? null,
  };
}

export function toVoiceResponse(row: VoiceCardRecord) {
  return {
    audioFile: row.audio_file,
    audioUrl: row.audio_file ? `/media/${row.audio_file}` : null,
    duration: Number(row.duration),
    englishMeaning: row.english_meaning,
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    order: row.display_order,
    scriptText: row.script_text,
    waveSeed: row.wave_seed,
  };
}

export function toSampleRequestResponse(row: SampleRequestRecord) {
  return {
    clientName: row.client_name,
    companyName: row.company_name,
    createdAt: row.created_at,
    email: row.email,
    expectedMonthlyVolume: row.expected_monthly_volume,
    id: Number(row.id),
    messageDetails: row.message_details,
    phoneNumber: row.phone_number,
    referrer: row.referrer,
    selectedService: row.selected_service,
    sourceUrl: row.source_url,
    status: row.status,
    updatedAt: row.updated_at,
    userAgent: row.user_agent,
  };
}

export function toVoiceSampleResponse(row: VoiceSampleRecord) {
  return {
    audioUrl: `/media/${row.media_path}`,
    createdAt: row.created_at,
    fileSizeBytes: Number(row.file_size_bytes),
    id: Number(row.id),
    mediaPath: row.media_path,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    requestId: row.request_id === null ? null : Number(row.request_id),
    storedFilename: row.stored_filename,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export function toEmailLogResponse(row: SampleEmailLogRecord) {
  return {
    createdAt: row.created_at,
    deliveryMode: row.delivery_mode,
    errorMessage: row.error_message,
    id: Number(row.id),
    message: row.message,
    recipientEmail: row.recipient_email,
    requestId: row.request_id === null ? null : Number(row.request_id),
    sentAt: row.sent_at,
    status: row.status,
    subject: row.subject,
    voiceCardId: row.voice_card_id === null ? null : Number(row.voice_card_id),
    voiceSampleId: row.voice_sample_id === null ? null : Number(row.voice_sample_id),
  };
}

export function ensureAdminConfigured(res: Response) {
  if (!getAdminCredentials()) {
    res.status(503).json({
      error: 'Admin login is not configured.',
      message: 'Set ADMIN_EMAIL and ADMIN_PASSWORD before using the admin interface.',
    });
    return false;
  }

  return true;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminSessionValid(req)) {
    req.session.adminUser = undefined;
    res.clearCookie(adminSessionCookieName);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

function sanitizeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return allowedExtensions.has(extension) ? extension : '';
}

function slugifyStem(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

const voiceUploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, voiceInboxDirectory);
  },
  filename: (_req, file, callback) => {
    callback(null, `${Date.now()}-${randomUUID()}${sanitizeExtension(file.originalname)}`);
  },
});

const voiceUpload = multer({
  fileFilter: (_req, file, callback) => {
    const extension = sanitizeExtension(file.originalname);
    const mimeType = file.mimetype.toLowerCase();

    if (!extension || !allowedMimeTypes.has(mimeType)) {
      callback(new Error('Unsupported audio format. Use mp3, wav, m4a, webm, or mp4.'));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxAudioFileSizeBytes,
  },
  storage: voiceUploadStorage,
});

const publicVoiceUploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, voicePublicDirectory);
  },
  filename: (req, file, callback) => {
    const extension = sanitizeExtension(file.originalname);
    const nameSource =
      normalizeText(req.body.name) ??
      normalizeText(req.body.filenameStem) ??
      path.basename(file.originalname, path.extname(file.originalname));
    const safeStem = slugifyStem(nameSource ?? '') || `voice-card-${req.params.id ?? Date.now()}`;
    callback(null, `${safeStem}-${Date.now()}${extension}`);
  },
});

const publicVoiceUpload = multer({
  fileFilter: (_req, file, callback) => {
    const extension = sanitizeExtension(file.originalname);
    const mimeType = file.mimetype.toLowerCase();

    if (!extension || !allowedMimeTypes.has(mimeType)) {
      callback(new Error('Unsupported audio format. Use mp3, wav, m4a, webm, or mp4.'));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxAudioFileSizeBytes,
  },
  storage: publicVoiceUploadStorage,
});

export async function runUpload(req: Request, res: Response) {
  await new Promise<void>((resolve, reject) => {
    voiceUpload.single('audio')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function runPublicVoiceUpload(req: Request, res: Response) {
  await new Promise<void>((resolve, reject) => {
    publicVoiceUpload.single('audio')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function fetchSampleRequestById(id: number) {
  const result = await pool.query<SampleRequestRecord>(
    `
      SELECT *
      FROM sample_requests
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function fetchVoiceSampleById(id: number) {
  const result = await pool.query<VoiceSampleRecord>(
    `
      SELECT *
      FROM voice_samples
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function fetchVoiceCardById(id: number) {
  const result = await pool.query<VoiceCardRecord>(
    `
      SELECT *
      FROM voice_cards
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function fetchNextVoiceCardId() {
  const result = await pool.query<{ next_id: string }>('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM voice_cards');
  return Number(result.rows[0]?.next_id ?? 1);
}

export async function markRequestStatus(requestId: number, status: SampleRequestStatus) {
  await pool.query(
    `
      UPDATE sample_requests
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [requestId, status],
  );
}

export async function ensureRuntimeDirectories() {
  await fs.mkdir(voiceInboxDirectory, { recursive: true });
  await fs.mkdir(voicePublicDirectory, { recursive: true });
  await fs.mkdir(privateMediaRoot, { recursive: true });
  await fs.mkdir(ttsJobsMediaDirectory, { recursive: true });
  await fs.mkdir(ttsVoiceProfilesMediaDirectory, { recursive: true });
}

export function getBaseUrl(req: Request) {
  return `${req.protocol}://${req.get('host')}`;
}

export async function serveAdminShell(res: Response) {
  const adminIndexPath = path.join(adminDistRoot, 'index.html');

  try {
    await fs.access(adminIndexPath);
    res.sendFile(adminIndexPath);
  } catch {
    res.status(503).send('Admin frontend is not built yet. Run npm run build first.');
  }
}

export async function removeFileIfPresent(filePath: string) {
  await fs.unlink(filePath).catch(() => undefined);
}

export { fs, multer, nodemailer, path };
