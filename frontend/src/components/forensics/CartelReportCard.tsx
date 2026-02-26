"use client";

import Link from "next/link";
import type { CartelReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  report: CartelReport | null | undefined;
}

const SIGNAL_COLORS: Record<string, string> = {
  dna_match:     "bg-purple-500/20 text-purple-400 border-purple-500/30",
  sol_transfer:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  timing_sync:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  phash_cluster: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cross_holding: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SIGNAL_LABELS: Record<string, string> = {
  dna_match:     "DNA match",
  sol_transfer:  "SOL transfer",
  timing_sync:   "Timing sync",
  phash_cluster: "Image cluster",
  cross_holding: "Cross-holding",
};

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",               label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30",      label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",      label: "Low confidence" },
} as const;

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-3 py-2 min-w-[72px]">
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

export default function CartelReportCard({ report }: Props) {
  if (report === undefined) return null;
  if (!report?.deployer_community) {
    return (
      <ForensicCard icon="🕸️" title="Cartel Detection" empty emptyLabel="No coordinated operator network detected">
        <></>
      </ForensicCard>
    );
  }

  const c = report.deployer_community;
  const cfg = CONFIDENCE_CONFIG[c.confidence];
  const signalColor = SIGNAL_COLORS[c.strongest_signal] ?? "bg-muted text-muted-foreground border-border";
  const signalLabel = SIGNAL_LABELS[c.strongest_signal] ?? c.strongest_signal;

  return (
    <ForensicCard icon="🕸️" title="Cartel Detection">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", signalColor)}>
            {signalLabel}
          </span>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <StatBlock label="wallets" value={c.wallets.length} />
        <StatBlock label="tokens" value={c.total_tokens_launched} />
        <StatBlock label="rugs" value={c.total_rugs} />
        <StatBlock label="extracted" value={formatUsd(c.estimated_extracted_usd)} />
      </div>

      {/* Signal breakdown */}
      {c.edges.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Signals detected
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(c.edges.map((e) => e.signal_type))).map((s) => (
              <span
                key={s}
                className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", SIGNAL_COLORS[s] ?? "bg-muted text-muted-foreground border-border")}
              >
                {SIGNAL_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      {c.active_since && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Active since: {new Date(c.active_since).toLocaleDateString()}
        </p>
      )}

      {/* Drill-down CTA */}
      <div className="mt-3 border-t border-border/50 pt-2">
        <Link
          href={`/cartel/${c.community_id}`}
          className="text-xs text-primary hover:text-neon transition-colors font-medium"
        >
          View Cartel Graph →
        </Link>
      </div>
    </ForensicCard>
  );
}
