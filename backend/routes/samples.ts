import { Router } from 'express';
import { createJsonRateLimiter, isValidEmail, normalizeText, requireText } from '../core.ts';
import { type SampleGenerationRecord } from '../db.ts';
import { requireCustomer } from './customer-auth.ts';
import {
  applyStarterMonthlyRefillIfDue,
  ensureStarterGrantIfEligible,
  getUserById,
} from '../services/customers.ts';
import {
  createPreviewGeneration,
  finalizeSampleGeneration,
  getOwnedSampleGeneration,
  getSampleAttachmentPath,
  markSampleDownloaded,
  regeneratePreviewGeneration,
} from '../services/sample-generations.ts';

const samplePreviewLimiter = createJsonRateLimiter({
  maxDevelopment: 20,
  maxProduction: 6,
  message: 'Too many sample preview requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});
const sampleFinalizeLimiter = createJsonRateLimiter({
  maxDevelopment: 30,
  maxProduction: 10,
  message: 'Too many sample finalization requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});
const sampleDownloadLimiter = createJsonRateLimiter({
  maxDevelopment: 80,
  maxProduction: 30,
  message: 'Too many sample download requests. Please try again later.',
  windowMs: 10 * 60 * 1000,
});

function toSamplePayload(sample: SampleGenerationRecord) {
  return {
    audioUrl: sample.audio_file ? `/media/${sample.audio_file}` : null,
    estimatedTokenCost: Number(sample.token_cost),
    finalized: sample.status === 'finalized',
    regenerationAttemptsRemaining: Math.max(
      0,
      Number(sample.max_regeneration_attempts) - Number(sample.regeneration_attempts_used),
    ),
    regenerationAttemptsUsed: Number(sample.regeneration_attempts_used),
    sampleId: Number(sample.id),
    wordCount: Number(sample.word_count),
  };
}

async function getHydratedCustomer(userId: number) {
  const user = await getUserById(userId);

  if (!user) {
    return null;
  }

  const granted = await ensureStarterGrantIfEligible(user);
  return applyStarterMonthlyRefillIfDue(granted);
}

function resolveStatusCode(error: unknown) {
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  return 400;
}

export function createSamplesRouter() {
  const router = Router();

  router.post('/api/samples/generate-preview', requireCustomer, samplePreviewLimiter, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (!user.email_verified_at) {
        res.status(403).json({ error: 'Verify your email before generating a sample preview.' });
        return;
      }

      if (!user.phone_verified_at) {
        res.status(403).json({ error: 'Verify your phone before generating a sample preview.' });
        return;
      }

      const email = requireText(req.body.email ?? req.body.work_email, 'Email is required.');

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      const result = await createPreviewGeneration({
        clientName: requireText(req.body.clientName ?? req.body.full_name, 'Full name is required.'),
        companyName: normalizeText(req.body.companyName ?? req.body.company_name),
        email,
        referrer: normalizeText(req.body.referrer),
        scriptText: requireText(req.body.scriptText ?? req.body.messageDetails, 'Script text is required.'),
        selectedService: requireText(req.body.selectedService ?? req.body.selected_service, 'Use case is required.'),
        sourceUrl: normalizeText(req.body.sourceUrl ?? req.body.source_url),
        userAgent: normalizeText(req.body.userAgent ?? req.body.user_agent),
        userId: user.id,
      });

      res.status(201).json({
        ...toSamplePayload(result.sample),
        downloadUrl: `/api/samples/${result.sample.id}/download`,
        tokensDeducted: 0,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to generate the sample preview.',
      });
    }
  });

  router.post('/api/samples/regenerate-preview', requireCustomer, samplePreviewLimiter, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (!user.email_verified_at) {
        res.status(403).json({ error: 'Verify your email before regenerating a sample preview.' });
        return;
      }

      if (!user.phone_verified_at) {
        res.status(403).json({ error: 'Verify your phone before regenerating a sample preview.' });
        return;
      }

      const sampleId = Number(req.body.sampleId);

      if (!Number.isFinite(sampleId)) {
        res.status(400).json({ error: 'Valid sample id is required.' });
        return;
      }

      const sample = await regeneratePreviewGeneration({
        sampleId,
        scriptText: requireText(req.body.scriptText ?? req.body.messageDetails, 'Script text is required.'),
        selectedService: requireText(req.body.selectedService ?? req.body.selected_service, 'Use case is required.'),
        userId: user.id,
      });

      res.json({
        ...toSamplePayload(sample),
        downloadUrl: `/api/samples/${sample.id}/download`,
        tokensDeducted: 0,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to regenerate the sample preview.',
      });
    }
  });

  router.post('/api/samples/finalize', requireCustomer, sampleFinalizeLimiter, async (req, res) => {
    try {
      const sampleId = Number(req.body.sampleId);

      if (!Number.isFinite(sampleId)) {
        res.status(400).json({ error: 'Valid sample id is required.' });
        return;
      }

      const result = await finalizeSampleGeneration(sampleId, req.session.customerUser!.id);

      res.json({
        ...toSamplePayload(result.sample),
        downloadUrl: `/api/samples/${result.sample.id}/download`,
        tokenBalance: result.tokenBalance,
        tokensDeducted: result.tokensDeducted,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to finalize the sample preview.',
      });
    }
  });

  router.get('/api/samples/:id/download', requireCustomer, sampleDownloadLimiter, async (req, res) => {
    try {
      const sampleId = Number(req.params.id);

      if (!Number.isFinite(sampleId)) {
        res.status(400).json({ error: 'Valid sample id is required.' });
        return;
      }

      const existing = await getOwnedSampleGeneration(sampleId, req.session.customerUser!.id);

      if (!existing) {
        res.status(404).json({ error: 'Sample preview not found.' });
        return;
      }

      const finalizedResult =
        existing.status === 'finalized'
          ? {
              sample: existing,
              tokenBalance: null,
              tokensDeducted: 0,
            }
          : await finalizeSampleGeneration(existing.id, req.session.customerUser!.id);

      const sample = finalizedResult.sample;
      const filePath = await getSampleAttachmentPath(sample);
      await markSampleDownloaded(sample.id, req.session.customerUser!.id);

      res.download(filePath, pathSafeFilename(sample.audio_file));
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to download the sample preview.',
      });
    }
  });

  return router;
}

function pathSafeFilename(audioFile: string) {
  const filename = audioFile.split('/').pop() ?? `sample-preview-${Date.now()}.wav`;
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
