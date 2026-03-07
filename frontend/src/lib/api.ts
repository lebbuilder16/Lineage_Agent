/**
 * API client – calls the FastAPI backend.
 *
 * Features:
 * - AbortController with configurable timeout (default 60s)
 * - Structured error parsing (FastAPI detail field)
 * - Typed response interfaces
 */

// Used only for WebSocket connections (cannot be proxied via Next.js API routes).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// All HTTP requests go through the Next.js server-side proxy so that the
// browser never needs a direct route to localhost:8000 (critical in Codespaces,
// Docker environments, and any setup where the backend is not on the public internet).
const HTTP_API = "/api/proxy";
const DEFAULT_TIMEOUT_MS = 60_000;

/* ---------- Types --------------------------------------------------- */

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  deployer: string;
  created_at: string | null;
  /** Earliest DexScreener pairCreatedAt — when the token was first listed on a DEX.
   * Distinct from created_at which is the on-chain mint initialisation date.
   * When pair_created_at is much more recent than created_at, the token was stealth pre-minted. */
  pair_created_at: string | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  price_usd: number | null;
  dex_url: string;
  metadata_uri: string;
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
  created_at: string | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  evidence: SimilarityEvidence;
  parent_mint: string;
  generation: number;
}

export interface LineageResult {
  mint: string;
  root: TokenMetadata | null;
  confidence: number;
  derivatives: DerivativeInfo[];
  family_size: number;
  query_token: TokenMetadata | null;
  /** True when the scanned token IS the root (original). False = clone. */
  query_is_root: boolean;
  // Forensic intelligence signals
  zombie_alert?: ZombieAlert | null;
  death_clock?: DeathClockForecast | null;
  operator_fingerprint?: OperatorFingerprint | null;
  liquidity_arch?: LiquidityArchReport | null;
  factory_rhythm?: FactoryRhythmReport | null;
  // New intelligence signals
  deployer_profile?: DeployerProfile | null;
  // Forensic deep-dive signals (Initiatives 1-5)
  operator_impact?: OperatorImpactReport | null;
  sol_flow?: SolFlowReport | null;
  cartel_report?: CartelReport | null;
  insider_sell?: InsiderSellReport | null;
  bundle_report?: BundleExtractionReport | null;
  /** UTC ISO-8601 timestamp of when this analysis was computed (not when served from cache). */
  scanned_at?: string | null;
}

/* ---------- Forensic signal types ----------------------------------- */

