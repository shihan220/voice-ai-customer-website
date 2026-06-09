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

type VoiceSample = {
  audioUrl: string;
  clientName?: string | null;
  createdAt: string;
  fileSizeBytes: number;
  id: number;
  mediaPath: string;
  mimeType: string;
  originalFilename: string;
  requestId: number | null;
  storedFilename: string;
  title: string;
  updatedAt: string;
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
  voiceSampleId: number | null;
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

type SampleRequestDetailPayload = {
  emailLogs: EmailLog[];
  request: SampleRequest;
  voiceSamples: VoiceSample[];
};

type AppLocation = {
  pathname: string;
  search: string;
};

const protectedRoutes = new Set([
  '/admin/dashboard',
  '/admin/sample-requests',
  '/admin/voice-samples',
  '/admin/send-sample',
]);

const requestStatuses: SampleRequestStatus[] = ['new', 'reviewing', 'sample_ready', 'sent', 'archived'];
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

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
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

    if (!session.authenticated && isProtectedRoute) {
      navigate('/admin/login', true);
      return;
    }

    if (session.authenticated && currentPath === '/admin/login') {
      navigate('/admin/dashboard', true);
    }
  }, [currentPath, isProtectedRoute, session, sessionLoading]);

  const handleLogout = async () => {
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
      {currentPath === '/admin/voice-samples' ? <VoiceSamplesPage /> : null}
      {currentPath === '/admin/send-sample' ? <SendSamplePage search={location.search} /> : null}
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
      const session = await apiRequest<AdminSession>('/api/admin/login', {
        body: JSON.stringify({ email, password }),
        method: 'POST',
      });

      onLoggedIn(session);
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
            Manage requests, voice samples, and outbound sample emails.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#64584f] sm:text-base">
            This workspace is connected to the existing PostgreSQL data and the same media pipeline used by the public
            website.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoChip label="Protected routes" value="/admin/*" />
            <InfoChip label="Media flow" value="/media/voices/..." />
            <InfoChip label="Email flow" value="SMTP + logs" />
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
              <TextInput
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter admin password"
                type="password"
                value={password}
              />
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
    { href: '/admin/voice-samples', label: 'Voice Samples' },
    { href: '/admin/send-sample', label: 'Send Sample' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#ddcfbe] bg-[#fbf7f1]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
              Bangla Voice AI Admin
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
        description="Track incoming requests, ready samples, and sent client emails without touching the public site."
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
                    <span>{email.sampleTitle ?? 'Sample not linked'}</span>
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

function SampleRequestsPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SampleRequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
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

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Leads"
        title="Sample requests"
        description="Review inbound requests, adjust status, and open the send-sample workflow against a selected client."
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

        <Panel title="Request detail" subtitle="Edit the selected request and open delivery actions">
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
                <SecondaryButton
                  onClick={() => onNavigate(`/admin/send-sample?requestId=${selectedRequestId}`)}
                  type="button"
                >
                  Open send sample
                </SecondaryButton>
              </div>

              <PanelInset title="Linked voice samples">
                {detail.voiceSamples.length === 0 ? (
                  <EmptyState label="No voice sample is linked to this request yet." compact />
                ) : (
                  <div className="space-y-3">
                    {detail.voiceSamples.map((sample) => (
                      <div key={sample.id} className="rounded-2xl border border-[#eadfce] bg-[#fcfaf6] p-3">
                        <div className="font-semibold text-[#2f343b]">{sample.title}</div>
                        <div className="mt-1 text-xs text-[#7c7168]">
                          {sample.originalFilename} • {formatDate(sample.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PanelInset>

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
                        <div className="mt-1 text-xs text-[#7c7168]">{formatDate(email.sentAt ?? email.createdAt)}</div>
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

function VoiceSamplesPage() {
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [drafts, setDrafts] = useState<Record<number, VoiceSample>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingSampleId, setSavingSampleId] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadMessageTone, setUploadMessageTone] = useState<'success' | 'error'>('success');
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    requestId: '',
    title: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [requestsPayload, samplesPayload] = await Promise.all([
        apiRequest<{ requests: SampleRequest[] }>('/api/admin/sample-requests'),
        apiRequest<{ samples: VoiceSample[] }>('/api/admin/voice-samples'),
      ]);

      setRequests(requestsPayload.requests);
      setSamples(samplesPayload.samples);
      setDrafts(
        Object.fromEntries(
          samplesPayload.samples.map((sample) => [
            sample.id,
            {
              ...sample,
            },
          ]),
        ),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load voice samples.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!uploadForm.file) {
      setUploadMessageTone('error');
      setUploadMessage('Choose an audio file before uploading.');
      return;
    }

    setUploading(true);
    setUploadMessage('');
    setUploadMessageTone('success');

    try {
      const formData = new FormData();
      formData.append('audio', uploadForm.file);
      formData.append('title', uploadForm.title);
      formData.append('requestId', uploadForm.requestId);

      const payload = await apiRequest<{ sample: VoiceSample }>('/api/admin/voice-samples', {
        body: formData,
        method: 'POST',
      });

      setUploadForm({
        file: null,
        requestId: '',
        title: '',
      });
      setUploadMessage('Voice sample uploaded successfully.');
      setUploadMessageTone('success');
      void loadData();
    } catch (error) {
      setUploadMessageTone('error');
      setUploadMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSampleSave = async (sampleId: number) => {
    const draft = drafts[sampleId];

    if (!draft) {
      return;
    }

    setError('');
    setSavingSampleId(sampleId);

    try {
      const payload = await apiRequest<{ sample: VoiceSample }>(`/api/admin/voice-samples/${sampleId}`, {
        body: JSON.stringify({
          requestId: draft.requestId ?? '',
          title: draft.title,
        }),
        method: 'PATCH',
      });

      setSamples((current) => current.map((sample) => (sample.id === sampleId ? payload.sample : sample)));
      setDrafts((current) => ({
        ...current,
        [sampleId]: payload.sample,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update the voice sample.');
    } finally {
      setSavingSampleId(null);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Audio"
        title="Voice samples"
        description="Upload client-ready audio, keep titles organized, and link samples to incoming requests."
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Panel title="Upload voice sample" subtitle="Supported formats: mp3, wav, m4a, webm, mp4 up to 25MB">
          <form className="space-y-4" onSubmit={handleUpload}>
            <FieldLabel label="Sample title">
              <TextInput
                onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Demo sample for ACME campaign"
                required
                value={uploadForm.title}
              />
            </FieldLabel>

            <FieldLabel label="Link to request">
              <SelectInput
                onChange={(event) => setUploadForm((current) => ({ ...current, requestId: event.target.value }))}
                value={uploadForm.requestId}
              >
                <option value="">No request linked</option>
                {requests.map((request) => (
                  <option key={request.id} value={String(request.id)}>
                    {request.clientName} • {request.email}
                  </option>
                ))}
              </SelectInput>
            </FieldLabel>

            <FieldLabel label="Audio file">
              <TextInput
                accept=".mp3,.wav,.m4a,.webm,.mp4,audio/*,video/mp4"
                onChange={(event) =>
                  setUploadForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                }
                type="file"
              />
            </FieldLabel>

            {uploadMessage ? <InlineMessage tone={uploadMessageTone}>{uploadMessage}</InlineMessage> : null}

            <PrimaryButton className="w-full justify-center" disabled={uploading} type="submit">
              {uploading ? 'Uploading...' : 'Upload sample'}
            </PrimaryButton>
          </form>
        </Panel>

        <Panel title="Saved samples" subtitle="Edit sample titles and linked requests before sending a client email">
          {loading ? (
            <PageLoading label="Loading samples..." />
          ) : samples.length === 0 ? (
            <EmptyState label="No voice samples have been uploaded yet." />
          ) : (
            <div className="space-y-4">
              {samples.map((sample) => {
                const draft = drafts[sample.id] ?? sample;

                return (
                  <div key={sample.id} className="rounded-[24px] border border-[#eadfce] bg-white/92 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#2f343b]">{sample.title}</div>
                        <div className="mt-1 text-xs text-[#7b7068]">
                          {sample.clientName ?? 'Unlinked'} • {formatFileSize(sample.fileSizeBytes)} • {formatDate(sample.createdAt)}
                        </div>
                      </div>
                      <span className="inline-flex rounded-full border border-[#e3d7c8] bg-[#f8f2ea] px-3 py-1 text-xs font-semibold text-[#7a5f4f]">
                        {draft.requestId ? 'Linked' : 'Unlinked'}
                      </span>
                    </div>

                    <audio className="mt-4 w-full" controls preload="none" src={sample.audioUrl} />

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <FieldLabel label="Title">
                        <TextInput
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [sample.id]: {
                                ...draft,
                                title: event.target.value,
                              },
                            }))
                          }
                          value={draft.title}
                        />
                      </FieldLabel>
                      <FieldLabel label="Linked request">
                        <SelectInput
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [sample.id]: {
                                ...draft,
                                requestId: event.target.value ? Number(event.target.value) : null,
                              },
                            }))
                          }
                          value={draft.requestId ? String(draft.requestId) : ''}
                        >
                          <option value="">No request linked</option>
                          {requests.map((request) => (
                            <option key={request.id} value={String(request.id)}>
                              {request.clientName}
                            </option>
                          ))}
                        </SelectInput>
                      </FieldLabel>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <PrimaryButton
                        disabled={savingSampleId === sample.id}
                        onClick={() => void handleSampleSave(sample.id)}
                        type="button"
                      >
                        {savingSampleId === sample.id ? 'Saving...' : 'Save sample'}
                      </PrimaryButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function SendSamplePage({ search }: { search: string }) {
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const queryRequestId = useMemo(() => {
    const value = new URLSearchParams(search).get('requestId');
    return value ? Number(value) : null;
  }, [search]);

  const [form, setForm] = useState({
    deliveryMode: 'link' as DeliveryMode,
    message:
      'Thanks for your interest in Bangla Voice AI. I have attached your requested sample below.',
    recipientEmail: '',
    requestId: '',
    subject: 'Your Bangla AI voice sample',
    voiceSampleId: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [requestsPayload, samplesPayload] = await Promise.all([
          apiRequest<{ requests: SampleRequest[] }>('/api/admin/sample-requests'),
          apiRequest<{ samples: VoiceSample[] }>('/api/admin/voice-samples'),
        ]);

        setRequests(requestsPayload.requests);
        setSamples(samplesPayload.samples);

        const initialRequestId =
          queryRequestId && requestsPayload.requests.some((request) => request.id === queryRequestId)
            ? String(queryRequestId)
            : requestsPayload.requests[0]
              ? String(requestsPayload.requests[0].id)
              : '';

        const initialRequest = requestsPayload.requests.find((request) => String(request.id) === initialRequestId);
        const matchingSample =
          samplesPayload.samples.find((sample) => sample.requestId === initialRequest?.id) ?? samplesPayload.samples[0];

        setForm((current) => ({
          ...current,
          recipientEmail: initialRequest?.email ?? current.recipientEmail,
          requestId: initialRequestId,
          voiceSampleId: matchingSample ? String(matchingSample.id) : '',
        }));
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load send-sample data.');
      }
    };

    void load();
  }, [queryRequestId]);

  useEffect(() => {
    if (!form.requestId) {
      return;
    }

    const selectedRequest = requests.find((request) => String(request.id) === form.requestId);

    if (selectedRequest) {
      setForm((current) => ({
        ...current,
        recipientEmail: selectedRequest.email,
      }));
    }
  }, [form.requestId, requests]);

  const filteredSamples = useMemo(() => {
    if (!form.requestId) {
      return samples;
    }

    const requestId = Number(form.requestId);
    const linkedSamples = samples.filter((sample) => sample.requestId === requestId);
    return linkedSamples.length > 0 ? linkedSamples : samples;
  }, [form.requestId, samples]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setMessage('');

    try {
      const payload = await apiRequest<{ message: string }>('/api/admin/send-sample', {
        body: JSON.stringify({
          deliveryMode: form.deliveryMode,
          message: form.message,
          recipientEmail: form.recipientEmail,
          requestId: Number(form.requestId),
          subject: form.subject,
          voiceSampleId: Number(form.voiceSampleId),
        }),
        method: 'POST',
      });

      setMessage(payload.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send sample email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeading
        eyebrow="Delivery"
        title="Send sample"
        description="Choose a request, select a voice sample, and deliver the audio through SMTP."
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {message ? <InlineMessage tone="success">{message}</InlineMessage> : null}

      <Panel title="Compose client sample email" subtitle="Attachment and public-link delivery are both supported">
        {requests.length === 0 ? (
          <EmptyState label="You need at least one sample request before sending email." />
        ) : samples.length === 0 ? (
          <EmptyState label="You need at least one uploaded voice sample before sending email." />
        ) : (
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSend}>
            <FieldLabel label="Sample request">
              <SelectInput
                onChange={(event) => setForm((current) => ({ ...current, requestId: event.target.value }))}
                value={form.requestId}
              >
                {requests.map((request) => (
                  <option key={request.id} value={String(request.id)}>
                    {request.clientName} • {request.email}
                  </option>
                ))}
              </SelectInput>
            </FieldLabel>

            <FieldLabel label="Voice sample">
              <SelectInput
                onChange={(event) => setForm((current) => ({ ...current, voiceSampleId: event.target.value }))}
                value={form.voiceSampleId}
              >
                {filteredSamples.map((sample) => (
                  <option key={sample.id} value={String(sample.id)}>
                    {sample.title}
                  </option>
                ))}
              </SelectInput>
            </FieldLabel>

            <FieldLabel label="Recipient email">
              <TextInput
                onChange={(event) => setForm((current) => ({ ...current, recipientEmail: event.target.value }))}
                type="email"
                value={form.recipientEmail}
              />
            </FieldLabel>

            <FieldLabel label="Delivery mode">
              <SelectInput
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryMode: event.target.value as DeliveryMode }))
                }
                value={form.deliveryMode}
              >
                <option value="link">Public audio link</option>
                <option value="attachment">Audio attachment</option>
              </SelectInput>
            </FieldLabel>

            <div className="lg:col-span-2">
              <FieldLabel label="Email subject">
                <TextInput
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  value={form.subject}
                />
              </FieldLabel>
            </div>

            <div className="lg:col-span-2">
              <FieldLabel label="Email message">
                <TextAreaInput
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  rows={8}
                  value={form.message}
                />
              </FieldLabel>
            </div>

            <div className="lg:col-span-2">
              <PrimaryButton disabled={sending} type="submit">
                {sending ? 'Sending...' : 'Send sample'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Panel>
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
  tone,
}: {
  children: ReactNode;
  tone: 'error' | 'success';
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

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'sent'
      ? 'border-[#cfe5d8] bg-[#eef9f2] text-[#2f6b4f]'
      : status === 'sample_ready' || status === 'completed'
        ? 'border-[#d9d7f8] bg-[#f2f0ff] text-[#5646b0]'
        : status === 'failed'
          ? 'border-[#efc2bc] bg-[#fff2f0] text-[#9d564c]'
          : 'border-[#e3d7c8] bg-[#f8f2ea] text-[#7a5f4f]';

  return (
    <span className={cx('inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize', tone)}>
      {statusLabel(status)}
    </span>
  );
}

export default App;
