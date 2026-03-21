/**
 * Agent preferences — user-controlled autonomy settings.
 * Persisted locally via AsyncStorage AND synced to backend via POST /agent/prefs.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';

const STORAGE_KEY = 'lineage_agent_prefs';
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface AgentPrefsState {
  alertOnDeployerLaunch: boolean;
  alertOnHighRisk: boolean;
  autoInvestigate: boolean;
  dailyBriefing: boolean;
  briefingHour: number;
  hydrated: boolean;

  toggle: (key: keyof Omit<AgentPrefsState, 'briefingHour' | 'hydrated' | 'toggle' | 'setBriefingHour' | 'hydrate' | 'syncToBackend'>) => void;
  setBriefingHour: (hour: number) => void;
  hydrate: () => Promise<void>;
  syncToBackend: () => void;
}

function persist(state: Partial<AgentPrefsState>) {
  const { hydrated, ...rest } = state as any;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rest)).catch(() => {});
}

function syncPrefsToBackend(state: AgentPrefsState) {
  const apiKey = useAuthStore.getState().apiKey;
  if (!apiKey) return;
  fetch(`${BASE_URL}/agent/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      alertOnDeployerLaunch: state.alertOnDeployerLaunch,
      alertOnHighRisk: state.alertOnHighRisk,
      autoInvestigate: state.autoInvestigate,
      dailyBriefing: state.dailyBriefing,
      briefingHour: state.briefingHour,
    }),
  }).catch(() => {}); // best-effort
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
    const updated = { ...get(), [key]: !current };
    persist(updated);
    syncPrefsToBackend(updated as AgentPrefsState);
  },

  setBriefingHour: (hour) => {
    set({ briefingHour: hour });
    const updated = { ...get(), briefingHour: hour };
    persist(updated);
    syncPrefsToBackend(updated as AgentPrefsState);
  },

  syncToBackend: () => {
    syncPrefsToBackend(get());
  },

  hydrate: async () => {
    try {
      // Load local first (instant)
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({ ...parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
      // Then fetch from backend (merge server-side prefs)
      const apiKey = useAuthStore.getState().apiKey;
      if (apiKey) {
        const res = await fetch(`${BASE_URL}/agent/prefs`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
          const server = await res.json();
          set(server);
          persist(server);
        }
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
