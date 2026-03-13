import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { MathIcon2D } from './2d-icons/MathIcon2D';
import { EnglishIcon2D } from './2d-icons/EnglishIcon2D';
import { ScienceIcon2D } from './2d-icons/ScienceIcon2D';
import { SocialStudiesIcon2D } from './2d-icons/SocialStudiesIcon2D';

interface Subject {
  id: string;
  name: string;
  description: string;
  progress: number;
  icon: React.ReactNode;
  color: string;
}

interface SubjectsSectionProps {
  onSubjectClick: (subject: Subject) => void;
}

export function SubjectsSection({ onSubjectClick }: SubjectsSectionProps) {
  const subjects: Subject[] = [
    {
      id: 'math',
      name: 'Mathematics',
      description: 'Equations, Geometry & more',
      progress: 40,
      icon: <MathIcon2D />,
      color: 'from-[#091A7A] to-[#3B82F6]'
    },
    {
      id: 'english',
      name: 'English',
      description: 'Grammar, Reading & Writing',
      progress: 53,
      icon: <EnglishIcon2D />,
      color: 'from-[#091A7A] to-[#10B981]'
    },
    {
      id: 'science',
      name: 'Science',
      description: 'Explore Physics, Chemistry, Biology',
      progress: 33,
      icon: <ScienceIcon2D />,
      color: 'from-[#091A7A] to-[#8B5CF6]'
    },
    {
      id: 'social',
      name: 'Social Studies',
      description: 'History, Civics & Geography',
      progress: 35,
      icon: <SocialStudiesIcon2D />,
      color: 'from-[#091A7A] to-[#F59E0B]'
    }
  ];

  // Calculate circumference for progress animation
  const circumference = 2 * Math.PI * 30; // radius = 30px

  return (
    <div className="relative mx-6 mb-6">
      {/* Floating ambient particles around the subject area */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -inset-8">
        <motion.div
          className="absolute top-16 left-4 w-1.5 h-1.5 bg-gradient-to-br from-[#ADC8FF]/40 to-[#091A7A]/20 rounded-full blur-sm"
          animate={{
            y: [0, -25, 0],
            x: [0, 15, 0],
            scale: [0.4, 1.2, 0.4],
            opacity: [0.2, 0.7, 0.2]
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5
          }}
        />
        <motion.div
          className="absolute top-32 right-8 w-1 h-1 bg-gradient-to-br from-[#091A7A]/30 to-[#ADC8FF]/40 rounded-full blur-sm"
          animate={{
            y: [0, -18, 0],
            x: [0, -12, 0],
            scale: [0.3, 0.9, 0.3],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        <motion.div
          className="absolute bottom-20 left-16 w-0.5 h-0.5 bg-gradient-to-br from-[#ADC8FF]/50 to-[#091A7A]/10 rounded-full blur-sm"
          animate={{
            y: [0, -30, 0],
            x: [0, 20, 0],
            scale: [0.5, 1.5, 0.5],
            opacity: [0.4, 0.8, 0.4]
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4
          }}
        />
        <motion.div
          className="absolute top-24 right-2 w-2 h-2 bg-gradient-to-br from-yellow-300/30 to-orange-300/20 rounded-full blur-sm"
          animate={{
            y: [0, -22, 0],
            x: [0, -8, 0],
            scale: [0.2, 1, 0.2],
            opacity: [0.2, 0.5, 0.2],
            rotate: [0, 180, 360]
          }}
          transition={{
            duration: 11,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 6
          }}
        />
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <motion.h3 
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          style={{
            fontFamily: 'Lexend, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
            color: '#091A7A'
          }}
        >
          Subjects at a Glance
        </motion.h3>
        <motion.button
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.98 }}
          style={{
            fontFamily: 'Lexend, sans-serif',
            fontWeight: 500,
            fontSize: '12px',
            color: '#6B7280'
          }}
          className="px-3 py-1 rounded-[50px] transition-all duration-200"
        >
          View all
        </motion.button>
      </div>
      
      {/* Subjects Grid - 2×2 with exact specifications and perfect bottom spacing */}
      <div className="grid grid-cols-2 gap-5">
        {subjects.map((subject, index) => (
          <motion.div
            key={subject.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSubjectClick(subject)}
            className="relative flex-1 cursor-pointer"
          >
            {/* 2D Icon - Floating with beautiful organic animations */}
            <motion.div 
              className="absolute -top-4 right-2 opacity-90 z-50 pointer-events-none"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ 
                opacity: 0.90,
                scale: 1,
                y: [0, -8, 0],
                x: [0, 3, 0],
                rotate: [0, 2, -1, 0]
              }}
              transition={{ 
                opacity: { delay: 0.8 + index * 0.2, duration: 0.8 },
                scale: { delay: 0.8 + index * 0.2, duration: 0.8, type: "spring", stiffness: 200 },
                y: {
                  duration: 6 + index * 0.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1 + index * 0.3
                },
                x: {
                  duration: 8 + index * 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5 + index * 0.4
                },
                rotate: {
                  duration: 10 + index * 0.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.6
                }
              }}
              style={{ 
                filter: 'drop-shadow(0 6px 20px rgba(9, 26, 122, 0.15))'
              }}
            >
              {subject.icon}
              
              {/* Ambient floating sparkles around each icon */}
              <motion.div
                className="absolute -top-2 -left-2 w-1.5 h-1.5 bg-yellow-400/60 rounded-full"
                animate={{ 
                  scale: [0, 1, 0],
                  opacity: [0, 0.8, 0],
                  rotate: [0, 180, 360]
                }}
                transition={{ 
                  duration: 3 + index * 0.5,
                  repeat: Infinity,
                  delay: 2 + index * 0.8,
                  ease: "easeInOut"
                }}
              />
              
              <motion.div
                className="absolute -bottom-1 -right-2 w-1 h-1 bg-cyan-400/70 rounded-full"
                animate={{ 
                  scale: [0, 1.2, 0],
                  opacity: [0, 0.9, 0],
                  x: [0, 4, 0],
                  y: [0, -3, 0]
                }}
                transition={{ 
                  duration: 2.5 + index * 0.3,
                  repeat: Infinity,
                  delay: 3 + index * 0.7,
                  ease: "easeInOut"
                }}
              />
              
              <motion.div
                className="absolute top-1 right-1 w-0.5 h-0.5 bg-purple-400/50 rounded-full"
                animate={{ 
                  scale: [0, 0.8, 0],
                  opacity: [0, 0.6, 0],
                  x: [0, -3, 0],
                  y: [0, 5, 0]
                }}
                transition={{ 
                  duration: 4 + index * 0.4,
                  repeat: Infinity,
                  delay: 4 + index * 0.5,
                  ease: "easeInOut"
                }}
              />
            </motion.div>

            {/* Subject Card Container - Clean without icon inside */}
            <div 
              className="relative p-4 backdrop-blur-lg border rounded-[40px] overflow-hidden group"
              style={{
                height: '155px',
                background: 'linear-gradient(135deg, rgba(173, 200, 255, 0.9) 0%, rgba(173, 200, 255, 0.7) 100%)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: '0 25px 50px -12px rgba(9, 26, 122, 0.25)'
              }}
            >
              {/* Achievement Star Badge for 70%+ progress */}
              {subject.progress >= 70 && (
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 1 + index * 0.1, type: "spring", stiffness: 300 }}
                  className="absolute -top-2 -right-2 z-30"
                >
                  <div 
                    className="p-1 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #facc15 0%, #f97316 100%)'
                    }}
                  >
                    <Star className="w-4 h-4 text-white" fill="currentColor" />
                  </div>
                </motion.div>
              )}

              {/* Content Container - Perfectly centered with 2px spacing */}
              <div className="h-full flex flex-col items-center justify-center text-center" style={{ gap: '2px' }}>
                
                {/* Circular Progress Bar - Centered */}
                <motion.div
                  className="relative"
                >
                  <svg 
                    viewBox="0 0 80 80" 
                    className="size-20"
                    style={{
                      filter: 'drop-shadow(0 4px 8px rgba(9, 26, 122, 0.15))'
                    }}
                  >
                    {/* Progress Gradient Definition */}
                    <defs>
                      <linearGradient id={`progressGradient-${subject.id}`} x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#091a7a" />
                        <stop offset="50%" stopColor="#1a2fb8" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                    
                    {/* Background Circle */}
                    <circle
                      cx="40"
                      cy="40"
                      r="30"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.3)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      style={{
                        filter: 'drop-shadow(0 2px 4px rgba(9, 26, 122, 0.1))'
                      }}
                    />
                    
                    {/* Progress Circle */}
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="30"
                      fill="none"
                      stroke={`url(#progressGradient-${subject.id})`}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      initial={{ strokeDashoffset: circumference }}
                      animate={{ 
                        strokeDashoffset: circumference - (subject.progress / 100) * circumference 
                      }}
                      transition={{ 
                        delay: 0.7 + index * 0.1, 
                        duration: 1.5, 
                        ease: "easeOut" 
                      }}
                      transform="rotate(-90 40 40)"
                      style={{
                        filter: 'drop-shadow(0 2px 4px rgba(9, 26, 122, 0.2))'
                      }}
                    />
                  </svg>
                  
                  {/* Progress Percentage Text */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ 
                      delay: 1 + index * 0.1, 
                      duration: 0.5, 
                      type: "spring", 
                      stiffness: 300 
                    }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span
                      style={{
                        fontFamily: 'Lexend, sans-serif',
                        fontWeight: 500,
                        fontSize: '16px',
                        color: '#091A7A'
                      }}
                    >
                      {subject.progress}%
                    </span>
                  </motion.div>
                </motion.div>

                {/* Subject Information - Centered below progress circle */}
                <div className="space-y-1">
                  {/* Subject Title */}
                  <h4
                    style={{
                      fontFamily: 'Lexend, sans-serif',
                      fontWeight: 500,
                      fontSize: '14px',
                      lineHeight: '18px',
                      color: '#091A7A'
                    }}
                  >
                    {subject.name}
                  </h4>
                  
                  {/* Subject Description */}
                  <p
                    style={{
                      fontFamily: 'Lexend, sans-serif',
                      fontWeight: 500,
                      fontSize: '10px',
                      lineHeight: '12px',
                      color: '#525252'
                    }}
                  >
                    {subject.description}
                  </p>
                </div>
              </div>

              {/* Enhanced glass morphism overlay */}
              <div 
                className="absolute inset-0 pointer-events-none rounded-[40px]"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%)'
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}