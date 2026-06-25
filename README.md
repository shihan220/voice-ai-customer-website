
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
- `FFMPEG_PATH`
- `TTS_CHUNK_MAX_CHARS`
- `TTS_MAX_ACTIVE_VOICE_PROFILES`

Optional integrations:

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
