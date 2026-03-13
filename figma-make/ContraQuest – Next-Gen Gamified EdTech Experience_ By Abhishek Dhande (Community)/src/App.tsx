import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StatusBar } from './components/StatusBar';
import { BottomNavigation } from './components/BottomNavigation';
import { LandingScreen } from './components/LandingScreen';
import { LoginScreen } from './components/LoginScreen';
import { RadarScreen } from './components/RadarScreen';
import { LineageScanScreen } from './components/LineageScanScreen';
import { DeathClockScreen } from './components/DeathClockScreen';
import { AlertsScreen } from './components/AlertsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { AIChatScreen } from './components/AIChatScreen';

export type Screen = 'landing' | 'login' | 'radar' | 'scan' | 'death-clock' | 'alerts' | 'profile' | 'ai-chat';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('landing');
  const [previousScreen, setPreviousScreen] = useState<Screen>('radar');
  const [selectedToken, setSelectedToken] = useState<any>(null);

  const handleTokenSelect = useCallback((token: any) => {
    setSelectedToken(token);
  }, []);

  const navigateTo = useCallback((screen: Screen) => {
    setCurrentScreen(prev => {
      if (prev !== 'ai-chat') {
        setPreviousScreen(prev);
      }
      return screen;
    });
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'landing':
        return <LandingScreen onNavigate={navigateTo} />;
      case 'login':
        return <LoginScreen onNavigate={navigateTo} />;
      case 'radar':
        return <RadarScreen onTokenSelect={handleTokenSelect} onNavigate={navigateTo} />;
      case 'scan':
        return <LineageScanScreen selectedToken={selectedToken} />;
      case 'death-clock':
        return <DeathClockScreen selectedToken={selectedToken} />;
      case 'alerts':
        return <AlertsScreen />;
      case 'profile':
        return <ProfileScreen />;
      case 'ai-chat':
        return <AIChatScreen onBack={() => setCurrentScreen(previousScreen)} />;
      default:
        return <LandingScreen onNavigate={navigateTo} />;
    }
  };

  const isAuthScreen = currentScreen === 'landing' || currentScreen === 'login';
  const isFullScreen = currentScreen === 'ai-chat';
  const showBottomNav = !isAuthScreen && !isFullScreen;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-2 md:p-4 overflow-hidden relative">
      {/* Outer ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary rounded-full mix-blend-screen filter blur-[120px] opacity-50 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary rounded-full mix-blend-screen filter blur-[100px] opacity-20" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative scale-[0.7] sm:scale-[0.8] md:scale-90 lg:scale-100 origin-center"
      >
        {/* Device Shadow */}
        <div className="absolute inset-0 bg-black/40 rounded-[3.5rem] blur-3xl transform translate-y-12 scale-110" />
        <div className="absolute inset-0 bg-primary/20 rounded-[3.5rem] blur-2xl transform translate-y-8 scale-105" />
        
        {/* Hardware Casing */}
        <div className="relative w-[428px] h-[926px] bg-[#0A0A0A] rounded-[3.5rem] shadow-2xl border border-[#333333]">
          {/* Subtle metal reflection */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-[3.5rem] pointer-events-none" />
          
          {/* Hardware Buttons */}
          <div className="absolute -left-1 top-[180px] w-1.5 h-12 bg-gradient-to-r from-gray-700 to-gray-900 rounded-l-md shadow-inner" />
          <div className="absolute -left-1 top-[210px] w-1.5 h-12 bg-gradient-to-r from-gray-700 to-gray-900 rounded-l-md shadow-inner" />
          <div className="absolute -right-1 top-[200px] w-1.5 h-16 bg-gradient-to-l from-gray-700 to-gray-900 rounded-r-md shadow-inner" />
          
          {/* Screen Bezel */}
          <div className="absolute inset-[6px] bg-black rounded-[3.2rem] shadow-inner overflow-hidden">
            
            {/* Dynamic Island Area */}
            <div className="absolute top-0 left-0 right-0 z-[60] pt-2">
              <StatusBar textColor="white" />
            </div>
            
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] z-50">
              <div className="absolute top-[8px] left-1/2 transform -translate-x-1/2 w-[50px] h-[3px] bg-gray-900 rounded-full" />
              <div className="absolute top-[6px] left-1/2 transform -translate-x-1/2 translate-x-[18px] w-[6px] h-[6px] bg-primary/30 rounded-full ring-1 ring-gray-800" />
            </div>
            
            {/* App Content Area */}
            <div className="absolute inset-0 bg-popover rounded-[3.2rem] overflow-hidden flex flex-col">
              
              {/* Optimized Aurora Background - using CSS animations instead of JS */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                  className="absolute top-[-10%] left-[-20%] w-[80%] h-[50%] bg-primary rounded-full mix-blend-screen filter blur-[80px] opacity-70 animate-pulse"
                  style={{ animationDuration: '8s' }}
                />
                <div 
                  className="absolute bottom-[-10%] right-[-10%] w-[90%] h-[60%] bg-secondary/30 rounded-full mix-blend-screen filter blur-[100px] opacity-50 animate-pulse"
                  style={{ animationDuration: '12s', animationDelay: '2s' }}
                />
                <div 
                  className="absolute top-[30%] left-[20%] w-[60%] h-[40%] bg-[var(--color-success)]/8 rounded-full mix-blend-screen filter blur-[90px] animate-pulse"
                  style={{ animationDuration: '15s', animationDelay: '4s' }}
                />
                {/* Noise texture overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay"></div>
              </div>
              
              {!isAuthScreen && <div className="pt-14 z-10" />}
              
              <div className="flex-1 overflow-y-auto scrollbar-hide relative z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentScreen}
                    initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full"
                  >
                    {renderScreen()}
                  </motion.div>
                </AnimatePresence>
                
                {showBottomNav && <div className="h-32" />}
              </div>
              
              {showBottomNav && (
                <>
                  {/* FAB - Agent Alpha */}
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigateTo('ai-chat')}
                    className="absolute bottom-[108px] right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-secondary to-secondary/80 flex items-center justify-center shadow-[0_4px_20px_rgba(173,200,255,0.35)]"
                  >
                    <div className="absolute inset-[1px] bg-gradient-to-br from-white/20 to-transparent rounded-full pointer-events-none" />
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary relative z-10">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.button>
                  <BottomNavigation currentScreen={currentScreen} onScreenChange={navigateTo} />
                </>
              )}
              
              {/* Home Indicator */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[60]"
              >
                <div className="w-36 h-1.5 bg-white/50 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
              </motion.div>
            </div>
          </div>
        </div>
        
        {/* Ambient screen cast */}
        <div className="absolute inset-2 bg-gradient-to-br from-primary/30 via-transparent to-transparent rounded-[3.5rem] pointer-events-none blur-xl mix-blend-screen" />
      </motion.div>
    </div>
  );
}

export default App;
