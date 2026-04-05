/**
 * Shared flag display helpers — used by WatchCard, AgentActivityFeed, FlagTimeline.
 */
import { tokens } from '../theme/tokens';

export const FLAG_LABELS: Record<string, string> = {
  SOL_EXTRACTION_NEW: 'SOL extracted',
  SOL_EXTRACTION_INCREASED: 'SOL extraction \u2191',
  DEPLOYER_EXITED: 'Deployer exited',
  INSIDER_DUMP_DETECTED: 'Insider dump',
  BUNDLE_DETECTED: 'Bundle detected',
  BUNDLE_WALLETS_NEW: 'New bundle wallets',
  CARTEL_DETECTED: 'Cartel network detected',
  CARTEL_EXPANDED: 'Cartel expanded',
  RISK_ESCALATION: 'Risk escalated',
  DEPLOYER_NEW_RUG: 'New rug by deployer',
  SELL_PRESSURE_SPIKE: 'Sell pressure spike',
  BUNDLE_WALLET_EXIT: 'Bundle wallet sold',
  BUNDLE_WALLETS_ALL_EXITED: 'All bundles exited',
  CORRELATED_FORENSIC_MARKET: 'Forensic \u00D7 Market',
  FORENSIC_ACTIVITY: 'Forensic activity',
  MARKET_STRESS: 'Market stress',
  PRICE_CRASH: 'Price crash',
  LIQUIDITY_DRAIN: 'Liquidity drain',
  CUMULATIVE_PRICE_CRASH: 'Price crashed (cumul.)',
  CUMULATIVE_PRICE_DECLINE: 'Price decline (cumul.)',
  CUMULATIVE_LIQ_DRAIN: 'Liquidity drained (cumul.)',
  CUMULATIVE_SOL_EXTRACTION: 'SOL extracted (cumul.)',
  INITIAL_ASSESSMENT: 'Initial assessment',
  DEPLOYER_NEW_TOKEN: 'Deployer launched token',
};

/** Critical flag types that use red styling */
const CRITICAL_FLAG_TYPES = new Set([
  'DEPLOYER_EXITED', 'INSIDER_DUMP_DETECTED', 'DEPLOYER_NEW_RUG',
  'BUNDLE_WALLETS_ALL_EXITED', 'CUMULATIVE_PRICE_CRASH', 'CUMULATIVE_LIQ_DRAIN',
  'CORRELATED_FORENSIC_MARKET', 'RISK_ESCALATION',
]);

export function flagLabel(flagType: string): string {
  if (FLAG_LABELS[flagType]) return FLAG_LABELS[flagType];
  // Trinity-generated dynamic flags: title-case SCREAMING_SNAKE
  return flagType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function flagColor(flagType: string, severity: string): string {
  if (severity === 'critical' || CRITICAL_FLAG_TYPES.has(flagType)) {
    return tokens.risk.critical;
  }
  if (severity === 'warning') return tokens.risk.high;
  return tokens.textTertiary;
}

export function severityEmoji(severity: string): string {
  if (severity === 'critical') return '\u26A0\uFE0F';
  if (severity === 'warning') return '\u26A0';
  return '\u2139\uFE0F';
}

/**
 * Derive effective risk score from heuristic + forensic signal text.
 * Used to bump low heuristic scores when verdict/findings indicate higher risk.
 */
export function deriveEffectiveRisk(
  score: number,
  verdict?: string,
  findings?: string[],
): { score: number; color: string } {
  const text = [verdict ?? '', ...(findings ?? [])].join(' ').toLowerCase();
  const criticalSignals = ['rug', 'insider dump', 'confirmed extraction', 'team extraction', 'critical'];
  const highSignals = ['deployer exited', 'bundle', 'cartel', 'high risk', 'suspicious', 'extraction', 'coordinated'];
  const mediumSignals = ['medium', 'sell pressure', 'insufficient_data'];

  let effective = score;
  if (criticalSignals.some((s) => text.includes(s)) && effective < 75) {
    effective = Math.max(effective, 75);
  } else if (highSignals.some((s) => text.includes(s)) && effective < 50) {
    effective = Math.max(effective, 55);
  } else if (mediumSignals.some((s) => text.includes(s)) && effective < 25) {
    effective = Math.max(effective, 30);
  }

  const color = effective >= 75 ? tokens.risk.critical
    : effective >= 50 ? tokens.risk.high
    : effective >= 25 ? tokens.risk.medium
    : tokens.secondary;

  return { score: effective, color };
}
