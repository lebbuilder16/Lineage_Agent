// Lineage Agent -- API types (auto-generated + manual supplements)
// Generated source: https://lineage-agent.fly.dev/openapi.json
// Run `npm run gen:types` to refresh api.generated.ts

// Re-export OpenAPI primitives for advanced consumers
export type { components, paths, operations } from './api.generated';
import type { components } from './api.generated';

// Schema-derived types (authoritative -- do NOT edit manually)
export type TokenSearchResult    = components['schemas']['TokenSearchResult'];
export type LineageResult        = components['schemas']['LineageResult'];
export type DeathClockForecast   = components['schemas']['DeathClockForecast'];
export type MarketSignals        = components['schemas']['MarketSignals'];
export type DeployerProfile      = components['schemas']['DeployerProfile'];
export type DeployerTokenSummary = components['schemas']['DeployerTokenSummary'];
export type SolFlowReport        = components['schemas']['SolFlowReport'];
export type SolFlowEdge          = components['schemas']['SolFlowEdge'];
export type CrossChainExit       = components['schemas']['CrossChainExit'];
export type CartelReport         = components['schemas']['CartelReport'];
export type CartelEdge           = components['schemas']['CartelEdge'];
export type BundleExtractionReport = components['schemas']['BundleExtractionReport'];
export type ZombieAlert          = components['schemas']['ZombieAlert'];
export type InsiderSellReport    = components['schemas']['InsiderSellReport'];
export type OperatorImpactReport = components['schemas']['OperatorImpactReport'];
export type TokenCompareResult   = components['schemas']['TokenCompareResult'];
export type GlobalStats          = components['schemas']['GlobalStats'];
export type TokenMetadata        = components['schemas']['TokenMetadata'];
export type DerivativeInfo       = components['schemas']['DerivativeInfo'];
export type LiquidityArchReport  = components['schemas']['LiquidityArchReport'];
export type FactoryRhythmReport  = components['schemas']['FactoryRhythmReport'];
export type OperatorFingerprint  = components['schemas']['OperatorFingerprint'];
export type BundleWalletAnalysis = components["schemas"]["BundleWalletAnalysis"];
export type FinancialGraphSummary = components["schemas"]["FinancialGraphSummary"];

// Manual types -- endpoints not yet typed in the OpenAPI schema

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version?: string;
  uptime_seconds?: number;
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
  /** OpenClaw AI enrichment — added asynchronously after receipt */
  enrichedData?: {
    summary: string;
    relatedTokens: string[];
    riskDelta: number;
    deployerHistory?: string;
    recommendedAction?: string;
  };
  /** Agent-proposed actions (Phase 5 — device node) */
  actions?: {
    label: string;
    action: string;
    params: Record<string, string>;
  }[];
  /** Which external channels delivered this alert */
  deliveredChannels?: string[];
}

export interface AnalysisStep {
  step: 'lineage' | 'bundle' | 'sol_flow' | 'ai' | 'deployer' | 'cartel';
  status: 'running' | 'done';
  ms?: number;
  heuristic?: number;
}

export interface GraphNode {
  id: string;
  mint: string;
  name?: string;
  symbol?: string;
  image_uri?: string;
  risk_score?: number;
  generation?: number;
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

export interface TopToken {
  mint: string;
  name: string;
  symbol: string;
  narrative?: string | null;
  mcap_usd?: number | null;
  event_count: number;
  created_at?: string | null;
}
