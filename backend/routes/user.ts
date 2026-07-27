import { Router, type Request } from 'express';
import {
  createJsonRateLimiter,
  customerSessionCookieName,
  isCustomerEmailVerificationRequired,
  isCustomerEmailVerified,
  isCustomerPhoneVerificationRequired,
  isCustomerPhoneVerified,
  isValidEmail,
  normalizeText,
  requireText,
  toPublicApiError,
} from '../core.ts';
import { requireCustomer } from './customer-auth.ts';
import { listPackages } from '../services/customers.ts';
import {
  applyStarterMonthlyRefillIfDue,
  createEmailVerification,
  createPhoneVerification,
  createUserActivityLog,
  downgradeUserToStarter,
  ensureStarterGrantIfEligible,
  generateOtpCode,
  getPaymentsForUser,
  getUserByEmail,
  getTokenTransactionsForUser,
  getUserById,
  getUserByMobileE164,
  hashPassword,
  normalizePhone,
  updateUserPassword,
  updateUserProfile,
  verifyPassword,
} from '../services/customers.ts';

const profileUpdateLimiter = createJsonRateLimiter({
  maxDevelopment: 30,
  maxProduction: 8,
  windowMs: 15 * 60 * 1000,
});
const passwordChangeLimiter = createJsonRateLimiter({
  maxDevelopment: 20,
  maxProduction: 5,
  windowMs: 15 * 60 * 1000,
});
const planChangeLimiter = createJsonRateLimiter({
  maxDevelopment: 20,
  maxProduction: 5,
  windowMs: 15 * 60 * 1000,
});
const maxEmailLength = 254;
const maxFullNameLength = 100;
const maxPasswordLength = 128;

async function replaceCustomerSession(
  req: Request,
  user: { auth_version: number; email: string; id: number },
) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  req.session.customerUser = {
    authVersion: Number(user.auth_version),
    email: user.email,
    id: Number(user.id),
  };

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

async function getHydratedCustomer(userId: number) {
  const user = await getUserById(userId);

  if (!user) {
    return null;
  }

  const granted = await ensureStarterGrantIfEligible(user);
  return applyStarterMonthlyRefillIfDue(granted);
}

