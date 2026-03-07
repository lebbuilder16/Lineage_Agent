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
  retryCount: number;
  retryNow: () => void;
}

// ── Retry config ──────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
// Delays: 1s, 2s, 4s (exponential backoff)
function retryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 8000);
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
  const [retryCount, setRetryCount] = useState(0);

  // Internal attempt counter (not exposed, drives the effect)
  const attemptRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false); // guard — true once "complete" received
  const mintRef = useRef(mint);
  mintRef.current = mint;

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS);
    setAnalysis(null);
    setError(null);
  }, []);

  // ── Core stream opener ─────────────────────────────────────────────────
  const openStream = useCallback(
    (currentMint: string, attempt: number, isForce: boolean) => {
      esRef.current?.close();
      doneRef.current = false;

      if (attempt === 0) {
        reset();
      } else {
        // On retry keep existing step states for continuity; only clear error
        setError(null);
      }
      setLoading(true);

      const base = getApiBase();
      const qs = isForce ? "?force_refresh=true" : "";
      const url = `${base}/analyze/${currentMint}/stream${qs}`;
      console.debug(`[useAnalysisStream] openStream attempt=${attempt} url=${url}`);
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
          console.debug(`[useAnalysisStream] step event — ${d.step}=${d.status}${d.ms != null ? ` (${d.ms}ms)` : ""}`);
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
          console.debug(`[useAnalysisStream] complete — risk_score=${payload.ai_analysis?.risk_score} pattern=${payload.ai_analysis?.rug_pattern}`);
          doneRef.current = true;
          setAnalysis(payload);
          setRetryCount(0);
        } catch (parseErr) {
          console.error(`[useAnalysisStream] failed to parse complete payload:`, parseErr);
          setError("Could not decode AI response. Please retry.");
        } finally {
          setLoading(false);
          es.close();
        }
      });

      // Application-level error sent by the server via SSE
      es.addEventListener("error", (ev: MessageEvent) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data ?? "{}") as { detail?: string };
          setError(d.detail ?? "AI streaming error");
        } catch {
          setError("AI streaming connection error");
        }
        setLoading(false);
        es.close();
      });

      // Network-level connection failure → attempt retry with backoff
      es.onerror = () => {
        if (doneRef.current) return; // stream completed successfully, ignore

        es.close();
        const nextAttempt = attempt + 1;

        if (nextAttempt <= MAX_RETRIES && mintRef.current === currentMint) {
          const delay = retryDelay(attempt);
          setRetryCount(nextAttempt);
          setError(
            `Connection lost. Retrying in ${Math.round(delay / 1000)}s… (${nextAttempt}/${MAX_RETRIES})`,
          );
          retryTimerRef.current = setTimeout(() => {
            if (mintRef.current === currentMint) {
              openStream(currentMint, nextAttempt, isForce);
            }
          }, delay);
        } else {
          setError(
            nextAttempt > MAX_RETRIES
              ? `AI analysis unavailable after ${MAX_RETRIES} retries. The backend may be busy.`
              : "SSE connection interrupted",
          );
          setLoading(false);
        }
      };
    },
    [reset],
  );

  // ── Manual retry exposed to the consumer ──────────────────────────────
  const retryNow = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (!mintRef.current) return;
    attemptRef.current = 0;
    setRetryCount(0);
    openStream(mintRef.current, 0, forceRefresh);
  }, [openStream, forceRefresh]);

  // ── Effect: restart stream when mint changes ───────────────────────────
  useEffect(() => {
    if (!mint) return;

    // Cancel any pending retry timer from a previous mint
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    attemptRef.current = 0;
    setRetryCount(0);

    openStream(mint, 0, forceRefresh);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, forceRefresh]);

  return { steps, analysis, error, loading, retryCount, retryNow };
}
