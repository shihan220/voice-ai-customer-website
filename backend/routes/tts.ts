import { Router } from 'express';
import {
  createJsonRateLimiter,
  multer,
  normalizeText,
  requireText,
} from '../core.ts';
import type { TtsGenerationJobRecord } from '../db.ts';
import { requireCustomer } from './customer-auth.ts';
import {
  applyStarterMonthlyRefillIfDue,
  ensureStarterGrantIfEligible,
  getUserById,
} from '../services/customers.ts';
import {
  cancelTtsGenerationJob,
  deleteOwnedTtsGenerationJob,
  extractPdfText,
  getOwnedTtsGenerationJob,
  getTtsGenerationAttachmentPath,
  getTtsGenerationPreviewPath,
  listTtsGenerationJobsForUser,
  markTtsGenerationJobDownloaded,
  queueTtsPreviewJob,
  queueTtsGenerationJob,
  retryTtsGenerationJob,
  startTtsGenerationFromPreview,
} from '../services/tts-jobs.ts';
import {
  createTtsVoiceProfile,
  deactivateTtsVoiceProfile,
  generateTtsVoiceProfileTestPreview,
  getOwnedTtsVoiceProfileReferencePath,
  getOwnedTtsVoiceProfileTestPreviewPath,
  getTtsVoiceProfileLimits,
  listTtsVoiceProfilesForUser,
  setDefaultTtsVoiceProfile,
  syncTtsVoiceProfileWithProvider,
} from '../services/tts-voice-profiles.ts';

