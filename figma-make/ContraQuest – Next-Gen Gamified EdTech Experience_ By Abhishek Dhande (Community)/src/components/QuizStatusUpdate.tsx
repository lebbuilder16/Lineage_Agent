import { motion, AnimatePresence } from 'motion/react';
import { Zap, CheckCircle, XCircle } from 'lucide-react';

interface QuizStatusUpdateProps {
  show: boolean;
  isCorrect: boolean;
  xpGained: number;
  questionNumber: number;
  totalQuestions: number;
}

export function QuizStatusUpdate({ 
  show, 
  isCorrect, 
  xpGained, 
  questionNumber, 
  totalQuestions 
}: QuizStatusUpdateProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50"
        >
          <div className={`
            flex items-center gap-3 px-4 py-3 rounded-2xl backdrop-blur-xl border shadow-lg
            ${isCorrect 
              ? 'bg-green-500/90 border-green-400/50 text-white' 
              : 'bg-red-500/90 border-red-400/50 text-white'
            }
          `}>
            {/* Status Icon */}
            <div className="flex-shrink-0">
              {isCorrect ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
            </div>

            {/* Status Text */}
            <div className="flex flex-col">
              <span className="font-medium text-sm">
                {isCorrect ? 'Correct!' : 'Incorrect'}
              </span>
              <span className="text-xs opacity-90">
                Question {questionNumber}/{totalQuestions}
              </span>
            </div>

            {/* XP Gain (only for correct answers) */}
            {isCorrect && xpGained > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-1"
              >
                <Zap className="w-3 h-3 text-yellow-300" fill="currentColor" />
                <span className="text-xs font-medium">+{xpGained}</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}