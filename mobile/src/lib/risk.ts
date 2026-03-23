// ─── Centralized risk level logic ─────────────────────────────────────────────
import { tokens } from '../theme/tokens';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

/** Risk level → color mapping. Source of truth for the entire app. */
export const RISK_COLOR: Record<RiskLevel, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
  first_rug: tokens.risk.high,
  insufficient_data: tokens.white35,
};

/** Map risk level to a 0-1 score for GaugeRing display. */
export function riskLevelToScore(level: RiskLevel | undefined): number | null {
  switch (level) {
    case 'critical':          return 1.0;
    case 'high':              return 0.75;
    case 'first_rug':         return 0.70;
    case 'medium':            return 0.50;
    case 'low':               return 0.25;
    case 'insufficient_data': return null;
    default:                  return null;
  }
}

/** Get risk color for a given level (with fallback). */
export function riskColor(level: RiskLevel | undefined): string {
  return level ? (RISK_COLOR[level] ?? tokens.white35) : tokens.white35;
}

/**
 * Derive the display risk level from full lineage data.
 * Cascades through all available signals (most complete version).
 */
export function deriveRiskLevel(data: {
  death_clock?: { risk_level?: string } | null;
  insider_sell?: {
    verdict?: string;
    deployer_exited?: boolean | null;
    flags?: string[];
    sell_pressure_24h?: number | null;
  } | null;
  bundle_report?: { overall_verdict?: string } | null;
  deployer_profile?: { rug_rate_pct?: number } | null;
} | null | undefined): RiskLevel {
  if (!data) return 'insufficient_data';

  // 1. death_clock -- primary predictive source
  const dcLevel = data.death_clock?.risk_level;
  if (dcLevel && dcLevel !== 'insufficient_data') return dcLevel as RiskLevel;

  // 2. insider_sell -- live market reality
  const ins = data.insider_sell;
  if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) return 'critical';
  if (ins?.verdict === 'insider_dump') return 'high';
  if (ins?.flags?.includes('PRICE_CRASH') && (ins?.sell_pressure_24h ?? 0) > 0.4) return 'high';
  if (ins?.verdict === 'suspicious') return 'medium';

  // 3. bundle_report verdict
  const verdict = data.bundle_report?.overall_verdict;
  if (verdict === 'confirmed_team_extraction') return 'critical';
  if (verdict === 'suspected_team_extraction' || verdict === 'coordinated_dump_unknown_team') return 'high';

  // 4. deployer rug rate
  const rugRate = data.deployer_profile?.rug_rate_pct;
  if (rugRate != null && rugRate > 70) return 'critical';
  if (rugRate != null && rugRate > 40) return 'high';
  if (rugRate != null && rugRate > 15) return 'medium';

  // 5. fallback
  return 'insufficient_data';
}

/**
 * Derive a basic risk level from token market data (for search results / radar).
 * Used when full lineage data is not available.
 */
export function deriveMarketRisk(token: {
  mint?: string;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  pair_created_at?: string | null;
}, forensicOverride?: { riskScore?: number }): 'low' | 'medium' | 'high' | 'critical' {
  // 1. Use forensic score if available (from investigation history)
  const score = forensicOverride?.riskScore;
  if (score != null && score > 0) {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  // 2. Fallback to market data heuristic
  const mcap = token.market_cap_usd ?? 0;
  const liq = token.liquidity_usd ?? 0;
  const ageMs = token.pair_created_at
    ? Date.now() - new Date(token.pair_created_at).getTime()
    : Infinity;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Tokens with decent mcap + liquidity are not automatically critical
  if (mcap > 500_000 && liq > 50_000) {
    if (ageDays < 1) return 'medium';
    return 'low';
  }
  if (mcap < 10_000 && ageDays < 0.5) return 'critical';
  if (mcap < 50_000 || ageDays < 1 || (liq > 0 && mcap > 0 && liq / mcap < 0.03)) return 'high';
  if (mcap < 500_000 || ageDays < 3) return 'medium';
  return 'low';
}

/** Validate a Solana base58 address (32-44 characters, valid charset). */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(addr: string): boolean {
  return SOLANA_ADDRESS_RE.test(addr);
}
