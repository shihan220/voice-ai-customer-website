
# BANGLA SPEECH AI

This repository contains the Bangla Speech AI customer website, admin panel, and PostgreSQL-backed Express API.

- `frontend/` - public customer-facing website and authenticated customer flows
- `admin-frontend/` - admin login, dashboard, public voice card management, customer list, payments, and request review
- `backend/` - Express API, PostgreSQL schema/bootstrap, media serving, customer auth, admin auth, and payment integrations

Customer TTS local handover notes live in `docs/local-tts-handover.md`.

Customer TTS generation calls Keypillar privately from the backend with `format=wav`. Download quality presets are handled only by this website backend after WAV generation: the backend either keeps WAV only or converts the final WAV to MP3 at the selected bitrate with ffmpeg.

## Running the code

Install dependencies from the repository root:

```bash
npm install
```

Start the public frontend:

```bash
npm run dev
```

Start the backend:

```bash
npm run dev:backend
```

Start both together:

```bash
npm run dev:all
```

Build both frontend bundles:

```bash
npm run build
```

Run the built production app:

```bash
npm run start
```

In production, the Express app serves the public website from `frontend/dist`, the admin app from `/admin`, API routes from `/api`, and public media from `/media`.

Run a typecheck:

```bash
npm run typecheck
```

Seed the public voice cards:

```bash
npm run db:seed:voices
```

Verify schema bootstrap against a disposable fresh database:

```bash
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5434/bangla_voice_ai" npm run verify:db:fresh
```

Required environment variables are documented in `.env.example`. The main ones are:

- `DATABASE_URL`
- `PORT`
- `PRIVATE_MEDIA_ROOT`
- `FRONTEND_URL`
- `ADMIN_FRONTEND_URL`
- `BACKEND_URL`
- `FRONTEND_BACKEND_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `CUSTOMER_SESSION_SECRET`
- `KEYPILLAR_TTS_API_KEY`
- `KEYPILLAR_TTS_BASE_URL`
- `KEYPILLAR_TTS_ENDPOINT`
- `KEYPILLAR_TTS_VOICE_ID`
- `KEYPILLAR_TTS_FORMAT`
- `KEYPILLAR_TTS_VOICE_PROFILES_ENDPOINT`
- `KEYPILLAR_TTS_VOICE_PROFILES_API_URL` (optional override)
- `KEYPILLAR_TTS_REQUEST_TIMEOUT_MS` (optional, defaults to `180000`)
- `TTS_PROVIDER_RETRY_MAX_ATTEMPTS` (optional, defaults to `6` total attempts)
- `TTS_PROVIDER_RETRY_BASE_DELAY_MS` (optional, defaults to `30000`)
- `TTS_PROVIDER_RETRY_MAX_DELAY_MS` (optional, defaults to `300000`)
- `FFMPEG_PATH`
- `TTS_CHUNK_MAX_CHARS`
- `TTS_CUSTOM_VOICE_CHUNK_MAX_CHARS`
- `TTS_MAX_ACTIVE_VOICE_PROFILES`

Temporary Keypillar connection failures are persisted and retried automatically. With the defaults, jobs wait approximately 12.5 minutes across six attempts before becoming failed; retry scheduling survives a website process restart.

Optional integrations:

- `CUSTOMER_EMAIL_VERIFICATION_REQUIRED` and `CUSTOMER_PHONE_VERIFICATION_REQUIRED` (`true` by default; set `false` to skip that verification gate temporarily)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `STRIPE_SECRET_KEY` and related Stripe price/webhook variables
- `BKASH_*` variables for bKash

## Local verification

The following checks are expected to pass without third-party credentials:

```bash
npm run typecheck
npm run build
npm audit --json
npm run verify:local:runtime
```

The customer TTS flow also has an end-to-end local verifier. Start the backend with a valid server-side `KEYPILLAR_TTS_API_KEY`, keep SMTP/Twilio unset for development OTP previews, and run:

```bash
npm run verify:local:tts
```

If the backend is running on a non-default port:

```bash
BACKEND_URL=http://127.0.0.1:5182 npm run verify:local:tts
```

Health checks:

```bash
curl http://127.0.0.1:5181/api/health
curl http://127.0.0.1:5181/api/voices
curl -I http://127.0.0.1:5181/media/voices/public/ai-self-service-agent.wav
```

Fresh schema bootstrap against a disposable database:

```bash
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5434/bangla_voice_ai" npm run verify:db:fresh
```

## Deploying `banglaspeechai.com`

Deploy one Node service for this repository, plus a managed PostgreSQL database and persistent private media storage. Use:

- build command: `npm ci && npm run build`
- start command: `npm run start`
- `NODE_ENV=production`
- `FRONTEND_URL=https://banglaspeechai.com`
- `ADMIN_FRONTEND_URL=https://banglaspeechai.com/admin`
- `BACKEND_URL=https://banglaspeechai.com`
- `BKASH_CALLBACK_URL=https://banglaspeechai.com/api/payments/bkash/callback`

Point Cloudflare DNS for `banglaspeechai.com` and `www.banglaspeechai.com` to the deployed service target supplied by the hosting provider. Keep `KEYPILLAR_TTS_API_KEY`, session secrets, database URL, SMTP/Twilio, and payment secrets only in the deployment environment, never in the browser or repository.

## External integration verification

The remaining production-like checks require real provider credentials.

### SMTP

Required variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Recommended Gmail example:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="BANGLA SPEECH AI <yourgmail@gmail.com>"
```

Verification target:

- admin can submit an email send action successfully
- delivery is logged in PostgreSQL
- failure path returns a clear backend error if SMTP is missing or rejected

### Stripe

Required variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_GOLD_PRICE_ID`
- `STRIPE_PLATINUM_PRICE_ID`
- `STRIPE_EXTRA_TOKEN_PRICE_ID`

Verification target:

- customer can create a checkout session
- a pending local payment exists before redirect
- webhook completion upgrades package or grants tokens once
- duplicate webhook delivery does not duplicate tokens

### bKash

Required variables:

- `BKASH_BASE_URL`
- `BKASH_USERNAME`
- `BKASH_PASSWORD`
- `BKASH_APP_KEY`
- `BKASH_APP_SECRET`
- `BKASH_CALLBACK_URL`

Verification target:

- grant token works
- create payment works
- callback redirects correctly
- execute/query confirm the payment
- successful completion updates package or tokens once
- cancelled or failed payment does not grant tokens
