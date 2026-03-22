/**
 * Briefing listener — polls backend /stats/brief for personalized daily briefing.
 */
import { create } from 'zustand';

// ─── Briefing store ─────────────────────────────────────────────────────────

export interface BriefingState {
  latest: string | null;       // briefing content text
  generatedAt: string | null;  // ISO timestamp from backend (when briefing was generated)
  receivedAt: string | null;   // ISO timestamp (when mobile received it)
  unread: boolean;
  setBriefing: (content: string, generatedAt?: string) => void;
  markRead: () => void;
  clear: () => void;
}

export const useBriefingStore = create<BriefingState>((set) => ({
  latest: null,
  generatedAt: null,
  receivedAt: null,
  unread: false,
  setBriefing: (content, generatedAt) =>
    set({
      latest: content,
      generatedAt: generatedAt ?? null,
      receivedAt: new Date().toISOString(),
      unread: true,
    }),
  markRead: () => set({ unread: false }),
  clear: () => set({ latest: null, generatedAt: null, receivedAt: null, unread: false }),
}));

// ─── Backend polling ─────────────────────────────────────────────────────────

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

/** Start polling for briefing data from backend API. Returns cleanup fn. */
export function startBriefingListener(apiKey?: string): () => void {
  const fetchBriefing = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch(`${BASE_URL}/stats/brief`, { headers });
      if (res.ok) {
        const data = await res.json();
        const content = data.content || data.text;
        if (content) {
          useBriefingStore.getState().setBriefing(content, data.generated_at);
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
