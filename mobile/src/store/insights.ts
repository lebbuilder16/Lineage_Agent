import { create } from 'zustand';
import { useAuthStore } from './auth';
import type { Insight } from '../types/api';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface InsightsState {
  insights: Insight[];
  loading: boolean;
  lastFetch: number | null;

  fetchInsights: () => Promise<void>;
  dismissInsight: (title: string) => void;
}

export const useInsightsStore = create<InsightsState>()((set, get) => ({
  insights: [],
  loading: false,
  lastFetch: null,

  fetchInsights: async () => {
    const apiKey = useAuthStore.getState().apiKey;
    if (!apiKey) return;
    set({ loading: true });
    try {
      const res = await fetch(`${BASE_URL}/agent/insights`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ insights: data.insights ?? [], lastFetch: Date.now() });
    } catch {
      /* best-effort */
    } finally {
      set({ loading: false });
    }
  },

  dismissInsight: (title) =>
    set((state) => ({
      insights: state.insights.filter((i) => i.title !== title),
    })),
}));
