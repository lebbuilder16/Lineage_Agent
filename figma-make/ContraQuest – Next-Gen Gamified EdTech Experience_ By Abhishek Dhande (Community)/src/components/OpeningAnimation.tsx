import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import Download1 from '../imports/Download1';

interface OpeningAnimationProps {
  onAnimationComplete: () => void;
}

export function OpeningAnimation({ onAnimationComplete }: OpeningAnimationProps) {
  const [currentPhase, setCurrentPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setCurrentPhase(1), 300),
      setTimeout(() => setCurrentPhase(2), 1200),
      setTimeout(() => setCurrentPhase(3), 2000),
      setTimeout(() => onAnimationComplete(), 4000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onAnimationComplete]);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Dynamic Wave Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: 1,
          background: [
            'radial-gradient(circle at 20% 20%, #091A7A 0%, #ADC8FF 40%, #ffffff 100%)',
            'radial-gradient(circle at 80% 30%, #ADC8FF 0%, #091A7A 50%, #ffffff 100%)',
            'radial-gradient(circle at 40% 80%, #091A7A 0%, #ADC8FF 60%, #ffffff 100%)',
            'radial-gradient(circle at 70% 10%, #ADC8FF 0%, #091A7A 40%, #ffffff 100%)',
            'radial-gradient(circle at 20% 70%, #091A7A 0%, #ADC8FF 50%, #ffffff 100%)'
          ]
        }}
        transition={{ 
          duration: 1,
          background: { repeat: Infinity, duration: 8, ease: "easeInOut" }
        }}
        className="absolute inset-0 opacity-30"
      />

      {/* Additional Wave Layers */}
      <motion.div
        animate={{ 
          background: [
            'linear-gradient(45deg, transparent 0%, #ADC8FF 30%, transparent 60%)',
            'linear-gradient(135deg, transparent 0%, #091A7A 20%, transparent 40%)',
            'linear-gradient(225deg, transparent 0%, #ADC8FF 40%, transparent 70%)',
            'linear-gradient(315deg, transparent 0%, #091A7A 25%, transparent 50%)'
          ]
        }}
        transition={{ 
          background: { repeat: Infinity, duration: 6, ease: "easeInOut" }
        }}
        className="absolute inset-0 opacity-20"
      />

      {/* Flowing Wave Overlay */}
      <motion.div
        animate={{ 
          background: [
            'conic-gradient(from 0deg at 50% 50%, transparent 0deg, #ADC8FF 90deg, transparent 180deg, #091A7A 270deg, transparent 360deg)',
            'conic-gradient(from 90deg at 50% 50%, transparent 0deg, #091A7A 90deg, transparent 180deg, #ADC8FF 270deg, transparent 360deg)',
            'conic-gradient(from 180deg at 50% 50%, transparent 0deg, #ADC8FF 90deg, transparent 180deg, #091A7A 270deg, transparent 360deg)',
            'conic-gradient(from 270deg at 50% 50%, transparent 0deg, #091A7A 90deg, transparent 180deg, #ADC8FF 270deg, transparent 360deg)'
          ]
        }}
        transition={{ 
          background: { repeat: Infinity, duration: 10, ease: "linear" }
        }}
        className="absolute inset-0 opacity-15"
      />

      {/* Floating Orbs */}
      <div className="absolute inset-0">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * 400,
              y: Math.random() * 800,
              opacity: 0,
              scale: 0
            }}
            animate={{ 
              opacity: [0, 0.6, 0],
              scale: [0, 1, 0],
              x: [
                Math.random() * 400,
                Math.random() * 400,
                Math.random() * 400
              ],
              y: [
                Math.random() * 800,
                Math.random() * 800,
                Math.random() * 800
              ]
            }}
            transition={{
              duration: 4,
              delay: Math.random() * 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute w-3 h-3 rounded-full"
            style={{
              background: `linear-gradient(45deg, #ADC8FF, #091A7A)`,
              filter: 'blur(1px)'
            }}
          />
        ))}
      </div>

      {/* Main Content Container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="relative z-10 flex flex-col items-center justify-center text-center px-8"
      >
        {/* Logo Container with Glass Morphism */}
        {currentPhase >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0
            }}
            transition={{ 
              duration: 0.8,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="relative mb-12"
          >
            {/* Multiple Glowing Rings with Wave Effect */}
            <motion.div
              animate={{ 
                rotate: 360
              }}
              transition={{ 
                rotate: { duration: 8, repeat: Infinity, ease: "linear" }
              }}
              className="absolute inset-0 w-32 h-32 rounded-full bg-gradient-to-r from-[#ADC8FF] via-[#091A7A] to-[#ADC8FF] opacity-30"
              style={{ filter: 'blur(8px)' }}
            />
            
            <motion.div
              animate={{ 
                rotate: -360
              }}
              transition={{ 
                rotate: { duration: 12, repeat: Infinity, ease: "linear" }
              }}
              className="absolute inset-2 w-28 h-28 rounded-full bg-gradient-to-l from-[#091A7A] via-[#ADC8FF] to-[#091A7A] opacity-25"
              style={{ filter: 'blur(6px)' }}
            />
            
            {/* Main Logo Container - Pre-filled with Color */}
            <div className="relative w-32 h-32 bg-gradient-to-br from-[#091A7A] to-[#ADC8FF] border border-white/30 rounded-[2rem] p-6 shadow-elevated backdrop-blur-lg">
              {/* Inner Glow */}
              <div className="absolute inset-2 bg-gradient-to-br from-white/30 to-transparent rounded-[1.5rem]" />
              
              {/* Logo */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="relative w-full h-full flex items-center justify-center text-white"
              >
                <Download1 />
              </motion.div>

              {/* Enhanced Sparkle Effects */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    x: [0, Math.cos(i * 60 * Math.PI / 180) * 25],
                    y: [0, Math.sin(i * 60 * Math.PI / 180) * 25]
                  }}
                  transition={{
                    duration: 2,
                    delay: 1 + (i * 0.2),
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                  className="absolute w-2 h-2 bg-white rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Brand Name */}
        {currentPhase >= 2 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ 
              duration: 0.8,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="text-center mb-6"
          >
            {"ContraQuest".split("").map((letter, i) => (
              <motion.span
                key={i}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ 
                  delay: i * 0.05,
                  duration: 0.5,
                  ease: "easeOut"
                }}
                className="inline-block relative"
                style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: '#ffffff',
                  fontFamily: 'Lexend, sans-serif',
                  textShadow: '0 2px 15px rgba(9, 26, 122, 0.4), 0 4px 25px rgba(173, 200, 255, 0.3)',
                  filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.2))'
                }}
              >
                {letter}
              </motion.span>
            ))}
          </motion.div>
        )}

        {/* Tagline */}
        {currentPhase >= 3 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ 
              duration: 0.6,
              ease: "easeOut"
            }}
            className="text-center"
          >
            <motion.p 
              animate={{
                opacity: [0.8, 1, 0.8]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-body max-w-sm mx-auto"
              style={{
                fontSize: '16px',
                fontWeight: 500,
                color: '#ffffff',
                fontFamily: 'Lexend, sans-serif',
                textShadow: '0 2px 10px rgba(9, 26, 122, 0.6), 0 1px 3px rgba(0, 0, 0, 0.3)'
              }}
            >
              Embark on your learning adventure
            </motion.p>
          </motion.div>
        )}
      </motion.div>

      {/* Bottom Pulse Indicator */}
      {currentPhase >= 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-20 left-1/2 transform -translate-x-1/2"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-16 h-1 bg-gradient-to-r from-transparent via-[#ADC8FF] to-transparent rounded-full"
          />
        </motion.div>
      )}
    </div>
  );
}