import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Target, Zap, CheckCircle } from 'lucide-react';

interface ProgressNotificationProps {
  show: boolean;
  type: 'xp-gain' | 'level-up' | 'streak' | 'achievement' | 'quiz-complete';
  title: string;
  subtitle?: string;
  xpGain?: number;
  onComplete?: () => void;
}

export function ProgressNotification({ 
  show, 
  type, 
  title, 
  subtitle, 
  xpGain, 
  onComplete 
}: ProgressNotificationProps) {
  
  const getIcon = () => {
    switch (type) {
      case 'xp-gain':
        return <Zap className="w-6 h-6 text-yellow-400" fill="currentColor" />;
      case 'level-up':
        return <Trophy className="w-6 h-6 text-yellow-400" />;
      case 'streak':
        return <Star className="w-6 h-6 text-orange-400" fill="currentColor" />;
      case 'achievement':
        return <Target className="w-6 h-6 text-green-400" />;
      case 'quiz-complete':
        return <CheckCircle className="w-6 h-6 text-green-400" />;
      default:
        return <Zap className="w-6 h-6 text-blue-400" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'xp-gain':
        return {
          bg: 'from-yellow-500 to-orange-500',
          border: 'border-yellow-400/50',
          shadow: 'shadow-yellow-500/25'
        };
      case 'level-up':
        return {
          bg: 'from-yellow-400 to-yellow-600',
          border: 'border-yellow-300/50',
          shadow: 'shadow-yellow-500/30'
        };
      case 'streak':
        return {
          bg: 'from-orange-500 to-red-500',
          border: 'border-orange-400/50',
          shadow: 'shadow-orange-500/25'
        };
      case 'achievement':
        return {
          bg: 'from-green-500 to-emerald-500',
          border: 'border-green-400/50',
          shadow: 'shadow-green-500/25'
        };
      case 'quiz-complete':
        return {
          bg: 'from-blue-500 to-indigo-500',
          border: 'border-blue-400/50',
          shadow: 'shadow-blue-500/25'
        };
      default:
        return {
          bg: 'from-blue-500 to-purple-500',
          border: 'border-blue-400/50',
          shadow: 'shadow-blue-500/25'
        };
    }
  };

  const colors = getColors();

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm z-[100] rounded-[3rem]"
            onClick={onComplete}
          />
          
          {/* Notification Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25,
              duration: 0.5 
            }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[101]"
          >
            <div className={`
              relative p-5 bg-gradient-to-br ${colors.bg} 
              rounded-2xl shadow-2xl ${colors.shadow} 
              border ${colors.border} backdrop-blur-xl
              min-w-[260px] max-w-[300px]
            `}>
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-50" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-2xl" />
              
              {/* Content */}
              <div className="relative z-10 text-center">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="mb-3 flex justify-center"
                >
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    {getIcon()}
                  </div>
                </motion.div>

                {/* Title */}
                <motion.h3
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-base font-semibold text-white mb-1"
                >
                  {title}
                </motion.h3>

                {/* Subtitle */}
                {subtitle && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-white/90 text-xs mb-3"
                  >
                    {subtitle}
                  </motion.p>
                )}

                {/* XP Gain */}
                {xpGain && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="flex items-center justify-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 backdrop-blur-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" fill="currentColor" />
                    <span className="text-white font-medium text-xs">+{xpGain} XP</span>
                  </motion.div>
                )}

                {/* Auto-close timer */}
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 3, ease: "linear" }}
                  className="absolute bottom-0 left-0 h-1 bg-white/30 rounded-b-2xl origin-left"
                  style={{ width: '100%' }}
                  onAnimationComplete={onComplete}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}