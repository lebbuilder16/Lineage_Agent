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
