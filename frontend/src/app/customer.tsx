import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import brandLogo from '../assets/bangla-speech-ai-logo.png';

export type CustomerUser = {
  accountStatus: 'active' | 'disabled';
  countryCode: string | null;
  createdAt: string;
  email: string;
  emailVerified: boolean;
  id: number;
  mobileNumber: string | null;
  packageType: 'starter' | 'gold' | 'platinum';
  phoneVerified: boolean;
  tokenBalance: number;
};

type CustomerSessionResponse = {
  authenticated: boolean;
  user: CustomerUser | null;
};

type PackageSummary = {
  code: 'starter' | 'gold' | 'platinum';
  displayOrder: number;
  isPremium: boolean;
  monthlyRefillTokens: number;
  name: string;
  signupTokenGrant: number;
};

type PaymentHistoryItem = {
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
};

export type PurchaseSelection =
  | {
      extraTokenAmount: 5000;
      label: string;
      packageCode?: never;
    }
  | {
      extraTokenAmount?: never;
      label: string;
      packageCode: 'starter' | 'gold' | 'platinum';
    };

type TokenLedgerItem = {
  balanceAfter: number;
  createdAt: string;
  id: number;
  notes: string | null;
  packageUpgradeId: number | null;
  paymentId: number | null;
  tokenDelta: number;
  transactionType: string;
};

type InlineMessageProps = {
  children: ReactNode;
  tone?: 'error' | 'neutral' | 'success';
};

export type CustomerRoute =
  | '/'
  | '/login'
  | '/signup'
  | '/forgot-password'
  | '/reset-password'
  | '/verify-email'
  | '/verify-phone'
  | '/dashboard'
  | '/account'
  | '/payment/success';

