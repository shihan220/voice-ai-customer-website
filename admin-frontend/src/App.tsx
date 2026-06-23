import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type AdminSession = {
  adminEmail: string | null;
  authenticated: boolean;
};

type SampleRequestStatus = 'new' | 'reviewing' | 'sample_ready' | 'sent' | 'archived';
type DeliveryMode = 'attachment' | 'link';

type SampleRequest = {
  clientName: string;
  companyName: string | null;
  createdAt: string;
  email: string;
  expectedMonthlyVolume: string | null;
  id: number;
  messageDetails: string | null;
  phoneNumber: string | null;
  referrer: string | null;
  selectedService: string | null;
  sourceUrl: string | null;
  status: SampleRequestStatus;
  updatedAt: string;
  userAgent: string | null;
};

type PublicVoiceCard = {
  audioFile: string | null;
  audioUrl: string | null;
  duration: number;
  englishMeaning: string | null;
  id: number;
  isActive: boolean;
  name: string;
  order: number;
  scriptText: string;
  waveSeed: number;
};

type EmailLog = {
  clientName?: string | null;
  createdAt: string;
  deliveryMode: DeliveryMode;
  errorMessage: string | null;
  id: number;
  message: string;
  recipientEmail: string;
  requestId: number | null;
  sampleTitle?: string | null;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed';
  subject: string;
  voiceCardId: number | null;
  voiceSampleId: number | null;
};

type SampleGenerationSummary = {
  audioFile: string;
  audioUrl: string | null;
  createdAt: string;
  finalized: boolean;
  finalizedAt: string | null;
  id: number;
  regenerationAttemptsRemaining: number;
  regenerationAttemptsUsed: number;
  selectedService: string;
  status: 'preview' | 'finalized' | 'failed';
  tokenCost: number;
  updatedAt: string;
  userEmail: string;
  wordCount: number;
};

type DashboardPayload = {
  recentEmails: EmailLog[];
  recentRequests: SampleRequest[];
  stats: {
    newRequests: number;
    samplesReady: number;
    samplesSent: number;
    totalRequests: number;
  };
};

type SalesRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

type SalesAnalyticsPayload = {
  paymentSummary: {
    currency: string;
    pendingCount: number;
    successfulCount: number;
    successfulRevenue: number;
  };
  salesSeries: Array<{
    period: string;
    revenue: number;
    salesCount: number;
  }>;
};

type AdminUser = {
  accountStatus: 'active' | 'disabled';
  countryCode: string | null;
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  id: number;
  mobileE164: string | null;
  mobileNumber: string | null;
  packageCode: 'starter' | 'gold' | 'platinum';
  phoneVerifiedAt: string | null;
  starterGrantedAt: string | null;
  starterLastRefillAt: string | null;
  tokenBalance: number;
  updatedAt: string;
};

type AdminPackageSummary = {
  code: 'starter' | 'gold' | 'platinum';
  displayOrder: number;
  isPremium: boolean;
  monthlyRefillTokens: number;
  name: string;
  signupTokenGrant: number;
};

type AdminPayment = {
  amount: number;
  completedAt: string | null;
  createdAt: string;
  currency: string;
  id: number;
  metadata: Record<string, unknown>;
  packageCode: string | null;
  paymentType: string;
  provider: string;
  providerPaymentId: string | null;
  providerTransactionId: string | null;
  status: string;
  tokenAmount: number | null;
  updatedAt: string;
  userId: number;
};

type AdminTokenTransaction = {
  balanceAfter: number;
  createdAt: string;
  id: number;
  notes: string | null;
  packageUpgradeId: number | null;
  paymentId: number | null;
  tokenDelta: number;
  transactionType: string;
  userId: number;
};

type AdminPackageUpgrade = {
  createdAt: string;
  fromPackageCode: string | null;
  grantedTokenAmount: number | null;
  id: number;
  paymentId: number | null;
  status: string;
  toPackageCode: string;
  updatedAt: string;
  userId: number;
};

type AdminAction = {
  actionType: string;
  adminEmail: string;
  createdAt: string;
  id: number;
  metadata: Record<string, unknown>;
  packageUpgradeId: number | null;
  paymentId: number | null;
  targetUserId: number | null;
  tokenTransactionId: number | null;
};

type CustomerFilter = 'all' | 'starter' | 'gold' | 'platinum';

type SampleRequestDetailPayload = {
  emailLogs: EmailLog[];
  request: SampleRequest;
  sampleGenerations: SampleGenerationSummary[];
};

type AppLocation = {
  pathname: string;
  search: string;
};

type VoiceCardDraft = {
  audioFile: string;
  audioUrl: string | null;
  duration: string;
  englishMeaning: string;
  id: number | null;
  isActive: boolean;
  name: string;
  order: string;
  scriptText: string;
  waveSeed: string;
};

type TtsPronunciationRule = {
  createdAt: string;
  id: number;
  isActive: boolean;
  matchText: string;
  matchType: 'phrase' | 'whole_word';
  notes: string | null;
  replacementText: string;
  updatedAt: string;
};

type TtsPronunciationRuleDraft = {
  id: number | null;
  isActive: boolean;
  matchText: string;
  matchType: 'phrase' | 'whole_word';
  notes: string;
  replacementText: string;
};

const protectedRoutes = new Set([
  '/admin/dashboard',
  '/admin/sample-requests',
  '/admin/customers',
  '/admin/payments',
  '/admin/activity',
  '/admin/voice-cards',
  '/admin/pronunciation',
]);

const requestStatuses: SampleRequestStatus[] = ['new', 'reviewing', 'sample_ready', 'sent', 'archived'];
const customerFilters: Array<{ label: string; value: CustomerFilter }> = [
  { label: 'All users', value: 'all' },
  { label: 'Starter', value: 'starter' },
  { label: 'Gold', value: 'gold' },
  { label: 'Platinum', value: 'platinum' },
];
const salesRanges: Array<{ label: string; value: SalesRange }> = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

function readLocation(): AppLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

async function apiRequest<T>(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  const raw = await response.text();
  const payload = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== '/admin/login') {
      window.location.assign('/admin/login');
    }

    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
      (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message) ||
      `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return payload as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function formatDate(value: string | null) {
  if (!value) return 'Not available';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function formatRevenue(value: number, currency: string) {
  if (!currency || currency === 'N/A') {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }

  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      style: 'currency',
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })} ${currency}`;
  }
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function createEmptyVoiceCardDraft(seed?: { order?: number; waveSeed?: number }): VoiceCardDraft {
  return {
    audioFile: '',
    audioUrl: null,
    duration: '8.00',
    englishMeaning: '',
    id: null,
    isActive: true,
    name: '',
    order: String(seed?.order ?? 0),
    scriptText: '',
    waveSeed: String(seed?.waveSeed ?? 42),
  };
}

function toVoiceCardDraft(card: PublicVoiceCard): VoiceCardDraft {
  return {
    audioFile: card.audioFile ?? '',
    audioUrl: card.audioUrl,
    duration: String(card.duration),
    englishMeaning: card.englishMeaning ?? '',
    id: card.id,
    isActive: card.isActive,
    name: card.name,
    order: String(card.order),
    scriptText: card.scriptText,
    waveSeed: String(card.waveSeed),
  };
}

