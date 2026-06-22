import { useEffect, useMemo, useState } from 'react';
import brandLogo from '../assets/bangla-speech-ai-logo.png';
import {
  CustomerAccountPage,
  CustomerAuthRoutes,
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

function readLocation(): AppLocation {
  const pathname = validRoutes.has(window.location.pathname as CustomerRoute)
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
  onLogout,
  session,
}: {
  loading: boolean;
  onLogout: () => Promise<void> | void;
  session: CustomerSessionResponse;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#d9cbbd] bg-[#f8f3ec]/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <a className="flex items-center gap-3" href="/">
          <img
            src={brandLogo}
            alt="BANGLA SPEECH AI logo"
            className="h-10 w-auto shrink-0 mix-blend-multiply sm:h-11"
          />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#995842]">BANGLA SPEECH AI</div>
            <div className="text-sm font-semibold text-[#373A40]">Bangladeshi Bangla AI Voice</div>
          </div>
        </a>

        <nav className="hidden items-center gap-5 text-sm font-semibold text-[#5d544d] md:flex">
          <a className="transition hover:text-[#ae6c4a]" href="/#viral-proof">Demo</a>
          <a className="transition hover:text-[#ae6c4a]" href="/#b2b-agent">Sales Agent</a>
          <a className="transition hover:text-[#ae6c4a]" href="/#pricing">Pricing</a>
          <a className="transition hover:text-[#ae6c4a]" href="/#positioning">Products</a>
          <a className="transition hover:text-[#ae6c4a]" href="/#faq">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="rounded-full border border-[#d2ccbe] bg-white/80 px-4 py-2 text-sm font-medium text-[#6a5f57]">
              Loading...
            </div>
          ) : session.authenticated && session.user ? (
            <>
              <div className="rounded-full border border-[#d2ccbe] bg-white/85 px-4 py-2 text-sm font-semibold text-[#373A40] shadow-[0_12px_30px_rgba(55,58,64,0.08)]">
                Tokens Left: {session.user.tokenBalance.toLocaleString()}
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

  const navigate = (href: string, replace = false) => {
    const nextUrl = new URL(href, window.location.origin);
    const nextPathname = validRoutes.has(nextUrl.pathname as CustomerRoute) ? (nextUrl.pathname as CustomerRoute) : '/';

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

    if ((location.pathname === '/dashboard' || location.pathname === '/account') && !session.authenticated) {
      navigate('/login?next=account', true);
      return;
    }

    if (session.authenticated && (location.pathname === '/login' || location.pathname === '/signup')) {
      navigate('/dashboard', true);
    }
  }, [loading, location.pathname, session.authenticated]);

  const currentUser = session.user;

  const planLabels = useMemo(
    () => ({
      gold: 'Gold',
      platinum: 'Platinum',
      starter: 'Starter',
    }),
    [],
  );

  const openVerifiedLead = (mode: LeadDialogMode) => {
    if (!session.authenticated) {
      navigate('/signup?next=sample');
      return;
    }

    if (!currentUser?.emailVerified) {
      navigate('/verify-email?next=sample');
      return;
    }

    if (!currentUser.phoneVerified) {
      navigate('/verify-phone?next=sample');
      return;
    }

    setLeadMode(mode);
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

  if (loading && (location.pathname === '/dashboard' || location.pathname === '/account' || location.pathname === '/payment/success')) {
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

  if ((location.pathname === '/dashboard' || location.pathname === '/account') && currentUser) {
    return (
      <>
        <Header loading={loading} onLogout={handleLogout} session={session} />
        <CustomerAccountPage
          onNavigate={navigate}
          onSessionRefresh={refresh}
          onStartPurchase={(selection) => setPurchaseSelection(selection)}
          search={location.search}
          user={currentUser}
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

  return (
    <>
      <Header loading={loading} onLogout={handleLogout} session={session} />
      {error ? (
        <div className="border-b border-[#d8cbbd] bg-[#fbefea] px-5 py-3 text-sm text-[#8d4f37] sm:px-8 lg:px-10">
          {error}
        </div>
      ) : null}
      <LandingPage
        onPilotClick={() => openVerifiedLead('pilot')}
        onPlanSelect={handlePlanSelect}
        onSampleClick={() => openVerifiedLead('sample')}
      />
      <footer className="border-t border-[#d8cbbd] bg-[#f8f3ec] px-5 py-8 text-center text-sm text-[#6a5f57] sm:px-8 lg:px-10">
        BANGLA SPEECH AI · {session.authenticated && currentUser ? `${statusLabel(currentUser.packageType)} package` : 'Customer-facing website'}
      </footer>

      <LeadCaptureDialog
        mode={leadMode}
        open={leadOpen}
        onOpenChange={(open) => {
          setLeadOpen(open);

          if (!open) {
            setLeadMode(null);
          }
        }}
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