export interface ZombieAlert {
  original_mint: string;
  original_name: string | null;
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
  linked_wallet_tokens: Record<string, {
    mint: string;
    name: string;
    symbol: string;
    created_at: string | null;
    rugged_at: string | null;
    mcap_usd: number | null;
    narrative: string;
  }[]>;
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

export interface TokenSearchResult {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  dex_url: string;
}

/* ---------- New intelligence signal types ----------------------------- */

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

/* ---------- Initiative 1: Operator Impact Report -------------------- */

export interface OperatorImpactReport {
  fingerprint: string;
  linked_wallets: string[];
  total_tokens_launched: number;
  total_rug_count: number;
  rug_rate_pct: number;
  estimated_extracted_usd: number;
  active_tokens: string[];
  narrative_sequence: string[];
  is_campaign_active: boolean;
  peak_concurrent_tokens: number;
  first_activity: string | null;
  last_activity: string | null;
  wallet_profiles: DeployerProfile[];
  confidence: "high" | "medium" | "low";
}

/* ---------- Initiative 2: Follow The SOL ---------------------------- */

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

export interface CrossChainExit {
  from_address: string;
  bridge_name: string;
  dest_chain: string;
  dest_address: string;
  amount_sol: number;
  tx_signature: string;
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
  cross_chain_exits: CrossChainExit[];
}

/* ---------- Initiative 3: Cartel Graph ------------------------------ */

export interface CartelEdge {
  wallet_a: string;
  wallet_b: string;
  signal_type:
    | "dna_match"
    | "sol_transfer"
    | "timing_sync"
    | "phash_cluster"
    | "cross_holding"
    | "funding_link"
    | "shared_lp"
    | "sniper_ring";
  signal_strength: number;
  evidence: Record<string, unknown>;
}

export interface FinancialGraphSummary {
  deployer: string;
  funding_links: number;
  shared_lp_count: number;
  sniper_ring_count: number;
  metadata_edges: number;
  financial_score: number;
  edges: CartelEdge[];
  connected_deployers: string[];
}

export interface CartelCommunity {
  community_id: string;
  wallets: string[];
  total_tokens_launched: number;
  total_rugs: number;
  estimated_extracted_usd: number;
  active_since: string | null;
  strongest_signal: string;
  edges: CartelEdge[];
  confidence: "high" | "medium" | "low";
}

export interface CartelReport {
  mint: string;
  deployer_community: CartelCommunity | null;
}

/* ---------- Bundle wallet forensic tracking (Initiative 5) --------- */

export type BundleWalletVerdict =
  | "confirmed_team"
  | "suspected_team"
  | "coordinated_dump"
  | "early_buyer";

export interface FundDestination {
  destination: string;
  lamports: number;
  hop: number;
  link_to_deployer: boolean;
  seen_in_other_bundles: boolean;
}

export interface PreSellBehavior {
  wallet_age_days: number | null;
  is_dormant: boolean;
  prefund_source: string | null;
  prefund_sol: number;
  prefund_hours_before_launch: number | null;
  prefund_source_is_deployer: boolean;
  prefund_source_is_known_funder: boolean;
  pre_launch_tx_count: number;
  pre_launch_unique_tokens: number;
  prior_bundle_count: number;
  same_deployer_prior_launches: number;
}

export interface PostSellBehavior {
  sell_detected: boolean;
  sell_slot: number | null;
  sell_tx_signature: string | null;
  sol_received_from_sell: number;
  fund_destinations: FundDestination[];
  direct_transfer_to_deployer: boolean;
  transfer_to_deployer_linked_wallet: boolean;
  indirect_via_intermediary: boolean;
  common_destination_with_other_bundles: boolean;
}

export interface BundleWalletAnalysis {
  wallet: string;
  sol_spent: number;
  pre_sell: PreSellBehavior;
  post_sell: PostSellBehavior;
  red_flags: string[];
  verdict: BundleWalletVerdict;
}

export type BundleOverallVerdict =
  | "confirmed_team_extraction"
  | "suspected_team_extraction"
  | "coordinated_dump_unknown_team"
  | "early_buyers_no_link_proven";

/* ---------- Initiative 4: Insider Sell / Silent Drain -------------- */

export interface InsiderSellEvent {
  wallet: string;
  role: "deployer" | "linked";
  balance_now: number;
  exited: boolean;
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
  wallet_events: InsiderSellEvent[];
  flags: string[];
  risk_score: number;
  verdict: "clean" | "suspicious" | "insider_dump";
}

/* ---------- Initiative 5: Bundle Extraction ------------------------- */

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
  common_sink_wallets: string[];
  coordinated_sell_detected: boolean;
  overall_verdict: BundleOverallVerdict;
  evidence_chain: string[];
  analysis_timestamp: string;
}

export function fetchBundleReport(mint: string, deployer?: string): Promise<BundleExtractionReport> {
  const qs = deployer ? `?deployer=${deployer}` : "";
  return fetchJSON<BundleExtractionReport>(`/bundle/${mint}${qs}`, 35_000);
}

/* ---------- Token compare / global stats types --------------------- */

export interface NarrativeCount {
  narrative: string;
  count: number;
}

export interface GlobalStats {
  tokens_scanned_24h: number;
  tokens_rugged_24h: number;
  /** Percentage 0–100 (not a ratio) */
  rug_rate_24h_pct: number;
  active_deployers_24h: number;
  top_narratives: NarrativeCount[];
  db_events_total: number;
  last_updated: string;
}

export interface TokenCompareResult {
  mint_a: string;
  mint_b: string;
  token_a: TokenMetadata | null;
  token_b: TokenMetadata | null;
  same_deployer: boolean;
  same_family: boolean;
  name_similarity: number;
  symbol_similarity: number;
  /** -1 = no image URL, -2 = image fetch failed/timed-out, [0,1] = score */
  image_similarity: number;
  /** 0=very different ages, 0.5=same age/unknown, 1=token_a significantly older */
  temporal_score: number;
  metadata_uri_match: boolean;
  image_url_match: boolean;
  same_token_program: boolean;
  composite_score: number;
  verdict: string;
  verdict_reasons: string[];
}

/* ---------- Error class --------------------------------------------- */

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/* ---------- Fetch helpers ------------------------------------------- */

const MAX_RETRIES = 2;

