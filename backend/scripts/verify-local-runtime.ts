type HealthPayload = {
  ok?: boolean;
};

type VoicePayload = {
  voices?: Array<{
    audioFile: string | null;
    audioUrl: string | null;
    id: number;
    name: string;
  }>;
};

const fallbackVoiceAudioUrls = [
  '/media/voices/public/ai-self-service-agent.wav',
  '/media/voices/public/business-consultant.wav',
  '/media/voices/public/office-receptionist.wav',
  '/media/voices/public/appointment-taker.wav',
  '/media/voices/public/healthcare-assistant.wav',
  '/media/voices/public/ecommerce-support.wav',
  '/media/voices/public/banking-fintech-support.wav',
  '/media/voices/public/real-estate-lead-qualifier.wav',
  '/media/voices/public/education-admission-counsellor.wav',
  '/media/voices/public/restaurant-hospitality-reservation.wav',
];

function getBaseUrls() {
  const backendUrl = (process.env.BACKEND_URL ?? 'http://127.0.0.1:5181').replace(/\/+$/, '');
  const frontendUrl = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:5175').replace(/\/+$/, '');

  return { backendUrl, frontendUrl };
}

async function expectOk(url: string, label: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label} failed with status ${response.status}.`);
  }

  return response;
}

async function expectMediaOk(url: string, label: string) {
  const response = await fetch(url, { method: 'HEAD' });
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    throw new Error(`${label} failed with status ${response.status}.`);
  }

  if (!contentType.includes('audio/')) {
    throw new Error(`${label} returned unexpected content type ${contentType || 'unknown'}.`);
  }
}

async function expectNotFound(url: string, label: string) {
  const response = await fetch(url);

  if (response.status !== 404) {
    throw new Error(`${label} returned ${response.status} instead of 404.`);
  }
}

async function main() {
  const { backendUrl, frontendUrl } = getBaseUrls();

  const healthResponse = await expectOk(`${backendUrl}/api/health`, 'Backend health');
  const health = (await healthResponse.json()) as HealthPayload;

  if (health.ok !== true || Object.keys(health).some((key) => key !== 'ok')) {
    throw new Error(`Backend health returned unexpected payload: ${JSON.stringify(health)}.`);
  }

  const voicesResponse = await expectOk(`${backendUrl}/api/voices`, 'Voice API');
  const voicesPayload = (await voicesResponse.json()) as VoicePayload;
  const voices = voicesPayload.voices ?? [];
  let firstAudio: string | null = null;
  let verifiedFallbackVoices = 0;

  if (voices.length > 0) {
    const missingAudio = voices.filter((voice) => !voice.audioUrl || !voice.audioFile);

    if (missingAudio.length > 0) {
      throw new Error(`Voice API returned cards without audio: ${missingAudio.map((voice) => voice.id).join(', ')}.`);
    }

    firstAudio = voices[0]?.audioUrl ?? null;

    if (!firstAudio) {
      throw new Error('First voice card is missing audioUrl.');
    }

    await expectMediaOk(new URL(firstAudio, backendUrl).toString(), 'Voice media check');
  } else {
    await Promise.all(
      fallbackVoiceAudioUrls.map(async (audioUrl) => {
        await expectMediaOk(new URL(audioUrl, backendUrl).toString(), `Fallback voice media ${audioUrl}`);
      }),
    );

    firstAudio = fallbackVoiceAudioUrls[0] ?? null;
    verifiedFallbackVoices = fallbackVoiceAudioUrls.length;
  }

  await expectOk(`${frontendUrl}/`, 'Frontend home page');
  await expectOk(`${frontendUrl}/login`, 'Frontend login page');
  await expectOk(`${backendUrl}/admin/login`, 'Admin login page');
  await expectNotFound(`${backendUrl}/media/tts-jobs/private-check.wav`, 'Private TTS job media guard');
  await expectNotFound(`${backendUrl}/media/tts-voice-profiles/private-check.wav`, 'Private TTS voice profile media guard');

  console.log(
    JSON.stringify(
      {
        adminLogin: `${backendUrl}/admin/login`,
        backendHealth: `${backendUrl}/api/health`,
        firstAudio,
        fallbackVoiceFeed: voices.length === 0,
        frontendHome: `${frontendUrl}/`,
        frontendLogin: `${frontendUrl}/login`,
        privateMediaGuards: [
          '/media/tts-jobs',
          '/media/tts-voice-profiles',
        ],
        verifiedFallbackVoices,
        verifiedVoices: voices.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
