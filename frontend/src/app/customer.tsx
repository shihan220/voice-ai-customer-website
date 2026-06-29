import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileAudio2,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import brandLogo from '../assets/bangla-speech-ai-logo.png';

export type CustomerUser = {
  accountStatus: 'active' | 'disabled';
  countryCode: string | null;
  createdAt: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
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

type TtsGenerationJob = {
  billableMinutes: number | null;
  cancelReason: string | null;
  cancellationRequestedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  downloadedAt: string | null;
  errorMessage: string | null;
  fullGenerationRequestedAt: string | null;
  generatedAudioSeconds: number | null;
  id: number;
  inputText?: string;
  mp3BitrateKbps: number | null;
  mp3DownloadUrl: string | null;
  previewAudioSeconds: number | null;
  previewAudioUrl: string | null;
  previewGeneratedAt: string | null;
  processingStage: string | null;
  providerVoice: string;
  qualityPreset: TtsQualityPreset;
  sourceName: string | null;
  sourceType: 'pdf' | 'text';
  status:
    | 'cancelled'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'preview_processing'
    | 'preview_queued'
    | 'preview_ready'
    | 'processing'
    | 'queued';
  tokenCost: number;
  updatedAt: string;
  voiceDisplayName: string;
  voiceProfileId: number | null;
  wavDownloadUrl: string | null;
  wordCount: number;
};

type TtsVoiceProfile = {
  createdAt: string;
  displayName: string;
  id: number;
  isDefault: boolean;
  providerSyncError: string | null;
  providerSyncStatus: 'pending' | 'ready';
  providerSyncedAt: string | null;
  referenceAudioDownloadUrl: string | null;
  referenceAudioFileSizeBytes: number | null;
  referenceNormalizedAt: string | null;
  referenceQualityWarnings: string[];
  referenceAudioSeconds: number | null;
  referenceSampleRate: number | null;
  referenceText: string;
  testPreviewAudioSeconds: number | null;
  testPreviewAudioUrl: string | null;
  testPreviewGeneratedAt: string | null;
  updatedAt: string;
};

type TtsVoiceProfileLimits = {
  maxActiveProfiles: number;
  maxAudioBytes: number;
  maxAudioSeconds: number;
  minAudioSeconds: number;
};

type TtsQualityPreset = 'high_mp3_wav' | 'premium_mp3_wav' | 'standard_mp3_wav' | 'wav_only';

const recommendedVoiceReferenceScript =
  'আমি এখন আমার স্বাভাবিক কণ্ঠে একটি ছোট লেখা পড়ছি। এই রেকর্ডিংটি পরিষ্কারভাবে করা হয়েছে, যাতে আমার কণ্ঠের স্বর, গতি, উচ্চারণ এবং বিরতির ধরন বোঝা যায়। আমি বাংলায় কথা বলছি, তবে প্রয়োজন হলে কিছু ইংরেজি শব্দও স্বাভাবিকভাবে উচ্চারণ করতে পারি। প্রতিদিন আমরা কাজ, শিক্ষা, পরিবার, প্রযুক্তি এবং যোগাযোগের জন্য কণ্ঠ ব্যবহার করি। একটি ভালো কণ্ঠস্বর শুধু শব্দ নয়, অনুভূতি, ভরসা এবং স্পষ্টতা বহন করে। আমি বাক্যের শেষে একটু থামছি, কমার পরে ছোট বিরতি নিচ্ছি, এবং প্রতিটি শব্দ যতটা সম্ভব পরিষ্কারভাবে বলছি। আজকের আবহাওয়া সুন্দর, সকাল থেকে আকাশ পরিষ্কার, আর চারপাশ শান্ত। আমি চাই এই কণ্ঠ ভবিষ্যতে গল্প, সংবাদ, বিজ্ঞাপন, শিক্ষা, নির্দেশনা এবং অডিও বইয়ের জন্য ব্যবহার করা যাক। ধন্যবাদ, এই ছিল আমার কণ্ঠের নমুনা।';

const ttsQualityOptions: Array<{
  description: string;
  label: string;
  mp3BitrateKbps: number | null;
  value: TtsQualityPreset;
}> = [
  {
    description: 'Best customer download package.',
    label: 'Premium MP3 320 kbps + WAV',
    mp3BitrateKbps: 320,
    value: 'premium_mp3_wav',
  },
  {
    description: 'Smaller MP3 with high-quality WAV retained.',
    label: 'High MP3 192 kbps + WAV',
    mp3BitrateKbps: 192,
    value: 'high_mp3_wav',
  },
  {
    description: 'Compact MP3 with WAV retained.',
    label: 'Standard MP3 128 kbps + WAV',
    mp3BitrateKbps: 128,
    value: 'standard_mp3_wav',
  },
  {
    description: 'Only stores the original generated WAV.',
    label: 'WAV only',
    mp3BitrateKbps: null,
    value: 'wav_only',
  },
];

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
  | `/dashboard/jobs/${number}`
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
  const pathname = /^\/dashboard\/jobs\/\d+$/.test(window.location.pathname)
    ? (window.location.pathname as CustomerRoute)
    : publicRoutes.has(window.location.pathname as CustomerRoute)
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
  if (mode === 'sample') {
    return '/dashboard';
  }

  const params = new URLSearchParams();

  if (mode === 'pilot') {
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

function StatePanel({
  action,
  description,
  icon,
  tone = 'neutral',
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: string;
  tone?: 'error' | 'neutral' | 'success';
}) {
  return (
    <div
      className={cx(
        'rounded-[24px] border p-5',
        tone === 'error' && 'border-[#d8b7a6] bg-[#fbefea] text-[#8d4f37]',
        tone === 'success' && 'border-[#c6d8c9] bg-[#eef8ee] text-[#375f3c]',
        tone === 'neutral' && 'border-[#eadfce] bg-[#faf7f1] text-[#5a514a]',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/75 text-current">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-[#2f343b]">{title}</div>
          <div className="mt-1 text-sm leading-6">{description}</div>
          {action ? <div className="mt-4 flex flex-wrap gap-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function LocalDevelopmentNotice({ channel }: { channel: 'email' | 'phone' }) {
  const deliveryLabel = channel === 'email' ? 'email delivery' : 'SMS delivery';

  return (
    <InlineMessage>
      <strong className="font-semibold text-[#2f343b]">Local development mode.</strong> Real {deliveryLabel} is not
      configured here, so the backend shows a temporary OTP for local testing. Use the OTP shown below to continue.
    </InlineMessage>
  );
}

const textInputClassName =
  'w-full rounded-2xl border border-[#d8cbbe] bg-white px-4 py-3 text-sm text-[#2f343b] outline-none transition placeholder:text-[#9a8e83] focus:border-[#ae6c4a] focus:ring-2 focus:ring-[#e8c6ad]';
const textAreaClassName = `${textInputClassName} min-h-[220px] resize-y`;

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

function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return (
    <textarea
      {...props}
      className={cx(textAreaClassName, className)}
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
        'inline-flex items-center justify-center gap-2 rounded-full bg-[#ae6c4a] px-5 py-3 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70',
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
        'inline-flex items-center justify-center gap-2 rounded-full border border-[#d8cbbe] bg-white/80 px-5 py-3 text-sm font-semibold text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544] disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    />
  );
}

function ConfirmationDialog({
  cancelLabel = 'Keep editing',
  children,
  confirmLabel,
  destructive = false,
  loading = false,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel?: string;
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#181410]/45 px-4 py-5 backdrop-blur-sm sm:items-center">
      <section
        aria-modal="true"
        className="w-full max-w-lg rounded-[28px] border border-[#ddcfbe] bg-[#fffaf4] p-5 shadow-[0_28px_80px_rgba(24,20,16,0.28)] sm:p-6"
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <div
            className={cx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              destructive ? 'bg-[#fbefea] text-[#8d4f37]' : 'bg-[#efe2d1] text-[#8d5d45]',
            )}
          >
            {destructive ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-[#2f343b]">{title}</h2>
            <div className="mt-2 text-sm leading-7 text-[#64584f]">{children}</div>
          </div>
          <button
            aria-label="Close confirmation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d8cbbe] bg-white text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544]"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton disabled={loading} onClick={onCancel} type="button">
            {cancelLabel}
          </SecondaryButton>
          <PrimaryButton
            className={cx(destructive && 'bg-[#8d4f37]')}
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : destructive ? <X className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {confirmLabel}
          </PrimaryButton>
        </div>
      </section>
    </div>
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
                ? 'Your payment has been confirmed and the package or minute balance has been updated.'
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
    fullName: '',
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
        <TextInput autoComplete="name" placeholder="Full name" required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
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
  const [localDevelopmentCode, setLocalDevelopmentCode] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sendEmailCode = useCallback(async () => {
    const payload = await apiRequest<{ verification: { preview: string | null } }>('/api/auth/send-email-otp', {
      method: 'POST',
    });

    return {
      localPreview: Boolean(payload.verification.preview),
      message: payload.verification.preview ? `Email OTP for local testing: ${payload.verification.preview}` : 'Email code sent.',
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await sendEmailCode();
        if (active) {
          setLocalDevelopmentCode(result.localPreview);
          setMessage(result.message);
        }
      } catch (error) {
        if (active) {
          setLocalDevelopmentCode(false);
          setMessage(error instanceof Error ? error.message : 'Failed to send email code.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [sendEmailCode]);

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
    setLocalDevelopmentCode(false);
    try {
      const result = await sendEmailCode();
      setLocalDevelopmentCode(result.localPreview);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to resend email code.');
    }
  };

  return (
    <AuthCard description="Email verification is required before sample access is enabled." onNavigate={onNavigate} title="Verify your email.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Email verification</h2>
      <form className="mt-8 space-y-4" onSubmit={handleVerify}>
        <TextInput placeholder="6-digit code" value={otp} onChange={(event) => setOtp(event.target.value)} />
        {localDevelopmentCode ? <LocalDevelopmentNotice channel="email" /> : null}
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
  const [localDevelopmentCode, setLocalDevelopmentCode] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sendPhoneCode = useCallback(async () => {
    const payload = await apiRequest<{ verification: { preview: string | null } }>('/api/auth/send-phone-otp', {
      method: 'POST',
    });

    return {
      localPreview: Boolean(payload.verification.preview),
      message: payload.verification.preview ? `Phone OTP for local testing: ${payload.verification.preview}` : 'Phone code sent.',
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await sendPhoneCode();
        if (active) {
          setLocalDevelopmentCode(result.localPreview);
          setMessage(result.message);
        }
      } catch (error) {
        if (active) {
          setLocalDevelopmentCode(false);
          setMessage(error instanceof Error ? error.message : 'Failed to send phone code.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [sendPhoneCode]);

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
    setLocalDevelopmentCode(false);
    try {
      const result = await sendPhoneCode();
      setLocalDevelopmentCode(result.localPreview);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to resend phone code.');
    }
  };

  return (
    <AuthCard description="Phone verification completes account activation for sample usage and dashboard access." onNavigate={onNavigate} title="Verify your phone number.">
      <h2 className="text-2xl font-bold text-[#2f343b]">Phone verification</h2>
      <form className="mt-8 space-y-4" onSubmit={handleVerify}>
        <TextInput placeholder="6-digit code" value={otp} onChange={(event) => setOtp(event.target.value)} />
        {localDevelopmentCode ? <LocalDevelopmentNotice channel="phone" /> : null}
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

type DashboardTab = 'create' | 'history' | 'voices';
type VoiceReferenceInputMode = 'record' | 'upload';
type VoiceFileSource = 'recorded' | 'uploaded';
type VoiceRecordingState = 'idle' | 'recording' | 'requesting';
type VoiceScriptMode = 'custom' | 'recommended';

type VoiceRecordingSession = {
  audioContext: AudioContext;
  chunks: Float32Array[];
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  startedAt: number;
  stopTimer: number | null;
  stream: MediaStream;
};

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function countWordsForDashboardPreview(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).filter(Boolean).length;
}

function estimateMinutesFromWords(wordCount: number) {
  return wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 150)) : 0;
}

function estimateProcessingSecondsFromWords(wordCount: number, qualityPreset: TtsQualityPreset) {
  if (wordCount <= 0) {
    return 0;
  }

  const estimatedChunks = Math.max(1, Math.ceil(wordCount / 175));
  const estimatedAudioMinutes = estimateMinutesFromWords(wordCount);
  const mp3ConversionSeconds = qualityPreset === 'wav_only' ? 0 : Math.max(8, estimatedAudioMinutes * 5);

  return Math.max(35, Math.ceil(20 + estimatedChunks * 22 + mp3ConversionSeconds));
}

function estimatePreviewSecondsFromWords(wordCount: number) {
  if (wordCount <= 0) {
    return 35;
  }

  const previewWordCount = Math.min(wordCount, 85);
  return Math.max(30, Math.ceil(18 + Math.ceil(previewWordCount / 90) * 18));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return 'Not available';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function formatCountdown(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  if (minutes <= 0) {
    return `0:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getTtsQualityOption(value: TtsQualityPreset) {
  return ttsQualityOptions.find((option) => option.value === value) ?? ttsQualityOptions[0];
}

function isActiveTtsJob(job: TtsGenerationJob) {
  return (
    job.status === 'queued' ||
    job.status === 'processing' ||
    job.status === 'preview_queued' ||
    job.status === 'preview_processing' ||
    job.status === 'cancelling'
  );
}

function canCancelTtsJob(job: TtsGenerationJob) {
  return job.status === 'queued' || job.status === 'processing' || job.status === 'preview_queued' || job.status === 'preview_processing';
}

function canDeleteTtsJob(job: TtsGenerationJob) {
  return !isActiveTtsJob(job);
}

function isPreviewTtsJob(job: TtsGenerationJob) {
  return job.status === 'preview_queued' || job.status === 'preview_processing';
}

function formatMinuteEstimate(minutes: number) {
  if (minutes <= 0) {
    return 'No billable minutes yet';
  }

  return `${minutes.toLocaleString()} minute${minutes === 1 ? '' : 's'}`;
}

function getBillingExplanation(qualityPreset: TtsQualityPreset) {
  const quality = getTtsQualityOption(qualityPreset);

  if (quality.value === 'wav_only') {
    return 'Preview is free. Full generation is billed only after the WAV finishes successfully.';
  }

  return `Preview is free. Full generation is billed only after the WAV and ${quality.mp3BitrateKbps} kbps MP3 finish successfully.`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024)).toLocaleString()} MB`;
  }

  return `${Math.ceil(bytes / 1024).toLocaleString()} KB`;
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(sampleCount);
  let offset = 0;

  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let outputOffset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(outputOffset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    outputOffset += bytesPerSample;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function getActiveJobEstimateSeconds(job: TtsGenerationJob) {
  if (isPreviewTtsJob(job)) {
    return estimatePreviewSecondsFromWords(job.wordCount);
  }

  if (job.status === 'cancelling') {
    return Math.max(30, estimatePreviewSecondsFromWords(Math.min(job.wordCount, 120)));
  }

  return estimateProcessingSecondsFromWords(job.wordCount, job.qualityPreset);
}

function getStageProgressWindow(job: TtsGenerationJob) {
  if (job.status === 'queued' || job.status === 'preview_queued') {
    return { max: 15, min: 5 };
  }

  if (job.status === 'cancelling') {
    return { max: 98, min: 92 };
  }

  switch (job.processingStage) {
    case 'starting':
    case 'preparing_preview':
      return { max: 25, min: 12 };
    case 'calling_provider':
      return { max: 82, min: 22 };
    case 'merging_wav':
      return { max: 90, min: 82 };
    case 'converting_mp3':
      return { max: 96, min: 90 };
    default:
      return { max: 82, min: 18 };
  }
}

function getFriendlyProcessingStage(job: TtsGenerationJob) {
  if (job.status === 'queued') {
    return 'Waiting for processing to start';
  }

  if (job.status === 'preview_queued') {
    return 'Waiting for preview generation';
  }

  if (job.status === 'cancelling') {
    return 'Cancelling after the current audio chunk';
  }

  switch (job.processingStage) {
    case 'preparing_preview':
      return 'Preparing the preview';
    case 'starting':
      return 'Preparing the generation job';
    case 'calling_provider':
      return 'Generating voice from text';
    case 'merging_wav':
      return 'Combining WAV audio';
    case 'converting_mp3':
      return 'Creating MP3 download';
    default:
      return job.processingStage ? statusLabel(job.processingStage) : 'Processing audio';
  }
}

function getActiveJobProgress(job: TtsGenerationJob, nowMs: number) {
  const createdAtMs = new Date(job.createdAt).getTime();
  const elapsedSeconds = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.floor((nowMs - createdAtMs) / 1000))
    : 0;
  const estimatedSeconds = getActiveJobEstimateSeconds(job);
  const remainingSeconds = estimatedSeconds > 0 ? Math.max(0, estimatedSeconds - elapsedSeconds) : 0;
  const { max, min } = getStageProgressWindow(job);
  const timeDrivenPercent = estimatedSeconds > 0
    ? Math.round(Math.min(94, Math.max(4, (elapsedSeconds / estimatedSeconds) * 94)))
    : min;
  const percent = Math.max(min, Math.min(max, timeDrivenPercent));

  return {
    elapsedSeconds,
    estimatedSeconds,
    isOverEstimate: estimatedSeconds > 0 && elapsedSeconds > estimatedSeconds,
    percent,
    remainingSeconds,
  };
}

function ActiveTtsJobProgress({ job, nowMs }: { job: TtsGenerationJob; nowMs: number }) {
  const progress = getActiveJobProgress(job, nowMs);
  const stageLabel = getFriendlyProcessingStage(job);
  const phaseLabel = isPreviewTtsJob(job) ? 'Free preview' : job.status === 'cancelling' ? 'Stopping job' : 'Full audio';

  return (
    <div className="mt-4 rounded-2xl border border-[#eadfce] bg-white/75 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#efe2d1] px-3 py-1 text-xs font-semibold text-[#8d5d45]">
              <Clock3 className="h-3.5 w-3.5" />
              {phaseLabel}
            </span>
            <span className="text-sm font-semibold text-[#2f343b]">{stageLabel}</span>
          </div>
          <div className="mt-2 text-xs leading-5 text-[#746960]">
            {progress.isOverEstimate
              ? 'This is past the estimate, but it is still actively processing. Large text and provider response time can extend the wait.'
              : `Estimated finish in ${formatCountdown(progress.remainingSeconds)}. The page refreshes this job automatically.`}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#64584f] sm:min-w-[330px] sm:text-right">
          <div>
            <div className="font-semibold text-[#2f343b]">{formatCountdown(progress.elapsedSeconds)}</div>
            <div>Elapsed</div>
          </div>
          <div>
            <div className="font-semibold text-[#2f343b]">{formatCountdown(progress.estimatedSeconds)}</div>
            <div>Estimate</div>
          </div>
          <div>
            <div className="font-semibold text-[#2f343b]">
              {progress.isOverEstimate ? 'Still working' : formatCountdown(progress.remainingSeconds)}
            </div>
            <div>Remaining</div>
          </div>
        </div>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="mt-4 h-3 overflow-hidden rounded-full bg-[#eadfce]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-[#ae6c4a] transition-[width] duration-700 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-col gap-1 text-xs text-[#746960] sm:flex-row sm:items-center sm:justify-between">
        <span>{progress.percent}% estimated progress</span>
        <span>{isPreviewTtsJob(job) ? 'Preview uses the opening section only' : `Based on ${job.wordCount.toLocaleString()} words`}</span>
      </div>
    </div>
  );
}

export function CustomerDashboardPage({
  onNavigate,
  onSessionRefresh,
  user,
}: {
  onNavigate: (href: string, replace?: boolean) => void;
  onSessionRefresh?: () => Promise<void> | void;
  user: CustomerUser;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('create');
  const [jobs, setJobs] = useState<TtsGenerationJob[]>([]);
  const jobsRef = useRef<TtsGenerationJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [jobActionError, setJobActionError] = useState('');
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [retryError, setRetryError] = useState('');
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);
  const [startingJobId, setStartingJobId] = useState<number | null>(null);
  const [confirmJobAction, setConfirmJobAction] = useState<null | { job: TtsGenerationJob; type: 'cancel' | 'delete' | 'start' }>(null);
  const [sourceType, setSourceType] = useState<'pdf' | 'text'>('text');
  const [qualityPreset, setQualityPreset] = useState<TtsQualityPreset>('premium_mp3_wav');
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState('fixed');
  const [sourceName, setSourceName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfResetKey, setPdfResetKey] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voiceProfiles, setVoiceProfiles] = useState<TtsVoiceProfile[]>([]);
  const [voiceProfileLimits, setVoiceProfileLimits] = useState<TtsVoiceProfileLimits>({
    maxActiveProfiles: 3,
    maxAudioBytes: 16 * 1024 * 1024,
    maxAudioSeconds: 120,
    minAudioSeconds: 1,
  });
  const [voiceProfilesLoading, setVoiceProfilesLoading] = useState(true);
  const [voiceProfilesError, setVoiceProfilesError] = useState('');
  const [voiceActionError, setVoiceActionError] = useState('');
  const [voiceActionMessage, setVoiceActionMessage] = useState('');
  const [voiceActionId, setVoiceActionId] = useState<number | null>(null);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const [voiceScriptMode, setVoiceScriptMode] = useState<VoiceScriptMode>('recommended');
  const [customScriptConfirmed, setCustomScriptConfirmed] = useState(false);
  const [voiceForm, setVoiceForm] = useState({
    name: '',
    referenceText: recommendedVoiceReferenceScript,
    setDefault: false,
  });
  const [voiceReferenceMode, setVoiceReferenceMode] = useState<VoiceReferenceInputMode>('upload');
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceFileSource, setVoiceFileSource] = useState<VoiceFileSource | null>(null);
  const [voiceFileResetKey, setVoiceFileResetKey] = useState(0);
  const [voiceRecordingState, setVoiceRecordingState] = useState<VoiceRecordingState>('idle');
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [recordedVoiceDuration, setRecordedVoiceDuration] = useState<number | null>(null);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(null);
  const voiceProfilesLoadedRef = useRef(false);
  const recordedVoiceUrlRef = useRef<string | null>(null);
  const voiceRecordingRef = useRef<VoiceRecordingSession | null>(null);

  const estimatedWordCount = useMemo(
    () => (sourceType === 'text' ? countWordsForDashboardPreview(textInput) : 0),
    [sourceType, textInput],
  );
  const estimatedMinuteCost = estimateMinutesFromWords(estimatedWordCount);
  const estimatedPreviewSeconds = estimatePreviewSecondsFromWords(estimatedWordCount);
  const estimatedProcessingSeconds = estimateProcessingSecondsFromWords(estimatedWordCount, qualityPreset);
  const hasInsufficientMinutes = sourceType === 'text' && estimatedMinuteCost > 0 && user.tokenBalance < estimatedMinuteCost;
  const hasActiveJobs = jobs.some(isActiveTtsJob);
  const isInitialJobsLoading = jobsLoading && jobs.length === 0;
  const selectedQuality = getTtsQualityOption(qualityPreset);
  const readyVoiceProfiles = useMemo(
    () => voiceProfiles.filter((profile) => profile.providerSyncStatus === 'ready'),
    [voiceProfiles],
  );
  const defaultVoiceProfile = readyVoiceProfiles.find((profile) => profile.isDefault) ?? null;
  const selectedVoiceProfile = selectedVoiceProfileId === 'fixed'
    ? null
    : readyVoiceProfiles.find((profile) => String(profile.id) === selectedVoiceProfileId) ?? null;
  const selectedVoiceName = selectedVoiceProfile?.displayName ?? 'Keypillar Bangla Female';
  const canCreateMoreVoiceProfiles = voiceProfiles.length < voiceProfileLimits.maxActiveProfiles;
  const isVoiceRecording = voiceRecordingState === 'recording';
  const isVoiceRecordingBusy = voiceRecordingState !== 'idle';
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadJobs = useCallback(async () => {
    setJobsRefreshing(true);

    try {
      const payload = await apiRequest<{ jobs: TtsGenerationJob[] }>('/api/tts/jobs');
      const previousJobs = jobsRef.current;
      const finishedActiveJob = payload.jobs.some((job) => {
        if (isActiveTtsJob(job)) {
          return false;
        }

        return previousJobs.some(
          (existingJob) =>
            existingJob.id === job.id &&
            isActiveTtsJob(existingJob),
        );
      });

      jobsRef.current = payload.jobs;
      setJobs(payload.jobs);
      setJobsError('');

      if (finishedActiveJob) {
        void onSessionRefresh?.();
      }
    } catch (nextError) {
      setJobsError(nextError instanceof Error ? nextError.message : 'Failed to load audio generation jobs.');
    } finally {
      setJobsLoading(false);
      setJobsRefreshing(false);
    }
  }, [onSessionRefresh]);

  const loadVoiceProfiles = useCallback(async () => {
    setVoiceProfilesLoading(true);

    try {
      const payload = await apiRequest<{
        limits: TtsVoiceProfileLimits;
        voiceProfiles: TtsVoiceProfile[];
      }>('/api/tts/voice-profiles');

      setVoiceProfiles(payload.voiceProfiles);
      setVoiceProfileLimits(payload.limits);
      setVoiceProfilesError('');
      const hadLoadedVoiceProfiles = voiceProfilesLoadedRef.current;
      setSelectedVoiceProfileId((current) => {
        if (
          current !== 'fixed'
          && payload.voiceProfiles.some((profile) => String(profile.id) === current && profile.providerSyncStatus === 'ready')
        ) {
          return current;
        }

        if (current === 'fixed' && hadLoadedVoiceProfiles) {
          return 'fixed';
        }

        const defaultProfile = payload.voiceProfiles.find((profile) => profile.isDefault && profile.providerSyncStatus === 'ready');
        return defaultProfile ? String(defaultProfile.id) : 'fixed';
      });
      voiceProfilesLoadedRef.current = true;
    } catch (nextError) {
      setVoiceProfilesError(nextError instanceof Error ? nextError.message : 'Failed to load your custom voices.');
    } finally {
      setVoiceProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    jobsRef.current = [];
    setJobs([]);
    setJobsLoading(true);
    void loadJobs();
  }, [loadJobs, user.id]);

  useEffect(() => {
    voiceProfilesLoadedRef.current = false;
    setVoiceProfiles([]);
    setSelectedVoiceProfileId('fixed');
    setVoiceProfilesLoading(true);
    void loadVoiceProfiles();
  }, [loadVoiceProfiles, user.id]);

  useEffect(() => {
    if (!hasActiveJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadJobs();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [hasActiveJobs, loadJobs]);

  useEffect(() => {
    if (!hasActiveJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  const setRecordedReferenceUrl = useCallback((nextUrl: string | null) => {
    if (recordedVoiceUrlRef.current) {
      window.URL.revokeObjectURL(recordedVoiceUrlRef.current);
    }

    recordedVoiceUrlRef.current = nextUrl;
    setRecordedVoiceUrl(nextUrl);
  }, []);

  const clearRecordedReference = useCallback(() => {
    setRecordedReferenceUrl(null);
    setRecordedVoiceDuration(null);
  }, [setRecordedReferenceUrl]);

  const cleanupVoiceRecordingSession = useCallback((session: VoiceRecordingSession) => {
    session.processor.onaudioprocess = null;
    session.source.disconnect();
    session.processor.disconnect();

    if (session.stopTimer !== null) {
      window.clearTimeout(session.stopTimer);
    }

    session.stream.getTracks().forEach((track) => track.stop());
    void session.audioContext.close().catch(() => undefined);
  }, []);

  const discardVoiceRecording = useCallback(() => {
    const session = voiceRecordingRef.current;

    if (session) {
      voiceRecordingRef.current = null;
      cleanupVoiceRecordingSession(session);
    }

    setVoiceRecordingState('idle');
    setVoiceRecordingSeconds(0);
  }, [cleanupVoiceRecordingSession]);

  const stopVoiceRecording = useCallback(() => {
    const session = voiceRecordingRef.current;

    if (!session) {
      return;
    }

    voiceRecordingRef.current = null;
    cleanupVoiceRecordingSession(session);
    setVoiceRecordingState('idle');
    setVoiceRecordingSeconds(0);

    const samples = mergeAudioChunks(session.chunks);
    const durationSeconds = samples.length / session.audioContext.sampleRate;

    if (durationSeconds < voiceProfileLimits.minAudioSeconds) {
      setVoiceActionError(`Record at least ${voiceProfileLimits.minAudioSeconds} second before creating a custom voice.`);
      return;
    }

    const wavBlob = encodeWav(samples, session.audioContext.sampleRate);
    const wavFile = new File([wavBlob], `recorded-reference-${Date.now()}.wav`, { type: 'audio/wav' });
    const nextUrl = window.URL.createObjectURL(wavBlob);

    setRecordedReferenceUrl(nextUrl);
    setRecordedVoiceDuration(durationSeconds);
    setVoiceFile(wavFile);
    setVoiceFileSource('recorded');
    setVoiceFileResetKey((current) => current + 1);
    setVoiceActionError('');
    setVoiceActionMessage(`Recorded ${formatDuration(durationSeconds)} reference WAV. Create the profile when the reference text matches this recording.`);
  }, [cleanupVoiceRecordingSession, setRecordedReferenceUrl, voiceProfileLimits.minAudioSeconds]);

  const startVoiceRecording = useCallback(async () => {
    if (!canCreateMoreVoiceProfiles || voiceSubmitting) {
      return;
    }

    discardVoiceRecording();
    clearRecordedReference();
    setVoiceFile(null);
    setVoiceFileSource(null);
    setVoiceFileResetKey((current) => current + 1);
    setVoiceActionError('');
    setVoiceActionMessage('');
    setVoiceRecordingSeconds(0);
    setVoiceRecordingState('requesting');

    try {
      const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;

      if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) {
        throw new Error('Microphone recording is not available in this browser.');
      }

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: false,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setVoiceActionMessage('This browser could not provide raw microphone input. Record in a quiet room and keep headphones or speakers silent.');
      }
      const audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const session: VoiceRecordingSession = {
        audioContext,
        chunks: [],
        processor,
        source,
        startedAt: Date.now(),
        stopTimer: null,
        stream,
      };

      processor.onaudioprocess = (event) => {
        session.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        event.outputBuffer.getChannelData(0).fill(0);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      await audioContext.resume();

      voiceRecordingRef.current = session;
      session.stopTimer = window.setTimeout(() => {
        stopVoiceRecording();
      }, voiceProfileLimits.maxAudioSeconds * 1000);
      setVoiceRecordingState('recording');
    } catch (nextError) {
      discardVoiceRecording();
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Unable to start microphone recording.');
    }
  }, [
    canCreateMoreVoiceProfiles,
    clearRecordedReference,
    discardVoiceRecording,
    stopVoiceRecording,
    voiceProfileLimits.maxAudioSeconds,
    voiceSubmitting,
  ]);

  const handleVoiceReferenceModeChange = useCallback((mode: VoiceReferenceInputMode) => {
    if (mode === voiceReferenceMode) {
      return;
    }

    discardVoiceRecording();
    setVoiceReferenceMode(mode);
    setVoiceActionError('');
    setVoiceActionMessage('');

    if (mode === 'upload') {
      if (voiceFileSource === 'recorded') {
        setVoiceFile(null);
      }
      clearRecordedReference();
    }

    if (mode === 'record' && voiceFileSource === 'uploaded') {
      setVoiceFile(null);
      setVoiceFileSource(null);
      setVoiceFileResetKey((current) => current + 1);
    }
  }, [clearRecordedReference, discardVoiceRecording, voiceFileSource, voiceReferenceMode]);

  useEffect(() => {
    if (!isVoiceRecording) {
      return;
    }

    const timer = window.setInterval(() => {
      const session = voiceRecordingRef.current;
      setVoiceRecordingSeconds(session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0);
    }, 250);

    return () => window.clearInterval(timer);
  }, [isVoiceRecording]);

  useEffect(() => {
    return () => {
      const session = voiceRecordingRef.current;

      if (session) {
        voiceRecordingRef.current = null;
        cleanupVoiceRecordingSession(session);
      }

      if (recordedVoiceUrlRef.current) {
        window.URL.revokeObjectURL(recordedVoiceUrlRef.current);
      }
    };
  }, [cleanupVoiceRecordingSession]);

  const resetCreateForm = () => {
    setSourceName('');
    setTextInput('');
    setPdfFile(null);
    setPdfResetKey((current) => current + 1);
  };

  const handleRefreshJobs = () => {
    if (jobs.length === 0) {
      setJobsLoading(true);
    }

    void loadJobs();
  };

  const resetVoiceForm = () => {
    discardVoiceRecording();
    clearRecordedReference();
    setVoiceScriptMode('recommended');
    setCustomScriptConfirmed(false);
    setVoiceForm({
      name: '',
      referenceText: recommendedVoiceReferenceScript,
      setDefault: false,
    });
    setVoiceReferenceMode('upload');
    setVoiceFile(null);
    setVoiceFileSource(null);
    setVoiceFileResetKey((current) => current + 1);
  };

  const handleVoiceScriptModeChange = (mode: VoiceScriptMode) => {
    setVoiceScriptMode(mode);
    setCustomScriptConfirmed(false);
    setVoiceActionError('');
    setVoiceActionMessage('');
    discardVoiceRecording();
    clearRecordedReference();
    setVoiceFile(null);
    setVoiceFileSource(null);
    setVoiceFileResetKey((current) => current + 1);

    if (mode === 'recommended') {
      setVoiceForm((current) => ({
        ...current,
        referenceText: recommendedVoiceReferenceScript,
      }));
    } else {
      setVoiceForm((current) => ({
        ...current,
        referenceText: current.referenceText === recommendedVoiceReferenceScript ? '' : current.referenceText,
      }));
    }
  };

  const handleVoiceProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVoiceSubmitting(true);
    setVoiceActionError('');
    setVoiceActionMessage('');

    try {
      if (!voiceForm.name.trim()) {
        throw new Error('Enter a name for this custom voice.');
      }

      if (!voiceForm.referenceText.trim()) {
        throw new Error('Use the recommended script or paste the exact reference text spoken in the WAV.');
      }

      if (voiceScriptMode === 'custom' && !customScriptConfirmed) {
        throw new Error('Confirm that the WAV says exactly the custom script before creating the voice.');
      }

      if (isVoiceRecordingBusy) {
        throw new Error('Stop the microphone recording before creating the custom voice.');
      }

      if (!voiceFile) {
        throw new Error('Upload or record a WAV reference file.');
      }

      if (!voiceFile.name.toLowerCase().endsWith('.wav')) {
        throw new Error('Reference audio must be a WAV file.');
      }

      if (voiceFile.size > voiceProfileLimits.maxAudioBytes) {
        throw new Error(`Reference WAV files must stay under ${formatBytes(voiceProfileLimits.maxAudioBytes)}.`);
      }

      const formData = new FormData();
      formData.append('file', voiceFile);
      formData.append('name', voiceForm.name.trim());
      formData.append('referenceText', voiceForm.referenceText.trim());
      formData.append('setDefault', String(voiceForm.setDefault));

      const payload = await apiRequest<{
        message?: string;
        voiceProfile: TtsVoiceProfile;
        voiceProfiles: TtsVoiceProfile[];
      }>('/api/tts/voice-profiles', {
        body: formData,
        method: 'POST',
      });

      setVoiceProfiles(payload.voiceProfiles);
      if (payload.voiceProfile.providerSyncStatus === 'ready') {
        setSelectedVoiceProfileId(String(payload.voiceProfile.id));
        setVoiceActionMessage(payload.message ?? 'Custom voice profile created. The reference WAV is saved privately with this account.');
      } else {
        const defaultProfile = payload.voiceProfiles.find((profile) => profile.isDefault && profile.providerSyncStatus === 'ready');
        setSelectedVoiceProfileId(defaultProfile ? String(defaultProfile.id) : 'fixed');
        setVoiceActionMessage(payload.message ?? 'Reference WAV saved. Retry activation after the Keypillar API is back online.');
      }
      resetVoiceForm();
      await loadVoiceProfiles();
    } catch (nextError) {
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Failed to create the custom voice.');
    } finally {
      setVoiceSubmitting(false);
    }
  };

  const handleSyncVoiceProfile = async (profileId: number) => {
    setVoiceActionId(profileId);
    setVoiceActionError('');
    setVoiceActionMessage('');

    try {
      const payload = await apiRequest<{
        voiceProfile: TtsVoiceProfile;
        voiceProfiles: TtsVoiceProfile[];
      }>(`/api/tts/voice-profiles/${profileId}/sync`, {
        method: 'POST',
      });
      setVoiceProfiles(payload.voiceProfiles);
      setSelectedVoiceProfileId(String(payload.voiceProfile.id));
      setVoiceActionMessage('Custom voice activated. You can now use it in the generation voice selector.');
    } catch (nextError) {
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Failed to activate the custom voice.');
    } finally {
      setVoiceActionId(null);
    }
  };

  const handleGenerateVoiceTestPreview = async (profileId: number) => {
    setVoiceActionId(profileId);
    setVoiceActionError('');
    setVoiceActionMessage('');

    try {
      const payload = await apiRequest<{
        voiceProfile: TtsVoiceProfile;
        voiceProfiles: TtsVoiceProfile[];
      }>(`/api/tts/voice-profiles/${profileId}/test-preview`, {
        method: 'POST',
      });
      setVoiceProfiles(payload.voiceProfiles);
      setSelectedVoiceProfileId(String(payload.voiceProfile.id));
      setVoiceActionMessage('Test preview generated. Play it below to check whether this custom voice sounds right.');
    } catch (nextError) {
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Failed to generate the custom voice test preview.');
    } finally {
      setVoiceActionId(null);
    }
  };

  const handleSetDefaultVoiceProfile = async (profileId: number) => {
    setVoiceActionId(profileId);
    setVoiceActionError('');
    setVoiceActionMessage('');

    try {
      const payload = await apiRequest<{ voiceProfiles: TtsVoiceProfile[] }>(`/api/tts/voice-profiles/${profileId}/default`, {
        method: 'POST',
      });
      setVoiceProfiles(payload.voiceProfiles);
      setSelectedVoiceProfileId(String(profileId));
      setVoiceActionMessage('Default custom voice updated.');
    } catch (nextError) {
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Failed to set default custom voice.');
    } finally {
      setVoiceActionId(null);
    }
  };

  const handleDeactivateVoiceProfile = async (profileId: number) => {
    setVoiceActionId(profileId);
    setVoiceActionError('');
    setVoiceActionMessage('');

    try {
      const payload = await apiRequest<{ deactivatedId: number; voiceProfiles: TtsVoiceProfile[] }>(`/api/tts/voice-profiles/${profileId}/deactivate`, {
        method: 'POST',
      });
      setVoiceProfiles(payload.voiceProfiles);
      setSelectedVoiceProfileId((current) => {
        if (current !== String(profileId)) {
          return current;
        }

        const defaultProfile = payload.voiceProfiles.find((profile) => profile.isDefault && profile.providerSyncStatus === 'ready');
        return defaultProfile ? String(defaultProfile.id) : 'fixed';
      });
      setVoiceActionMessage('Custom voice profile deleted.');
    } catch (nextError) {
      setVoiceActionError(nextError instanceof Error ? nextError.message : 'Failed to delete the custom voice.');
    } finally {
      setVoiceActionId(null);
    }
  };

  const handleRetryJob = async (jobId: number) => {
    setRetryingJobId(jobId);
    setRetryError('');
    setJobActionError('');

    try {
      const payload = await apiRequest<{ job: TtsGenerationJob; tokenBalance: number }>(`/api/tts/jobs/${jobId}/retry`, {
        method: 'POST',
      });

      setJobs((currentJobs) => {
        const nextJobs = currentJobs.map((job) => (job.id === payload.job.id ? payload.job : job));
        jobsRef.current = nextJobs;
        return nextJobs;
      });
      await Promise.all([loadJobs(), Promise.resolve(onSessionRefresh?.())]);
    } catch (nextError) {
      setRetryError(nextError instanceof Error ? nextError.message : 'Failed to retry the audio generation job.');
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleStartFullGeneration = async (jobId: number) => {
    setStartingJobId(jobId);
    setJobActionError('');

    try {
      const payload = await apiRequest<{ job: TtsGenerationJob; tokenBalance: number }>(`/api/tts/jobs/${jobId}/start`, {
        method: 'POST',
      });

      setJobs((currentJobs) => {
        const nextJobs = currentJobs.map((job) => (job.id === payload.job.id ? payload.job : job));
        jobsRef.current = nextJobs;
        return nextJobs;
      });
      await Promise.all([loadJobs(), Promise.resolve(onSessionRefresh?.())]);
    } catch (nextError) {
      setJobActionError(nextError instanceof Error ? nextError.message : 'Failed to start full audio generation.');
    } finally {
      setStartingJobId(null);
    }
  };

  const handleCancelJob = async (jobId: number) => {
    setCancellingJobId(jobId);
    setJobActionError('');

    try {
      const payload = await apiRequest<{ job: TtsGenerationJob }>(`/api/tts/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      setJobs((currentJobs) => {
        const nextJobs = currentJobs.map((job) => (job.id === payload.job.id ? payload.job : job));
        jobsRef.current = nextJobs;
        return nextJobs;
      });
      await Promise.all([loadJobs(), Promise.resolve(onSessionRefresh?.())]);
    } catch (nextError) {
      setJobActionError(nextError instanceof Error ? nextError.message : 'Failed to cancel the audio generation job.');
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    setDeletingJobId(jobId);
    setJobActionError('');

    try {
      await apiRequest<{ deleted: boolean; jobId: number }>(`/api/tts/jobs/${jobId}`, {
        method: 'DELETE',
      });

      setJobs((currentJobs) => {
        const nextJobs = currentJobs.filter((job) => job.id !== jobId);
        jobsRef.current = nextJobs;
        return nextJobs;
      });
      await loadJobs();
    } catch (nextError) {
      setJobActionError(nextError instanceof Error ? nextError.message : 'Failed to delete the audio generation job.');
    } finally {
      setDeletingJobId(null);
    }
  };

  const requestStartFullGeneration = (job: TtsGenerationJob) => {
    const estimatedMinutes = estimateMinutesFromWords(job.wordCount);

    if (estimatedMinutes > user.tokenBalance) {
      setJobActionError(
        `This job is estimated at ${formatMinuteEstimate(estimatedMinutes)}, but your current balance is ${user.tokenBalance.toLocaleString()}. Add minutes before generating the full audio.`,
      );
      return;
    }

    setConfirmJobAction({ job, type: 'start' });
  };

  const handleConfirmedJobAction = async () => {
    if (!confirmJobAction) {
      return;
    }

    if (confirmJobAction.type === 'start') {
      await handleStartFullGeneration(confirmJobAction.job.id);
    } else if (confirmJobAction.type === 'delete') {
      await handleDeleteJob(confirmJobAction.job.id);
    } else {
      await handleCancelJob(confirmJobAction.job.id);
    }

    setConfirmJobAction(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      if (sourceType === 'text') {
        if (!sourceName.trim()) {
          throw new Error('Enter a title for this text generation.');
        }

        if (!textInput.trim()) {
          throw new Error('Paste the text you want to generate.');
        }

        if (estimatedMinuteCost <= 0) {
          throw new Error('Paste the text you want to generate.');
        }

        await apiRequest<{ job: TtsGenerationJob; tokenBalance: number }>('/api/tts/jobs/text/preview', {
          body: JSON.stringify({
            inputText: textInput,
            qualityPreset,
            sourceName,
            voiceProfileId: selectedVoiceProfileId,
          }),
          method: 'POST',
        });
      } else {
        if (!pdfFile) {
          throw new Error('Upload a PDF file to continue.');
        }

        const formData = new FormData();
        formData.append('file', pdfFile);
        formData.append('qualityPreset', qualityPreset);
        formData.append('voiceProfileId', selectedVoiceProfileId);

        if (sourceName.trim()) {
          formData.append('sourceName', sourceName.trim());
        }

        await apiRequest<{ job: TtsGenerationJob; tokenBalance: number }>('/api/tts/jobs/pdf/preview', {
          body: formData,
          method: 'POST',
        });
      }

      setSubmitMessage(
        sourceType === 'text'
          ? 'Preview job queued. Listen to the preview in history before generating the full audio.'
          : 'PDF preview job queued. Text extraction and preview generation are now running.',
      );
      resetCreateForm();
      setActiveTab('history');
      await Promise.all([loadJobs(), Promise.resolve(onSessionRefresh?.())]);
    } catch (nextError) {
      setSubmitError(nextError instanceof Error ? nextError.message : 'Failed to queue the audio generation job.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-5 sm:py-24">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
            Audio Workspace
          </div>
          <h1 className="mt-5 text-3xl font-bold text-[#2f343b] sm:text-4xl">Create Bangla voice audio</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64584f] sm:text-base">
            Start with a free preview, then approve the full WAV and MP3 generation when the voice sounds right. Billing happens only after the full audio finishes successfully.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={() => onNavigate('/account')} type="button">
            Open account
          </SecondaryButton>
          <SecondaryButton onClick={() => onNavigate('/')} type="button">
            Back to website
          </SecondaryButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="Minute balance" value={user.tokenBalance.toLocaleString()} />
        <DashboardCard label="Package" value={statusLabel(user.packageType)} />
        <DashboardCard label="Email status" value={user.emailVerified ? 'Verified' : 'Pending'} />
        <DashboardCard label="Phone status" value={user.phoneVerified ? 'Verified' : 'Pending'} />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          className={cx(
            'rounded-full px-5 py-3 text-sm font-semibold transition',
            activeTab === 'create'
              ? 'bg-[#ae6c4a] text-[#f8f3ec]'
              : 'border border-[#d8cbbe] bg-white/88 text-[#5a514a] hover:border-[#c7b09e] hover:text-[#a96544]',
          )}
          onClick={() => setActiveTab('create')}
          type="button"
        >
          Create
        </button>
        <button
          className={cx(
            'rounded-full px-5 py-3 text-sm font-semibold transition',
            activeTab === 'history'
              ? 'bg-[#ae6c4a] text-[#f8f3ec]'
              : 'border border-[#d8cbbe] bg-white/88 text-[#5a514a] hover:border-[#c7b09e] hover:text-[#a96544]',
          )}
          onClick={() => setActiveTab('history')}
          type="button"
        >
          History
        </button>
        <button
          className={cx(
            'rounded-full px-5 py-3 text-sm font-semibold transition',
            activeTab === 'voices'
              ? 'bg-[#ae6c4a] text-[#f8f3ec]'
              : 'border border-[#d8cbbe] bg-white/88 text-[#5a514a] hover:border-[#c7b09e] hover:text-[#a96544]',
          )}
          onClick={() => setActiveTab('voices')}
          type="button"
        >
          Create with your voice
        </button>
      </div>

      {activeTab === 'create' ? (
        <section className="mt-6 rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
          <div className="flex flex-wrap gap-3">
            <button
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                sourceType === 'text'
                  ? 'bg-[#2f343b] text-white'
                  : 'border border-[#d8cbbe] bg-[#faf7f1] text-[#5a514a] hover:border-[#c7b09e]',
              )}
              onClick={() => setSourceType('text')}
              type="button"
            >
              Paste text
            </button>
            <button
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                sourceType === 'pdf'
                  ? 'bg-[#2f343b] text-white'
                  : 'border border-[#d8cbbe] bg-[#faf7f1] text-[#5a514a] hover:border-[#c7b09e]',
              )}
              onClick={() => setSourceType('pdf')}
              type="button"
            >
              Upload PDF
            </button>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#4f4740]">
                    {sourceType === 'text' ? 'Title' : 'Title (optional)'}
                  </label>
                  <TextInput
                    placeholder={sourceType === 'text' ? 'Example: June campaign narration' : 'Optional title override'}
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                  />
                </div>

                {sourceType === 'text' ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#4f4740]">Text to generate</label>
                    <TextArea
                      placeholder="Paste Bangla text here"
                      value={textInput}
                      onChange={(event) => setTextInput(event.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#4f4740]">PDF file</label>
                    <input
                      key={pdfResetKey}
                      accept="application/pdf,.pdf"
                      className={textInputClassName}
                      type="file"
                      onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="mt-2 text-sm leading-6 text-[#6f645c]">
                      Text-based PDFs only. Scanned PDFs without extractable text will be rejected.
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#4f4740]">Voice</label>
                  <select
                    className={textInputClassName}
                    value={selectedVoiceProfileId}
                    onChange={(event) => setSelectedVoiceProfileId(event.target.value)}
                  >
                    <option value="fixed">Keypillar Bangla Female</option>
                    {voiceProfiles.map((profile) => (
                      <option
                        key={profile.id}
                        disabled={profile.providerSyncStatus !== 'ready'}
                        value={String(profile.id)}
                      >
                        {profile.displayName}{profile.isDefault ? ' (default)' : ''}{profile.providerSyncStatus === 'pending' ? ' (pending activation)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm leading-6 text-[#6f645c]">
                    Custom voices are private to your account. Provider profile IDs stay on the website backend.
                  </p>
                  {voiceProfilesError ? <div className="mt-2"><InlineMessage tone="error">{voiceProfilesError}</InlineMessage></div> : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#4f4740]">Download quality</label>
                  <select
                    className={textInputClassName}
                    value={qualityPreset}
                    onChange={(event) => setQualityPreset(event.target.value as TtsQualityPreset)}
                  >
                    {ttsQualityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm leading-6 text-[#6f645c]">{selectedQuality.description}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#2f343b]">Job estimate</h2>
                <div className="mt-4 space-y-3 text-sm text-[#64584f]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Source</span>
                    <span className="font-semibold text-[#2f343b]">{sourceType === 'text' ? 'Pasted text' : 'Uploaded PDF'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Word count</span>
                    <span className="font-semibold text-[#2f343b]">
                      {sourceType === 'text' ? estimatedWordCount.toLocaleString() : pdfFile ? 'Calculated after upload' : 'Waiting for file'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Full generation estimate</span>
                    <span className="font-semibold text-[#2f343b]">
                      {sourceType === 'text' ? formatMinuteEstimate(estimatedMinuteCost) : pdfFile ? 'Measured after extraction' : 'Waiting for file'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Preview wait</span>
                    <span className="font-semibold text-[#2f343b]">
                      {sourceType === 'text' && estimatedWordCount > 0
                        ? formatDuration(estimatedPreviewSeconds)
                        : pdfFile
                          ? 'Shown after extraction'
                          : 'Waiting for input'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Full processing</span>
                    <span className="font-semibold text-[#2f343b]">
                      {sourceType === 'text' && estimatedProcessingSeconds > 0
                        ? formatDuration(estimatedProcessingSeconds)
                        : pdfFile
                          ? 'Shown in history after extraction'
                          : 'Waiting for input'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Voice</span>
                    <span className="text-right font-semibold text-[#2f343b]">{selectedVoiceName}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span>Quality</span>
                    <span className="text-right font-semibold text-[#2f343b]">{selectedQuality.label}</span>
                  </div>
                </div>

                {hasInsufficientMinutes ? (
                  <div className="mt-4">
                    <InlineMessage>
                      You can still create the free preview. To generate the full audio, this text is estimated at {formatMinuteEstimate(estimatedMinuteCost)} and your current balance is {user.tokenBalance.toLocaleString()}.
                    </InlineMessage>
                  </div>
                ) : null}

                <div className="mt-4">
                  <InlineMessage tone="success">{getBillingExplanation(qualityPreset)}</InlineMessage>
                </div>

                {submitError ? (
                  <div className="mt-4">
                    <InlineMessage tone="error">{submitError}</InlineMessage>
                  </div>
                ) : null}

                {submitMessage ? (
                  <div className="mt-4">
                    <InlineMessage tone="success">{submitMessage}</InlineMessage>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <PrimaryButton
                    className="w-full justify-center sm:w-auto"
                    disabled={
                      submitting ||
                      (sourceType === 'text' && (!textInput.trim() || !sourceName.trim() || estimatedMinuteCost === 0)) ||
                      (sourceType === 'pdf' && !pdfFile)
                    }
                    type="submit"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio2 className="h-4 w-4" />}
                    {submitting ? 'Queueing preview...' : 'Generate free preview'}
                  </PrimaryButton>
                  <SecondaryButton className="w-full sm:w-auto" onClick={resetCreateForm} type="button">
                    Clear
                  </SecondaryButton>
                </div>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === 'voices' ? (
        <section className="mt-6 rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#2f343b]">Create voice notes with your own voice</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#64584f]">
                Create and manage custom reference voices for this account. Saved reference WAVs are private to your login and provider profile IDs stay on the backend.
              </p>
            </div>
            <div className="rounded-full border border-[#d9c6b2] bg-[#faf7f1] px-4 py-2 text-sm font-semibold text-[#8d5d45]">
              {voiceProfiles.length}/{voiceProfileLimits.maxActiveProfiles} saved
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            <div className="order-2 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#2f343b]">Saved custom voices</h3>
                  <p className="mt-1 text-sm leading-6 text-[#64584f]">
                    Use these saved voices when creating previews or full audio jobs.
                  </p>
                </div>
              </div>
              {voiceProfilesLoading ? (
                <StatePanel
                  description="Loading saved custom voices for this account."
                  icon={<Loader2 className="h-5 w-5 animate-spin" />}
                  title="Loading custom voices"
                />
              ) : null}
              {voiceProfilesError ? (
                <StatePanel
                  action={(
                    <SecondaryButton onClick={() => void loadVoiceProfiles()} type="button">
                      <RefreshCw className="h-4 w-4" />
                      Try again
                    </SecondaryButton>
                  )}
                  description={voiceProfilesError}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  title="Could not load custom voices"
                  tone="error"
                />
              ) : null}
              {!voiceProfilesLoading && !voiceProfilesError && voiceProfiles.length === 0 ? (
                <StatePanel
                  description="The built-in Keypillar Bangla Female voice is always available. Add a custom WAV reference voice when you need account-specific narration."
                  icon={<FileAudio2 className="h-5 w-5" />}
                  title="No custom voices yet"
                />
              ) : null}
              {voiceProfiles.map((profile) => (
                <div key={profile.id} className="rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-[#2f343b]">{profile.displayName}</h3>
                        {profile.isDefault ? (
                          <span className="rounded-full bg-[#e5f4e5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#355f3b]">
                            Default
                          </span>
                        ) : null}
                        {profile.providerSyncStatus === 'pending' ? (
                          <span className="rounded-full bg-[#fff0df] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a5b36]">
                            Pending activation
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-2 text-sm text-[#64584f] sm:grid-cols-2">
                        <div>Reference: {profile.referenceAudioSeconds === null ? 'Not measured' : formatDuration(profile.referenceAudioSeconds)}</div>
                        <div>Sample rate: {profile.referenceSampleRate === null ? 'Not measured' : `${profile.referenceSampleRate.toLocaleString()} Hz`}</div>
                        <div>
                          Saved WAV: {profile.referenceAudioFileSizeBytes === null ? 'Not stored' : formatBytes(profile.referenceAudioFileSizeBytes)}
                        </div>
                        <div>
                          Status: {profile.providerSyncStatus === 'ready' ? 'Ready to use' : 'Saved locally'}
                        </div>
                        <div>
                          Normalized: {profile.referenceNormalizedAt ? 'Yes' : 'Not yet'}
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#5f564f]">{profile.referenceText}</p>
                      {profile.referenceQualityWarnings.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-[#eadfce] bg-white/80 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8d5d45]">Reference quality notes</div>
                          <ul className="mt-2 space-y-1 text-sm leading-6 text-[#64584f]">
                            {profile.referenceQualityWarnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {profile.providerSyncStatus === 'pending' ? (
                        <div className="mt-3">
                          <InlineMessage>
                            {profile.providerSyncError ?? 'The recording is saved here. Retry activation after the Keypillar API is back online.'}
                          </InlineMessage>
                        </div>
                      ) : null}
                      {profile.testPreviewAudioUrl ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-sm font-semibold text-[#2f343b]">
                            Test preview{profile.testPreviewAudioSeconds === null ? '' : ` (${formatDuration(profile.testPreviewAudioSeconds)})`}
                          </div>
                          <audio className="w-full" controls src={profile.testPreviewAudioUrl} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                      {profile.referenceAudioDownloadUrl ? (
                        <a
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#d8cbbe] bg-white/80 px-4 py-2 text-sm font-semibold text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544] sm:w-auto"
                          href={profile.referenceAudioDownloadUrl}
                        >
                          <Download className="h-4 w-4" />
                          Reference WAV
                        </a>
                      ) : null}
                      {profile.providerSyncStatus === 'pending' ? (
                        <SecondaryButton
                          className="w-full px-4 py-2 text-sm sm:w-auto"
                          disabled={voiceActionId === profile.id}
                          onClick={() => void handleSyncVoiceProfile(profile.id)}
                          type="button"
                        >
                          {voiceActionId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Retry activation
                        </SecondaryButton>
                      ) : null}
                      {profile.providerSyncStatus === 'ready' && !profile.isDefault ? (
                        <SecondaryButton
                          className="w-full px-4 py-2 text-sm sm:w-auto"
                          disabled={voiceActionId === profile.id}
                          onClick={() => void handleSetDefaultVoiceProfile(profile.id)}
                          type="button"
                        >
                          {voiceActionId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Set default
                        </SecondaryButton>
                      ) : null}
                      {profile.providerSyncStatus === 'ready' ? (
                        <SecondaryButton
                          className="w-full px-4 py-2 text-sm sm:w-auto"
                          disabled={voiceActionId === profile.id}
                          onClick={() => void handleGenerateVoiceTestPreview(profile.id)}
                          type="button"
                        >
                          {voiceActionId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          Test this voice
                        </SecondaryButton>
                      ) : null}
                      <SecondaryButton
                        className="w-full px-4 py-2 text-sm sm:w-auto"
                        disabled={voiceActionId === profile.id}
                        onClick={() => void handleDeactivateVoiceProfile(profile.id)}
                        type="button"
                      >
                        {voiceActionId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        Delete
                      </SecondaryButton>
                    </div>
                  </div>
                </div>
              ))}
              {voiceActionError ? <InlineMessage tone="error">{voiceActionError}</InlineMessage> : null}
              {voiceActionMessage ? <InlineMessage tone="success">{voiceActionMessage}</InlineMessage> : null}
              {defaultVoiceProfile ? (
                <InlineMessage>
                  New generation forms select {defaultVoiceProfile.displayName} by default. You can still choose Keypillar Bangla Female for any job.
                </InlineMessage>
              ) : null}
            </div>

            <form className="order-1 rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-4 sm:p-6 lg:p-7" onSubmit={handleVoiceProfileSubmit}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#2f343b]">Create a voice from your recording</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64584f]">
                    Upload or record a WAV reference between {voiceProfileLimits.minAudioSeconds}s and {voiceProfileLimits.maxAudioSeconds}s. The reference audio is saved privately with your account after profile creation.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-[#d9c6b2] bg-white/80 px-3 py-1 text-xs font-semibold text-[#8d5d45]">
                  New voice setup
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-[#eadfce] bg-white/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#efe2d1] text-[#9a6041]">
                    <Mic className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#2f343b]">Reference voice quality</div>
                    <p className="mt-1 text-sm leading-6 text-[#64584f]">
                      Upload or record around 1 minute of clear single-speaker Bangla voice in a quiet place, with no music, echo, or background noise.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['About 1 minute', 'Single speaker', 'Quiet place', 'No music or echo'].map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[#ddcfbe] bg-[#faf7f1] px-3 py-1 text-xs font-semibold text-[#5f564f]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {!canCreateMoreVoiceProfiles ? (
                <div className="mt-4">
                  <InlineMessage>
                    You already have {voiceProfileLimits.maxActiveProfiles} active custom voices. Delete one before creating another.
                  </InlineMessage>
                </div>
              ) : null}
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-[#eadfce] bg-white/70 p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ae6c4a] text-sm font-bold text-[#f8f3ec]">1</span>
                    <div>
                      <div className="text-sm font-semibold text-[#2f343b]">Read this script aloud</div>
                      <div className="text-xs leading-5 text-[#6f645c]">Record the exact words shown here so the reference text matches the audio.</div>
                    </div>
                  </div>
                  <label className="mb-2 block text-sm font-semibold text-[#4f4740]">Voice name</label>
                  <TextInput
                    disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                    placeholder="Example: Tanim narration"
                    value={voiceForm.name}
                    onChange={(event) => setVoiceForm((current) => ({ ...current, name: event.target.value }))}
                  />
                  <div className="mt-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="block text-sm font-semibold text-[#4f4740]">Reference script</label>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#d8cbbe] bg-white p-1 sm:min-w-[360px]">
                        <button
                          className={cx(
                            'inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold transition sm:text-sm',
                            voiceScriptMode === 'recommended'
                              ? 'bg-[#ae6c4a] text-[#f8f3ec]'
                              : 'text-[#5a514a] hover:bg-[#f8f3ec]',
                          )}
                          disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                          onClick={() => handleVoiceScriptModeChange('recommended')}
                          type="button"
                        >
                          Recommended script
                        </button>
                        <button
                          className={cx(
                            'inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold transition sm:text-sm',
                            voiceScriptMode === 'custom'
                              ? 'bg-[#ae6c4a] text-[#f8f3ec]'
                              : 'text-[#5a514a] hover:bg-[#f8f3ec]',
                          )}
                          disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                          onClick={() => handleVoiceScriptModeChange('custom')}
                          type="button"
                        >
                          Use my own script
                        </button>
                      </div>
                    </div>

                    {voiceScriptMode === 'recommended' ? (
                      <div className="rounded-2xl border border-[#ddcfbe] bg-[#fffaf4] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-semibold text-[#2f343b]">Read this Bangla script naturally</div>
                          <span className="w-fit rounded-full border border-[#ddcfbe] bg-white px-3 py-1 text-xs font-semibold text-[#8d5d45]">
                            Around 50s to 1m 30s
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-[#3d3935]" lang="bn">
                          {recommendedVoiceReferenceScript}
                        </p>
                        <div className="mt-4 grid gap-2 text-xs font-semibold text-[#6f645c] sm:grid-cols-3">
                          <span className="rounded-full border border-[#eadfce] bg-white px-3 py-2">Read in your natural voice</span>
                          <span className="rounded-full border border-[#eadfce] bg-white px-3 py-2">Keep the room quiet</span>
                          <span className="rounded-full border border-[#eadfce] bg-white px-3 py-2">No music, echo, or noise</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <TextArea
                          className="min-h-[170px]"
                          disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                          placeholder="Paste the exact text spoken in the reference WAV"
                          value={voiceForm.referenceText}
                          onChange={(event) => {
                            setCustomScriptConfirmed(false);
                            setVoiceForm((current) => ({ ...current, referenceText: event.target.value }));
                          }}
                        />
                        <div className="mt-3">
                          <InlineMessage>
                            Make sure the uploaded or recorded WAV says exactly this text. Mismatched text can reduce custom voice quality.
                          </InlineMessage>
                        </div>
                        <label className="mt-3 flex items-start gap-3 rounded-2xl border border-[#eadfce] bg-white/80 px-4 py-3 text-sm font-semibold leading-6 text-[#4f4740]">
                          <input
                            checked={customScriptConfirmed}
                            className="mt-1"
                            disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                            type="checkbox"
                            onChange={(event) => setCustomScriptConfirmed(event.target.checked)}
                          />
                          I confirm the WAV says exactly this custom script.
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#eadfce] bg-white/70 p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ae6c4a] text-sm font-bold text-[#f8f3ec]">2</span>
                    <div>
                      <div className="text-sm font-semibold text-[#2f343b]">Upload or record the WAV</div>
                      <div className="text-xs leading-5 text-[#6f645c]">Read the selected script in a clear, single-speaker Bangla recording.</div>
                    </div>
                  </div>
                  <label className="mb-2 block text-sm font-semibold text-[#4f4740]">Reference WAV</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#d8cbbe] bg-white p-1">
                    <button
                      className={cx(
                        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                        voiceReferenceMode === 'upload'
                          ? 'bg-[#ae6c4a] text-[#f8f3ec]'
                          : 'text-[#5a514a] hover:bg-[#f8f3ec]',
                      )}
                      disabled={!canCreateMoreVoiceProfiles || voiceSubmitting || isVoiceRecordingBusy}
                      onClick={() => handleVoiceReferenceModeChange('upload')}
                      type="button"
                    >
                      <Upload className="h-4 w-4" />
                      Upload WAV
                    </button>
                    <button
                      className={cx(
                        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                        voiceReferenceMode === 'record'
                          ? 'bg-[#ae6c4a] text-[#f8f3ec]'
                          : 'text-[#5a514a] hover:bg-[#f8f3ec]',
                      )}
                      disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                      onClick={() => handleVoiceReferenceModeChange('record')}
                      type="button"
                    >
                      <Mic className="h-4 w-4" />
                      Record
                    </button>
                  </div>

                  {voiceReferenceMode === 'upload' ? (
                    <div className="mt-3">
                      <input
                        key={voiceFileResetKey}
                        accept="audio/wav,audio/x-wav,.wav"
                        className={textInputClassName}
                        disabled={!canCreateMoreVoiceProfiles || voiceSubmitting}
                        type="file"
                        onChange={(event) => {
                          clearRecordedReference();
                          discardVoiceRecording();
                          const nextFile = event.target.files?.[0] ?? null;
                          setVoiceFile(nextFile);
                          setVoiceFileSource(nextFile ? 'uploaded' : null);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-[#d8cbbe] bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#2f343b]">
                            {isVoiceRecording
                              ? `Recording ${formatCountdown(voiceRecordingSeconds)}`
                              : recordedVoiceDuration !== null
                                ? `Recorded ${formatDuration(recordedVoiceDuration)}`
                                : 'Ready to record'}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-[#6f645c]">
                            {voiceProfileLimits.minAudioSeconds}s minimum, {formatCountdown(voiceProfileLimits.maxAudioSeconds)} maximum.
                          </div>
                          <div className="mt-1 text-xs leading-5 text-[#6f645c]">
                            Recording asks the browser for raw mono input with echo cancellation, noise suppression, and auto gain turned off. Keep headphones and speakers silent.
                          </div>
                        </div>
                        {isVoiceRecording ? (
                          <SecondaryButton
                            className="w-full px-4 py-2.5 text-sm sm:w-auto"
                            onClick={stopVoiceRecording}
                            type="button"
                          >
                            <Square className="h-4 w-4" />
                            Stop
                          </SecondaryButton>
                        ) : (
                          <PrimaryButton
                            className="w-full px-4 py-2.5 text-sm sm:w-auto"
                            disabled={!canCreateMoreVoiceProfiles || voiceSubmitting || voiceRecordingState === 'requesting'}
                            onClick={() => void startVoiceRecording()}
                            type="button"
                          >
                            {voiceRecordingState === 'requesting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                            {voiceRecordingState === 'requesting' ? 'Opening mic...' : 'Start recording'}
                          </PrimaryButton>
                        )}
                      </div>
                      {isVoiceRecording ? (
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#eadfce]">
                          <div
                            className="h-full rounded-full bg-[#ae6c4a] transition-[width] duration-300"
                            style={{
                              width: `${Math.min(100, (voiceRecordingSeconds / voiceProfileLimits.maxAudioSeconds) * 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                      {recordedVoiceUrl ? (
                        <div className="mt-4 space-y-3">
                          <audio className="w-full" controls src={recordedVoiceUrl} />
                          <SecondaryButton
                            className="w-full px-4 py-2.5 text-sm sm:w-auto"
                            disabled={voiceSubmitting}
                            onClick={() => {
                              clearRecordedReference();
                              setVoiceFile(null);
                              setVoiceFileSource(null);
                            }}
                            type="button"
                          >
                            <X className="h-4 w-4" />
                            Clear recording
                          </SecondaryButton>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {voiceFile ? (
                    <p className="mt-2 text-sm leading-6 text-[#6f645c]">
                      Selected: {voiceFile.name} ({formatBytes(voiceFile.size)})
                      {voiceFileSource === 'recorded' && recordedVoiceDuration !== null ? `, ${formatDuration(recordedVoiceDuration)}` : ''}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-[#6f645c]">
                    WAV only. Maximum {formatBytes(voiceProfileLimits.maxAudioBytes)}.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#eadfce] bg-white/70 p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ae6c4a] text-sm font-bold text-[#f8f3ec]">3</span>
                    <div>
                      <div className="text-sm font-semibold text-[#2f343b]">Save the custom voice</div>
                      <div className="text-xs leading-5 text-[#6f645c]">
                        The voice becomes selectable after the provider profile is active. If the provider is down, the reference WAV is saved here for retry.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-3 text-sm font-semibold text-[#4f4740]">
                      <input
                        checked={voiceForm.setDefault}
                        disabled={!canCreateMoreVoiceProfiles || voiceSubmitting || isVoiceRecordingBusy}
                        type="checkbox"
                        onChange={(event) => setVoiceForm((current) => ({ ...current, setDefault: event.target.checked }))}
                      />
                      Set as my default custom voice
                    </label>
                    <PrimaryButton
                      className="w-full justify-center sm:w-auto"
                      disabled={!canCreateMoreVoiceProfiles || voiceSubmitting || isVoiceRecordingBusy || (voiceScriptMode === 'custom' && !customScriptConfirmed)}
                      type="submit"
                    >
                      {voiceSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio2 className="h-4 w-4" />}
                      {voiceSubmitting ? 'Creating voice...' : 'Create voice profile'}
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {activeTab === 'history' ? (
        <section className="mt-6 rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#2f343b]">Generation history</h2>
              <p className="mt-2 text-sm leading-7 text-[#64584f]">
                Latest 50 jobs. Active jobs refresh automatically every 3 seconds.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {jobsRefreshing && !isInitialJobsLoading ? (
                <div className="rounded-full border border-[#d9c6b2] bg-white/80 px-4 py-2 text-sm font-semibold text-[#8d5d45]">
                  Refreshing
                </div>
              ) : null}
              {hasActiveJobs ? (
                <div className="rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-4 py-2 text-sm font-semibold text-[#8d5d45]">
                  Processing in progress
                </div>
              ) : null}
              <SecondaryButton
                className="px-4 py-2.5 text-xs sm:text-sm"
                disabled={jobsRefreshing}
                onClick={handleRefreshJobs}
                type="button"
              >
                {jobsRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {jobsRefreshing ? 'Refreshing...' : 'Refresh'}
              </SecondaryButton>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {isInitialJobsLoading ? (
              <StatePanel
                description="Checking your latest previews, active generations, and completed downloads."
                icon={<Loader2 className="h-5 w-5 animate-spin" />}
                title="Loading generation history"
              />
            ) : null}
            {jobsError ? (
              <StatePanel
                action={(
                  <SecondaryButton className="px-4 py-2.5 text-xs sm:text-sm" onClick={handleRefreshJobs} type="button">
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </SecondaryButton>
                )}
                description={jobsError}
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Could not load generation history"
                tone="error"
              />
            ) : null}
            {retryError ? <InlineMessage tone="error">{retryError}</InlineMessage> : null}
            {jobActionError ? <InlineMessage tone="error">{jobActionError}</InlineMessage> : null}
            {!jobsLoading && !jobsError && jobs.length === 0 ? (
              <StatePanel
                action={(
                  <PrimaryButton onClick={() => setActiveTab('create')} type="button">
                    <ArrowRight className="h-4 w-4" />
                    Create first preview
                  </PrimaryButton>
                )}
                description="Create a text or PDF preview first. Once you approve the preview, the final WAV and MP3 downloads will stay available here."
                icon={<FileAudio2 className="h-5 w-5" />}
                title="No generations yet"
              />
            ) : null}
            {jobs.map((job) => (
              <div key={job.id} className="rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-[#2f343b]">
                        {job.sourceName || (job.sourceType === 'pdf' ? 'PDF generation' : 'Text generation')}
                      </h3>
                      <span
                        className={cx(
                          'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]',
                          job.status === 'completed' && 'bg-[#e5f4e5] text-[#355f3b]',
                          job.status === 'failed' && 'bg-[#fbefea] text-[#8d4f37]',
                          job.status === 'cancelled' && 'bg-[#f3ede8] text-[#7a6f66]',
                          job.status === 'preview_ready' && 'bg-[#e9f2fb] text-[#315f8f]',
                          isActiveTtsJob(job) && 'bg-[#efe2d1] text-[#8d5d45]',
                        )}
                      >
                        {statusLabel(job.status)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-[#64584f] sm:grid-cols-2 lg:grid-cols-4">
                      <div>Created: {formatDate(job.createdAt)}</div>
                      <div>Source: {job.sourceType.toUpperCase()}</div>
                      <div>Words: {job.wordCount.toLocaleString()}</div>
                      <div>Minutes: {job.billableMinutes === null ? 'Not measured' : job.billableMinutes.toLocaleString()}</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[#7a6f66]">
                      Voice: {job.voiceDisplayName} • Quality: {getTtsQualityOption(job.qualityPreset).label}
                      {job.generatedAudioSeconds !== null ? ` • Duration: ${formatDuration(job.generatedAudioSeconds)}` : ''}
                      {job.processingStage ? ` • Stage: ${statusLabel(job.processingStage)}` : ''}
                    </div>
                    {job.inputText ? (
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#5f564f]">
                        {job.inputText}
                      </p>
                    ) : null}
                    {isActiveTtsJob(job) ? <ActiveTtsJobProgress job={job} nowMs={nowMs} /> : null}
                    {job.previewAudioUrl && job.status === 'preview_ready' ? (
                      <div className="mt-4 rounded-2xl border border-[#eadfce] bg-white/80 p-4">
                        <div className="text-sm font-semibold text-[#2f343b]">Preview ready</div>
                        <div className="mt-1 text-xs text-[#746960]">
                          Listen before generating the full WAV/MP3. The preview is not billed.
                        </div>
                        <audio controls className="mt-3 w-full" preload="none" src={job.previewAudioUrl}>
                          Your browser does not support audio preview.
                        </audio>
                      </div>
                    ) : null}
                    {job.errorMessage ? (
                      <div className="mt-4">
                        <InlineMessage tone="error">{job.errorMessage}</InlineMessage>
                      </div>
                    ) : null}
                    {job.cancelReason ? (
                      <div className="mt-4">
                        <InlineMessage>{job.cancelReason}</InlineMessage>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap lg:max-w-[320px] lg:justify-end">
                    <SecondaryButton
                      className="w-full px-4 py-2 text-sm sm:w-auto"
                      onClick={() => onNavigate(`/dashboard/jobs/${job.id}`)}
                      type="button"
                    >
                      Details
                    </SecondaryButton>
                    {job.status === 'preview_ready' ? (
                      <PrimaryButton
                        className="w-full px-4 py-2 text-sm sm:w-auto"
                        disabled={startingJobId === job.id}
                        onClick={() => requestStartFullGeneration(job)}
                        type="button"
                      >
                        {startingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {startingJobId === job.id ? 'Starting...' : 'Generate full audio'}
                      </PrimaryButton>
                    ) : null}
                    {canCancelTtsJob(job) ? (
                      <SecondaryButton
                        className="w-full px-4 py-2 text-sm sm:w-auto"
                        disabled={cancellingJobId === job.id}
                        onClick={() => setConfirmJobAction({ job, type: 'cancel' })}
                        type="button"
                      >
                        {cancellingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        {cancellingJobId === job.id ? 'Cancelling...' : 'Cancel'}
                      </SecondaryButton>
                    ) : null}
                    {job.status === 'failed' ? (
                      <SecondaryButton
                        className="w-full px-4 py-2 text-sm sm:w-auto"
                        disabled={retryingJobId === job.id}
                        onClick={() => void handleRetryJob(job.id)}
                        type="button"
                      >
                        {retryingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {retryingJobId === job.id ? 'Retrying...' : 'Retry'}
                      </SecondaryButton>
                    ) : null}
                    {canDeleteTtsJob(job) ? (
                      <SecondaryButton
                        className="w-full px-4 py-2 text-sm sm:w-auto"
                        disabled={deletingJobId === job.id}
                        onClick={() => setConfirmJobAction({ job, type: 'delete' })}
                        type="button"
                      >
                        {deletingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {deletingJobId === job.id ? 'Deleting...' : 'Delete'}
                      </SecondaryButton>
                    ) : null}
                    {job.wavDownloadUrl ? (
                      <a
                        className="inline-flex w-full items-center justify-center rounded-full bg-[#ae6c4a] px-4 py-2 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95 sm:w-auto"
                        href={job.wavDownloadUrl}
                      >
                        Download WAV
                      </a>
                    ) : null}
                    {job.mp3DownloadUrl ? (
                      <a
                        className="inline-flex w-full items-center justify-center rounded-full border border-[#d8cbbe] bg-white/88 px-4 py-2 text-sm font-semibold text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544] sm:w-auto"
                        href={job.mp3DownloadUrl}
                      >
                        Download MP3
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {confirmJobAction ? (
        <ConfirmationDialog
          cancelLabel={
            confirmJobAction.type === 'cancel'
              ? 'Keep running'
              : confirmJobAction.type === 'delete'
                ? 'Keep job'
                : 'Not yet'
          }
          confirmLabel={
            confirmJobAction.type === 'cancel'
              ? 'Cancel job'
              : confirmJobAction.type === 'delete'
                ? 'Delete permanently'
                : 'Generate full audio'
          }
          destructive={confirmJobAction.type === 'cancel' || confirmJobAction.type === 'delete'}
          loading={
            confirmJobAction.type === 'delete'
              ? deletingJobId === confirmJobAction.job.id
              : confirmJobAction.type === 'cancel'
                ? cancellingJobId === confirmJobAction.job.id
                : startingJobId === confirmJobAction.job.id
          }
          onCancel={() => setConfirmJobAction(null)}
          onConfirm={() => void handleConfirmedJobAction()}
          title={
            confirmJobAction.type === 'cancel'
              ? 'Cancel this generation?'
              : confirmJobAction.type === 'delete'
                ? 'Delete this audio job?'
                : 'Generate the full audio?'
          }
        >
          {confirmJobAction.type === 'cancel' ? (
            <>
              This job will stop at the next safe point between audio chunks. Unfinished cancelled jobs are not billed and no final downloads are created.
            </>
          ) : confirmJobAction.type === 'delete' ? (
            <>
              This permanently removes the job from history and deletes its preview, WAV, MP3, and temporary files from private storage. Already billed minutes are not refunded.
            </>
          ) : (
            <>
              This will start the final WAV{getTtsQualityOption(confirmJobAction.job.qualityPreset).mp3BitrateKbps ? ' and MP3' : ''} generation for{' '}
              {confirmJobAction.job.wordCount.toLocaleString()} words. Estimated billing is{' '}
              {formatMinuteEstimate(estimateMinutesFromWords(confirmJobAction.job.wordCount))}; minutes are deducted only after the full audio finishes successfully.
            </>
          )}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

export function CustomerJobDetailsPage({
  jobId,
  onNavigate,
  onSessionRefresh,
  user,
}: {
  jobId: number;
  onNavigate: (href: string, replace?: boolean) => void;
  onSessionRefresh?: () => Promise<void> | void;
  user: CustomerUser;
}) {
  const [job, setJob] = useState<TtsGenerationJob | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<null | 'cancel' | 'delete' | 'retry' | 'start'>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'cancel' | 'delete' | 'start'>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const active = job ? isActiveTtsJob(job) : false;

  const loadJob = useCallback(async () => {
    try {
      const payload = await apiRequest<{ job: TtsGenerationJob }>(`/api/tts/jobs/${jobId}`);
      setJob(payload.job);
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load this audio job.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    setJob(null);
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadJob();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [active, loadJob]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const runJobAction = async (nextAction: 'cancel' | 'delete' | 'retry' | 'start') => {
    setAction(nextAction);
    setActionError('');

    if (nextAction === 'delete') {
      try {
        await apiRequest<{ deleted: boolean; jobId: number }>(`/api/tts/jobs/${jobId}`, {
          method: 'DELETE',
        });

        setJob(null);
        await Promise.resolve(onSessionRefresh?.());
        onNavigate('/dashboard');
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : 'Failed to delete this audio job.');
      } finally {
        setAction(null);
      }

      return;
    }

    const endpoint =
      nextAction === 'cancel'
        ? `/api/tts/jobs/${jobId}/cancel`
        : nextAction === 'retry'
          ? `/api/tts/jobs/${jobId}/retry`
          : `/api/tts/jobs/${jobId}/start`;

    try {
      const payload = await apiRequest<{ job: TtsGenerationJob; tokenBalance?: number }>(endpoint, {
        method: 'POST',
      });
      setJob(payload.job);
      await Promise.all([loadJob(), Promise.resolve(onSessionRefresh?.())]);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : `Failed to ${nextAction} this audio job.`);
    } finally {
      setAction(null);
    }
  };

  const requestDetailsStart = () => {
    if (!job) {
      return;
    }

    const estimatedMinutes = estimateMinutesFromWords(job.wordCount);

    if (estimatedMinutes > user.tokenBalance) {
      setActionError(
        `This job is estimated at ${formatMinuteEstimate(estimatedMinutes)}, but your current balance is ${user.tokenBalance.toLocaleString()}. Add minutes before generating the full audio.`,
      );
      return;
    }

    setConfirmAction('start');
  };

  const runConfirmedDetailsAction = async () => {
    if (!confirmAction) {
      return;
    }

    await runJobAction(confirmAction);
    setConfirmAction(null);
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5">
        <StatePanel
          description="Loading status, source text, preview audio, and final downloads for this generation."
          icon={<Loader2 className="h-5 w-5 animate-spin" />}
          title="Loading audio job"
        />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-5 sm:py-24">
        <StatePanel
          action={(
            <SecondaryButton onClick={() => onNavigate('/dashboard')} type="button">
              Back to dashboard
            </SecondaryButton>
          )}
          description={error || 'This job may have been deleted, or it may belong to a different account.'}
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Audio job not found"
          tone="error"
        />
      </div>
    );
  }

  const timeline = [
    { label: 'Created', value: job.createdAt },
    { label: 'Preview ready', value: job.previewGeneratedAt },
    { label: 'Full generation requested', value: job.fullGenerationRequestedAt },
    { label: 'Cancellation requested', value: job.cancellationRequestedAt },
    { label: 'Cancelled', value: job.cancelledAt },
    { label: 'Completed', value: job.completedAt },
    { label: 'Downloaded', value: job.downloadedAt },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-5 sm:py-24">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a96544]">
            Audio Job
          </div>
          <h1 className="mt-5 text-3xl font-bold text-[#2f343b] sm:text-4xl">
            {job.sourceName || (job.sourceType === 'pdf' ? 'PDF generation' : 'Text generation')}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64584f] sm:text-base">
            Review the source text, listen to the free preview, follow processing progress, and download the final audio files when ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={() => onNavigate('/dashboard')} type="button">
            Back to dashboard
          </SecondaryButton>
          <SecondaryButton onClick={() => onNavigate('/account?section=tokens')} type="button">
            Minute ledger
          </SecondaryButton>
        </div>
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="Status" value={statusLabel(job.status)} />
        <DashboardCard label="Words" value={job.wordCount.toLocaleString()} />
        <DashboardCard label="Billed minutes" value={job.billableMinutes === null ? 'Not billed' : job.billableMinutes.toLocaleString()} />
        <DashboardCard label="Duration" value={job.generatedAudioSeconds === null ? 'Not ready' : formatDuration(job.generatedAudioSeconds)} />
      </div>

      <section className="mt-8 rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#2f343b]">Status timeline</h2>
            <p className="mt-2 text-sm leading-7 text-[#64584f]">
              Voice: {job.voiceDisplayName} • Quality: {getTtsQualityOption(job.qualityPreset).label}
              {job.processingStage ? ` • Stage: ${statusLabel(job.processingStage)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {job.status === 'preview_ready' ? (
              <PrimaryButton disabled={action === 'start'} onClick={requestDetailsStart} type="button">
                {action === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {action === 'start' ? 'Starting...' : 'Generate full audio'}
              </PrimaryButton>
            ) : null}
            {canCancelTtsJob(job) ? (
              <SecondaryButton disabled={action === 'cancel'} onClick={() => setConfirmAction('cancel')} type="button">
                {action === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                {action === 'cancel' ? 'Cancelling...' : 'Cancel'}
              </SecondaryButton>
            ) : null}
            {job.status === 'failed' ? (
              <SecondaryButton disabled={action === 'retry'} onClick={() => void runJobAction('retry')} type="button">
                {action === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {action === 'retry' ? 'Retrying...' : 'Retry'}
              </SecondaryButton>
            ) : null}
            {canDeleteTtsJob(job) ? (
              <SecondaryButton disabled={action === 'delete'} onClick={() => setConfirmAction('delete')} type="button">
                {action === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {action === 'delete' ? 'Deleting...' : 'Delete'}
              </SecondaryButton>
            ) : null}
          </div>
        </div>

        {active ? <ActiveTtsJobProgress job={job} nowMs={nowMs} /> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {timeline.length === 0 ? <InlineMessage>No timeline events yet.</InlineMessage> : null}
          {timeline.map((item) => (
            <div key={item.label} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8d5d45]">{item.label}</div>
              <div className="mt-2 text-sm font-semibold text-[#2f343b]">{formatDate(item.value)}</div>
            </div>
          ))}
        </div>

        {job.errorMessage ? <InlineMessage tone="error">{job.errorMessage}</InlineMessage> : null}
        {job.cancelReason ? <InlineMessage>{job.cancelReason}</InlineMessage> : null}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
          <h2 className="text-xl font-bold text-[#2f343b]">Original text</h2>
          <div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-[24px] border border-[#eadfce] bg-[#faf7f1] p-5 text-sm leading-7 text-[#4f4740]">
            {job.inputText || 'Original text is not available.'}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-4 shadow-[0_18px_50px_rgba(55,58,64,0.08)] sm:p-6">
          <h2 className="text-xl font-bold text-[#2f343b]">Audio files</h2>
          {job.previewAudioUrl ? (
            <div className="mt-4 rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
              <div className="font-semibold text-[#2f343b]">Preview WAV</div>
              <div className="mt-1 text-xs text-[#746960]">
                {job.previewAudioSeconds === null ? 'Duration not measured' : formatDuration(job.previewAudioSeconds)}
              </div>
              <audio controls className="mt-3 w-full" preload="none" src={job.previewAudioUrl}>
                Your browser does not support audio preview.
              </audio>
            </div>
          ) : (
            <InlineMessage>No preview audio is available yet.</InlineMessage>
          )}

          <div className="mt-4 flex flex-col gap-3">
            {job.wavDownloadUrl ? (
              <a
                className="rounded-full bg-[#ae6c4a] px-4 py-3 text-center text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95"
                href={job.wavDownloadUrl}
              >
                Download WAV
              </a>
            ) : null}
            {job.mp3DownloadUrl ? (
              <a
                className="rounded-full border border-[#d8cbbe] bg-white/88 px-4 py-3 text-center text-sm font-semibold text-[#5a514a] transition hover:border-[#c7b09e] hover:text-[#a96544]"
                href={job.mp3DownloadUrl}
              >
                Download MP3
              </a>
            ) : null}
            {!job.wavDownloadUrl && !job.mp3DownloadUrl ? (
              <StatePanel
                description="Approve the preview to generate the final audio. Downloads appear here after the full job completes."
                icon={<FileAudio2 className="h-5 w-5" />}
                title="Final audio is not ready yet"
              />
            ) : null}
          </div>
        </section>
      </div>
      {confirmAction ? (
        <ConfirmationDialog
          cancelLabel={confirmAction === 'cancel' ? 'Keep running' : confirmAction === 'delete' ? 'Keep job' : 'Not yet'}
          confirmLabel={confirmAction === 'cancel' ? 'Cancel job' : confirmAction === 'delete' ? 'Delete permanently' : 'Generate full audio'}
          destructive={confirmAction === 'cancel' || confirmAction === 'delete'}
          loading={action === confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runConfirmedDetailsAction()}
          title={confirmAction === 'cancel' ? 'Cancel this generation?' : confirmAction === 'delete' ? 'Delete this audio job?' : 'Generate the full audio?'}
        >
          {confirmAction === 'cancel' ? (
            <>
              This job will stop at the next safe point between audio chunks. Cancelled unfinished jobs are not billed.
            </>
          ) : confirmAction === 'delete' ? (
            <>
              This permanently removes the job from history and deletes its preview, WAV, MP3, and temporary files from private storage. Already billed minutes are not refunded.
            </>
          ) : (
            <>
              This starts the final generation for {job.wordCount.toLocaleString()} words using {getTtsQualityOption(job.qualityPreset).label}. Estimated billing is{' '}
              {formatMinuteEstimate(estimateMinutesFromWords(job.wordCount))}, and minutes are deducted only after successful completion.
            </>
          )}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

type AccountSection = 'credits' | 'payments' | 'plan' | 'profile' | 'security' | 'tokens';

const validAccountSections = new Set<AccountSection>(['credits', 'payments', 'plan', 'profile', 'security', 'tokens']);

function buildProfileFormState(user: CustomerUser) {
  return {
    countryCode: user.countryCode ?? '+880',
    email: user.email,
    fullName: user.fullName ?? '',
    mobileNumber: user.mobileNumber ?? '',
  };
}

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
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState(() => buildProfileFormState(user));
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
    setProfileForm(buildProfileFormState(user));
  }, [user.countryCode, user.email, user.fullName, user.mobileNumber]);

  const currentPackage = useMemo(
    () => packages.find((item) => item.code === user.packageType) ?? null,
    [packages, user.packageType],
  );
  const profileDisplayName = user.fullName?.trim() || 'Name not set';
  const profileDisplayContact = [user.countryCode, user.mobileNumber].filter(Boolean).join(' ') || 'Contact not set';

  const handleCancelProfileEdit = () => {
    setProfileEditing(false);
    setProfileForm(buildProfileFormState(user));
    setProfileError('');
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSubmitting(true);
    setProfileError('');
    setProfileMessage('');

    try {
      if (!profileForm.fullName.trim()) {
        throw new Error('Enter your name before saving.');
      }

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
      setProfileForm(buildProfileFormState(payload.user));
      setProfileEditing(false);
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
            Profile details, package status, generation minute balance, payment history, and security controls for your customer account.
          </p>
        </div>
        <SecondaryButton onClick={() => onNavigate('/')} type="button">
          Back to website
        </SecondaryButton>
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="Package" value={currentPackage?.name ?? statusLabel(user.packageType)} />
        <DashboardCard label="Minute balance" value={user.tokenBalance.toLocaleString()} />
        <DashboardCard label="Email status" value={user.emailVerified ? 'Verified' : 'Pending'} />
        <DashboardCard label="Phone status" value={user.phoneVerified ? 'Verified' : 'Pending'} />
      </div>

      <div className="mt-8">
        <div className="mx-auto w-full max-w-4xl">
          {activeSection === 'profile' ? (
            <section className="rounded-[28px] border border-[#ddcfbe] bg-white/88 p-6 shadow-[0_18px_50px_rgba(55,58,64,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#2f343b]">Profile details</h2>
                  <p className="mt-2 text-sm leading-7 text-[#64584f]">
                    Your name, email, and contact number tied to this customer account.
                  </p>
                </div>
                {!profileEditing ? (
                  <SecondaryButton
                    onClick={() => {
                      setProfileEditing(true);
                      setProfileError('');
                      setProfileMessage('');
                    }}
                    type="button"
                  >
                    Edit
                  </SecondaryButton>
                ) : null}
              </div>

              {!profileEditing ? (
                <div className="mt-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <ProfileDetail label="Name" value={profileDisplayName} />
                    <ProfileDetail
                      label="Email"
                      value={user.email}
                      helper={user.emailVerified ? 'Verified' : 'Verification required'}
                    />
                    <ProfileDetail
                      label="Contact"
                      value={profileDisplayContact}
                      helper={user.phoneVerified ? 'Verified' : 'Verification required'}
                    />
                  </div>
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
                </div>
              ) : null}

              {profileEditing ? (
                <form className="mt-6 space-y-4" onSubmit={handleProfileSubmit}>
                  <TextInput
                    autoComplete="name"
                    placeholder="Full name"
                    required
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                  />
                  <TextInput
                    autoComplete="email"
                    placeholder="Work email"
                    required
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                  />
                  <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
                    <TextInput
                      placeholder="Country code"
                      required
                      value={profileForm.countryCode}
                      onChange={(event) => setProfileForm((current) => ({ ...current, countryCode: event.target.value }))}
                    />
                    <TextInput
                      autoComplete="tel"
                      placeholder="Mobile number"
                      required
                      value={profileForm.mobileNumber}
                      onChange={(event) => setProfileForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                    />
                  </div>
                  <InlineMessage>
                    Changing email or contact number will require verification again.
                  </InlineMessage>
                  {profileError ? <InlineMessage tone="error">{profileError}</InlineMessage> : null}
                  <div className="flex flex-wrap gap-3">
                    <PrimaryButton className="justify-center" disabled={profileSubmitting} type="submit">
                      {profileSubmitting ? 'Saving...' : 'Save'}
                    </PrimaryButton>
                    <SecondaryButton disabled={profileSubmitting} onClick={handleCancelProfileEdit} type="button">
                      Cancel
                    </SecondaryButton>
                  </div>
                </form>
              ) : null}
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
                          ? `${item.monthlyRefillTokens.toLocaleString()} monthly generation minutes`
                          : `${item.signupTokenGrant.toLocaleString()} fixed generation minutes`}
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
                  Downgrading does not create an automatic refund. Premium access is removed and the minute balance becomes the lower of your current balance and the Starter allowance.
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
                <h2 className="text-xl font-bold text-[#2f343b]">Minute balance</h2>
                <p className="mt-2 text-sm leading-7 text-[#64584f]">Live generated-audio minute balance from your authenticated account state.</p>
              </div>
              <div className="rounded-full border border-[#D2CCBE] bg-[#F8F3EC] px-4 py-2 text-sm font-semibold text-[#2F343B]">
                Minutes Left: {user.tokenBalance.toLocaleString()}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {ledger.length === 0 ? <InlineMessage>No minute transactions yet.</InlineMessage> : null}
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
                  Starter accounts cannot buy extra generation minutes directly. Upgrade to Gold or Platinum first, then choose Stripe or bKash during checkout.
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
                    <h3 className="text-lg font-semibold text-[#2f343b]">Buy 5,000 extra minutes</h3>
                    <p className="mt-2 text-sm leading-7 text-[#64584f]">
                      Gold and Platinum accounts can add 5,000 generation minutes without changing the current package. Payment method selection stays on the existing Stripe/bKash flow.
                    </p>
                  </div>
                  <PrimaryButton onClick={() => onStartPurchase({ extraTokenAmount: 5000, label: '5,000 extra minutes' })} type="button">
                    Add 5,000 minutes
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

function DashboardCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[26px] border border-[#ddcfbe] bg-white/88 p-5 shadow-[0_18px_45px_rgba(55,58,64,0.08)]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8d5d45]">{label}</div>
      <div className="mt-3 break-words text-2xl font-bold text-[#2f343b] sm:text-3xl">{value}</div>
    </div>
  );
}

function ProfileDetail({ helper, label, value }: { helper?: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d5d45]">{label}</div>
      <div className="mt-2 break-words text-base font-semibold text-[#2f343b]">{value}</div>
      {helper ? <div className="mt-1 text-xs text-[#746960]">{helper}</div> : null}
    </div>
  );
}
