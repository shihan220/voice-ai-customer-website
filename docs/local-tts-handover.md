# Local TTS Handover

## Scope

This branch contains the local customer-facing TTS SaaS flow:

- customer signup and login
- local email and phone verification using development OTP previews
- starter generated-minute allowance and minute deduction after completed audio duration is measured
- pasted text to WAV and MP3
- text-based PDF to WAV and MP3
- per-job quality selection: Premium MP3 320 kbps + WAV, High MP3 192 kbps + WAV, Standard MP3 128 kbps + WAV, or WAV only
- customer history and authenticated downloads

The existing public marketing/sample-preview flow remains separate.

## Repository

- GitHub repo: `shihan220/voice-ai-customer-website`
- Working branch: `codex/changes-made-by-tanim`
- Main product area: `frontend/src/app/customer.tsx`
- TTS API routes: `backend/routes/tts.ts`
- TTS processing worker: `backend/services/tts-jobs.ts`
- TTS migration: `database/migrations/005_tts_generation_jobs.sql`

## Local Setup

Install dependencies from the repository root:

```bash
npm install
```

Create a local `.env` from `.env.example` and fill only local/deployment secrets there. Do not commit real API keys.

Minimum local variables:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bangla_voice_ai
PORT=5181
PRIVATE_MEDIA_ROOT=backend/private-media
FRONTEND_URL=http://127.0.0.1:5175
BACKEND_URL=http://127.0.0.1:5181
FRONTEND_BACKEND_URL=http://127.0.0.1:5181
CUSTOMER_SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_SESSION_SECRET=replace-with-a-second-long-random-secret
KEYPILLAR_TTS_API_KEY=your-local-key
KEYPILLAR_TTS_BASE_URL=https://api.keypillar.org
KEYPILLAR_TTS_ENDPOINT=/v1/voice/generate
KEYPILLAR_TTS_VOICE_ID=keypillar-bd-female
KEYPILLAR_TTS_FORMAT=wav
KEYPILLAR_TTS_PRONUNCIATION_MODE=english_preserve
KEYPILLAR_TTS_VOICE_PROFILES_ENDPOINT=/v1/voice-profiles
KEYPILLAR_TTS_REQUEST_TIMEOUT_MS=180000
TTS_CUSTOM_VOICE_CHUNK_MAX_CHARS=1200
TTS_MAX_ACTIVE_VOICE_PROFILES=3
FFMPEG_PATH=ffmpeg
```

Run backend and frontend together:

```bash
npm run dev:all
```

Default local URLs:

- Customer website: `http://127.0.0.1:5175`
- Backend API: `http://127.0.0.1:5181`

If those ports are already busy, run explicit ports:

```bash
PORT=5182 BACKEND_URL=http://127.0.0.1:5182 FRONTEND_URL=http://127.0.0.1:5176 npm run dev:backend
FRONTEND_BACKEND_URL=http://127.0.0.1:5182 npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

## Local Verification Flow

Run static checks:

```bash
npm run typecheck
npm run build
```

Run the one-command TTS verifier while the backend is running with `KEYPILLAR_TTS_API_KEY` set:

```bash
npm run verify:local:tts
```

For a backend on a non-default port:

```bash
BACKEND_URL=http://127.0.0.1:5182 npm run verify:local:tts
```

The verifier creates a disposable user, verifies email and phone with local OTP previews, creates one text job, creates one PDF job, downloads WAV/MP3 files, and validates the audio with `ffprobe`.
It also verifies the default Premium MP3 320 kbps + WAV preset, WAV-only mode without MP3 conversion, generated-minute deduction, and history after logout/login.

## Notes

- Keep SMTP and Twilio unset for local OTP preview behavior.
- Generated final audio is stored under `backend/private-media/tts-jobs/`, served only through authenticated owner-checked API routes, and ignored by git.
- Uploaded PDFs are not kept after extraction.
- PDF support is text extraction only; scanned PDFs are rejected.
- Long text is chunked by the backend and merged into final WAV/MP3 files.
- The Keypillar API is always called privately from the backend with `format=wav`.
- Do not send MP3 bitrate or quality preset fields to Keypillar. The website backend converts final WAV to MP3 with ffmpeg after generation when the user selected an MP3 preset.
- WAV is the highest-quality download. MP3 is generated from the final WAV at the per-job quality preset selected by the user.
- The Keypillar API key must stay server-side only. Never expose it in frontend code.
- Custom reference voices are website-owned per user in `tts_voice_profiles`. The browser only receives local profile IDs and display names; provider profile IDs stay server-side.
- The built-in voice is still available as `fixed`. Custom generation jobs store the selected local profile and provider profile at job creation time, so retry/start uses the original voice choice.
- Reference WAV uploads are accepted through `/api/tts/voice-profiles`, validated with `ffprobe`, sent to Keypillar privately, and discarded by the website after provider profile creation.
- Do not call provider-level default voice APIs for customers. Customer defaults are local database flags only.
