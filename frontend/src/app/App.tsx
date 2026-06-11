import { useEffect, useState } from 'react';
import { Frame01Cover } from './components/Frame01Cover';
import { Frame02ViralProof } from './components/Frame02ViralProof';
import { Frame03B2B } from './components/Frame03B2B';
import { Frame04Creator } from './components/Frame04Creator';
import { Frame05Roadmap } from './components/Frame05Roadmap';
import { Frame06Positioning } from './components/Frame06Positioning';
import { Frame07FAQ } from './components/Frame07FAQ';
import { LeadCaptureDialog, type LeadDialogMode } from './components/LeadCaptureDialog';
import { UserAccountMenu } from './components/UserAccountMenu';
import {
  CustomerAuthRoutes,
  CustomerAccountPage,
  CustomerPaymentSuccessPage,
  PaymentMethodDialog,
  useCustomerSession,
  type CustomerRoute,
  type PurchaseSelection,
} from './customer';

export default function App() {
  const { loading, refresh, session, setSession } = useCustomerSession();
  const [leadDialogMode, setLeadDialogMode] = useState<LeadDialogMode | null>(null);
  const [purchaseSelection, setPurchaseSelection] = useState<PurchaseSelection | null>(null);
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname as CustomerRoute,
    search: window.location.search,
  }));

  const navigate = (href: string, replace = false) => {
    const nextUrl = new URL(href, window.location.origin);
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', `${nextUrl.pathname}${nextUrl.search}`);
    setLocation({
      pathname: nextUrl.pathname as CustomerRoute,
      search: nextUrl.search,
    });
  };

  useEffect(() => {
    const handlePopState = () => {
      setLocation({
        pathname: window.location.pathname as CustomerRoute,
        search: window.location.search,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (location.pathname === '/dashboard' || location.pathname === '/account' || location.pathname === '/payment/success') {
      void refresh();
    }
  }, [location.pathname, refresh]);

  useEffect(() => {
    if (!session.authenticated || !session.user || purchaseSelection) {
      return;
    }

    if (location.pathname !== '/dashboard' && location.pathname !== '/account') {
      return;
    }

    const params = new URLSearchParams(location.search);
    const checkoutPackage = params.get('checkout');

    if (checkoutPackage === 'gold' || checkoutPackage === 'platinum') {
      setPurchaseSelection({ label: checkoutPackage, packageCode: checkoutPackage });
      params.delete('checkout');
      if (!params.get('section')) {
        params.set('section', 'plan');
      }
      navigate(`/account${params.toString() ? `?${params.toString()}` : ''}`, true);
    }
  }, [location.pathname, location.search, navigate, purchaseSelection, session.authenticated, session.user]);

  const closePurchaseFlow = () => {
    setPurchaseSelection(null);

    if (location.pathname === '/dashboard' || location.pathname === '/account') {
      const params = new URLSearchParams(location.search);
      if (params.has('checkout')) {
        params.delete('checkout');
        navigate(`/account${params.toString() ? `?${params.toString()}` : ''}`, true);
      }
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { credentials: 'same-origin', method: 'POST' });
    setSession({ authenticated: false, user: null });
    navigate('/', true);
  };

  const openLeadDialog = (mode: LeadDialogMode) => {
    if (!session.authenticated || !session.user) {
      const params = new URLSearchParams();
      params.set('next', 'sample');
      navigate(`/login?${params.toString()}`);
      return;
    }

    if (!session.user.emailVerified) {
      navigate('/verify-email');
      return;
    }

    if (!session.user.phoneVerified) {
      navigate('/verify-phone');
      return;
    }

    setLeadDialogMode(mode);
  };

  const openPurchaseFlow = (selection: PurchaseSelection) => {
    if ('packageCode' in selection && selection.packageCode === 'starter') {
      if (!session.authenticated || !session.user) {
        const params = new URLSearchParams();
        params.set('next', 'account');
        params.set('section', 'plan');
        navigate(`/signup?${params.toString()}`);
        return;
      }

      if (!session.user.emailVerified) {
        navigate('/verify-email?next=account&section=plan');
        return;
      }

      if (!session.user.phoneVerified) {
        navigate('/verify-phone?next=account&section=plan');
        return;
      }

      navigate('/account?section=plan');
      return;
    }

    if (!session.authenticated || !session.user) {
      const params = new URLSearchParams();
      params.set('next', 'checkout');
      if ('packageCode' in selection) {
        params.set('package', selection.packageCode);
      }
      navigate(`/signup?${params.toString()}`);
      return;
    }

    if (!session.user.emailVerified) {
      const params = new URLSearchParams();
      params.set('next', 'checkout');
      if ('packageCode' in selection) {
        params.set('package', selection.packageCode);
      }
      navigate(`/verify-email?${params.toString()}`);
      return;
    }

    if (!session.user.phoneVerified) {
      const params = new URLSearchParams();
      params.set('next', 'checkout');
      if ('packageCode' in selection) {
        params.set('package', selection.packageCode);
      }
      navigate(`/verify-phone?${params.toString()}`);
      return;
    }

    setPurchaseSelection(selection);
  };

  const sections = [
    { id: 'cover', label: 'Home', component: <Frame01Cover onSampleClick={() => openLeadDialog('sample')} /> },
    { id: 'viral-proof', label: 'Proof', component: <Frame02ViralProof /> },
    { id: 'b2b-agent', label: 'Sales Agent', component: <Frame03B2B onPilotClick={() => openLeadDialog('pilot')} /> },
    { id: 'creator-studio', label: 'Creators', component: <Frame04Creator onSampleClick={() => openLeadDialog('sample')} /> },
    { id: 'pricing', label: 'Pricing', component: <Frame05Roadmap onPlanSelect={(planCode) => openPurchaseFlow({ label: planCode, packageCode: planCode })} /> },
    { id: 'positioning', label: 'Products', component: <Frame06Positioning /> },
  ];

  const customerPath = location.pathname;
  const isAuthRoute =
    customerPath === '/login' ||
    customerPath === '/signup' ||
    customerPath === '/forgot-password' ||
    customerPath === '/reset-password' ||
    customerPath === '/verify-email' ||
    customerPath === '/verify-phone';

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#EEEBE4] px-5 text-[#373A40]">
        <div className="rounded-2xl border border-[#D2CCBE] bg-white/80 px-5 py-3 text-sm font-medium">
          Loading Bangla Voice AI...
        </div>
      </main>
    );
  }

  if (customerPath === '/dashboard' || customerPath === '/account') {
    if (!session.authenticated || !session.user) {
      navigate('/login', true);
      return null;
    }

    return (
      <>
        <CustomerAccountPage onNavigate={navigate} onSessionRefresh={refresh} onStartPurchase={openPurchaseFlow} search={location.search} user={session.user} />
        <PaymentMethodDialog
          onClose={closePurchaseFlow}
          onPurchaseComplete={() => {
            void refresh();
          }}
          selection={purchaseSelection}
        />
      </>
    );
  }

  if (customerPath === '/payment/success') {
    return <CustomerPaymentSuccessPage onNavigate={navigate} onRefreshSession={refresh} search={location.search} />;
  }

  if (isAuthRoute) {
    return (
      <CustomerAuthRoutes
        onAuthenticated={(nextSession) => {
          setSession(nextSession);
          void refresh();
        }}
        onNavigate={navigate}
        route={customerPath}
        search={location.search}
      />
    );
  }

  return (
    <main className="w-full overflow-x-hidden bg-[#EEEBE4] text-[#373A40] font-['Hind_Siliguri']">
      <header className="fixed left-0 right-0 top-0 z-50 overflow-x-hidden border-b border-[#D2CCBE]/70 bg-[#EEEBE4]/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8 lg:px-10">
          <a href="#cover" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#AE6C4A] text-lg font-bold text-[#EEEBE4]">
              ব
            </span>
            <span className="hidden text-sm font-bold uppercase tracking-[0.14em] text-[#373A40] sm:block">
              Bangla Voice AI
            </span>
          </a>

          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3 md:gap-4">
            <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5A5048] md:flex">
              {sections.slice(1).map((section) => (
                <a key={section.id} href={`#${section.id}`} className="transition hover:text-[#AE6C4A]">
                  {section.label}
                </a>
              ))}
            </nav>
            {session.authenticated && session.user ? (
              <>
                <div className="inline-flex max-w-[calc(100vw-7.25rem)] items-center rounded-full border border-[#D2CCBE] bg-white/88 px-2.5 py-2 text-[11px] font-semibold text-[#5A5048] shadow-[0_10px_28px_rgba(55,58,64,0.08)] sm:max-w-none sm:px-4 sm:text-sm">
                  <span className="text-[#8D5D45] sm:hidden">Tokens</span>
                  <span className="hidden text-[#8D5D45] sm:inline">Tokens Left:</span>
                  <span className="ml-2 truncate text-[#2F343B]">{session.user.tokenBalance.toLocaleString()}</span>
                </div>
                <UserAccountMenu onLogout={handleLogout} onNavigate={navigate} user={session.user} />
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="rounded-full border border-[#D2CCBE] bg-white/80 px-3 py-2 text-[11px] font-semibold text-[#5A5048] transition hover:border-[#C39680] hover:text-[#AE6C4A] sm:px-4 sm:text-sm"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="rounded-full bg-[#AE6C4A] px-3 py-2 text-[11px] font-semibold text-[#EEEBE4] transition hover:brightness-95 sm:px-4 sm:text-sm"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className={`relative w-full ${index > 0 ? 'scroll-mt-16' : ''}`}
        >
          {section.component}
        </section>
      ))}

      <section id="faq" className="relative w-full scroll-mt-16">
        <Frame07FAQ />
      </section>

      <LeadCaptureDialog
        mode={leadDialogMode}
        open={leadDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLeadDialogMode(null);
          }
        }}
      />
      <PaymentMethodDialog
        onClose={closePurchaseFlow}
        onPurchaseComplete={() => {
          void refresh();
        }}
        selection={purchaseSelection}
      />
    </main>
  );
}
