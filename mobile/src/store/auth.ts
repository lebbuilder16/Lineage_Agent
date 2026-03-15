import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { Watch, User } from '../types/api';

const LS_KEY = 'lineage_api_key';
const LS_RECENT_KEY = 'lineage_recent_searches';
const MAX_RECENT = 5;

interface AuthState {
  apiKey: string | null;
  user: User | null;
  watches: Watch[];
  scanCount: number;
  hydrated: boolean;
  recentSearches: string[];
  reportExpandMint: string | null;
  setApiKey: (key: string | null) => void;
  setUser: (user: User | null) => void;
  setWatches: (watches: Watch[]) => void;
  addWatch: (watch: Watch) => void;
  removeWatch: (id: string) => void;
  incrementScanCount: () => void;
  addRecentSearch: (mint: string) => void;
  clearRecentSearches: () => void;
  setReportExpandMint: (mint: string | null) => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: null,
  user: null,
  watches: [],
  scanCount: 0,
  hydrated: false,
  recentSearches: [],
  reportExpandMint: null,

  setApiKey: (key) => {
    if (key) {
      SecureStore.setItemAsync(LS_KEY, key).catch((e) =>
        console.error('[auth] SecureStore.setItem failed', e),
      );
    } else {
      SecureStore.deleteItemAsync(LS_KEY).catch((e) =>
        console.error('[auth] SecureStore.deleteItem failed', e),
      );
    }
    set({ apiKey: key, user: null, watches: [] });
  },

  setUser: (user) => set({ user }),

  setWatches: (watches) => set({ watches }),

  addWatch: (watch) =>
    set((state) => ({ watches: [watch, ...state.watches] })),

  removeWatch: (id) =>
    set((state) => ({ watches: state.watches.filter((w) => w.id !== id) })),

  incrementScanCount: () =>
    set((state) => ({ scanCount: state.scanCount + 1 })),

  addRecentSearch: (mint) =>
    set((state) => {
      const deduped = [mint, ...state.recentSearches.filter((r) => r !== mint)].slice(0, MAX_RECENT);
      SecureStore.setItemAsync(LS_RECENT_KEY, JSON.stringify(deduped)).catch(() => {});
      return { recentSearches: deduped };
    }),

  clearRecentSearches: () => {
    SecureStore.deleteItemAsync(LS_RECENT_KEY).catch(() => {});
    set({ recentSearches: [] });
  },

  setReportExpandMint: (mint) => set({ reportExpandMint: mint }),

  hydrate: async () => {
    try {
      const key = await SecureStore.getItemAsync(LS_KEY);
      const recentRaw = await SecureStore.getItemAsync(LS_RECENT_KEY);
      const recentSearches: string[] = recentRaw ? (JSON.parse(recentRaw) as string[]) : [];
      set({ apiKey: key ?? null, hydrated: true, recentSearches });
    } catch (e) {
      console.error('[auth] SecureStore.getItem failed during hydration', e);
      set({ hydrated: true });
    }
  },
}));
