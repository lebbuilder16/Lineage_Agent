/**
 * Subscription state — tracks the user's current plan and usage.
 * The backend is the single source of truth; this store caches the state
 * for UI rendering and prevents unnecessary round-trips.
 */
import { create } from 'zustand';
import type { PlanTier } from '../lib/tier-limits';
import { getLimits } from '../lib/tier-limits';
import { getMe } from '../lib/api';

interface Usage {
  scans: number;
  ai_chat: number;
  agent: number;
  investigate: number;
  investigate_chat: number;
}

interface SubscriptionState {
  plan: PlanTier;
  expiresAt: string | null;
  usage: Usage;
  isLoading: boolean;

  // Actions
  setPlan: (plan: PlanTier, expiresAt?: string | null) => void;
  setUsage: (usage: Partial<Usage>) => void;
  incrementUsage: (key: keyof Usage) => void;
  fetchStatus: (apiKey: string) => Promise<void>;
  reset: () => void;
}

const INITIAL_USAGE: Usage = { scans: 0, ai_chat: 0, agent: 0, investigate: 0, investigate_chat: 0 };

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  plan: 'free',
  expiresAt: null,
  usage: { ...INITIAL_USAGE },
  isLoading: false,

  setPlan: (plan, expiresAt) => set({ plan, expiresAt: expiresAt ?? null }),

  setUsage: (partial) => set((s) => ({ usage: { ...s.usage, ...partial } })),

  incrementUsage: (key) =>
    set((s) => ({ usage: { ...s.usage, [key]: s.usage[key] + 1 } })),

  fetchStatus: async (apiKey) => {
    if (!apiKey) return;
    set({ isLoading: true });
    try {
      const user = await getMe(apiKey);
      const plan = (user as unknown as Record<string, unknown>).plan as PlanTier | undefined;
      if (plan) {
        set({ plan });
      }
      // If the backend returns usage counters, set them
      const serverUsage = (user as unknown as Record<string, unknown>).usage as Usage | undefined;
      if (serverUsage) {
        set({ usage: { scans: serverUsage.scans ?? 0, ai_chat: serverUsage.ai_chat ?? 0, agent: serverUsage.agent ?? 0, investigate: serverUsage.investigate ?? 0, investigate_chat: serverUsage.investigate_chat ?? 0 } });
      }
    } catch {
      // best-effort — keep cached state
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({ plan: 'free', expiresAt: null, usage: { ...INITIAL_USAGE } }),
}));

/** Convenience: check if user can access a feature requiring a specific plan. */
export function useCanAccess(requiredPlan: PlanTier): boolean {
  const plan = useSubscriptionStore((s) => s.plan);
  const tierOrder: PlanTier[] = ['free', 'pro', 'pro_plus', 'whale'];
  return tierOrder.indexOf(plan) >= tierOrder.indexOf(requiredPlan);
}

/** Convenience: get remaining count for a daily-limited feature. -1 = unlimited. */
export function useRemainingQuota(key: keyof Usage): number {
  const plan = useSubscriptionStore((s) => s.plan);
  const used = useSubscriptionStore((s) => s.usage[key]);
  const limits = getLimits(plan);
  const limit = key === 'scans'
    ? limits.scansPerDay
    : key === 'agent'
      ? limits.agentDailyLimit
      : key === 'investigate'
        ? limits.investigateDailyLimit
        : key === 'investigate_chat'
          ? limits.investigateChatDailyLimit
          : limits.aiChatDailyLimit;
  if (limit === -1) return -1;
  return Math.max(0, limit - used);
}
