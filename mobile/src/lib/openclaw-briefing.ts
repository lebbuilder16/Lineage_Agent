// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Briefing — Daily intelligence briefing handler
// Subscribes to cron.result events tagged "lineage:briefing" and surfaces them.
// ─────────────────────────────────────────────────────────────────────────────
import { subscribe } from './openclaw';
import { create } from 'zustand';

// ─── Briefing store ───────────────────────────────────────────────────────────

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

// ─── Event subscription ───────────────────────────────────────────────────────

/** Start listening for briefing events from OpenClaw. Returns cleanup fn. */
export function startBriefingListener(): () => void {
  // OpenClaw fires "cron.result" when a cron job completes
  const unsub = subscribe('cron.result', (payload) => {
    if (!payload || typeof payload !== 'object') return;

    const p = payload as { name?: string; result?: string; output?: string; text?: string };

    // Only handle briefing cron results
    if (!p.name?.startsWith('lineage:briefing')) return;

    const content = p.result ?? p.output ?? p.text;
    if (typeof content === 'string' && content.trim()) {
      useBriefingStore.getState().setBriefing(content.trim());
    }
  });

  return unsub;
}
