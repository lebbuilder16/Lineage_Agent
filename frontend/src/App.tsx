import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingScreen } from './components/LandingScreen';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { CookieConsent } from './components/CookieConsent';
import { AppLayout } from './layouts/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

const TokenWorkspace = lazy(() => import('./pages/TokenWorkspace'));
const RadarScreen = lazy(() => import('./pages/RadarScreen'));
const CompareScreen = lazy(() => import('./pages/CompareScreen'));
const WatchlistScreen = lazy(() => import('./pages/WatchlistScreen'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'rgba(255,255,255,0.3)' }}>
      Loading...
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CookieConsent />
        <Routes>
          {/* Landing + Privacy — no AppLayout */}
          <Route path="/" element={<LandingScreen />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />

          {/* App pages — share AppLayout */}
          <Route element={<AppLayout />}>
            <Route path="/token/:mint" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><TokenWorkspace /></Suspense></ErrorBoundary>} />
            <Route path="/radar" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><RadarScreen /></Suspense></ErrorBoundary>} />
            <Route path="/compare" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><CompareScreen /></Suspense></ErrorBoundary>} />
            <Route path="/watchlist" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><WatchlistScreen /></Suspense></ErrorBoundary>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
