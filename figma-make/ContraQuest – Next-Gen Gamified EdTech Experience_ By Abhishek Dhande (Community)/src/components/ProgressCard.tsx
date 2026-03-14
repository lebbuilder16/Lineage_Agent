import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import Icons from '../imports/Icons-13-1005';
import { useState, useEffect } from 'react';

interface ProgressCardProps {
  illustrationImage: string;
  onStartQuiz: () => void;
  currentProgress?: number;
  totalQuizzesCompleted?: number;
}

export function ProgressCard({ 
  illustrationImage, 
  onStartQuiz, 
  currentProgress = 40,
  totalQuizzesCompleted = 0 
}: ProgressCardProps) {
  const [animatedProgress, setAnimatedProgress] = useState(currentProgress);
  const [displayProgress, setDisplayProgress] = useState(currentProgress);

  useEffect(() => {
    if (currentProgress !== animatedProgress) {
      // Animate progress change
      const duration = 1500;
      const steps = 30;
      const startProgress = animatedProgress;
      const progressDiff = currentProgress - startProgress;
      const increment = progressDiff / steps;
      
      let currentStep = 0;
      const timer = setInterval(() => {
        currentStep++;
        const newProgress = startProgress + (increment * currentStep);
        setDisplayProgress(Math.round(newProgress));
        
        if (currentStep >= steps) {
          clearInterval(timer);
          setDisplayProgress(currentProgress);
          setAnimatedProgress(currentProgress);
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [currentProgress]);

  const getProgressMessage = () => {
    if (displayProgress >= 80) {
      return "Almost there! Complete one more quiz to reach your daily goal.";
    } else if (displayProgress >= 60) {
      return "Great progress! You're more than halfway to your daily target.";
    } else if (displayProgress >= 40) {
      return `Your progress bar is at ${displayProgress}%. Finish today's quiz to unlock rewards.`;
    } else {
      return `Start your learning journey! Complete quizzes to reach ${displayProgress}% progress.`;
    }
  };
  const characterImage = "https://images.unsplash.com/photo-1653671689368-13b828d04421?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHwzZCUyMHN0dWRlbnQlMjBjaGFyYWN0ZXIlMjBsZWFybmluZyUyMGVkdWNhdGlvbiUyMGNhcnRvb258ZW58MXx8fHwxNzU3NTEzMDc2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="relative"
    >
      {/* Reference Books Icon - Beautiful floating animations */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20, rotate: -10 }}
        animate={{ 
          opacity: 0.95, 
          scale: 1, 
          rotate: 0,
          y: [0, -12, 0],
          x: [0, 4, 0],
          rotateY: [0, 5, 0]
        }}
        transition={{ 
          opacity: { delay: 0.6, duration: 0.8 },
          scale: { delay: 0.6, duration: 0.8, type: "spring", stiffness: 200 },
          rotate: { delay: 0.6, duration: 0.8 },
          y: {
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.2
          },
          x: {
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8
          },
          rotateY: {
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }
        }}
        className="absolute -top-6 right-2 opacity-95 z-50 pointer-events-none"
        style={{
          width: '85px',
          height: '85px',
          filter: 'drop-shadow(0 8px 20px rgba(9, 26, 122, 0.25))',
          transformStyle: 'preserve-3d'
        }}
      >
        <Icons />
        
        {/* Magical floating particles around the book icon */}
        <motion.div
          className="absolute -top-3 -left-3 w-2 h-2 bg-yellow-400/60 rounded-full"
          animate={{ 
            scale: [0, 1.2, 0],
            opacity: [0, 0.8, 0],
            rotate: [0, 180, 360],
            x: [0, 6, 0],
            y: [0, -4, 0]
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            delay: 2.5,
            ease: "easeInOut"
          }}
        />
        
        <motion.div
          className="absolute -bottom-2 -right-3 w-1.5 h-1.5 bg-cyan-400/70 rounded-full"
          animate={{ 
            scale: [0, 1, 0],
            opacity: [0, 0.9, 0],
            x: [0, -5, 0],
            y: [0, 3, 0]
          }}
          transition={{ 
            duration: 3.5,
            repeat: Infinity,
            delay: 3.8,
            ease: "easeInOut"
          }}
        />
        
        <motion.div
          className="absolute top-2 right-2 w-1 h-1 bg-purple-400/50 rounded-full"
          animate={{ 
            scale: [0, 0.8, 0],
            opacity: [0, 0.6, 0],
            x: [0, -3, 0],
            y: [0, 6, 0]
          }}
          transition={{ 
            duration: 5,
            repeat: Infinity,
            delay: 5.2,
            ease: "easeInOut"
          }}
        />
        
        <motion.div
          className="absolute top-4 left-1 w-0.5 h-0.5 bg-pink-400/60 rounded-full"
          animate={{ 
            scale: [0, 1.5, 0],
            opacity: [0, 0.7, 0],
            x: [0, 4, 0],
            y: [0, -8, 0]
          }}
          transition={{ 
            duration: 6,
            repeat: Infinity,
            delay: 1.8,
            ease: "easeInOut"
          }}
        />
      </motion.div>

      {/* Main Card Container - Matching DailyStreak size */}
      <div 
        className="relative p-6 bg-card-glass backdrop-blur-lg rounded-[20px] shadow-card overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(173, 200, 255, 0.9) 0%, rgba(173, 200, 255, 0.7) 100%)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: `
            0 8px 32px rgba(9, 26, 122, 0.3),
            0 4px 16px rgba(9, 26, 122, 0.2),
            0 2px 8px rgba(9, 26, 122, 0.15)
          `,
          position: 'relative'
        }}
      >
        {/* Content Container */}
        <div className="relative z-10 h-full">
          {/* Title - Exact typography specifications */}
          <motion.h3 
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            style={{
              fontFamily: 'Lexend, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              color: '#091A7A',
              lineHeight: '1.3',
              marginBottom: '8px'
            }}
          >
            Level Up Your Learning !
          </motion.h3>
          
          {/* Description with max width constraint */}
          <motion.p 
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              fontFamily: 'Lexend, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              color: '#6B7280',
              lineHeight: '1.4',
              maxWidth: 'calc(100% - 64px)', // Leave space for character
              marginBottom: '16px'
            }}
          >
            {getProgressMessage()}
          </motion.p>
          
          {/* Progress Bar Container - Positioned below subtitle */}
          <div 
            style={{
              width: 'calc(100% - 64px)', // Align with arrow position
              height: '6px',
              marginBottom: '16px'
            }}
          >
            {/* Progress Bar Background */}
            <div 
              style={{
                width: '100%',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '3px',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                position: 'relative'
              }}
            >
              {/* Progress Fill - Animated */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${displayProgress}%` }}
                transition={{ delay: 0.7, duration: 1.5, ease: "easeOut" }}
                style={{
                  height: '6px',
                  background: 'linear-gradient(90deg, #091A7A 0%, #1A2FB8 100%)',
                  borderRadius: '3px',
                  position: 'relative'
                }}
              >
                {/* Progress Dot - Follows animation */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.2, duration: 0.3, type: "spring", stiffness: 300 }}
                  style={{
                    position: 'absolute',
                    right: '-6px',
                    top: '-3px',
                    width: '12px',
                    height: '12px',
                    background: '#FFFFFF',
                    border: '2px solid #091A7A',
                    borderRadius: '50%',
                    boxShadow: '0 2px 8px rgba(9, 26, 122, 0.3)'
                  }}
                />
              </motion.div>
            </div>
          </div>
        </div>



        {/* Circular Action Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onStartQuiz}
          className="absolute bottom-4 right-4 w-12 h-12 bg-white rounded-full shadow-interactive border-none cursor-pointer flex items-center justify-center z-15"
          style={{
            boxShadow: '0 10px 25px -5px rgba(9, 26, 122, 0.3), 0 8px 10px -6px rgba(9, 26, 122, 0.2)'
          }}
        >
          <ArrowRight 
            className="w-6 h-6" 
            style={{ color: '#091A7A' }} 
          />
        </motion.button>

        {/* Subtle pulse animation for button */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-4 right-4 w-12 h-12 pointer-events-none rounded-full z-14"
          style={{
            background: 'rgba(173, 200, 255, 0.3)'
          }}
        />

        {/* Enhanced glass morphism overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%)',
            borderRadius: '20px'
          }}
        />
      </div>
    </motion.div>
  );
}