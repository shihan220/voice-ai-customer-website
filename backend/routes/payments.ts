import { Router } from 'express';
import Stripe from 'stripe';
import { createJsonRateLimiter, getBackendUrl, getFrontendUrl, normalizeText, requireText, toOptionalNumber } from '../core.ts';
import { type PaymentProvider, type PaymentRecord, type UserPackageType } from '../db.ts';
import {
  createPayment,
  finalizeCompletedPayment,
  getPaymentByBkashPaymentId,
  getPaymentById,
  getPaymentsForUser,
  getUserById,
  upsertBkashPayment,
  upsertStripePayment,
  updatePaymentRecord,
} from '../services/customers.ts';
import { requireCustomer } from './customer-auth.ts';

type PackageUpgradeSelection = {
  amount: number;
  currency: string;
  kind: 'package_upgrade';
  packageCode: UserPackageType;
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

function serializePayment(payment: PaymentRecord) {
  return {
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
  };
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

async function canCustomerPurchaseSelection(userId: number, selection: PurchaseSelection) {
  if (selection.kind !== 'extra_tokens') {
    return true;
  }

  const user = await getUserById(userId);
  return Boolean(user && user.package_code !== 'starter');
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

  const response = await fetch(`${config.baseUrl}/tokenized/checkout/token/grant`, {
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

  const response = await fetch(`${config.baseUrl}/tokenized/checkout/create`, {
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
  const response = await fetch(`${config.baseUrl}/tokenized/checkout/execute`, {
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
  const response = await fetch(`${config.baseUrl}/tokenized/checkout/payment/status`, {
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

async function handleCompletedBkashPayment(localPayment: PaymentRecord, bkashPaymentId: string) {
  const executePayload = await executeBkashPaymentByPaymentId(bkashPaymentId);
  const queryPayload = await queryBkashPaymentByPaymentId(bkashPaymentId);
  const trxId =
    typeof executePayload.trxID === 'string'
      ? executePayload.trxID
      : typeof queryPayload.trxID === 'string'
        ? queryPayload.trxID
        : null;
  const statusValue =
    typeof executePayload.transactionStatus === 'string'
      ? executePayload.transactionStatus
      : typeof queryPayload.transactionStatus === 'string'
        ? queryPayload.transactionStatus
        : null;

  await upsertBkashPayment({
    bkashPaymentId,
    executePayload,
    paymentId: localPayment.id,
    queryPayload,
    rawMetadata: { executePayload, queryPayload },
    trxId,
  });

  if (statusValue?.toUpperCase() === 'COMPLETED' || String(executePayload.statusCode ?? '') === '0000') {
    return finalizeCompletedPayment(localPayment.id);
  }

  await updatePaymentRecord({
    metadata: { executePayload, queryPayload },
    paymentId: localPayment.id,
    providerPaymentId: bkashPaymentId,
    providerTransactionId: trxId,
    status: 'failed',
  });

  return getPaymentById(localPayment.id);
}

export function createPaymentsRouter() {
  const router = Router();

  router.post('/api/payments/create', requireCustomer, paymentCreationLimiter, async (req, res) => {
    const provider = normalizeText(req.body.provider) as PaymentProvider | null;
    const packageCode = normalizeText(req.body.packageCode);
    const extraTokenAmount = toOptionalNumber(req.body.extraTokenAmount);
    const selection = getPurchaseItem({ extraTokenAmount, packageCode });

    if (!selection) {
      res.status(400).json({ error: 'Choose Gold, Platinum, or the supported extra token package.' });
      return;
    }

    if (!(await canCustomerPurchaseSelection(req.session.customerUser!.id, selection))) {
      res.status(403).json({ error: 'Extra token purchases are available only for Gold and Platinum accounts.' });
      return;
    }

    try {
      if (provider === 'stripe') {
        const stripe = getStripeClient();

        if (!stripe || !selection.stripePriceId) {
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
        const payment = await createPayment({
          amount: selection.amount,
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
          amount: selection.amount,
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
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create payment.',
      });
    }
  });

  router.get('/api/payments/history', requireCustomer, async (req, res) => {
    try {
      const payments = await getPaymentsForUser(req.session.customerUser!.id);
      res.json({ payments: payments.map(serializePayment) });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load payment history.',
      });
    }
  });

  router.get('/api/payments/:paymentId', requireCustomer, async (req, res) => {
    try {
      const paymentId = Number(req.params.paymentId);

      if (!Number.isFinite(paymentId)) {
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
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load payment.',
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
        const paymentId = Number(session.metadata?.paymentId ?? session.client_reference_id);

        if (Number.isFinite(paymentId)) {
          await upsertStripePayment({
            checkoutSessionId: session.id,
            paymentId,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            rawPayload: session as unknown as Record<string, unknown>,
            webhookEventId: event.id,
          });
          await finalizeCompletedPayment(paymentId);
        }
      }

      if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentId = Number(session.metadata?.paymentId ?? session.client_reference_id);

        if (Number.isFinite(paymentId)) {
          await updatePaymentRecord({
            metadata: session as unknown as Record<string, unknown>,
            paymentId,
            providerPaymentId: session.id,
            providerTransactionId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            status: 'failed',
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to process Stripe webhook.',
      });
    }
  });

  router.post('/api/payments/bkash/grant-token', requireCustomer, async (_req, res) => {
    try {
      const tokenInfo = await fetchBkashGrantToken();
      res.json({
        configured: true,
        tokenType: typeof tokenInfo.payload.token_type === 'string' ? tokenInfo.payload.token_type : 'Bearer',
      });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Failed to grant bKash token.',
      });
    }
  });

  router.post('/api/payments/bkash/create-payment', requireCustomer, paymentCreationLimiter, async (req, res) => {
    const packageCode = normalizeText(req.body.packageCode);
    const extraTokenAmount = toOptionalNumber(req.body.extraTokenAmount);
    const selection = getPurchaseItem({ extraTokenAmount, packageCode });

    if (!selection) {
      res.status(400).json({ error: 'Choose Gold, Platinum, or the supported extra token package.' });
      return;
    }

    if (!(await canCustomerPurchaseSelection(req.session.customerUser!.id, selection))) {
      res.status(403).json({ error: 'Extra token purchases are available only for Gold and Platinum accounts.' });
      return;
    }

    try {
      const payment = await createPayment({
        amount: selection.amount,
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
        amount: selection.amount,
        localPaymentId: payment.id,
        userId: req.session.customerUser!.id,
      });

      res.json({
        bkashPaymentId: bkashPayment.bkashPaymentId,
        bkashUrl: bkashPayment.bkashUrl,
        paymentId: payment.id,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create bKash payment.',
      });
    }
  });

  router.get('/api/payments/bkash/callback', async (req, res) => {
    const bkashPaymentId = normalizeText(req.query.paymentID) ?? normalizeText(req.query.paymentId);
    const status = normalizeText(req.query.status)?.toLowerCase() ?? 'unknown';
    const frontendUrl = new URL('/payment/success', getFrontendUrl());

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

    if (status === 'success') {
      await handleCompletedBkashPayment(payment, bkashPaymentId);
    } else if (status === 'cancel' || status === 'cancelled') {
      await updatePaymentRecord({
        metadata: req.query as Record<string, unknown>,
        paymentId: payment.id,
        providerPaymentId: bkashPaymentId,
        status: 'cancelled',
      });
    } else {
      await updatePaymentRecord({
        metadata: req.query as Record<string, unknown>,
        paymentId: payment.id,
        providerPaymentId: bkashPaymentId,
        status: 'failed',
      });
    }

    frontendUrl.searchParams.set('payment_id', String(payment.id));
    frontendUrl.searchParams.set('provider', 'bkash');
    res.redirect(frontendUrl.toString());
  });

  router.post('/api/payments/bkash/execute-payment', requireCustomer, async (req, res) => {
    try {
      const bkashPaymentId = requireText(req.body.bkashPaymentId ?? req.body.paymentID, 'bKash payment id is required.');
      const payment = await getPaymentByBkashPaymentId(bkashPaymentId);

      if (!payment || payment.user_id !== req.session.customerUser!.id) {
        res.status(404).json({ error: 'Payment not found.' });
        return;
      }

      const result = await handleCompletedBkashPayment(payment, bkashPaymentId);
      res.json({ payment: result ? serializePayment(result) : null });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute bKash payment.',
      });
    }
  });

  router.post('/api/payments/bkash/query-payment', requireCustomer, async (req, res) => {
    try {
      const bkashPaymentId = requireText(req.body.bkashPaymentId ?? req.body.paymentID, 'bKash payment id is required.');
      const payment = await getPaymentByBkashPaymentId(bkashPaymentId);

      if (!payment || payment.user_id !== req.session.customerUser!.id) {
        res.status(404).json({ error: 'Payment not found.' });
        return;
      }

      const queryPayload = await queryBkashPaymentByPaymentId(bkashPaymentId);

      await upsertBkashPayment({
        bkashPaymentId,
        paymentId: payment.id,
        queryPayload,
        rawMetadata: queryPayload,
        trxId: typeof queryPayload.trxID === 'string' ? queryPayload.trxID : null,
      });

      const refreshedPayment = await getPaymentById(payment.id);

      res.json({
        payment: refreshedPayment ? serializePayment(refreshedPayment) : null,
        query: queryPayload,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to query bKash payment.',
      });
    }
  });

  return router;
}
