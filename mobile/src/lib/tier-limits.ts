/**
 * Client-side mirror of backend tier limits.
 * Used for UI rendering (blur/lock/counters) only — the backend is authoritative.
 */

export type PlanTier = 'free' | 'pro' | 'pro_plus' | 'whale';

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
}

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  free: {
    scansPerDay: 5,
    historyDays: 7,
    hasAiChat: false,
    aiChatModel: '',
    aiChatDailyLimit: 0,
    maxWatchlist: 0,
    maxBriefings: 0,
    alertChannels: ['in_app'],
    hasSolFlow: false,
    hasBundle: false,
    hasInsiderSell: false,
    hasDeployerProfiler: false,
    hasCartel: false,
    hasOperatorImpact: false,
    hasCompare: false,
    hasExport: false,
    batchScanMax: 0,
    hasApiAccess: false,
    deathClockFull: false,
  },
  pro: {
    scansPerDay: -1,
    historyDays: 30,
    hasAiChat: true,
    aiChatModel: 'haiku',
    aiChatDailyLimit: 20,
    maxWatchlist: 10,
    maxBriefings: 1,
    alertChannels: ['in_app'],
    hasSolFlow: true,
    hasBundle: true,
    hasInsiderSell: true,
    hasDeployerProfiler: true,
    hasCartel: false,
    hasOperatorImpact: false,
    hasCompare: false,
    hasExport: false,
    batchScanMax: 0,
    hasApiAccess: false,
    deathClockFull: true,
  },
  pro_plus: {
    scansPerDay: -1,
    historyDays: 90,
    hasAiChat: true,
    aiChatModel: 'sonnet',
    aiChatDailyLimit: -1,
    maxWatchlist: 50,
    maxBriefings: 1,
    alertChannels: ['in_app', 'telegram', 'discord'],
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
  },
  whale: {
    scansPerDay: -1,
    historyDays: -1,
    hasAiChat: true,
    aiChatModel: 'sonnet',
    aiChatDailyLimit: -1,
    maxWatchlist: 200,
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
    batchScanMax: 50,
    hasApiAccess: true,
    deathClockFull: true,
  },
};

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'pro_plus', 'whale'];

/**
 * Feature gates master switch.
 * Set to true ONLY when RevenueCat/Helio payment is fully configured.
 * When false, all users have access to all features (no paywall).
 */
export const GATES_ENABLED = false;

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
    case 'pro_plus': return 'Pro+';
    case 'whale': return 'Whale';
    default: return 'Free';
  }
}

export function tierColor(plan: PlanTier): string {
  switch (plan) {
    case 'free': return '#6B7280'; // gray
    case 'pro': return '#ADC8FF'; // secondary/blue
    case 'pro_plus': return '#FF3366'; // accent/pink
    case 'whale': return '#00FF88'; // success/green
    default: return '#6B7280';
  }
}
