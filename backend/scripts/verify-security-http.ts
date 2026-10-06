import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  forwardedFor?: string;
  headers?: Record<string, string>;
  method?: string;
  rawBody?: string;
};

type HttpResult = {
  cookie: string | null;
  headers: Headers;
  json: unknown;
  status: number;
  text: string;
};

function requireDisposableDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required and must point to a disposable database containing "security_test" in its name.',
    );
  }

  let databaseName = '';
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!databaseName.toLowerCase().includes('security_test')) {
    throw new Error(
      `Refusing to run against database ${databaseName || '(unknown)'}. Use a disposable database containing "security_test" in its name.`,
    );
  }

  return databaseName;
}

function asRecord(value: unknown, label: string) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}

function extractCookie(headers: Headers, cookieName: string) {
  const setCookie = headers.get('set-cookie');
  if (!setCookie) {
    return null;
  }

  const match = setCookie.match(new RegExp(`(?:^|,\\s*)(${cookieName}=[^;]+)`));
  return match?.[1] ?? null;
}

async function main() {
  const databaseName = requireDisposableDatabase(process.env.DATABASE_URL);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bangla-speech-ai-http-security-'));
  const customerCookieName = 'security_customer_session';
  const adminCookieName = 'bangla_voice_admin';
  const fakeApiKey = 'security-test-key-that-must-never-be-returned';
  const providerProfileSecret = 'provider-profile-secret-that-must-stay-server-side';
  const originalPassword = 'SecureCustomerPassword!2026';
  const updatedPassword = 'UpdatedCustomerPassword!2026';
  const observedResponseBodies: string[] = [];

  Object.assign(process.env, {
    ADMIN_EMAIL: 'admin@security.test',
    ADMIN_FRONTEND_URL: 'https://security.test/admin',
    ADMIN_PASSWORD: 'SecurityAdminCredential!2026',
    ADMIN_SESSION_SECRET: 'security-admin-session-secret-at-least-32-characters',
    BACKEND_URL: 'https://security.test',
    CUSTOMER_EMAIL_VERIFICATION_REQUIRED: 'false',
    CUSTOMER_PHONE_VERIFICATION_REQUIRED: 'false',
    CUSTOMER_SESSION_COOKIE_NAME: customerCookieName,
    CUSTOMER_SESSION_SECRET: 'security-customer-session-secret-at-least-32-characters',
    CUSTOMER_SIGNUP_DAILY_IP_LIMIT: '20',
    FRONTEND_URL: 'https://security.test',
    KEYPILLAR_TTS_API_KEY: fakeApiKey,
    NODE_ENV: 'production',
    PRIVATE_MEDIA_ROOT: path.join(temporaryRoot, 'private-media'),
    PUBLIC_SAMPLE_REQUEST_DAILY_IP_LIMIT: '20',
    VOICE_MEDIA_ROOT: path.join(temporaryRoot, 'public-media'),
  });

  const [
    { createApp },
    {
      ensureRuntimeDirectories,
      validateRuntimeConfiguration,
    },
    {
      ensureSchema,
      pool,
    },
  ] = await Promise.all([
    import('../app.ts'),
    import('../core.ts'),
    import('../db.ts'),
  ]);

  let server: ReturnType<ReturnType<typeof createApp>['listen']> | null = null;

  try {
    validateRuntimeConfiguration();
    await ensureRuntimeDirectories();
    await ensureSchema();

    const app = createApp();
    server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
      const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
      listeningServer.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    async function request(route: string, options: RequestOptions = {}): Promise<HttpResult> {
      const headers = new Headers({
        'x-forwarded-for': options.forwardedFor ?? '198.51.100.10',
        'x-forwarded-proto': 'https',
        ...options.headers,
      });

      if (options.cookie) {
        headers.set('cookie', options.cookie);
      }

      let body: string | undefined;
      if (options.rawBody !== undefined) {
        body = options.rawBody;
      } else if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(options.body);
      }

      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers,
        method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        redirect: 'manual',
      });
      const text = await response.text();
      observedResponseBodies.push(text);
      let json: unknown = null;

      if (text && response.headers.get('content-type')?.includes('application/json')) {
        json = JSON.parse(text);
      }

      return {
        cookie: extractCookie(response.headers, customerCookieName)
          ?? extractCookie(response.headers, adminCookieName),
        headers: response.headers,
        json,
        status: response.status,
        text,
      };
    }

    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.json, { ok: true });
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(health.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.match(health.headers.get('content-security-policy') ?? '', /object-src 'none'/);
    assert.equal(
      health.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains',
    );
    assert.match(health.headers.get('cache-control') ?? '', /no-store/);

    const hostileOrigin = await request('/api/health', {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(hostileOrigin.status, 403);
    assert.deepEqual(hostileOrigin.json, { error: 'CORS origin is not allowed.' });
    assert.equal(hostileOrigin.headers.get('access-control-allow-origin'), null);

    const allowedOrigin = await request('/api/health', {
      headers: { origin: 'https://security.test' },
    });
    assert.equal(allowedOrigin.status, 200);
    assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'https://security.test');
    assert.equal(allowedOrigin.headers.get('access-control-allow-credentials'), 'true');

    for (const route of [
      '/api/tts/jobs',
      '/api/tts/voice-profiles',
      '/api/payments/config',
      '/api/user/tokens',
    ]) {
      const response = await request(route);
      assert.equal(response.status, 401, `${route} must require a customer session.`);
    }

    const privateJobMedia = await request('/media/tts-jobs/user-1/job-1/private.wav');
    const privateVoiceMedia = await request('/media/tts-voice-profiles/user-1/profile-1/private.wav');
    assert.equal(privateJobMedia.status, 404);
    assert.equal(privateVoiceMedia.status, 404);

    const malformedJson = await request('/api/auth/login', {
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      rawBody: '{"email":',
    });
    assert.equal(malformedJson.status, 400);
    assert.deepEqual(malformedJson.json, { error: 'Bad request.' });
    assert.doesNotMatch(malformedJson.text, /SyntaxError|stack|node_modules/i);

    const voices = await request('/api/voices');
    assert.equal(voices.status, 200);
    const voicePayload = asRecord(voices.json, 'Voice response');
    assert(Array.isArray(voicePayload.voices));
    for (const voice of voicePayload.voices as unknown[]) {
      assert.equal('source' in asRecord(voice, 'Voice item'), false);
    }

    const lead = await request('/api/sample-requests', {
      body: {
        clientName: 'Security Test Lead',
        companyName: 'Security Test Company',
        email: 'lead@security.test',
        messageDetails: 'Please contact this test lead.',
        sourceUrl: 'https://security.test/?private=tracking-value',
      },
      forwardedFor: '198.51.100.20',
    });
    assert.equal(lead.status, 201);
    assert.deepEqual(lead.json, {
      message: 'Registration saved. We will follow up by email.',
    });
    assert.doesNotMatch(lead.text, /tracking-value|user-agent|referrer|requestId|"id"/i);

    const signupA = await request('/api/auth/signup', {
      body: {
        confirmPassword: originalPassword,
        countryCode: '+44',
        email: 'customer-a@security.test',
        fullName: 'Customer A',
        mobileNumber: '7700900101',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.31',
    });
    assert.equal(signupA.status, 201);
    assert(signupA.cookie, 'Signup must establish a customer session.');
    assert.match(signupA.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(signupA.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
    assert.match(signupA.headers.get('set-cookie') ?? '', /Secure/i);
    const signupAJson = asRecord(signupA.json, 'Signup A response');
    const signupAUser = asRecord(signupAJson.user, 'Signup A user');
    const userAId = Number(signupAUser.id);
    assert(Number.isSafeInteger(userAId) && userAId > 0);
    assert.equal(signupAUser.emailVerified, true);
    assert.equal(signupAUser.phoneVerified, true);
    assert.equal('passwordHash' in signupAUser, false);
    assert.equal('authVersion' in signupAUser, false);

    const duplicateSignup = await request('/api/auth/signup', {
      body: {
        confirmPassword: originalPassword,
        countryCode: '+44',
        email: 'customer-a@security.test',
        fullName: 'Duplicate Customer',
        mobileNumber: '7700900199',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.32',
    });
    assert.equal(duplicateSignup.status, 409);
    assert.deepEqual(duplicateSignup.json, {
      error: 'Unable to create an account with these details.',
    });

    const signupB = await request('/api/auth/signup', {
      body: {
        confirmPassword: originalPassword,
        countryCode: '+44',
        email: 'customer-b@security.test',
        fullName: 'Customer B',
        mobileNumber: '7700900102',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.33',
    });
    assert.equal(signupB.status, 201);
    assert(signupB.cookie, 'Second signup must establish a customer session.');
    const signupBUser = asRecord(asRecord(signupB.json, 'Signup B response').user, 'Signup B user');
    const userBId = Number(signupBUser.id);
    assert(Number.isSafeInteger(userBId) && userBId > 0 && userBId !== userAId);

    const unknownLogin = await request('/api/auth/login', {
      body: {
        email: 'missing-user@security.test',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.41',
    });
    assert.equal(unknownLogin.status, 401);
    assert.deepEqual(unknownLogin.json, { error: 'Invalid email or password.' });

    const secondLoginA = await request('/api/auth/login', {
      body: {
        email: 'customer-a@security.test',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.42',
    });
    assert.equal(secondLoginA.status, 200);
    assert(secondLoginA.cookie);
    assert.notEqual(secondLoginA.cookie, signupA.cookie);

    const contactChangeWithoutPassword = await request('/api/user/profile', {
      body: {
        countryCode: '+44',
        email: 'changed-a@security.test',
        fullName: 'Customer A',
        mobileNumber: '7700900101',
      },
      cookie: signupA.cookie!,
      method: 'PATCH',
    });
    assert.equal(contactChangeWithoutPassword.status, 400);
    assert.match(
      String(asRecord(contactChangeWithoutPassword.json, 'Profile error').error),
      /current password/i,
    );

    const passwordChange = await request('/api/user/change-password', {
      body: {
        confirmPassword: updatedPassword,
        currentPassword: originalPassword,
        newPassword: updatedPassword,
      },
      cookie: signupA.cookie!,
      forwardedFor: '198.51.100.43',
    });
    assert.equal(passwordChange.status, 200);
    assert(passwordChange.cookie, 'Password change must replace the active session.');
    assert.notEqual(passwordChange.cookie, signupA.cookie);

    const staleSession = await request('/api/tts/jobs', {
      cookie: secondLoginA.cookie!,
    });
    assert.equal(staleSession.status, 401);
    assert.match(String(asRecord(staleSession.json, 'Stale session response').error), /expired/i);

    const oldPasswordLogin = await request('/api/auth/login', {
      body: {
        email: 'customer-a@security.test',
        password: originalPassword,
      },
      forwardedFor: '198.51.100.44',
    });
    assert.equal(oldPasswordLogin.status, 401);

    const currentLoginA = await request('/api/auth/login', {
      body: {
        email: 'customer-a@security.test',
        password: updatedPassword,
      },
      forwardedFor: '198.51.100.45',
    });
    assert.equal(currentLoginA.status, 200);
    assert(currentLoginA.cookie);

    const jobResult = await pool.query<{ id: string }>(
      `
        INSERT INTO tts_generation_jobs (
          user_id,
          source_type,
          source_name,
          input_text,
          word_count,
          token_cost,
          quality_preset,
          status,
          processing_stage,
          provider_voice,
          voice_display_name,
          error_message
        )
        VALUES (
          $1,
          'text',
          'Private security test',
          'আমি নিরাপত্তা যাচাইয়ের জন্য একটি ব্যক্তিগত বাংলা বাক্য তৈরি করছি এবং এটি অন্য ব্যবহারকারী দেখতে পারবে না।',
          14,
          0,
          'wav_only',
          'failed',
          'failed',
          'keypillar-bd-female',
          'Keypillar Bangla Female',
          'Disposable security test failure.'
        )
        RETURNING id::text
      `,
      [userAId],
    );
    const jobId = Number(jobResult.rows[0]?.id);
    assert(Number.isSafeInteger(jobId) && jobId > 0);

    const invalidProviderProfileInput = await request('/api/tts/jobs/text/preview', {
      body: {
        inputText: 'এই অনুরোধে একটি গোপন প্রদানকারী পরিচয় পাঠানোর চেষ্টা করা হচ্ছে।',
        qualityPreset: 'wav_only',
        voiceProfileId: providerProfileSecret,
      },
      cookie: signupB.cookie!,
      forwardedFor: '198.51.100.52',
    });
    assert.equal(invalidProviderProfileInput.status, 400);

    const crossUserJobRead = await request(`/api/tts/jobs/${jobId}`, {
      cookie: signupB.cookie!,
    });
    const crossUserJobDelete = await request(`/api/tts/jobs/${jobId}`, {
      cookie: signupB.cookie!,
      method: 'DELETE',
    });
    assert.equal(crossUserJobRead.status, 404);
    assert.equal(crossUserJobDelete.status, 404);

    for (const route of [
      '/api/tts/jobs/1.5',
      '/api/tts/jobs/9007199254740992',
      '/api/payments/1.5',
    ]) {
      const response = await request(route, { cookie: currentLoginA.cookie! });
      assert.equal(response.status, 400, `${route} must reject malformed numeric IDs.`);
    }

    const profileResult = await pool.query<{ id: string }>(
      `
        INSERT INTO tts_voice_profiles (
          user_id,
          provider_profile_id,
          provider_sync_status,
          display_name,
          reference_text,
          consent_confirmed_at,
          consent_version
        )
        VALUES ($1, $2, 'ready', 'Private voice A', 'আমি একটি ব্যক্তিগত কণ্ঠ পরীক্ষা করছি।', NOW(), 'security-test')
        RETURNING id::text
      `,
      [userAId, providerProfileSecret],
    );
    const profileId = Number(profileResult.rows[0]?.id);
    assert(Number.isSafeInteger(profileId) && profileId > 0);

    const profileListA = await request('/api/tts/voice-profiles', {
      cookie: currentLoginA.cookie!,
    });
    assert.equal(profileListA.status, 200);
    assert.match(profileListA.text, /Private voice A/);
    assert.doesNotMatch(profileListA.text, new RegExp(providerProfileSecret));
    assert.doesNotMatch(profileListA.text, /providerProfileId|provider_profile_id/);

    const profileListB = await request('/api/tts/voice-profiles', {
      cookie: signupB.cookie!,
    });
    assert.equal(profileListB.status, 200);
    assert.doesNotMatch(profileListB.text, /Private voice A/);

    const crossUserProfileDefault = await request(`/api/tts/voice-profiles/${profileId}/default`, {
      cookie: signupB.cookie!,
      method: 'POST',
    });
    const crossUserProfileReference = await request(`/api/tts/voice-profiles/${profileId}/reference`, {
      cookie: signupB.cookie!,
    });
    assert.equal(crossUserProfileDefault.status, 404);
    assert.equal(crossUserProfileReference.status, 404);

    const malformedProfileId = await request('/api/tts/voice-profiles/1.5/default', {
      cookie: currentLoginA.cookie!,
      method: 'POST',
    });
    assert.equal(malformedProfileId.status, 400);

    const customerAgainstAdmin = await request('/api/admin/users', {
      cookie: currentLoginA.cookie!,
    });
    assert.equal(customerAgainstAdmin.status, 401);

    const adminLogin = await request('/api/admin/login', {
      body: {
        email: 'admin@security.test',
        password: 'SecurityAdminCredential!2026',
      },
      forwardedFor: '198.51.100.61',
    });
    assert.equal(adminLogin.status, 200);
    assert(adminLogin.cookie);
    assert.match(adminLogin.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(adminLogin.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
    assert.match(adminLogin.headers.get('set-cookie') ?? '', /Secure/i);

    const adminAgainstCustomer = await request('/api/tts/jobs', {
      cookie: adminLogin.cookie!,
    });
    assert.equal(adminAgainstCustomer.status, 401);

    const malformedResetToken = await request('/api/auth/reset-password', {
      body: {
        confirmPassword: updatedPassword,
        password: updatedPassword,
        token: 'not-a-valid-reset-token',
      },
      forwardedFor: '198.51.100.62',
    });
    assert.equal(malformedResetToken.status, 400);
    assert.match(
      String(asRecord(malformedResetToken.json, 'Malformed reset response').error),
      /invalid or expired/i,
    );

    process.env.ADMIN_PASSWORD = 'RotatedSecurityAdminCredential!2026';
    const rotatedAdminSession = await request('/api/admin/session', {
      cookie: adminLogin.cookie!,
    });
    assert.equal(rotatedAdminSession.status, 200);
    assert.deepEqual(rotatedAdminSession.json, {
      adminEmail: null,
      authenticated: false,
    });

    const unknownApi = await request('/api/security-test-does-not-exist');
    assert.equal(unknownApi.status, 404);
    assert.deepEqual(unknownApi.json, { error: 'Not found.' });

    const ownDelete = await request(`/api/tts/jobs/${jobId}`, {
      cookie: currentLoginA.cookie!,
      method: 'DELETE',
    });
    assert.equal(ownDelete.status, 200);
    assert.deepEqual(ownDelete.json, { deleted: true, jobId });
    const deletedRow = await pool.query('SELECT id FROM tts_generation_jobs WHERE id = $1', [jobId]);
    assert.equal(deletedRow.rowCount, 0);

    const joinedBodies = observedResponseBodies.join('\n');
    assert.doesNotMatch(joinedBodies, new RegExp(fakeApiKey));
    assert.doesNotMatch(joinedBodies, /password_hash|auth_version|DATABASE_URL|node_modules|BEGIN RSA PRIVATE KEY/i);

    console.log(JSON.stringify({
      checks: {
        accountEnumeration: 'generic duplicate and login responses',
        cors: 'hostile origin rejected',
        malformedInput: 'JSON and numeric IDs rejected',
        objectAuthorization: 'cross-user jobs and voice profiles hidden',
        privateMedia: 'direct paths blocked',
        publicLeakage: 'health, voices, and lead responses minimized',
        secretLeakage: 'provider IDs, API key, password hash, and auth version absent',
        sessionIsolation: 'admin/customer cookies separated; password changes revoke stale sessions',
      },
      database: databaseName,
      ok: true,
    }, null, 2));
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    await pool.end();
    await fs.rm(temporaryRoot, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
