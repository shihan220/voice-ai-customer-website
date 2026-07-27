import argon2 from 'argon2';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { customerSessionSecret, isCustomerFullyVerified } from '../core.ts';
import { pool, type AdminActionRecord, type BkashPaymentRecord, type EmailVerificationRecord, type PackageRecord, type PackageUpgradeRecord, type PasswordResetRecord, type PaymentProvider, type PaymentRecord, type PaymentStatus, type PaymentType, type PhoneVerificationRecord, type StripePaymentRecord, type TokenTransactionRecord, type TokenTransactionType, type UserActivityRecord, type UserPackageType, type UserRecord } from '../db.ts';

export type CustomerSessionUser = {
  authVersion: number;
  email: string;
  id: number;
};

const packageRank: Record<UserPackageType, number> = {
  gold: 1,
  platinum: 2,
  starter: 0,
};

export function isStrictPackageUpgrade(
  currentPackage: UserPackageType,
  targetPackage: UserPackageType,
) {
  return packageRank[targetPackage] > packageRank[currentPackage];
}

export function hashOpaqueToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashOtpCode(value: string) {
  return createHmac('sha256', customerSessionSecret).update(value).digest('hex');
}

export function verifyOtpCode(storedHash: string, value: string) {
  const secureCandidate = Buffer.from(hashOtpCode(value), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  if (stored.length === secureCandidate.length && timingSafeEqual(stored, secureCandidate)) {
    return true;
  }

  // Pending codes created before this hardening expire within 15 minutes.
  const legacyCandidate = Buffer.from(hashOpaqueToken(value), 'hex');
  return stored.length === legacyCandidate.length && timingSafeEqual(stored, legacyCandidate);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}

export function generateOtpCode() {
  return String(randomInt(100000, 999999));
}

export function generateResetToken() {
  return randomBytes(24).toString('hex');
}

export function normalizePhone(countryCode: string | null, mobileNumber: string | null) {
  if (!countryCode || !mobileNumber) {
    return null;
  }

  const normalizedCode = countryCode.trim().replace(/\s+/g, '');
  const normalizedNumber = mobileNumber.replace(/[^\d]/g, '');

  if (
    !/^\+?[1-9]\d{0,3}$/.test(normalizedCode)
    || !/^\d{4,14}$/.test(normalizedNumber)
  ) {
    return null;
  }

  const codeWithPlus = normalizedCode.startsWith('+') ? normalizedCode : `+${normalizedCode}`;
  const normalizedPhone = `${codeWithPlus}${normalizedNumber}`;

  return /^\+[1-9]\d{7,14}$/.test(normalizedPhone)
    ? normalizedPhone
    : null;
}

export async function getPackageByCode(packageCode: UserPackageType) {
  const result = await pool.query<PackageRecord>(
    `
      SELECT *
      FROM packages
      WHERE package_code = $1
      LIMIT 1
    `,
    [packageCode],
  );

  return result.rows[0] ?? null;
}

export async function listPackages() {
  const result = await pool.query<PackageRecord>(
    `
      SELECT *
      FROM packages
      ORDER BY display_order ASC, package_code ASC
    `,
  );

  return result.rows;
}

export async function getUserById(userId: number) {
  const result = await pool.query<UserRecord>(
    `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const result = await pool.query<UserRecord>(
    `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function getUserByMobileE164(mobileE164: string) {
  const result = await pool.query<UserRecord>(
    `
      SELECT *
      FROM users
      WHERE mobile_e164 = $1
      LIMIT 1
    `,
    [mobileE164],
  );

  return result.rows[0] ?? null;
}

export async function createUser(input: {
  countryCode: string | null;
  email: string;
  fullName?: string | null;
  mobileNumber: string | null;
  packageCode: UserPackageType;
  passwordHash: string;
}) {
  const packageRecord = await getPackageByCode(input.packageCode);

  if (!packageRecord) {
    throw new Error(`Package ${input.packageCode} is not configured.`);
  }

  const mobileE164 = normalizePhone(input.countryCode, input.mobileNumber);
  const result = await pool.query<UserRecord>(
    `
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        country_code,
        mobile_number,
        mobile_e164,
        package_code,
        token_balance
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      RETURNING *
    `,
    [input.fullName ?? null, input.email, input.passwordHash, input.countryCode, input.mobileNumber, mobileE164, input.packageCode],
  );

  return result.rows[0];
}

export async function consumeDailySignupAttempt(ipKeyHash: string, maxAttempts: number) {
  const result = await pool.query<{ attempt_count: number }>(
    `
      INSERT INTO signup_rate_limits (
        ip_key_hash,
        bucket_date,
        attempt_count
      )
      VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, 1)
      ON CONFLICT (ip_key_hash, bucket_date) DO UPDATE
      SET
        attempt_count = signup_rate_limits.attempt_count + 1,
        updated_at = NOW()
      WHERE signup_rate_limits.attempt_count < $2
      RETURNING attempt_count
    `,
    [ipKeyHash, maxAttempts],
  );

  return Boolean(result.rows[0]);
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET
        password_hash = $2,
        auth_version = auth_version + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId, passwordHash],
  );

  return result.rows[0] ?? null;
}

export async function markEmailVerified(userId: number) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function markPhoneVerified(userId: number) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET phone_verified_at = COALESCE(phone_verified_at, NOW()), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function createEmailVerification(
  userId: number,
  email: string,
  otpCode: string,
  purpose: 'email_change' | 'signup' = 'signup',
) {
  const otpHash = hashOtpCode(otpCode);
  const result = await pool.query<EmailVerificationRecord>(
    `
      INSERT INTO email_verifications (
        user_id,
        purpose,
        sent_to_email,
        otp_hash,
        otp_expires_at
      )
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
      RETURNING *
    `,
    [userId, purpose, email, otpHash],
  );

  return {
    otpCode,
    record: result.rows[0],
  };
}

export async function getLatestPendingEmailVerification(userId: number) {
  const result = await pool.query<EmailVerificationRecord>(
    `
      SELECT *
      FROM email_verifications
      WHERE user_id = $1
        AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function incrementEmailVerificationAttempts(id: number, maxAttempts: number) {
  const result = await pool.query(
    `
      UPDATE email_verifications
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1
        AND verified_at IS NULL
        AND otp_expires_at > NOW()
        AND attempts < $2
      RETURNING attempts
    `,
    [id, maxAttempts],
  );

  return Boolean(result.rows[0]);
}

export async function completeEmailVerification(id: number) {
  await pool.query(
    `
      UPDATE email_verifications
      SET verified_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id],
  );
}

