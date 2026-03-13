import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Trophy, 
  Award, 
  Target,
  Zap,
  Book,
  Calendar,
  Star,
  Flame,
  Brain,
  Crown,
  Medal,
  Lock
} from 'lucide-react';

interface AchievementsScreenProps {
  onBack: () => void;
  userXP: number;
  streakCount: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: any;
  category: 'learning' | 'streak' | 'mastery' | 'social';
  points: number;
  progress: number;
  total: number;
  earned: boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earnedDate?: string;
}

const achievementsData: Achievement[] = [
  {
    id: '1',
    title: 'First Steps',
    description: 'Complete your first quiz',
    icon: Book,
    category: 'learning',
    points: 50,
    progress: 1,
    total: 1,
    earned: true,
    rarity: 'common',
    earnedDate: '2 days ago'
  },
  {
    id: '2',
    title: 'Week Warrior',
    description: 'Maintain a 7-day learning streak',
    icon: Calendar,
    category: 'streak',
    points: 150,
    progress: 3,
    total: 7,
    earned: false,
    rarity: 'rare'
  },
  {
    id: '3',
    title: 'Math Master',
    description: 'Score 100% on a Mathematics quiz',
    icon: Target,
    category: 'mastery',
    points: 200,
    progress: 1,
    total: 1,
    earned: true,
    rarity: 'epic',
    earnedDate: '1 day ago'
  },
  {
    id: '4',
    title: 'XP Champion',
    description: 'Earn 10,000 total XP',
    icon: Zap,
    category: 'learning',
    points: 300,
    progress: 5500,
    total: 10000,
    earned: false,
    rarity: 'epic'
  },
  {
    id: '5',
    title: 'Perfect Week',
    description: 'Score above 90% on all quizzes this week',
    icon: Star,
    category: 'mastery',
    points: 250,
    progress: 2,
    total: 5,
    earned: false,
    rarity: 'rare'
  },
  {
    id: '6',
    title: 'Hot Streak',
    description: 'Maintain a 30-day learning streak',
    icon: Flame,
    category: 'streak',
    points: 500,
    progress: 3,
    total: 30,
    earned: false,
    rarity: 'legendary'
  },
  {
    id: '7',
    title: 'Knowledge Seeker',
    description: 'Complete 50 quizzes',
    icon: Brain,
    category: 'learning',
    points: 400,
    progress: 12,
    total: 50,
    earned: false,
    rarity: 'epic'
  },
  {
    id: '8',
    title: 'Top of Class',
    description: 'Reach #1 on the leaderboard',
    icon: Crown,
    category: 'social',
    points: 600,
    progress: 0,
    total: 1,
    earned: false,
    rarity: 'legendary'
  },
  {
    id: '9',
    title: 'Subject Expert',
    description: 'Complete all lessons in a subject',
    icon: Medal,
    category: 'mastery',
    points: 350,
    progress: 8,
    total: 15,
    earned: false,
    rarity: 'epic'
  }
];

const categories = [
  { id: 'all', name: 'All', icon: Trophy },
  { id: 'learning', name: 'Learning', icon: Book },
  { id: 'streak', name: 'Streak', icon: Flame },
  { id: 'mastery', name: 'Mastery', icon: Target },
  { id: 'social', name: 'Social', icon: Crown }
];

