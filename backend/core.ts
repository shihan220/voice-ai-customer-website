import rateLimit from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
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
  type VoiceCardRecord,
  type VoiceSampleRecord,
} from './db.ts';

export const port = Number(process.env.PORT ?? 5174);
export const backendRoot = fileURLToPath(new URL('.', import.meta.url));
export const projectRoot = path.resolve(backendRoot, '..');
export const mediaRoot = path.resolve(process.env.VOICE_MEDIA_ROOT ?? path.join(backendRoot, 'media'));
export const voiceMediaDirectory = path.join(mediaRoot, 'voices');
export const voiceInboxDirectory = path.join(voiceMediaDirectory, 'inbox');
export const voicePublicDirectory = path.join(voiceMediaDirectory, 'public');
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
    throw new Error(message);
  }

  return normalized;
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

export function getAdminCredentials() {
  const email = normalizeText(process.env.ADMIN_EMAIL);
  const password = normalizeText(process.env.ADMIN_PASSWORD);

  if (!email || !password) {
    return null;
  }

  return { email, password };
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
  return normalizeText(process.env.FRONTEND_URL) ?? `http://127.0.0.1:5173`;
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
      'http://127.0.0.1:5181',
      'http://localhost:5181',
    ]) {
      origins.add(origin);
    }
  }

  return origins;
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
  if (!req.session.adminUser) {
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
