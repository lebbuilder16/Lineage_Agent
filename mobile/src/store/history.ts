/**
 * Investigation history — persists past verdicts across sessions.
 * Syncs with backend via GET /agent/history for server-side memory.
 *
 * Supports incremental catch-up: when the app returns to foreground,
 * ``catchUp()`` fetches only investigations created since the last sync
 * (via the ``since`` query param) so background/auto-investigations
 * appear without a full re-fetch.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';

const STORAGE_KEY = 'lineage_investigation_history';
const LAST_SYNC_KEY = 'lineage_history_last_sync';
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
  /** Incremental sync — fetch only new investigations since last sync. */
  catchUp: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  investigations: [],
  hydrated: false,

  addInvestigation: (record) => {
    set((s) => {
      const filtered = s.investigations.filter((r) => r.mint !== record.mint);
      const updated = [record, ...filtered].slice(0, MAX_RECORDS);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch((e) => console.warn('[history] persist failed', e));
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
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch((e) => console.warn('[history] persist feedback failed', e));
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
      }).catch((e) => console.warn('[history] feedback sync failed', e));
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
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch((e) => console.warn('[history] merge persist failed', e));
              return { investigations: merged };
            });
          }
        }
      }
      AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now() / 1000)).catch(() => {});
    } catch {
      set({ hydrated: true });
    }
  },

  catchUp: async () => {
    const apiKey = useAuthStore.getState().apiKey;
    if (!apiKey) return;
    try {
      // Fetch only investigations created since our last sync
      const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const since = raw ? parseFloat(raw) : (Date.now() / 1000) - 86400; // fallback: last 24h

      const res = await fetch(
        `${BASE_URL}/agent/history?since=${since}`,
        { headers: { 'X-API-Key': apiKey } },
      );
      if (!res.ok) return;

      const serverRecords = (await res.json()) as InvestigationRecord[];
      if (Array.isArray(serverRecords) && serverRecords.length > 0) {
        set((s) => {
          const localMints = new Set(s.investigations.map((r) => r.mint));
          const newFromServer = serverRecords.filter((r) => !localMints.has(r.mint));
          if (newFromServer.length === 0) return s;
          const merged = [...newFromServer, ...s.investigations]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_RECORDS);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch((e) => console.warn('[history] catchUp persist failed', e));
          return { investigations: merged };
        });
      }
      AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now() / 1000)).catch(() => {});
    } catch {
      // best-effort — will retry on next foreground
    }
  },
}));
