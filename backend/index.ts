import 'dotenv/config';
import cors from 'cors';
import connectPgSimple from 'connect-pg-simple';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureSchema,
  pool,
  type EmailLogStatus,
  type SampleEmailLogRecord,
  type SampleRequestRecord,
  type SampleRequestStatus,
  type VoiceCardRecord,
  type VoiceSampleRecord,
} from './db.ts';

declare module 'express-session' {
  interface SessionData {
    adminUser?: {
      email: string;
    };
  }
}

const app = express();
const PgSessionStore = connectPgSimple(session);
const port = Number(process.env.PORT ?? 5174);
const backendRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.resolve(backendRoot, '..');
const mediaRoot = path.resolve(process.env.VOICE_MEDIA_ROOT ?? path.join(backendRoot, 'media'));
const voiceMediaDirectory = path.join(mediaRoot, 'voices');
const voiceInboxDirectory = path.join(voiceMediaDirectory, 'inbox');
const voicePublicDirectory = path.join(voiceMediaDirectory, 'public');
const adminDistRoot = path.join(projectRoot, 'admin-frontend', 'dist');
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET ?? randomUUID();
const adminSessionCookieName = 'bangla_voice_admin';
const maxAudioFileSizeBytes = 25 * 1024 * 1024;

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
const validRequestStatuses = new Set<SampleRequestStatus>(['new', 'reviewing', 'sample_ready', 'sent', 'archived']);
const validDeliveryModes = new Set(['attachment', 'link']);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(
  session({
    name: adminSessionCookieName,
    secret: adminSessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgSessionStore({
      createTableIfMissing: true,
      pool,
      tableName: 'admin_sessions',
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  }),
);
app.use('/media', express.static(mediaRoot));

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requireText(value: unknown, message: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAdminCredentials() {
  const email = normalizeText(process.env.ADMIN_EMAIL);
  const password = normalizeText(process.env.ADMIN_PASSWORD);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function getSmtpConfig() {
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
    secure: portNumber === 465,
    user,
  };
}

function toVoiceResponse(row: VoiceCardRecord) {
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

function toSampleRequestResponse(row: SampleRequestRecord) {
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

function toVoiceSampleResponse(row: VoiceSampleRecord) {
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

function toEmailLogResponse(row: SampleEmailLogRecord) {
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

function ensureAdminConfigured(res: Response) {
  if (!getAdminCredentials()) {
    res.status(503).json({
      error: 'Admin login is not configured.',
      message: 'Set ADMIN_EMAIL and ADMIN_PASSWORD before using the admin interface.',
    });
    return false;
  }

  return true;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
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

async function runUpload(req: Request, res: Response) {
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

async function runPublicVoiceUpload(req: Request, res: Response) {
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

async function fetchSampleRequestById(id: number) {
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

async function fetchVoiceSampleById(id: number) {
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

async function fetchVoiceCardById(id: number) {
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

async function fetchNextVoiceCardId() {
  const result = await pool.query<{ next_id: string }>('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM voice_cards');
  return Number(result.rows[0]?.next_id ?? 1);
}

async function markRequestStatus(requestId: number, status: SampleRequestStatus) {
  await pool.query(
    `
      UPDATE sample_requests
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [requestId, status],
  );
}

async function ensureRuntimeDirectories() {
  await fs.mkdir(voiceInboxDirectory, { recursive: true });
  await fs.mkdir(voicePublicDirectory, { recursive: true });
}

function getBaseUrl(req: Request) {
  return `${req.protocol}://${req.get('host')}`;
}

async function serveAdminShell(res: Response) {
  const adminIndexPath = path.join(adminDistRoot, 'index.html');

  try {
    await fs.access(adminIndexPath);
    res.sendFile(adminIndexPath);
  } catch {
    res.status(503).send('Admin frontend is not built yet. Run npm run build first.');
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ database: 'connected', ok: true });
  } catch (error) {
    res.status(503).json({
      database: 'unavailable',
      message: error instanceof Error ? error.message : 'Unknown database error',
      ok: false,
    });
  }
});

app.get('/api/voices', async (_req, res) => {
  try {
    const result = await pool.query<VoiceCardRecord>(`
      SELECT id, name, script_text, english_meaning, audio_file, duration, wave_seed, display_order, is_active
      FROM voice_cards
      WHERE is_active = TRUE
      ORDER BY display_order ASC, id ASC
    `);

    res.json({ voices: result.rows.map(toVoiceResponse) });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load voice cards',
      message: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

app.post('/api/sample-requests', async (req, res) => {
  try {
    const clientName = requireText(req.body.clientName ?? req.body.full_name, 'Client name is required.');
    const email = requireText(req.body.email ?? req.body.work_email, 'Email is required.');

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid work email address.' });
      return;
    }

    const result = await pool.query<SampleRequestRecord>(
      `
        INSERT INTO sample_requests (
          client_name,
          email,
          phone_number,
          company_name,
          message_details,
          selected_service,
          expected_monthly_volume,
          source_url,
          referrer,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        clientName,
        email,
        normalizeText(req.body.phoneNumber ?? req.body.phone_number),
        normalizeText(req.body.companyName ?? req.body.company_name),
        normalizeText(req.body.messageDetails ?? req.body.message_details ?? req.body.business_context),
        normalizeText(req.body.selectedService ?? req.body.selected_service ?? req.body.primary_use_case),
        normalizeText(req.body.expectedMonthlyVolume ?? req.body.expected_monthly_volume),
        normalizeText(req.body.sourceUrl ?? req.body.source_url),
        normalizeText(req.body.referrer),
        normalizeText(req.body.userAgent ?? req.body.user_agent),
      ],
    );

    res.status(201).json({
      message: 'Registration saved. We will follow up by email.',
      request: toSampleRequestResponse(result.rows[0]),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to save sample request.',
    });
  }
});

app.get('/api/admin/session', (req, res) => {
  res.json({
    adminEmail: req.session.adminUser?.email ?? null,
    authenticated: Boolean(req.session.adminUser),
  });
});

app.post('/api/admin/login', (req, res) => {
  if (!ensureAdminConfigured(res)) {
    return;
  }

  const credentials = getAdminCredentials();
  const email = normalizeText(req.body.email);
  const password = normalizeText(req.body.password);

  if (!credentials || !email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  if (email !== credentials.email || password !== credentials.password) {
    res.status(401).json({ error: 'Invalid admin credentials.' });
    return;
  }

  req.session.adminUser = { email: credentials.email };
  res.json({ adminEmail: credentials.email, authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(adminSessionCookieName);
    res.json({ authenticated: false });
  });
});

app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    const [countsResult, recentRequestsResult, recentEmailsResult] = await Promise.all([
      pool.query<{
        total_requests: string;
        new_requests: string;
        samples_ready: string;
        samples_sent: string;
      }>(`
        SELECT
          COUNT(*)::text AS total_requests,
          COUNT(*) FILTER (WHERE status = 'new')::text AS new_requests,
          COUNT(*) FILTER (WHERE status = 'sample_ready')::text AS samples_ready,
          COUNT(*) FILTER (WHERE status = 'sent')::text AS samples_sent
        FROM sample_requests
      `),
      pool.query<SampleRequestRecord>(`
        SELECT *
        FROM sample_requests
        ORDER BY created_at DESC
        LIMIT 8
      `),
      pool.query<
        SampleEmailLogRecord & {
          client_name: string | null;
          sample_title: string | null;
        }
      >(`
        SELECT
          l.*,
          r.client_name,
          COALESCE(vc.name, s.title) AS sample_title
        FROM sample_email_logs l
        LEFT JOIN sample_requests r ON r.id = l.request_id
        LEFT JOIN voice_samples s ON s.id = l.voice_sample_id
        LEFT JOIN voice_cards vc ON vc.id = l.voice_card_id
        ORDER BY COALESCE(l.sent_at, l.created_at) DESC
        LIMIT 8
      `),
    ]);

    const counts = countsResult.rows[0];

    res.json({
      recentEmails: recentEmailsResult.rows.map((row) => ({
        ...toEmailLogResponse(row),
        clientName: row.client_name,
        sampleTitle: row.sample_title,
      })),
      recentRequests: recentRequestsResult.rows.map(toSampleRequestResponse),
      stats: {
        newRequests: Number(counts?.new_requests ?? 0),
        samplesReady: Number(counts?.samples_ready ?? 0),
        samplesSent: Number(counts?.samples_sent ?? 0),
        totalRequests: Number(counts?.total_requests ?? 0),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load admin dashboard.',
    });
  }
});

app.get('/api/admin/sample-requests', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query<SampleRequestRecord>(`
      SELECT *
      FROM sample_requests
      ORDER BY created_at DESC
    `);

    res.json({ requests: result.rows.map(toSampleRequestResponse) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load sample requests.',
    });
  }
});

app.get('/api/admin/sample-requests/:id', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);

    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const sampleRequest = await fetchSampleRequestById(requestId);

    if (!sampleRequest) {
      res.status(404).json({ error: 'Sample request not found.' });
      return;
    }

    const emailLogsResult = await pool.query<
      SampleEmailLogRecord & {
        sample_title: string | null;
      }
    >(
      `
        SELECT
          l.*,
          COALESCE(vc.name, s.title) AS sample_title
        FROM sample_email_logs l
        LEFT JOIN voice_samples s ON s.id = l.voice_sample_id
        LEFT JOIN voice_cards vc ON vc.id = l.voice_card_id
        WHERE l.request_id = $1
        ORDER BY COALESCE(l.sent_at, l.created_at) DESC
      `,
      [requestId],
    );

    res.json({
      emailLogs: emailLogsResult.rows.map((row) => ({
        ...toEmailLogResponse(row),
        sampleTitle: row.sample_title,
      })),
      request: toSampleRequestResponse(sampleRequest),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load the sample request.',
    });
  }
});

app.patch('/api/admin/sample-requests/:id', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);

    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const existing = await fetchSampleRequestById(requestId);

    if (!existing) {
      res.status(404).json({ error: 'Sample request not found.' });
      return;
    }

    const nextStatus = normalizeText(req.body.status) as SampleRequestStatus | null;

    if (nextStatus && !validRequestStatuses.has(nextStatus)) {
      res.status(400).json({ error: 'Invalid request status.' });
      return;
    }

    const nextEmail = normalizeText(req.body.email) ?? existing.email;
    const nextPhoneNumber = Object.prototype.hasOwnProperty.call(req.body, 'phoneNumber')
      ? normalizeText(req.body.phoneNumber)
      : existing.phone_number;
    const nextCompanyName = Object.prototype.hasOwnProperty.call(req.body, 'companyName')
      ? normalizeText(req.body.companyName)
      : existing.company_name;
    const nextMessageDetails = Object.prototype.hasOwnProperty.call(req.body, 'messageDetails')
      ? normalizeText(req.body.messageDetails)
      : existing.message_details;
    const nextSelectedService = Object.prototype.hasOwnProperty.call(req.body, 'selectedService')
      ? normalizeText(req.body.selectedService)
      : existing.selected_service;
    const nextExpectedMonthlyVolume = Object.prototype.hasOwnProperty.call(req.body, 'expectedMonthlyVolume')
      ? normalizeText(req.body.expectedMonthlyVolume)
      : existing.expected_monthly_volume;

    if (!isValidEmail(nextEmail)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const result = await pool.query<SampleRequestRecord>(
      `
        UPDATE sample_requests
        SET
          client_name = $2,
          email = $3,
          phone_number = $4,
          company_name = $5,
          message_details = $6,
          selected_service = $7,
          expected_monthly_volume = $8,
          status = $9,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        requestId,
        normalizeText(req.body.clientName) ?? existing.client_name,
        nextEmail,
        nextPhoneNumber,
        nextCompanyName,
        nextMessageDetails,
        nextSelectedService,
        nextExpectedMonthlyVolume,
        nextStatus ?? existing.status,
      ],
    );

    res.json({ request: toSampleRequestResponse(result.rows[0]) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update the sample request.',
    });
  }
});

app.get('/api/admin/voice-cards', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query<VoiceCardRecord>(`
      SELECT id, name, script_text, english_meaning, audio_file, duration, wave_seed, display_order, is_active
      FROM voice_cards
      ORDER BY display_order ASC, id ASC
    `);

    res.json({
      voiceCards: result.rows.map(toVoiceResponse),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load voice cards.',
    });
  }
});

app.post('/api/admin/voice-cards', requireAdmin, async (req, res) => {
  try {
    const nextId = await fetchNextVoiceCardId();
    const name = requireText(req.body.name, 'Voice card name is required.');
    const scriptText = requireText(req.body.scriptText, 'Bangla script/caption is required.');
    const duration = toOptionalNumber(req.body.duration);
    const order = toOptionalNumber(req.body.order);
    const waveSeed = toOptionalNumber(req.body.waveSeed);
    const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : String(req.body.isActive) !== 'false';

    if (duration === null || duration <= 0) {
      res.status(400).json({ error: 'Enter a valid duration.' });
      return;
    }

    if (order === null || order < 0) {
      res.status(400).json({ error: 'Enter a valid display order.' });
      return;
    }

    if (waveSeed === null) {
      res.status(400).json({ error: 'Enter a valid wave seed.' });
      return;
    }

    const insertResult = await pool.query<VoiceCardRecord>(
      `
        INSERT INTO voice_cards (
          id,
          name,
          script_text,
          english_meaning,
          audio_file,
          duration,
          wave_seed,
          display_order,
          is_active,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `,
      [
        nextId,
        name,
        scriptText,
        normalizeText(req.body.englishMeaning),
        normalizeText(req.body.audioFile),
        duration,
        waveSeed,
        order,
        isActive,
      ],
    );

    res.status(201).json({ voiceCard: toVoiceResponse(insertResult.rows[0]) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create the voice card.',
    });
  }
});

app.patch('/api/admin/voice-cards/:id', requireAdmin, async (req, res) => {
  try {
    const voiceCardId = Number(req.params.id);

    if (!Number.isFinite(voiceCardId)) {
      res.status(400).json({ error: 'Invalid voice card id.' });
      return;
    }

    const existing = await fetchVoiceCardById(voiceCardId);

    if (!existing) {
      res.status(404).json({ error: 'Voice card not found.' });
      return;
    }

    const nextDuration = Object.prototype.hasOwnProperty.call(req.body, 'duration')
      ? toOptionalNumber(req.body.duration)
      : Number(existing.duration);
    const nextOrder = Object.prototype.hasOwnProperty.call(req.body, 'order')
      ? toOptionalNumber(req.body.order)
      : Number(existing.display_order);
    const nextWaveSeed = Object.prototype.hasOwnProperty.call(req.body, 'waveSeed')
      ? toOptionalNumber(req.body.waveSeed)
      : Number(existing.wave_seed);

    if (nextDuration === null || nextDuration <= 0) {
      res.status(400).json({ error: 'Enter a valid duration.' });
      return;
    }

    if (nextOrder === null || nextOrder < 0) {
      res.status(400).json({ error: 'Enter a valid display order.' });
      return;
    }

    if (nextWaveSeed === null) {
      res.status(400).json({ error: 'Enter a valid wave seed.' });
      return;
    }

    const nextActive = Object.prototype.hasOwnProperty.call(req.body, 'isActive')
      ? (typeof req.body.isActive === 'boolean' ? req.body.isActive : String(req.body.isActive) !== 'false')
      : existing.is_active;

    const result = await pool.query<VoiceCardRecord>(
      `
        UPDATE voice_cards
        SET
          name = $2,
          script_text = $3,
          english_meaning = $4,
          duration = $5,
          wave_seed = $6,
          display_order = $7,
          is_active = $8,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        voiceCardId,
        normalizeText(req.body.name) ?? existing.name,
        normalizeText(req.body.scriptText) ?? existing.script_text,
        Object.prototype.hasOwnProperty.call(req.body, 'englishMeaning')
          ? normalizeText(req.body.englishMeaning)
          : existing.english_meaning,
        nextDuration,
        nextWaveSeed,
        nextOrder,
        nextActive,
      ],
    );

    res.json({ voiceCard: toVoiceResponse(result.rows[0]) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update the voice card.',
    });
  }
});

app.post('/api/admin/voice-cards/:id/audio', requireAdmin, async (req, res) => {
  try {
    const voiceCardId = Number(req.params.id);

    if (!Number.isFinite(voiceCardId)) {
      res.status(400).json({ error: 'Invalid voice card id.' });
      return;
    }

    const existing = await fetchVoiceCardById(voiceCardId);

    if (!existing) {
      res.status(404).json({ error: 'Voice card not found.' });
      return;
    }

    await runPublicVoiceUpload(req, res);

    if (!req.file) {
      res.status(400).json({ error: 'Audio file is required.' });
      return;
    }

    const storedRelativePath = path.posix.join('voices', 'public', req.file.filename);
    const previousAudioFile = existing.audio_file;
    const result = await pool.query<VoiceCardRecord>(
      `
        UPDATE voice_cards
        SET audio_file = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [voiceCardId, storedRelativePath],
    );

    if (previousAudioFile && previousAudioFile.startsWith('voices/public/')) {
      const previousAbsolutePath = path.join(mediaRoot, previousAudioFile);
      if (previousAbsolutePath !== req.file.path) {
        await fs.unlink(previousAbsolutePath).catch(() => undefined);
      }
    }

    res.json({ voiceCard: toVoiceResponse(result.rows[0]) });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => undefined);
    }

    const message =
      error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? `File size exceeds ${Math.round(maxAudioFileSizeBytes / (1024 * 1024))}MB.`
        : error instanceof Error
          ? error.message
          : 'Failed to upload public voice audio.';

    res.status(400).json({ error: message });
  }
});

app.delete('/api/admin/voice-cards/:id', requireAdmin, async (req, res) => {
  try {
    const voiceCardId = Number(req.params.id);

    if (!Number.isFinite(voiceCardId)) {
      res.status(400).json({ error: 'Invalid voice card id.' });
      return;
    }

    const existing = await fetchVoiceCardById(voiceCardId);

    if (!existing) {
      res.status(404).json({ error: 'Voice card not found.' });
      return;
    }

    await pool.query(
      `
        DELETE FROM voice_cards
        WHERE id = $1
      `,
      [voiceCardId],
    );

    if (existing.audio_file && existing.audio_file.startsWith('voices/public/')) {
      const duplicateAudioResult = await pool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM voice_cards
          WHERE audio_file = $1
        `,
        [existing.audio_file],
      );

      if (Number(duplicateAudioResult.rows[0]?.count ?? 0) === 0) {
        await fs.unlink(path.join(mediaRoot, existing.audio_file)).catch(() => undefined);
      }
    }

    res.json({ deletedId: voiceCardId, message: 'Voice card deleted successfully.' });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete the voice card.',
    });
  }
});

app.post('/api/admin/send-sample', requireAdmin, async (req, res) => {
  let logId: number | null = null;

  try {
    const smtpConfig = getSmtpConfig();

    if (!smtpConfig) {
      res.status(503).json({
        error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
      });
      return;
    }

    const requestId = toOptionalNumber(req.body.requestId);
    const voiceCardId = toOptionalNumber(req.body.voiceCardId);
    const recipientEmail = requireText(req.body.recipientEmail, 'Recipient email is required.');
    const subject = requireText(req.body.subject, 'Email subject is required.');
    const message = requireText(req.body.message, 'Email message is required.');
    const deliveryMode = normalizeText(req.body.deliveryMode) ?? 'link';

    if (!requestId || !voiceCardId) {
      res.status(400).json({ error: 'Choose both a sample request and a public voice card.' });
      return;
    }

    if (!isValidEmail(recipientEmail)) {
      res.status(400).json({ error: 'Enter a valid recipient email address.' });
      return;
    }

    if (!validDeliveryModes.has(deliveryMode)) {
      res.status(400).json({ error: 'Invalid delivery mode.' });
      return;
    }

    const [sampleRequest, voiceCard] = await Promise.all([
      fetchSampleRequestById(requestId),
      fetchVoiceCardById(voiceCardId),
    ]);

    if (!sampleRequest) {
      res.status(404).json({ error: 'Sample request not found.' });
      return;
    }

    if (!voiceCard) {
      res.status(404).json({ error: 'Voice card not found.' });
      return;
    }

    if (!voiceCard.audio_file) {
      res.status(400).json({ error: 'The selected voice card does not have a public audio file yet.' });
      return;
    }

    const logResult = await pool.query<SampleEmailLogRecord>(
      `
        INSERT INTO sample_email_logs (
          request_id,
          voice_card_id,
          voice_sample_id,
          recipient_email,
          subject,
          message,
          delivery_mode,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [requestId, voiceCardId, null, recipientEmail, subject, message, deliveryMode, 'pending'],
    );

    logId = logResult.rows[0].id;

    const transporter = nodemailer.createTransport({
      auth: {
        pass: smtpConfig.pass,
        user: smtpConfig.user,
      },
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
    });

    const audioPublicUrl = new URL(`/media/${voiceCard.audio_file}`, getBaseUrl(req)).toString();
    const linkBlock =
      deliveryMode === 'link'
        ? `\n\nAudio sample:\n${audioPublicUrl}`
        : '';

    await transporter.sendMail({
      attachments:
        deliveryMode === 'attachment'
          ? [
              {
                filename: path.basename(voiceCard.audio_file),
                path: path.join(mediaRoot, voiceCard.audio_file),
              },
            ]
          : [],
      from: smtpConfig.from,
      subject,
      text: `${message}${linkBlock}`.trim(),
      to: recipientEmail,
    });

    await pool.query(
      `
        UPDATE sample_email_logs
        SET status = $2, sent_at = NOW(), error_message = NULL
        WHERE id = $1
      `,
      [logId, 'sent' satisfies EmailLogStatus],
    );

    await markRequestStatus(requestId, 'sent');

    res.json({
      message: 'Sample email sent successfully.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send sample email.';

    if (logId) {
      await pool.query(
        `
          UPDATE sample_email_logs
          SET status = $2, error_message = $3
          WHERE id = $1
        `,
        [logId, 'failed' satisfies EmailLogStatus, errorMessage],
      );
    }

    res.status(500).json({ error: errorMessage });
  }
});

app.use('/admin', express.static(adminDistRoot, { index: false }));

app.get('/admin', (req, res) => {
  res.redirect(req.session.adminUser ? '/admin/dashboard' : '/admin/login');
});

app.get('/admin/login', async (_req, res) => {
  await serveAdminShell(res);
});

app.get('/admin/voice-samples', (_req, res) => {
  res.redirect('/admin/voice-cards');
});

app.get(['/admin/dashboard', '/admin/sample-requests', '/admin/voice-cards', '/admin/send-sample'], async (req, res) => {
  if (!req.session.adminUser) {
    res.redirect('/admin/login');
    return;
  }

  await serveAdminShell(res);
});

app.listen(port, () => {
  console.log(`Bangla Voice API running at http://127.0.0.1:${port}`);
  console.log(`Serving media from ${mediaRoot}`);

  ensureRuntimeDirectories()
    .then(() => ensureSchema())
    .then(() => {
      console.log('PostgreSQL schema is ready.');
    })
    .catch((error) => {
      console.warn('Runtime setup is incomplete. Database-backed routes will fail until the environment is ready.');
      console.warn(error instanceof Error ? error.message : error);
    });
});
