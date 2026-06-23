import { useEffect, useMemo, useState } from 'react';
import brandLogo from '../assets/bangla-speech-ai-logo.png';
import {
  CustomerAccountPage,
  CustomerAuthRoutes,
  CustomerDashboardPage,
  CustomerJobDetailsPage,
  CustomerPaymentSuccessPage,
  PaymentMethodDialog,
  type CustomerRoute,
  type CustomerUser,
  type PurchaseSelection,
  useCustomerSession,
} from './customer';
import { Frame01Cover } from './components/Frame01Cover';
import { Frame02ViralProof } from './components/Frame02ViralProof';
import { Frame03B2B } from './components/Frame03B2B';
import { Frame04Creator } from './components/Frame04Creator';
import { Frame05Roadmap } from './components/Frame05Roadmap';
import { Frame06Positioning } from './components/Frame06Positioning';
import { Frame07FAQ } from './components/Frame07FAQ';
import { LeadCaptureDialog, type LeadDialogMode } from './components/LeadCaptureDialog';
import { UserAccountMenu } from './components/UserAccountMenu';

type CustomerSessionResponse = {
  authenticated: boolean;
  user: CustomerUser | null;
};

type AppLocation = {
  pathname: CustomerRoute;
  search: string;
};

const validRoutes = new Set<CustomerRoute>([
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

function isValidRoute(pathname: string) {
  return validRoutes.has(pathname as CustomerRoute) || /^\/dashboard\/jobs\/\d+$/.test(pathname);
}

function readLocation(): AppLocation {
  const pathname = isValidRoute(window.location.pathname)
    ? (window.location.pathname as CustomerRoute)
    : '/';

  return {
    pathname,
    search: window.location.search,
  };
}

function createSearch(params: URLSearchParams) {
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

function parseLeadIntent(search: string): LeadDialogMode | null {
  const lead = new URLSearchParams(search).get('lead');
  return lead === 'pilot' ? lead : null;
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

async function postJson<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

function Header({
  loading,
  onNavigate,
  onLogout,
  session,
}: {
  loading: boolean;
  onNavigate: (href: string, replace?: boolean) => void;
  onLogout: () => Promise<void> | void;
  session: CustomerSessionResponse;
}) {
  const navLinks = [
    { href: '/#viral-proof', label: 'Demo' },
    { href: '/#b2b-agent', label: 'Sales Agent' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/#positioning', label: 'Products' },
    { href: '/#faq', label: 'FAQ' },
  ];
  const verificationPending = Boolean(
    session.authenticated &&
      session.user &&
      (!session.user.emailVerified || !session.user.phoneVerified),
  );
  const verificationHref = session.user?.emailVerified ? '/verify-phone' : '/verify-email';
  const verificationLabel = session.user?.emailVerified ? 'Verify phone' : 'Verify email';

  return (
    <header className="sticky top-0 z-40 border-b border-[#d9cbbd] bg-[#f8f3ec]/92 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-3">
            <a className="flex min-w-0 items-center gap-3" href="/">
              <img
                src={brandLogo}
                alt="BANGLA SPEECH AI logo"
                className="h-10 w-auto shrink-0 mix-blend-multiply sm:h-11"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#995842] sm:text-[11px]">BANGLA SPEECH AI</div>
                <div className="truncate text-xs font-semibold text-[#373A40] sm:text-sm">Bangladeshi Bangla AI Voice</div>
              </div>
            </a>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:hidden">
              {loading ? (
                <div className="rounded-full border border-[#d2ccbe] bg-white/80 px-3 py-2 text-xs font-medium text-[#6a5f57] sm:px-4 sm:text-sm">
                  Loading...
                </div>
              ) : verificationPending ? (
                <>
                  <div className="rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d5d45] sm:px-4">
                    Pending
                  </div>
                  <button
                    className="rounded-full bg-[#ae6c4a] px-3 py-2 text-xs font-semibold text-[#f8f3ec] transition hover:brightness-95 sm:px-4 sm:text-sm"
                    onClick={() => onNavigate(verificationHref)}
                    type="button"
                  >
                    {verificationLabel}
                  </button>
                </>
              ) : session.authenticated && session.user ? (
                <>
                  <div className="max-w-[150px] rounded-full border border-[#d2ccbe] bg-white/85 px-3 py-2 text-xs font-semibold text-[#373A40] shadow-[0_12px_30px_rgba(55,58,64,0.08)] sm:max-w-none sm:px-4 sm:text-sm">
                    <span className="block truncate">Minutes Left: {session.user.tokenBalance.toLocaleString()}</span>
                  </div>
                  <UserAccountMenu
                    onLogout={onLogout}
                    onNavigate={(href) => {
                      window.history.pushState({}, '', href);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    user={session.user}
                  />
                </>
              ) : (
                <>
                  <a
                    className="rounded-full border border-[#d2ccbe] bg-white/85 px-3 py-2 text-xs font-semibold text-[#5a514a] transition hover:border-[#c39680] hover:text-[#ae6c4a] sm:px-4 sm:text-sm"
                    href="/login"
                  >
                    Login
                  </a>
                  <a
                    className="rounded-full bg-[#ae6c4a] px-3 py-2 text-xs font-semibold text-[#f8f3ec] transition hover:brightness-95 sm:px-4 sm:text-sm"
                    href="/signup"
                  >
                    Sign Up
                  </a>
                </>
              )}
            </div>
          </div>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-[#5d544d] md:flex">
            {navLinks.map((link) => (
              <a key={link.href} className="transition hover:text-[#ae6c4a]" href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {loading ? (
              <div className="rounded-full border border-[#d2ccbe] bg-white/80 px-4 py-2 text-sm font-medium text-[#6a5f57]">
                Loading...
              </div>
            ) : verificationPending ? (
              <>
                <div className="rounded-full border border-[#d9c6b2] bg-[#efe2d1] px-4 py-2 text-sm font-semibold text-[#8d5d45]">
                  Verification pending
                </div>
                <button
                  className="rounded-full bg-[#ae6c4a] px-4 py-2 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95"
                  onClick={() => onNavigate(verificationHref)}
                  type="button"
                >
                  {verificationLabel}
                </button>
              </>
            ) : session.authenticated && session.user ? (
              <>
                <div className="rounded-full border border-[#d2ccbe] bg-white/85 px-4 py-2 text-sm font-semibold text-[#373A40] shadow-[0_12px_30px_rgba(55,58,64,0.08)]">
                  Minutes Left: {session.user.tokenBalance.toLocaleString()}
                </div>
                <UserAccountMenu
                  onLogout={onLogout}
                  onNavigate={(href) => {
                    window.history.pushState({}, '', href);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  user={session.user}
                />
              </>
            ) : (
              <>
                <a
                  className="rounded-full border border-[#d2ccbe] bg-white/85 px-4 py-2 text-sm font-semibold text-[#5a514a] transition hover:border-[#c39680] hover:text-[#ae6c4a]"
                  href="/login"
                >
                  Login
                </a>
                <a
                  className="rounded-full bg-[#ae6c4a] px-4 py-2 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95"
                  href="/signup"
                >
                  Sign Up
                </a>
              </>
            )}
          </div>
        </div>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm font-semibold text-[#5d544d] md:hidden [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {navLinks.map((link) => (
            <a
              key={link.href}
              className="shrink-0 rounded-full border border-[#d8cbbe] bg-white/80 px-3 py-2 text-xs transition hover:border-[#c39680] hover:text-[#ae6c4a]"
              href={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function LandingPage({
  onPilotClick,
  onPlanSelect,
  onSampleClick,
}: {
  onPilotClick: () => void;
  onPlanSelect: (planCode: 'starter' | 'gold' | 'platinum') => void;
  onSampleClick: () => void;
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F2EFE7] text-[#373A40]">
      <section id="cover">
        <Frame01Cover onSampleClick={onSampleClick} />
      </section>
      <section id="viral-proof">
        <Frame02ViralProof />
      </section>
      <section id="b2b-agent">
        <Frame03B2B onPilotClick={onPilotClick} />
      </section>
      <section id="creator-studio">
        <Frame04Creator onSampleClick={onSampleClick} />
      </section>
      <section id="pricing">
        <Frame05Roadmap onPlanSelect={onPlanSelect} />
      </section>
      <section id="positioning">
        <Frame06Positioning />
      </section>
      <section id="faq">
        <Frame07FAQ />
      </section>
    </main>
  );
}

export default function App() {
  const [location, setLocation] = useState<AppLocation>(readLocation);
  const [leadMode, setLeadMode] = useState<LeadDialogMode | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [purchaseSelection, setPurchaseSelection] = useState<PurchaseSelection | null>(null);
  const { error, loading, refresh, session, setSession } = useCustomerSession();
  const currentUser = session.user;

  const navigate = (href: string, replace = false) => {
    const nextUrl = new URL(href, window.location.origin);
    const nextPathname = isValidRoute(nextUrl.pathname) ? (nextUrl.pathname as CustomerRoute) : '/';

    if (nextPathname === location.pathname && nextUrl.search === location.search) {
      return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', `${nextPathname}${nextUrl.search}`);
    setLocation({
      pathname: nextPathname,
      search: nextUrl.search,
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const handlePopState = () => {
      setLocation(readLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (location.pathname.startsWith('/dashboard') && !session.authenticated) {
      navigate('/login?next=dashboard', true);
      return;
    }

    if (location.pathname === '/account' && !session.authenticated) {
      navigate('/login?next=account', true);
      return;
    }

    if (location.pathname.startsWith('/dashboard') && session.authenticated && currentUser && (!currentUser.emailVerified || !currentUser.phoneVerified)) {
      if (!currentUser.emailVerified) {
        navigate('/verify-email?next=dashboard', true);
        return;
      }

      navigate('/verify-phone?next=dashboard', true);
      return;
    }

    if (session.authenticated && (location.pathname === '/login' || location.pathname === '/signup')) {
      if (!currentUser?.emailVerified) {
        navigate('/verify-email', true);
        return;
      }

      if (!currentUser.phoneVerified) {
        navigate('/verify-phone', true);
        return;
      }

      navigate('/dashboard', true);
    }
  }, [currentUser?.emailVerified, currentUser?.phoneVerified, loading, location.pathname, session.authenticated]);

  useEffect(() => {
    if (loading || location.pathname !== '/' || !session.authenticated || !currentUser?.emailVerified || !currentUser.phoneVerified) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const sampleIntent = params.get('lead') === 'sample';

    if (sampleIntent) {
      navigate('/dashboard', true);
      return;
    }

    const leadIntent = parseLeadIntent(location.search);

    if (!leadIntent) {
      return;
    }

    setLeadMode(leadIntent);
    setLeadOpen(true);

    params.delete('lead');
    const nextSearch = createSearch(params);
    window.history.replaceState({}, '', `${location.pathname}${nextSearch}`);
    setLocation((current) => ({
      ...current,
      search: nextSearch,
    }));
  }, [currentUser?.emailVerified, currentUser?.phoneVerified, loading, location.pathname, location.search, session.authenticated]);

  const planLabels = useMemo(
    () => ({
      gold: 'Gold',
      platinum: 'Platinum',
      starter: 'Starter',
    }),
    [],
  );

  const openCreateWorkspace = () => {
    if (!session.authenticated) {
      navigate('/signup?next=lead&mode=sample');
      return;
    }

    if (!currentUser?.emailVerified) {
      navigate('/verify-email?next=lead&mode=sample');
      return;
    }

    if (!currentUser.phoneVerified) {
      navigate('/verify-phone?next=lead&mode=sample');
      return;
    }

    navigate('/dashboard');
  };

  const openPilotLead = () => {
    if (!session.authenticated) {
      navigate('/signup?next=lead&mode=pilot');
      return;
    }

    if (!currentUser?.emailVerified) {
      navigate('/verify-email?next=lead&mode=pilot');
      return;
    }

    if (!currentUser.phoneVerified) {
      navigate('/verify-phone?next=lead&mode=pilot');
      return;
    }

    setLeadMode('pilot');
    setLeadOpen(true);
  };

  const handlePlanSelect = (planCode: 'starter' | 'gold' | 'platinum') => {
    if (planCode === 'starter') {
      if (!session.authenticated) {
        navigate('/signup?next=account&section=plan');
        return;
      }

      navigate('/account?section=plan');
      return;
    }

    if (!session.authenticated) {
      navigate(`/signup?next=checkout&package=${planCode}`);
      return;
    }

    if (!currentUser?.emailVerified) {
      navigate(`/verify-email?next=checkout&package=${planCode}`);
      return;
    }

    if (!currentUser.phoneVerified) {
      navigate(`/verify-phone?next=checkout&package=${planCode}`);
      return;
    }

    setPurchaseSelection({
      label: planLabels[planCode],
      packageCode: planCode,
    });
  };

  const handleLogout = async () => {
    if (!window.confirm('Do you really want to log out?')) {
      return;
    }

    await postJson('/api/auth/logout');
    setSession({ authenticated: false, user: null });
    navigate('/', true);
  };

  if (location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/forgot-password' || location.pathname === '/reset-password' || location.pathname === '/verify-email' || location.pathname === '/verify-phone') {
    return (
      <CustomerAuthRoutes
        onAuthenticated={(nextSession) => {
          setSession(nextSession);
        }}
        onNavigate={navigate}
        route={location.pathname}
        search={location.search}
      />
    );
  }

  if (loading && !currentUser && (location.pathname.startsWith('/dashboard') || location.pathname === '/account' || location.pathname === '/payment/success')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2EFE7] px-6">
        <div className="rounded-3xl border border-[#ddcfbe] bg-white/85 px-6 py-4 text-sm font-medium text-[#5c5048] shadow-[0_20px_60px_rgba(92,80,72,0.12)]">
          Loading account...
        </div>
      </div>
    );
  }

  if (location.pathname === '/payment/success') {
    return (
      <CustomerPaymentSuccessPage
        onNavigate={navigate}
        onRefreshSession={refresh}
        search={location.search}
      />
    );
  }

  if ((location.pathname.startsWith('/dashboard') || location.pathname === '/account') && currentUser) {
    const jobDetailsMatch = /^\/dashboard\/jobs\/(\d+)$/.exec(location.pathname);
    const isDashboardRoute = location.pathname === '/dashboard';

    return (
      <>
        <Header loading={loading} onNavigate={navigate} onLogout={handleLogout} session={session} />
        {jobDetailsMatch ? (
          <CustomerJobDetailsPage
            jobId={Number(jobDetailsMatch[1])}
            onNavigate={navigate}
            onSessionRefresh={refresh}
            user={currentUser}
          />
        ) : isDashboardRoute ? (
          <CustomerDashboardPage
            onNavigate={navigate}
            onSessionRefresh={refresh}
            user={currentUser}
          />
        ) : (
          <CustomerAccountPage
            onNavigate={navigate}
            onSessionRefresh={refresh}
            onStartPurchase={(selection) => setPurchaseSelection(selection)}
            search={location.search}
            user={currentUser}
          />
        )}
        {purchaseSelection ? (
          <PaymentMethodDialog
            onClose={() => setPurchaseSelection(null)}
            onPurchaseComplete={() => {
              void refresh();
            }}
            selection={purchaseSelection}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <Header loading={loading} onNavigate={navigate} onLogout={handleLogout} session={session} />
      {session.authenticated && currentUser && (!currentUser.emailVerified || !currentUser.phoneVerified) ? (
        <div className="border-b border-[#d9c6b2] bg-[#efe2d1] px-5 py-3 text-sm text-[#7c5340] sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Your account is signed in, but verification is not complete yet. Finish
              {' '}
              {!currentUser.emailVerified ? 'email verification' : 'phone verification'}
              {' '}
              to unlock samples and dashboard access.
            </div>
            <button
              className="rounded-full bg-[#ae6c4a] px-4 py-2 text-sm font-semibold text-[#f8f3ec] transition hover:brightness-95"
              onClick={() => navigate(currentUser.emailVerified ? '/verify-phone' : '/verify-email')}
              type="button"
            >
              Continue verification
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-[#d8cbbd] bg-[#fbefea] px-5 py-3 text-sm text-[#8d4f37] sm:px-8 lg:px-10">
          {error}
        </div>
      ) : null}
      <LandingPage
        onPilotClick={openPilotLead}
        onPlanSelect={handlePlanSelect}
        onSampleClick={openCreateWorkspace}
      />
      <footer className="border-t border-[#d8cbbd] bg-[#f8f3ec] px-5 py-8 text-center text-sm text-[#6a5f57] sm:px-8 lg:px-10">
        BANGLA SPEECH AI · {session.authenticated && currentUser ? `${statusLabel(currentUser.packageType)} package` : 'Customer-facing website'}
      </footer>

      <LeadCaptureDialog
        currentTokenBalance={currentUser?.tokenBalance ?? null}
        currentUserEmail={currentUser?.email ?? null}
        mode={leadMode}
        onNavigate={navigate}
        open={leadOpen}
        onOpenChange={(open) => {
          setLeadOpen(open);

          if (!open) {
            setLeadMode(null);
          }
        }}
        onRefreshSession={refresh}
      />

      {purchaseSelection ? (
        <PaymentMethodDialog
          onClose={() => setPurchaseSelection(null)}
          onPurchaseComplete={() => {
            void refresh();
          }}
          selection={purchaseSelection}
        />
      ) : null}
    </>
  );
}
