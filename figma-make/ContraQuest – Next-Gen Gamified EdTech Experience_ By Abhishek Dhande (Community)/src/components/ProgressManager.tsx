import { useEffect } from 'react';

export interface UserProgress {
  userXP: number;
  streakCount: number;
  currentProgress: number;
  totalQuizzesCompleted: number;
  completedStages: number[];
  unlockedSubjects: string[];
  dailyGoalProgress: number;
  lastActiveDate: string;
  totalSessionTime: number;
  achievements: Achievement[];
  levelProgress: {
    currentLevel: number;
    xpForNextLevel: number;
    xpInCurrentLevel: number;
  };
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string;
  xpReward: number;
}

interface ProgressManagerProps {
  userXP: number;
  streakCount: number;
  currentProgress: number;
  totalQuizzesCompleted: number;
  onProgressLoaded: (progress: UserProgress) => void;
}

const STORAGE_KEY = 'learningAppProgress';
const BACKUP_KEY = 'learningAppProgress_backup';

export function ProgressManager({ 
  userXP, 
  streakCount, 
  currentProgress, 
  totalQuizzesCompleted,
  onProgressLoaded 
}: ProgressManagerProps) {

  // Calculate level from XP
  const calculateLevel = (xp: number) => {
    const baseXP = 1000; // XP needed for level 2
    const xpPerLevel = 500; // Additional XP needed per level
    
    if (xp < baseXP) {
      return {
        currentLevel: 1,
        xpForNextLevel: baseXP,
        xpInCurrentLevel: xp
      };
    }
    
    const additionalXP = xp - baseXP;
    const additionalLevels = Math.floor(additionalXP / xpPerLevel);
    const currentLevel = 2 + additionalLevels;
    const xpInCurrentLevel = additionalXP % xpPerLevel;
    const xpForNextLevel = xpPerLevel;
    
    return {
      currentLevel,
      xpForNextLevel,
      xpInCurrentLevel
    };
  };

  // Save progress to localStorage with backup
  const saveProgress = (progress: UserProgress) => {
    try {
      const progressData = {
        ...progress,
        lastSaved: new Date().toISOString(),
        version: '1.0'
      };
      
      // Save current progress
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
      
      // Create backup of previous session
      const existingData = localStorage.getItem(STORAGE_KEY);
      if (existingData) {
        localStorage.setItem(BACKUP_KEY, existingData);
      }
      
      console.log('✅ Progress saved successfully');
    } catch (error) {
      console.error('❌ Failed to save progress:', error);
    }
  };

  // Load progress from localStorage
  const loadProgress = (): UserProgress | null => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        console.log('📱 Progress loaded from storage');
        return parsed;
      }
    } catch (error) {
      console.error('❌ Failed to load progress:', error);
      
      // Try to load from backup
      try {
        const backupData = localStorage.getItem(BACKUP_KEY);
        if (backupData) {
          const parsed = JSON.parse(backupData);
          console.log('🔄 Progress loaded from backup');
          return parsed;
        }
      } catch (backupError) {
        console.error('❌ Failed to load backup progress:', backupError);
      }
    }
    return null;
  };

  // Create default progress
  const createDefaultProgress = (): UserProgress => ({
    userXP: 5500,
    streakCount: 3,
    currentProgress: 40,
    totalQuizzesCompleted: 2,
    completedStages: [],
    unlockedSubjects: ['math', 'english', 'science'],
    dailyGoalProgress: 40,
    lastActiveDate: new Date().toISOString(),
    totalSessionTime: 0,
    achievements: [],
    levelProgress: calculateLevel(5500)
  });

  // Load progress on component mount
  useEffect(() => {
    const savedProgress = loadProgress();
    if (savedProgress) {
      // Update level progress based on current XP
      savedProgress.levelProgress = calculateLevel(savedProgress.userXP);
      onProgressLoaded(savedProgress);
    } else {
      // Create and save default progress
      const defaultProgress = createDefaultProgress();
      saveProgress(defaultProgress);
      onProgressLoaded(defaultProgress);
    }
  }, []);

  // Save progress whenever key values change
  useEffect(() => {
    const currentProgress_data: UserProgress = {
      userXP,
      streakCount,
      currentProgress,
      totalQuizzesCompleted,
      completedStages: [], // This would be updated from GameMapQuizScreen
      unlockedSubjects: ['math', 'english', 'science', 'social-studies'],
      dailyGoalProgress: currentProgress,
      lastActiveDate: new Date().toISOString(),
      totalSessionTime: 0, // This could be tracked separately
      achievements: [], // This would be updated when achievements are earned
      levelProgress: calculateLevel(userXP)
    };

    // Debounce saving to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      saveProgress(currentProgress_data);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [userXP, streakCount, currentProgress, totalQuizzesCompleted]);

  // Export function to manually save progress
  const manualSave = () => {
    const currentProgressData: UserProgress = {
      userXP,
      streakCount,
      currentProgress,
      totalQuizzesCompleted,
      completedStages: [],
      unlockedSubjects: ['math', 'english', 'science', 'social-studies'],
      dailyGoalProgress: currentProgress,
      lastActiveDate: new Date().toISOString(),
      totalSessionTime: 0,
      achievements: [],
      levelProgress: calculateLevel(userXP)
    };
    
    saveProgress(currentProgressData);
  };

  // This component doesn't render anything - it's just for progress management
  return null;
}

// Export utility functions
export const ProgressUtils = {
  calculateLevel: (xp: number) => {
    const baseXP = 1000;
    const xpPerLevel = 500;
    
    if (xp < baseXP) {
      return {
        currentLevel: 1,
        xpForNextLevel: baseXP,
        xpInCurrentLevel: xp
      };
    }
    
    const additionalXP = xp - baseXP;
    const additionalLevels = Math.floor(additionalXP / xpPerLevel);
    const currentLevel = 2 + additionalLevels;
    const xpInCurrentLevel = additionalXP % xpPerLevel;
    const xpForNextLevel = xpPerLevel;
    
    return {
      currentLevel,
      xpForNextLevel,
      xpInCurrentLevel
    };
  },

  checkForLevelUp: (oldXP: number, newXP: number) => {
    const oldLevel = ProgressUtils.calculateLevel(oldXP).currentLevel;
    const newLevel = ProgressUtils.calculateLevel(newXP).currentLevel;
    return newLevel > oldLevel;
  },

  exportProgress: () => {
    const progress = localStorage.getItem('learningAppProgress');
    if (progress) {
      const blob = new Blob([progress], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learning-progress-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  clearProgress: () => {
    localStorage.removeItem('learningAppProgress');
    localStorage.removeItem('learningAppProgress_backup');
    console.log('🗑️ Progress cleared');
  }
};