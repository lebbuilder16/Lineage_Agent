import { create } from 'zustand';
import type { Watch, User } from '../types/api';

const LS_KEY = 'lineage_api_key';

interface AuthState {
  apiKey: string | null;
  user: User | null;
  walletAddress: string | null;
  watches: Watch[];
  scanCount: number;
  setApiKey: (key: string | null) => void;
  setUser: (user: User | null) => void;
  setWalletAddress: (addr: string | null) => void;
  setWatches: (watches: Watch[]) => void;
  addWatch: (watch: Watch) => void;
  removeWatch: (id: string) => void;
  incrementScanCount: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null,
  user: null,
  walletAddress: null,
  watches: [],
  scanCount: 0,

  setApiKey: (key) => {
    if (key) {
      localStorage.setItem(LS_KEY, key);
    } else {
      localStorage.removeItem(LS_KEY);
    }
    set({ apiKey: key, user: null, watches: [] });
  },

  setUser: (user) => set({ user }),

  setWalletAddress: (addr) => set({ walletAddress: addr }),

  setWatches: (watches) => set({ watches }),

  addWatch: (watch) =>
    set((state) => ({ watches: [watch, ...state.watches] })),

  removeWatch: (id) =>
    set((state) => ({ watches: state.watches.filter((w) => w.id !== id) })),

  incrementScanCount: () =>
    set((state) => ({ scanCount: state.scanCount + 1 })),
}));
