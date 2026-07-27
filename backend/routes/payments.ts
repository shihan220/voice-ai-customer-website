import { Router } from 'express';
import Stripe from 'stripe';
import {
  createJsonRateLimiter,
  getBackendUrl,
  getFrontendUrl,
  normalizeText,
  toOptionalNumber,
  toPublicApiError,
} from '../core.ts';
import { type PaymentProvider, type PaymentRecord, type UserPackageType } from '../db.ts';
import {
  createPayment,
  finalizeCompletedPayment,
  getPaymentByBkashPaymentId,
  getPaymentById,
  getPaymentsForUser,
  getStripePaymentAssociationBySessionId,
  getUserById,
  isStrictPackageUpgrade,
  recordStripeWebhook,
  type BkashPaymentAssociation,
  type StripePaymentAssociation,
  upsertBkashPayment,
  upsertStripePayment,
  updatePaymentRecord,
} from '../services/customers.ts';
import { requireCustomer } from './customer-auth.ts';

type PackageUpgradeSelection = {
  amount: number;
  currency: string;
  kind: 'package_upgrade';
  packageCode: Exclude<UserPackageType, 'starter'>;
  stripePriceId: string | null;
};

type ExtraTokensSelection = {
  amount: number;
  currency: string;
  kind: 'extra_tokens';
  stripePriceId: string | null;
  tokenAmount: number;
};

type PurchaseSelection = PackageUpgradeSelection | ExtraTokensSelection;
type PurchaseKey = keyof typeof purchaseCatalog;

const purchaseCatalog = {
  extra5000: {
    amount: 49,
    currency: 'USD',
    kind: 'extra_tokens',
    stripePriceId: normalizeText(process.env.STRIPE_EXTRA_TOKEN_PRICE_ID),
    tokenAmount: 5000,
  } satisfies ExtraTokensSelection,
  gold: {
    amount: 149,
    currency: 'USD',
    kind: 'package_upgrade',
    packageCode: 'gold',
    stripePriceId: normalizeText(process.env.STRIPE_GOLD_PRICE_ID),
  } satisfies PackageUpgradeSelection,
  platinum: {
    amount: 499,
    currency: 'USD',
    kind: 'package_upgrade',
    packageCode: 'platinum',
    stripePriceId: normalizeText(process.env.STRIPE_PLATINUM_PRICE_ID),
  } satisfies PackageUpgradeSelection,
} as const;
const paymentCreationLimiter = createJsonRateLimiter({
  maxDevelopment: 40,
  maxProduction: 10,
  windowMs: 10 * 60 * 1000,
});
const paymentCallbackLimiter = createJsonRateLimiter({
  maxDevelopment: 120,
  maxProduction: 30,
  message: 'Too many payment status requests. Please try again shortly.',
  windowMs: 5 * 60 * 1000,
});

function serializePayment(payment: PaymentRecord) {
  return {
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
  };
}

function getProviderRequestTimeoutMs() {
  const configured = Number(process.env.PAYMENT_PROVIDER_REQUEST_TIMEOUT_MS ?? 20_000);
  return Number.isFinite(configured) ? Math.max(2_000, Math.min(60_000, Math.floor(configured))) : 20_000;
}

async function fetchPaymentProvider(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(getProviderRequestTimeoutMs()),
  });
}

function matchesMoney(value: unknown, expectedAmount: number) {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && Math.round(parsed * 100) === Math.round(expectedAmount * 100);
}

export function validateStripeCheckoutSession(
  session: Stripe.Checkout.Session,
  association: StripePaymentAssociation,
  requirePaid: boolean,
) {
  const expectedPaymentId = String(association.id);
  const expectedAmountMinor = Math.round(Number(association.amount) * 100);

  if (
    association.provider !== 'stripe' ||
    association.provider_payment_id !== session.id ||
    association.stripe_checkout_session_id !== session.id ||
    !association.stripe_price_id ||
    session.client_reference_id !== expectedPaymentId ||
    session.metadata?.paymentId !== expectedPaymentId ||
    session.metadata?.purchaseKind !== association.payment_type ||
    session.mode !== 'payment' ||
    session.amount_total !== expectedAmountMinor ||
    session.currency?.toUpperCase() !== association.currency.toUpperCase() ||
    (requirePaid && session.payment_status !== 'paid')
  ) {
    throw new Error('Stripe checkout session did not match the local payment.');
  }
}

