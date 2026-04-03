import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';
import type { SweepFlag } from '../types/api';

const PAGE_SIZE = 50;
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface SweepFlagsState {
  flags: SweepFlag[];
  urgentMints: string[];
  lastFetch: number | null;
  lastSyncTs: number | null;  // server timestamp of newest flag for incremental sync
  hasMore: boolean;
  loading: boolean;

  fetchFlags: () => Promise<void>;
  loadMore: () => Promise<void>;
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

/** Deduplicate flags by id, keeping the newest version */
function dedup(flags: SweepFlag[]): SweepFlag[] {
  const seen = new Map<number, SweepFlag>();
  for (const f of flags) {
    seen.set(f.id, f);
  }
  return Array.from(seen.values()).sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
}

export const useSweepFlagsStore = create<SweepFlagsState>()(
  persist(
    (set, get) => ({
      flags: [],
      urgentMints: [],
      lastFetch: null,
      lastSyncTs: null,
      hasMore: false,
      loading: false,

      fetchFlags: async () => {
        const apiKey = useAuthStore.getState().apiKey;
        if (!apiKey) return;
        set({ loading: true });
        try {
          // Incremental sync: only fetch flags newer than last sync
          const { lastSyncTs } = get();
          let url = `${BASE_URL}/agent/flags?limit=${PAGE_SIZE}`;
          if (lastSyncTs) url += `&since=${lastSyncTs}`;

          const res = await fetch(url, {
            headers: { 'X-API-Key': apiKey },
          });
          if (!res.ok) return;
          const data = await res.json();
          const newFlags: SweepFlag[] = (data.flags ?? []).filter(
            (f: SweepFlag) => f.flagType !== '_SNAPSHOT' && f.flagType !== '_REFERENCE',
          );

          // Merge new flags with existing, dedup by id
          const merged = lastSyncTs
            ? dedup([...newFlags, ...get().flags])
            : dedup(newFlags);

          // Update lastSyncTs to newest flag
          const newestTs = merged.length > 0
            ? Math.max(...merged.map((f) => f.createdAt ?? 0))
            : lastSyncTs;

          set({
            flags: merged,
            urgentMints: computeUrgentMints(merged),
            lastFetch: Date.now(),
            lastSyncTs: newestTs,
            hasMore: data.has_more ?? false,
          });
        } catch {
          /* best-effort */
        } finally {
          set({ loading: false });
        }
      },

      loadMore: async () => {
        const apiKey = useAuthStore.getState().apiKey;
        if (!apiKey || get().loading || !get().hasMore) return;
        set({ loading: true });
        try {
          const { flags } = get();
          const oldest = flags.length > 0
            ? Math.min(...flags.map((f) => f.createdAt ?? Infinity))
            : undefined;
          // Fetch older flags using the oldest timestamp as upper bound
          let url = `${BASE_URL}/agent/flags?limit=${PAGE_SIZE}`;
          if (oldest !== undefined && oldest < Infinity) {
            // Use a small offset to avoid re-fetching the boundary flag
            url += `&before=${oldest - 0.001}`;
          }
          const res = await fetch(url, {
            headers: { 'X-API-Key': apiKey },
          });
          if (!res.ok) return;
          const data = await res.json();
          const olderFlags: SweepFlag[] = (data.flags ?? []).filter(
            (f: SweepFlag) => f.flagType !== '_SNAPSHOT' && f.flagType !== '_REFERENCE',
          );
          const merged = dedup([...flags, ...olderFlags]);
          set({
            flags: merged,
            urgentMints: computeUrgentMints(merged),
            hasMore: data.has_more ?? false,
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
      partialize: (state) => ({
        flags: state.flags,
        lastFetch: state.lastFetch,
        lastSyncTs: state.lastSyncTs,
      }),
    },
  ),
);
