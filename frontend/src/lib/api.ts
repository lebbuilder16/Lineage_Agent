/**
 * API client – calls the FastAPI backend.
 *
 * The base URL defaults to http://localhost:8000 and can be overridden
 * via the NEXT_PUBLIC_API_URL environment variable.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

/* ---------- Fetch helpers ------------------------------------------- */

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/* ---------- Endpoints ----------------------------------------------- */

export function fetchLineage(mint: string): Promise<LineageResult> {
  return fetchJSON<LineageResult>(`/lineage?mint=${encodeURIComponent(mint)}`);
}

export function searchTokens(query: string): Promise<TokenSearchResult[]> {
  return fetchJSON<TokenSearchResult[]>(
    `/search?q=${encodeURIComponent(query)}`
  );
}
