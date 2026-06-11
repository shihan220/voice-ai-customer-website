import { Router } from 'express';
import { pool, type SampleRequestRecord, type VoiceCardRecord } from '../db.ts';
import {
  isValidEmail,
  normalizeText,
  requireText,
  toSampleRequestResponse,
  toVoiceResponse,
} from '../core.ts';

export function createPublicRouter() {
  const router = Router();

  router.get('/api/health', async (_req, res) => {
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

  router.get('/api/voices', async (_req, res) => {
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

  router.post('/api/sample-requests', async (req, res) => {
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

  return router;
}
