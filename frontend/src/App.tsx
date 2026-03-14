import { useState, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StatusBar } from './components/StatusBar';
import { BottomNavigation } from './components/BottomNavigation';
import { LandingScreen } from './components/LandingScreen';
import { RadarScreen } from './components/RadarScreen';
import { LineageScanScreen } from './components/LineageScanScreen';
import { DeathClockScreen } from './components/DeathClockScreen';
import { AlertsScreen } from './components/AlertsScreen';
import { AIChatScreen } from './components/AIChatScreen';
import { WatchlistScreen } from './components/WatchlistScreen';
import type { TokenSearchResult } from './types/api';

const DeployerProfileScreen = lazy(() =>
  import('./components/DeployerProfileScreen').then((m) => ({ default: m.DeployerProfileScreen }))
);
const SolTraceScreen = lazy(() =>
  import('./components/SolTraceScreen').then((m) => ({ default: m.SolTraceScreen }))
);
const CartelScreen = lazy(() =>
  import('./components/CartelScreen').then((m) => ({ default: m.CartelScreen }))
);
const CompareScreen = lazy(() =>
  import('./components/CompareScreen').then((m) => ({ default: m.CompareScreen }))
);
const FamilyTreeScreen = lazy(() =>
  import('./components/FamilyTreeScreen').then((m) => ({ default: m.FamilyTreeScreen }))
);

export type Screen =
  | 'landing' | 'radar' | 'scan' | 'death-clock' | 'alerts'
  | 'watchlist' | 'ai-chat'
  | 'deployer' | 'sol-trace' | 'cartel' | 'compare' | 'family-tree';