function getConsistentProviderText(
  payloads: Array<Record<string, unknown>>,
  field: string,
) {
  const values = payloads
    .map((payload) => payload[field])
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (values.length === 0 || values.some((value) => value !== values[0])) {
    return null;
  }

  return values[0];
}

function validateBkashProviderPayloads(
  payment: BkashPaymentAssociation,
  bkashPaymentId: string,
  payloads: Array<Record<string, unknown>>,
) {
  const expectedInvoice = `BVAI-${payment.id}`;
  const reportedPaymentId = getConsistentProviderText(payloads, 'paymentID');
  const reportedAmount = getConsistentProviderText(payloads, 'amount');
  const reportedCurrency = getConsistentProviderText(payloads, 'currency');
  const reportedInvoice = getConsistentProviderText(payloads, 'merchantInvoiceNumber');
  const reportedIntent = getConsistentProviderText(payloads, 'intent');

  if (
    payment.provider !== 'bkash' ||
    payment.provider_payment_id !== bkashPaymentId ||
    payment.bkash_payment_id !== bkashPaymentId ||
    payment.bkash_merchant_invoice_number !== expectedInvoice ||
    payment.bkash_intent !== 'sale' ||
    reportedPaymentId !== bkashPaymentId ||
    !matchesMoney(reportedAmount, Number(payment.amount)) ||
    reportedCurrency?.toUpperCase() !== payment.currency.toUpperCase() ||
    reportedInvoice !== expectedInvoice ||
    (reportedIntent !== null && reportedIntent.toLowerCase() !== 'sale')
  ) {
    throw new Error('bKash payment details did not match the local payment.');
  }
}

function getStripeClient() {
  const secretKey = normalizeText(process.env.STRIPE_SECRET_KEY);

  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey);
}

function getPurchaseItem(input: { packageCode?: string | null; extraTokenAmount?: number | null }): PurchaseSelection | null {
  if (input.packageCode === 'gold') return purchaseCatalog.gold;
  if (input.packageCode === 'platinum') return purchaseCatalog.platinum;
  if (input.extraTokenAmount === 5000) return purchaseCatalog.extra5000;
  return null;
}

function getSelectionPackageCode(selection: PurchaseSelection): UserPackageType | null {
  return selection.kind === 'package_upgrade' ? selection.packageCode : null;
}

function getSelectionTokenAmount(selection: PurchaseSelection): number | null {
  return selection.kind === 'extra_tokens' ? selection.tokenAmount : null;
}

function getPurchaseKey(selection: PurchaseSelection): PurchaseKey {
  if (selection.kind === 'extra_tokens') return 'extra5000';
  return selection.packageCode;
}

