import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { Watch, User } from '../types/api';

const LS_KEY = 'lineage_api_key';

interface AuthState {
  apiKey: string | null;
  user: User | null;
  watches: Watch[];
  scanCount: number;
  hydrated: boolean;
  setApiKey: (key: string | null) => void;
  setUser: (user: User | null) => void;
  setWatches: (watches: Watch[]) => void;
  addWatch: (watch: Watch) => void;
  removeWatch: (id: string) => void;
  incrementScanCount: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: null,
  user: null,
  watches: [],
  scanCount: 0,
  hydrated: false,

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

  hydrate: async () => {
    try {
      const key = await SecureStore.getItemAsync(LS_KEY);
      set({ apiKey: key ?? null, hydrated: true });
    } catch (e) {
      console.error('[auth] SecureStore.getItem failed during hydration', e);
      set({ hydrated: true });
    }
  },
}));
