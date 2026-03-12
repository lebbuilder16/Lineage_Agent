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
    low: "bg-[#622EC3]",
  }[level];
  const textColor = {
    critical: "text-destructive",
    high: "text-destructive/80",
    medium: "text-warning",
    low: "text-[#53E9F6]",
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
    badge: "bg-[#622EC3]/20 text-[#B370F0] border-[#622EC3]/30",
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
  dna_match:    "bg-purple/20 text-[#B370F0] border-purple/30",
  sol_transfer: "bg-amber/20 text-amber border-amber/30",
  timing_sync:  "bg-warning/20 text-warning border-warning/30",
  phash_cluster:"bg-[#72E4C5]/20 text-[#72E4C5] border-[#72E4C5]/30",
  cross_holding:"bg-[#4D65DB]/20 text-[#4D65DB] border-[#4D65DB]/30",
  funding_link: "bg-destructive/20 text-destructive border-destructive/30",
  shared_lp:    "bg-amber/20 text-amber border-amber/30",
  sniper_ring:  "bg-pink/20 text-pink border-pink/30",
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
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
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
      color: "text-muted-foreground",
      bg: "bg-muted",
      border: "border-border",
      bar: "bg-muted-foreground/40",
    };
  if (score >= 75)
    return {
      label: "High Risk",
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/40",
      bar: "bg-destructive",
    };
  if (score >= 45)
    return {
      label: "Medium Risk",
      color: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/40",
      bar: "bg-warning",
    };
  return {
    label: "Low Risk",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/40",
    bar: "bg-success",
  };
}

/* ── TAG_COLORS for AI findings ────────────────────────────────────── */

export const TAG_COLORS: Record<string, string> = {
  DEPLOYMENT: "border-purple/40 bg-purple/10 text-[#B370F0]",
  TIMING:     "border-[#53E9F6]/40 bg-[#53E9F6]/10 text-[#53E9F6]",
  BUNDLE:     "border-amber/40 bg-amber/10 text-amber",
  WALLET:     "border-[#4D65DB]/40 bg-[#4D65DB]/10 text-[#4D65DB]",
  LINEAGE:    "border-pink/40 bg-pink/10 text-pink",
  LIQUIDITY:  "border-[#72E4C5]/40 bg-[#72E4C5]/10 text-[#72E4C5]",
  SOL_FLOW:   "border-amber/40 bg-amber/10 text-amber",
  OPERATOR:   "border-destructive/40 bg-destructive/10 text-destructive",
};

export function parseTag(finding: string): {
  tag: string | null;
  text: string;
} {
  const m = finding.match(/^\[([A-Z_]+)\]\s*/);
  if (!m) return { tag: null, text: finding };
  return { tag: m[1], text: finding.slice(m[0].length) };
}
