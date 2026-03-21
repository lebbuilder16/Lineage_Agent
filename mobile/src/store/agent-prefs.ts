/**
 * Agent preferences — user-controlled autonomy settings.
 * Persisted via AsyncStorage for cross-session memory.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lineage_agent_prefs';

interface AgentPrefsState {
  alertOnDeployerLaunch: boolean;
  alertOnHighRisk: boolean;
  autoInvestigate: boolean;
  dailyBriefing: boolean;
  briefingHour: number;
  hydrated: boolean;

  toggle: (key: keyof Omit<AgentPrefsState, 'briefingHour' | 'hydrated' | 'toggle' | 'setBriefingHour' | 'hydrate'>) => void;
  setBriefingHour: (hour: number) => void;
  hydrate: () => Promise<void>;
}

function persist(state: Partial<AgentPrefsState>) {
  const { hydrated, ...rest } = state as any;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rest)).catch(() => {});
}

export const useAgentPrefsStore = create<AgentPrefsState>((set, get) => ({
  alertOnDeployerLaunch: true,
  alertOnHighRisk: true,
  autoInvestigate: false,
  dailyBriefing: true,
  briefingHour: 8,
  hydrated: false,

  toggle: (key) => {
    const current = get()[key];
    set({ [key]: !current } as any);
    persist({ ...get(), [key]: !current });
  },

  setBriefingHour: (hour) => {
    set({ briefingHour: hour });
    persist({ ...get(), briefingHour: hour });
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({ ...parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
