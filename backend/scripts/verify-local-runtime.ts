type HealthPayload = {
  database?: string;
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

  if (health.ok !== true || health.database !== 'connected') {
    throw new Error(`Backend health returned unexpected payload: ${JSON.stringify(health)}.`);
  }

  const voicesResponse = await expectOk(`${backendUrl}/api/voices`, 'Voice API');
  const voicesPayload = (await voicesResponse.json()) as VoicePayload;
  const voices = voicesPayload.voices ?? [];

  if (voices.length === 0) {
    throw new Error('Voice API returned zero voice cards.');
  }

  const missingAudio = voices.filter((voice) => !voice.audioUrl || !voice.audioFile);

  if (missingAudio.length > 0) {
    throw new Error(`Voice API returned cards without audio: ${missingAudio.map((voice) => voice.id).join(', ')}.`);
  }

  const firstAudio = voices[0]?.audioUrl;

  if (!firstAudio) {
    throw new Error('First voice card is missing audioUrl.');
  }

  const mediaResponse = await fetch(new URL(firstAudio, backendUrl), { method: 'HEAD' });

  if (!mediaResponse.ok) {
    throw new Error(`Voice media check failed with status ${mediaResponse.status}.`);
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
        frontendHome: `${frontendUrl}/`,
        frontendLogin: `${frontendUrl}/login`,
        privateMediaGuards: [
          '/media/tts-jobs',
          '/media/tts-voice-profiles',
        ],
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
