import { Router } from 'express';
import { createJsonRateLimiter, isValidEmail, normalizeText, requireText } from '../core.ts';
import { requireCustomer } from './customer-auth.ts';
import { listPackages } from '../services/customers.ts';
import {
  applyStarterMonthlyRefillIfDue,
  createEmailVerification,
  createPhoneVerification,
  createTokenTransaction,
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
  updateUserBalance,
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
    emailVerified: Boolean(user.email_verified_at),
    fullName: user.full_name,
    id: Number(user.id),
    mobileNumber: user.mobile_number,
    packageType: user.package_code,
    phoneVerified: Boolean(user.phone_verified_at),
    tokenBalance: Number(user.token_balance),
  };
}

export function createUserRouter() {
  const router = Router();

  router.get('/api/user/me', async (req, res) => {
    try {
      if (!req.session.customerUser) {
        res.json({ authenticated: false, user: null });
        return;
      }

      const user = await getHydratedCustomer(req.session.customerUser.id);

      if (!user) {
        req.session.customerUser = undefined;
        res.json({ authenticated: false, user: null });
        return;
      }

      if (user.account_status !== 'active') {
        req.session.customerUser = undefined;
        res.json({ authenticated: false, user: null });
        return;
      }

      req.session.customerUser = {
        email: user.email,
        id: user.id,
      };

      res.json({
        authenticated: true,
        user: toCustomerUserResponse(user),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load current user.',
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
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load packages.',
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
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load token balance.',
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
          metadata: payment.metadata,
          packageCode: payment.package_code,
          paymentType: payment.payment_type,
          provider: payment.provider,
          providerPaymentId: payment.provider_payment_id,
          providerTransactionId: payment.provider_transaction_id,
          status: payment.status,
          tokenAmount: payment.token_amount === null ? null : Number(payment.token_amount),
          updatedAt: payment.updated_at,
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load payment history.',
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

      if (!isValidEmail(nextEmail)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
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
        countryCode: nextCountryCode,
        email: nextEmail,
        emailChanged,
        fullName: nextFullName,
        mobileE164: nextMobileE164,
        mobileNumber: nextMobileNumber,
        phoneChanged,
        userId: user.id,
      });

      if (!updatedUser) {
        res.status(500).json({ error: 'Failed to update profile.' });
        return;
      }

      const emailOtp = emailChanged ? generateOtpCode() : null;
      const phoneOtp = phoneChanged ? generateOtpCode() : null;

      await Promise.all([
        emailChanged && emailOtp ? createEmailVerification(updatedUser.id, updatedUser.email, emailOtp, 'email_change') : Promise.resolve(null),
        phoneChanged && phoneOtp ? createPhoneVerification(updatedUser.id, nextMobileE164, phoneOtp, 'phone_change') : Promise.resolve(null),
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
        email: updatedUser.email,
        id: updatedUser.id,
      };

      res.json({
        message:
          emailChanged || phoneChanged
            ? 'Profile updated. Re-verify changed contact details before using protected sample features again.'
            : 'Profile updated successfully.',
        user: toCustomerUserResponse(updatedUser),
        verification: {
          email: emailChanged && process.env.NODE_ENV !== 'production' ? { preview: emailOtp } : null,
          phone: phoneChanged && process.env.NODE_ENV !== 'production' ? { preview: phoneOtp } : null,
        },
        verificationRequired: {
          email: emailChanged,
          phone: phoneChanged,
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update profile.',
      });
    }
  });

  router.post('/api/user/change-password', requireCustomer, passwordChangeLimiter, async (req, res) => {
    try {
      const currentPassword = requireText(req.body.currentPassword, 'Current password is required.');
      const newPassword = requireText(req.body.newPassword, 'New password is required.');
      const confirmPassword = requireText(req.body.confirmPassword, 'Confirm password is required.');

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

      res.json({ message: 'Password updated successfully.' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to change password.',
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
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to change plan.',
      });
    }
  });

  router.post('/api/user/use-token', requireCustomer, async (req, res) => {
    try {
      const user = await getHydratedCustomer(req.session.customerUser!.id);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const hasExplicitAmount = Object.prototype.hasOwnProperty.call(req.body, 'amount');
      const amountRaw = hasExplicitAmount ? Number(req.body.amount) : 1;

      if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
        res.status(400).json({ error: 'Provide a positive token usage amount.' });
        return;
      }

      const amount = Math.floor(amountRaw);
      const notes = normalizeText(req.body.notes) ?? normalizeText(req.body.reason) ?? 'Sample usage';

      if (!user.email_verified_at) {
        res.status(403).json({ error: 'Verify your email before using samples.' });
        return;
      }

      if (!user.phone_verified_at) {
        res.status(403).json({ error: 'Verify your phone before using samples.' });
        return;
      }

      if (Number(user.token_balance) < amount) {
        res.status(402).json({ error: 'Insufficient token balance. Upgrade or buy extra tokens.' });
        return;
      }

      const nextBalance = Number(user.token_balance) - amount;
      const updatedUser = await updateUserBalance({
        nextBalance,
        userId: user.id,
      });

      if (!updatedUser) {
        res.status(500).json({ error: 'Failed to update token balance.' });
        return;
      }

      const transaction = await createTokenTransaction({
        balanceAfter: nextBalance,
        notes,
        tokenDelta: -amount,
        transactionType: 'usage',
        userId: user.id,
      });

      res.json({
        message: 'Token usage recorded.',
        tokenBalance: Number(updatedUser.token_balance),
        transaction: {
          balanceAfter: Number(transaction.balance_after),
          createdAt: transaction.created_at,
          id: transaction.id,
          notes: transaction.notes,
          tokenDelta: Number(transaction.token_delta),
          transactionType: transaction.transaction_type,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to record token usage.',
      });
    }
  });

  return router;
}
