import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { Watch, User } from '../types/api';

const storage = new MMKV({ id: 'lineage-auth' });
const LS_KEY = 'lineage_api_key';

interface AuthState {
  apiKey: string | null;
  user: User | null;
  watches: Watch[];
  scanCount: number;
  setApiKey: (key: string | null) => void;
  setUser: (user: User | null) => void;
  setWatches: (watches: Watch[]) => void;
  addWatch: (watch: Watch) => void;
  removeWatch: (id: string) => void;
  incrementScanCount: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: storage.getString(LS_KEY) ?? null,
  user: null,
  watches: [],
  scanCount: 0,

  setApiKey: (key) => {
    if (key) {
      storage.set(LS_KEY, key);
    } else {
      storage.delete(LS_KEY);
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
}));
