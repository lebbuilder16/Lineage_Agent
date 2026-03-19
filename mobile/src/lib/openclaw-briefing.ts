/**
 * Briefing listener — now polls backend API instead of OpenClaw cron events.
 */
import { create } from 'zustand';

// ─── Briefing store (kept here for API compatibility) ────────────────────────

export interface BriefingState {
  latest: string | null;       // markdown content
  receivedAt: string | null;   // ISO timestamp
  unread: boolean;
  setBriefing: (content: string) => void;
  markRead: () => void;
  clear: () => void;
}

export const useBriefingStore = create<BriefingState>((set) => ({
  latest: null,
  receivedAt: null,
  unread: false,
  setBriefing: (content) =>
    set({ latest: content, receivedAt: new Date().toISOString(), unread: true }),
  markRead: () => set({ unread: false }),
  clear: () => set({ latest: null, receivedAt: null, unread: false }),
}));

// ─── Backend polling ─────────────────────────────────────────────────────────

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

/** Start polling for briefing data from backend API. Returns cleanup fn. */
export function startBriefingListener(apiKey?: string): () => void {
  const fetchBriefing = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch(`${BASE_URL}/auth/briefing`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.content) {
          useBriefingStore.getState().setBriefing(data.content);
        }
      }
    } catch {
      // Silent — briefing poll is best-effort
    }
  };

  // Poll every 5 minutes
  const interval = setInterval(fetchBriefing, 5 * 60 * 1000);

  // Also fetch immediately (slight delay to avoid blocking startup)
  setTimeout(fetchBriefing, 2000);

  return () => clearInterval(interval);
}