async function fetchJSON<T>(
  path: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // LOG: visible in browser DevTools → Console
  console.debug(`[api] fetchJSON → ${HTTP_API}${path}`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${HTTP_API}${path}`, {
        signal: controller.signal,
      });

      // LOG: show what HTTP status came back
      console.debug(`[api] fetchJSON ← ${res.status} ${res.statusText}  (attempt ${attempt + 1})`);

      // --- 429 rate-limited: honour Retry-After header then retry ----------
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 30_000) : 2_000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          // LOG: dump the error body for easier debugging
          console.error(`[api] fetchJSON error body:`, body);
          if (body?.detail) detail = body.detail;
        } catch {
          // fallback to status text
          detail = res.statusText || detail;
        }
        throw new ApiError(res.status, detail);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(0, "Request timed out – the backend may be processing a large analysis. Try again.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // All retries exhausted (only reachable for 429s)
  throw new ApiError(429, "Rate limited – please wait a moment and try again.");
}

async function fetchJSONPost<T>(
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${HTTP_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const b = await res.json();
        if (b?.detail) detail = b.detail;
      } catch { /* */ }
      throw new ApiError(res.status, detail);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Endpoints ----------------------------------------------- */

export function fetchLineage(mint: string, forceRefresh?: boolean): Promise<LineageResult> {
  const url = `/lineage?mint=${encodeURIComponent(mint)}${forceRefresh ? "&force_refresh=true" : ""}`;
  return fetchJSON<LineageResult>(url);
}

export function fetchDeployerProfile(address: string): Promise<DeployerProfile> {
  return fetchJSON<DeployerProfile>(`/deployer/${encodeURIComponent(address)}`);
}

export function fetchOperatorImpact(fingerprint: string): Promise<OperatorImpactReport> {
  return fetchJSON<OperatorImpactReport>(`/operator/${encodeURIComponent(fingerprint)}`);
}

export function fetchSolTrace(mint: string): Promise<SolFlowReport> {
  return fetchJSON<SolFlowReport>(`/lineage/${encodeURIComponent(mint)}/sol-trace`);
}

export function fetchCartelSearch(deployer: string): Promise<CartelReport> {
  return fetchJSON<CartelReport>(`/cartel/search?deployer=${encodeURIComponent(deployer)}`);
}

export function fetchCompare(mintA: string, mintB: string): Promise<TokenCompareResult> {
  return fetchJSON<TokenCompareResult>(
    `/compare?mint_a=${encodeURIComponent(mintA)}&mint_b=${encodeURIComponent(mintB)}`,
    30_000,
  );
}

export function fetchGlobalStats(): Promise<GlobalStats> {
  return fetchJSON<GlobalStats>("/stats/global", 15_000);
}

export function fetchCartelCommunity(communityId: string): Promise<CartelCommunity> {
  return fetchJSON<CartelCommunity>(`/cartel/${encodeURIComponent(communityId)}`);
}

export function fetchFinancialGraph(deployer: string): Promise<FinancialGraphSummary> {
  return fetchJSON<FinancialGraphSummary>(`/cartel/${encodeURIComponent(deployer)}/financial`, 60_000);
}

export function searchTokens(query: string): Promise<TokenSearchResult[]> {
  return fetchJSON<TokenSearchResult[]>(
    `/search?q=${encodeURIComponent(query)}`,
  );
}

/* ---------- WebSocket lineage with progress ------------------------- */

export interface ProgressEvent {
  step: string;
  progress: number;
}

/**
 * Fetch lineage via the WebSocket endpoint, streaming progress events.
 *
 * Protocol:
 *  1. connect to ws://.../ws/lineage
 *  2. send { mint }
 *  3. receive { step, progress } events  →  onProgress callback
 *  4. receive { done: true, result } or { done: true, error }
 */
export function fetchLineageWithProgress(
  mint: string,
  onProgress: (event: ProgressEvent) => void,
  signal?: AbortSignal,
  forceRefresh?: boolean,
): Promise<LineageResult> {
  return new Promise((resolve, reject) => {
    const wsBase = API_BASE.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/ws/lineage`);
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new ApiError(408, "Analysis timed out after 30s"));
      }
    }, 30_000);

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        fn();
      }
    };

    // Close WS and reject if caller aborts (e.g. a new search started)
    if (signal) {
      signal.addEventListener("abort", () => {
        ws.close();
        settle(() => reject(new DOMException("Aborted", "AbortError")));
      });
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ mint, force_refresh: !!forceRefresh }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.done) {
          if (msg.error) {
            settle(() => reject(new ApiError(500, msg.error)));
          } else {
            settle(() => resolve(msg.result as LineageResult));
          }
          ws.close();
        } else if (msg.step !== undefined) {
          onProgress({ step: msg.step, progress: msg.progress ?? 0 });
        }
      } catch {
        // Ignore parse errors on individual messages
      }
    };

    ws.onerror = () => {
      settle(() => reject(new ApiError(0, "WebSocket connection failed")));
    };

    ws.onclose = (event) => {
      if (!event.wasClean && event.code !== 1000) {
        settle(() => reject(new ApiError(0, "WebSocket closed unexpectedly")));
      }
    };
  });
}

