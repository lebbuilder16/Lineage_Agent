// src/types/api.ts
// Miroir des modèles Pydantic du backend — gardé synchronisé manuellement

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  deployer: string;
  created_at: string | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  price_usd: number | null;
  dex_url: string;
  metadata_uri: string;
  token_standard: string;
  pair_created_at: string | null;
}

export interface SimilarityEvidence {
  name_score: number;
  symbol_score: number;
  image_score: number;
  deployer_score: number;
  temporal_score: number;
  composite_score: number;
}

export interface DerivativeInfo {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  deployer: string;
  metadata_uri: string;
  created_at: string | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  evidence: SimilarityEvidence;
  parent_mint: string;
  generation: number;
}

export interface ZombieAlert {
  original_mint: string;
  original_name: string;
  original_rugged_at: string | null;
  original_liq_peak_usd: number | null;
  resurrection_mint: string;
  image_similarity: number;
  same_deployer: boolean;
  confidence: "confirmed" | "probable" | "possible";
}

export interface MarketSignals {
  liquidity_usd: number | null;
  market_cap_usd: number | null;
  liq_to_mcap_ratio: number | null;
  price_change_h1_pct: number | null;
  volume_h1_usd: number | null;
  sell_pressure_pct: number | null;
  volume_trend: "declining" | "stable" | "rising";
  adjusted_risk_boost: number;
}

export interface DeathClockForecast {
  deployer: string;
  historical_rug_count: number;
  median_rug_hours: number;
  stdev_rug_hours: number;
  elapsed_hours: number;
  risk_level: "low" | "medium" | "high" | "critical" | "first_rug" | "insufficient_data";
  predicted_window_start: string | null;
  predicted_window_end: string | null;
  confidence_note: string;
  sample_count: number;
  confidence_level: "low" | "medium" | "high";
  market_signals: MarketSignals | null;
}

export interface OperatorFingerprint {
  fingerprint: string;
  linked_wallets: string[];
  upload_service: string;
  description_pattern: string;
  confidence: "confirmed" | "probable";
  linked_wallet_tokens: Record<string, DeployerTokenSummary[]>;
}

export interface LiquidityArchReport {
  total_liquidity_usd: number;
  pool_count: number;
  pools: Record<string, number>;
  concentration_hhi: number;
  liq_to_volume_ratio: number | null;
  authenticity_score: number;
  flags: string[];
}

export interface FactoryRhythmReport {
  tokens_launched: number;
  median_interval_hours: number;
  regularity_score: number;
  naming_pattern: "incremental" | "themed" | "random";
  factory_score: number;
  is_factory: boolean;
}

export interface DeployerTokenSummary {
  mint: string;
  name: string;
  symbol: string;
  created_at: string | null;
  rugged_at: string | null;
  mcap_usd: number | null;
  narrative: string;
}

export interface DeployerProfile {
  address: string;
  chain?: string;
  total_tokens_launched: number;
  rug_count: number;
  rug_rate_pct: number;
  avg_lifespan_days: number | null;
  active_tokens: number;
  preferred_narrative: string;
  first_seen: string | null;
  last_seen: string | null;
  tokens: DeployerTokenSummary[];
  confidence: "high" | "medium" | "low";
}

export interface InsiderSellReport {
  mint: string;
  sell_pressure_1h: number | null;
  sell_pressure_6h: number | null;
  sell_pressure_24h: number | null;
  price_change_1h: number | null;
  price_change_6h: number | null;
  price_change_24h: number | null;
  volume_spike_ratio: number | null;
  deployer_exited: boolean | null;
  wallet_events: Array<{
    wallet: string;
    role: "deployer" | "linked";
    balance_now: number;
    exited: boolean;
  }>;
  flags: string[];
  risk_score: number;
  verdict: "clean" | "suspicious" | "insider_dump";
}

export interface BundleWalletAnalysis {
  wallet: string;
  sol_spent: number;
  pre_sell: {
    wallet_age_days: number | null;
    is_dormant: boolean;
    prefund_source: string | null;
    prefund_sol: number;
    prefund_hours_before_launch: number | null;
    prefund_source_is_deployer: boolean;
    prefund_source_is_known_funder: boolean;
    pre_launch_tx_count: number;
    prior_bundle_count: number;
    same_deployer_prior_launches: number;
  };
  post_sell: {
    sell_detected: boolean;
    sol_received_from_sell: number;
    direct_transfer_to_deployer: boolean;
    transfer_to_deployer_linked_wallet: boolean;
    indirect_via_intermediary: boolean;
    common_destination_with_other_bundles: boolean;
  };
  red_flags: string[];
  verdict: "confirmed_team" | "suspected_team" | "coordinated_dump" | "early_buyer";
}

