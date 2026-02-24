"use client";

import type { SimilarityEvidence } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  evidence: SimilarityEvidence;
  name?: string;
}

function scoreLevel(v: number) {
  if (v >= 0.7) return "high" as const;
  if (v >= 0.4) return "medium" as const;
  return "low" as const;
}

const barBg = {
  high: "bg-neon",
  medium: "bg-warning",
  low: "bg-destructive",
} as const;

const textColor = {
  high: "text-neon",
  medium: "text-warning",
  low: "text-destructive",
} as const;

export function EvidencePanel({ evidence, name }: Props) {
  const bars: { label: string; value: number }[] = [
    { label: "Name", value: evidence.name_score },
    { label: "Symbol", value: evidence.symbol_score },
    { label: "Image", value: evidence.image_score },
    { label: "Deployer", value: evidence.deployer_score },
    { label: "Temporal", value: evidence.temporal_score },
  ];

  const compositeLevel = scoreLevel(evidence.composite_score);

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-5 animate-fade-in hover:border-neon/15 transition-all">
      {name && (
        <h4 className="display-heading font-semibold text-xs text-white uppercase tracking-wide mb-3.5 truncate">{name}</h4>
      )}

      <div className="space-y-2.5">
        {bars.map((b) => {
          const level = scoreLevel(b.value);
          const pct = Math.round(b.value * 100);
          return (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-16 text-xs text-muted-foreground shrink-0">
                {b.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    barBg[level]
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-xs tabular-nums">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Composite */}
      <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">Composite</span>
        <span
          className={cn("font-bold text-lg tabular-nums", textColor[compositeLevel])}
        >
          {Math.round(evidence.composite_score * 100)}%
        </span>
      </div>
    </div>
  );
}
