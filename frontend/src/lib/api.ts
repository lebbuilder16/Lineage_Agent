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
}

export interface LineageResult {
  mint: string;
  root: TokenMetadata | null;
  confidence: number;
  derivatives: DerivativeInfo[];
  family_size: number;
  query_token: TokenMetadata | null;
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

/* ---------- Endpoints ----------------------------------------------- */

export function fetchLineage(mint: string): Promise<LineageResult> {
  return fetchJSON<LineageResult>(`/lineage?mint=${encodeURIComponent(mint)}`);
}

export function searchTokens(query: string): Promise<TokenSearchResult[]> {
  return fetchJSON<TokenSearchResult[]>(
    `/search?q=${encodeURIComponent(query)}`,
  );
}
