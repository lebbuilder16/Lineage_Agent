/**
 * Client-side mirror of backend tier limits.
 * Used for UI rendering (blur/lock/counters) only — the backend is authoritative.
 *
 * Tiers: FREE → PRO ($9.99/m) → ELITE ($34.99/m)
 */

export type PlanTier = 'free' | 'pro' | 'elite';

export interface TierLimits {
  scansPerDay: number; // -1 = unlimited
  historyDays: number;
  hasAiChat: boolean;
  aiChatModel: string; // '' when disabled
  aiChatDailyLimit: number; // -1 = unlimited
  maxWatchlist: number;
  maxBriefings: number;
  alertChannels: string[];
  hasSolFlow: boolean;
  hasBundle: boolean;
  hasInsiderSell: boolean;
  hasDeployerProfiler: boolean;
  hasCartel: boolean;
  hasOperatorImpact: boolean;
  hasCompare: boolean;
  hasExport: boolean;
  batchScanMax: number;
  hasApiAccess: boolean;
  deathClockFull: boolean;
  hasAgent: boolean;
  agentDailyLimit: number; // -1 = unlimited
  hasAiVerdict: boolean;
  investigateDailyLimit: number; // -1 = unlimited
  investigateChatDailyLimit: number; // -1 = unlimited
}

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  free: {
    scansPerDay: 10,
    historyDays: 7,
    hasAiChat: false,
    aiChatModel: '',
    aiChatDailyLimit: 0,
    maxWatchlist: 3,
    maxBriefings: 0,
    alertChannels: ['in_app'],
    hasSolFlow: false,
    hasBundle: false,
    hasInsiderSell: false,
    hasDeployerProfiler: true,
    hasCartel: false,
    hasOperatorImpact: false,
    hasCompare: false,
    hasExport: false,
    batchScanMax: 0,
    hasApiAccess: false,
    deathClockFull: true,
    hasAgent: false,
    agentDailyLimit: 0,
    hasAiVerdict: false,
    investigateDailyLimit: 10,
    investigateChatDailyLimit: 0,
  },
  pro: {
    scansPerDay: 50,
    historyDays: 90,
    hasAiChat: true,
    aiChatModel: 'haiku',
    aiChatDailyLimit: 30,
    maxWatchlist: 25,
    maxBriefings: 1,
    alertChannels: ['in_app', 'telegram'],
    hasSolFlow: true,
    hasBundle: true,
    hasInsiderSell: true,
    hasDeployerProfiler: true,
    hasCartel: true,
    hasOperatorImpact: true,
    hasCompare: true,
    hasExport: true,
    batchScanMax: 0,
    hasApiAccess: false,
    deathClockFull: true,
    hasAgent: false,
    agentDailyLimit: 0,
    hasAiVerdict: true,
    investigateDailyLimit: 50,
    investigateChatDailyLimit: 30,
  },
  elite: {
    scansPerDay: 100,
    historyDays: 365,
    hasAiChat: true,
    aiChatModel: 'haiku',
    aiChatDailyLimit: 60,
    maxWatchlist: 100,
    maxBriefings: 3,
    alertChannels: ['in_app', 'telegram', 'discord'],
    hasSolFlow: true,
    hasBundle: true,
    hasInsiderSell: true,
    hasDeployerProfiler: true,
    hasCartel: true,
    hasOperatorImpact: true,
    hasCompare: true,
    hasExport: true,
    batchScanMax: 25,
    hasApiAccess: true,
    deathClockFull: true,
    hasAgent: true,
    agentDailyLimit: 12,
    hasAiVerdict: true,
    investigateDailyLimit: 100,
    investigateChatDailyLimit: 60,
  },
};

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'elite'];

/**
 * Feature gates master switch.
 * Set to true ONLY when RevenueCat/Helio payment is fully configured.
 * When false, all users have access to all features (no paywall).
 */
export const GATES_ENABLED = true;

export function getLimits(plan: PlanTier): TierLimits {
  return TIER_LIMITS[plan] ?? TIER_LIMITS.free;
}

/** Returns true if userPlan >= requiredPlan in the tier hierarchy.
 *  When GATES_ENABLED is false, always returns true (all features unlocked). */
export function canAccess(userPlan: PlanTier, requiredPlan: PlanTier): boolean {
  if (!GATES_ENABLED) return true;
  return TIER_ORDER.indexOf(userPlan) >= TIER_ORDER.indexOf(requiredPlan);
}

export function tierLabel(plan: PlanTier): string {
  switch (plan) {
    case 'free': return 'Free';
    case 'pro': return 'Pro';
    case 'elite': return 'Elite';
    default: return 'Free';
  }
}

export function tierColor(plan: PlanTier): string {
  switch (plan) {
    case 'free': return '#6B7280'; // gray
    case 'pro': return '#CFE6E4'; // secondary/mint teal
    case 'elite': return '#FFD666'; // gold
    default: return '#6B7280';
  }
}