const publicRoutes = new Set<CustomerRoute>([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-phone',
  '/dashboard',
  '/account',
  '/payment/success',
]);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function apiRequest<T>(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
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
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
      (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message) ||
      `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return payload as T;
}

function readCurrentRoute(): { pathname: CustomerRoute; search: string } {
  const pathname = publicRoutes.has(window.location.pathname as CustomerRoute)
    ? (window.location.pathname as CustomerRoute)
    : '/';

  return {
    pathname,
    search: window.location.search,
  };
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

function createSearch(searchParams: URLSearchParams) {
  const nextSearch = searchParams.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

function buildAccountHref(section?: string | null) {
  const params = new URLSearchParams();

  if (section) {
    params.set('section', section);
  }

  return `/account${createSearch(params)}`;
}

function buildLeadHref(mode?: string | null) {
  const params = new URLSearchParams();

  if (mode === 'sample' || mode === 'pilot') {
    params.set('lead', mode);
  }

  return `/${createSearch(params)}`;
}

function InlineMessage({ children, tone = 'neutral' }: InlineMessageProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border px-4 py-3 text-sm leading-6',
        tone === 'error' && 'border-[#d8b7a6] bg-[#fbefea] text-[#8d4f37]',
        tone === 'success' && 'border-[#c6d8c9] bg-[#eef8ee] text-[#375f3c]',
        tone === 'neutral' && 'border-[#d6cabd] bg-white/80 text-[#5a514a]',
      )}
    >
      {children}
    </div>
  );
}

const textInputClassName =
  'w-full rounded-2xl border border-[#d8cbbe] bg-white px-4 py-3 text-sm text-[#2f343b] outline-none transition placeholder:text-[#9a8e83] focus:border-[#ae6c4a] focus:ring-2 focus:ring-[#e8c6ad]';

function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={cx(textInputClassName, className)}
    />
  );
}

function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cx(textInputClassName, 'pr-12', className)}
      />
      <button
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#8d7f73] transition hover:text-[#ae6c4a]"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...props}
      className={cx(
        'rounded-full bg-[#ae6c4a] px-5 py-3 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    />
  );
}

function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...props}
      className={cx(
        'rounded-full border border-[#d8cbbe] bg-white/80 px-5 py-3 text-sm font-semibold text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544] disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    />
  );
}

function AuthCard({
  children,
  description,
  onNavigate,
  title,
}: {
  children: ReactNode;
  description: string;
  onNavigate?: (href: string, replace?: boolean) => void;
  title: string;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#EEEBE4] px-4 py-6 sm:px-5 sm:py-8">
      {onNavigate ? (
        <div className="mx-auto flex w-full max-w-5xl justify-end">
          <SecondaryButton className="px-4 py-2.5 text-xs sm:text-sm" onClick={() => onNavigate('/')} type="button">
            Back to website
          </SecondaryButton>
        </div>
      ) : null}
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl items-center py-4 sm:min-h-[calc(100vh-4rem)] sm:py-6">
        <div className="grid overflow-hidden rounded-[28px] border border-[#ddcfbe] bg-white/90 shadow-[0_28px_80px_rgba(92,80,72,0.12)] backdrop-blur lg:grid-cols-[0.95fr_1.05fr]">
        <section className="bg-[#f8f3ec] px-6 py-10 sm:px-10 sm:py-12">
          <div className="flex items-center gap-3">
            <img
              src={brandLogo}
              alt="BANGLA SPEECH AI logo"
              className="h-10 w-auto shrink-0 mix-blend-multiply sm:h-11"
            />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#4F4740]">
              BANGLA SPEECH AI
            </span>
          </div>
          <h1 className="mt-6 max-w-md text-4xl font-bold leading-tight text-[#2f343b]">{title}</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#64584f] sm:text-base">{description}</p>
        </section>
        <section className="px-6 py-8 sm:px-10 sm:py-12">{children}</section>
      </div>
      </div>
    </div>
  );
}

export function useCustomerSession() {
  const [session, setSession] = useState<CustomerSessionResponse>({ authenticated: false, user: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const nextSession = await apiRequest<CustomerSessionResponse>('/api/user/me');
      setSession(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load customer session.');
      setSession({ authenticated: false, user: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    error,
    loading,
    refresh,
    session,
    setSession,
  };
}

export function CustomerAuthRoutes({
  onAuthenticated,
  onNavigate,
  route,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  route: CustomerRoute;
  search: string;
}) {
  if (route === '/login') {
    return <LoginPage onAuthenticated={onAuthenticated} onNavigate={onNavigate} search={search} />;
  }
  if (route === '/signup') {
    return <SignupPage onAuthenticated={onAuthenticated} onNavigate={onNavigate} search={search} />;
  }
  if (route === '/forgot-password') {
    return <ForgotPasswordPage onNavigate={onNavigate} />;
  }
  if (route === '/reset-password') {
    return <ResetPasswordPage onAuthenticated={onAuthenticated} onNavigate={onNavigate} search={search} />;
  }
  if (route === '/verify-email') {
    return <VerifyEmailPage onAuthenticated={onAuthenticated} onNavigate={onNavigate} search={search} />;
  }
  if (route === '/verify-phone') {
    return <VerifyPhonePage onAuthenticated={onAuthenticated} onNavigate={onNavigate} search={search} />;
  }

  return null;
}

export function CustomerPaymentSuccessPage({
  onNavigate,
  onRefreshSession,
  search,
}: {
  onNavigate: (href: string, replace?: boolean) => void;
  onRefreshSession?: () => Promise<void> | void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const paymentId = params.get('payment_id');
  const [payment, setPayment] = useState<PaymentHistoryItem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paymentId) {
      setError('Payment id is missing.');
      setLoading(false);
      return;
    }

    let isCancelled = false;
    let pollTimer: number | null = null;

    const load = async () => {
      try {
        const payload = await apiRequest<{ payment: PaymentHistoryItem }>(`/api/payments/${paymentId}`);

        if (isCancelled) {
          return;
        }

        setPayment(payload.payment);
        setError('');
        setLoading(false);

        if (payload.payment.status === 'completed') {
          void onRefreshSession?.();
        }

        if (payload.payment.status === 'pending') {
          pollTimer = window.setTimeout(() => {
            void load();
          }, 3000);
        }
      } catch (nextError) {
        if (isCancelled) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : 'Failed to load payment status.');
        setLoading(false);
      }
    };

    void load();

    return () => {
      isCancelled = true;
      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [paymentId]);

  return (
    <AuthCard
      title="Payment status"
      description="This page reflects the backend payment record, including webhook-confirmed Stripe payments and executed bKash payments."
    >
      <h2 className="text-2xl font-bold text-[#2f343b]">Purchase update</h2>
      <div className="mt-8 space-y-4">
        {loading ? <InlineMessage>Checking payment status...</InlineMessage> : null}
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {payment ? (
          <div className="rounded-[24px] border border-[#ddcfbe] bg-[#faf7f1] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#2f343b]">
                  {payment.packageCode ? `${statusLabel(payment.packageCode)} package` : 'Extra token purchase'}
                </div>
                <div className="text-sm text-[#6f645c]">
                  {payment.amount.toFixed(2)} {payment.currency.toUpperCase()} via {payment.provider}
                </div>
              </div>
              <span
                className={cx(
                  'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]',
                  payment.status === 'completed' && 'bg-[#e5f4e5] text-[#355f3b]',
                  payment.status === 'pending' && 'bg-[#efe2d1] text-[#8d5d45]',
                  (payment.status === 'failed' || payment.status === 'cancelled') && 'bg-[#fbefea] text-[#8d4f37]',
                )}
              >
                {statusLabel(payment.status)}
              </span>
            </div>
            <div className="mt-3 text-sm leading-7 text-[#64584f]">
              {payment.status === 'completed'
                ? 'Your payment has been confirmed and the package or token balance has been updated.'
                : payment.status === 'pending'
                  ? 'Your payment is still processing. This page refreshes automatically while the backend waits for final confirmation.'
                  : 'This payment did not complete successfully. Review the status and try again if needed.'}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <PrimaryButton onClick={() => onNavigate('/dashboard')} type="button">
            Open dashboard
          </PrimaryButton>
          <SecondaryButton onClick={() => onNavigate('/')} type="button">
            Back to website
          </SecondaryButton>
        </div>
      </div>
    </AuthCard>
  );
}

export function PaymentMethodDialog({
  onClose,
  onPurchaseComplete,
  selection,
}: {
  onClose: () => void;
  onPurchaseComplete?: () => void;
  selection: PurchaseSelection | null;
}) {
  const [submitting, setSubmitting] = useState<null | 'bkash' | 'stripe'>(null);
  const [message, setMessage] = useState('');

  if (!selection) {
    return null;
  }

  const title =
    'packageCode' in selection
      ? selection.packageCode === 'gold'
        ? 'Gold package'
        : selection.packageCode === 'platinum'
          ? 'Platinum package'
          : 'Starter package'
      : selection.label;

  const handleProvider = async (provider: 'bkash' | 'stripe') => {
    setSubmitting(provider);
    setMessage('');

    try {
      const payload = await apiRequest<{
        bkashUrl?: string | null;
        checkoutUrl?: string | null;
        paymentId: number;
      }>('/api/payments/create', {
        body: JSON.stringify({
          extraTokenAmount: 'extraTokenAmount' in selection ? selection.extraTokenAmount : undefined,
          packageCode: 'packageCode' in selection ? selection.packageCode : undefined,
          provider,
        }),
        method: 'POST',
      });

      onPurchaseComplete?.();

      const redirectUrl = provider === 'stripe' ? payload.checkoutUrl : payload.bkashUrl;

      if (!redirectUrl) {
        throw new Error('The payment provider did not return a redirect URL.');
      }

      window.location.assign(redirectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start payment.');
      setSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2f343b]/40 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-[#d8cbbe] bg-[#f8f3ec] p-6 shadow-[0_24px_80px_rgba(47,52,59,0.18)]">
        <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
          Payment method
        </div>
        <h2 className="mt-4 text-2xl font-bold text-[#2f343b]">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-[#64584f]">
          Choose how to continue the payment. Final package and token updates are applied by the backend after provider confirmation.
        </p>
        {message ? <div className="mt-4"><InlineMessage tone="error">{message}</InlineMessage></div> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <PrimaryButton
            className="w-full justify-center"
            disabled={Boolean(submitting)}
            onClick={() => void handleProvider('stripe')}
            type="button"
          >
            {submitting === 'stripe' ? 'Redirecting...' : 'Pay with Card'}
          </PrimaryButton>
          <SecondaryButton
            className="w-full justify-center"
            disabled={Boolean(submitting)}
            onClick={() => void handleProvider('bkash')}
            type="button"
          >
            {submitting === 'bkash' ? 'Redirecting...' : 'Pay with bKash'}
          </SecondaryButton>
        </div>
        <button className="mt-5 text-sm font-medium text-[#6a5f57]" onClick={onClose} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function LoginPage({
  onAuthenticated,
  onNavigate,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const next = params.get('next');
  const packageCode = params.get('package');
  const section = params.get('section');
  const mode = params.get('mode');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{ user: CustomerUser }>('/api/auth/login', {
        body: JSON.stringify({ email, password }),
        method: 'POST',
      });

      const session = { authenticated: true, user: payload.user };
      onAuthenticated(session);

      if (!payload.user.emailVerified) {
        const verifyParams = new URLSearchParams();
        if (next) verifyParams.set('next', next);
        if (packageCode) verifyParams.set('package', packageCode);
        if (mode) verifyParams.set('mode', mode);
        onNavigate(`/verify-email${createSearch(verifyParams)}`, true);
      } else if (!payload.user.phoneVerified) {
        const verifyParams = new URLSearchParams();
        if (next) verifyParams.set('next', next);
        if (packageCode) verifyParams.set('package', packageCode);
        if (mode) verifyParams.set('mode', mode);
        onNavigate(`/verify-phone${createSearch(verifyParams)}`, true);
      } else if (next === 'lead') {
        onNavigate(buildLeadHref(mode), true);
      } else if (next === 'account') {
        onNavigate(buildAccountHref(section), true);
      } else if (next === 'checkout' && packageCode) {
        const dashboardParams = new URLSearchParams();
        dashboardParams.set('checkout', packageCode);
        dashboardParams.set('section', 'plan');
        onNavigate(`/dashboard${createSearch(dashboardParams)}`, true);
      } else {
        onNavigate('/dashboard', true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      onNavigate={onNavigate}
      title="Sign in to access Bangla voice samples."
      description="Customer accounts gate sample access, keep verification state, and track package and token usage."
    >
      <h2 className="text-2xl font-bold text-[#2f343b]">Customer login</h2>
      <p className="mt-2 text-sm leading-6 text-[#6a5f57]">Use your account to continue to samples and dashboard access.</p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <TextInput autoComplete="username" placeholder="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <PasswordInput autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Signing in...' : 'Sign in'}
        </PrimaryButton>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <button className="text-[#a96544]" onClick={() => onNavigate('/forgot-password')} type="button">
            Forgot password
          </button>
          <button className="text-[#5a514a]" onClick={() => onNavigate('/signup')} type="button">
            Create account
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

function SignupPage({
  onAuthenticated,
  onNavigate,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const next = params.get('next');
  const packageCode = params.get('package');
  const section = params.get('section');
  const mode = params.get('mode');
  const [form, setForm] = useState({
    confirmPassword: '',
    countryCode: '+880',
    email: '',
    mobileNumber: '',
    password: '',
  });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verificationInfo, setVerificationInfo] = useState<{ emailPreview?: string | null; phonePreview?: string | null }>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{
        user: CustomerUser;
        verification: {
          email: { preview: string | null };
          phone: { preview: string | null };
        };
      }>('/api/auth/signup', {
        body: JSON.stringify(form),
        method: 'POST',
      });

      onAuthenticated({ authenticated: true, user: payload.user });
      setVerificationInfo({
        emailPreview: payload.verification.email.preview,
        phonePreview: payload.verification.phone.preview,
      });
      const verifyParams = new URLSearchParams();
      if (next) verifyParams.set('next', next);
      if (packageCode) verifyParams.set('package', packageCode);
      if (section) verifyParams.set('section', section);
      if (mode) verifyParams.set('mode', mode);
      onNavigate(`/verify-email${createSearch(verifyParams)}`, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      onNavigate={onNavigate}
      title="Create a verified customer account."
      description="Starter accounts begin on the free package and unlock samples after email and phone verification."
    >
      <h2 className="text-2xl font-bold text-[#2f343b]">Sign up</h2>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <TextInput autoComplete="email" placeholder="Work email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
          <TextInput placeholder="Country code" value={form.countryCode} onChange={(event) => setForm((current) => ({ ...current, countryCode: event.target.value }))} />
          <TextInput placeholder="Mobile number" value={form.mobileNumber} onChange={(event) => setForm((current) => ({ ...current, mobileNumber: event.target.value }))} />
        </div>
        <PasswordInput autoComplete="new-password" placeholder="Password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
        <PasswordInput autoComplete="new-password" placeholder="Confirm password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
        {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}
        {verificationInfo.emailPreview || verificationInfo.phonePreview ? (
          <InlineMessage>
            Development verification preview:
            {verificationInfo.emailPreview ? ` email OTP ${verificationInfo.emailPreview}` : ''}
            {verificationInfo.phonePreview ? ` | phone OTP ${verificationInfo.phonePreview}` : ''}
          </InlineMessage>
        ) : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Creating account...' : 'Create account'}
        </PrimaryButton>
        <button className="text-sm text-[#5a514a]" onClick={() => onNavigate('/login')} type="button">
          Already have an account? Sign in
        </button>
      </form>
    </AuthCard>
  );
}

function ForgotPasswordPage({ onNavigate }: { onNavigate: (href: string, replace?: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetPreview, setResetPreview] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{ developmentResetToken: string | null; message: string; resetUrl: string | null }>('/api/auth/forgot-password', {
        body: JSON.stringify({ email }),
        method: 'POST',
      });
      setMessage(payload.message);
      setResetPreview(payload.resetUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard description="Use your email address to begin the reset flow." onNavigate={onNavigate} title="Reset your password.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Forgot password</h2>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <TextInput autoComplete="email" placeholder="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        {message ? <InlineMessage tone={resetPreview ? 'success' : 'neutral'}>{message}</InlineMessage> : null}
        {resetPreview ? <InlineMessage>{resetPreview}</InlineMessage> : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Preparing reset...' : 'Send reset link'}
        </PrimaryButton>
        <button className="text-sm text-[#5a514a]" onClick={() => onNavigate('/login')} type="button">
          Back to login
        </button>
      </form>
    </AuthCard>
  );
}

function ResetPasswordPage({
  onAuthenticated,
  onNavigate,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const resetToken = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{ message: string; user: CustomerUser }>('/api/auth/reset-password', {
        body: JSON.stringify({ confirmPassword, password, token: resetToken }),
        method: 'POST',
      });
      onAuthenticated({ authenticated: true, user: payload.user });
      onNavigate('/dashboard', true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard description="Complete your password reset and continue to your dashboard." onNavigate={onNavigate} title="Choose a new password.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Reset password</h2>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <PasswordInput autoComplete="new-password" placeholder="New password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <PasswordInput autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Resetting...' : 'Reset password'}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
}

function VerifyEmailPage({
  onAuthenticated,
  onNavigate,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const next = params.get('next');
  const packageCode = params.get('package');
  const section = params.get('section');
  const mode = params.get('mode');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{ message: string; user: CustomerUser }>('/api/auth/verify-email-otp', {
        body: JSON.stringify({ otp }),
        method: 'POST',
      });
      onAuthenticated({ authenticated: true, user: payload.user });
      if (payload.user.phoneVerified) {
        if (next === 'checkout' && packageCode) {
          const dashboardParams = new URLSearchParams();
          dashboardParams.set('checkout', packageCode);
          dashboardParams.set('section', 'plan');
          onNavigate(`/dashboard${createSearch(dashboardParams)}`, true);
        } else if (next === 'lead') {
          onNavigate(buildLeadHref(mode), true);
        } else if (next === 'account') {
          onNavigate(buildAccountHref(section), true);
        } else {
          onNavigate('/dashboard', true);
        }
      } else {
        const verifyParams = new URLSearchParams();
        if (next) verifyParams.set('next', next);
        if (packageCode) verifyParams.set('package', packageCode);
        if (section) verifyParams.set('section', section);
        if (mode) verifyParams.set('mode', mode);
        onNavigate(`/verify-phone${createSearch(verifyParams)}`, true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Email verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setMessage('');
    try {
      const payload = await apiRequest<{ verification: { preview: string | null } }>('/api/auth/send-email-otp', {
        method: 'POST',
      });
      setMessage(payload.verification.preview ? `Development email OTP: ${payload.verification.preview}` : 'Email code sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to resend email code.');
    }
  };

  return (
    <AuthCard description="Email verification is required before sample access is enabled." onNavigate={onNavigate} title="Verify your email.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Email verification</h2>
      <form className="mt-8 space-y-4" onSubmit={handleVerify}>
        <TextInput placeholder="6-digit code" value={otp} onChange={(event) => setOtp(event.target.value)} />
        {message ? <InlineMessage tone="neutral">{message}</InlineMessage> : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Verifying...' : 'Verify email'}
        </PrimaryButton>
        <SecondaryButton className="w-full justify-center" onClick={() => void handleResend()} type="button">
          Resend code
        </SecondaryButton>
      </form>
    </AuthCard>
  );
}

function VerifyPhonePage({
  onAuthenticated,
  onNavigate,
  search,
}: {
  onAuthenticated: (session: CustomerSessionResponse) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const next = params.get('next');
  const packageCode = params.get('package');
  const section = params.get('section');
  const mode = params.get('mode');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await apiRequest<{ message: string; user: CustomerUser }>('/api/auth/verify-phone-otp', {
        body: JSON.stringify({ otp }),
        method: 'POST',
      });
      onAuthenticated({ authenticated: true, user: payload.user });
      if (next === 'checkout' && packageCode) {
        const dashboardParams = new URLSearchParams();
        dashboardParams.set('checkout', packageCode);
        dashboardParams.set('section', 'plan');
        onNavigate(`/dashboard${createSearch(dashboardParams)}`, true);
      } else if (next === 'lead') {
        onNavigate(buildLeadHref(mode), true);
      } else if (next === 'account') {
        onNavigate(buildAccountHref(section), true);
      } else {
        onNavigate('/dashboard', true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Phone verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setMessage('');
    try {
      const payload = await apiRequest<{ verification: { preview: string | null } }>('/api/auth/send-phone-otp', {
        method: 'POST',
      });
      setMessage(payload.verification.preview ? `Development phone OTP: ${payload.verification.preview}` : 'Phone code sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to resend phone code.');
    }
  };

  return (
    <AuthCard description="Phone verification completes account activation for sample usage and dashboard access." onNavigate={onNavigate} title="Verify your phone number.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Phone verification</h2>
      <form className="mt-8 space-y-4" onSubmit={handleVerify}>
        <TextInput placeholder="6-digit code" value={otp} onChange={(event) => setOtp(event.target.value)} />
        {message ? <InlineMessage tone="neutral">{message}</InlineMessage> : null}
        <PrimaryButton className="w-full justify-center" disabled={submitting} type="submit">
          {submitting ? 'Verifying...' : 'Verify phone'}
        </PrimaryButton>
        <SecondaryButton className="w-full justify-center" onClick={() => void handleResend()} type="button">
          Resend code
        </SecondaryButton>
      </form>
    </AuthCard>
  );
}

type AccountSection = 'credits' | 'payments' | 'plan' | 'profile' | 'security' | 'tokens';

const validAccountSections = new Set<AccountSection>(['credits', 'payments', 'plan', 'profile', 'security', 'tokens']);

export function CustomerAccountPage({
  onStartPurchase,
  onNavigate,
  onSessionRefresh,
  search,
  user,
}: {
  onSessionRefresh?: () => Promise<void> | void;
  onStartPurchase: (selection: PurchaseSelection) => void;
  onNavigate: (href: string, replace?: boolean) => void;
  search: string;
  user: CustomerUser;
}) {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [ledger, setLedger] = useState<TokenLedgerItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    countryCode: user.countryCode ?? '+880',
    email: user.email,
    mobileNumber: user.mobileNumber ?? '',
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [verificationPreview, setVerificationPreview] = useState<{ email?: string | null; phone?: string | null }>({});
  const [verificationRequired, setVerificationRequired] = useState<{ email: boolean; phone: boolean }>({ email: false, phone: false });
  const [passwordForm, setPasswordForm] = useState({
    confirmPassword: '',
    currentPassword: '',
    newPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [planMessage, setPlanMessage] = useState('');
  const [planError, setPlanError] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const searchParams = new URLSearchParams(search);
  const sectionParam = searchParams.get('section');
  const activeSection: AccountSection = validAccountSections.has(sectionParam as AccountSection)
    ? (sectionParam as AccountSection)
    : 'profile';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [packagePayload, paymentPayload, tokenPayload] = await Promise.all([
        apiRequest<{ packages: PackageSummary[] }>('/api/packages'),
        apiRequest<{ payments: PaymentHistoryItem[] }>('/api/user/payment-history'),
        apiRequest<{ tokenBalance: number; transactions: TokenLedgerItem[] }>('/api/user/tokens'),
      ]);

      setPackages(packagePayload.packages);
      setPayments(paymentPayload.payments);
      setLedger(tokenPayload.transactions);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load account data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, user.id]);

  useEffect(() => {
    setProfileForm({
      countryCode: user.countryCode ?? '+880',
      email: user.email,
      mobileNumber: user.mobileNumber ?? '',
    });
  }, [user.countryCode, user.email, user.mobileNumber]);

  const currentPackage = useMemo(
    () => packages.find((item) => item.code === user.packageType) ?? null,
    [packages, user.packageType],
  );

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSubmitting(true);
    setProfileError('');
    setProfileMessage('');

    try {
      const payload = await apiRequest<{
        message: string;
        user: CustomerUser;
        verification: {
          email: { preview: string | null } | null;
          phone: { preview: string | null } | null;
        };
        verificationRequired: { email: boolean; phone: boolean };
      }>('/api/user/profile', {
        body: JSON.stringify(profileForm),
        method: 'PATCH',
      });

      setProfileMessage(payload.message);
      setVerificationPreview({
        email: payload.verification.email?.preview ?? null,
        phone: payload.verification.phone?.preview ?? null,
      });
      setVerificationRequired(payload.verificationRequired);
      await onSessionRefresh?.();
    } catch (nextError) {
      setProfileError(nextError instanceof Error ? nextError.message : 'Failed to update profile.');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordError('');
    setPasswordMessage('');

    try {
      const payload = await apiRequest<{ message: string }>('/api/user/change-password', {
        body: JSON.stringify(passwordForm),
        method: 'POST',
      });
      setPasswordMessage(payload.message);
      setPasswordForm({
        confirmPassword: '',
        currentPassword: '',
        newPassword: '',
      });
    } catch (nextError) {
      setPasswordError(nextError instanceof Error ? nextError.message : 'Failed to update password.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDowngrade = async () => {
    setPlanSubmitting(true);
    setPlanError('');
    setPlanMessage('');

    try {
      const payload = await apiRequest<{ message: string }>('/api/user/downgrade-to-starter', {
        method: 'POST',
      });
      setPlanMessage(payload.message);
      await onSessionRefresh?.();
      await load();
    } catch (nextError) {
      setPlanError(nextError instanceof Error ? nextError.message : 'Failed to change plan.');
    } finally {
      setPlanSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5">
        <InlineMessage>Loading account...</InlineMessage>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-24">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
            Customer Account
          </div>
          <h1 className="mt-5 text-4xl font-bold text-[#2f343b]">Manage your Bangla voice account</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#64584f] sm:text-base">
            Profile details, package status, token balance, payment history, and security controls for your customer account.
          </p>
        </div>
        <SecondaryButton onClick={() => onNavigate('/')} type="button">
          Back to website
        </SecondaryButton>
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="Package" value={currentPackage?.name ?? statusLabel(user.packageType)} />
        <DashboardCard label="Token balance" value={user.tokenBalance.toLocaleString()} />
        <DashboardCard label="Email status" value={user.emailVerified ? 'Verified' : 'Pending'} />
        <DashboardCard label="Phone status" value={user.phoneVerified ? 'Verified' : 'Pending'} />
      </div>

      <div className="mt-8">
        <div className="mx-auto w-full max-w-4xl">
          {activeSection === 'profile' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <h2 className="text-xl font-bold text-[#2f343b]">Profile details</h2>
            <p className="mt-2 text-sm leading-7 text-[#64584f]">
              Update the email and mobile details tied to your customer account. Changing either will require verification again.
            </p>
            <form className="mt-6 space-y-4" onSubmit={handleProfileSubmit}>
              <TextInput
                autoComplete="email"
                placeholder="Work email"
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              />
              <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
                <TextInput
                  placeholder="Country code"
                  value={profileForm.countryCode}
                  onChange={(event) => setProfileForm((current) => ({ ...current, countryCode: event.target.value }))}
                />
                <TextInput
                  placeholder="Mobile number"
                  value={profileForm.mobileNumber}
                  onChange={(event) => setProfileForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                />
              </div>
              {profileError ? <InlineMessage tone="error">{profileError}</InlineMessage> : null}
              {profileMessage ? <InlineMessage tone="success">{profileMessage}</InlineMessage> : null}
              {verificationPreview.email || verificationPreview.phone ? (
                <InlineMessage>
                  Development verification preview:
                  {verificationPreview.email ? ` email OTP ${verificationPreview.email}` : ''}
                  {verificationPreview.phone ? ` | phone OTP ${verificationPreview.phone}` : ''}
                </InlineMessage>
              ) : null}
              {verificationRequired.email || verificationRequired.phone ? (
                <div className="flex flex-wrap gap-3">
                  {verificationRequired.email ? (
                    <SecondaryButton onClick={() => onNavigate('/verify-email?next=account')} type="button">
                      Verify email
                    </SecondaryButton>
                  ) : null}
                  {verificationRequired.phone ? (
                    <SecondaryButton onClick={() => onNavigate('/verify-phone?next=account')} type="button">
                      Verify phone
                    </SecondaryButton>
                  ) : null}
                </div>
              ) : null}
              <PrimaryButton className="justify-center" disabled={profileSubmitting} type="submit">
                {profileSubmitting ? 'Saving profile...' : 'Save profile'}
              </PrimaryButton>
            </form>
            </section>
          ) : null}

          {activeSection === 'plan' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <h2 className="text-xl font-bold text-[#2f343b]">Manage plan</h2>
            <p className="mt-2 text-sm leading-7 text-[#64584f]">
              Current package: <span className="font-semibold text-[#2f343b]">{currentPackage?.name ?? statusLabel(user.packageType)}</span>
            </p>
            {planError ? <div className="mt-4"><InlineMessage tone="error">{planError}</InlineMessage></div> : null}
            {planMessage ? <div className="mt-4"><InlineMessage tone="success">{planMessage}</InlineMessage></div> : null}
            <div className="mt-5 space-y-4">
              {packages.map((item) => (
                <div key={item.code} className="rounded-2xl border border-[#e6d7c7] bg-[#faf7f1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">{item.name}</div>
                      <div className="text-sm text-[#6f645c]">
                        {item.monthlyRefillTokens > 0
                          ? `${item.monthlyRefillTokens.toLocaleString()} monthly refill tokens`
                          : `${item.signupTokenGrant.toLocaleString()} fixed tokens`}
                      </div>
                    </div>
                    <span className={cx(
                      'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]',
                      user.packageType === item.code ? 'bg-[#ae6c4a] text-white' : 'bg-[#efe2d1] text-[#8d5d45]',
                    )}>
                      {user.packageType === item.code ? 'Current' : item.isPremium ? 'Premium' : 'Default'}
                    </span>
                  </div>
                  {item.code !== user.packageType && item.code !== 'starter' ? (
                    <div className="mt-4">
                      <PrimaryButton onClick={() => onStartPurchase({ label: item.name, packageCode: item.code })} type="button">
                        Upgrade to {item.name}
                      </PrimaryButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {user.packageType !== 'starter' ? (
              <div className="mt-6 rounded-[24px] border border-[#eadfce] bg-[#fff7f2] p-5">
                <h3 className="text-lg font-semibold text-[#2f343b]">Downgrade to Starter</h3>
                <p className="mt-2 text-sm leading-7 text-[#64584f]">
                  Downgrading does not create an automatic refund. Premium access is removed and the token balance becomes the lower of your current balance and 1,000.
                </p>
                <div className="mt-4">
                  <SecondaryButton disabled={planSubmitting} onClick={() => void handleDowngrade()} type="button">
                    {planSubmitting ? 'Updating plan...' : 'Downgrade to Starter'}
                  </SecondaryButton>
                </div>
              </div>
            ) : null}
            </section>
          ) : null}

          {activeSection === 'tokens' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#2f343b]">Token balance</h2>
                <p className="mt-2 text-sm leading-7 text-[#64584f]">Live balance from your authenticated account state.</p>
              </div>
              <div className="rounded-full border border-[#D2CCBE] bg-[#F8F3EC] px-4 py-2 text-sm font-semibold text-[#2F343B]">
                Tokens Left: {user.tokenBalance.toLocaleString()}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {ledger.length === 0 ? <InlineMessage>No token transactions yet.</InlineMessage> : null}
              {ledger.slice(0, 10).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">{statusLabel(entry.transactionType)}</div>
                      <div className="text-xs text-[#7a6f66]">{formatDate(entry.createdAt)}</div>
                    </div>
                    <div className={cx('text-sm font-semibold', entry.tokenDelta >= 0 ? 'text-[#3f7043]' : 'text-[#8d4f37]')}>
                      {entry.tokenDelta >= 0 ? '+' : ''}
                      {entry.tokenDelta}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-[#64584f]">Balance after: {entry.balanceAfter.toLocaleString()}</div>
                  {entry.notes ? <div className="mt-1 text-sm text-[#7a6f66]">{entry.notes}</div> : null}
                </div>
              ))}
            </div>
            </section>
          ) : null}

          {activeSection === 'credits' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <h2 className="text-xl font-bold text-[#2f343b]">Add credits</h2>
            {user.packageType === 'starter' ? (
              <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-5">
                <p className="text-sm leading-7 text-[#64584f]">
                  Starter accounts cannot buy extra tokens directly. Upgrade to Gold or Platinum first, then choose Stripe or bKash during checkout.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <PrimaryButton onClick={() => onStartPurchase({ label: 'Gold', packageCode: 'gold' })} type="button">
                    Upgrade to Gold
                  </PrimaryButton>
                  <SecondaryButton onClick={() => onStartPurchase({ label: 'Platinum', packageCode: 'platinum' })} type="button">
                    Upgrade to Platinum
                  </SecondaryButton>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#2f343b]">Buy 5,000 extra tokens</h3>
                    <p className="mt-2 text-sm leading-7 text-[#64584f]">
                      Gold and Platinum accounts can add 5,000 tokens without changing the current package. Payment method selection stays on the existing Stripe/bKash flow.
                    </p>
                  </div>
                  <PrimaryButton onClick={() => onStartPurchase({ extraTokenAmount: 5000, label: '5,000 extra tokens' })} type="button">
                    Add 5,000 tokens
                  </PrimaryButton>
                </div>
              </div>
            )}
            </section>
          ) : null}

          {activeSection === 'payments' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <h2 className="text-xl font-bold text-[#2f343b]">Payment history</h2>
            <div className="mt-5 space-y-3">
              {payments.length === 0 ? <InlineMessage>No payments recorded yet.</InlineMessage> : null}
              {payments.slice(0, 10).map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#2f343b]">
                        {statusLabel(payment.paymentType)} • {payment.provider}
                      </div>
                      <div className="text-sm text-[#6f645c]">
                        {payment.amount.toFixed(2)} {payment.currency.toUpperCase()}
                      </div>
                    </div>
                    <span className="rounded-full bg-[#efe2d1] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8d5d45]">
                      {statusLabel(payment.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-[#7a6f66]">{formatDate(payment.createdAt)}</div>
                </div>
              ))}
            </div>
            </section>
          ) : null}

          {activeSection === 'security' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
            <h2 className="text-xl font-bold text-[#2f343b]">Security</h2>
            <p className="mt-2 text-sm leading-7 text-[#64584f]">Change your password using the current password as confirmation.</p>
            <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
              <PasswordInput
                autoComplete="current-password"
                placeholder="Current password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              />
              <PasswordInput
                autoComplete="new-password"
                placeholder="New password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              />
              <PasswordInput
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
              {passwordError ? <InlineMessage tone="error">{passwordError}</InlineMessage> : null}
              {passwordMessage ? <InlineMessage tone="success">{passwordMessage}</InlineMessage> : null}
              <PrimaryButton className="justify-center" disabled={passwordSubmitting} type="submit">
                {passwordSubmitting ? 'Updating password...' : 'Change password'}
              </PrimaryButton>
            </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const CustomerDashboard = CustomerAccountPage;

function DashboardCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[26px] border border-[#ddcfbe] bg-white/88 p-5 shadow-[0_18px_45px_rgba(55,58,64,0.08)]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8d5d45]">{label}</div>
      <div className="mt-3 text-3xl font-bold text-[#2f343b]">{value}</div>
    </div>
  );
}
