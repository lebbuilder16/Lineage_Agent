/**
 * Agent preferences — user-controlled autonomy settings.
 * Persisted locally via AsyncStorage AND synced to backend via POST /agent/prefs.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';

const STORAGE_KEY = 'lineage_agent_prefs';
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export const ALERT_TYPE_OPTIONS = [
  { key: 'deployer_exit', label: 'Deployer exit' },
  { key: 'bundle', label: 'Bundle detected' },
  { key: 'sol_extraction', label: 'SOL extraction' },
  { key: 'price_crash', label: 'Price crash' },
  { key: 'cartel', label: 'Cartel link' },
  { key: 'operator_match', label: 'Operator match' },
  { key: 'deployer_rug', label: 'New rug by deployer' },
] as const;

export const SWEEP_INTERVAL_OPTIONS = [
  { value: 900, label: '15min' },
  { value: 1800, label: '30min' },
  { value: 2700, label: '45min' },
  { value: 3600, label: '1h' },
  { value: 7200, label: '2h' },
  { value: 14400, label: '4h' },
] as const;

export const DEPTH_OPTIONS = [
  { value: 'quick', label: 'Quick', desc: 'Heuristic only, ~3s' },
  { value: 'standard', label: 'Standard', desc: 'AI verdict, ~15s' },
  { value: 'deep', label: 'Deep', desc: 'Agent multi-turn, ~30s' },
] as const;

export const WALLET_THRESHOLD_OPTIONS = [40, 50, 60, 70, 80] as const;

export const WALLET_INTERVAL_OPTIONS = [
  { value: 300, label: '5min' },
  { value: 600, label: '10min' },
  { value: 900, label: '15min' },
  { value: 1800, label: '30min' },
] as const;

interface AgentPrefsState {
  alertOnDeployerLaunch: boolean;
  alertOnHighRisk: boolean;
  autoInvestigate: boolean;
  dailyBriefing: boolean;
  briefingHour: number;
  riskThreshold: number;
  alertTypes: string[];
  solExtractionMin: number;
  sweepInterval: number;
  investigationDepth: string;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  walletMonitorEnabled: boolean;
  walletMonitorThreshold: number;
  walletMonitorInterval: number;
  hydrated: boolean;

  toggle: (key: 'alertOnDeployerLaunch' | 'alertOnHighRisk' | 'autoInvestigate' | 'dailyBriefing' | 'walletMonitorEnabled') => void;
  setBriefingHour: (hour: number) => void;
  setRiskThreshold: (value: number) => void;
  toggleAlertType: (type: string) => void;
  setSolExtractionMin: (value: number) => void;
  setSweepInterval: (value: number) => void;
  setInvestigationDepth: (value: string) => void;
  setQuietHours: (start: number | null, end: number | null) => void;
  setWalletMonitorThreshold: (value: number) => void;
  setWalletMonitorInterval: (value: number) => void;
  hydrate: () => Promise<void>;
  syncToBackend: () => void;
}

function persistAndSync(state: AgentPrefsState) {
  const { hydrated, ...rest } = state as any;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rest)).catch(() => {});

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
      riskThreshold: state.riskThreshold,
      alertTypes: state.alertTypes,
      solExtractionMin: state.solExtractionMin,
      sweepInterval: state.sweepInterval,
      investigationDepth: state.investigationDepth,
      quietHoursStart: state.quietHoursStart,
      quietHoursEnd: state.quietHoursEnd,
      walletMonitorEnabled: state.walletMonitorEnabled,
      walletMonitorThreshold: state.walletMonitorThreshold,
      walletMonitorInterval: state.walletMonitorInterval,
    }),
  }).catch(() => {});
}

export const useAgentPrefsStore = create<AgentPrefsState>((set, get) => ({
  alertOnDeployerLaunch: true,
  alertOnHighRisk: true,
  autoInvestigate: false,
  dailyBriefing: true,
  briefingHour: 8,
  riskThreshold: 70,
  alertTypes: ['deployer_exit', 'bundle', 'sol_extraction', 'price_crash', 'cartel', 'operator_match', 'deployer_rug'],
  solExtractionMin: 20,
  sweepInterval: 2700,
  investigationDepth: 'standard',
  quietHoursStart: null,
  quietHoursEnd: null,
  walletMonitorEnabled: false,
  walletMonitorThreshold: 60,
  walletMonitorInterval: 600,
  hydrated: false,

  toggle: (key) => {
    set({ [key]: !get()[key] } as any);
    persistAndSync(get());
  },

  setBriefingHour: (hour) => {
    set({ briefingHour: hour });
    persistAndSync(get());
  },

  setRiskThreshold: (value) => {
    set({ riskThreshold: Math.max(10, Math.min(95, value)) });
    persistAndSync(get());
  },

  toggleAlertType: (type) => {
    const current = get().alertTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    set({ alertTypes: next });
    persistAndSync(get());
  },

  setSolExtractionMin: (value) => {
    set({ solExtractionMin: Math.max(1, value) });
    persistAndSync(get());
  },

  setSweepInterval: (value) => {
    set({ sweepInterval: value });
    persistAndSync(get());
  },

  setInvestigationDepth: (value) => {
    set({ investigationDepth: value });
    persistAndSync(get());
  },

  setQuietHours: (start, end) => {
    set({ quietHoursStart: start, quietHoursEnd: end });
    persistAndSync(get());
  },

  setWalletMonitorThreshold: (value) => {
    set({ walletMonitorThreshold: Math.max(20, Math.min(90, value)) });
    persistAndSync(get());
  },

  setWalletMonitorInterval: (value) => {
    set({ walletMonitorInterval: value });
    persistAndSync(get());
  },

  syncToBackend: () => persistAndSync(get()),

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({ ...parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
      const apiKey = useAuthStore.getState().apiKey;
      if (apiKey) {
        const res = await fetch(`${BASE_URL}/agent/prefs`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
          const server = await res.json();
          set({ ...server, hydrated: true });
          const { hydrated: _, ...rest } = get() as any;
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rest)).catch(() => {});
        }
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
