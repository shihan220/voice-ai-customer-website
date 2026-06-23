import { Router } from 'express';
import twilio from 'twilio';
import {
  createJsonRateLimiter,
  customerSessionCookieName,
  getBackendUrl,
  getFrontendUrl,
  getSmtpConfig,
  isValidEmail,
  nodemailer,
  normalizeText,
  requireText,
} from '../core.ts';
import {
  createEmailVerification,
  createPasswordReset,
  createPhoneVerification,
  createUser,
  completeEmailVerification,
  completePhoneVerification,
  ensureStarterGrantIfEligible,
  generateOtpCode,
  getValidPasswordResetByToken,
  getLatestPendingEmailVerification,
  getLatestPendingPhoneVerification,
  getUserByEmail,
  getUserById,
  hashOpaqueToken,
  hashPassword,
  incrementEmailVerificationAttempts,
  incrementPhoneVerificationAttempts,
  markEmailVerified,
  markPasswordResetUsed,
  markPhoneVerified,
  normalizePhone,
  updateUserPassword,
  verifyPassword,
} from '../services/customers.ts';

const emailOtpPurposeText = 'Your BANGLA SPEECH AI email verification code';
const phoneOtpPurposeText = 'Your BANGLA SPEECH AI phone verification code';
const authLimiter = createJsonRateLimiter({
  maxDevelopment: 50,
  maxProduction: 10,
  windowMs: 15 * 60 * 1000,
});
const otpLimiter = createJsonRateLimiter({
  maxDevelopment: 30,
  maxProduction: 6,
  windowMs: 10 * 60 * 1000,
});

function isProductionLike() {
  return process.env.NODE_ENV === 'production';
}

function buildCustomerSession(user: { email: string; id: number }) {
  return {
    email: user.email,
    id: Number(user.id),
  };
}

function clearCustomerSession(req: Parameters<Router['post']>[1] extends never ? never : any, res: any) {
  req.session.customerUser = undefined;
  req.session.save(() => {
    res.clearCookie(customerSessionCookieName);
  });
}