/* ---------- Batch endpoint ------------------------------------------ */

export function fetchLineageBatch(
  mints: string[],
): Promise<Record<string, LineageResult>> {
  return fetchJSONPost<Record<string, LineageResult>>("/lineage/batch", {
    mints,
  });
}

/* ---------- AI Forensic Analysis ------------------------------------ */

export interface AIAnalysisNarrative {
  observation: string;
  pattern: string;
  risk: string;
}

export interface AIAnalysis {
  risk_score: number | null;
  confidence: "low" | "medium" | "high";
  rug_pattern: string;
  verdict_summary: string;
  /** Cross-signal integrated analysis (replaces narrative + conviction_chain + operator_hypothesis) */
  analysis: string;
  key_findings: string[];
  model: string;
  analyzed_at: string;
  parse_error?: boolean;
  /** @deprecated use analysis */
  narrative?: { observation: string; pattern?: string | null; risk?: string | null };
}

export interface AnalyzeForensicBundle {
  verdict: string;
  wallets_count: number;
  confirmed_team_wallets: string[];
  suspected_team_wallets: string[];
  coordinated_dump_wallets: string[];
  launch_slot: number | null;
  total_sol_spent: number;
  total_sol_extracted: number;
  coordinated_sell_detected: boolean;
  common_prefund_source: string | null;
  common_sink_wallets: string[];
  evidence_chain: string[];
}

export interface AnalyzeForensicSolFlow {
  total_extracted_sol: number;
  total_extracted_usd: number | null;
  hops_traced: number;
  terminal_wallets_count: number;
  known_cex_detected: boolean;
  cross_chain_exits_count: number;
  rug_timestamp: string | null;
}

export interface AnalyzeForensicLineage {
  family_size: number;
  clones_count: number;
  lineage_confidence: number;
  query_is_root: boolean;
  unique_deployers_count: number;
  zombie_relaunch_detected: boolean;
  death_clock_risk: string | null;
  rug_count: number;
}

export interface AnalyzeResponse {
  token: {
    mint: string;
    name?: string;
    symbol?: string;
    image_uri?: string;
    deployer?: string;
    created_at?: string | null;
    market_cap_usd?: number | null;
    liquidity_usd?: number | null;
    dex_url?: string;
  };
  ai_analysis: AIAnalysis;
  forensic: {
    bundle?: AnalyzeForensicBundle;
    sol_flow?: AnalyzeForensicSolFlow;
    lineage?: AnalyzeForensicLineage;
  };
  evidence: {
    wallet_classifications?: Record<string, string>;
    bundle_wallets?: Array<{
      wallet: string;
      verdict: string;
      sol_spent: number;
      flags: string[];
    }>;
    sol_flows?: Array<{
      hop: number;
      from: string;
      to: string;
      amount_sol: number;
      to_label: string | null;
      entity_type: string | null;
      signature: string;
      block_time: string | null;
    }>;
    terminal_wallets?: string[];
    clone_tokens?: Array<{
      mint: string;
      name: string;
      symbol: string;
      generation: number | null;
      deployer: string;
      created_at: string | null;
      market_cap_usd: number | null;
      similarity_score: number | null;
    }>;
    root_token?: {
      mint: string;
      name: string;
      symbol: string;
      deployer: string;
      created_at: string | null;
      market_cap_usd: number | null;
    };
  };
}

export async function fetchAnalysis(mint: string): Promise<AnalyzeResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000); // 90s — Claude can be slow
  try {
    const res = await fetch(`${HTTP_API}/analyze/${mint}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Forensic Chat (Phase 3.1) -------------------------------- */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream a forensic chat reply for a specific mint via SSE.
 * Calls onToken for each text chunk, onDone when complete, onError on failure.
 * Returns an AbortController so the caller can cancel the stream.
 */
export function streamForensicChat(
  mint: string,
  message: string,
  history: ChatMessage[],
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (detail: string) => void,
): AbortController {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${HTTP_API}/chat/${encodeURIComponent(mint)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let event = "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            try {
              const data = JSON.parse(raw);
              if (event === "token" && data.text) onToken(data.text);
              else if (event === "done") onDone();
              else if (event === "error") onError(data.detail ?? "Unknown error");
            } catch {}
            event = "";
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      onError("Connection failed");
    }
  })();

  return ctrl;
}
