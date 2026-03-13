import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Sparkles, Crown, Trophy, Star } from 'lucide-react';
import Download1 from '../imports/Download1';

interface WelcomeScreenProps {
  onComplete: () => void;
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [currentPhase, setCurrentPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setCurrentPhase(1), 500),
      setTimeout(() => setCurrentPhase(2), 1200),
      setTimeout(() => setCurrentPhase(3), 2000),
      setTimeout(() => onComplete(), 4500),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 relative overflow-hidden min-h-screen">
      {/* Dynamic Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="absolute inset-0"
      >
        {/* Gradient Waves */}
        <motion.div
          animate={{
            background: [
              'radial-gradient(circle at 20% 30%, #ADC8FF 0%, transparent 50%)',
              'radial-gradient(circle at 80% 70%, #091A7A 0%, transparent 50%)',
              'radial-gradient(circle at 40% 80%, #ADC8FF 0%, transparent 50%)'
            ]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 opacity-20"
        />
      </motion.div>

      {/* Floating Success Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {[Crown, Trophy, Star, Sparkles].map((Icon, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              scale: 0,
              x: Math.random() * 400,
              y: Math.random() * 800
            }}
            animate={{ 
              opacity: [0, 0.6, 0],
              scale: [0, 1, 0],
              rotate: [0, 360],
              x: [
                Math.random() * 400,
                Math.random() * 400,
                Math.random() * 400
              ],
              y: [
                Math.random() * 800,
                Math.random() * 600,
                Math.random() * 400
              ]
            }}
            transition={{
              duration: 3,
              delay: 1 + (i * 0.3),
              ease: "easeOut"
            }}
            className="absolute"
          >
            <Icon 
              size={24} 
              className="text-[#ADC8FF]"
            />
          </motion.div>
        ))}
      </div>

      {/* Main Success Animation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 flex flex-col items-center text-center w-full max-w-sm mx-auto"
      >
        {/* Success Icon with Ripple Effect */}
        {currentPhase >= 1 && (
          <div className="relative mb-6">
            {/* Ripple Effects */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [0, 2, 3],
                  opacity: [0, 0.3, 0]
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.3,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: "easeOut"
                }}
                className="absolute inset-0 w-24 h-24 rounded-full border-2 border-[#10B981]"
              />
            ))}
            
            {/* Main Success Circle */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                duration: 0.8,
                type: "spring",
                bounce: 0.4,
                delay: 0.2
              }}
              className="relative w-24 h-24 bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] rounded-full flex items-center justify-center shadow-elevated ring-4 ring-white/30 overflow-hidden"
            >
              {/* Enhanced Shine Effect */}
              <motion.div
                animate={{ 
                  x: ['-150%', '150%'],
                  opacity: [0, 0.6, 0]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
              />
              
              {/* Inner Glow */}
              <motion.div
                animate={{ 
                  scale: [0.8, 1.1, 0.8],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-3 bg-white/20 rounded-full"
              />
              
              {/* Modern SVG Checkmark */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  delay: 0.6, 
                  duration: 0.4,
                  type: "spring",
                  bounce: 0.6
                }}
                className="w-12 h-12 text-white relative z-10"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
                    d="M6 13L10 17L18 9"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>

              {/* Sparkles around success icon */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: [0, 1, 0],
                    opacity: [0, 1, 0],
                    x: [0, Math.cos(i * 45 * Math.PI / 180) * 40],
                    y: [0, Math.sin(i * 45 * Math.PI / 180) * 40]
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 1 + (i * 0.1),
                    repeat: Infinity,
                    repeatDelay: 2
                  }}
                  className="absolute w-2 h-2 bg-[#F59E0B] rounded-full"
                />
              ))}
            </motion.div>
          </div>
        )}

        {/* Welcome Message */}
        {currentPhase >= 2 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ 
              duration: 0.8,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="mb-5"
          >
            <motion.h1 
              className="mb-2"
              style={{
                fontSize: '26px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #091A7A 0%, #10B981 50%, #ADC8FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: 'Lexend, sans-serif',
                lineHeight: '1.2'
              }}
            >
              {["Welcome", "to", "ContraQuest!"].map((word, i) => (
                <motion.span
                  key={i}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ 
                    delay: i * 0.1,
                    duration: 0.5,
                    ease: "easeOut"
                  }}
                  className="inline-block mr-2"
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>
            
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-body max-w-sm mx-auto leading-relaxed"
              style={{
                fontSize: '14px',
                color: '#6B7280',
                fontFamily: 'Lexend, sans-serif',
                lineHeight: '1.5'
              }}
            >
              🎉 Your account has been created successfully! Get ready to embark on an amazing learning adventure.
            </motion.p>
          </motion.div>
        )}

        {/* Feature Highlights */}
        {currentPhase >= 3 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ 
              duration: 0.6,
              ease: "easeOut"
            }}
            className="space-y-3 mb-5 w-full"
          >
            {[
              { icon: "🧠", text: "AI-Powered Learning" },
              { icon: "🏆", text: "Gamified Challenges" },
              { icon: "📊", text: "Track Your Progress" }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ 
                  delay: i * 0.15,
                  duration: 0.5,
                  ease: "easeOut"
                }}
                className="flex items-center space-x-3 bg-card-glass border border-white/20 rounded-[14px] px-4 py-3 backdrop-blur-lg shadow-card"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-[#ADC8FF]/20 to-[#091A7A]/10 rounded-[10px] flex items-center justify-center">
                  <span className="text-sm">{feature.icon}</span>
                </div>
                <span className="text-small font-medium text-[#091A7A] flex-1">
                  {feature.text}
                </span>
                <div className="ml-auto">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ 
                      delay: 1.5 + i * 0.2,
                      duration: 0.8,
                      ease: "easeInOut"
                    }}
                  >
                    <Sparkles size={14} className="text-[#ADC8FF]" />
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* App Logo */}
        {currentPhase >= 2 && (
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ 
              duration: 0.6, 
              delay: 0.6,
              type: "spring",
              bounce: 0.3
            }}
            className="relative"
          >
            {/* Logo Glow */}
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 w-16 h-16 bg-[#091A7A]/20 rounded-[16px] blur-lg"
            />
            
            {/* Logo Container */}
            <div className="relative w-16 h-16 bg-card-glass border border-white/30 rounded-[16px] p-3 shadow-elevated backdrop-blur-lg">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-full h-full text-[#091A7A]"
              >
                <Download1 />
              </motion.div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Celebration Confetti */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              scale: 0, 
              y: window.innerHeight || 800,
              x: Math.random() * (window.innerWidth || 400)
            }}
            animate={{ 
              opacity: [0, 1, 0],
              scale: [0, 1, 0.5],
              y: -100,
              x: Math.random() * (window.innerWidth || 400),
              rotate: [0, 720]
            }}
            transition={{
              duration: 3,
              delay: 1 + Math.random() * 2,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="absolute w-3 h-3 rounded-full"
            style={{
              backgroundColor: [
                '#091A7A', '#ADC8FF', '#10B981', '#F59E0B', '#EF4444'
              ][Math.floor(Math.random() * 5)],
            }}
          />
        ))}
      </div>

      {/* Progress Indicator */}
      {currentPhase >= 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="absolute bottom-12 left-1/2 transform -translate-x-1/2"
        >
          <motion.div
            animate={{
              width: ['0%', '100%'],
              opacity: [0.3, 1, 0.3]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="h-1 bg-gradient-to-r from-[#091A7A] via-[#ADC8FF] to-[#091A7A] rounded-full"
            style={{ width: '48px' }}
          />
        </motion.div>
      )}
    </div>
  );
}