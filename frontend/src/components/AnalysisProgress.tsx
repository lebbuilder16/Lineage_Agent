"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisStep, StepState, StepStatus } from "@/lib/useAnalysisStream";

const STEP_META: Record<AnalysisStep, { label: string; icon: string }> = {
  lineage:  { label: "Lineage scan",  icon: "🌳" },
  bundle:   { label: "Bundle check",  icon: "📦" },
  sol_flow: { label: "SOL flow",       icon: "💸" },
  ai:       { label: "AI analysis",   icon: "🧠" },
};

const ORDERED: AnalysisStep[] = ["lineage", "bundle", "sol_flow", "ai"];

interface Props {
  steps: Record<AnalysisStep, StepState>;
  className?: string;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-neon" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-neon" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Circle className="h-4 w-4 text-white/20" />;
  }
}

function formatMs(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AnalysisProgress({ steps, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/5 bg-card/60 backdrop-blur-sm p-4",
        "space-y-2.5",
        className,
      )}
    >
      <p className="text-xs font-display font-semibold text-white/50 uppercase tracking-wider mb-3">
        AI Analysis
      </p>
      {ORDERED.map((key) => {
        const meta = STEP_META[key];
        const state = steps[key];
        const runningOrDone = state.status === "running" || state.status === "done";
        return (
          <div
            key={key}
            className={cn(
              "flex items-center gap-3 text-sm transition-opacity duration-300",
              state.status === "pending" && "opacity-40",
            )}
          >
            <StatusIcon status={state.status} />
            <span className="text-base leading-none select-none">{meta.icon}</span>
            <span
              className={cn(
                "flex-1 font-medium",
                state.status === "done" ? "text-white" : "text-white/70",
              )}
            >
              {meta.label}
              {key === "ai" && state.heuristic != null && runningOrDone && (
                <span className="ml-2 text-xs text-white/40">
                  heuristic {state.heuristic}
                </span>
              )}
            </span>
            {state.ms != null && (
              <span className="text-xs tabular-nums text-white/30">
                {formatMs(state.ms)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
