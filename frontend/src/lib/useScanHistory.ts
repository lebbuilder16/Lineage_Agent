"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev";

export interface ScanSnapshot {
  snapshot_id: number;
  user_id: number;
  mint: string;
  scanned_at: string; // ISO datetime
  scan_number: number;
  risk_score: number;
  flags: string[];
  family_size: number;
  rug_count: number;
  death_clock_risk: string;
  bundle_verdict: string;
  insider_verdict: string;
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

interface HistoryState {
  snapshots: ScanSnapshot[];
  delta: ScanDelta | null;
  scanCount: number;
  plan: "free" | "pro";
  isLoading: boolean;
  error: string | null;
}

/**
 * useScanHistory — fetch scan history + evolution delta for a given mint.
 *
 * Only runs when the user is authenticated (X-API-Key available).
 * Caches results for 5 minutes in sessionStorage to avoid redundant fetches.
 */
export function useScanHistory(mint: string): HistoryState & { refetch: () => void } {
  const { authUser } = useAuth();
  const [state, setState] = useState<HistoryState>({
    snapshots: [],
    delta: null,
    scanCount: 0,
    plan: "free",
    isLoading: false,
    error: null,
  });

  const sessionKey = `sh:${mint}`;

  const fetchHistory = useCallback(async () => {
    if (!authUser?.api_key || !mint) return;

    // Session cache hit (5 min)
    const cached = sessionStorage.getItem(sessionKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { ts: number; data: HistoryState };
        if (Date.now() - parsed.ts < 5 * 60 * 1000) {
          setState(parsed.data);
          return;
        }
      } catch {
        // ignore
      }
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    const headers = { "X-API-Key": authUser.api_key };

    try {
      const [histRes, deltaRes] = await Promise.all([
        fetch(`${API_BASE}/history/${mint}`, { headers }),
        fetch(`${API_BASE}/history/${mint}/delta`, { headers }),
      ]);

      const histData = histRes.ok ? await histRes.json() : null;
      // 404 on delta means <2 scans — not an error
      const deltaData = deltaRes.status === 200 ? await deltaRes.json() : null;

      const newState: HistoryState = {
        snapshots: histData?.snapshots ?? [],
        delta: deltaData ?? null,
        scanCount: histData?.scan_count ?? 0,
        plan: (histData?.plan as "free" | "pro") ?? "free",
        isLoading: false,
        error: null,
      };

      setState(newState);
      sessionStorage.setItem(sessionKey, JSON.stringify({ ts: Date.now(), data: newState }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: "Failed to load scan history",
      }));
    }
  }, [authUser?.api_key, mint, sessionKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { ...state, refetch: fetchHistory };
}

/**
 * Fetch the evolution delta with LLM narrative for the share tweet.
 * Called on-demand (click "Share evolution") — not on page load.
 */
export async function fetchDeltaWithNarrative(
  mint: string,
  apiKey: string
): Promise<ScanDelta | null> {
  try {
    const res = await fetch(`${API_BASE}/history/${mint}/delta?narrate=true`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
