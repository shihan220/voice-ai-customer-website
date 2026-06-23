import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mediaRoot, normalizeText } from '../core.ts';

const developmentFallbackByService: Record<string, string> = {
  avatar: 'voices/public/office-receptionist.wav',
  sales: 'voices/public/ai-self-service-agent.wav',
  support: 'voices/public/ecommerce-support.wav',
  ugc: 'voices/public/business-consultant.wav',
};

const defaultFallbackAudioFile = 'voices/public/ai-self-service-agent.wav';

export type GeneratedSampleAudio = {
  audioFile: string;
  sourceKind: 'fallback' | 'provider';
  storageKey: string | null;
};

type GenerateVoicePreviewInput = {
  sampleId?: number | null;
  scriptText: string;
  selectedService: string;
};

type VoiceProviderConfig = {
  apiKey: string | null;
  apiUrl: string | null;
  enabled: boolean;
  modelId: string | null;
  voiceId: string | null;
};

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

function getVoiceProviderConfig(): VoiceProviderConfig {
  return {
    apiKey: normalizeText(process.env.VOICE_MODEL_API_KEY),
    apiUrl: normalizeText(process.env.VOICE_MODEL_API_URL),
    enabled: normalizeText(process.env.VOICE_MODEL_PROVIDER_ENABLED) === 'true',
    modelId: normalizeText(process.env.VOICE_MODEL_ID),
    voiceId: normalizeText(process.env.VOICE_MODEL_VOICE_ID),
  };
}

async function assertMediaExists(audioFile: string) {
  const absolutePath = path.join(mediaRoot, audioFile);

  try {
    await fs.access(absolutePath);
  } catch {
    throw withStatus('Preview audio is not available for this sample yet.', 503);
  }
}

function resolveFallbackAudioFile(selectedService: string) {
  if (process.env.NODE_ENV === 'production') {
    throw withStatus('Sample preview generation is not configured for this environment.', 503);
  }

  const normalizedService = normalizeText(selectedService)?.toLowerCase() ?? '';
  return developmentFallbackByService[normalizedService] ?? defaultFallbackAudioFile;
}

async function generateWithFallback(input: GenerateVoicePreviewInput): Promise<GeneratedSampleAudio> {
  const audioFile = resolveFallbackAudioFile(input.selectedService);
  await assertMediaExists(audioFile);

  return {
    audioFile,
    sourceKind: 'fallback',
    storageKey: null,
  };
}

async function generateWithProvider(_input: GenerateVoicePreviewInput): Promise<GeneratedSampleAudio> {
  const config = getVoiceProviderConfig();

  if (!config.enabled) {
    throw withStatus('Voice model provider mode is disabled.', 503);
  }

  if (!config.apiKey) {
    throw withStatus('Voice model provider is enabled but VOICE_MODEL_API_KEY is missing.', 503);
  }

  if (!config.apiUrl) {
    throw withStatus('Voice model provider is enabled but VOICE_MODEL_API_URL is missing.', 503);
  }

  throw withStatus(
    'Voice model provider integration is scaffolded but not implemented yet. Add the provider request/response logic in backend/services/voice-provider.ts.',
    503,
  );
}

export async function generateSampleAudio(input: GenerateVoicePreviewInput): Promise<GeneratedSampleAudio> {
  const config = getVoiceProviderConfig();

  if (config.enabled) {
    return generateWithProvider(input);
  }

  return generateWithFallback(input);
}

export function getVoiceProviderStatus() {
  const config = getVoiceProviderConfig();

  return {
    apiUrlConfigured: Boolean(config.apiUrl),
    enabled: config.enabled,
    hasApiKey: Boolean(config.apiKey),
    hasModelId: Boolean(config.modelId),
    hasVoiceId: Boolean(config.voiceId),
    readyForRealGeneration: false,
  };
}
