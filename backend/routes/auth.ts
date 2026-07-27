import { Router, type Request, type Response } from 'express';
import { createHmac } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import twilio from 'twilio';
import {
  createJsonRateLimiter,
  customerSessionSecret,
  customerSessionCookieName,
  getBackendUrl,
  getFrontendUrl,
  getSmtpConfig,
  isCustomerEmailVerificationRequired,
  isCustomerEmailVerified,
  isCustomerPhoneVerificationRequired,
  isCustomerPhoneVerified,
  isValidEmail,
  nodemailer,
  normalizeText,
  requireText,
  toPublicApiError,
} from '../core.ts';
import {
  consumeDailySignupAttempt,
  consumePasswordReset,
  createEmailVerification,
  createPasswordReset,
  createPhoneVerification,
  createUser,
  completeEmailVerification,
  completePhoneVerification,
  ensureStarterGrantIfEligible,
  generateOtpCode,
  getLatestPendingEmailVerification,
  getLatestPendingPhoneVerification,
  getUserByEmail,
  getUserById,
  getUserByMobileE164,
  hashPassword,
  incrementEmailVerificationAttempts,
  incrementPhoneVerificationAttempts,
  markEmailVerified,
  markPhoneVerified,
  normalizePhone,
  verifyOtpCode,
  verifyPassword,
} from '../services/customers.ts';
import { type UserRecord } from '../db.ts';

const emailOtpPurposeText = 'Your BANGLA SPEECH AI email verification code';
const phoneOtpPurposeText = 'Your BANGLA SPEECH AI phone verification code';
const authLimiter = createJsonRateLimiter({
  maxDevelopment: 50,
  maxProduction: 10,
  windowMs: 15 * 60 * 1000,
});
const signupLimiter = createJsonRateLimiter({
  maxDevelopment: 100,
  maxProduction: 5,
  message: 'Too many account creation attempts. Please try again tomorrow.',
  windowMs: 24 * 60 * 60 * 1000,
});
const otpLimiter = createJsonRateLimiter({
  maxDevelopment: 30,
  maxProduction: 6,
  windowMs: 10 * 60 * 1000,
});
const maxOtpVerificationAttempts = 5;
const maxEmailLength = 254;
const maxFullNameLength = 100;
const maxPasswordLength = 128;
const dummyLoginPasswordHash = '$argon2id$v=19$m=19456,t=2,p=1$vAINaESlnzNt4yuLElsnfA$1tGL8dU7v+tWUoxg9ImCsEhZsfN74MEaBvWlUFDPyCY';

function getDailySignupLimit() {
  const configured = Number(process.env.CUSTOMER_SIGNUP_DAILY_IP_LIMIT ?? 3);
  return Number.isFinite(configured) ? Math.max(1, Math.floor(configured)) : 3;
}

function isProductionLike() {
  return process.env.NODE_ENV === 'production';
}

class VerificationDeliveryError extends Error {
  statusCode = 503;
}

function getVerificationDeliveryStatus() {
  const smtpConfigured = Boolean(getSmtpConfig());
  const twilioConfigured = Boolean(
    normalizeText(process.env.TWILIO_ACCOUNT_SID) &&
      normalizeText(process.env.TWILIO_AUTH_TOKEN) &&
      normalizeText(process.env.TWILIO_PHONE_NUMBER),
  );

  return { smtpConfigured, twilioConfigured };
}

function assertProductionVerificationDelivery() {
  if (!isProductionLike()) {
    return;
  }

  const { smtpConfigured, twilioConfigured } = getVerificationDeliveryStatus();
  const missing: string[] = [];

  if (isCustomerEmailVerificationRequired() && !smtpConfigured) {
    missing.push('email');
  }

  if (isCustomerPhoneVerificationRequired() && !twilioConfigured) {
    missing.push('phone');
  }

  if (missing.length > 0) {
    throw new VerificationDeliveryError(
      `Verification delivery is not configured for ${missing.join(' and ')} codes. Contact support before creating an account.`,
    );
  }
}

function buildCustomerSession(user: { auth_version: number; email: string; id: number }) {
  return {
    authVersion: Number(user.auth_version),
    email: user.email,
    id: Number(user.id),
  };
}

