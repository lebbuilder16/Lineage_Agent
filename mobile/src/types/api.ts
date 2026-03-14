// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — API Type Definitions
// Backend: https://lineage-agent.fly.dev
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenSearchResult {
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  price_usd?: number;
  market_cap_usd?: number;
  liquidity_usd?: number;
  risk_score?: number;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
}

export interface DeathClockForecast {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  predicted_window_start?: string;
  predicted_window_end?: string;
  confidence_level?: number;
  market_signals?: {
    liquidity_trend?: 'dropping' | 'stable' | 'rising';
    sell_pressure?: number;
    volume_trend?: 'declining' | 'stable' | 'surging';
    holder_exodus?: boolean;
  };
}

export interface BundleWallet {
  address: string;
  sol_extracted?: number;
  is_confirmed?: boolean;
  entity_type?: string;
}

export interface BundleExtractionReport {
  overall_verdict: 'clean' | 'suspicious' | 'confirmed_rug';
  bundle_wallets: BundleWallet[];
  total_sol_extracted_confirmed?: number;
  jito_bundle_detected?: boolean;
  sniper_detected?: boolean;
}

export interface SolFlowEdge {
  from_wallet: string;
  to_wallet: string;
  amount_sol: number;
  entity_type?: 'cex' | 'contract' | 'unknown' | 'bridge';
  hop_index: number;
  label?: string;
  from_address?: string;
  to_address?: string;
  sol_amount?: number;
  hop_number?: number;
  flow_type?: string;
  is_extraction?: boolean;
  confidence_pct?: number;
}

export interface CrossChainExit {
  bridge_name: string;
  destination_chain: string;
  amount_sol: number;
  amount_usd?: number;
}

export interface SolFlowReport {
  flows: SolFlowEdge[];
  cross_chain_exits?: CrossChainExit[];
  total_extracted_sol?: number;
  total_extracted_usd?: number;
  terminal_wallets?: string[];
  destination_wallets?: string[];
  known_cex_detected?: boolean;
  hop_count?: number;
}

export interface DeployerTokenSummary {
  mint: string;
  name: string;
  symbol?: string;
  status?: 'active' | 'rugged' | 'dead' | 'honeypot';
  market_cap_usd?: number;
  narrative?: string;
  launched_at?: string;
  risk_level?: string;
  is_rug?: boolean;
}

export interface DeployerProfile {
  address: string;
  rug_rate_pct?: number;
  confirmed_rug_count?: number;
  confirmed_rugs?: number;
  total_tokens_launched?: number;
  total_tokens_deployed?: number;
  total_sol_extracted?: number;
  avg_rug_time_hours?: number;
  operator_fingerprint?: string;
  tokens?: DeployerTokenSummary[];
  avg_lifespan_days?: number;
  active_tokens_count?: number;
  rug_mechanism_counts?: Record<string, number>;
  confidence?: number;
  first_seen?: string;
  last_seen?: string;
}

export interface ZombieAlert {
  is_zombie: boolean;
  wallet_overlap_pct?: number;
  parent_mint?: string;
  clone_signals?: string[];
}

export interface InsiderSellReport {
  detected: boolean;
  insider_wallets?: string[];
  total_sol_extracted?: number;
  sell_pattern?: string;
}

export interface OperatorImpactReport {
  fingerprint: string;
  total_rugged_usd?: number;
  total_tokens?: number;
  wallet_cluster?: string[];
  known_aliases?: string[];
}

export interface CartelEdge {
  from_address: string;
  to_address: string;
  signal_type: 'funding_link' | 'shared_lp' | 'sniper_ring' | 'dna_match' | 'temporal';
  force?: number;
  source?: string;
  target?: string;
  weight?: number;
}

export interface CartelReport {
  community_id?: string;
  financial_score?: number;
  connected_deployers?: string[];
  deployers?: DeployerProfile[];
  deployer_count?: number;
  risk_score?: number;
  total_sol_extracted?: number;
  total_tokens_launched?: number;
  edges?: CartelEdge[];
  funding_links?: number;
  sniper_ring_count?: number;
  shared_lp_count?: number;
  dna_match_count?: number;
}

export interface LineageResult {
  mint: string;
  name?: string;
  symbol?: string;
  image_uri?: string;
  deployer?: DeployerProfile;
  family?: TokenSearchResult[];
  risk_score?: number;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  suspicious_flags?: string[];
  death_clock?: DeathClockForecast;
  bundle_report?: BundleExtractionReport;
  sol_flow?: SolFlowReport;
  zombie_alert?: ZombieAlert;
  operator_fingerprint?: string;
  cartel_report?: CartelReport;
  insider_sell?: InsiderSellReport;
  deployer_profile?: DeployerProfile;
  scan_duration_ms?: number;
}

export interface GraphNode {
  id: string;
  mint: string;
  name?: string;
  symbol?: string;
  image_uri?: string;
  risk_score?: number;
  generation?: number;
  risk_level?: LineageResult['risk_level'];
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation?: string;
}

export interface LineageGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  root_mint: string;
}

export interface TokenCompareResult {
  composite_score?: number;
  similarity_score?: number;
  verdict?: 'IDENTICAL_OPERATOR' | 'CLONE' | 'RELATED' | 'UNRELATED';
  verdict_reasons?: string[];
  same_deployer?: boolean;
  shared_suspicious_flags?: string[];
  token_a?: TokenSearchResult;
  token_b?: TokenSearchResult;
  name_similarity?: number;
  symbol_similarity?: number;
  image_similarity?: number;
  temporal_similarity?: number;
  deployer_similarity?: number;
}

export interface GlobalStats {
  total_scanned_24h?: number;
  rug_count_24h?: number;
  active_deployers_24h?: number;
  total_scanned_all_time?: number;
}

export interface AlertItem {
  id: string;
  type: 'rug' | 'bundle' | 'insider' | 'zombie' | 'death_clock' | 'deployer' | 'narrative';
  alert_type?: string;
  title?: string;
  token_name?: string;
  mint?: string;
  message: string;
  risk_score?: number;
  timestamp: string;
  created_at?: string;
  read: boolean;
}

export interface User {
  id: string;
  privy_id: string;
  username?: string;
  created_at?: string;
}

export interface Watch {
  id: string;
  sub_type: 'deployer' | 'mint';
  value: string;
  identifier?: string;
  created_at?: string;
  label?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version?: string;
  uptime_seconds?: number;
}

export interface AnalysisStep {
  step: 'lineage' | 'bundle' | 'sol_flow' | 'ai' | 'deployer' | 'cartel';
  label: string;
  progress: number;
  done: boolean;
  duration_ms?: number;
}
