import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';

/* ── Lazy pages ─────────────────────────────────────── */
const LandingPage = lazy(() => import('./components/LandingScreen').then(m => ({ default: m.LandingScreen })));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SolTracePage = lazy(() => import('./pages/SolTracePage'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/* ── Spinner ────────────────────────────────────────── */
function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #f0f0f0', borderTop: '2px solid #000', borderRadius: '50%', animation: 'la-pulse 0.8s linear infinite' }} />
    </div>
  );
}

/* ── App ────────────────────────────────────────────── */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        <CookieConsent />
        <main id="main-content">
          <Routes>
            <Route path="/" element={<ErrorBoundary><Suspense fallback={<Loader />}><LandingPage /></Suspense></ErrorBoundary>} />
            <Route path="/search" element={<ErrorBoundary><Suspense fallback={<Loader />}><SearchPage /></Suspense></ErrorBoundary>} />
            <Route path="/sol-trace/:mint" element={<ErrorBoundary><Suspense fallback={<Loader />}><SolTracePage /></Suspense></ErrorBoundary>} />
            <Route path="/privacy" element={<ErrorBoundary><Suspense fallback={<Loader />}><PrivacyPolicy /></Suspense></ErrorBoundary>} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
