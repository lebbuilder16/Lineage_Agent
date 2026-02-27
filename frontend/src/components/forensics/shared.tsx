"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

/* ── StatBlock ─────────────────────────────────────────────────────── */

export function StatBlock({
  label,
  value,
  sub,
  accent,
  danger,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-3 py-2 min-w-[72px]">
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          danger || accent ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
      {sub && (
        <span className="text-[9px] text-muted-foreground/60">{sub}</span>
      )}
    </div>
  );
}

/* ── RugBar ─────────────────────────────────────────────────────────── */

export function RugBar({ rugRate }: { rugRate: number }) {
  const level =
    rugRate >= 80
      ? "critical"
      : rugRate >= 50
        ? "high"
        : rugRate >= 25
          ? "medium"
          : "low";
  const barColor = {
    critical: "bg-destructive",
    high: "bg-destructive/70",
    medium: "bg-warning",
    low: "bg-neon",
  }[level];
  const textColor = {
    critical: "text-destructive",
    high: "text-destructive/80",
    medium: "text-warning",
    low: "text-neon",
  }[level];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Rug rate</span>
        <span className={cn("font-bold tabular-nums", textColor)}>
          {rugRate.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(rugRate, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ── CONFIDENCE_CONFIG ─────────────────────────────────────────────── */

export const CONFIDENCE_CONFIG = {
  high: {
    badge: "bg-neon/20 text-neon border-neon/30",
    label: "High confidence",
  },
  medium: {
    badge: "bg-warning/20 text-warning border-warning/30",
    label: "Medium confidence",
  },
  low: {
    badge: "bg-muted text-muted-foreground border-border",
    label: "Low confidence",
  },
} as const;

/* ── SIGNAL_COLORS / LABELS ────────────────────────────────────────── */

export const SIGNAL_COLORS: Record<string, string> = {
  dna_match: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  sol_transfer: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  timing_sync: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  phash_cluster: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cross_holding: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  funding_link: "bg-red-500/20 text-red-400 border-red-500/30",
  shared_lp: "bg-orange-600/20 text-orange-300 border-orange-600/30",
  sniper_ring: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

export const SIGNAL_LABELS: Record<string, string> = {
  dna_match: "DNA match",
  sol_transfer: "SOL transfer",
  timing_sync: "Timing sync",
  phash_cluster: "Image cluster",
  cross_holding: "Cross-holding",
  funding_link: "💸 Funding link",
  shared_lp: "🏊 Shared LP",
  sniper_ring: "🎯 Sniper ring",
};

/* ── CollapsibleSection ────────────────────────────────────────────── */

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/* ── Risk level helper (for AI score) ──────────────────────────────── */

export function riskLevel(score: number | null) {
  if (score === null)
    return {
      label: "Unknown",
      color: "text-zinc-400",
      bg: "bg-zinc-900",
      border: "border-zinc-700",
      bar: "bg-zinc-600",
    };
  if (score >= 75)
    return {
      label: "High Risk",
      color: "text-red-300",
      bg: "bg-red-950/50",
      border: "border-red-500/40",
      bar: "bg-red-500",
    };
  if (score >= 45)
    return {
      label: "Medium Risk",
      color: "text-amber-300",
      bg: "bg-amber-950/50",
      border: "border-amber-500/40",
      bar: "bg-amber-400",
    };
  return {
    label: "Low Risk",
    color: "text-emerald-300",
    bg: "bg-emerald-950/50",
    border: "border-emerald-500/40",
    bar: "bg-emerald-500",
  };
}

/* ── TAG_COLORS for AI findings ────────────────────────────────────── */

export const TAG_COLORS: Record<string, string> = {
  DEPLOYMENT: "border-violet-500/40 bg-violet-950/40 text-violet-300",
  TIMING: "border-sky-500/40 bg-sky-950/40 text-sky-300",
  BUNDLE: "border-orange-500/40 bg-orange-950/40 text-orange-300",
  WALLET: "border-blue-500/40 bg-blue-950/40 text-blue-300",
  LINEAGE: "border-pink-500/40 bg-pink-950/40 text-pink-300",
  LIQUIDITY: "border-cyan-500/40 bg-cyan-950/40 text-cyan-300",
  SOL_FLOW: "border-amber-500/40 bg-amber-950/40 text-amber-300",
  OPERATOR: "border-red-500/40 bg-red-950/40 text-red-300",
};

export function parseTag(finding: string): {
  tag: string | null;
  text: string;
} {
  const m = finding.match(/^\[([A-Z_]+)\]\s*/);
  if (!m) return { tag: null, text: finding };
  return { tag: m[1], text: finding.slice(m[0].length) };
}
