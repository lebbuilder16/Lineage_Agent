"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { AnalyzeResponse } from "./api";

export type AnalysisStep = "lineage" | "bundle" | "sol_flow" | "ai";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface StepState {
  status: StepStatus;
  ms?: number;
  heuristic?: number; // only on "ai" step
}

const INITIAL_STEPS: Record<AnalysisStep, StepState> = {
  lineage:  { status: "pending" },
  bundle:   { status: "pending" },
  sol_flow: { status: "pending" },
  ai:       { status: "pending" },
};

export interface AnalysisStreamState {
  steps: Record<AnalysisStep, StepState>;
  analysis: AnalyzeResponse | null;
  error: string | null;
  loading: boolean;
}

function getApiBase(): string {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
}

export function useAnalysisStream(
  mint: string | null | undefined,
  forceRefresh = false,
): AnalysisStreamState {
  const [steps, setSteps] = useState<Record<AnalysisStep, StepState>>(INITIAL_STEPS);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS);
    setAnalysis(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!mint) return;

    // Close any existing stream
    esRef.current?.close();
    reset();
    setLoading(true);

    const base = getApiBase();
    const url = `${base}/analyze/${mint}/stream${forceRefresh ? "?force_refresh=true" : ""}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("step", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as {
          step: AnalysisStep;
          status: StepStatus;
          ms?: number;
          heuristic?: number;
        };
        setSteps((prev) => ({
          ...prev,
          [d.step]: { status: d.status, ms: d.ms, heuristic: d.heuristic },
        }));
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as AnalyzeResponse;
        setAnalysis(payload);
      } catch {
        setError("Impossible de décoder la réponse AI");
      } finally {
        setLoading(false);
        es.close();
      }
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse((e as MessageEvent).data ?? "{}") as { detail?: string };
        setError(d.detail ?? "Erreur de streaming");
      } catch {
        setError("Erreur de connexion SSE");
      }
      setLoading(false);
      es.close();
    });

    // Network-level error (EventSource onerror)
    es.onerror = () => {
      // Only treat it as fatal if we still don't have data
      if (!analysis) {
        setError("Connexion SSE interrompue");
        setLoading(false);
      }
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, forceRefresh]);

  return { steps, analysis, error, loading };
}
