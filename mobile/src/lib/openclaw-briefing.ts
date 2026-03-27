/**
 * Briefing listener — polls backend /stats/brief for personalized daily briefing.
 */
import { create } from 'zustand';

// ─── Briefing store ─────────────────────────────────────────────────────────

export interface BriefingSection {
  type: 'watchlist_alerts' | 'active_campaigns' | 'market_intel' | string;
  title: string;
  items: { label: string; value: string; severity?: string; mint?: string; action?: string }[];
}

export interface BriefingState {
  latest: string | null;       // briefing content text
  generatedAt: string | null;  // ISO timestamp from backend (when briefing was generated)
  receivedAt: string | null;   // ISO timestamp (when mobile received it)
  sections: BriefingSection[];
  unread: boolean;
  setBriefing: (content: string, generatedAt?: string, sections?: BriefingSection[]) => void;
  markRead: () => void;
  clear: () => void;
}

export const useBriefingStore = create<BriefingState>((set) => ({
  latest: null,
  generatedAt: null,
  receivedAt: null,
  sections: [],
  unread: false,
  setBriefing: (content, generatedAt, sections) =>
    set({
      latest: content,
      generatedAt: generatedAt ?? null,
      receivedAt: new Date().toISOString(),
      sections: sections ?? [],
      unread: true,
    }),
  markRead: () => set({ unread: false }),
  clear: () => set({ latest: null, generatedAt: null, receivedAt: null, sections: [], unread: false }),
}));

// ─── Backend polling ─────────────────────────────────────────────────────────

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

/** Start polling for briefing data from backend API. Returns cleanup fn. */
export function startBriefingListener(apiKey?: string): () => void {
  // Poll every 5 minutes, but skip if content hasn't changed (conditional polling)
  let lastGeneratedAt: string | null = null;
  const smartFetch = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch(`${BASE_URL}/stats/brief`, { headers });
      if (res.ok) {
        const data = await res.json();
        const genAt = data.generated_at;
        // Skip update if same content (saves re-renders and unread flicker)
        if (genAt && genAt === lastGeneratedAt) return;
        lastGeneratedAt = genAt;
        const content = data.content || data.text;
        if (content) {
          useBriefingStore.getState().setBriefing(content, genAt, data.sections);
        }
      }
    } catch {
      // Silent — briefing poll is best-effort
    }
  };

  const interval = setInterval(smartFetch, 5 * 60 * 1000);

  // Fetch immediately (slight delay to avoid blocking startup)
  setTimeout(smartFetch, 2000);

  return () => clearInterval(interval);
}
