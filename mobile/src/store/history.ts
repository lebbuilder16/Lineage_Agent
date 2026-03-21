/**
 * Investigation history — persists past verdicts across sessions.
 * Syncs with backend via GET /agent/history for server-side memory.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';

const STORAGE_KEY = 'lineage_investigation_history';
const MAX_RECORDS = 50;
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export interface InvestigationRecord {
  mint: string;
  name?: string;
  symbol?: string;
  riskScore: number;
  verdict: string;
  keyFindings: string[];
  timestamp: number;
  feedback?: 'accurate' | 'incorrect';
}

interface HistoryState {
  investigations: InvestigationRecord[];
  hydrated: boolean;
  addInvestigation: (record: InvestigationRecord) => void;
  getByMint: (mint: string) => InvestigationRecord | undefined;
  setFeedback: (mint: string, feedback: 'accurate' | 'incorrect') => void;
  hydrate: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  investigations: [],
  hydrated: false,

  addInvestigation: (record) => {
    set((s) => {
      const filtered = s.investigations.filter((r) => r.mint !== record.mint);
      const updated = [record, ...filtered].slice(0, MAX_RECORDS);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return { investigations: updated };
    });
  },

  getByMint: (mint) => {
    return get().investigations.find((r) => r.mint === mint);
  },

  setFeedback: (mint, feedback) => {
    set((s) => {
      const updated = s.investigations.map((r) =>
        r.mint === mint ? { ...r, feedback } : r,
      );
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return { investigations: updated };
    });
    // Sync feedback to backend
    const apiKey = useAuthStore.getState().apiKey;
    const record = get().investigations.find((r) => r.mint === mint);
    if (apiKey && record) {
      fetch(`${BASE_URL}/agent/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          mint,
          risk_score: record.riskScore,
          rating: feedback,
        }),
      }).catch(() => {}); // best-effort
    }
  },

  hydrate: async () => {
    try {
      // Load local first (instant)
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as InvestigationRecord[];
        set({ investigations: parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
      // Then merge from backend (server has auto-investigations too)
      const apiKey = useAuthStore.getState().apiKey;
      if (apiKey) {
        const res = await fetch(`${BASE_URL}/agent/history`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
          const serverRecords = (await res.json()) as InvestigationRecord[];
          if (Array.isArray(serverRecords) && serverRecords.length > 0) {
            set((s) => {
              // Merge: server records fill gaps in local
              const localMints = new Set(s.investigations.map((r) => r.mint));
              const newFromServer = serverRecords.filter((r) => !localMints.has(r.mint));
              const merged = [...s.investigations, ...newFromServer]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, MAX_RECORDS);
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
              return { investigations: merged };
            });
          }
        }
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
