import { Router } from 'express';
import { createHmac } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { pool, type SampleRequestRecord, type VoiceCardRecord } from '../db.ts';
import { defaultVoiceCards } from '../default-voice-cards.ts';
import {
  createJsonRateLimiter,
  customerSessionSecret,
  isValidEmail,
  normalizeText,
  requireText,
  toPublicApiError,
  toVoiceResponse,
} from '../core.ts';

const publicSiteUrl = 'https://banglaspeechai.com';
const sitemapLastModified = new Date().toISOString();
const sampleRequestLimiter = createJsonRateLimiter({
  maxDevelopment: 40,
  maxProduction: 8,
  message: 'Too many sample requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});
const defaultDailySampleRequestNetworkLimit = 20;

function getDailySampleRequestNetworkLimit() {
  const configured = Number(
    process.env.PUBLIC_SAMPLE_REQUEST_DAILY_IP_LIMIT
    ?? defaultDailySampleRequestNetworkLimit,
  );
  return Number.isFinite(configured)
    ? Math.max(1, Math.min(100, Math.floor(configured)))
    : defaultDailySampleRequestNetworkLimit;
}

function normalizeLimitedText(value: unknown, maxLength: number, fieldName: string) {
  const normalized = normalizeText(value);

  if (normalized && normalized.length > maxLength) {
    const error = new Error(`${fieldName} must be ${maxLength.toLocaleString()} characters or fewer.`);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  return normalized;
}

async function consumeDailySampleRequestAttempt(ipAddress: string) {
  const normalizedIp = ipKeyGenerator(ipAddress || 'unknown');
  const ipKeyHash = createHmac('sha256', customerSessionSecret)
    .update(normalizedIp)
    .digest('hex');
  const dailyLimit = getDailySampleRequestNetworkLimit();
  const result = await pool.query<{ attempt_count: number }>(
    `
      INSERT INTO public_action_rate_limits (
        action_type,
        ip_key_hash,
        bucket_date,
        attempt_count,
        updated_at
      )
      VALUES ('sample_request', $1, CURRENT_DATE, 1, NOW())
      ON CONFLICT (action_type, ip_key_hash, bucket_date)
      DO UPDATE SET
        attempt_count = public_action_rate_limits.attempt_count + 1,
        updated_at = NOW()
      WHERE public_action_rate_limits.attempt_count < $2
      RETURNING attempt_count
    `,
    [ipKeyHash, dailyLimit],
  );

  return result.rowCount === 1;
}

export function createPublicRouter() {
  const router = Router();

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${publicSiteUrl}/sitemap.xml`,
      ].join('\n'),
    );
  });

  router.get('/sitemap.xml', (_req, res) => {
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${publicSiteUrl}/</loc>
    <lastmod>${sitemapLastModified}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);
  });

  router.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch (error) {
      console.error('Public health check failed.', { error });
      res.status(503).json({
        message: 'Service unavailable.',
        ok: false,
      });
    }
  });

  router.get('/api/voices', async (_req, res) => {
    try {
      const result = await pool.query<VoiceCardRecord>(`
        SELECT id, name, script_text, english_meaning, audio_file, duration, wave_seed, display_order, is_active
        FROM voice_cards
        WHERE is_active = TRUE
        ORDER BY display_order ASC, id ASC
        LIMIT 100
      `);

      const voiceCards = result.rows.length ? result.rows : defaultVoiceCards;

      res.json({
        voices: voiceCards.map(toVoiceResponse),
      });
    } catch (error) {
      console.error('Failed to load public voice cards.', { error });
      res.status(500).json({
        error: 'Failed to load voice cards',
      });
    }
  });

  router.post('/api/sample-requests', sampleRequestLimiter, async (req, res) => {
    try {
      const clientName = requireText(req.body.clientName ?? req.body.full_name, 'Client name is required.');
      const email = requireText(req.body.email ?? req.body.work_email, 'Email is required.');

      if (!isValidEmail(email) || email.length > 254) {
        res.status(400).json({ error: 'Enter a valid work email address.' });
        return;
      }

      if (clientName.length > 100) {
        res.status(400).json({ error: 'Client name must be 100 characters or fewer.' });
        return;
      }

      if (!(await consumeDailySampleRequestAttempt(req.ip || 'unknown'))) {
        res.status(429).json({
          error: 'Too many sample requests were submitted from this network today. Please try again tomorrow.',
        });
        return;
      }

      await pool.query<SampleRequestRecord>(
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
          normalizeLimitedText(req.body.phoneNumber ?? req.body.phone_number, 32, 'Phone number'),
          normalizeLimitedText(req.body.companyName ?? req.body.company_name, 160, 'Company name'),
          normalizeLimitedText(
            req.body.messageDetails ?? req.body.message_details ?? req.body.business_context,
            2_000,
            'Message',
          ),
          normalizeLimitedText(
            req.body.selectedService ?? req.body.selected_service ?? req.body.primary_use_case,
            80,
            'Selected service',
          ),
          normalizeLimitedText(req.body.expectedMonthlyVolume ?? req.body.expected_monthly_volume, 80, 'Expected volume'),
          normalizeLimitedText(req.body.sourceUrl ?? req.body.source_url, 500, 'Source URL'),
          normalizeLimitedText(req.get('referer'), 500, 'Referrer'),
          normalizeLimitedText(req.get('user-agent'), 500, 'User agent'),
        ],
      );

      res.status(201).json({
        message: 'Registration saved. We will follow up by email.',
      });
    } catch (error) {
      console.error('Failed to save public sample request.', { error });
      const publicError = toPublicApiError(error, 'Failed to save sample request.');
      res.status(publicError.statusCode).json({ error: publicError.message });
    }
  });

  return router;
}
