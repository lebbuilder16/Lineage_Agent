import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { CommandPalette } from './components/CommandPalette';

/* ── Lazy pages ─────────────────────────────────────── */
const LandingPage = lazy(() => import('./components/LandingScreen').then(m => ({ default: m.LandingScreen })));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SolTracePage = lazy(() => import('./pages/SolTracePage'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const ff = {
  font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
  black: '#000000',
  white: '#ffffff',
  gray: '#6B6B6B',
};

/* ── Spinner ────────────────────────────────────────── */
function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #f0f0f0', borderTop: '2px solid #000', borderRadius: '50%', animation: 'ff-pulse 0.8s linear infinite' }} />
    </div>
  );
}

/* ── Arrow Icon ─────────────────────────────────────── */
function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg className="ff-arrow" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ── Nav (hidden on landing — it has its own) ── */
function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  // Landing page has its own nav
  if (location.pathname === '/') return null;

  const linkStyle = {
    fontSize: 20, color: ff.black, textDecoration: 'none', letterSpacing: '-1px',
    fontFamily: ff.font, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  } as const;

  return (
    <header>
      <nav aria-label="Main navigation" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 53,
        background: ff.white, borderBottom: `1px solid ${ff.black}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 15px', zIndex: 9999, fontFamily: ff.font,
      }}>
        <Link to="/" style={{ textDecoration: 'none' }} aria-label="Lineage Agent — home">
          <span style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-0.48px', color: ff.black, fontFamily: ff.font }}>
            Lineage
          </span>
        </Link>

        {/* Desktop links */}
        <div className="ff-hide-mobile" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <button onClick={() => navigate('/search')} style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Sol Trace <ArrowRight size={18} />
          </button>
        </div>

        {/* Mobile burger */}
        <button
          className="ff-show-mobile"
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4, color: ff.black }}
        >
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div role="navigation" aria-label="Mobile menu" style={{
          position: 'fixed', top: 53, left: 0, right: 0, zIndex: 9998,
          background: ff.white, borderBottom: `1px solid ${ff.black}`,
          padding: '20px 15px', display: 'flex', flexDirection: 'column', gap: 20,
          fontFamily: ff.font,
        }}>
          <button onClick={() => { navigate('/search'); setMenuOpen(false); }} style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Sol Trace <ArrowRight size={18} />
          </button>
        </div>
      )}
    </header>
  );
}

/* ── App Shell (location-aware layout) ─────────────── */
function AppShell() {
  const location = useLocation();
  const isFullscreen = location.pathname === '/';

  return (
    <>
      <Nav />
      <main id="main-content" style={{
        paddingTop: isFullscreen ? 0 : 'calc(53px + 30px)',
        paddingLeft: isFullscreen ? 0 : 15,
        paddingRight: isFullscreen ? 0 : 15,
        paddingBottom: isFullscreen ? 0 : 60,
        minHeight: '100vh',
        fontFamily: ff.font,
      }}>
        <Routes>
          <Route path="/" element={<ErrorBoundary><Suspense fallback={<Loader />}><LandingPage /></Suspense></ErrorBoundary>} />
          <Route path="/search" element={<ErrorBoundary><Suspense fallback={<Loader />}><SearchPage /></Suspense></ErrorBoundary>} />
          <Route path="/sol-trace/:mint" element={<ErrorBoundary><Suspense fallback={<Loader />}><SolTracePage /></Suspense></ErrorBoundary>} />
          <Route path="/privacy" element={<ErrorBoundary><Suspense fallback={<Loader />}><PrivacyPolicy /></Suspense></ErrorBoundary>} />
        </Routes>
      </main>
    </>
  );
}

/* ── App ────────────────────────────────────────────── */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        <CookieConsent />
        <CommandPalette />
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
