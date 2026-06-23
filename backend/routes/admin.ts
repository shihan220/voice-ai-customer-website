import { Router } from 'express';
import {
  pool,
  type AdminActionRecord,
  type EmailLogStatus,
  type PackageUpgradeRecord,
  type PaymentRecord,
  type SampleEmailLogRecord,
  type SampleGenerationRecord,
  type SampleRequestRecord,
  type SampleRequestStatus,
  type TokenTransactionRecord,
  type TtsPronunciationRuleRecord,
  type UserPackageType,
  type UserRecord,
  type VoiceCardRecord,
} from '../db.ts';
import {
  adminSessionCookieName,
  ensureAdminConfigured,
  fetchNextVoiceCardId,
  fetchSampleRequestById,
  fetchVoiceCardById,
  fs,
  getAdminCredentials,
  getBaseUrl,
  getSmtpConfig,
  getSmtpStatus,
  isValidEmail,
  markRequestStatus,
  maxAudioFileSizeBytes,
  mediaRoot,
  multer,
  nodemailer,
  normalizeText,
  path,
  removeFileIfPresent,
  requireAdmin,
  requireText,
  runPublicVoiceUpload,
  serveAdminShell,
  toEmailLogResponse,
  toOptionalNumber,
  toSampleRequestResponse,
  toVoiceResponse,
  validDeliveryModes,
  validRequestStatuses,
} from '../core.ts';
import {
  adminAdjustUserTokens,
  adminUpgradeUserPackage,
  listAdminActions,
  listAllPayments,
  listPackageUpgrades,
  listPackages,
  listTokenTransactions,
  listUsers,
} from '../services/customers.ts';
import {
  createTtsPronunciationRule,
  deleteTtsPronunciationRule,
  listTtsPronunciationRules,
  updateTtsPronunciationRule,
} from '../services/tts-jobs.ts';

function toAdminUserResponse(row: UserRecord) {
  return {
    accountStatus: row.account_status,
    countryCode: row.country_code,
    createdAt: row.created_at,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    id: Number(row.id),
    mobileE164: row.mobile_e164,
    mobileNumber: row.mobile_number,
    packageCode: row.package_code,
    phoneVerifiedAt: row.phone_verified_at,
    starterGrantedAt: row.starter_granted_at,
    starterLastRefillAt: row.starter_last_refill_at,
    tokenBalance: Number(row.token_balance),
    updatedAt: row.updated_at,
  };
}

function toPaymentResponse(row: PaymentRecord) {
  return {
    amount: Number(row.amount),
    completedAt: row.completed_at,
    createdAt: row.created_at,
    currency: row.currency,
    id: Number(row.id),
    metadata: row.metadata,
    packageCode: row.package_code,
    paymentType: row.payment_type,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    providerTransactionId: row.provider_transaction_id,
    status: row.status,
    tokenAmount: row.token_amount === null ? null : Number(row.token_amount),
    updatedAt: row.updated_at,
    userId: Number(row.user_id),
  };
}

function toTokenTransactionResponse(row: TokenTransactionRecord) {
  return {
    balanceAfter: Number(row.balance_after),
    createdAt: row.created_at,
    id: Number(row.id),
    notes: row.notes,
    packageUpgradeId: row.package_upgrade_id === null ? null : Number(row.package_upgrade_id),
    paymentId: row.payment_id === null ? null : Number(row.payment_id),
    tokenDelta: Number(row.token_delta),
    transactionType: row.transaction_type,
    userId: Number(row.user_id),
  };
}

function toPackageUpgradeResponse(row: PackageUpgradeRecord) {
  return {
    createdAt: row.created_at,
    fromPackageCode: row.from_package_code,
    grantedTokenAmount: row.granted_token_amount === null ? null : Number(row.granted_token_amount),
    id: Number(row.id),
    paymentId: row.payment_id === null ? null : Number(row.payment_id),
    status: row.status,
    toPackageCode: row.to_package_code,
    updatedAt: row.updated_at,
    userId: Number(row.user_id),
  };
}

