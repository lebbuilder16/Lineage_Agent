import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';
import type { SweepFlag } from '../types/api';

const MAX_FLAGS = 200;
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface SweepFlagsState {
  flags: SweepFlag[];
  urgentMints: string[];
  lastFetch: number | null;
  loading: boolean;

  fetchFlags: () => Promise<void>;
  markRead: (flagId: number) => void;
  markAllReadForMint: (mint: string) => void;
  getByMint: (mint: string) => SweepFlag[];
  getUnreadCount: () => number;
  getCriticalCount: () => number;
}

function computeUrgentMints(flags: SweepFlag[]): string[] {
  const mints = new Set<string>();
  for (const f of flags) {
    if (!f.read && f.severity === 'critical') mints.add(f.mint);
  }
  return Array.from(mints);
}

export const useSweepFlagsStore = create<SweepFlagsState>()(
  persist(
    (set, get) => ({
      flags: [],
      urgentMints: [],
      lastFetch: null,
      loading: false,

      fetchFlags: async () => {
        const apiKey = useAuthStore.getState().apiKey;
        if (!apiKey) return;
        set({ loading: true });
        try {
          const res = await fetch(`${BASE_URL}/agent/flags?limit=${MAX_FLAGS}`, {
            headers: { 'X-API-Key': apiKey },
          });
          if (!res.ok) return;
          const data = await res.json();
          const flags: SweepFlag[] = (data.flags ?? []).filter(
            (f: SweepFlag) => f.flagType !== '_SNAPSHOT' && f.flagType !== '_REFERENCE',
          );
          set({
            flags,
            urgentMints: computeUrgentMints(flags),
            lastFetch: Date.now(),
          });
        } catch {
          /* best-effort */
        } finally {
          set({ loading: false });
        }
      },

      markRead: (flagId) => {
        const apiKey = useAuthStore.getState().apiKey;
        // Optimistic update
        set((state) => {
          const updated = state.flags.map((f) =>
            f.id === flagId ? { ...f, read: true } : f,
          );
          return { flags: updated, urgentMints: computeUrgentMints(updated) };
        });
        // Backend sync (fire-and-forget)
        if (apiKey) {
          fetch(`${BASE_URL}/agent/flags/${flagId}/read`, {
            method: 'POST',
            headers: { 'X-API-Key': apiKey },
          }).catch(() => {});
        }
      },

      markAllReadForMint: (mint) => {
        const apiKey = useAuthStore.getState().apiKey;
        const flagsToMark = get().flags.filter((f) => f.mint === mint && !f.read);
        // Optimistic update
        set((state) => {
          const updated = state.flags.map((f) =>
            f.mint === mint ? { ...f, read: true } : f,
          );
          return { flags: updated, urgentMints: computeUrgentMints(updated) };
        });
        // Backend sync
        if (apiKey) {
          for (const f of flagsToMark) {
            fetch(`${BASE_URL}/agent/flags/${f.id}/read`, {
              method: 'POST',
              headers: { 'X-API-Key': apiKey },
            }).catch(() => {});
          }
        }
      },

      getByMint: (mint) => get().flags.filter((f) => f.mint === mint),

      getUnreadCount: () => get().flags.filter((f) => !f.read).length,

      getCriticalCount: () =>
        get().flags.filter((f) => !f.read && f.severity === 'critical').length,
    }),
    {
      name: 'lineage_sweep_flags',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ flags: state.flags, lastFetch: state.lastFetch }),
    },
  ),
);