export async function createPhoneVerification(
  userId: number,
  sentToPhone: string,
  otpCode: string,
  purpose: 'phone_change' | 'signup' = 'signup',
) {
  const otpHash = hashOtpCode(otpCode);
  const result = await pool.query<PhoneVerificationRecord>(
    `
      INSERT INTO phone_verifications (
        user_id,
        purpose,
        sent_to_phone,
        otp_hash,
        otp_expires_at
      )
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
      RETURNING *
    `,
    [userId, purpose, sentToPhone, otpHash],
  );

  return {
    otpCode,
    record: result.rows[0],
  };
}

export async function getLatestPendingPhoneVerification(userId: number) {
  const result = await pool.query<PhoneVerificationRecord>(
    `
      SELECT *
      FROM phone_verifications
      WHERE user_id = $1
        AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function incrementPhoneVerificationAttempts(id: number, maxAttempts: number) {
  const result = await pool.query(
    `
      UPDATE phone_verifications
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1
        AND verified_at IS NULL
        AND otp_expires_at > NOW()
        AND attempts < $2
      RETURNING attempts
    `,
    [id, maxAttempts],
  );

  return Boolean(result.rows[0]);
}

export async function completePhoneVerification(id: number) {
  await pool.query(
    `
      UPDATE phone_verifications
      SET verified_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id],
  );
}

