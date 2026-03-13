import { motion } from 'motion/react';
import { Activity, Search, Skull, Bell, User } from 'lucide-react';
import { Screen } from '../App';

interface BottomNavigationProps {
  currentScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export function BottomNavigation({ currentScreen, onScreenChange }: BottomNavigationProps) {
  const navItems = [
    { id: 'radar' as Screen, label: 'Radar', icon: Activity },
    { id: 'scan' as Screen, label: 'Scan', icon: Search },
    { id: 'death-clock' as Screen, label: 'Clock', icon: Skull },
    { id: 'alerts' as Screen, label: 'Alerts', icon: Bell },
    { id: 'profile' as Screen, label: 'Profile', icon: User },
  ];

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-8 left-4 right-4 z-40"
    >
      {/* Floating Glass Island */}
      <div className="bg-card-glass rounded-[var(--radius-pill)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-white/[0.03] to-transparent pointer-events-none" />
        
        <div className="px-3 py-2.5 relative z-10">
          <div className="flex justify-between items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              
              return (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onScreenChange(item.id)}
                  className="flex flex-col items-center gap-1 w-[56px] min-h-[48px] justify-center relative"
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute inset-0 bg-secondary/12 rounded-full"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  
                  <motion.div
                    animate={{
                      y: isActive ? -1 : 0,
                      scale: isActive ? 1.1 : 1,
                      color: isActive ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.35)'
                    }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="relative z-10"
                  >
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                    {isActive && (
                      <motion.div 
                        layoutId="glow"
                        className="absolute inset-0 bg-secondary blur-md opacity-30 rounded-full"
                      />
                    )}
                  </motion.div>
                  
                  <motion.span 
                    animate={{
                      opacity: isActive ? 1 : 0,
                      height: isActive ? 'auto' : 0,
                      scale: isActive ? 1 : 0.8
                    }}
                    transition={{ duration: 0.2 }}
                    className="text-tiny z-10 text-secondary"
                    style={{ fontWeight: 600 }}
                  >
                    {isActive ? item.label : ''}
                  </motion.span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