function readPositiveMoneyEnv(name: string) {
  const value = normalizeText(process.env[name]);
  const amount = value ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function getBkashAmount(selection: PurchaseSelection) {
  const envName = {
    extra5000: 'BKASH_EXTRA_TOKEN_AMOUNT_BDT',
    gold: 'BKASH_GOLD_AMOUNT_BDT',
    platinum: 'BKASH_PLATINUM_AMOUNT_BDT',
  }[getPurchaseKey(selection)];
  return readPositiveMoneyEnv(envName);
}

function getPaymentProviderAvailability() {
  const stripeConfigured = Boolean(getStripeClient());
  const bkashConfigured = Boolean(getBkashConfig());
  const bkashAmounts = {
    extra5000: getBkashAmount(purchaseCatalog.extra5000),
    gold: getBkashAmount(purchaseCatalog.gold),
    platinum: getBkashAmount(purchaseCatalog.platinum),
  };

  return {
    bkash: {
      configured: bkashConfigured,
      extra5000: Boolean(bkashConfigured && bkashAmounts.extra5000),
      gold: Boolean(bkashConfigured && bkashAmounts.gold),
      platinum: Boolean(bkashConfigured && bkashAmounts.platinum),
    },
    prices: {
      extra5000: {
        bkash: bkashAmounts.extra5000 === null ? null : { amount: bkashAmounts.extra5000, currency: 'BDT' },
        stripe: { amount: purchaseCatalog.extra5000.amount, currency: purchaseCatalog.extra5000.currency },
      },
      gold: {
        bkash: bkashAmounts.gold === null ? null : { amount: bkashAmounts.gold, currency: 'BDT' },
        stripe: { amount: purchaseCatalog.gold.amount, currency: purchaseCatalog.gold.currency },
      },
      platinum: {
        bkash: bkashAmounts.platinum === null ? null : { amount: bkashAmounts.platinum, currency: 'BDT' },
        stripe: { amount: purchaseCatalog.platinum.amount, currency: purchaseCatalog.platinum.currency },
      },
    },
    stripe: {
      configured: stripeConfigured,
      extra5000: Boolean(stripeConfigured && purchaseCatalog.extra5000.stripePriceId),
      gold: Boolean(stripeConfigured && purchaseCatalog.gold.stripePriceId),
      platinum: Boolean(stripeConfigured && purchaseCatalog.platinum.stripePriceId),
    },
  };
}

function isStripeAvailableForSelection(selection: PurchaseSelection) {
  return Boolean(getStripeClient() && selection.stripePriceId);
}

async function getPurchaseEligibilityError(userId: number, selection: PurchaseSelection) {
  const user = await getUserById(userId);

  if (!user) {
    return 'Account not found.';
  }

  if (selection.kind === 'extra_tokens') {
    return user.package_code === 'starter'
      ? 'Extra token purchases are available only for Gold and Platinum accounts.'
      : null;
  }

  return isStrictPackageUpgrade(user.package_code, selection.packageCode)
    ? null
    : `Your current ${user.package_code} plan cannot be replaced with the same or a lower plan.`;
}

function getBkashConfig() {
  const baseUrl = normalizeText(process.env.BKASH_BASE_URL);
  const username = normalizeText(process.env.BKASH_USERNAME);
  const password = normalizeText(process.env.BKASH_PASSWORD);
  const appKey = normalizeText(process.env.BKASH_APP_KEY);
  const appSecret = normalizeText(process.env.BKASH_APP_SECRET);
  const callbackUrl = normalizeText(process.env.BKASH_CALLBACK_URL) ?? `${getBackendUrl()}/api/payments/bkash/callback`;

  if (!baseUrl || !username || !password || !appKey || !appSecret) {
    return null;
  }

  return {
    appKey,
    appSecret,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    callbackUrl,
    password,
    username,
  };
}

async function fetchBkashGrantToken() {
  const config = getBkashConfig();

  if (!config) {
    throw new Error('bKash is not configured. Set BKASH_BASE_URL, BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, and BKASH_APP_SECRET.');
  }

  const response = await fetchPaymentProvider(`${config.baseUrl}/tokenized/checkout/token/grant`, {
    body: JSON.stringify({
      app_key: config.appKey,
      app_secret: config.appSecret,
    }),
    headers: {
      'Content-Type': 'application/json',
      password: config.password,
      username: config.username,
    },
    method: 'POST',
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload) {
    throw new Error('Failed to grant bKash token.');
  }

  const idToken = typeof payload.id_token === 'string' ? payload.id_token : null;

  if (!idToken) {
    throw new Error(typeof payload.statusMessage === 'string' ? payload.statusMessage : 'bKash token response did not include id_token.');
  }

  return {
    config,
    idToken,
    payload,
  };
}

async function createBkashPayment(args: { amount: number; localPaymentId: number; userId: number }) {
  const { config, idToken } = await fetchBkashGrantToken();
  const merchantInvoiceNumber = `BVAI-${args.localPaymentId}`;

  const response = await fetchPaymentProvider(`${config.baseUrl}/tokenized/checkout/create`, {
    body: JSON.stringify({
      amount: args.amount.toFixed(2),
      callbackURL: config.callbackUrl,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber,
      mode: '0011',
      payerReference: `user-${args.userId}`,
    }),
    headers: {
      'Content-Type': 'application/json',
      authorization: idToken,
      'x-app-key': config.appKey,
    },
    method: 'POST',
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload) {
    throw new Error('Failed to create bKash payment.');
  }

  if (typeof payload.bkashURL !== 'string' || typeof payload.paymentID !== 'string') {
    throw new Error(typeof payload.statusMessage === 'string' ? payload.statusMessage : 'bKash create payment response is incomplete.');
  }

  await upsertBkashPayment({
    bkashPaymentId: payload.paymentID as string,
    intent: 'sale',
    merchantInvoiceNumber,
    paymentId: args.localPaymentId,
    rawMetadata: payload,
  });

  await updatePaymentRecord({
    metadata: payload,
    paymentId: args.localPaymentId,
    providerPaymentId: payload.paymentID as string,
    status: 'pending',
  });

  return {
    bkashPaymentId: payload.paymentID as string,
    bkashUrl: payload.bkashURL as string,
  };
}

async function executeBkashPaymentByPaymentId(bkashPaymentId: string) {
  const { config, idToken } = await fetchBkashGrantToken();
  const response = await fetchPaymentProvider(`${config.baseUrl}/tokenized/checkout/execute`, {
    body: JSON.stringify({ paymentID: bkashPaymentId }),
    headers: {
      'Content-Type': 'application/json',
      authorization: idToken,
      'x-app-key': config.appKey,
    },
    method: 'POST',
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload) {
    throw new Error('Failed to execute bKash payment.');
  }

  return payload;
}

async function queryBkashPaymentByPaymentId(bkashPaymentId: string) {
  const { config, idToken } = await fetchBkashGrantToken();
  const response = await fetchPaymentProvider(`${config.baseUrl}/tokenized/checkout/payment/status`, {
    body: JSON.stringify({ paymentID: bkashPaymentId }),
    headers: {
      'Content-Type': 'application/json',
      authorization: idToken,
      'x-app-key': config.appKey,
    },
    method: 'POST',
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload) {
    throw new Error('Failed to query bKash payment.');
  }

  return payload;
}

async function refreshBkashPayment(
  localPayment: BkashPaymentAssociation,
  bkashPaymentId: string,
  executePayment: boolean,
) {
  if (localPayment.status === 'completed') {
    return localPayment;
  }

  const executePayload = executePayment
    ? await executeBkashPaymentByPaymentId(bkashPaymentId)
    : {};
  const queryPayload = await queryBkashPaymentByPaymentId(bkashPaymentId);
  const providerPayloads = executePayment
    ? [executePayload, queryPayload]
    : [queryPayload];
  validateBkashProviderPayloads(localPayment, bkashPaymentId, providerPayloads);
  const trxId =
    typeof executePayload.trxID === 'string'
      ? executePayload.trxID
      : typeof queryPayload.trxID === 'string'
        ? queryPayload.trxID
        : null;
  const statusValue = normalizeText(queryPayload.transactionStatus)
    ?? normalizeText(executePayload.transactionStatus);

  await upsertBkashPayment({
    bkashPaymentId,
    executePayload,
    paymentId: localPayment.id,
    queryPayload,
    rawMetadata: { executePayload, queryPayload },
    trxId,
  });

  if (statusValue?.toUpperCase() === 'COMPLETED') {
    return finalizeCompletedPayment(localPayment.id);
  }

  const normalizedStatus = statusValue?.toUpperCase() ?? '';
  const localStatus = normalizedStatus.includes('CANCEL')
    ? 'cancelled'
    : normalizedStatus.includes('FAIL')
      ? 'failed'
      : 'pending';

  await updatePaymentRecord({
    metadata: { executePayload, queryPayload },
    paymentId: localPayment.id,
    providerPaymentId: bkashPaymentId,
    providerTransactionId: trxId,
    status: localStatus,
  });

  return getPaymentById(localPayment.id);
}

export function createPaymentsRouter() {
  const router = Router();

  router.get('/api/payments/config', requireCustomer, async (_req, res) => {
    res.json({
      providers: getPaymentProviderAvailability(),
    });
  });

  router.post('/api/payments/create', requireCustomer, paymentCreationLimiter, async (req, res) => {
    const provider = normalizeText(req.body.provider) as PaymentProvider | null;
    const packageCode = normalizeText(req.body.packageCode);
    const extraTokenAmount = toOptionalNumber(req.body.extraTokenAmount);
    const selection = getPurchaseItem({ extraTokenAmount, packageCode });

    if (!selection) {
      res.status(400).json({ error: 'Choose Gold, Platinum, or the supported extra token package.' });
      return;
    }

    const eligibilityError = await getPurchaseEligibilityError(
      req.session.customerUser!.id,
      selection,
    );

    if (eligibilityError) {
      res.status(403).json({ error: eligibilityError });
      return;
    }

    try {
      if (provider === 'stripe') {
        const stripe = getStripeClient();

        if (!isStripeAvailableForSelection(selection) || !stripe || !selection.stripePriceId) {
          res.status(503).json({ error: 'Stripe is not configured.' });
          return;
        }

        const payment = await createPayment({
          amount: selection.amount,
          currency: selection.currency,
          metadata: {
            extraTokenAmount: getSelectionTokenAmount(selection),
            packageCode: getSelectionPackageCode(selection),
          },
          packageCode: getSelectionPackageCode(selection),
          paymentType: selection.kind,
          provider: 'stripe',
          tokenAmount: getSelectionTokenAmount(selection),
          userId: req.session.customerUser!.id,
        });

        const successUrl = new URL('/payment/success', getFrontendUrl());
        successUrl.searchParams.set('payment_id', String(payment.id));
        successUrl.searchParams.set('provider', 'stripe');
        successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

        const cancelUrl = new URL('/dashboard', getFrontendUrl());
        cancelUrl.searchParams.set('payment', 'cancelled');

        const session = await stripe.checkout.sessions.create({
          cancel_url: cancelUrl.toString(),
          client_reference_id: String(payment.id),
          line_items: [{ price: selection.stripePriceId, quantity: 1 }],
          metadata: {
            paymentId: String(payment.id),
            purchaseKind: selection.kind,
          },
          mode: 'payment',
          success_url: successUrl.toString(),
        });

        await upsertStripePayment({
          checkoutSessionId: session.id,
          paymentId: payment.id,
          priceId: selection.stripePriceId,
          rawPayload: session as unknown as Record<string, unknown>,
        });

        await updatePaymentRecord({
          metadata: session as unknown as Record<string, unknown>,
          paymentId: payment.id,
          providerPaymentId: session.id,
          status: 'pending',
        });

        res.json({
          checkoutSessionId: session.id,
          checkoutUrl: session.url,
          paymentId: payment.id,
        });
        return;
      }

      if (provider === 'bkash') {
        const bkashAmount = getBkashAmount(selection);

        if (!getBkashConfig() || bkashAmount === null) {
          res.status(503).json({ error: 'bKash pricing is not configured for this purchase.' });
          return;
        }

        const payment = await createPayment({
          amount: bkashAmount,
          currency: 'BDT',
          metadata: {
            extraTokenAmount: getSelectionTokenAmount(selection),
            packageCode: getSelectionPackageCode(selection),
          },
          packageCode: getSelectionPackageCode(selection),
          paymentType: selection.kind,
          provider: 'bkash',
          tokenAmount: getSelectionTokenAmount(selection),
          userId: req.session.customerUser!.id,
        });

        const bkashPayment = await createBkashPayment({
          amount: bkashAmount,
          localPaymentId: payment.id,
          userId: req.session.customerUser!.id,
        });

        res.json({
          bkashPaymentId: bkashPayment.bkashPaymentId,
          bkashUrl: bkashPayment.bkashUrl,
          paymentId: payment.id,
        });
        return;
      }

      res.status(400).json({ error: 'Choose a valid payment provider.' });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to create payment.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.get('/api/payments/history', requireCustomer, async (req, res) => {
    try {
      const payments = await getPaymentsForUser(req.session.customerUser!.id);
      res.json({ payments: payments.map(serializePayment) });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load payment history.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.get('/api/payments/:paymentId', requireCustomer, async (req, res) => {
    try {
      const paymentId = Number(req.params.paymentId);

      if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
        res.status(400).json({ error: 'Invalid payment id.' });
        return;
      }

      const payment = await getPaymentById(paymentId);

      if (!payment || payment.user_id !== req.session.customerUser!.id) {
        res.status(404).json({ error: 'Payment not found.' });
        return;
      }

      res.json({ payment: serializePayment(payment) });
    } catch (error) {
      const publicError = toPublicApiError(error, 'Failed to load payment.');
      res.status(publicError.statusCode).json({
        error: publicError.message,
      });
    }
  });

  router.post('/api/payments/stripe/webhook', async (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = normalizeText(process.env.STRIPE_WEBHOOK_SECRET);

    if (!stripe || !webhookSecret) {
      res.status(503).json({ error: 'Stripe webhook is not configured.' });
      return;
    }

    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing Stripe signature.' });
      return;
    }

    try {
      const event = stripe.webhooks.constructEvent(
        ((req as typeof req & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body))),
        signature,
        webhookSecret,
      );

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        const association = await getStripePaymentAssociationBySessionId(session.id);

        if (!association) {
          throw new Error('Stripe checkout session has no local payment association.');
        }

        validateStripeCheckoutSession(
          session,
          association,
          event.type === 'checkout.session.async_payment_succeeded',
        );
        const recorded = await recordStripeWebhook({
          checkoutSessionId: session.id,
          paymentId: association.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          rawPayload: session as unknown as Record<string, unknown>,
          webhookEventId: event.id,
        });

        if (!recorded) {
          throw new Error('Stripe webhook association changed before it could be recorded.');
        }

        if (session.payment_status === 'paid') {
          await finalizeCompletedPayment(association.id);
        }
      }

      if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const association = await getStripePaymentAssociationBySessionId(session.id);

        if (!association) {
          throw new Error('Stripe checkout session has no local payment association.');
        }

        validateStripeCheckoutSession(session, association, false);
        const recorded = await recordStripeWebhook({
          checkoutSessionId: session.id,
          paymentId: association.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          rawPayload: session as unknown as Record<string, unknown>,
          webhookEventId: event.id,
        });

        if (!recorded) {
          throw new Error('Stripe webhook association changed before it could be recorded.');
        }

        await updatePaymentRecord({
          metadata: { stripeEventId: event.id },
          paymentId: association.id,
          providerPaymentId: session.id,
          providerTransactionId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          status: 'failed',
        });
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Failed to process Stripe webhook.', {
        error,
      });
      res.status(400).json({ error: 'Invalid Stripe webhook.' });
    }
  });

  router.get('/api/payments/bkash/callback', paymentCallbackLimiter, async (req, res) => {
    const bkashPaymentId = normalizeText(req.query.paymentID) ?? normalizeText(req.query.paymentId);
    const status = normalizeText(req.query.status)?.toLowerCase() ?? 'unknown';
    const frontendUrl = new URL('/payment/success', getFrontendUrl());

    try {
      if (!bkashPaymentId) {
        frontendUrl.searchParams.set('status', 'failed');
        frontendUrl.searchParams.set('reason', 'missing_payment_id');
        res.redirect(frontendUrl.toString());
        return;
      }

      const payment = await getPaymentByBkashPaymentId(bkashPaymentId);

      if (!payment) {
        frontendUrl.searchParams.set('status', 'failed');
        frontendUrl.searchParams.set('reason', 'payment_not_found');
        res.redirect(frontendUrl.toString());
        return;
      }

      await upsertBkashPayment({
        bkashPaymentId,
        callbackPayload: req.query as Record<string, unknown>,
        paymentId: payment.id,
        rawMetadata: req.query as Record<string, unknown>,
      });

      await refreshBkashPayment(payment, bkashPaymentId, status === 'success');

      frontendUrl.searchParams.set('payment_id', String(payment.id));
      frontendUrl.searchParams.set('provider', 'bkash');
      res.redirect(frontendUrl.toString());
    } catch (error) {
      console.error('Failed to process bKash callback.', {
        bkashPaymentId,
        error,
        status,
      });
      frontendUrl.searchParams.set('status', 'failed');
      frontendUrl.searchParams.set('reason', 'callback_error');
      res.redirect(frontendUrl.toString());
    }
  });

  return router;
}
