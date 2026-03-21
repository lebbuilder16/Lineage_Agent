/**
 * Investigation history — persists past verdicts across sessions.
 * Enables "Previously Investigated" banners and cross-session memory.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lineage_investigation_history';
const MAX_RECORDS = 50;

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
      // Upsert: replace if same mint exists
      const filtered = s.investigations.filter((r) => r.mint !== record.mint);
      const updated = [record, ...filtered].slice(0, MAX_RECORDS);
      // Persist async (fire-and-forget)
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
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as InvestigationRecord[];
        set({ investigations: parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