function createEmptyPronunciationRuleDraft(): TtsPronunciationRuleDraft {
  return {
    id: null,
    isActive: true,
    matchText: '',
    matchType: 'phrase',
    notes: '',
    replacementText: '',
  };
}

function toPronunciationRuleDraft(rule: TtsPronunciationRule): TtsPronunciationRuleDraft {
  return {
    id: rule.id,
    isActive: rule.isActive,
    matchText: rule.matchText,
    matchType: rule.matchType,
    notes: rule.notes ?? '',
    replacementText: rule.replacementText,
  };
}

function App() {
  const [location, setLocation] = useState<AppLocation>(readLocation);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');

  const currentPath = location.pathname;
  const isProtectedRoute = protectedRoutes.has(currentPath);

  const navigate = (href: string, replace = false) => {
    const nextUrl = new URL(href, window.location.origin);

    if (nextUrl.pathname === location.pathname && nextUrl.search === location.search) {
      return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', `${nextUrl.pathname}${nextUrl.search}`);
    setLocation({
      pathname: nextUrl.pathname,
      search: nextUrl.search,
    });
  };

  const refreshSession = async () => {
    setSessionLoading(true);
    setGlobalError('');

    try {
      const nextSession = await apiRequest<AdminSession>('/api/admin/session');
      setSession(nextSession);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Failed to load admin session.');
      setSession({ adminEmail: null, authenticated: false });
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setLocation(readLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (sessionLoading || !session) {
      return;
    }

    if (currentPath === '/admin/send-sample') {
      navigate(session.authenticated ? '/admin/dashboard' : '/admin/login', true);
      return;
    }

    if (currentPath === '/admin/voice-samples') {
      navigate('/admin/voice-cards', true);
      return;
    }

    if (!session.authenticated && isProtectedRoute) {
      navigate('/admin/login', true);
      return;
    }

    if (session.authenticated && currentPath === '/admin/login') {
      navigate('/admin/dashboard', true);
    }
  }, [currentPath, isProtectedRoute, session, sessionLoading]);

  const handleLogout = async () => {
    if (!window.confirm('Do you really want to log out?')) {
      return;
    }

    await apiRequest('/api/admin/logout', { method: 'POST' });
    setSession({ adminEmail: null, authenticated: false });
    navigate('/admin/login', true);
  };

  if (sessionLoading) {
    return <LoadingScreen label="Loading admin workspace..." />;
  }

  if (currentPath === '/admin/login' || (!session?.authenticated && !isProtectedRoute)) {
    return (
      <LoginPage
        errorMessage={globalError}
        onLoggedIn={(nextSession) => {
          setSession(nextSession);
          navigate('/admin/dashboard', true);
        }}
      />
    );
  }

  if (!session?.authenticated) {
    return <LoadingScreen label="Redirecting to admin login..." />;
  }

  return (
    <AdminShell
      adminEmail={session.adminEmail}
      currentPath={currentPath}
      errorMessage={globalError}
      onLogout={() => void handleLogout()}
      onNavigate={navigate}
    >
      {currentPath === '/admin/dashboard' ? <DashboardPage /> : null}
      {currentPath === '/admin/sample-requests' ? <SampleRequestsPage onNavigate={navigate} /> : null}
      {currentPath === '/admin/customers' ? <CustomersPage /> : null}
      {currentPath === '/admin/payments' ? <PaymentsPage /> : null}
      {currentPath === '/admin/activity' ? <ActivityPage /> : null}
      {currentPath === '/admin/voice-cards' ? <VoiceCardsPage /> : null}
      {currentPath === '/admin/pronunciation' ? <PronunciationRulesPage /> : null}
      {!protectedRoutes.has(currentPath) ? <DashboardPage /> : null}
    </AdminShell>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="rounded-3xl border border-[#ddcfbe] bg-white/80 px-6 py-4 text-sm font-medium text-[#5c5048] shadow-[0_20px_60px_rgba(92,80,72,0.12)] backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function LoginPage({
  errorMessage,
  onLoggedIn,
}: {
  errorMessage: string;
  onLoggedIn: (session: AdminSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(errorMessage);

  useEffect(() => {
    setMessage(errorMessage);
  }, [errorMessage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const nextSession = await apiRequest<AdminSession>('/api/admin/login', {
        body: JSON.stringify({ email, password }),
        method: 'POST',
      });

      onLoggedIn(nextSession);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#ddcfbe] bg-white/88 shadow-[0_28px_80px_rgba(92,80,72,0.16)] backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-[#f8f3ec] px-6 py-8 sm:px-10 sm:py-12">
          <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
            Admin Access
          </div>
          <h1 className="mt-6 max-w-md text-4xl font-bold leading-tight text-[#2f343b]">
            Manage requests, public voice cards, and customer activity.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#64584f] sm:text-base">
            This workspace is connected to the existing PostgreSQL data and the same media pipeline used by the public
            website.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoChip label="Protected routes" value="/admin/*" />
            <InfoChip label="Public voices" value="voice_cards" />
            <InfoChip label="Requests" value="sample_requests" />
          </div>
        </section>

        <section className="px-6 py-8 sm:px-10 sm:py-12">
          <h2 className="text-2xl font-bold text-[#2f343b]">Admin login</h2>
          <p className="mt-2 text-sm leading-6 text-[#6a5f57]">
            Sign in with the admin email and password from environment variables.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <FieldLabel label="Admin email">
              <TextInput
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@company.com"
                type="email"
                value={email}
              />
            </FieldLabel>

            <FieldLabel label="Password">
              <div className="relative">
                <TextInput
                  autoComplete="current-password"
                  className="pr-20"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  className="absolute inset-y-0 right-0 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#8d5d45] transition hover:text-[#ae6c4a]"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </FieldLabel>

            {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}

            <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
              {submitting ? 'Signing in...' : 'Sign in'}
            </PrimaryButton>
          </form>
        </section>
      </div>
    </div>
  );
}

function AdminShell({
  adminEmail,
  children,
  currentPath,
  errorMessage,
  onLogout,
  onNavigate,
}: {
  adminEmail: string | null;
  children: ReactNode;
  currentPath: string;
  errorMessage: string;
  onLogout: () => void;
  onNavigate: (href: string) => void;
}) {
  const links = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/sample-requests', label: 'Sample Requests' },
    { href: '/admin/customers', label: 'Customers' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/activity', label: 'Activity' },
    { href: '/admin/voice-cards', label: 'Public Voice Cards' },
    { href: '/admin/pronunciation', label: 'Pronunciation' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#ddcfbe] bg-[#fbf7f1]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
              BANGLA SPEECH AI Admin
            </div>
            <p className="mt-2 text-sm text-[#6d6158]">Signed in as {adminEmail ?? 'admin'}.</p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {links.map((link) => (
              <button
                key={link.href}
                className={cx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  currentPath === link.href
                    ? 'bg-[#ae6c4a] text-white shadow-[0_12px_30px_rgba(174,108,74,0.24)]'
                    : 'border border-[#d8cbbe] bg-white/80 text-[#5e534b] hover:border-[#cdb6a1] hover:text-[#a96544]',
                )}
                onClick={() => onNavigate(link.href)}
                type="button"
              >
                {link.label}
              </button>
            ))}
            <button
              className="rounded-full border border-[#d8cbbe] bg-white/80 px-4 py-2 text-sm font-semibold text-[#5e534b] transition hover:border-[#cdb6a1] hover:text-[#a96544]"
              onClick={onLogout}
              type="button"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {errorMessage ? <InlineMessage tone="error">{errorMessage}</InlineMessage> : null}
        {children}
      </main>
    </div>
  );
}

function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [salesData, setSalesData] = useState<SalesAnalyticsPayload | null>(null);
  const [salesRange, setSalesRange] = useState<SalesRange>('monthly');
  const [error, setError] = useState('');
  const [salesError, setSalesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const payload = await apiRequest<DashboardPayload>('/api/admin/dashboard');
        setData(payload);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const loadSales = async () => {
      setSalesLoading(true);
      setSalesError('');

      try {
        const payload = await apiRequest<SalesAnalyticsPayload>(`/api/admin/dashboard/sales?range=${salesRange}`);
        setSalesData(payload);
      } catch (nextError) {
        setSalesError(nextError instanceof Error ? nextError.message : 'Failed to load sales analytics.');
      } finally {
        setSalesLoading(false);
      }
    };

    void loadSales();
  }, [salesRange]);

  if (loading) {
    return <PageLoading label="Loading dashboard..." />;
  }

  if (!data) {
    return <InlineMessage tone="error">{error || 'Dashboard data is unavailable.'}</InlineMessage>;
  }

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Overview"
        title="Admin dashboard"
        description="Track request volume, payment status, and sales performance without touching the public frontend design."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" value={data.stats.totalRequests} />
        <StatCard label="New requests" value={data.stats.newRequests} />
        <StatCard label="Samples ready" value={data.stats.samplesReady} />
        <StatCard label="Samples sent" value={data.stats.samplesSent} />
        <StatCard label="Pending payments" value={salesData?.paymentSummary.pendingCount ?? 0} />
        <StatCard label="Successful payments" value={salesData?.paymentSummary.successfulCount ?? 0} />
        <StatCard
          detail={salesData?.paymentSummary.currency && salesData.paymentSummary.currency !== 'N/A' ? salesData.paymentSummary.currency : 'No currency yet'}
          label="Successful sales"
          value={formatRevenue(salesData?.paymentSummary.successfulRevenue ?? 0, salesData?.paymentSummary.currency ?? 'N/A')}
        />
      </div>

      <SalesAnalyticsPanel
        data={salesData}
        error={salesError}
        loading={salesLoading}
        range={salesRange}
        onRangeChange={setSalesRange}
      />
    </section>
  );
}

function SalesAnalyticsPanel({
  data,
  error,
  loading,
  onRangeChange,
  range,
}: {
  data: SalesAnalyticsPayload | null;
  error: string;
  loading: boolean;
  onRangeChange: (range: SalesRange) => void;
  range: SalesRange;
}) {
  const currency = data?.paymentSummary.currency ?? 'N/A';
  const hasSales = Boolean(data && data.salesSeries.length > 0);

  return (
    <Panel
      title="Sales tracking"
      subtitle="Revenue from completed Gold, Platinum, and extra-token payments only."
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm leading-6 text-[#6d625a]">
          {currency === 'N/A'
            ? 'No successful payment currency has been recorded yet.'
            : `Showing successful sales in ${currency}. No currency conversion is applied.`}
        </div>
        <div className="flex flex-wrap gap-2">
          {salesRanges.map((item) => (
            <button
              key={item.value}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                range === item.value
                  ? 'bg-[#ae6c4a] text-white shadow-[0_12px_30px_rgba(174,108,74,0.24)]'
                  : 'border border-[#d8cbbe] bg-white/80 text-[#5e534b] hover:border-[#cdb6a1] hover:text-[#a96544]',
              )}
              onClick={() => onRangeChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <PageLoading label="Loading sales analytics..." /> : null}
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {!loading && !error && !hasSales ? <EmptyState label="No successful sales yet." /> : null}
      {!loading && !error && hasSales && data ? (
        <div className="h-[360px] rounded-[24px] border border-[#eadfce] bg-[#fbf7f1] p-3 sm:p-5">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={data.salesSeries} margin={{ bottom: 8, left: 0, right: 12, top: 16 }}>
              <defs>
                <linearGradient id="salesRevenueFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#ae6c4a" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#ae6c4a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e8dcca" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="period"
                minTickGap={18}
                tick={{ fill: '#766a60', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#766a60', fontSize: 12 }}
                tickFormatter={(value) => formatRevenue(Number(value), currency)}
                tickLine={false}
                width={92}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }

                  const item = payload[0]?.payload as SalesAnalyticsPayload['salesSeries'][number] | undefined;

                  return (
                    <div className="rounded-2xl border border-[#d8cbbe] bg-white px-4 py-3 text-sm shadow-[0_18px_40px_rgba(92,80,72,0.14)]">
                      <div className="font-semibold text-[#2f343b]">{label}</div>
                      <div className="mt-1 text-[#6d625a]">
                        Revenue: {formatRevenue(Number(item?.revenue ?? 0), currency)}
                      </div>
                      <div className="text-[#6d625a]">Sales: {Number(item?.salesCount ?? 0).toLocaleString()}</div>
                    </div>
                  );
                }}
              />
              <Area
                activeDot={{ fill: '#ae6c4a', r: 5, stroke: '#fbf7f1', strokeWidth: 2 }}
                dataKey="revenue"
                fill="url(#salesRevenueFill)"
                stroke="#ae6c4a"
                strokeWidth={3}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Panel>
  );
}

function CustomersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [packages, setPackages] = useState<AdminPackageSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState<CustomerFilter>('all');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tokenDelta, setTokenDelta] = useState('1000');
  const [tokenNotes, setTokenNotes] = useState('');
  const [packageCode, setPackageCode] = useState<'starter' | 'gold' | 'platinum'>('gold');
  const [packageNotes, setPackageNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<null | 'package' | 'tokens'>(null);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest<{ packages: AdminPackageSummary[]; users: AdminUser[] }>('/api/admin/users');
      setPackages(payload.packages);
      setUsers(payload.users);
      setSelectedUserId((current) => {
        if (current && payload.users.some((user) => user.id === current)) {
          return current;
        }

        return payload.users[0]?.id ?? null;
      });
      if (payload.packages[0]) {
        setPackageCode(payload.packages[0].code);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (activeFilter === 'all') {
        return true;
      }

      return user.packageCode === activeFilter;
    });
  }, [activeFilter, users]);

  useEffect(() => {
    setSelectedUserId((current) => {
      if (current && filteredUsers.some((user) => user.id === current)) {
        return current;
      }

      return filteredUsers[0]?.id ?? null;
    });
  }, [filteredUsers]);

  const selectedUser = filteredUsers.find((user) => user.id === selectedUserId) ?? null;

  useEffect(() => {
    if (selectedUser) {
      setPackageCode(selectedUser.packageCode);
    }
  }, [selectedUser]);

  const handleTokenAdjustment = async () => {
    if (!selectedUser) return;

    setSubmitting('tokens');
    setError('');
    setMessage('');

    try {
      await apiRequest(`/api/admin/users/${selectedUser.id}/token-adjustments`, {
        body: JSON.stringify({
          notes: tokenNotes,
          tokenDelta: Number(tokenDelta),
        }),
        method: 'POST',
      });
      setMessage('Token adjustment saved.');
      setTokenNotes('');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to adjust tokens.');
    } finally {
      setSubmitting(null);
    }
  };

  const handlePackageUpgrade = async () => {
    if (!selectedUser) return;

    setSubmitting('package');
    setError('');
    setMessage('');

    try {
      await apiRequest(`/api/admin/users/${selectedUser.id}/package-upgrades`, {
        body: JSON.stringify({
          notes: packageNotes,
          packageCode,
        }),
        method: 'POST',
      });
      setMessage('Package update saved.');
      setPackageNotes('');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to change package.');
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return <PageLoading label="Loading customers..." />;
  }

  return (
    <div className="grid gap-6">
      <Panel title="Customers" subtitle="Review customer packages and token balances from the customer auth system.">
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {message ? <InlineMessage tone="success">{message}</InlineMessage> : null}
        <div className="mb-5 flex flex-wrap gap-2">
          {customerFilters.map((filter) => (
            <button
              key={filter.value}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                activeFilter === filter.value
                  ? 'bg-[#ae6c4a] text-white shadow-[0_12px_30px_rgba(174,108,74,0.24)]'
                  : 'border border-[#d8cbbe] bg-white/80 text-[#5e534b] hover:border-[#cdb6a1] hover:text-[#a96544]',
              )}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        {!filteredUsers.length ? (
          <EmptyState label="No customer accounts yet." />
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-[#e6d8ca]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#efe1d2] text-sm">
                <thead className="bg-[#faf7f1] text-left text-[#7a6d63]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Package</th>
                    <th className="px-4 py-3 font-semibold">Tokens</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1e7db] bg-white/90">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={cx(
                        'cursor-pointer transition hover:bg-[#fcf8f3]',
                        selectedUserId === user.id && 'bg-[#f7eee4]',
                      )}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2f343b]">{user.email}</div>
                        <div className="text-xs text-[#7a6d63]">{user.mobileE164 ?? 'No phone'}</div>
                      </td>
                      <td className="px-4 py-3 text-[#5a514a]">{statusLabel(user.packageCode)}</td>
                      <td className="px-4 py-3 text-[#2f343b]">{user.tokenBalance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#5a514a]">{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Customer updates" subtitle="Package and token changes should now come from successful customer payments.">
        {!selectedUser ? (
          <EmptyState label="Select a customer row to review account details." />
        ) : (
          <PanelInset title="Selected customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoChip label="Email" value={selectedUser.email} />
              <InfoChip label="Package" value={statusLabel(selectedUser.packageCode)} />
              <InfoChip label="Token balance" value={selectedUser.tokenBalance.toLocaleString()} />
            </div>
            <div className="mt-4">
              <InlineMessage>
                Successful customer payments should automatically upgrade the account and update token balance. Manual
                customer controls have been removed from this panel.
              </InlineMessage>
            </div>
          </PanelInset>
        )}
      </Panel>
    </div>
  );
}

function PaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [tokenTransactions, setTokenTransactions] = useState<AdminTokenTransaction[]>([]);
  const [packageUpgrades, setPackageUpgrades] = useState<AdminPackageUpgrade[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const payload = await apiRequest<{
          packageUpgrades: AdminPackageUpgrade[];
          payments: AdminPayment[];
          tokenTransactions: AdminTokenTransaction[];
        }>('/api/admin/payments');
        setPayments(payload.payments);
        setTokenTransactions(payload.tokenTransactions);
        setPackageUpgrades(payload.packageUpgrades);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load payment activity.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return <PageLoading label="Loading payments..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Payments" subtitle="Provider callbacks and customer purchase records.">
          {!payments.length ? (
            <EmptyState compact label="No payments recorded." />
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 10).map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">
                        {statusLabel(payment.paymentType)} • {payment.provider}
                      </div>
                      <div className="text-xs text-[#7a6d63]">User #{payment.userId}</div>
                    </div>
                    <StatusBadge status={payment.status} />
                  </div>
                  <div className="mt-2 text-sm text-[#5a514a]">
                    {payment.amount.toFixed(2)} {payment.currency.toUpperCase()}
                  </div>
                  <div className="mt-1 text-xs text-[#7a6d63]">{formatDate(payment.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Token ledger" subtitle="Signup grants, refills, purchases, usage, and admin adjustments.">
          {!tokenTransactions.length ? (
            <EmptyState compact label="No token transactions yet." />
          ) : (
            <div className="space-y-3">
              {tokenTransactions.slice(0, 10).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[#2f343b]">{statusLabel(entry.transactionType)}</div>
                    <div className={cx('text-sm font-semibold', entry.tokenDelta >= 0 ? 'text-[#3f7043]' : 'text-[#8d4f37]')}>
                      {entry.tokenDelta >= 0 ? '+' : ''}
                      {entry.tokenDelta}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[#7a6d63]">
                    User #{entry.userId} • Balance after {entry.balanceAfter}
                  </div>
                  {entry.notes ? <div className="mt-2 text-sm text-[#5a514a]">{entry.notes}</div> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Package upgrades" subtitle="Manual upgrades and payment-backed plan changes.">
          {!packageUpgrades.length ? (
            <EmptyState compact label="No package upgrades yet." />
          ) : (
            <div className="space-y-3">
              {packageUpgrades.slice(0, 10).map((upgrade) => (
                <div key={upgrade.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[#2f343b]">
                      {statusLabel(upgrade.fromPackageCode ?? 'none')} → {statusLabel(upgrade.toPackageCode)}
                    </div>
                    <StatusBadge status={upgrade.status} />
                  </div>
                  <div className="mt-2 text-xs text-[#7a6d63]">
                    User #{upgrade.userId} • Granted {upgrade.grantedTokenAmount ?? 0} tokens
                  </div>
                  <div className="mt-1 text-xs text-[#7a6d63]">{formatDate(upgrade.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ActivityPage() {
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const payload = await apiRequest<{ actions: AdminAction[] }>('/api/admin/admin-actions');
        setActions(payload.actions);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load admin activity.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return <PageLoading label="Loading admin activity..." />;
  }

  return (
    <Panel title="Admin activity" subtitle="Every manual package and token adjustment is logged here.">
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {!actions.length ? (
        <EmptyState label="No admin actions yet." />
      ) : (
        <div className="space-y-3">
          {actions.slice(0, 20).map((action) => (
            <div key={action.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[#2f343b]">{statusLabel(action.actionType)}</div>
                  <div className="text-xs text-[#7a6d63]">
                    {action.adminEmail} • target user #{action.targetUserId ?? 'n/a'}
                  </div>
                </div>
                <div className="text-xs text-[#7a6d63]">{formatDate(action.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SampleRequestsPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SampleRequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [form, setForm] = useState({
    clientName: '',
    companyName: '',
    email: '',
    expectedMonthlyVolume: '',
    messageDetails: '',
    phoneNumber: '',
    selectedService: '',
    status: 'new' as SampleRequestStatus,
  });

  const loadRequests = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest<{ requests: SampleRequest[] }>('/api/admin/sample-requests');
      setRequests(payload.requests);

      if (!selectedRequestId && payload.requests[0]) {
        setSelectedRequestId(payload.requests[0].id);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedRequestId) {
      setDetail(null);
      return;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      setError('');

      try {
        const payload = await apiRequest<SampleRequestDetailPayload>(`/api/admin/sample-requests/${selectedRequestId}`);
        setDetail(payload);
        setForm({
          clientName: payload.request.clientName,
          companyName: payload.request.companyName ?? '',
          email: payload.request.email,
          expectedMonthlyVolume: payload.request.expectedMonthlyVolume ?? '',
          messageDetails: payload.request.messageDetails ?? '',
          phoneNumber: payload.request.phoneNumber ?? '',
          selectedService: payload.request.selectedService ?? '',
          status: payload.request.status,
        });
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load request detail.');
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [selectedRequestId]);

  const handleSave = async () => {
    if (!selectedRequestId) {
      return;
    }

    setSaveState('saving');
    setError('');

    try {
      const payload = await apiRequest<{ request: SampleRequest }>(`/api/admin/sample-requests/${selectedRequestId}`, {
        body: JSON.stringify(form),
        method: 'PATCH',
      });

      setRequests((current) =>
        current.map((request) => (request.id === payload.request.id ? payload.request : request)),
      );

      setDetail((current) =>
        current
          ? {
              ...current,
              request: payload.request,
            }
          : current,
      );

      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save request changes.');
      setSaveState('idle');
    }
  };

  const handleDelete = async () => {
    if (!selectedRequestId) {
      return;
    }

    const currentRequest = requests.find((request) => request.id === selectedRequestId);

    if (!window.confirm(`Delete sample request for "${currentRequest?.clientName ?? 'this client'}"?`)) {
      return;
    }

    setDeletingRequest(true);
    setError('');

    try {
      await apiRequest<{ deletedId: number; message: string }>(`/api/admin/sample-requests/${selectedRequestId}`, {
        method: 'DELETE',
      });

      const remainingRequests = requests.filter((request) => request.id !== selectedRequestId);
      const nextSelectedRequest = remainingRequests[0] ?? null;

      setRequests(remainingRequests);
      setSelectedRequestId(nextSelectedRequest?.id ?? null);
      setDetail(
        nextSelectedRequest && detail && detail.request.id === nextSelectedRequest.id
          ? detail
          : null,
      );
      setSaveState('idle');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete the sample request.');
    } finally {
      setDeletingRequest(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Leads"
        title="Sample requests"
        description="Review inbound requests, update request status, and track delivery history from one place."
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,420px)]">
        <Panel title="Requests queue" subtitle="Select a request to review details">
          {loading ? (
            <PageLoading label="Loading requests..." />
          ) : requests.length === 0 ? (
            <EmptyState label="No requests have been captured yet." />
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <button
                  key={request.id}
                  className={cx(
                    'w-full rounded-2xl border p-4 text-left transition',
                    selectedRequestId === request.id
                      ? 'border-[#ae6c4a] bg-[#fff7f1] shadow-[0_14px_40px_rgba(174,108,74,0.14)]'
                      : 'border-[#eadfce] bg-white/90 hover:border-[#d9c2ad]',
                  )}
                  onClick={() => setSelectedRequestId(request.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">{request.clientName}</div>
                      <div className="text-sm text-[#6e6259]">
                        {request.companyName ?? 'No company'} • {request.email}
                      </div>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#7c7168]">
                    <span>{request.selectedService ?? 'Service not set'}</span>
                    <span>{formatDate(request.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Request detail" subtitle="Edit the selected request and review delivery history">
          {!selectedRequestId ? (
            <EmptyState label="Choose a request from the queue." />
          ) : detailLoading || !detail ? (
            <PageLoading label="Loading request detail..." />
          ) : (
            <div className="space-y-4">
              <FieldLabel label="Client name">
                <TextInput
                  onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
                  value={form.clientName}
                />
              </FieldLabel>

              <FieldLabel label="Work email">
                <TextInput
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  value={form.email}
                />
              </FieldLabel>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Phone number">
                  <TextInput
                    onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    value={form.phoneNumber}
                  />
                </FieldLabel>
                <FieldLabel label="Company name">
                  <TextInput
                    onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                    value={form.companyName}
                  />
                </FieldLabel>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Selected service">
                  <TextInput
                    onChange={(event) => setForm((current) => ({ ...current, selectedService: event.target.value }))}
                    value={form.selectedService}
                  />
                </FieldLabel>
                <FieldLabel label="Status">
                  <SelectInput
                    onChange={(event) =>
                      setForm((current) => ({ ...current, status: event.target.value as SampleRequestStatus }))
                    }
                    value={form.status}
                  >
                    {requestStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </SelectInput>
                </FieldLabel>
              </div>

              <FieldLabel label="Expected monthly volume">
                <TextInput
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expectedMonthlyVolume: event.target.value }))
                  }
                  value={form.expectedMonthlyVolume}
                />
              </FieldLabel>

              <FieldLabel label="Request details">
                <TextAreaInput
                  onChange={(event) => setForm((current) => ({ ...current, messageDetails: event.target.value }))}
                  rows={5}
                  value={form.messageDetails}
                />
              </FieldLabel>

              <div className="flex flex-wrap gap-3">
                <PrimaryButton disabled={saveState === 'saving'} onClick={handleSave} type="button">
                  {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save changes'}
                </PrimaryButton>
                <DangerButton disabled={deletingRequest} onClick={handleDelete} type="button">
                  {deletingRequest ? 'Deleting...' : 'Delete request'}
                </DangerButton>
              </div>

              <PanelInset title="Email history">
                {detail.emailLogs.length === 0 ? (
                  <EmptyState label="No email has been sent for this request yet." compact />
                ) : (
                  <div className="space-y-3">
                    {detail.emailLogs.map((email) => (
                      <div key={email.id} className="rounded-2xl border border-[#eadfce] bg-[#fcfaf6] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-[#2f343b]">{email.subject}</div>
                          <StatusBadge status={email.status} />
                        </div>
                        <div className="mt-1 text-xs text-[#7c7168]">
                          {email.sampleTitle ?? 'Voice card not linked'} • {formatDate(email.sentAt ?? email.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PanelInset>

              <PanelInset title="Sample preview activity">
                {detail.sampleGenerations.length === 0 ? (
                  <EmptyState label="No authenticated sample preview has been generated for this lead yet." compact />
                ) : (
                  <div className="space-y-3">
                    {detail.sampleGenerations.map((generation) => (
                      <div key={generation.id} className="rounded-2xl border border-[#eadfce] bg-[#fcfaf6] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-[#2f343b]">
                              Preview #{generation.id} • {generation.userEmail}
                            </div>
                            <div className="mt-1 text-xs text-[#7c7168]">
                              {generation.selectedService} • {generation.wordCount} words • {generation.tokenCost} tokens
                            </div>
                          </div>
                          <StatusBadge status={generation.status} />
                        </div>
                        <div className="mt-3 grid gap-3 text-sm text-[#5a514a] sm:grid-cols-2">
                          <div>Attempts used: {generation.regenerationAttemptsUsed}</div>
                          <div>Attempts left: {generation.regenerationAttemptsRemaining}</div>
                          <div>Created: {formatDate(generation.createdAt)}</div>
                          <div>Finalized: {generation.finalizedAt ? formatDate(generation.finalizedAt) : 'Not finalized'}</div>
                        </div>
                        {generation.audioUrl ? (
                          <div className="mt-3">
                            <audio controls className="w-full" src={generation.audioUrl}>
                              Your browser does not support audio preview.
                            </audio>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </PanelInset>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function VoiceCardsPage() {
  const [voiceCards, setVoiceCards] = useState<PublicVoiceCard[]>([]);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<VoiceCardDraft>(createEmptyVoiceCardDraft());
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadVoiceCards = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest<{ voiceCards: PublicVoiceCard[] }>('/api/admin/voice-cards');
      setVoiceCards(payload.voiceCards);

      if (selectedId === 'new') {
        setLoading(false);
        return;
      }

      const firstCard = payload.voiceCards[0] ?? null;
      const nextSelectedId =
        selectedId && payload.voiceCards.some((card) => card.id === selectedId)
          ? selectedId
          : firstCard?.id ?? null;

      setSelectedId(nextSelectedId);
      setDraft(nextSelectedId ? toVoiceCardDraft(payload.voiceCards.find((card) => card.id === nextSelectedId) ?? firstCard!) : createEmptyVoiceCardDraft());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load public voice cards.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVoiceCards();
  }, []);

  useEffect(() => {
    if (!voiceCards.length && selectedId !== 'new') {
      setDraft(createEmptyVoiceCardDraft());
      return;
    }

    if (selectedId === 'new') {
      return;
    }

    const selectedCard = voiceCards.find((card) => card.id === selectedId) ?? voiceCards[0];
    if (selectedCard) {
      setDraft(toVoiceCardDraft(selectedCard));
      setSelectedId(selectedCard.id);
    }
  }, [selectedId, voiceCards]);

  const audioReadyCount = useMemo(() => voiceCards.filter((card) => Boolean(card.audioUrl)).length, [voiceCards]);

  const startCreate = () => {
    const nextOrder = voiceCards.length ? Math.max(...voiceCards.map((card) => card.order)) + 1 : 0;
    const nextWaveSeed = voiceCards.length ? Math.max(...voiceCards.map((card) => card.waveSeed)) + 1 : 42;
    setSelectedId('new');
    setDraft(createEmptyVoiceCardDraft({ order: nextOrder, waveSeed: nextWaveSeed }));
    setAudioFile(null);
    setError('');
    setMessage('');
  };

  const handleSelectCard = (card: PublicVoiceCard) => {
    setSelectedId(card.id);
    setDraft(toVoiceCardDraft(card));
    setAudioFile(null);
    setError('');
    setMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      duration: Number(draft.duration),
      englishMeaning: draft.englishMeaning,
      isActive: draft.isActive,
      name: draft.name,
      order: Number(draft.order),
      scriptText: draft.scriptText,
      waveSeed: Number(draft.waveSeed),
    };

    try {
      if (selectedId === 'new' || draft.id === null) {
        const response = await apiRequest<{ voiceCard: PublicVoiceCard }>('/api/admin/voice-cards', {
          body: JSON.stringify(payload),
          method: 'POST',
        });

        const nextCard = response.voiceCard;
        setVoiceCards((current) => [...current, nextCard].sort((a, b) => a.order - b.order || a.id - b.id));
        setSelectedId(nextCard.id);
        setDraft(toVoiceCardDraft(nextCard));
        setMessage('Public voice card created.');
      } else {
        const response = await apiRequest<{ voiceCard: PublicVoiceCard }>(`/api/admin/voice-cards/${draft.id}`, {
          body: JSON.stringify(payload),
          method: 'PATCH',
        });

        const nextCard = response.voiceCard;
        setVoiceCards((current) =>
          current
            .map((card) => (card.id === nextCard.id ? nextCard : card))
            .sort((a, b) => a.order - b.order || a.id - b.id),
        );
        setDraft(toVoiceCardDraft(nextCard));
        setMessage('Public voice card saved.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save the public voice card.');
    } finally {
      setSaving(false);
    }
  };

  const handleAudioUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.id) {
      setError('Save the voice card first, then upload the public audio file.');
      return;
    }

    if (!audioFile) {
      setError('Choose an audio file before uploading.');
      return;
    }

    setUploadingAudio(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('name', draft.name);
      formData.append('filenameStem', draft.name);

      const response = await apiRequest<{ voiceCard: PublicVoiceCard }>(`/api/admin/voice-cards/${draft.id}/audio`, {
        body: formData,
        method: 'POST',
      });

      const nextCard = response.voiceCard;
      setVoiceCards((current) =>
        current
          .map((card) => (card.id === nextCard.id ? nextCard : card))
          .sort((a, b) => a.order - b.order || a.id - b.id),
      );
      setDraft(toVoiceCardDraft(nextCard));
      setAudioFile(null);
      setMessage('Public audio file updated.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload public audio.');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleDelete = async () => {
    if (draft.id === null) {
      setSelectedId(null);
      setDraft(createEmptyVoiceCardDraft());
      return;
    }

    if (!window.confirm(`Delete "${draft.name}" from the public voice cards?`)) {
      return;
    }

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      await apiRequest<{ deletedId: number; message: string }>(`/api/admin/voice-cards/${draft.id}`, {
        method: 'DELETE',
      });

      const deletedId = draft.id;
      const remainingCards = voiceCards.filter((card) => card.id !== deletedId);
      const nextSelectedCard = remainingCards[0] ?? null;

      setVoiceCards(remainingCards);
      setSelectedId(nextSelectedCard?.id ?? null);
      setDraft(nextSelectedCard ? toVoiceCardDraft(nextSelectedCard) : createEmptyVoiceCardDraft());
      setAudioFile(null);
      setMessage('Public voice card deleted.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete the public voice card.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Website voices"
        title="Public voice cards"
        description="Manage the live website voice cards directly from PostgreSQL. Changes here flow straight into /api/voices."
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {message ? <InlineMessage tone="success">{message}</InlineMessage> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
          {voiceCards.length} cards
        </div>
        <div className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
          {audioReadyCount} audio ready
        </div>
        <PrimaryButton onClick={startCreate} type="button">
          Add voice card
        </PrimaryButton>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,440px)]">
        <Panel title="Website voice card list" subtitle="Order, status, and audio readiness for every public card">
          {loading ? (
            <PageLoading label="Loading public voice cards..." />
          ) : voiceCards.length === 0 ? (
            <EmptyState label="No public voice cards are configured yet." />
          ) : (
            <div className="space-y-3">
              {voiceCards.map((card) => (
                <button
                  key={card.id}
                  className={cx(
                    'w-full rounded-2xl border p-4 text-left transition',
                    selectedId === card.id
                      ? 'border-[#ae6c4a] bg-[#fff7f1] shadow-[0_14px_40px_rgba(174,108,74,0.14)]'
                      : 'border-[#eadfce] bg-white/90 hover:border-[#d9c2ad]',
                  )}
                  onClick={() => handleSelectCard(card)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a96544]">
                        Order {card.order}
                      </div>
                      <div className="mt-1 font-semibold text-[#2f343b]">{card.name}</div>
                      <div className="mt-1 text-sm text-[#6e6259]">{card.scriptText}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={card.isActive ? 'active' : 'inactive'} />
                      <span className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
                        {card.audioUrl ? 'Audio ready' : 'No audio'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={selectedId === 'new' || draft.id === null ? 'Create public voice card' : 'Edit public voice card'}
          subtitle="Update the live voice card metadata and replace its public audio file when needed"
        >
          <div className="space-y-4">
            <FieldLabel label="Display name">
              <TextInput
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="AI Self Service Agent"
                value={draft.name}
              />
            </FieldLabel>

            <FieldLabel label="Bangla script/caption">
              <TextAreaInput
                onChange={(event) => setDraft((current) => ({ ...current, scriptText: event.target.value }))}
                rows={4}
                value={draft.scriptText}
              />
            </FieldLabel>

            <FieldLabel label="English meaning">
              <TextAreaInput
                onChange={(event) => setDraft((current) => ({ ...current, englishMeaning: event.target.value }))}
                rows={3}
                value={draft.englishMeaning}
              />
            </FieldLabel>

            <div className="grid gap-4 sm:grid-cols-3">
              <FieldLabel label="Duration (seconds)">
                <TextInput
                  onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={draft.duration}
                />
              </FieldLabel>

              <FieldLabel label="Display order">
                <TextInput
                  onChange={(event) => setDraft((current) => ({ ...current, order: event.target.value }))}
                  min="0"
                  step="1"
                  type="number"
                  value={draft.order}
                />
              </FieldLabel>

              <FieldLabel label="Wave seed">
                <TextInput
                  onChange={(event) => setDraft((current) => ({ ...current, waveSeed: event.target.value }))}
                  step="1"
                  type="number"
                  value={draft.waveSeed}
                />
              </FieldLabel>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-[#e3d7c8] bg-[#fbf7f1] px-4 py-3 text-sm font-semibold text-[#5a514a]">
              <input
                checked={draft.isActive}
                className="h-4 w-4 accent-[#ae6c4a]"
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active on public website
            </label>

            <div className="rounded-[24px] border border-[#eadfce] bg-[#fcfaf6] p-4">
              <div className="text-sm font-semibold text-[#2f343b]">Current public audio</div>
              <div className="mt-1 text-xs text-[#7c7168]">{draft.audioFile || 'No public audio file linked yet.'}</div>
              {draft.audioUrl ? <audio className="mt-4 w-full" controls preload="none" src={draft.audioUrl} /> : null}

              <form className="mt-4 space-y-3" onSubmit={handleAudioUpload}>
                <FieldLabel label="Replace audio file">
                  <TextInput
                    accept=".mp3,.wav,.m4a,.webm,.mp4,audio/*,video/mp4"
                    onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </FieldLabel>

                <PrimaryButton disabled={uploadingAudio || draft.id === null} type="submit">
                  {uploadingAudio ? 'Uploading...' : 'Upload public audio'}
                </PrimaryButton>
              </form>
            </div>

            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={saving} onClick={handleSave} type="button">
                {saving ? 'Saving...' : draft.id === null ? 'Create voice card' : 'Save changes'}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  if (draft.id === null) {
                    setDraft(createEmptyVoiceCardDraft());
                    setSelectedId(null);
                    return;
                  }

                  const currentCard = voiceCards.find((card) => card.id === draft.id);
                  if (currentCard) {
                    setDraft(toVoiceCardDraft(currentCard));
                  }
                }}
                type="button"
              >
                Reset
              </SecondaryButton>
              <DangerButton disabled={deleting} onClick={handleDelete} type="button">
                {deleting ? 'Deleting...' : 'Delete'}
              </DangerButton>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function PronunciationRulesPage() {
  const [rules, setRules] = useState<TtsPronunciationRule[]>([]);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<TtsPronunciationRuleDraft>(createEmptyPronunciationRuleDraft());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest<{ rules: TtsPronunciationRule[] }>('/api/admin/tts-pronunciation-rules');
      setRules(payload.rules);

      if (selectedId === 'new') {
        return;
      }

      const nextSelectedId =
        selectedId && payload.rules.some((rule) => rule.id === selectedId)
          ? selectedId
          : payload.rules[0]?.id ?? null;
      const selectedRule = payload.rules.find((rule) => rule.id === nextSelectedId) ?? payload.rules[0] ?? null;
      setSelectedId(selectedRule?.id ?? null);
      setDraft(selectedRule ? toPronunciationRuleDraft(selectedRule) : createEmptyPronunciationRuleDraft());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load pronunciation rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const activeCount = useMemo(() => rules.filter((rule) => rule.isActive).length, [rules]);

  const startCreate = () => {
    setSelectedId('new');
    setDraft(createEmptyPronunciationRuleDraft());
    setError('');
    setMessage('');
  };

  const handleSelect = (rule: TtsPronunciationRule) => {
    setSelectedId(rule.id);
    setDraft(toPronunciationRuleDraft(rule));
    setError('');
    setMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      isActive: draft.isActive,
      matchText: draft.matchText,
      matchType: draft.matchType,
      notes: draft.notes,
      replacementText: draft.replacementText,
    };

    try {
      if (selectedId === 'new' || draft.id === null) {
        const response = await apiRequest<{ rule: TtsPronunciationRule }>('/api/admin/tts-pronunciation-rules', {
          body: JSON.stringify(payload),
          method: 'POST',
        });
        setRules((current) => [response.rule, ...current]);
        setSelectedId(response.rule.id);
        setDraft(toPronunciationRuleDraft(response.rule));
        setMessage('Pronunciation rule created.');
      } else {
        const response = await apiRequest<{ rule: TtsPronunciationRule }>(`/api/admin/tts-pronunciation-rules/${draft.id}`, {
          body: JSON.stringify(payload),
          method: 'PATCH',
        });
        setRules((current) => current.map((rule) => (rule.id === response.rule.id ? response.rule : rule)));
        setDraft(toPronunciationRuleDraft(response.rule));
        setMessage('Pronunciation rule saved.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save pronunciation rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (draft.id === null) {
      setSelectedId(null);
      setDraft(createEmptyPronunciationRuleDraft());
      return;
    }

    if (!window.confirm(`Delete pronunciation rule "${draft.matchText}"?`)) {
      return;
    }

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/api/admin/tts-pronunciation-rules/${draft.id}`, {
        method: 'DELETE',
      });
      const remainingRules = rules.filter((rule) => rule.id !== draft.id);
      const nextRule = remainingRules[0] ?? null;
      setRules(remainingRules);
      setSelectedId(nextRule?.id ?? null);
      setDraft(nextRule ? toPronunciationRuleDraft(nextRule) : createEmptyPronunciationRuleDraft());
      setMessage('Pronunciation rule deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to delete pronunciation rule.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="TTS dictionary"
        title="Pronunciation rules"
        description="Manage global replacements applied to customer TTS text before chunking and provider generation."
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {message ? <InlineMessage tone="success">{message}</InlineMessage> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
          {rules.length} rules
        </div>
        <div className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
          {activeCount} active
        </div>
        <PrimaryButton onClick={startCreate} type="button">
          Add rule
        </PrimaryButton>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,440px)]">
        <Panel title="Rules" subtitle="Active rules are applied globally to every customer generation job">
          {loading ? (
            <PageLoading label="Loading pronunciation rules..." />
          ) : rules.length === 0 ? (
            <EmptyState label="No pronunciation rules are configured yet." />
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  className={cx(
                    'w-full rounded-2xl border p-4 text-left transition',
                    selectedId === rule.id
                      ? 'border-[#ae6c4a] bg-[#fff7f1] shadow-[0_14px_40px_rgba(174,108,74,0.14)]'
                      : 'border-[#eadfce] bg-white/90 hover:border-[#d9c2ad]',
                  )}
                  onClick={() => handleSelect(rule)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">{rule.matchText}</div>
                      <div className="mt-1 text-sm text-[#6e6259]">Read as: {rule.replacementText}</div>
                      {rule.notes ? <div className="mt-1 text-xs text-[#7a6d63]">{rule.notes}</div> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={rule.isActive ? 'active' : 'inactive'} />
                      <StatusBadge status={rule.matchType} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={selectedId === 'new' || draft.id === null ? 'Create rule' : 'Edit rule'}
          subtitle="Use phrase for names/brands and whole word for acronyms or exact terms"
        >
          <div className="space-y-4">
            <FieldLabel label="Match text">
              <TextInput
                onChange={(event) => setDraft((current) => ({ ...current, matchText: event.target.value }))}
                placeholder="Brand, name, acronym, or term"
                value={draft.matchText}
              />
            </FieldLabel>

            <FieldLabel label="Replacement text">
              <TextInput
                onChange={(event) => setDraft((current) => ({ ...current, replacementText: event.target.value }))}
                placeholder="How the voice should read it"
                value={draft.replacementText}
              />
            </FieldLabel>

            <FieldLabel label="Match type">
              <SelectInput
                onChange={(event) =>
                  setDraft((current) => ({ ...current, matchType: event.target.value as 'phrase' | 'whole_word' }))
                }
                value={draft.matchType}
              >
                <option value="phrase">Phrase</option>
                <option value="whole_word">Whole word</option>
              </SelectInput>
            </FieldLabel>

            <FieldLabel label="Notes">
              <TextAreaInput
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                value={draft.notes}
              />
            </FieldLabel>

            <label className="flex items-center gap-3 rounded-2xl border border-[#e3d7c8] bg-[#fbf7f1] px-4 py-3 text-sm font-semibold text-[#5a514a]">
              <input
                checked={draft.isActive}
                className="h-4 w-4 accent-[#ae6c4a]"
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active for customer generations
            </label>

            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={saving} onClick={handleSave} type="button">
                {saving ? 'Saving...' : draft.id === null ? 'Create rule' : 'Save rule'}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  if (draft.id === null) {
                    setDraft(createEmptyPronunciationRuleDraft());
                    setSelectedId(null);
                    return;
                  }

                  const currentRule = rules.find((rule) => rule.id === draft.id);
                  if (currentRule) {
                    setDraft(toPronunciationRuleDraft(currentRule));
                  }
                }}
                type="button"
              >
                Reset
              </SecondaryButton>
              <DangerButton disabled={deleting} onClick={handleDelete} type="button">
                {deleting ? 'Deleting...' : 'Delete'}
              </DangerButton>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function PageHeading({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
        {eyebrow}
      </div>
      <h1 className="mt-4 text-3xl font-bold text-[#2f343b] sm:text-[38px]">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#665b53] sm:text-base">{description}</p>
    </div>
  );
}

function Panel({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="rounded-[28px] border border-[#e1d4c4] bg-white/88 p-5 shadow-[0_20px_60px_rgba(92,80,72,0.08)] sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#2f343b]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[#6d625a]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function PanelInset({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-[24px] border border-[#eadfce] bg-[#fbf7f1] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#80624f]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatCard({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[24px] border border-[#e1d4c4] bg-white/88 p-5 shadow-[0_18px_48px_rgba(92,80,72,0.08)]">
      <div className="text-sm font-medium text-[#6d625a]">{label}</div>
      <div className="mt-3 text-4xl font-bold text-[#2f343b]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {detail ? <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7667]">{detail}</div> : null}
    </div>
  );
}

function EmptyState({ compact = false, label }: { compact?: boolean; label: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-dashed border-[#d9c6b2] bg-[#fbf7f1] text-center text-sm text-[#746860]',
        compact ? 'px-4 py-5' : 'px-6 py-10',
      )}
    >
      {label}
    </div>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9c6b2] bg-[#fbf7f1] px-6 py-10 text-center text-sm text-[#746860]">
      {label}
    </div>
  );
}

function InlineMessage({
  children,
  tone = 'success',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <div
      className={cx(
        'mt-4 rounded-2xl border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-[#efc2bc] bg-[#fff2f0] text-[#9d564c]'
          : 'border-[#cfe5d8] bg-[#f2fbf6] text-[#2f6b4f]',
      )}
    >
      {children}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e1d4c4] bg-white/75 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b705c]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[#2f343b]">{value}</div>
    </div>
  );
}

function FieldLabel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#5a514a]">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-2xl border border-[#dbcdbf] bg-white px-4 py-3 text-sm text-[#2f343b] outline-none transition placeholder:text-[#a39487] focus:border-[#ae6c4a] focus:ring-4 focus:ring-[#ae6c4a]/10',
        props.className,
      )}
    />
  );
}

function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'w-full rounded-2xl border border-[#dbcdbf] bg-white px-4 py-3 text-sm text-[#2f343b] outline-none transition placeholder:text-[#a39487] focus:border-[#ae6c4a] focus:ring-4 focus:ring-[#ae6c4a]/10',
        props.className,
      )}
    />
  );
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'w-full rounded-2xl border border-[#dbcdbf] bg-white px-4 py-3 text-sm text-[#2f343b] outline-none transition focus:border-[#ae6c4a] focus:ring-4 focus:ring-[#ae6c4a]/10',
        props.className,
      )}
    />
  );
}

function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center rounded-full bg-[#ae6c4a] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(174,108,74,0.24)] transition hover:bg-[#9b5f40] disabled:cursor-not-allowed disabled:opacity-65',
        props.className,
      )}
    />
  );
}

function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center rounded-full border border-[#d8cbbe] bg-white/88 px-5 py-3 text-sm font-semibold text-[#5e534b] transition hover:border-[#cdb6a1] hover:text-[#a96544] disabled:cursor-not-allowed disabled:opacity-65',
        props.className,
      )}
    />
  );
}

function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center rounded-full border border-[#efc2bc] bg-[#fff2f0] px-5 py-3 text-sm font-semibold text-[#9d564c] transition hover:border-[#e4a69e] hover:bg-[#ffe9e6] disabled:cursor-not-allowed disabled:opacity-65',
        props.className,
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'sent' || status === 'active'
      ? 'border-[#cfe5d8] bg-[#eef9f2] text-[#2f6b4f]'
      : status === 'sample_ready' || status === 'completed'
        ? 'border-[#d9d7f8] bg-[#f2f0ff] text-[#5646b0]'
        : status === 'failed' || status === 'inactive'
          ? 'border-[#efc2bc] bg-[#fff2f0] text-[#9d564c]'
          : 'border-[#e3d7c8] bg-[#f8f2ea] text-[#7a5f4f]';

  return (
    <span className={cx('inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize', tone)}>
      {statusLabel(status)}
    </span>
  );
}

export default App;