export interface BundleExtractionReport {
  mint: string;
  deployer: string;
  launch_slot: number | null;
  bundle_wallets: BundleWalletAnalysis[];
  confirmed_team_wallets: string[];
  suspected_team_wallets: string[];
  coordinated_dump_wallets: string[];
  early_buyer_wallets: string[];
  total_sol_spent_by_bundle: number;
  total_sol_extracted_confirmed: number;
  total_usd_extracted: number | null;
  common_prefund_source: string | null;
  factory_address: string | null;
  factory_funded_deployer: boolean;
  factory_sniper_wallets: string[];
  common_sink_wallets: string[];
  coordinated_sell_detected: boolean;
  overall_verdict:
    | "confirmed_team_extraction"
    | "suspected_team_extraction"
    | "coordinated_dump_unknown_team"
    | "early_buyers_no_link_proven";
  evidence_chain: string[];
  analysis_timestamp: string;
}

export interface SolFlowEdge {
  from_address: string;
  to_address: string;
  amount_sol: number;
  hop: number;
  signature: string;
  block_time: string | null;
  from_label: string | null;
  to_label: string | null;
  entity_type: string | null;
}

export interface SolFlowReport {
  mint: string;
  deployer: string;
  total_extracted_sol: number;
  total_extracted_usd: number | null;
  flows: SolFlowEdge[];
  terminal_wallets: string[];
  known_cex_detected: boolean;
  hop_count: number;
  analysis_timestamp: string;
  rug_timestamp: string | null;
  cross_chain_exits: Array<{
    from_address: string;
    bridge_name: string;
    dest_chain: string;
    dest_address: string;
    amount_sol: number;
    tx_signature: string;
  }>;
}

export interface CartelCommunity {
  community_id: string;
  wallets: string[];
  total_tokens_launched: number;
  total_rugs: number;
  estimated_extracted_usd: number;
  active_since: string | null;
  strongest_signal: string;
  confidence: "high" | "medium" | "low";
}

export interface CartelReport {
  mint: string;
  deployer_community: CartelCommunity | null;
}

export interface LineageResult {
  mint: string;
  root: TokenMetadata | null;
  confidence: number;
  derivatives: DerivativeInfo[];
  family_size: number;
  query_token: TokenMetadata | null;
  query_is_root: boolean;
  zombie_alert: ZombieAlert | null;
  death_clock: DeathClockForecast | null;
  operator_fingerprint: OperatorFingerprint | null;
  liquidity_arch: LiquidityArchReport | null;
  factory_rhythm: FactoryRhythmReport | null;
  deployer_profile: DeployerProfile | null;
  insider_sell: InsiderSellReport | null;
  bundle_report: BundleExtractionReport | null;
  sol_flow: SolFlowReport | null;
  cartel_report: CartelReport | null;
}

export interface TokenSearchResult {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  metadata_uri: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  dex_url: string;
  pair_created_at: string | null;
}

export interface GlobalStats {
  tokens_scanned_24h: number;
  tokens_rugged_24h: number;
  rug_rate_24h_pct: number;
  active_deployers_24h: number;
  top_narratives: Array<{ narrative: string; count: number }>;
  db_events_total: number;
  last_updated: string;
  // Aliased fields used by some UI components
  total_scanned_24h?: number;
  rug_count_24h?: number;
}

export interface StatsBrief {
  text: string;
  generated_at: string;
  // Alias used by some UI components
  summary?: string;
}

// Auth
export interface User {
  id: string;
  privy_id: string;
  email: string | null;
  wallet_address: string | null;
  plan: "free" | "pro";
  api_key: string;
  created_at: string;
}

export interface Watch {
  id: number;
  mint: string | null;
  deployer: string | null;
  label: string;
}

// App-level alert item (for notification center)
export interface AlertItem {
  id: string;
  type: "rug" | "bundle" | "insider" | "zombie" | "death_clock";
  mint: string;
  token_name: string;
  token_image: string;
  message: string;
  timestamp: string;
  read: boolean;
  risk_score?: number;
}

// ─── Scan History ────────────────────────────────────────────────────────────

export interface ScanSnapshot {
  snapshot_id: number;
  user_id: number;
  mint: string;
  scanned_at: string;
  scan_number: number;
  risk_score: number;
  flags: string[];
  family_size: number;
  rug_count: number;
  death_clock_risk: string | null;
  bundle_verdict: string | null;
  insider_verdict: string | null;
  zombie_detected: boolean;
  token_name: string;
  token_symbol: string;
}

export interface ScanDelta {
  mint: string;
  current_scan: ScanSnapshot;
  previous_scan: ScanSnapshot;
  scan_number: number;
  risk_score_delta: number;
  new_flags: string[];
  resolved_flags: string[];
  family_size_delta: number;
  rug_count_delta: number;
  trend: "worsening" | "stable" | "improving";
  narrative: string | null;
}

export interface ScanHistory {
  scan_count: number;
  plan: "free" | "pro";
  snapshots: ScanSnapshot[];
}
