import { motion } from 'motion/react';
import { ArrowLeft, Trophy, Medal, Award, Crown, Zap } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface LeaderboardScreenProps {
  onBack: () => void;
  userXP: number;
}

interface LeaderboardUser {
  id: string;
  name: string;
  xp: number;
  avatar: string;
  rank: number;
  isCurrentUser?: boolean;
}

const leaderboardData: LeaderboardUser[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    xp: 8750,
    avatar: 'https://images.unsplash.com/photo-1640202584480-4046a81d9da0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWVuYWdlJTIwZ2lybCUyMHBvcnRyYWl0JTIwZmFjZSUyMGNsZWFyfGVufDF8fHx8MTc1NzUyMDU1OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rank: 1
  },
  {
    id: '2',
    name: 'Alex Kumar',
    xp: 7320,
    avatar: 'https://images.unsplash.com/photo-1665567683796-c82af536213a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWVuYWdlJTIwYm95JTIwcG9ydHJhaXQlMjBoZWFkc2hvdCUyMHN0dWRlbnR8ZW58MXx8fHwxNzU3NTIwNTYxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rank: 2
  },
  {
    id: '3',
    name: 'Emma Wilson',
    xp: 6890,
    avatar: 'https://images.unsplash.com/photo-1634451784126-b9f7282edb1b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx5b3VuZyUyMGdpcmwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0JTIwc3R1ZGVudHxlbnwxfHx8fDE3NTc1MjA1NjR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rank: 3
  },
  {
    id: '4',
    name: 'Abhi (You)',
    xp: 5500,
    avatar: 'https://images.unsplash.com/photo-1631905131477-eefc1360588a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWVuYWdlciUyMGJveSUyMGNsZWFyJTIwZmFjZSUyMHBvcnRyYWl0fGVufDF8fHx8MTc1NzUyMDU2OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rank: 4,
    isCurrentUser: true
  },
  {
    id: '5',
    name: 'Maya Patel',
    xp: 4960,
    avatar: 'https://images.unsplash.com/photo-1688760118069-1e5e90c6920b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwZ2lybCUyMHBvcnRyYWl0JTIwZmFjZSUyMHlvdW5nfGVufDF8fHx8MTc1NzUyMDU3MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rank: 5
  }
];

export function LeaderboardScreen({ onBack, userXP }: LeaderboardScreenProps) {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <Trophy className="w-5 h-5 text-[#091A7A]/60" />;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'from-yellow-400 to-yellow-600';
      case 2:
        return 'from-gray-300 to-gray-500';
      case 3:
        return 'from-amber-400 to-amber-600';
      default:
        return 'from-[#ADC8FF]/30 to-white/20';
    }
  };

  // Update user's XP in leaderboard
  const updatedLeaderboard = leaderboardData.map(user => 
    user.isCurrentUser ? { ...user, xp: userXP } : user
  ).sort((a, b) => b.xp - a.xp).map((user, index) => ({ ...user, rank: index + 1 }));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 p-6 backdrop-blur-sm border-b border-white/30">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg border border-white/50"
        >
          <ArrowLeft className="w-5 h-5 text-[#091A7A]" />
        </motion.button>
        
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#091A7A]">Leaderboard</h1>
            <p className="text-sm text-[#091A7A]/70">Top learners this week</p>
          </div>
        </div>
      </div>

      {/* Top 3 Podium */}
      <div className="p-6">
        <div className="flex items-end justify-center gap-4 mb-8">
          {/* 2nd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-3">
              <ImageWithFallback
                src={updatedLeaderboard[1]?.avatar || ''}
                alt="2nd place"
                className="w-16 h-16 rounded-full border-4 border-gray-300 object-cover object-top"
              />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">2</span>
              </div>
            </div>
            <div className="w-20 h-16 bg-gradient-to-t from-gray-300 to-gray-400 rounded-t-lg flex items-end justify-center pb-2">
              <Medal className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs font-medium text-[#091A7A] mt-2">{updatedLeaderboard[1]?.name}</p>
          </motion.div>

          {/* 1st Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-3">
              <ImageWithFallback
                src={updatedLeaderboard[0]?.avatar || ''}
                alt="1st place"
                className="w-20 h-20 rounded-full border-4 border-yellow-400 object-cover object-top"
              />
              <div className="absolute -top-3 -right-3 w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="w-24 h-20 bg-gradient-to-t from-yellow-400 to-yellow-500 rounded-t-lg flex items-end justify-center pb-2">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <p className="text-xs font-medium text-[#091A7A] mt-2">{updatedLeaderboard[0]?.name}</p>
          </motion.div>

          {/* 3rd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-3">
              <ImageWithFallback
                src={updatedLeaderboard[2]?.avatar || ''}
                alt="3rd place"
                className="w-16 h-16 rounded-full border-4 border-amber-500 object-cover object-top"
              />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">3</span>
              </div>
            </div>
            <div className="w-20 h-12 bg-gradient-to-t from-amber-500 to-amber-600 rounded-t-lg flex items-end justify-center pb-2">
              <Award className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs font-medium text-[#091A7A] mt-2">{updatedLeaderboard[2]?.name}</p>
          </motion.div>
        </div>
      </div>

      {/* Full Leaderboard */}
      <div className="flex-1 px-6">
        <h3 className="font-semibold text-[#091A7A] mb-4">All Rankings</h3>
        <div className="space-y-3">
          {updatedLeaderboard.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-2xl border shadow-sm ${
                user.isCurrentUser
                  ? 'bg-gradient-to-r from-[#ADC8FF]/40 to-white/30 border-[#091A7A]/30'
                  : 'bg-white/60 border-white/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      user.rank <= 3 ? `bg-gradient-to-br ${getRankColor(user.rank)}` : 'bg-gray-100'
                    }`}>
                      <span className={`font-bold text-sm ${
                        user.rank <= 3 ? 'text-white' : 'text-[#091A7A]'
                      }`}>
                        {user.rank}
                      </span>
                    </div>
                    
                    <ImageWithFallback
                      src={user.avatar}
                      alt={user.name}
                      className="w-12 h-12 rounded-full object-cover object-top"
                    />
                  </div>
                  
                  <div>
                    <p className={`font-semibold ${user.isCurrentUser ? 'text-[#091A7A]' : 'text-[#091A7A]'}`}>
                      {user.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-500" fill="currentColor" />
                      <span className="text-xs text-[#091A7A]/70">{user.xp.toLocaleString()} XP</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  {getRankIcon(user.rank)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}