async function regenerateSession(req: Request) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function saveSession(req: Request) {
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function establishCustomerSession(req: Request, user: UserRecord) {
  await regenerateSession(req);
  req.session.customerUser = buildCustomerSession(user);
  await saveSession(req);
}

function assertCredentialLengths(input: { email?: string; password?: string }) {
  if (input.email && input.email.length > maxEmailLength) {
    const error = new Error('Enter a valid email address.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  if (input.password && input.password.length > maxPasswordLength) {
    const error = new Error(`Password must be ${maxPasswordLength} characters or fewer.`);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
}

async function consumeSignupAttempt(req: Request) {
  const normalizedIp = ipKeyGenerator(req.ip || 'unknown');
  const ipKeyHash = createHmac('sha256', customerSessionSecret)
    .update(normalizedIp)
    .digest('hex');
  const allowed = await consumeDailySignupAttempt(ipKeyHash, getDailySignupLimit());

  if (!allowed) {
    const error = new Error('Too many accounts were created from this network today. Please try again tomorrow.');
    (error as Error & { statusCode?: number }).statusCode = 429;
    throw error;
  }
}

function toCustomerUserResponse(user: UserRecord) {
  return {
    accountStatus: user.account_status,
    countryCode: user.country_code,
    createdAt: user.created_at,
    email: user.email,
    emailVerified: isCustomerEmailVerified(user),
    fullName: user.full_name,
    id: Number(user.id),
    mobileNumber: user.mobile_number,
    packageType: user.package_code,
    phoneVerified: isCustomerPhoneVerified(user),
    tokenBalance: Number(user.token_balance),
  };
}

async function getActiveSessionCustomer(req: Request, res: Response) {
  const user = req.session.customerUser ? await getUserById(req.session.customerUser.id) : null;

  if (!user) {
    req.session.customerUser = undefined;
    res.status(401).json({ error: 'Log in first.' });
    return null;
  }

  if (Number(req.session.customerUser?.authVersion) !== Number(user.auth_version)) {
    req.session.customerUser = undefined;
    res.clearCookie(customerSessionCookieName);
    res.status(401).json({ error: 'Your session has expired. Log in again.' });
    return null;
  }

  if (user.account_status !== 'active') {
    req.session.customerUser = undefined;
    res.clearCookie(customerSessionCookieName);
    res.status(403).json({ error: 'This account is disabled.' });
    return null;
  }

  req.session.customerUser = buildCustomerSession(user);
  return user;
}

async function sendEmailOtp(email: string, otpCode: string) {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    if (isProductionLike()) {
      throw new VerificationDeliveryError('Email verification delivery is not configured. Contact support.');
    }

    return {
      delivered: false,
      preview: !isProductionLike() ? otpCode : null,
      transport: 'development',
    };
  }

  const transporter = nodemailer.createTransport({
    auth: {
      pass: smtpConfig.pass,
      user: smtpConfig.user,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    host: smtpConfig.host,
    port: smtpConfig.port,
    requireTLS: smtpConfig.requireTls,
    secure: smtpConfig.secure,
    socketTimeout: 20000,
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    subject: emailOtpPurposeText,
    text: `Your verification code is ${otpCode}. It expires in 15 minutes.`,
    to: email,
  });

  return {
    delivered: true,
    preview: null,
    transport: 'smtp',
  };
}

async function sendPhoneOtp(phone: string, otpCode: string) {
  const accountSid = normalizeText(process.env.TWILIO_ACCOUNT_SID);
  const authToken = normalizeText(process.env.TWILIO_AUTH_TOKEN);
  const from = normalizeText(process.env.TWILIO_PHONE_NUMBER);

  if (!accountSid || !authToken || !from) {
    if (isProductionLike()) {
      throw new VerificationDeliveryError('Phone verification delivery is not configured. Contact support.');
    }

    return {
      delivered: false,
      preview: !isProductionLike() ? otpCode : null,
      transport: 'development',
    };
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({
    body: `${phoneOtpPurposeText}: ${otpCode}`,
    from,
    to: phone,
  });

  return {
    delivered: true,
    preview: null,
    transport: 'twilio',
  };
}

async function sendPasswordResetEmail(
  smtpConfig: NonNullable<ReturnType<typeof getSmtpConfig>>,
  email: string,
  resetUrl: string,
) {
  const transporter = nodemailer.createTransport({
    auth: { pass: smtpConfig.pass, user: smtpConfig.user },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    host: smtpConfig.host,
    port: smtpConfig.port,
    requireTLS: smtpConfig.requireTls,
    secure: smtpConfig.secure,
    socketTimeout: 20_000,
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    subject: 'Reset your BANGLA SPEECH AI password',
    text: `Reset your password using this link: ${resetUrl}`,
    to: email,
  });
}

export function createAuthRouter() {
  const router = Router();

  router.post('/api/auth/signup', signupLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();
      const password = requireText(req.body.password, 'Password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');
      const fullName = requireText(req.body.fullName, 'Full name is required.');
      const countryCode = normalizeText(req.body.countryCode);
      const mobileNumber = normalizeText(req.body.mobileNumber);

      assertCredentialLengths({ email, password });

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      if (fullName.length > maxFullNameLength) {
        res.status(400).json({ error: `Full name must stay at ${maxFullNameLength} characters or fewer.` });
        return;
      }

      if ((countryCode?.length ?? 0) > 8 || (mobileNumber?.length ?? 0) > 32) {
        res.status(400).json({ error: 'Enter a valid country code and mobile number.' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Password confirmation does not match.' });
        return;
      }

      if (!countryCode || !mobileNumber) {
        res.status(400).json({ error: 'Country code and mobile number are required.' });
        return;
      }

      const normalizedPhone = normalizePhone(countryCode, mobileNumber);

      if (!normalizedPhone) {
        res.status(400).json({ error: 'Enter a valid country code and mobile number.' });
        return;
      }

      await consumeSignupAttempt(req);
      assertProductionVerificationDelivery();

      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: 'Unable to create an account with these details.' });
        return;
      }

      const existingPhoneUser = await getUserByMobileE164(normalizedPhone);
      if (existingPhoneUser) {
        res.status(409).json({ error: 'Unable to create an account with these details.' });
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser({
        countryCode,
        email,
        fullName,
        mobileNumber,
        packageCode: 'starter',
        passwordHash,
      });

      const emailOtp = generateOtpCode();
      const phoneOtp = generateOtpCode();
      const emailVerificationRequired = isCustomerEmailVerificationRequired();
      const phoneVerificationRequired = isCustomerPhoneVerificationRequired();

      await Promise.all([
        emailVerificationRequired ? createEmailVerification(user.id, user.email, emailOtp) : markEmailVerified(user.id),
        phoneVerificationRequired && normalizedPhone ? createPhoneVerification(user.id, normalizedPhone, phoneOtp) : markPhoneVerified(user.id),
      ]);

      const [emailDelivery, phoneDelivery] = await Promise.all([
        emailVerificationRequired ? sendEmailOtp(user.email, emailOtp) : Promise.resolve({ delivered: false, preview: null, transport: 'not_required' }),
        phoneVerificationRequired && normalizedPhone ? sendPhoneOtp(normalizedPhone, phoneOtp) : Promise.resolve({ delivered: false, preview: null, transport: 'not_required' }),
      ]);
      const verifiedUser = (await getUserById(user.id)) ?? user;
      const eligibleUser = await ensureStarterGrantIfEligible(verifiedUser);
      await establishCustomerSession(req, eligibleUser);

      res.status(201).json({
        user: toCustomerUserResponse(eligibleUser),
        verification: {
          email: emailDelivery,
          phone: phoneDelivery,
        },
      });
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message.includes('idx_users_mobile_e164_unique')
          || error.message.includes('users_email')
        )
      ) {
        res.status(409).json({ error: 'Unable to create an account with these details.' });
        return;
      }

      const publicError = toPublicApiError(error, 'Failed to create account.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();
      const password = requireText(req.body.password, 'Password is required.');
      assertCredentialLengths({ email, password });
      const user = await getUserByEmail(email);
      const passwordMatches = await verifyPassword(
        user?.password_hash ?? dummyLoginPasswordHash,
        password,
      );

      if (!user || !passwordMatches) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (user.account_status !== 'active') {
        res.status(403).json({ error: 'This account is disabled.' });
        return;
      }

      const eligibleUser = await ensureStarterGrantIfEligible(user);
      await establishCustomerSession(req, eligibleUser);

      res.json({
        user: toCustomerUserResponse(eligibleUser),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Login failed.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/logout', async (req, res) => {
    req.session.destroy(() => {
      res.clearCookie(customerSessionCookieName);
      res.json({ authenticated: false });
    });
  });

  router.post('/api/auth/send-email-otp', otpLimiter, async (req, res) => {
    try {
      const user = await getActiveSessionCustomer(req, res);

      if (!user) {
        return;
      }

      if (!isCustomerEmailVerificationRequired()) {
        const verifiedUser = (await markEmailVerified(user.id)) ?? user;
        const eligibleUser = await ensureStarterGrantIfEligible(verifiedUser);

        res.json({
          message: 'Email verification is not required.',
          user: toCustomerUserResponse(eligibleUser),
          verification: {
            delivered: false,
            preview: null,
            transport: 'not_required',
          },
        });
        return;
      }

      const otpCode = generateOtpCode();
      await createEmailVerification(user.id, user.email, otpCode);
      const delivery = await sendEmailOtp(user.email, otpCode);

      res.json({
        message: 'Email verification code sent.',
        verification: delivery,
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to send email verification code.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/verify-email-otp', otpLimiter, async (req, res) => {
    try {
      const user = await getActiveSessionCustomer(req, res);

      if (!user) {
        return;
      }

      if (!isCustomerEmailVerificationRequired()) {
        const verifiedUser = (await markEmailVerified(user.id)) ?? user;
        const eligibleUser = await ensureStarterGrantIfEligible(verifiedUser);

        res.json({
          message: 'Email verification is not required.',
          user: toCustomerUserResponse(eligibleUser),
        });
        return;
      }

      const otp = requireText(req.body.otp, 'Verification code is required.');
      const verification = await getLatestPendingEmailVerification(user.id);

      if (!verification) {
        res.status(400).json({ error: 'No pending email verification found.' });
        return;
      }

      if (verification.otp_expires_at <= new Date()) {
        res.status(400).json({ error: 'The email verification code has expired.' });
        return;
      }

      if (Number(verification.attempts) >= maxOtpVerificationAttempts) {
        res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
        return;
      }

      const attemptRecorded = await incrementEmailVerificationAttempts(
        verification.id,
        maxOtpVerificationAttempts,
      );

      if (!attemptRecorded) {
        res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
        return;
      }

      if (!verifyOtpCode(verification.otp_hash, otp)) {
        res.status(400).json({ error: 'Invalid email verification code.' });
        return;
      }

      await completeEmailVerification(verification.id);
      const verifiedUser = await markEmailVerified(user.id);
      const eligibleUser = verifiedUser ? await ensureStarterGrantIfEligible(verifiedUser) : user;

      res.json({
        message: 'Email verified successfully.',
        user: toCustomerUserResponse(eligibleUser),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to verify email code.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/send-phone-otp', otpLimiter, async (req, res) => {
    try {
      const user = await getActiveSessionCustomer(req, res);

      if (!user) {
        return;
      }

      const targetPhone = normalizePhone(user.country_code, user.mobile_number);
      if (!targetPhone) {
        res.status(400).json({ error: 'No valid phone number is configured for this account.' });
        return;
      }

      if (!isCustomerPhoneVerificationRequired()) {
        const verifiedUser = (await markPhoneVerified(user.id)) ?? user;
        const eligibleUser = await ensureStarterGrantIfEligible(verifiedUser);

        res.json({
          message: 'Phone verification is not required.',
          user: toCustomerUserResponse(eligibleUser),
          verification: {
            delivered: false,
            preview: null,
            transport: 'not_required',
          },
        });
        return;
      }

      const otpCode = generateOtpCode();
      await createPhoneVerification(user.id, targetPhone, otpCode);
      const delivery = await sendPhoneOtp(targetPhone, otpCode);

      res.json({
        message: 'Phone verification code sent.',
        verification: delivery,
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to send phone verification code.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/verify-phone-otp', otpLimiter, async (req, res) => {
    try {
      const user = await getActiveSessionCustomer(req, res);

      if (!user) {
        return;
      }

      if (!isCustomerPhoneVerificationRequired()) {
        const verifiedUser = (await markPhoneVerified(user.id)) ?? user;
        const eligibleUser = await ensureStarterGrantIfEligible(verifiedUser);

        res.json({
          message: 'Phone verification is not required.',
          user: toCustomerUserResponse(eligibleUser),
        });
        return;
      }

      const otp = requireText(req.body.otp, 'Verification code is required.');
      const verification = await getLatestPendingPhoneVerification(user.id);

      if (!verification) {
        res.status(400).json({ error: 'No pending phone verification found.' });
        return;
      }

      if (verification.otp_expires_at <= new Date()) {
        res.status(400).json({ error: 'The phone verification code has expired.' });
        return;
      }

      if (Number(verification.attempts) >= maxOtpVerificationAttempts) {
        res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
        return;
      }

      const attemptRecorded = await incrementPhoneVerificationAttempts(
        verification.id,
        maxOtpVerificationAttempts,
      );

      if (!attemptRecorded) {
        res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
        return;
      }

      if (!verifyOtpCode(verification.otp_hash, otp)) {
        res.status(400).json({ error: 'Invalid phone verification code.' });
        return;
      }

      await completePhoneVerification(verification.id);
      const verifiedUser = await markPhoneVerified(user.id);
      const eligibleUser = verifiedUser ? await ensureStarterGrantIfEligible(verifiedUser) : user;

      res.json({
        message: 'Phone verified successfully.',
        user: toCustomerUserResponse(eligibleUser),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to verify phone code.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();
      assertCredentialLengths({ email });

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      const smtpConfig = getSmtpConfig();

      if (!smtpConfig && isProductionLike()) {
        res.status(503).json({ error: 'Password reset email delivery is not configured. Contact support.' });
        return;
      }

      const user = await getUserByEmail(email);

      if (!user || user.account_status !== 'active') {
        res.json({ message: 'If the account exists, a password reset link has been prepared.' });
        return;
      }

      const { token } = await createPasswordReset(user.id);
      const resetUrl = new URL('/reset-password', getFrontendUrl());
      resetUrl.searchParams.set('token', token);

      if (smtpConfig) {
        void sendPasswordResetEmail(smtpConfig, user.email, resetUrl.toString())
          .catch((error) => {
            console.error('Password reset email delivery failed.', {
              error,
              userId: user.id,
            });
          });
      }

      res.json({
        developmentResetToken: !smtpConfig && !isProductionLike() ? token : null,
        message: 'If the account exists, a password reset link has been prepared.',
        resetUrl: !smtpConfig && !isProductionLike() ? resetUrl.toString() : null,
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to start the password reset flow.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    try {
      const token = requireText(req.body.token, 'Reset token is required.');
      const password = requireText(req.body.password, 'Password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');
      assertCredentialLengths({ password });
      assertCredentialLengths({ password: confirmPassword });

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Password confirmation does not match.' });
        return;
      }

      if (!/^[a-f0-9]{48}$/i.test(token)) {
        res.status(400).json({ error: 'Invalid or expired password reset token.' });
        return;
      }

      const result = await consumePasswordReset({ password, token });

      if (result.status === 'invalid') {
        res.status(400).json({ error: 'Invalid or expired password reset token.' });
        return;
      }

      if (result.status === 'disabled') {
        req.session.customerUser = undefined;
        res.clearCookie(customerSessionCookieName);
        res.status(403).json({ error: 'This account is disabled.' });
        return;
      }

      const updatedUser = result.user;
      await establishCustomerSession(req, updatedUser);

      res.json({
        message: 'Password reset successful.',
        user: toCustomerUserResponse(updatedUser),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to reset password.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  return router;
}
