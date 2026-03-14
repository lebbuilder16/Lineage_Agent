import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Target, 
  CheckCircle,
  Clock,
  Zap,
  Star,
  Calendar,
  Trophy,
  Play
} from 'lucide-react';

interface DailyChallengesScreenProps {
  onBack: () => void;
  onStartChallenge?: (challengeId: string) => void;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  xpReward: number;
  timeLimit: string;
  completed: boolean;
  icon: any;
  progress?: number;
  total?: number;
}

const dailyChallenges: Challenge[] = [
  {
    id: '1',
    title: 'Quick Math Quiz',
    description: 'Answer 10 algebra questions',
    subject: 'Mathematics',
    difficulty: 'easy',
    xpReward: 50,
    timeLimit: '5 min',
    completed: true,
    icon: Target,
    progress: 10,
    total: 10
  },
  {
    id: '2',
    title: 'Science Sprint',
    description: 'Complete a chemistry quiz',
    subject: 'Science',
    difficulty: 'medium',
    xpReward: 100,
    timeLimit: '10 min',
    completed: false,
    icon: Zap,
    progress: 0,
    total: 1
  },
  {
    id: '3',
    title: 'Grammar Master',
    description: 'Perfect score on grammar quiz',
    subject: 'English',
    difficulty: 'hard',
    xpReward: 150,
    timeLimit: '15 min',
    completed: false,
    icon: Star,
    progress: 0,
    total: 1
  }
];

const weeklyChallenges: Challenge[] = [
  {
    id: 'w1',
    title: 'Week Achiever',
    description: 'Complete 5 quizzes this week',
    subject: 'All Subjects',
    difficulty: 'medium',
    xpReward: 300,
    timeLimit: '7 days',
    completed: false,
    icon: Calendar,
    progress: 2,
    total: 5
  },
  {
    id: 'w2',
    title: 'Perfect Streak',
    description: 'Study for 7 consecutive days',
    subject: 'All Subjects',
    difficulty: 'hard',
    xpReward: 500,
    timeLimit: '7 days',
    completed: false,
    icon: Trophy,
    progress: 3,
    total: 7
  }
];

export function DailyChallengesScreen({ onBack, onStartChallenge }: DailyChallengesScreenProps) {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'from-green-400 to-green-600';
      case 'medium':
        return 'from-yellow-400 to-yellow-600';
      case 'hard':
        return 'from-red-400 to-red-600';
      default:
        return 'from-gray-400 to-gray-600';
    }
  };

  const getDifficultyBadgeColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'hard':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getSubjectColor = (subject: string) => {
    switch (subject.toLowerCase()) {
      case 'mathematics':
        return 'from-blue-500 to-blue-600';
      case 'science':
        return 'from-green-500 to-green-600';
      case 'english':
        return 'from-purple-500 to-purple-600';
      default:
        return 'from-[#091A7A] to-[#1a2b8a]';
    }
  };

  const challenges = activeTab === 'daily' ? dailyChallenges : weeklyChallenges;
  const completedCount = challenges.filter(c => c.completed).length;
  const totalXP = challenges.reduce((sum, c) => sum + (c.completed ? c.xpReward : 0), 0);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#ADC8FF]/10 via-white/50 to-white">
      {/* Header */}
      <div className="bg-card-glass backdrop-blur-lg border-b border-white/20 p-4">
        <div className="flex items-center gap-3 mb-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-white/50"
          >
            <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-[#091A7A]">Daily Challenges</h1>
              <p className="text-xs text-[#091A7A]/70">Complete to earn bonus XP</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-[#091A7A]/70">Completed</span>
            </div>
            <p className="font-bold text-[#091A7A]">{completedCount}/{challenges.length}</p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-[#091A7A]/70">XP Earned</span>
            </div>
            <p className="font-bold text-[#091A7A]">{totalXP} XP</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab('daily')}
            className={`flex-1 py-2 rounded-full font-medium text-sm transition-all ${
              activeTab === 'daily'
                ? 'bg-[#091A7A] text-white shadow-lg'
                : 'bg-white/80 text-[#091A7A] border border-white/50'
            }`}
          >
            Daily
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab('weekly')}
            className={`flex-1 py-2 rounded-full font-medium text-sm transition-all ${
              activeTab === 'weekly'
                ? 'bg-[#091A7A] text-white shadow-lg'
                : 'bg-white/80 text-[#091A7A] border border-white/50'
            }`}
          >
            Weekly
          </motion.button>
        </div>
      </div>

      {/* Challenges List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-3">
          <AnimatePresence mode="wait">
            {challenges.map((challenge, index) => {
              const progressPercent = challenge.progress && challenge.total 
                ? (challenge.progress / challenge.total) * 100 
                : 0;

              return (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-card-glass backdrop-blur-lg rounded-3xl overflow-hidden shadow-card border ${
                    challenge.completed 
                      ? 'border-green-200 bg-green-50/50' 
                      : 'border-white/20'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex gap-3 mb-3">
                      {/* Challenge Icon */}
                      <div className={`w-14 h-14 min-w-[3.5rem] bg-gradient-to-br ${
                        challenge.completed 
                          ? 'from-green-400 to-green-600' 
                          : getSubjectColor(challenge.subject)
                      } rounded-2xl flex items-center justify-center shadow-sm relative`}>
                        {challenge.completed ? (
                          <CheckCircle className="w-7 h-7 text-white" />
                        ) : (
                          <challenge.icon className="w-7 h-7 text-white" />
                        )}
                      </div>

                      {/* Challenge Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-semibold text-[#091A7A]">
                            {challenge.title}
                          </h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            getDifficultyBadgeColor(challenge.difficulty)
                          }`}>
                            {challenge.difficulty}
                          </span>
                        </div>
                        
                        <p className="text-xs text-[#091A7A]/70 mb-2">
                          {challenge.description}
                        </p>

                        {/* Meta Info */}
                        <div className="flex items-center gap-3 text-xs text-[#091A7A]/60 mb-2">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{challenge.timeLimit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            <span className="font-semibold text-yellow-600">+{challenge.xpReward} XP</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {!challenge.completed && challenge.progress !== undefined && challenge.total && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs text-[#091A7A]/60 mb-1">
                              <span>Progress</span>
                              <span>{challenge.progress}/{challenge.total}</span>
                            </div>
                            <div className="h-2 bg-white/40 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                                className={`h-full bg-gradient-to-r ${getDifficultyColor(challenge.difficulty)} rounded-full`}
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Button */}
                        {!challenge.completed && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onStartChallenge?.(challenge.id)}
                            className="w-full py-2 bg-gradient-to-r from-[#091A7A] to-[#1a2b8a] text-white rounded-full text-sm font-medium shadow-sm flex items-center justify-center gap-2"
                          >
                            <Play className="w-4 h-4" fill="currentColor" />
                            <span>Start Challenge</span>
                          </motion.button>
                        )}

                        {challenge.completed && (
                          <div className="flex items-center justify-center gap-2 py-2 bg-green-100 rounded-full">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700">Completed</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Refresh Timer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-4"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 rounded-full border border-white/40">
              <Clock className="w-4 h-4 text-[#091A7A]/60" />
              <span className="text-sm text-[#091A7A]/70">
                New challenges in 12h 34m
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
