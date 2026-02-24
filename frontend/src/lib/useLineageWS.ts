"use client";

import { useState, useCallback, useRef } from "react";
import {
  fetchLineageWithProgress,
  fetchLineage,
  type LineageResult,
  type ProgressEvent,
} from "./api";

export interface UseLineageWSReturn {
  data: LineageResult | null;
  error: string | null;
  isLoading: boolean;
  progress: ProgressEvent | null;
  /** Start an analysis (WS with progress bar → HTTP fallback). */
  analyze: (mint: string) => void;
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

  const analyze = useCallback((mint: string) => {
    const runId = ++runIdRef.current;
    setData(null);
    setError(null);
    setIsLoading(true);
    setProgress({ step: "Connecting…", progress: 0 });

    fetchLineageWithProgress(mint, (evt) => {
      if (runIdRef.current !== runId) return; // stale
      setProgress(evt);
    })
      .then((result) => {
        if (runIdRef.current !== runId) return;
        setData(result);
        setProgress({ step: "Done", progress: 100 });
      })
      .catch(async (err) => {
        if (runIdRef.current !== runId) return;
        // Fallback to HTTP if WS fails to connect
        try {
          setProgress({ step: "Falling back to HTTP…", progress: 0 });
          const result = await fetchLineage(mint);
          if (runIdRef.current !== runId) return;
          setData(result);
          setProgress({ step: "Done", progress: 100 });
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

  return { data, error, isLoading, progress, analyze };
}