export function AchievementsScreen({ onBack, userXP, streakCount }: AchievementsScreenProps) {
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredAchievements = activeCategory === 'all' 
    ? achievementsData 
    : achievementsData.filter(a => a.category === activeCategory);

  const earnedCount = achievementsData.filter(a => a.earned).length;
  const totalPoints = achievementsData.filter(a => a.earned).reduce((sum, a) => sum + a.points, 0);

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return 'from-gray-400 to-gray-500';
      case 'rare':
        return 'from-blue-400 to-blue-600';
      case 'epic':
        return 'from-purple-400 to-purple-600';
      case 'legendary':
        return 'from-yellow-400 to-yellow-600';
      default:
        return 'from-gray-400 to-gray-500';
    }
  };

  const getRarityGlow = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return 'shadow-[0_0_20px_rgba(250,204,21,0.4)]';
      case 'epic':
        return 'shadow-[0_0_15px_rgba(168,85,247,0.3)]';
      case 'rare':
        return 'shadow-[0_0_12px_rgba(59,130,246,0.3)]';
      default:
        return '';
    }
  };

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
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-[#091A7A]">Achievements</h1>
              <p className="text-xs text-[#091A7A]/70">{earnedCount}/{achievementsData.length} unlocked</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-[#091A7A]/70">Earned</span>
            </div>
            <p className="font-bold text-[#091A7A]">{earnedCount} Achievements</p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-[#091A7A]/70">Points</span>
            </div>
            <p className="font-bold text-[#091A7A]">{totalPoints} pts</p>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="px-4 py-3 border-b border-white/20">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {categories.map((category) => (
            <motion.button
              key={category.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-all flex items-center gap-2 ${
                activeCategory === category.id
                  ? 'bg-[#091A7A] text-white shadow-lg'
                  : 'bg-white/80 text-[#091A7A] border border-white/50'
              }`}
            >
              <category.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{category.name}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-3">
          <AnimatePresence>
            {filteredAchievements.map((achievement, index) => {
              const progressPercent = (achievement.progress / achievement.total) * 100;
              
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-card-glass backdrop-blur-lg rounded-3xl overflow-hidden shadow-card border border-white/20 ${
                    achievement.earned && achievement.rarity !== 'common' ? getRarityGlow(achievement.rarity) : ''
                  }`}
                >
                  <div className="p-4">
                    <div className="flex gap-3">
                      {/* Achievement Icon */}
                      <div className={`w-16 h-16 min-w-[4rem] bg-gradient-to-br ${
                        achievement.earned 
                          ? getRarityColor(achievement.rarity)
                          : 'from-gray-200 to-gray-300'
                      } rounded-2xl flex items-center justify-center shadow-sm relative`}>
                        {achievement.earned ? (
                          <achievement.icon className="w-8 h-8 text-white" />
                        ) : (
                          <Lock className="w-8 h-8 text-gray-400" />
                        )}
                        
                        {/* Rarity Badge */}
                        {achievement.earned && achievement.rarity !== 'common' && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                            <Star className={`w-3 h-3 ${
                              achievement.rarity === 'legendary' ? 'text-yellow-500' :
                              achievement.rarity === 'epic' ? 'text-purple-500' :
                              'text-blue-500'
                            }`} fill="currentColor" />
                          </div>
                        )}
                      </div>

                      {/* Achievement Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className={`font-semibold ${
                            achievement.earned ? 'text-[#091A7A]' : 'text-[#091A7A]/50'
                          }`}>
                            {achievement.title}
                          </h3>
                          <span className="text-xs font-bold text-yellow-600 ml-2">
                            {achievement.points} pts
                          </span>
                        </div>
                        
                        <p className={`text-xs mb-2 ${
                          achievement.earned ? 'text-[#091A7A]/70' : 'text-[#091A7A]/40'
                        }`}>
                          {achievement.description}
                        </p>

                        {/* Progress Bar */}
                        {!achievement.earned && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-xs text-[#091A7A]/60 mb-1">
                              <span>Progress</span>
                              <span>{achievement.progress}/{achievement.total}</span>
                            </div>
                            <div className="h-2 bg-white/40 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                                className="h-full bg-gradient-to-r from-[#091A7A] to-[#ADC8FF] rounded-full"
                              />
                            </div>
                          </div>
                        )}

                        {/* Earned Date */}
                        {achievement.earned && achievement.earnedDate && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <Award className="w-3 h-3" />
                            <span>Earned {achievement.earnedDate}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
