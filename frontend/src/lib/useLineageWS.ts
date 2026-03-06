"use client";

import { useState, useCallback, useRef } from "react";
import {
  fetchLineageWithProgress,
  fetchLineage,
  type LineageResult,
  type ProgressEvent,
} from "./api";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function cacheKey(mint: string) {
  return `lineage_v1:${mint}`;
}

function readCache(mint: string): LineageResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(mint));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: LineageResult };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(mint: string, data: LineageResult) {
  if (typeof window === "undefined") return;
  // Don't cache incomplete results: if bundle_report is null but a deployer
  // exists, the 30s inline cap fired and the background task is still running.
  // Forcing a fresh backend call on the next visit ensures the completed
  // bundle/sol_flow data (persisted to DB by the background task) is shown.
  const deployer = data.root?.deployer || data.query_token?.deployer;
  if (deployer && data.bundle_report == null) {
    return; // incomplete — don't cache
  }
  try {
    sessionStorage.setItem(cacheKey(mint), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // storage quota — ignore
  }
}

export interface UseLineageWSReturn {
  data: LineageResult | null;
  error: string | null;
  isLoading: boolean;
  progress: ProgressEvent | null;
  /** Start a full analysis (WS with progress bar → HTTP fallback). */
  analyze: (mint: string) => void;
  /**
   * Restore cached result for `mint` without hitting the network.
   * Returns `true` if a fresh cache entry was found, `false` otherwise.
   */
  restoreFromCache: (mint: string) => boolean;
}

/**
 * React hook that fetches lineage data via the WebSocket endpoint
 * (streaming progress events) with automatic HTTP fallback.
 */
export function useLineageWS(): UseLineageWSReturn {
  const [data, setData] = useState<LineageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const restoreFromCache = useCallback((mint: string): boolean => {
    const cached = readCache(mint);
    if (!cached) return false;
    setData(cached);
    setError(null);
    setIsLoading(false);
    setProgress({ step: "Done", progress: 100 });
    return true;
  }, []);

  const analyze = useCallback((mint: string) => {
    // Cancel any in-flight WebSocket from a previous call
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const runId = ++runIdRef.current;
    setData(null);
    setError(null);
    setIsLoading(true);
    setProgress({ step: "Connecting…", progress: 0 });

    fetchLineageWithProgress(mint, (evt) => {
      if (runIdRef.current !== runId) return; // stale
      setProgress(evt);
    }, controller.signal)
      .then((result) => {
        if (runIdRef.current !== runId) return;
        setData(result);
        setProgress({ step: "Done", progress: 100 });
        writeCache(mint, result);
      })
      .catch(async (err) => {
        if (runIdRef.current !== runId) return;
        // Ignore intentional abort (user started a new search)
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Fallback to HTTP if WS fails to connect
        try {
          setProgress({ step: "Falling back to HTTP…", progress: 0 });
          const result = await fetchLineage(mint);
          if (runIdRef.current !== runId) return;
          setData(result);
          setProgress({ step: "Done", progress: 100 });
          writeCache(mint, result);
        } catch (fallbackErr) {
          if (runIdRef.current !== runId) return;
          const msg =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : "Unknown error";
          setError(msg);
        }
      })
      .finally(() => {
        if (runIdRef.current !== runId) return;
        setIsLoading(false);
      });
  }, []);

  return { data, error, isLoading, progress, analyze, restoreFromCache };
}
