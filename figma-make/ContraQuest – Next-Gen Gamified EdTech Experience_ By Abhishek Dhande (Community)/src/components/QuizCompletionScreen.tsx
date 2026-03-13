import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Star, 
  Flame, 
  Target, 
  ArrowRight, 
  RotateCcw, 
  Share2,
  Medal,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Clock
} from 'lucide-react';

interface QuizCompletionScreenProps {
  onBack: () => void;
  onRetakeQuiz: () => void;
  onNextChallenge: () => void;
  userXP: number;
  xpGained: number;
  streakCount: number;
  completionTime: string;
  accuracy: number;
  totalQuestions: number;
  correctAnswers: number;
  stageName: string;
}

export function QuizCompletionScreen({
  onBack,
  onRetakeQuiz,
  onNextChallenge,
  userXP,
  xpGained,
  streakCount,
  completionTime,
  accuracy,
  totalQuestions,
  correctAnswers,
  stageName
}: QuizCompletionScreenProps) {
  const [showConfetti, setShowConfetti] = useState(true);
  const [currentStat, setCurrentStat] = useState(0);

  const stats = [
    {
      icon: <Target className="w-6 h-6" />,
      label: "Accuracy",
      value: `${accuracy}%`,
      color: "emerald"
    },
    {
      icon: <Clock className="w-6 h-6" />,
      label: "Time",
      value: completionTime,
      color: "blue"
    },
    {
      icon: <CheckCircle2 className="w-6 h-6" />,
      label: "Correct",
      value: `${correctAnswers}/${totalQuestions}`,
      color: "green"
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      label: "XP Gained",
      value: `+${xpGained}`,
      color: "purple"
    }
  ];

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % stats.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getPerformanceLevel = () => {
    if (accuracy >= 90) return { level: "Excellent", color: "emerald", emoji: "🏆" };
    if (accuracy >= 80) return { level: "Great", color: "blue", emoji: "⭐" };
    if (accuracy >= 70) return { level: "Good", color: "orange", emoji: "👍" };
    return { level: "Keep Practicing", color: "gray", emoji: "💪" };
  };

  const performance = getPerformanceLevel();

  // Simple confetti effect
  const Confetti = () => (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            y: -100, 
            x: Math.random() * window.innerWidth,
            rotate: 0,
            opacity: 1
          }}
          animate={{ 
            y: window.innerHeight + 100,
            rotate: 360,
            opacity: 0
          }}
          transition={{
            duration: Math.random() * 3 + 2,
            delay: Math.random() * 2,
            ease: "easeOut"
          }}
          className={`absolute w-3 h-3 ${
            i % 4 === 0 ? 'bg-yellow-400' :
            i % 4 === 1 ? 'bg-blue-400' :
            i % 4 === 2 ? 'bg-emerald-400' : 'bg-purple-400'
          } rounded-full`}
        />
      ))}
    </div>
  );

  return (
    <div className="h-full bg-gradient-to-br from-[#ADC8FF]/20 via-white to-[#E8F2FF]/30 relative overflow-hidden">
      {showConfetti && <Confetti />}
      
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 10, 0],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-[#091A7A]/10 to-[#4F8EFF]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, -15, 0],
            opacity: [0.1, 0.15, 0.1]
          }}
          transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          className="absolute -bottom-20 -left-20 w-80 h-80 bg-gradient-to-br from-[#ADC8FF]/10 to-[#4F8EFF]/10 rounded-full blur-3xl"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Header Section */}
        <div className="pt-12 px-6 text-center">
          {/* Trophy Animation */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 15,
              delay: 0.3 
            }}
            className="mb-6"
          >
            <div className="relative inline-flex">
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-2xl shadow-yellow-500/25">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              {/* Floating sparkles around trophy */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                <Sparkles className="absolute -top-2 left-2 w-4 h-4 text-yellow-400" />
                <Sparkles className="absolute top-2 -right-2 w-5 h-5 text-orange-400" />
                <Sparkles className="absolute -bottom-2 right-2 w-3 h-3 text-yellow-500" />
                <Sparkles className="absolute bottom-2 -left-2 w-4 h-4 text-orange-300" />
              </motion.div>
            </div>
          </motion.div>

          {/* Success Message */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-2xl font-bold text-[#091A7A] mb-2">
              {stageName} Complete! 🎉
            </h1>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              performance.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
              performance.color === 'blue' ? 'bg-blue-100 text-blue-700' :
              performance.color === 'orange' ? 'bg-orange-100 text-orange-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <span>{performance.emoji}</span>
              <span>{performance.level}</span>
            </div>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="px-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/40"
          >
            <h2 className="text-lg font-semibold text-[#091A7A] text-center mb-6">Your Performance</h2>
            
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1 + index * 0.1 }}
                  className={`p-4 rounded-2xl border transition-all duration-300 ${
                    currentStat === index 
                      ? 'bg-[#091A7A]/5 border-[#091A7A]/20 shadow-lg' 
                      : 'bg-gray-50/50 border-gray-100'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                    stat.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                    stat.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                    stat.color === 'green' ? 'bg-green-100 text-green-600' :
                    stat.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {stat.icon}
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{stat.label}</p>
                  <p className="text-lg font-bold text-[#091A7A]">{stat.value}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Rewards Section */}
        <div className="px-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="bg-gradient-to-r from-[#091A7A]/5 to-[#4F8EFF]/5 backdrop-blur-xl rounded-3xl p-6 border border-[#ADC8FF]/30"
          >
            <h3 className="font-semibold text-[#091A7A] mb-4 text-center">Rewards Earned</h3>
            
            <div className="flex items-center justify-center gap-8">
              {/* XP Reward */}
              <div className="text-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center mb-2 mx-auto">
                  <Star className="w-6 h-6 text-yellow-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">XP Gained</p>
                <p className="font-bold text-[#091A7A]">+{xpGained}</p>
              </div>

              {/* Streak Bonus */}
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-2 mx-auto">
                  <Flame className="w-6 h-6 text-orange-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">Day Streak</p>
                <p className="font-bold text-[#091A7A]">{streakCount} days</p>
              </div>

              {/* Achievement */}
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-2 mx-auto">
                  <Medal className="w-6 h-6 text-purple-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">Badge</p>
                <p className="font-bold text-[#091A7A] text-xs">Quiz Master</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Action Buttons */}
        <div className="flex-1 flex flex-col justify-end px-6 pb-8 space-y-4">
          {/* Primary Action */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNextChallenge}
            className="w-full bg-gradient-to-r from-[#091A7A] to-[#4F8EFF] text-white py-4 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2"
          >
            <span>Continue Learning</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>

          {/* Secondary Actions */}
          <div className="flex gap-3">
            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onRetakeQuiz}
              className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake</span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {/* Handle share */}}
              className="flex-1 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              className="px-4 bg-white/90 backdrop-blur-xl border border-white/40 text-[#091A7A] py-3 rounded-2xl font-medium shadow-sm"
            >
              Home
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}