async function sendEmailOtp(email: string, otpCode: string) {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
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

export function createAuthRouter() {
  const router = Router();

  router.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();
      const password = requireText(req.body.password, 'Password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');
      const fullName = requireText(req.body.fullName, 'Full name is required.');
      const countryCode = normalizeText(req.body.countryCode);
      const mobileNumber = normalizeText(req.body.mobileNumber);

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
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

      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: 'An account with this email already exists.' });
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

      req.session.customerUser = buildCustomerSession(user);

      const emailOtp = generateOtpCode();
      const phoneOtp = generateOtpCode();
      const normalizedPhone = normalizePhone(countryCode, mobileNumber);

      await Promise.all([
        createEmailVerification(user.id, user.email, emailOtp),
        normalizedPhone ? createPhoneVerification(user.id, normalizedPhone, phoneOtp) : Promise.resolve(null),
      ]);

      const [emailDelivery, phoneDelivery] = await Promise.all([
        sendEmailOtp(user.email, emailOtp),
        normalizedPhone ? sendPhoneOtp(normalizedPhone, phoneOtp) : Promise.resolve({ delivered: false, preview: null, transport: 'missing_phone' }),
      ]);

      res.status(201).json({
        user: {
          email: user.email,
          emailVerified: false,
          fullName: user.full_name,
          id: Number(user.id),
          packageType: user.package_code,
          phoneVerified: false,
          tokenBalance: Number(user.token_balance),
        },
        verification: {
          email: emailDelivery,
          phone: phoneDelivery,
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create account.',
      });
    }
  });

  router.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();
      const password = requireText(req.body.password, 'Password is required.');
      const user = await getUserByEmail(email);

      if (!user || !(await verifyPassword(user.password_hash, password))) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (user.account_status !== 'active') {
        res.status(403).json({ error: 'This account is disabled.' });
        return;
      }

      req.session.customerUser = buildCustomerSession(user);
      const eligibleUser = await ensureStarterGrantIfEligible(user);

      res.json({
        user: {
          email: eligibleUser.email,
          emailVerified: Boolean(eligibleUser.email_verified_at),
          fullName: eligibleUser.full_name,
          id: Number(eligibleUser.id),
          packageType: eligibleUser.package_code,
          phoneVerified: Boolean(eligibleUser.phone_verified_at),
          tokenBalance: Number(eligibleUser.token_balance),
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Login failed.',
      });
    }
  });

  router.post('/api/auth/logout', async (req, res) => {
    req.session.customerUser = undefined;
    req.session.save(() => {
      res.clearCookie(customerSessionCookieName);
      res.json({ authenticated: false });
    });
  });

  router.post('/api/auth/send-email-otp', otpLimiter, async (req, res) => {
    try {
      const user = req.session.customerUser ? await getUserById(req.session.customerUser.id) : null;

      if (!user) {
        res.status(401).json({ error: 'Log in first.' });
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
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to send email verification code.',
      });
    }
  });

  router.post('/api/auth/verify-email-otp', otpLimiter, async (req, res) => {
    try {
      const user = req.session.customerUser ? await getUserById(req.session.customerUser.id) : null;

      if (!user) {
        res.status(401).json({ error: 'Log in first.' });
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

      await incrementEmailVerificationAttempts(verification.id);

      if (verification.otp_hash !== hashOpaqueToken(otp)) {
        res.status(400).json({ error: 'Invalid email verification code.' });
        return;
      }

      await completeEmailVerification(verification.id);
      const verifiedUser = await markEmailVerified(user.id);
      const eligibleUser = verifiedUser ? await ensureStarterGrantIfEligible(verifiedUser) : user;

      res.json({
        message: 'Email verified successfully.',
        user: {
          email: eligibleUser.email,
          emailVerified: Boolean(eligibleUser.email_verified_at),
          fullName: eligibleUser.full_name,
          id: Number(eligibleUser.id),
          packageType: eligibleUser.package_code,
          phoneVerified: Boolean(eligibleUser.phone_verified_at),
          tokenBalance: Number(eligibleUser.token_balance),
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to verify email code.',
      });
    }
  });

  router.post('/api/auth/send-phone-otp', otpLimiter, async (req, res) => {
    try {
      const user = req.session.customerUser ? await getUserById(req.session.customerUser.id) : null;

      if (!user) {
        res.status(401).json({ error: 'Log in first.' });
        return;
      }

      const targetPhone = normalizePhone(user.country_code, user.mobile_number);
      if (!targetPhone) {
        res.status(400).json({ error: 'No valid phone number is configured for this account.' });
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
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to send phone verification code.',
      });
    }
  });

  router.post('/api/auth/verify-phone-otp', otpLimiter, async (req, res) => {
    try {
      const user = req.session.customerUser ? await getUserById(req.session.customerUser.id) : null;

      if (!user) {
        res.status(401).json({ error: 'Log in first.' });
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

      await incrementPhoneVerificationAttempts(verification.id);

      if (verification.otp_hash !== hashOpaqueToken(otp)) {
        res.status(400).json({ error: 'Invalid phone verification code.' });
        return;
      }

      await completePhoneVerification(verification.id);
      const verifiedUser = await markPhoneVerified(user.id);
      const eligibleUser = verifiedUser ? await ensureStarterGrantIfEligible(verifiedUser) : user;

      res.json({
        message: 'Phone verified successfully.',
        user: {
          email: eligibleUser.email,
          emailVerified: Boolean(eligibleUser.email_verified_at),
          fullName: eligibleUser.full_name,
          id: Number(eligibleUser.id),
          packageType: eligibleUser.package_code,
          phoneVerified: Boolean(eligibleUser.phone_verified_at),
          tokenBalance: Number(eligibleUser.token_balance),
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to verify phone code.',
      });
    }
  });

  router.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
      const email = requireText(req.body.email, 'Email is required.').toLowerCase();

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      const user = await getUserByEmail(email);

      if (!user) {
        res.json({ message: 'If the account exists, a password reset link has been prepared.' });
        return;
      }

      const { token } = await createPasswordReset(user.id);
      const smtpConfig = getSmtpConfig();
      const resetUrl = new URL('/reset-password', getFrontendUrl());
      resetUrl.searchParams.set('token', token);

      if (smtpConfig) {
        const transporter = nodemailer.createTransport({
          auth: { pass: smtpConfig.pass, user: smtpConfig.user },
          host: smtpConfig.host,
          port: smtpConfig.port,
          requireTLS: smtpConfig.requireTls,
          secure: smtpConfig.secure,
        });

        await transporter.sendMail({
          from: smtpConfig.from,
          subject: 'Reset your BANGLA SPEECH AI password',
          text: `Reset your password using this link: ${resetUrl.toString()}`,
          to: user.email,
        });
      }

      res.json({
        developmentResetToken: !smtpConfig && !isProductionLike() ? token : null,
        message: 'If the account exists, a password reset link has been prepared.',
        resetUrl: !smtpConfig && !isProductionLike() ? resetUrl.toString() : null,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to start the password reset flow.',
      });
    }
  });

  router.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    try {
      const token = requireText(req.body.token, 'Reset token is required.');
      const password = requireText(req.body.password, 'Password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Password confirmation does not match.' });
        return;
      }

      const passwordReset = await getValidPasswordResetByToken(token);

      if (!passwordReset) {
        res.status(400).json({ error: 'Invalid or expired password reset token.' });
        return;
      }

      const passwordHash = await hashPassword(password);
      const updatedUser = await updateUserPassword(passwordReset.user_id, passwordHash);
      await markPasswordResetUsed(passwordReset.id);

      if (!updatedUser) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      req.session.customerUser = buildCustomerSession(updatedUser);

      res.json({
        message: 'Password reset successful.',
        user: {
          email: updatedUser.email,
          emailVerified: Boolean(updatedUser.email_verified_at),
          fullName: updatedUser.full_name,
          id: Number(updatedUser.id),
          packageType: updatedUser.package_code,
          phoneVerified: Boolean(updatedUser.phone_verified_at),
          tokenBalance: Number(updatedUser.token_balance),
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to reset password.',
      });
    }
  });

  return router;
}