export async function createPasswordReset(userId: number) {
  const token = generateResetToken();
  const tokenHash = hashOpaqueToken(token);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
    await client.query(
      `
        UPDATE password_resets
        SET used_at = COALESCE(used_at, NOW())
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [userId],
    );
    const result = await client.query<PasswordResetRecord>(
      `
        INSERT INTO password_resets (
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
        RETURNING *
      `,
      [userId, tokenHash],
    );
    await client.query('COMMIT');

    return {
      record: result.rows[0],
      token,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getValidPasswordResetByToken(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const result = await pool.query<PasswordResetRecord>(
    `
      SELECT *
      FROM password_resets
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function markPasswordResetUsed(resetId: number) {
  await pool.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = $1
    `,
    [resetId],
  );
}

export async function consumePasswordReset(input: {
  password: string;
  token: string;
}): Promise<
  | { status: 'disabled'; user: UserRecord }
  | { status: 'invalid'; user: null }
  | { status: 'updated'; user: UserRecord }
> {
  const client = await pool.connect();
  const tokenHash = hashOpaqueToken(input.token);

  try {
    await client.query('BEGIN');
    const resetResult = await client.query<PasswordResetRecord>(
      `
        SELECT *
        FROM password_resets
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash],
    );
    const reset = resetResult.rows[0];

    if (!reset) {
      await client.query('COMMIT');
      return { status: 'invalid', user: null };
    }

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [reset.user_id],
    );
    const user = userResult.rows[0];

    if (!user) {
      await client.query(
        `
          UPDATE password_resets
          SET used_at = NOW()
          WHERE id = $1
        `,
        [reset.id],
      );
      await client.query('COMMIT');
      return { status: 'invalid', user: null };
    }

    if (user.account_status !== 'active') {
      await client.query(
        `
          UPDATE password_resets
          SET used_at = NOW()
          WHERE id = $1
        `,
        [reset.id],
      );
      await client.query('COMMIT');
      return { status: 'disabled', user };
    }

    const passwordHash = await hashPassword(input.password);
    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          password_hash = $2,
          auth_version = auth_version + 1,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [user.id, passwordHash],
    );
    const updatedUser = updatedUserResult.rows[0];

    await client.query(
      `
        UPDATE password_resets
        SET used_at = NOW()
        WHERE id = $1
      `,
      [reset.id],
    );
    await client.query('COMMIT');

    if (!updatedUser) {
      return { status: 'invalid', user: null };
    }

    return { status: 'updated', user: updatedUser };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createPayment(input: {
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  packageCode?: UserPackageType | null;
  paymentType: PaymentType;
  provider: PaymentProvider;
  providerPaymentId?: string | null;
  tokenAmount?: number | null;
  userId: number;
}) {
  const result = await pool.query<PaymentRecord>(
    `
      INSERT INTO payments (
        user_id,
        provider,
        payment_type,
        status,
        amount,
        currency,
        package_code,
        token_amount,
        provider_payment_id,
        metadata
      )
      VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [
      input.userId,
      input.provider,
      input.paymentType,
      input.amount.toFixed(2),
      input.currency,
      input.packageCode ?? null,
      input.tokenAmount ?? null,
      input.providerPaymentId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return result.rows[0];
}

export async function getPaymentById(paymentId: number) {
  const result = await pool.query<PaymentRecord>(
    `
      SELECT *
      FROM payments
      WHERE id = $1
      LIMIT 1
    `,
    [paymentId],
  );

  return result.rows[0] ?? null;
}

export async function getPaymentByProviderPaymentId(provider: PaymentProvider, providerPaymentId: string) {
  const result = await pool.query<PaymentRecord>(
    `
      SELECT *
      FROM payments
      WHERE provider = $1
        AND provider_payment_id = $2
      LIMIT 1
    `,
    [provider, providerPaymentId],
  );

  return result.rows[0] ?? null;
}

export async function updatePaymentRecord(input: {
  metadata?: Record<string, unknown>;
  paymentId: number;
  providerPaymentId?: string | null;
  providerTransactionId?: string | null;
  status: PaymentStatus;
}) {
  const result = await pool.query<PaymentRecord>(
    `
      UPDATE payments
      SET
        status = CASE
          WHEN status = 'completed' AND $2 <> 'completed' THEN status
          ELSE $2
        END,
        provider_payment_id = COALESCE($3, provider_payment_id),
        provider_transaction_id = COALESCE($4, provider_transaction_id),
        metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
        completed_at = CASE WHEN status = 'completed' OR $2 = 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.paymentId,
      input.status,
      input.providerPaymentId ?? null,
      input.providerTransactionId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return result.rows[0] ?? null;
}

export async function createPackageUpgrade(input: {
  fromPackageCode: UserPackageType | null;
  grantedTokenAmount: number | null;
  paymentId: number | null;
  status: PaymentStatus;
  toPackageCode: UserPackageType;
  userId: number;
}) {
  const result = await pool.query<PackageUpgradeRecord>(
    `
      INSERT INTO package_upgrades (
        user_id,
        from_package_code,
        to_package_code,
        payment_id,
        granted_token_amount,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      input.userId,
      input.fromPackageCode,
      input.toPackageCode,
      input.paymentId,
      input.grantedTokenAmount,
      input.status,
    ],
  );

  return result.rows[0];
}

export async function upsertStripePayment(input: {
  checkoutSessionId: string;
  paymentId: number;
  paymentIntentId?: string | null;
  priceId?: string | null;
  rawPayload?: Record<string, unknown>;
  webhookEventId?: string | null;
}) {
  await pool.query(
    `
      INSERT INTO stripe_payments (
        payment_id,
        checkout_session_id,
        payment_intent_id,
        webhook_event_id,
        price_id,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (payment_id) DO UPDATE
      SET
        checkout_session_id = EXCLUDED.checkout_session_id,
        payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, stripe_payments.payment_intent_id),
        webhook_event_id = COALESCE(EXCLUDED.webhook_event_id, stripe_payments.webhook_event_id),
        price_id = COALESCE(EXCLUDED.price_id, stripe_payments.price_id),
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `,
    [
      input.paymentId,
      input.checkoutSessionId,
      input.paymentIntentId ?? null,
      input.webhookEventId ?? null,
      input.priceId ?? null,
      JSON.stringify(input.rawPayload ?? {}),
    ],
  );
}

export type StripePaymentAssociation = PaymentRecord & {
  stripe_checkout_session_id: StripePaymentRecord['checkout_session_id'];
  stripe_payment_intent_id: StripePaymentRecord['payment_intent_id'];
  stripe_price_id: StripePaymentRecord['price_id'];
};

export async function getStripePaymentAssociationBySessionId(checkoutSessionId: string) {
  const result = await pool.query<StripePaymentAssociation>(
    `
      SELECT
        p.*,
        s.checkout_session_id AS stripe_checkout_session_id,
        s.payment_intent_id AS stripe_payment_intent_id,
        s.price_id AS stripe_price_id
      FROM payments p
      INNER JOIN stripe_payments s ON s.payment_id = p.id
      WHERE p.provider = 'stripe'
        AND s.checkout_session_id = $1
      LIMIT 1
    `,
    [checkoutSessionId],
  );

  return result.rows[0] ?? null;
}

export async function recordStripeWebhook(input: {
  checkoutSessionId: string;
  paymentId: number;
  paymentIntentId?: string | null;
  rawPayload: Record<string, unknown>;
  webhookEventId: string;
}) {
  const result = await pool.query<StripePaymentRecord>(
    `
      UPDATE stripe_payments
      SET
        payment_intent_id = COALESCE($3, payment_intent_id),
        webhook_event_id = $4,
        raw_payload = $5::jsonb,
        updated_at = NOW()
      WHERE payment_id = $1
        AND checkout_session_id = $2
      RETURNING *
    `,
    [
      input.paymentId,
      input.checkoutSessionId,
      input.paymentIntentId ?? null,
      input.webhookEventId,
      JSON.stringify(input.rawPayload),
    ],
  );

  return result.rows[0] ?? null;
}

export async function upsertBkashPayment(input: {
  bkashPaymentId?: string | null;
  callbackPayload?: Record<string, unknown>;
  executePayload?: Record<string, unknown>;
  intent?: string | null;
  merchantInvoiceNumber?: string | null;
  paymentId: number;
  queryPayload?: Record<string, unknown>;
  rawMetadata?: Record<string, unknown>;
  trxId?: string | null;
}) {
  await pool.query(
    `
      INSERT INTO bkash_payments (
        payment_id,
        bkash_payment_id,
        trx_id,
        merchant_invoice_number,
        intent,
        callback_payload,
        execute_payload,
        query_payload,
        raw_metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
      ON CONFLICT (payment_id) DO UPDATE
      SET
        bkash_payment_id = COALESCE(EXCLUDED.bkash_payment_id, bkash_payments.bkash_payment_id),
        trx_id = COALESCE(EXCLUDED.trx_id, bkash_payments.trx_id),
        merchant_invoice_number = COALESCE(EXCLUDED.merchant_invoice_number, bkash_payments.merchant_invoice_number),
        intent = COALESCE(EXCLUDED.intent, bkash_payments.intent),
        callback_payload = EXCLUDED.callback_payload,
        execute_payload = EXCLUDED.execute_payload,
        query_payload = EXCLUDED.query_payload,
        raw_metadata = EXCLUDED.raw_metadata,
        updated_at = NOW()
    `,
    [
      input.paymentId,
      input.bkashPaymentId ?? null,
      input.trxId ?? null,
      input.merchantInvoiceNumber ?? null,
      input.intent ?? null,
      JSON.stringify(input.callbackPayload ?? {}),
      JSON.stringify(input.executePayload ?? {}),
      JSON.stringify(input.queryPayload ?? {}),
      JSON.stringify(input.rawMetadata ?? {}),
    ],
  );
}

export type BkashPaymentAssociation = PaymentRecord & {
  bkash_intent: BkashPaymentRecord['intent'];
  bkash_merchant_invoice_number: BkashPaymentRecord['merchant_invoice_number'];
  bkash_payment_id: BkashPaymentRecord['bkash_payment_id'];
};

export async function getPaymentByBkashPaymentId(bkashPaymentId: string) {
  const result = await pool.query<BkashPaymentAssociation>(
    `
      SELECT
        p.*,
        b.bkash_payment_id AS bkash_payment_id,
        b.merchant_invoice_number AS bkash_merchant_invoice_number,
        b.intent AS bkash_intent
      FROM payments p
      INNER JOIN bkash_payments b ON b.payment_id = p.id
      WHERE p.provider = 'bkash'
        AND b.bkash_payment_id = $1
      LIMIT 1
    `,
    [bkashPaymentId],
  );

  return result.rows[0] ?? null;
}

export async function finalizeCompletedPayment(paymentId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const paymentResult = await client.query<PaymentRecord>(
      `
        SELECT *
        FROM payments
        WHERE id = $1
        FOR UPDATE
      `,
      [paymentId],
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      throw new Error('Payment not found.');
    }

    if (payment.status === 'completed') {
      await client.query('COMMIT');
      return payment;
    }

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [payment.user_id],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found for payment.');
    }

    if (user.account_status !== 'active') {
      const blockedPaymentResult = await client.query<PaymentRecord>(
        `
          UPDATE payments
          SET
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          payment.id,
          JSON.stringify({
            finalizationBlockedReason: 'account_disabled',
            requiresManualRefundReview: true,
          }),
        ],
      );
      await client.query('COMMIT');
      return blockedPaymentResult.rows[0] ?? payment;
    }

    if (payment.payment_type === 'extra_tokens' && user.package_code === 'starter') {
      const blockedPaymentResult = await client.query<PaymentRecord>(
        `
          UPDATE payments
          SET
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          payment.id,
          JSON.stringify({
            finalizationBlockedReason: 'extra_tokens_require_paid_plan',
            requiresManualRefundReview: true,
          }),
        ],
      );
      await client.query('COMMIT');
      return blockedPaymentResult.rows[0] ?? payment;
    }

    if (
      payment.payment_type === 'package_upgrade'
      && payment.package_code
      && !isStrictPackageUpgrade(user.package_code, payment.package_code)
    ) {
      const blockedPaymentResult = await client.query<PaymentRecord>(
        `
          UPDATE payments
          SET
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          payment.id,
          JSON.stringify({
            finalizationBlockedReason: 'target_plan_is_not_an_upgrade',
            preservedPackageCode: user.package_code,
          }),
        ],
      );
      await client.query('COMMIT');
      return blockedPaymentResult.rows[0] ?? payment;
    }

    const updatedPaymentResult = await client.query<PaymentRecord>(
      `
        UPDATE payments
        SET
          status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [payment.id],
    );
    const updatedPayment = updatedPaymentResult.rows[0];

    if (!updatedPayment) {
      throw new Error('Failed to update payment.');
    }

    if (payment.payment_type === 'package_upgrade' && payment.package_code) {
      const packageResult = await client.query<PackageRecord>(
        `
          SELECT *
          FROM packages
          WHERE package_code = $1
          LIMIT 1
        `,
        [payment.package_code],
      );
      const packageRecord = packageResult.rows[0];

      if (!packageRecord) {
        throw new Error(`Package ${payment.package_code} is not configured.`);
      }

      const grantedBalance = Number(packageRecord.signup_token_grant);
      const nextBalance = Math.max(Number(user.token_balance), grantedBalance);
      const tokenDelta = nextBalance - Number(user.token_balance);

      await client.query(
        `
          UPDATE users
          SET
            package_code = $2,
            token_balance = $3,
            updated_at = NOW()
          WHERE id = $1
        `,
        [user.id, packageRecord.package_code, nextBalance],
      );

      const packageUpgradeResult = await client.query<PackageUpgradeRecord>(
        `
          INSERT INTO package_upgrades (
            user_id,
            from_package_code,
            to_package_code,
            payment_id,
            granted_token_amount,
            status
          )
          VALUES ($1, $2, $3, $4, $5, 'completed')
          RETURNING *
        `,
        [user.id, user.package_code, packageRecord.package_code, payment.id, grantedBalance],
      );
      const packageUpgrade = packageUpgradeResult.rows[0];

      if (tokenDelta !== 0) {
        await client.query(
          `
            INSERT INTO token_transactions (
              user_id,
              payment_id,
              package_upgrade_id,
              transaction_type,
              token_delta,
              balance_after,
              notes
            )
            VALUES ($1, $2, $3, 'package_upgrade', $4, $5, $6)
          `,
          [user.id, payment.id, packageUpgrade.id, tokenDelta, nextBalance, `Package upgrade to ${packageRecord.name}.`],
        );
      }
    }

    if (payment.payment_type === 'extra_tokens' && payment.token_amount) {
      const tokenAmount = Number(payment.token_amount);
      const nextBalance = Number(user.token_balance) + tokenAmount;

      await client.query(
        `
          UPDATE users
          SET
            token_balance = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [user.id, nextBalance],
      );

      await client.query(
        `
          INSERT INTO token_transactions (
            user_id,
            payment_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, $2, 'extra_purchase', $3, $4, $5)
        `,
        [user.id, payment.id, tokenAmount, nextBalance, 'Extra token purchase.'],
      );
    }

    await client.query('COMMIT');
    return updatedPayment;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createAdminAction(input: {
  actionType: string;
  adminEmail: string;
  metadata?: Record<string, unknown>;
  packageUpgradeId?: number | null;
  paymentId?: number | null;
  targetUserId?: number | null;
  tokenTransactionId?: number | null;
}) {
  const result = await pool.query<AdminActionRecord>(
    `
      INSERT INTO admin_actions (
        admin_email,
        action_type,
        target_user_id,
        payment_id,
        token_transaction_id,
        package_upgrade_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
    `,
    [
      input.adminEmail,
      input.actionType,
      input.targetUserId ?? null,
      input.paymentId ?? null,
      input.tokenTransactionId ?? null,
      input.packageUpgradeId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return result.rows[0];
}

export async function createUserActivityLog(input: {
  actionType: string;
  metadata?: Record<string, unknown>;
  userId: number;
}) {
  const result = await pool.query<UserActivityRecord>(
    `
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        metadata
      )
      VALUES ($1, $2, $3::jsonb)
      RETURNING *
    `,
    [input.userId, input.actionType, JSON.stringify(input.metadata ?? {})],
  );

  return result.rows[0];
}

export async function listUsers() {
  const result = await pool.query<UserRecord>(
    `
      SELECT *
      FROM users
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function listAllPayments() {
  const result = await pool.query<PaymentRecord>(
    `
      SELECT *
      FROM payments
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function listPackageUpgrades() {
  const result = await pool.query<PackageUpgradeRecord>(
    `
      SELECT *
      FROM package_upgrades
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function listAdminActions() {
  const result = await pool.query<AdminActionRecord>(
    `
      SELECT *
      FROM admin_actions
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function listTokenTransactions() {
  const result = await pool.query<TokenTransactionRecord>(
    `
      SELECT *
      FROM token_transactions
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `,
  );

  return result.rows;
}

export async function adminAdjustUserTokens(input: {
  adminEmail: string;
  notes?: string | null;
  tokenDelta: number;
  userId: number;
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [input.userId],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found.');
    }

    const nextBalance = Number(user.token_balance) + input.tokenDelta;

    if (nextBalance < 0) {
      throw new Error('Token balance cannot be negative.');
    }

    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          token_balance = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [user.id, nextBalance],
    );
    const updatedUser = updatedUserResult.rows[0];

    const transactionResult = await client.query<TokenTransactionRecord>(
      `
        INSERT INTO token_transactions (
          user_id,
          transaction_type,
          token_delta,
          balance_after,
          notes
        )
        VALUES ($1, 'admin_adjustment', $2, $3, $4)
        RETURNING *
      `,
      [user.id, input.tokenDelta, nextBalance, input.notes ?? 'Admin token adjustment'],
    );
    const transaction = transactionResult.rows[0];

    const actionResult = await client.query<AdminActionRecord>(
      `
        INSERT INTO admin_actions (
          admin_email,
          action_type,
          target_user_id,
          token_transaction_id,
          metadata
        )
        VALUES ($1, 'admin_token_adjustment', $2, $3, $4::jsonb)
        RETURNING *
      `,
      [
        input.adminEmail,
        user.id,
        transaction.id,
        JSON.stringify({
          nextBalance,
          notes: input.notes ?? null,
          tokenDelta: input.tokenDelta,
        }),
      ],
    );

    await client.query('COMMIT');

    return {
      action: actionResult.rows[0],
      transaction,
      user: updatedUser,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function adminUpgradeUserPackage(input: {
  adminEmail: string;
  notes?: string | null;
  packageCode: UserPackageType;
  userId: number;
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [input.userId],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found.');
    }

    const packageResult = await client.query<PackageRecord>(
      `
        SELECT *
        FROM packages
        WHERE package_code = $1
        LIMIT 1
      `,
      [input.packageCode],
    );
    const packageRecord = packageResult.rows[0];

    if (!packageRecord) {
      throw new Error(`Package ${input.packageCode} is not configured.`);
    }

    const nextBalance = Math.max(
      Number(user.token_balance),
      Number(packageRecord.signup_token_grant),
    );
    const tokenDelta = nextBalance - Number(user.token_balance);

    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          package_code = $2,
          token_balance = $3,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [user.id, packageRecord.package_code, nextBalance],
    );
    const updatedUser = updatedUserResult.rows[0];

    const packageUpgradeResult = await client.query<PackageUpgradeRecord>(
      `
        INSERT INTO package_upgrades (
          user_id,
          from_package_code,
          to_package_code,
          payment_id,
          granted_token_amount,
          status
        )
        VALUES ($1, $2, $3, NULL, $4, 'completed')
        RETURNING *
      `,
      [user.id, user.package_code, packageRecord.package_code, packageRecord.signup_token_grant],
    );
    const packageUpgrade = packageUpgradeResult.rows[0];

    let transaction: TokenTransactionRecord | null = null;

    if (tokenDelta !== 0) {
      const transactionResult = await client.query<TokenTransactionRecord>(
        `
          INSERT INTO token_transactions (
            user_id,
            package_upgrade_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, $2, 'package_upgrade', $3, $4, $5)
          RETURNING *
        `,
        [user.id, packageUpgrade.id, tokenDelta, nextBalance, input.notes ?? `Admin package upgrade to ${packageRecord.name}`],
      );
      transaction = transactionResult.rows[0];
    }

    const actionResult = await client.query<AdminActionRecord>(
      `
        INSERT INTO admin_actions (
          admin_email,
          action_type,
          target_user_id,
          token_transaction_id,
          package_upgrade_id,
          metadata
        )
        VALUES ($1, 'admin_package_upgrade', $2, $3, $4, $5::jsonb)
        RETURNING *
      `,
      [
        input.adminEmail,
        user.id,
        transaction?.id ?? null,
        packageUpgrade.id,
        JSON.stringify({
          fromPackageCode: user.package_code,
          nextBalance,
          notes: input.notes ?? null,
          toPackageCode: packageRecord.package_code,
          tokenDelta,
        }),
      ],
    );

    await client.query('COMMIT');

    return {
      action: actionResult.rows[0],
      packageUpgrade,
      transaction,
      user: updatedUser,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserPackageAndBalance(input: {
  nextBalance: number;
  packageCode: UserPackageType;
  userId: number;
}) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET
        package_code = $2,
        token_balance = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [input.userId, input.packageCode, input.nextBalance],
  );

  return result.rows[0] ?? null;
}

export async function updateUserProfile(input: {
  contactChanged: boolean;
  countryCode: string;
  email: string;
  emailChanged: boolean;
  fullName: string | null;
  mobileE164: string;
  mobileNumber: string;
  phoneChanged: boolean;
  userId: number;
}) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET
        full_name = $2,
        email = $3,
        country_code = $4,
        mobile_number = $5,
        mobile_e164 = $6,
        email_verified_at = CASE WHEN $7 THEN NULL ELSE email_verified_at END,
        phone_verified_at = CASE WHEN $8 THEN NULL ELSE phone_verified_at END,
        auth_version = auth_version + CASE WHEN $9 THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.userId,
      input.fullName,
      input.email,
      input.countryCode,
      input.mobileNumber,
      input.mobileE164,
      input.emailChanged,
      input.phoneChanged,
      input.contactChanged,
    ],
  );

  return result.rows[0] ?? null;
}

export async function updateUserBalance(input: {
  nextBalance: number;
  starterGrantedAt?: Date | null;
  starterLastRefillAt?: Date | null;
  userId: number;
}) {
  const result = await pool.query<UserRecord>(
    `
      UPDATE users
      SET
        token_balance = $2,
        starter_granted_at = COALESCE($3, starter_granted_at),
        starter_last_refill_at = COALESCE($4, starter_last_refill_at),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [input.userId, input.nextBalance, input.starterGrantedAt ?? null, input.starterLastRefillAt ?? null],
  );

  return result.rows[0] ?? null;
}

export async function createTokenTransaction(input: {
  balanceAfter: number;
  notes?: string | null;
  packageUpgradeId?: number | null;
  paymentId?: number | null;
  tokenDelta: number;
  transactionType: TokenTransactionType;
  userId: number;
}) {
  const result = await pool.query<TokenTransactionRecord>(
    `
      INSERT INTO token_transactions (
        user_id,
        payment_id,
        package_upgrade_id,
        transaction_type,
        token_delta,
        balance_after,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      input.userId,
      input.paymentId ?? null,
      input.packageUpgradeId ?? null,
      input.transactionType,
      input.tokenDelta,
      input.balanceAfter,
      input.notes ?? null,
    ],
  );

  return result.rows[0];
}

export async function getTokenTransactionsForUser(userId: number) {
  const result = await pool.query<TokenTransactionRecord>(
    `
      SELECT *
      FROM token_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `,
    [userId],
  );

  return result.rows;
}

export async function getPaymentsForUser(userId: number) {
  const result = await pool.query<PaymentRecord>(
    `
      SELECT *
      FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `,
    [userId],
  );

  return result.rows;
}

export async function ensureStarterGrantIfEligible(user: UserRecord) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id],
    );
    const lockedUser = userResult.rows[0];

    if (
      !lockedUser
      || !isCustomerFullyVerified(lockedUser)
      || lockedUser.package_code !== 'starter'
      || lockedUser.starter_granted_at
    ) {
      await client.query('COMMIT');
      return lockedUser ?? user;
    }

    const packageResult = await client.query<PackageRecord>(
      `
        SELECT *
        FROM packages
        WHERE package_code = 'starter'
        LIMIT 1
      `,
    );
    const starterPackage = packageResult.rows[0];

    if (!starterPackage) {
      await client.query('COMMIT');
      return lockedUser;
    }

    const nextBalance = Math.max(Number(lockedUser.token_balance), Number(starterPackage.signup_token_grant));
    const tokenDelta = nextBalance - Number(lockedUser.token_balance);
    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          token_balance = $2,
          starter_granted_at = NOW(),
          starter_last_refill_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [lockedUser.id, nextBalance],
    );
    const updatedUser = updatedUserResult.rows[0] ?? lockedUser;

    if (tokenDelta !== 0) {
      await client.query(
        `
          INSERT INTO token_transactions (
            user_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, 'signup_grant', $2, $3, 'Starter signup token grant')
        `,
        [lockedUser.id, tokenDelta, nextBalance],
      );
    }

    await client.query('COMMIT');
    return updatedUser;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyStarterMonthlyRefillIfDue(user: UserRecord) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id],
    );
    const lockedUser = userResult.rows[0];

    if (!lockedUser || lockedUser.package_code !== 'starter') {
      await client.query('COMMIT');
      return lockedUser ?? user;
    }

    const packageResult = await client.query<PackageRecord>(
      `
        SELECT *
        FROM packages
        WHERE package_code = 'starter'
        LIMIT 1
      `,
    );
    const starterPackage = packageResult.rows[0];
    const lastRefill = lockedUser.starter_last_refill_at ?? lockedUser.starter_granted_at;

    if (!starterPackage || Number(starterPackage.monthly_refill_tokens) <= 0 || !lastRefill) {
      await client.query('COMMIT');
      return lockedUser;
    }

    const nextEligibleAt = new Date(lastRefill);
    nextEligibleAt.setMonth(nextEligibleAt.getMonth() + 1);

    if (nextEligibleAt > new Date()) {
      await client.query('COMMIT');
      return lockedUser;
    }

    const nextBalance = Number(starterPackage.monthly_refill_tokens);
    const tokenDelta = nextBalance - Number(lockedUser.token_balance);
    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          token_balance = $2,
          starter_last_refill_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [lockedUser.id, nextBalance],
    );
    const updatedUser = updatedUserResult.rows[0] ?? lockedUser;

    if (tokenDelta !== 0) {
      await client.query(
        `
          INSERT INTO token_transactions (
            user_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, 'monthly_refill', $2, $3, 'Starter monthly refill reset')
        `,
        [lockedUser.id, tokenDelta, nextBalance],
      );
    }

    await client.query('COMMIT');
    return updatedUser;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function downgradeUserToStarter(userId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [userId],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found.');
    }

    if (user.package_code === 'starter') {
      await client.query('COMMIT');
      return {
        activity: null,
        message: 'Account is already on the Starter package.',
        packageUpgrade: null,
        transaction: null,
        user,
      };
    }

    const starterPackageResult = await client.query<PackageRecord>(
      `
        SELECT *
        FROM packages
        WHERE package_code = 'starter'
        LIMIT 1
      `,
    );
    const starterPackage = starterPackageResult.rows[0];

    if (!starterPackage) {
      throw new Error('Starter package is not configured.');
    }

    const nextBalance = Math.min(Number(user.token_balance), Number(starterPackage.monthly_refill_tokens));
    const tokenDelta = nextBalance - Number(user.token_balance);

    const updatedUserResult = await client.query<UserRecord>(
      `
        UPDATE users
        SET
          package_code = 'starter',
          token_balance = $2,
          starter_granted_at = COALESCE(starter_granted_at, NOW()),
          starter_last_refill_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [user.id, nextBalance],
    );
    const updatedUser = updatedUserResult.rows[0];

    const packageUpgradeResult = await client.query<PackageUpgradeRecord>(
      `
        INSERT INTO package_upgrades (
          user_id,
          from_package_code,
          to_package_code,
          payment_id,
          granted_token_amount,
          status
        )
        VALUES ($1, $2, 'starter', NULL, NULL, 'completed')
        RETURNING *
      `,
      [user.id, user.package_code],
    );
    const packageUpgrade = packageUpgradeResult.rows[0];

    let transaction: TokenTransactionRecord | null = null;

    if (tokenDelta !== 0) {
      const transactionResult = await client.query<TokenTransactionRecord>(
        `
          INSERT INTO token_transactions (
            user_id,
            package_upgrade_id,
            transaction_type,
            token_delta,
            balance_after,
            notes
          )
          VALUES ($1, $2, 'package_upgrade', $3, $4, $5)
          RETURNING *
        `,
        [user.id, packageUpgrade.id, tokenDelta, nextBalance, 'User downgraded to the Starter package.'],
      );
      transaction = transactionResult.rows[0];
    }

    const activityResult = await client.query<UserActivityRecord>(
      `
        INSERT INTO user_activity_logs (
          user_id,
          action_type,
          metadata
        )
        VALUES ($1, 'plan_downgrade_to_starter', $2::jsonb)
        RETURNING *
      `,
      [
        user.id,
        JSON.stringify({
          fromPackageCode: user.package_code,
          nextBalance,
          toPackageCode: 'starter',
          tokenDelta,
        }),
      ],
    );

    await client.query('COMMIT');

    return {
      activity: activityResult.rows[0],
      message: 'Plan changed to Starter. Premium access was removed and Starter monthly refill is active again.',
      packageUpgrade,
      transaction,
      user: updatedUser,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