function toSampleGenerationResponse(
  row: SampleGenerationRecord & {
    user_email: string;
  },
) {
  return {
    audioFile: row.audio_file,
    audioUrl: row.audio_file ? `/media/${row.audio_file}` : null,
    createdAt: row.created_at,
    finalized: row.status === 'finalized',
    finalizedAt: row.finalized_at,
    id: Number(row.id),
    regenerationAttemptsRemaining: Math.max(
      0,
      Number(row.max_regeneration_attempts) - Number(row.regeneration_attempts_used),
    ),
    regenerationAttemptsUsed: Number(row.regeneration_attempts_used),
    selectedService: row.selected_service,
    status: row.status,
    tokenCost: Number(row.token_cost),
    updatedAt: row.updated_at,
    userEmail: row.user_email,
    wordCount: Number(row.word_count),
  };
}

function toAdminActionResponse(row: AdminActionRecord) {
  return {
    actionType: row.action_type,
    adminEmail: row.admin_email,
    createdAt: row.created_at,
    id: Number(row.id),
    metadata: row.metadata,
    packageUpgradeId: row.package_upgrade_id === null ? null : Number(row.package_upgrade_id),
    paymentId: row.payment_id === null ? null : Number(row.payment_id),
    targetUserId: row.target_user_id === null ? null : Number(row.target_user_id),
    tokenTransactionId: row.token_transaction_id === null ? null : Number(row.token_transaction_id),
  };
}

function toTtsPronunciationRuleResponse(row: TtsPronunciationRuleRecord) {
  return {
    createdAt: row.created_at,
    id: Number(row.id),
    isActive: row.is_active,
    matchText: row.match_text,
    matchType: row.match_type,
    notes: row.notes,
    replacementText: row.replacement_text,
    updatedAt: row.updated_at,
  };
}

type SalesRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

const validSalesRanges = new Set<SalesRange>(['daily', 'weekly', 'monthly', 'yearly']);

function isSalesRange(value: string | null): value is SalesRange {
  return Boolean(value && validSalesRanges.has(value as SalesRange));
}

function getSalesBucketConfig(range: SalesRange) {
  const saleTimestamp = 'COALESCE(completed_at, updated_at, created_at)';

  if (range === 'daily') {
    return {
      bucketExpression: `DATE_TRUNC('hour', ${saleTimestamp})`,
      periodFormat: 'DD/MM/YYYY HH24:MI',
    };
  }

  if (range === 'weekly') {
    return {
      bucketExpression: `DATE_TRUNC('day', ${saleTimestamp})`,
      periodFormat: 'DD/MM/YYYY',
    };
  }

  if (range === 'yearly') {
    return {
      bucketExpression: `DATE_TRUNC('month', ${saleTimestamp})`,
      periodFormat: 'MM/YYYY',
    };
  }

  return {
    bucketExpression: `DATE_TRUNC('week', ${saleTimestamp})`,
    periodFormat: 'DD/MM/YYYY',
  };
}

