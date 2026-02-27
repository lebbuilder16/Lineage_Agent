"use client";

import type { SimilarityEvidence } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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

/** Human-readable explanation per dimension × level */
const DIMENSION_LABELS: Record<string, Record<"high" | "medium" | "low", string>> = {
  Name: {
    high: "Near-identical name — very likely a copy",
    medium: "Similar name — possible variant",
    low:  "Different name — low name overlap",
  },
  Symbol: {
    high: "Exact or near-exact ticker",
    medium: "Similar ticker — partial match",
    low:  "Different ticker",
  },
  Image: {
    high: "Near-identical logo — strong visual clone",
    medium: "Similar logo — partial match",
    low:  "Different logo",
  },
  Deployer: {
    high: "Same creator wallet ⚠️ — direct link confirmed",
    medium: "Linked wallets — indirect connection",
    low:  "Different deployer",
  },
  Temporal: {
    high: "Launched shortly after the original",
    medium: "Weeks apart from original launch",
    low:  "Months apart — weak time correlation",
  },
};

/** Contribution weight of each dimension to the composite score */
const WEIGHTS: Record<string, number> = {
  Name: 25,
  Symbol: 15,
  Image: 25,
  Deployer: 20,
  Temporal: 15,
};

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

      <div className="space-y-3.5">
        {bars.map((b, i) => {
          const level = scoreLevel(b.value);
          const pct = Math.round(b.value * 100);
          const explanation = DIMENSION_LABELS[b.label]?.[level] ?? "";
          const weight = WEIGHTS[b.label];
          return (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                  {b.label}
                  <span className="text-[9px] text-muted-foreground/50 font-mono">×{weight}%</span>
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", barBg[level])}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
                  />
                </div>
                <span className={cn("w-10 text-right font-mono text-xs tabular-nums", textColor[level])}>
                  {pct}%
                </span>
              </div>
              {explanation && (
                <p className="text-[10px] text-muted-foreground/70 pl-[76px] leading-tight">
                  {explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Composite */}
      <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">Composite score</span>
        <span
          className={cn("font-bold text-lg tabular-nums", textColor[compositeLevel])}
        >
          {Math.round(evidence.composite_score * 100)}%
        </span>
      </div>
    </div>
  );
}