const BOTTOM_NAV_SCREENS: Screen[] = ['radar', 'scan', 'death-clock', 'alerts', 'watchlist'];

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('landing');
  const [previousScreen, setPreviousScreen] = useState<Screen>('radar');
  const [selectedToken, setSelectedToken] = useState<TokenSearchResult | null>(null);
  const [selectedDeployer, setSelectedDeployer] = useState<string | null>(null);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const [compareMints, setCompareMints] = useState<[string, string]>(['', '']);

  const navigateTo = useCallback((screen: Screen) => {
    setCurrentScreen((prev) => {
      if (prev !== 'ai-chat') setPreviousScreen(prev);
      return screen;
    });
  }, []);

  const handleTokenSelect = useCallback((token: TokenSearchResult) => {
    setSelectedToken(token);
    setSelectedMint(token.mint);
  }, []);

  const handleNavigateDeployer = useCallback((address: string) => {
    setSelectedDeployer(address);
    navigateTo('deployer');
  }, [navigateTo]);

  const handleNavigateSolTrace = useCallback((mint: string) => {
    setSelectedMint(mint);
    navigateTo('sol-trace');
  }, [navigateTo]);

  const handleNavigateCartel = useCallback((fingerprint: string) => {
    setSelectedFingerprint(fingerprint);
    navigateTo('cartel');
  }, [navigateTo]);

  const handleNavigateFamilyTree = useCallback((mint: string) => {
    setSelectedMint(mint);
    navigateTo('family-tree');
  }, [navigateTo]);

  const handleNavigateCompare = useCallback((mintA: string, mintB = '') => {
    setCompareMints([mintA, mintB]);
    navigateTo('compare');
  }, [navigateTo]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'landing':
        return <LandingScreen onNavigate={navigateTo} />;
      case 'radar':
        return <RadarScreen onTokenSelect={handleTokenSelect} onNavigate={navigateTo} onNavigateCompare={handleNavigateCompare} />;
      case 'scan':
        return (
          <LineageScanScreen
            selectedToken={selectedToken}
            onNavigateDeployer={handleNavigateDeployer}
            onNavigateSolTrace={handleNavigateSolTrace}
            onNavigateCartel={handleNavigateCartel}
            onNavigateFamilyTree={handleNavigateFamilyTree}
            onNavigateToken={(token) => { handleTokenSelect(token); navigateTo('scan'); }}
          />
        );
      case 'death-clock':
        return <DeathClockScreen selectedToken={selectedToken} />;
      case 'alerts':
        return <AlertsScreen onNavigateToken={(mint) => { setSelectedMint(mint); navigateTo('scan'); }} />;
      case 'watchlist':
        return <WatchlistScreen selectedToken={selectedToken} onNavigate={navigateTo} />;
      case 'ai-chat':
        return <AIChatScreen selectedToken={selectedToken} onBack={() => navigateTo(previousScreen)} />;
      case 'deployer':
        return (
          <Suspense fallback={<ScreenLoader />}>
            <DeployerProfileScreen
              address={selectedDeployer ?? ''}
              onNavigateSolTrace={handleNavigateSolTrace}
              onNavigateCartel={handleNavigateCartel}
              onNavigateToken={(mint) => { handleTokenSelect({ mint, name: '', symbol: '' }); navigateTo('scan'); }}
              onBack={() => navigateTo(previousScreen)}
            />
          </Suspense>
        );
      case 'sol-trace':
        return (
          <Suspense fallback={<ScreenLoader />}>
            <SolTraceScreen mint={selectedMint ?? ''} onBack={() => navigateTo(previousScreen)} />
          </Suspense>
        );
      case 'cartel':
        return (
          <Suspense fallback={<ScreenLoader />}>
            <CartelScreen
              fingerprint={selectedFingerprint ?? ''}
              onNavigateDeployer={handleNavigateDeployer}
              onBack={() => navigateTo(previousScreen)}
            />
          </Suspense>
        );
      case 'compare':
        return (
          <Suspense fallback={<ScreenLoader />}>
            <CompareScreen initialMints={compareMints} onBack={() => navigateTo(previousScreen)} />
          </Suspense>
        );
      case 'family-tree':
        return (
          <Suspense fallback={<ScreenLoader />}>
            <FamilyTreeScreen
              mint={selectedMint ?? selectedToken?.mint ?? ''}
              onNavigateToken={(mint) => { handleTokenSelect({ mint, name: '', symbol: '' }); navigateTo('scan'); }}
              onBack={() => navigateTo(previousScreen)}
            />
          </Suspense>
        );
      default:
        return <RadarScreen onTokenSelect={handleTokenSelect} onNavigate={navigateTo} onNavigateCompare={handleNavigateCompare} />;
    }
  };

  const isLanding = currentScreen === 'landing';
  const isDetailOrChat = !BOTTOM_NAV_SCREENS.includes(currentScreen) && !isLanding;
  const showBottomNav = !isLanding && !isDetailOrChat;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-2 md:p-4 overflow-hidden relative">
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" style={{ background: '#6F6ACF' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full mix-blend-screen filter blur-[100px] opacity-10" style={{ background: '#ADCEFF' }} />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative scale-[0.7] sm:scale-[0.8] md:scale-90 lg:scale-100 origin-center"
      >
        <div className="absolute inset-0 bg-black/40 rounded-[3.5rem] blur-3xl transform translate-y-12 scale-110" />

        {/* Hardware Casing */}
        <div className="relative w-[428px] h-[926px] bg-[#0A0A07] rounded-[3.5rem] shadow-2xl border border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent rounded-[3.5rem] pointer-events-none" />
          <div className="absolute -left-1 top-[180px] w-1.5 h-12 bg-gradient-to-r from-gray-700 to-gray-900 rounded-l-md" />
          <div className="absolute -left-1 top-[240px] w-1.5 h-12 bg-gradient-to-r from-gray-700 to-gray-900 rounded-l-md" />
          <div className="absolute -right-1 top-[200px] w-1.5 h-16 bg-gradient-to-l from-gray-700 to-gray-900 rounded-r-md" />

          {/* Screen Bezel */}
          <div className="absolute inset-[6px] bg-[#0A0A07] rounded-[3.2rem] overflow-hidden">
            {/* Status Bar */}
            <div className="absolute top-0 left-0 right-0 z-[60] pt-2">
              <StatusBar textColor="white" />
            </div>
            {/* Dynamic Island */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-full z-50" />

            {/* App Content */}
            <div className="absolute inset-0 rounded-[3.2rem] overflow-hidden flex flex-col">
              {/* Aurora Background Blobs */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[50%] rounded-full mix-blend-screen filter blur-[80px] opacity-40 animate-pulse"
                  style={{ background: 'radial-gradient(circle, #6F6ACF 0%, transparent 70%)', animationDuration: '8s' }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[90%] h-[60%] rounded-full mix-blend-screen filter blur-[100px] opacity-15 animate-pulse"
                  style={{ background: 'radial-gradient(circle, #ADCEFF 0%, transparent 70%)', animationDuration: '12s', animationDelay: '2s' }} />
                <div className="absolute top-[30%] left-[20%] w-[60%] h-[40%] rounded-full mix-blend-screen filter blur-[90px] animate-pulse"
                  style={{ background: 'radial-gradient(circle, #00FF88 0%, transparent 70%)', opacity: 0.04, animationDuration: '15s', animationDelay: '4s' }} />
              </div>

              {!isLanding && <div className="pt-14 z-10 flex-shrink-0" />}

              <div className="flex-1 overflow-y-auto scrollbar-hide relative z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentScreen}
                    initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full"
                  >
                    {renderScreen()}
                  </motion.div>
                </AnimatePresence>
                {showBottomNav && <div className="h-32" />}
              </div>

              {showBottomNav && (
                <>
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigateTo('ai-chat')}
                    className="absolute bottom-[108px] right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6F6ACF, #ADCEFF)', boxShadow: '0 4px 20px rgba(111,106,207,0.45)' }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.button>
                  <BottomNavigation currentScreen={currentScreen} onScreenChange={navigateTo} />
                </>
              )}

              {/* Home Indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[60]">
                <div className="w-36 h-1.5 bg-white/25 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default App;