async function getAdminSalesAnalytics(range: SalesRange) {
  const { bucketExpression, periodFormat } = getSalesBucketConfig(range);

  const [summaryResult, primaryCurrencyResult] = await Promise.all([
    pool.query<{
      pending_count: string;
      successful_count: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count,
        COUNT(*) FILTER (WHERE status = 'completed')::text AS successful_count
      FROM payments
      WHERE amount > 0
        AND (
          (payment_type = 'package_upgrade' AND package_code IN ('gold', 'platinum'))
          OR payment_type = 'extra_tokens'
        )
    `),
    pool.query<{
      currency: string;
      successful_revenue: string;
    }>(`
      SELECT
        currency,
        COALESCE(SUM(amount), 0)::text AS successful_revenue
      FROM payments
      WHERE status = 'completed'
        AND amount > 0
        AND (
          (payment_type = 'package_upgrade' AND package_code IN ('gold', 'platinum'))
          OR payment_type = 'extra_tokens'
        )
      GROUP BY currency
      ORDER BY SUM(amount) DESC, currency ASC
      LIMIT 1
    `),
  ]);

  const primaryCurrency = primaryCurrencyResult.rows[0]?.currency ?? 'N/A';
  const successfulRevenue = Number(primaryCurrencyResult.rows[0]?.successful_revenue ?? 0);
  const seriesResult = primaryCurrency === 'N/A'
    ? { rows: [] as Array<{ period: string; revenue: string; sales_count: string }> }
    : await pool.query<{
        period: string;
        revenue: string;
        sales_count: string;
      }>(
        `
          SELECT
            TO_CHAR(${bucketExpression}, '${periodFormat}') AS period,
            COALESCE(SUM(amount), 0)::text AS revenue,
            COUNT(*)::text AS sales_count
          FROM payments
          WHERE status = 'completed'
            AND amount > 0
            AND currency = $1
            AND (
              (payment_type = 'package_upgrade' AND package_code IN ('gold', 'platinum'))
              OR payment_type = 'extra_tokens'
            )
          GROUP BY ${bucketExpression}
          ORDER BY ${bucketExpression} ASC
        `,
        [primaryCurrency],
      );

  const summary = summaryResult.rows[0];

  return {
    paymentSummary: {
      currency: primaryCurrency,
      pendingCount: Number(summary?.pending_count ?? 0),
      successfulCount: Number(summary?.successful_count ?? 0),
      successfulRevenue,
    },
    salesSeries: seriesResult.rows.map((row) => ({
      period: row.period,
      revenue: Number(row.revenue),
      salesCount: Number(row.sales_count),
    })),
  };
}

export function createAdminRouter() {
  const router = Router();

  router.get('/api/admin/session', (req, res) => {
    res.json({
      adminEmail: req.session.adminUser?.email ?? null,
      authenticated: Boolean(req.session.adminUser),
    });
  });

  router.post('/api/admin/login', (req, res) => {
    if (!ensureAdminConfigured(res)) {
      return;
    }

    const credentials = getAdminCredentials();
    const email = normalizeText(req.body.email);
    const password = normalizeText(req.body.password);

    if (!credentials || !email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (email !== credentials.email || password !== credentials.password) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    req.session.regenerate((error) => {
      if (error) {
        res.status(500).json({ error: 'Failed to initialize admin session.' });
        return;
      }

      req.session.adminUser = { email: credentials.email };
      req.session.save((saveError) => {
        if (saveError) {
          res.status(500).json({ error: 'Failed to save admin session.' });
          return;
        }

        res.json({ adminEmail: credentials.email, authenticated: true });
      });
    });
  });

  router.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie(adminSessionCookieName);
      res.json({ authenticated: false });
    });
  });

  router.get('/api/admin/email-status', requireAdmin, (_req, res) => {
    const smtpStatus = getSmtpStatus();

    res.json({
      configured: smtpStatus.configured,
      from: smtpStatus.from,
      host: smtpStatus.host,
      message: smtpStatus.message,
      missing: smtpStatus.missing,
      port: smtpStatus.port,
    });
  });

  router.get('/api/admin/users', requireAdmin, async (_req, res) => {
    try {
      const [users, packages] = await Promise.all([listUsers(), listPackages()]);

      res.json({
        packages: packages.map((item) => ({
          code: item.package_code,
          displayOrder: item.display_order,
          isPremium: item.is_premium,
          monthlyRefillTokens: Number(item.monthly_refill_tokens),
          name: item.name,
          signupTokenGrant: Number(item.signup_token_grant),
        })),
        users: users.map(toAdminUserResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load users.',
      });
    }
  });

  router.post('/api/admin/users/:id/token-adjustments', requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const tokenDelta = toOptionalNumber(req.body.tokenDelta);

      if (!Number.isFinite(userId)) {
        res.status(400).json({ error: 'Invalid user id.' });
        return;
      }

      if (tokenDelta === null || !Number.isFinite(tokenDelta) || tokenDelta === 0) {
        res.status(400).json({ error: 'Provide a non-zero token adjustment.' });
        return;
      }

      const result = await adminAdjustUserTokens({
        adminEmail: req.session.adminUser!.email,
        notes: normalizeText(req.body.notes),
        tokenDelta,
        userId,
      });

      res.json({
        action: toAdminActionResponse(result.action),
        transaction: toTokenTransactionResponse(result.transaction),
        user: toAdminUserResponse(result.user),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to adjust user tokens.',
      });
    }
  });

  router.post('/api/admin/users/:id/package-upgrades', requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const packageCode = normalizeText(req.body.packageCode) as UserPackageType | null;

      if (!Number.isFinite(userId)) {
        res.status(400).json({ error: 'Invalid user id.' });
        return;
      }

      if (packageCode !== 'starter' && packageCode !== 'gold' && packageCode !== 'platinum') {
        res.status(400).json({ error: 'Choose a valid package.' });
        return;
      }

      const result = await adminUpgradeUserPackage({
        adminEmail: req.session.adminUser!.email,
        notes: normalizeText(req.body.notes),
        packageCode,
        userId,
      });

      res.json({
        action: toAdminActionResponse(result.action),
        packageUpgrade: toPackageUpgradeResponse(result.packageUpgrade),
        transaction: result.transaction ? toTokenTransactionResponse(result.transaction) : null,
        user: toAdminUserResponse(result.user),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to upgrade the user package.',
      });
    }
  });

  router.get('/api/admin/payments', requireAdmin, async (_req, res) => {
    try {
      const [payments, tokenTransactions, packageUpgrades] = await Promise.all([
        listAllPayments(),
        listTokenTransactions(),
        listPackageUpgrades(),
      ]);

      res.json({
        packageUpgrades: packageUpgrades.map(toPackageUpgradeResponse),
        payments: payments.map(toPaymentResponse),
        tokenTransactions: tokenTransactions.map(toTokenTransactionResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load payments.',
      });
    }
  });

  router.get('/api/admin/admin-actions', requireAdmin, async (_req, res) => {
    try {
      const actions = await listAdminActions();

      res.json({
        actions: actions.map(toAdminActionResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load admin actions.',
      });
    }
  });

  router.get('/api/admin/tts-pronunciation-rules', requireAdmin, async (_req, res) => {
    try {
      const rules = await listTtsPronunciationRules();

      res.json({
        rules: rules.map(toTtsPronunciationRuleResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load pronunciation rules.',
      });
    }
  });

  router.post('/api/admin/tts-pronunciation-rules', requireAdmin, async (req, res) => {
    try {
      const rule = await createTtsPronunciationRule({
        isActive: req.body.isActive !== false,
        matchText: requireText(req.body.matchText, 'Match text is required.'),
        matchType: normalizeText(req.body.matchType),
        notes: normalizeText(req.body.notes),
        replacementText: requireText(req.body.replacementText, 'Replacement text is required.'),
      });

      res.status(201).json({
        rule: toTtsPronunciationRuleResponse(rule),
      });
    } catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 400;

      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to create pronunciation rule.',
      });
    }
  });

  router.patch('/api/admin/tts-pronunciation-rules/:id', requireAdmin, async (req, res) => {
    try {
      const ruleId = Number(req.params.id);

      if (!Number.isFinite(ruleId)) {
        res.status(400).json({ error: 'Invalid pronunciation rule id.' });
        return;
      }

      const rule = await updateTtsPronunciationRule(ruleId, {
        isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : undefined,
        matchText: typeof req.body.matchText === 'string' ? req.body.matchText : undefined,
        matchType: typeof req.body.matchType === 'string' ? req.body.matchType : undefined,
        notes: typeof req.body.notes === 'string' ? req.body.notes : undefined,
        replacementText: typeof req.body.replacementText === 'string' ? req.body.replacementText : undefined,
      });

      res.json({
        rule: toTtsPronunciationRuleResponse(rule),
      });
    } catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 400;

      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to update pronunciation rule.',
      });
    }
  });

  router.delete('/api/admin/tts-pronunciation-rules/:id', requireAdmin, async (req, res) => {
    try {
      const ruleId = Number(req.params.id);

      if (!Number.isFinite(ruleId)) {
        res.status(400).json({ error: 'Invalid pronunciation rule id.' });
        return;
      }

      const rule = await deleteTtsPronunciationRule(ruleId);

      res.json({
        deletedId: Number(rule.id),
        message: 'Pronunciation rule deleted.',
      });
    } catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 400;

      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to delete pronunciation rule.',
      });
    }
  });

  router.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
    try {
      const [countsResult, recentRequestsResult, recentEmailsResult] = await Promise.all([
        pool.query<{
          total_requests: string;
          new_requests: string;
          samples_ready: string;
          samples_sent: string;
        }>(`
          SELECT
            COUNT(*)::text AS total_requests,
            COUNT(*) FILTER (WHERE status = 'new')::text AS new_requests,
            COUNT(*) FILTER (WHERE status = 'sample_ready')::text AS samples_ready,
            COUNT(*) FILTER (WHERE status = 'sent')::text AS samples_sent
          FROM sample_requests
        `),
        pool.query<SampleRequestRecord>(`
          SELECT *
          FROM sample_requests
          ORDER BY created_at DESC
          LIMIT 8
        `),
        pool.query<
          SampleEmailLogRecord & {
            client_name: string | null;
            sample_title: string | null;
          }
        >(`
          SELECT
            l.*,
            r.client_name,
            COALESCE(vc.name, s.title) AS sample_title
          FROM sample_email_logs l
          LEFT JOIN sample_requests r ON r.id = l.request_id
          LEFT JOIN voice_samples s ON s.id = l.voice_sample_id
          LEFT JOIN voice_cards vc ON vc.id = l.voice_card_id
          ORDER BY COALESCE(l.sent_at, l.created_at) DESC
          LIMIT 8
        `),
      ]);

      const counts = countsResult.rows[0];

      res.json({
        recentEmails: recentEmailsResult.rows.map((row) => ({
          ...toEmailLogResponse(row),
          clientName: row.client_name,
          sampleTitle: row.sample_title,
        })),
        recentRequests: recentRequestsResult.rows.map(toSampleRequestResponse),
        stats: {
          newRequests: Number(counts?.new_requests ?? 0),
          samplesReady: Number(counts?.samples_ready ?? 0),
          samplesSent: Number(counts?.samples_sent ?? 0),
          totalRequests: Number(counts?.total_requests ?? 0),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load admin dashboard.',
      });
    }
  });

  router.get('/api/admin/dashboard/sales', requireAdmin, async (req, res) => {
    try {
      const requestedRange = normalizeText(req.query.range);
      const range = requestedRange ?? 'monthly';

      if (!isSalesRange(range)) {
        res.status(400).json({ error: 'Choose a valid sales analytics range: daily, weekly, monthly, or yearly.' });
        return;
      }

      res.json(await getAdminSalesAnalytics(range));
    } catch {
      res.status(500).json({ error: 'Failed to load sales analytics.' });
    }
  });

  router.get('/api/admin/sample-requests', requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query<SampleRequestRecord>(`
        SELECT *
        FROM sample_requests
        ORDER BY created_at DESC
      `);

      res.json({ requests: result.rows.map(toSampleRequestResponse) });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load sample requests.',
      });
    }
  });

  router.get('/api/admin/sample-requests/:id', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id);

      if (!Number.isFinite(requestId)) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
      }

      const sampleRequest = await fetchSampleRequestById(requestId);

      if (!sampleRequest) {
        res.status(404).json({ error: 'Sample request not found.' });
        return;
      }

      const emailLogsResult = await pool.query<
        SampleEmailLogRecord & {
          sample_title: string | null;
        }
      >(
        `
          SELECT
            l.*,
            COALESCE(vc.name, s.title) AS sample_title
          FROM sample_email_logs l
          LEFT JOIN voice_samples s ON s.id = l.voice_sample_id
          LEFT JOIN voice_cards vc ON vc.id = l.voice_card_id
          WHERE l.request_id = $1
          ORDER BY COALESCE(l.sent_at, l.created_at) DESC
        `,
        [requestId],
      );

      const sampleGenerationsResult = await pool.query<
        SampleGenerationRecord & {
          user_email: string;
        }
      >(
        `
          SELECT
            g.*,
            u.email AS user_email
          FROM sample_generations g
          INNER JOIN users u ON u.id = g.user_id
          WHERE g.sample_request_id = $1
          ORDER BY g.created_at DESC, g.id DESC
        `,
        [requestId],
      );

      res.json({
        emailLogs: emailLogsResult.rows.map((row) => ({
          ...toEmailLogResponse(row),
          sampleTitle: row.sample_title,
        })),
        request: toSampleRequestResponse(sampleRequest),
        sampleGenerations: sampleGenerationsResult.rows.map(toSampleGenerationResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load the sample request.',
      });
    }
  });

  router.patch('/api/admin/sample-requests/:id', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id);

      if (!Number.isFinite(requestId)) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
      }

      const existing = await fetchSampleRequestById(requestId);

      if (!existing) {
        res.status(404).json({ error: 'Sample request not found.' });
        return;
      }

      const nextStatus = normalizeText(req.body.status) as SampleRequestStatus | null;

      if (nextStatus && !validRequestStatuses.has(nextStatus)) {
        res.status(400).json({ error: 'Invalid request status.' });
        return;
      }

      const nextEmail = normalizeText(req.body.email) ?? existing.email;
      const nextPhoneNumber = Object.prototype.hasOwnProperty.call(req.body, 'phoneNumber')
        ? normalizeText(req.body.phoneNumber)
        : existing.phone_number;
      const nextCompanyName = Object.prototype.hasOwnProperty.call(req.body, 'companyName')
        ? normalizeText(req.body.companyName)
        : existing.company_name;
      const nextMessageDetails = Object.prototype.hasOwnProperty.call(req.body, 'messageDetails')
        ? normalizeText(req.body.messageDetails)
        : existing.message_details;
      const nextSelectedService = Object.prototype.hasOwnProperty.call(req.body, 'selectedService')
        ? normalizeText(req.body.selectedService)
        : existing.selected_service;
      const nextExpectedMonthlyVolume = Object.prototype.hasOwnProperty.call(req.body, 'expectedMonthlyVolume')
        ? normalizeText(req.body.expectedMonthlyVolume)
        : existing.expected_monthly_volume;

      if (!isValidEmail(nextEmail)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      const result = await pool.query<SampleRequestRecord>(
        `
          UPDATE sample_requests
          SET
            client_name = $2,
            email = $3,
            phone_number = $4,
            company_name = $5,
            message_details = $6,
            selected_service = $7,
            expected_monthly_volume = $8,
            status = $9,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          requestId,
          normalizeText(req.body.clientName) ?? existing.client_name,
          nextEmail,
          nextPhoneNumber,
          nextCompanyName,
          nextMessageDetails,
          nextSelectedService,
          nextExpectedMonthlyVolume,
          nextStatus ?? existing.status,
        ],
      );

      res.json({ request: toSampleRequestResponse(result.rows[0]) });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update the sample request.',
      });
    }
  });

  router.delete('/api/admin/sample-requests/:id', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id);

      if (!Number.isFinite(requestId)) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
      }

      const existing = await fetchSampleRequestById(requestId);

      if (!existing) {
        res.status(404).json({ error: 'Sample request not found.' });
        return;
      }

      await pool.query(
        `
          DELETE FROM sample_requests
          WHERE id = $1
        `,
        [requestId],
      );

      res.json({ deletedId: requestId, message: 'Sample request deleted successfully.' });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete the sample request.',
      });
    }
  });

  router.get('/api/admin/voice-cards', requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query<VoiceCardRecord>(`
        SELECT id, name, script_text, english_meaning, audio_file, duration, wave_seed, display_order, is_active
        FROM voice_cards
        ORDER BY display_order ASC, id ASC
      `);

      res.json({
        voiceCards: result.rows.map(toVoiceResponse),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load voice cards.',
      });
    }
  });

  router.post('/api/admin/voice-cards', requireAdmin, async (req, res) => {
    try {
      const nextId = await fetchNextVoiceCardId();
      const name = requireText(req.body.name, 'Voice card name is required.');
      const scriptText = requireText(req.body.scriptText, 'Bangla script/caption is required.');
      const duration = toOptionalNumber(req.body.duration);
      const order = toOptionalNumber(req.body.order);
      const waveSeed = toOptionalNumber(req.body.waveSeed);
      const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : String(req.body.isActive) !== 'false';

      if (duration === null || duration <= 0) {
        res.status(400).json({ error: 'Enter a valid duration.' });
        return;
      }

      if (order === null || order < 0) {
        res.status(400).json({ error: 'Enter a valid display order.' });
        return;
      }

      if (waveSeed === null) {
        res.status(400).json({ error: 'Enter a valid wave seed.' });
        return;
      }

      const insertResult = await pool.query<VoiceCardRecord>(
        `
          INSERT INTO voice_cards (
            id,
            name,
            script_text,
            english_meaning,
            audio_file,
            duration,
            wave_seed,
            display_order,
            is_active,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING *
        `,
        [
          nextId,
          name,
          scriptText,
          normalizeText(req.body.englishMeaning),
          normalizeText(req.body.audioFile),
          duration,
          waveSeed,
          order,
          isActive,
        ],
      );

      res.status(201).json({ voiceCard: toVoiceResponse(insertResult.rows[0]) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create the voice card.',
      });
    }
  });

  router.patch('/api/admin/voice-cards/:id', requireAdmin, async (req, res) => {
    try {
      const voiceCardId = Number(req.params.id);

      if (!Number.isFinite(voiceCardId)) {
        res.status(400).json({ error: 'Invalid voice card id.' });
        return;
      }

      const existing = await fetchVoiceCardById(voiceCardId);

      if (!existing) {
        res.status(404).json({ error: 'Voice card not found.' });
        return;
      }

      const nextDuration = Object.prototype.hasOwnProperty.call(req.body, 'duration')
        ? toOptionalNumber(req.body.duration)
        : Number(existing.duration);
      const nextOrder = Object.prototype.hasOwnProperty.call(req.body, 'order')
        ? toOptionalNumber(req.body.order)
        : Number(existing.display_order);
      const nextWaveSeed = Object.prototype.hasOwnProperty.call(req.body, 'waveSeed')
        ? toOptionalNumber(req.body.waveSeed)
        : Number(existing.wave_seed);

      if (nextDuration === null || nextDuration <= 0) {
        res.status(400).json({ error: 'Enter a valid duration.' });
        return;
      }

      if (nextOrder === null || nextOrder < 0) {
        res.status(400).json({ error: 'Enter a valid display order.' });
        return;
      }

      if (nextWaveSeed === null) {
        res.status(400).json({ error: 'Enter a valid wave seed.' });
        return;
      }

      const nextActive = Object.prototype.hasOwnProperty.call(req.body, 'isActive')
        ? (typeof req.body.isActive === 'boolean' ? req.body.isActive : String(req.body.isActive) !== 'false')
        : existing.is_active;

      const result = await pool.query<VoiceCardRecord>(
        `
          UPDATE voice_cards
          SET
            name = $2,
            script_text = $3,
            english_meaning = $4,
            duration = $5,
            wave_seed = $6,
            display_order = $7,
            is_active = $8,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          voiceCardId,
          normalizeText(req.body.name) ?? existing.name,
          normalizeText(req.body.scriptText) ?? existing.script_text,
          Object.prototype.hasOwnProperty.call(req.body, 'englishMeaning')
            ? normalizeText(req.body.englishMeaning)
            : existing.english_meaning,
          nextDuration,
          nextWaveSeed,
          nextOrder,
          nextActive,
        ],
      );

      res.json({ voiceCard: toVoiceResponse(result.rows[0]) });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update the voice card.',
      });
    }
  });

  router.post('/api/admin/voice-cards/:id/audio', requireAdmin, async (req, res) => {
    try {
      const voiceCardId = Number(req.params.id);

      if (!Number.isFinite(voiceCardId)) {
        res.status(400).json({ error: 'Invalid voice card id.' });
        return;
      }

      const existing = await fetchVoiceCardById(voiceCardId);

      if (!existing) {
        res.status(404).json({ error: 'Voice card not found.' });
        return;
      }

      await runPublicVoiceUpload(req, res);

      if (!req.file) {
        res.status(400).json({ error: 'Audio file is required.' });
        return;
      }

      const storedRelativePath = path.posix.join('voices', 'public', req.file.filename);
      const previousAudioFile = existing.audio_file;
      const result = await pool.query<VoiceCardRecord>(
        `
          UPDATE voice_cards
          SET audio_file = $2, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [voiceCardId, storedRelativePath],
      );

      if (previousAudioFile && previousAudioFile.startsWith('voices/public/')) {
        const previousAbsolutePath = path.join(mediaRoot, previousAudioFile);
        if (previousAbsolutePath !== req.file.path) {
          await removeFileIfPresent(previousAbsolutePath);
        }
      }

      res.json({ voiceCard: toVoiceResponse(result.rows[0]) });
    } catch (error) {
      if (req.file?.path) {
        await removeFileIfPresent(req.file.path);
      }

      const message =
        error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
          ? `File size exceeds ${Math.round(maxAudioFileSizeBytes / (1024 * 1024))}MB.`
          : error instanceof Error
            ? error.message
            : 'Failed to upload public voice audio.';

      res.status(400).json({ error: message });
    }
  });

  router.delete('/api/admin/voice-cards/:id', requireAdmin, async (req, res) => {
    try {
      const voiceCardId = Number(req.params.id);

      if (!Number.isFinite(voiceCardId)) {
        res.status(400).json({ error: 'Invalid voice card id.' });
        return;
      }

      const existing = await fetchVoiceCardById(voiceCardId);

      if (!existing) {
        res.status(404).json({ error: 'Voice card not found.' });
        return;
      }

      await pool.query(
        `
          DELETE FROM voice_cards
          WHERE id = $1
        `,
        [voiceCardId],
      );

      if (existing.audio_file && existing.audio_file.startsWith('voices/public/')) {
        const duplicateAudioResult = await pool.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM voice_cards
            WHERE audio_file = $1
          `,
          [existing.audio_file],
        );

        if (Number(duplicateAudioResult.rows[0]?.count ?? 0) === 0) {
          await removeFileIfPresent(path.join(mediaRoot, existing.audio_file));
        }
      }

      res.json({ deletedId: voiceCardId, message: 'Voice card deleted successfully.' });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete the voice card.',
      });
    }
  });

  router.get('/admin', (req, res) => {
    res.redirect(req.session.adminUser ? '/admin/dashboard' : '/admin/login');
  });

  router.get('/admin/login', async (req, res) => {
    await serveAdminShell(res);
  });

  router.get('/admin/send-sample', (req, res) => {
    res.redirect(req.session.adminUser ? '/admin/dashboard' : '/admin/login');
  });

  router.get('/admin/voice-samples', (_req, res) => {
    res.redirect('/admin/voice-cards');
  });

  router.get(
    [
      '/admin/dashboard',
      '/admin/sample-requests',
      '/admin/customers',
      '/admin/payments',
      '/admin/activity',
      '/admin/voice-cards',
      '/admin/pronunciation',
    ],
    async (req, res) => {
    if (!req.session.adminUser) {
      res.redirect('/admin/login');
      return;
    }

    await serveAdminShell(res);
    },
  );

  return router;
}