function toCustomerUserResponse(user: Awaited<ReturnType<typeof getHydratedCustomer>>) {
  if (!user) return null;

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

export function createUserRouter() {
  const router = Router();

  router.get('/api/user/me', async (req, res) => {
    try {
      const sessionUser = req.session.customerUser;

      if (!sessionUser) {
        res.json({ authenticated: false, user: null });
        return;
      }

      const sessionCustomer = await getUserById(sessionUser.id);

      if (
        !sessionCustomer ||
        sessionCustomer.account_status !== 'active' ||
        Number(sessionUser.authVersion) !== Number(sessionCustomer.auth_version)
      ) {
        req.session.customerUser = undefined;
        res.clearCookie(customerSessionCookieName);
        res.json({ authenticated: false, user: null });
        return;
      }

      const user = await getHydratedCustomer(sessionCustomer.id);

      if (!user) {
        req.session.customerUser = undefined;
        res.clearCookie(customerSessionCookieName);
        res.json({ authenticated: false, user: null });
        return;
      }

      req.session.customerUser = {
        authVersion: Number(user.auth_version),
        email: user.email,
        id: Number(user.id),
      };

      res.json({
        authenticated: true,
        user: toCustomerUserResponse(user),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load current user.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.get('/api/packages', async (_req, res) => {
    try {
      const packages = await listPackages();
      res.json({
        packages: packages.map((item) => ({
          code: item.package_code,
          displayOrder: item.display_order,
          isPremium: item.is_premium,
          monthlyRefillTokens: Number(item.monthly_refill_tokens),
          name: item.name,
          signupTokenGrant: Number(item.signup_token_grant),
        })),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load packages.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.get('/api/user/tokens', requireCustomer, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const transactions = await getTokenTransactionsForUser(user.id);

      res.json({
        packageType: user.package_code,
        tokenBalance: Number(user.token_balance),
        transactions: transactions.map((transaction) => ({
          balanceAfter: Number(transaction.balance_after),
          createdAt: transaction.created_at,
          id: transaction.id,
          notes: transaction.notes,
          packageUpgradeId: transaction.package_upgrade_id,
          paymentId: transaction.payment_id,
          tokenDelta: Number(transaction.token_delta),
          transactionType: transaction.transaction_type,
        })),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load token balance.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.get('/api/user/payment-history', requireCustomer, async (req, res) => {
    try {
      const payments = await getPaymentsForUser(req.session.customerUser!.id);

      res.json({
        payments: payments.map((payment) => ({
          amount: Number(payment.amount),
          completedAt: payment.completed_at,
          createdAt: payment.created_at,
          currency: payment.currency,
          id: payment.id,
          packageCode: payment.package_code,
          paymentType: payment.payment_type,
          provider: payment.provider,
          status: payment.status,
          tokenAmount: payment.token_amount === null ? null : Number(payment.token_amount),
          updatedAt: payment.updated_at,
        })),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load payment history.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.patch('/api/user/profile', requireCustomer, profileUpdateLimiter, async (req, res) => {
    try {
      const user = await getUserById(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const nextEmail = requireText(req.body.email ?? user.email, 'Email is required.').toLowerCase();
      const nextFullName = normalizeText(req.body.fullName) ?? user.full_name;
      const nextCountryCode = normalizeText(req.body.countryCode) ?? user.country_code;
      const nextMobileNumber = normalizeText(req.body.mobileNumber) ?? user.mobile_number;

      if (!isValidEmail(nextEmail) || nextEmail.length > maxEmailLength) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (nextFullName && nextFullName.length > maxFullNameLength) {
        res.status(400).json({ error: `Name must be ${maxFullNameLength} characters or fewer.` });
        return;
      }

      if (!nextCountryCode || !nextMobileNumber) {
        res.status(400).json({ error: 'Country code and mobile number are required.' });
        return;
      }

      const nextMobileE164 = normalizePhone(nextCountryCode, nextMobileNumber);

      if (!nextMobileE164) {
        res.status(400).json({ error: 'Enter a valid country code and mobile number.' });
        return;
      }

      const emailChanged = nextEmail !== user.email.toLowerCase();
      const phoneChanged = nextMobileE164 !== user.mobile_e164;
      const emailVerificationRequired = emailChanged && isCustomerEmailVerificationRequired();
      const phoneVerificationRequired = phoneChanged && isCustomerPhoneVerificationRequired();

      if (emailChanged || phoneChanged) {
        const currentPassword = requireText(
          req.body.currentPassword,
          'Enter your current password to change email or phone details.',
        );

        if (
          currentPassword.length > maxPasswordLength ||
          !(await verifyPassword(user.password_hash, currentPassword))
        ) {
          res.status(400).json({ error: 'Current password is incorrect.' });
          return;
        }
      }

      if (emailChanged) {
        const existingUser = await getUserByEmail(nextEmail);

        if (existingUser && existingUser.id !== user.id) {
          res.status(409).json({ error: 'Another account already uses this email address.' });
          return;
        }
      }

      if (phoneChanged) {
        const existingPhoneUser = await getUserByMobileE164(nextMobileE164);

        if (existingPhoneUser && existingPhoneUser.id !== user.id) {
          res.status(409).json({ error: 'Another account already uses this mobile number.' });
          return;
        }
      }

      const updatedUser = await updateUserProfile({
        contactChanged: emailChanged || phoneChanged,
        countryCode: nextCountryCode,
        email: nextEmail,
        emailChanged: emailVerificationRequired,
        fullName: nextFullName,
        mobileE164: nextMobileE164,
        mobileNumber: nextMobileNumber,
        phoneChanged: phoneVerificationRequired,
        userId: user.id,
      });

      if (!updatedUser) {
        res.status(500).json({ error: 'Failed to update profile.' });
        return;
      }

      const emailOtp = emailChanged ? generateOtpCode() : null;
      const phoneOtp = phoneChanged ? generateOtpCode() : null;

      await Promise.all([
        emailVerificationRequired && emailOtp ? createEmailVerification(updatedUser.id, updatedUser.email, emailOtp, 'email_change') : Promise.resolve(null),
        phoneVerificationRequired && phoneOtp ? createPhoneVerification(updatedUser.id, nextMobileE164, phoneOtp, 'phone_change') : Promise.resolve(null),
        createUserActivityLog({
          actionType: 'profile_updated',
          metadata: {
            emailChanged,
            phoneChanged,
          },
          userId: updatedUser.id,
        }),
      ]);

      req.session.customerUser = {
        authVersion: Number(updatedUser.auth_version),
        email: updatedUser.email,
        id: Number(updatedUser.id),
      };

      res.json({
        message:
          emailVerificationRequired || phoneVerificationRequired
            ? 'Profile updated. Re-verify changed contact details before using protected sample features again.'
            : 'Profile updated successfully.',
        user: toCustomerUserResponse(updatedUser),
        verification: {
          email: emailVerificationRequired && process.env.NODE_ENV !== 'production' ? { preview: emailOtp } : null,
          phone: phoneVerificationRequired && process.env.NODE_ENV !== 'production' ? { preview: phoneOtp } : null,
        },
        verificationRequired: {
          email: emailVerificationRequired,
          phone: phoneVerificationRequired,
        },
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to update profile.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/user/change-password', requireCustomer, passwordChangeLimiter, async (req, res) => {
    try {
      const currentPassword = requireText(req.body.currentPassword, 'Current password is required.');
      const newPassword = requireText(req.body.newPassword, 'New password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');

      if (
        currentPassword.length > maxPasswordLength ||
        newPassword.length > maxPasswordLength ||
        confirmPassword.length > maxPasswordLength
      ) {
        res.status(400).json({ error: `Passwords must be ${maxPasswordLength} characters or fewer.` });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters long.' });
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({ error: 'Password confirmation does not match.' });
        return;
      }

      const user = await getUserById(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const currentPasswordMatches = await verifyPassword(user.password_hash, currentPassword);

      if (!currentPasswordMatches) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }

      const passwordHash = await hashPassword(newPassword);
      const updatedUser = await updateUserPassword(user.id, passwordHash);

      if (!updatedUser) {
        res.status(500).json({ error: 'Failed to update password.' });
        return;
      }

      await createUserActivityLog({
        actionType: 'password_changed',
        userId: updatedUser.id,
      });

      await replaceCustomerSession(req, updatedUser);
      res.json({ message: 'Password updated successfully.' });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to change password.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/user/downgrade-to-starter', requireCustomer, planChangeLimiter, async (req, res) => {
    try {
      const result = await downgradeUserToStarter(req.session.customerUser!.id);

      res.json({
        message: result.message,
        user: toCustomerUserResponse(result.user),
      });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to change plan.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  return router;
}
