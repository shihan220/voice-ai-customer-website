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
      SELECT id, name, script_text, audio_file, duration, wave_seed, display_order, is_active
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
          s.title AS sample_title
        FROM sample_email_logs l
        LEFT JOIN sample_requests r ON r.id = l.request_id
        LEFT JOIN voice_samples s ON s.id = l.voice_sample_id
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

    const [voiceSamplesResult, emailLogsResult] = await Promise.all([
      pool.query<VoiceSampleRecord>(
        `
          SELECT *
          FROM voice_samples
          WHERE request_id = $1
          ORDER BY created_at DESC
        `,
        [requestId],
      ),
      pool.query<SampleEmailLogRecord>(
        `
          SELECT *
          FROM sample_email_logs
          WHERE request_id = $1
          ORDER BY COALESCE(sent_at, created_at) DESC
        `,
        [requestId],
      ),
    ]);

    res.json({
      emailLogs: emailLogsResult.rows.map(toEmailLogResponse),
      request: toSampleRequestResponse(sampleRequest),
      voiceSamples: voiceSamplesResult.rows.map(toVoiceSampleResponse),
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

app.get('/api/admin/voice-samples', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query<
      VoiceSampleRecord & {
        client_name: string | null;
      }
    >(`
      SELECT
        s.*,
        r.client_name
      FROM voice_samples s
      LEFT JOIN sample_requests r ON r.id = s.request_id
      ORDER BY s.created_at DESC
    `);

    res.json({
      samples: result.rows.map((row) => ({
        ...toVoiceSampleResponse(row),
        clientName: row.client_name,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load voice samples.',
    });
  }
});

app.post('/api/admin/voice-samples', requireAdmin, async (req, res) => {
  try {
    await runUpload(req, res);

    if (!req.file) {
      res.status(400).json({ error: 'Audio file is required.' });
      return;
    }

    const title = requireText(req.body.title, 'Sample title is required.');
    const requestId = toOptionalNumber(req.body.requestId);

    if (requestId) {
      const linkedRequest = await fetchSampleRequestById(requestId);

      if (!linkedRequest) {
        await fs.unlink(req.file.path).catch(() => undefined);
        res.status(400).json({ error: 'Linked sample request was not found.' });
        return;
      }
    }

    const storedRelativePath = path.posix.join('voices', 'inbox', req.file.filename);

    const insertResult = await pool.query<VoiceSampleRecord>(
      `
        INSERT INTO voice_samples (
          title,
          request_id,
          original_filename,
          stored_filename,
          media_path,
          mime_type,
          file_size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        title,
        requestId,
        req.file.originalname,
        req.file.filename,
        storedRelativePath,
        req.file.mimetype,
        req.file.size,
      ],
    );

    const savedSample = insertResult.rows[0];

    if (savedSample.request_id) {
      await markRequestStatus(savedSample.request_id, 'sample_ready');
    }

    res.status(201).json({ sample: toVoiceSampleResponse(savedSample) });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => undefined);
    }

    const message =
      error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? `File size exceeds ${Math.round(maxAudioFileSizeBytes / (1024 * 1024))}MB.`
        : error instanceof Error
          ? error.message
          : 'Failed to upload voice sample.';

    res.status(400).json({ error: message });
  }
});

app.patch('/api/admin/voice-samples/:id', requireAdmin, async (req, res) => {
  try {
    const sampleId = Number(req.params.id);

    if (!Number.isFinite(sampleId)) {
      res.status(400).json({ error: 'Invalid sample id.' });
      return;
    }

    const existing = await fetchVoiceSampleById(sampleId);

    if (!existing) {
      res.status(404).json({ error: 'Voice sample not found.' });
      return;
    }

    const nextRequestIdValue = Object.prototype.hasOwnProperty.call(req.body, 'requestId')
      ? req.body.requestId === ''
        ? null
        : toOptionalNumber(req.body.requestId)
      : existing.request_id;

    if (nextRequestIdValue) {
      const linkedRequest = await fetchSampleRequestById(nextRequestIdValue);

      if (!linkedRequest) {
        res.status(400).json({ error: 'Linked sample request was not found.' });
        return;
      }
    }

    const result = await pool.query<VoiceSampleRecord>(
      `
        UPDATE voice_samples
        SET
          title = $2,
          request_id = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        sampleId,
        normalizeText(req.body.title) ?? existing.title,
        nextRequestIdValue,
      ],
    );

    const updated = result.rows[0];

    if (updated.request_id) {
      await markRequestStatus(updated.request_id, 'sample_ready');
    }

    res.json({ sample: toVoiceSampleResponse(updated) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update the voice sample.',
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
    const voiceSampleId = toOptionalNumber(req.body.voiceSampleId);
    const recipientEmail = requireText(req.body.recipientEmail, 'Recipient email is required.');
    const subject = requireText(req.body.subject, 'Email subject is required.');
    const message = requireText(req.body.message, 'Email message is required.');
    const deliveryMode = normalizeText(req.body.deliveryMode) ?? 'link';

    if (!requestId || !voiceSampleId) {
      res.status(400).json({ error: 'Choose both a sample request and a voice sample.' });
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

    const [sampleRequest, voiceSample] = await Promise.all([
      fetchSampleRequestById(requestId),
      fetchVoiceSampleById(voiceSampleId),
    ]);

    if (!sampleRequest) {
      res.status(404).json({ error: 'Sample request not found.' });
      return;
    }

    if (!voiceSample) {
      res.status(404).json({ error: 'Voice sample not found.' });
      return;
    }

    const logResult = await pool.query<SampleEmailLogRecord>(
      `
        INSERT INTO sample_email_logs (
          request_id,
          voice_sample_id,
          recipient_email,
          subject,
          message,
          delivery_mode,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [requestId, voiceSampleId, recipientEmail, subject, message, deliveryMode, 'pending'],
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

    const audioPublicUrl = new URL(`/media/${voiceSample.media_path}`, getBaseUrl(req)).toString();
    const linkBlock =
      deliveryMode === 'link'
        ? `\n\nAudio sample:\n${audioPublicUrl}`
        : '';

    await transporter.sendMail({
      attachments:
        deliveryMode === 'attachment'
          ? [
              {
                filename: voiceSample.original_filename,
                path: path.join(mediaRoot, voiceSample.media_path),
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

app.get(['/admin/dashboard', '/admin/sample-requests', '/admin/voice-samples', '/admin/send-sample'], async (req, res) => {
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