const maxPdfFileSizeBytes = 10 * 1024 * 1024;
const maxVoiceReferenceFileSizeBytes = 64 * 1024 * 1024;
const ttsPreviewLimiter = createJsonRateLimiter({
  maxDevelopment: 20,
  maxProduction: 5,
  message: 'Too many preview requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});
const ttsGenerationLimiter = createJsonRateLimiter({
  maxDevelopment: 12,
  maxProduction: 4,
  message: 'Too many audio generation requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});
const ttsDownloadLimiter = createJsonRateLimiter({
  maxDevelopment: 80,
  maxProduction: 30,
  message: 'Too many audio download requests. Please try again later.',
  windowMs: 10 * 60 * 1000,
});
const ttsVoiceProfileLimiter = createJsonRateLimiter({
  maxDevelopment: 12,
  maxProduction: 4,
  message: 'Too many voice profile requests. Please try again later.',
  windowMs: 15 * 60 * 1000,
});

const pdfUpload = multer({
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().endsWith('.pdf');
    const mimeType = file.mimetype.toLowerCase();

    if (!extension || mimeType !== 'application/pdf') {
      callback(new Error('Upload a PDF file.'));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxPdfFileSizeBytes,
  },
  storage: multer.memoryStorage(),
});

const voiceReferenceUpload = multer({
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().endsWith('.wav');
    const mimeType = file.mimetype.toLowerCase();
    const wavMimeType = mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave';

    if (!extension || !wavMimeType) {
      callback(new Error('Upload a WAV reference file.'));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxVoiceReferenceFileSizeBytes,
  },
  storage: multer.memoryStorage(),
});

function resolveStatusCode(error: unknown) {
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return 413;
  }

  return 400;
}

function safeTtsErrorMessage(error: unknown, fallback: string) {
  const statusCode = resolveStatusCode(error);

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return `PDF files must stay under ${Math.floor(maxPdfFileSizeBytes / (1024 * 1024))} MB.`;
  }

  if (error instanceof Error && statusCode < 500) {
    return error.message;
  }

  return fallback;
}

function safeVoiceProfileErrorMessage(error: unknown, fallback: string) {
  const statusCode = resolveStatusCode(error);

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return `Reference WAV files must stay under ${Math.floor(maxVoiceReferenceFileSizeBytes / (1024 * 1024))} MB.`;
  }

  if (
    error instanceof Error
    && 'publicMessage' in error
    && typeof (error as Error & { publicMessage?: unknown }).publicMessage === 'string'
  ) {
    return (error as Error & { publicMessage: string }).publicMessage;
  }

  if (error instanceof Error && statusCode < 500) {
    return error.message;
  }

  return fallback;
}

async function runPdfUpload(req: Parameters<Router['post']>[1] extends never ? never : any, res: any) {
  await new Promise<void>((resolve, reject) => {
    pdfUpload.single('file')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runVoiceReferenceUpload(req: Parameters<Router['post']>[1] extends never ? never : any, res: any) {
  await new Promise<void>((resolve, reject) => {
    voiceReferenceUpload.single('file')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function getHydratedCustomer(userId: number) {
  const user = await getUserById(userId);

  if (!user) {
    return null;
  }

  const granted = await ensureStarterGrantIfEligible(user);
  return applyStarterMonthlyRefillIfDue(granted);
}

function toTtsVoiceProfilePayload(profile: Awaited<ReturnType<typeof listTtsVoiceProfilesForUser>>[number]) {
  const qualityWarnings = Array.isArray(profile.reference_quality_warnings)
    ? profile.reference_quality_warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];

  return {
    createdAt: profile.created_at,
    displayName: profile.display_name,
    id: Number(profile.id),
    isDefault: profile.is_default,
    providerSyncError: profile.provider_sync_error,
    providerSyncStatus: profile.provider_sync_status,
    providerSyncedAt: profile.provider_synced_at,
    referenceAudioDownloadUrl: profile.reference_audio_file ? `/api/tts/voice-profiles/${profile.id}/reference` : null,
    referenceAudioFileSizeBytes: profile.reference_audio_file_size_bytes === null ? null : Number(profile.reference_audio_file_size_bytes),
    referenceNormalizedAt: profile.reference_normalized_at,
    referenceQualityWarnings: qualityWarnings,
    referenceAudioSeconds: profile.reference_audio_seconds === null ? null : Number(profile.reference_audio_seconds),
    referenceSampleRate: profile.reference_sample_rate === null ? null : Number(profile.reference_sample_rate),
    referenceText: profile.reference_text,
    testPreviewAudioSeconds: profile.test_preview_audio_seconds === null ? null : Number(profile.test_preview_audio_seconds),
    testPreviewAudioUrl: profile.test_preview_file
      ? `/api/tts/voice-profiles/${profile.id}/test-preview?ts=${profile.test_preview_generated_at?.getTime?.() ?? Date.now()}`
      : null,
    testPreviewGeneratedAt: profile.test_preview_generated_at,
    updatedAt: profile.updated_at,
  };
}

function toTtsJobPayload(job: TtsGenerationJobRecord, options?: { includeInputText?: boolean }) {
  return {
    createdAt: job.created_at,
    downloadedAt: job.downloaded_at,
    errorMessage: job.error_message,
    billableMinutes: job.billable_minutes === null ? null : Number(job.billable_minutes),
    completedAt: job.completed_at,
    generatedAudioSeconds: job.generated_audio_seconds === null ? null : Number(job.generated_audio_seconds),
    id: Number(job.id),
    inputText: options?.includeInputText ? job.input_text : undefined,
    mp3BitrateKbps: job.mp3_bitrate_kbps === null ? null : Number(job.mp3_bitrate_kbps),
    mp3DownloadUrl: job.status === 'completed' && job.mp3_file ? `/api/tts/jobs/${job.id}/download?format=mp3` : null,
    previewAudioSeconds: job.preview_audio_seconds === null ? null : Number(job.preview_audio_seconds),
    previewAudioUrl: job.preview_file ? `/api/tts/jobs/${job.id}/preview` : null,
    previewGeneratedAt: job.preview_generated_at,
    processingStage: job.processing_stage,
    providerVoice: job.provider_voice,
    qualityPreset: job.quality_preset,
    voiceDisplayName: job.voice_display_name,
    voiceProfileId: job.voice_profile_id === null ? null : Number(job.voice_profile_id),
    cancelReason: job.cancel_reason,
    cancellationRequestedAt: job.cancellation_requested_at,
    cancelledAt: job.cancelled_at,
    fullGenerationRequestedAt: job.full_generation_requested_at,
    sourceName: job.source_name,
    sourceType: job.source_type,
    status: job.status,
    tokenCost: Number(job.token_cost),
    updatedAt: job.updated_at,
    wavDownloadUrl: job.status === 'completed' && job.wav_file ? `/api/tts/jobs/${job.id}/download?format=wav` : null,
    wordCount: Number(job.word_count),
  };
}

export function createTtsRouter() {
  const router = Router();

  router.get('/api/tts/voice-profiles', requireCustomer, async (req, res) => {
    try {
      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);
      res.json({
        fixedVoice: {
          displayName: 'Keypillar Bangla Female',
          id: 'fixed',
        },
        limits: getTtsVoiceProfileLimits(),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load voice profiles.',
      });
    }
  });

  router.post('/api/tts/voice-profiles', requireCustomer, ttsVoiceProfileLimiter, async (req, res) => {
    try {
      await runVoiceReferenceUpload(req, res);

      if (!req.file) {
        res.status(400).json({ error: 'Upload a WAV reference file.' });
        return;
      }

      const profile = await createTtsVoiceProfile({
        audioBuffer: req.file.buffer,
        displayName: requireText(req.body.name, 'Voice name is required.'),
        referenceText: requireText(req.body.referenceText, 'Reference text is required.'),
        setDefault: req.body.setDefault === 'true' || req.body.setDefault === true,
        userId: req.session.customerUser!.id,
      });

      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);
      const isPending = profile.provider_sync_status === 'pending';
      res.status(isPending ? 202 : 201).json({
        limits: getTtsVoiceProfileLimits(),
        message: isPending
          ? 'Reference WAV saved. The voice needs activation after the Keypillar API is back online.'
          : 'Custom voice profile created.',
        voiceProfile: toTtsVoiceProfilePayload(profile),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to create the voice profile.'),
      });
    }
  });

  router.post('/api/tts/voice-profiles/:id/sync', requireCustomer, ttsVoiceProfileLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const profile = await syncTtsVoiceProfileWithProvider(profileId, req.session.customerUser!.id);
      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);

      res.json({
        voiceProfile: toTtsVoiceProfilePayload(profile),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to activate the voice profile.'),
      });
    }
  });

  router.post('/api/tts/voice-profiles/:id/test-preview', requireCustomer, ttsVoiceProfileLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const profile = await generateTtsVoiceProfileTestPreview(profileId, req.session.customerUser!.id);
      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);

      res.json({
        voiceProfile: toTtsVoiceProfilePayload(profile),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to generate the voice test preview.'),
      });
    }
  });

  router.post('/api/tts/voice-profiles/:id/default', requireCustomer, ttsVoiceProfileLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const profile = await setDefaultTtsVoiceProfile(profileId, req.session.customerUser!.id);
      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);

      res.json({
        voiceProfile: toTtsVoiceProfilePayload(profile),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to set the default voice profile.'),
      });
    }
  });

  router.post('/api/tts/voice-profiles/:id/deactivate', requireCustomer, ttsVoiceProfileLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const profile = await deactivateTtsVoiceProfile(profileId, req.session.customerUser!.id);
      const profiles = await listTtsVoiceProfilesForUser(req.session.customerUser!.id);

      res.json({
        deactivatedId: Number(profile.id),
        voiceProfiles: profiles.map(toTtsVoiceProfilePayload),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to delete the voice profile.'),
      });
    }
  });

  router.get('/api/tts/voice-profiles/:id/reference', requireCustomer, ttsDownloadLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const reference = await getOwnedTtsVoiceProfileReferencePath(profileId, req.session.customerUser!.id);
      res.download(reference.filePath, `${pathSafeFilename(reference.displayName)}-reference.wav`);
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to download the reference WAV.'),
      });
    }
  });

  router.get('/api/tts/voice-profiles/:id/test-preview', requireCustomer, ttsDownloadLimiter, async (req, res) => {
    try {
      const profileId = Number(req.params.id);

      if (!Number.isFinite(profileId)) {
        res.status(400).json({ error: 'Valid voice profile id is required.' });
        return;
      }

      const preview = await getOwnedTtsVoiceProfileTestPreviewPath(profileId, req.session.customerUser!.id);
      res.type('audio/wav');
      res.sendFile(preview.filePath);
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeVoiceProfileErrorMessage(error, 'Failed to play the test preview.'),
      });
    }
  });

  router.post('/api/tts/jobs/text/preview', requireCustomer, ttsPreviewLimiter, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const result = await queueTtsPreviewJob({
        inputText: requireText(req.body.inputText, 'Text input is required.'),
        qualityPreset: normalizeText(req.body.qualityPreset),
        sourceName: normalizeText(req.body.sourceName),
        sourceType: 'text',
        userId: user.id,
        voiceProfileId: req.body.voiceProfileId,
      });

      res.status(201).json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.post('/api/tts/jobs/text', requireCustomer, ttsGenerationLimiter, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const result = await queueTtsGenerationJob({
        inputText: requireText(req.body.inputText, 'Text input is required.'),
        qualityPreset: normalizeText(req.body.qualityPreset),
        sourceName: normalizeText(req.body.sourceName),
        sourceType: 'text',
        userId: user.id,
        voiceProfileId: req.body.voiceProfileId,
      });

      res.status(201).json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.post('/api/tts/jobs/pdf/preview', requireCustomer, ttsPreviewLimiter, async (req, res) => {
    try {
      await runPdfUpload(req, res);

      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Upload a PDF file.' });
        return;
      }

      const extractedText = await extractPdfText(req.file.buffer);
      const sourceName = normalizeText(req.body.sourceName) ?? normalizeText(req.file.originalname);

      const result = await queueTtsPreviewJob({
        inputText: extractedText,
        qualityPreset: normalizeText(req.body.qualityPreset),
        sourceName,
        sourceType: 'pdf',
        userId: user.id,
        voiceProfileId: req.body.voiceProfileId,
      });

      res.status(201).json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.post('/api/tts/jobs/pdf', requireCustomer, ttsGenerationLimiter, async (req, res) => {
    try {
      await runPdfUpload(req, res);

      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Upload a PDF file.' });
        return;
      }

      const extractedText = await extractPdfText(req.file.buffer);
      const sourceName = normalizeText(req.body.sourceName) ?? normalizeText(req.file.originalname);

      const result = await queueTtsGenerationJob({
        inputText: extractedText,
        qualityPreset: normalizeText(req.body.qualityPreset),
        sourceName,
        sourceType: 'pdf',
        userId: user.id,
        voiceProfileId: req.body.voiceProfileId,
      });

      res.status(201).json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.get('/api/tts/jobs', requireCustomer, async (req, res) => {
    try {
      const jobs = await listTtsGenerationJobsForUser(req.session.customerUser!.id);
      res.json({
        jobs: jobs.map((job) => toTtsJobPayload(job)),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load audio generation jobs.',
      });
    }
  });

  router.get('/api/tts/jobs/:id', requireCustomer, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      const job = await getOwnedTtsGenerationJob(jobId, req.session.customerUser!.id);

      if (!job) {
        res.status(404).json({ error: 'Audio generation job not found.' });
        return;
      }

      res.json({
        job: toTtsJobPayload(job, { includeInputText: true }),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to load the audio generation job.',
      });
    }
  });

  router.post('/api/tts/jobs/:id/retry', requireCustomer, ttsGenerationLimiter, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      const result = await retryTtsGenerationJob(jobId, req.session.customerUser!.id);

      res.json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.post('/api/tts/jobs/:id/start', requireCustomer, ttsGenerationLimiter, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      const result = await startTtsGenerationFromPreview(jobId, req.session.customerUser!.id);

      res.json({
        job: toTtsJobPayload(result.job, { includeInputText: true }),
        tokenBalance: result.tokenBalance,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Voice generation failed. Please try again.'),
      });
    }
  });

  router.post('/api/tts/jobs/:id/cancel', requireCustomer, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      const job = await cancelTtsGenerationJob(jobId, req.session.customerUser!.id);

      res.json({
        job: toTtsJobPayload(job, { includeInputText: true }),
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to cancel the audio generation job.',
      });
    }
  });

  router.get('/api/tts/jobs/:id/preview', requireCustomer, ttsDownloadLimiter, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      const job = await getOwnedTtsGenerationJob(jobId, req.session.customerUser!.id);

      if (!job) {
        res.status(404).json({ error: 'Audio generation job not found.' });
        return;
      }

      const filePath = await getTtsGenerationPreviewPath(job);
      res.sendFile(filePath);
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Failed to load the preview audio.'),
      });
    }
  });

  router.delete('/api/tts/jobs/:id', requireCustomer, ttsGenerationLimiter, async (req, res) => {
    try {
      const jobId = Number(req.params.id);

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      await deleteOwnedTtsGenerationJob(jobId, req.session.customerUser!.id);

      res.json({
        deleted: true,
        jobId,
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Failed to delete the audio generation job.'),
      });
    }
  });

  router.get('/api/tts/jobs/:id/download', requireCustomer, ttsDownloadLimiter, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const format = req.query.format === 'mp3' ? 'mp3' : req.query.format === 'wav' ? 'wav' : null;

      if (!Number.isFinite(jobId)) {
        res.status(400).json({ error: 'Valid job id is required.' });
        return;
      }

      if (!format) {
        res.status(400).json({ error: 'Provide format=wav or format=mp3.' });
        return;
      }

      const job = await getOwnedTtsGenerationJob(jobId, req.session.customerUser!.id);

      if (!job) {
        res.status(404).json({ error: 'Audio generation job not found.' });
        return;
      }

      const filePath = await getTtsGenerationAttachmentPath(job, format);
      res.download(filePath, async (downloadError) => {
        if (downloadError) {
          if (!res.headersSent) {
            const statusCode = resolveStatusCode(downloadError);
            res.status(statusCode).json({
              error: safeTtsErrorMessage(downloadError, 'Failed to download the generated audio.'),
            });
          }
          return;
        }

        await markTtsGenerationJobDownloaded(job.id, req.session.customerUser!.id).catch((error: unknown) => {
          console.error('Failed to mark TTS job downloaded.', {
            error,
            jobId: job.id,
            userId: req.session.customerUser!.id,
          });
        });
      });
    } catch (error) {
      const statusCode = resolveStatusCode(error);
      res.status(statusCode).json({
        error: safeTtsErrorMessage(error, 'Failed to download the generated audio.'),
      });
    }
  });

  return router;
}

function pathSafeFilename(value: string) {
  const normalized = normalizeText(value) ?? `voice-profile-${Date.now()}`;
  const safe = normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);

  return safe || `voice-profile-${Date.now()}`;
}
