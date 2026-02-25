/**
 * API client – calls the FastAPI backend.
 *
 * Features:
 * - AbortController with configurable timeout (default 60s)
 * - Structured error parsing (FastAPI detail field)
 * - Typed response interfaces
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 60_000;

/* ---------- Types --------------------------------------------------- */

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
  // Forensic intelligence signals
  zombie_alert?: ZombieAlert | null;
  death_clock?: DeathClockForecast | null;
  operator_fingerprint?: OperatorFingerprint | null;
  liquidity_arch?: LiquidityArchReport | null;
  factory_rhythm?: FactoryRhythmReport | null;
  narrative_timing?: NarrativeTimingReport | null;
  // New intelligence signals
  deployer_profile?: DeployerProfile | null;
  on_chain_risk?: OnChainRiskScore | null;
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

export interface DeathClockForecast {
  deployer: string;
  historical_rug_count: number;
  median_rug_hours: number;
  stdev_rug_hours: number;
  elapsed_hours: number;
  risk_level: "low" | "medium" | "high" | "critical" | "insufficient_data";
  predicted_window_start: string | null;
  predicted_window_end: string | null;
  confidence_note: string;
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

export interface NarrativeTimingReport {
  narrative: string;
  sample_size: number;
  status: "early" | "rising" | "peak" | "late" | "insufficient_data";
  cycle_percentile: number | null;
  momentum_score: number | null;
  days_since_peak: number | null;
  peak_date: string | null;
  interpretation: string;
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

export interface OnChainRiskScore {
  mint: string;
  holder_count: number;
  top_10_pct: number;
  top_1_pct: number;
  deployer_holds_pct: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  flags: string[];
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
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        signal: controller.signal,
      });

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
          if (body?.detail) detail = body.detail;
        } catch {
          // fallback to status text
          detail = res.statusText || detail;
        }
        throw new ApiError(res.status, detail);
      }

      return await res.json();
    } catch (err) {
      lastError = err;
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
    const res = await fetch(`${API_BASE}${path}`, {
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

export function fetchLineage(mint: string): Promise<LineageResult> {
  return fetchJSON<LineageResult>(`/lineage?mint=${encodeURIComponent(mint)}`);
}

export function fetchDeployerProfile(address: string): Promise<DeployerProfile> {
  return fetchJSON<DeployerProfile>(`/deployer/${encodeURIComponent(address)}`);
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
      ws.send(JSON.stringify({ mint }));
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
