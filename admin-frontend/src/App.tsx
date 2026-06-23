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

const protectedRoutes = new Set([
  '/admin/dashboard',
  '/admin/sample-requests',
  '/admin/customers',
  '/admin/payments',
  '/admin/activity',
  '/admin/voice-cards',
]);

const requestStatuses: SampleRequestStatus[] = ['new', 'reviewing', 'sample_ready', 'sent', 'archived'];
const customerFilters: Array<{ label: string; value: CustomerFilter }> = [
  { label: 'All users', value: 'all' },
  { label: 'Starter', value: 'starter' },
  { label: 'Gold', value: 'gold' },
  { label: 'Platinum', value: 'platinum' },
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
        description="Track incoming requests, website voice cards, and sent client emails without touching the public frontend design."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" value={data.stats.totalRequests} />
        <StatCard label="New requests" value={data.stats.newRequests} />
        <StatCard label="Samples ready" value={data.stats.samplesReady} />
        <StatCard label="Samples sent" value={data.stats.samplesSent} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent requests" subtitle="Latest customer submissions saved from the website">
          {data.recentRequests.length === 0 ? (
            <EmptyState label="No sample requests have been submitted yet." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#eadfce]">
              <table className="min-w-full divide-y divide-[#eadfce] text-left text-sm">
                <thead className="bg-[#f8f2ea] text-[#6c6058]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0e7db] bg-white/90">
                  {data.recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#2f343b]">{request.clientName}</div>
                        <div className="text-xs text-[#7a6f66]">{request.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[#5a514a]">{request.selectedService ?? 'Not set'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={request.status} />
                      </td>
                      <td className="px-4 py-3 text-[#5a514a]">{formatDate(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Recent sent emails" subtitle="Last sample deliveries and delivery outcomes">
          {data.recentEmails.length === 0 ? (
            <EmptyState label="No sample emails have been logged yet." />
          ) : (
            <div className="space-y-3">
              {data.recentEmails.map((email) => (
                <div key={email.id} className="rounded-2xl border border-[#eadfce] bg-white/90 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">{email.subject}</div>
                      <div className="text-sm text-[#6f645c]">
                        {email.clientName ?? 'Unknown client'} • {email.recipientEmail}
                      </div>
                    </div>
                    <StatusBadge status={email.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#7a6f66]">
                    <span>{email.sampleTitle ?? 'Voice card not linked'}</span>
                    <span>{email.deliveryMode}</span>
                    <span>{formatDate(email.sentAt ?? email.createdAt)}</span>
                  </div>
                  {email.errorMessage ? <InlineMessage tone="error">{email.errorMessage}</InlineMessage> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[#e1d4c4] bg-white/88 p-5 shadow-[0_18px_48px_rgba(92,80,72,0.08)]">
      <div className="text-sm font-medium text-[#6d625a]">{label}</div>
      <div className="mt-3 text-4xl font-bold text-[#2f343b]">{value}</div>
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
