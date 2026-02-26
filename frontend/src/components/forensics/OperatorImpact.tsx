"use client";

import Link from "next/link";
import type { OperatorImpactReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  report: OperatorImpactReport | null | undefined;
}

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",               label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30",      label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",      label: "Low confidence" },
} as const;

function RugBar({ rugRate }: { rugRate: number }) {
  const level =
    rugRate >= 80 ? "critical" : rugRate >= 50 ? "high" : rugRate >= 25 ? "medium" : "low";
  const barColor = {
    critical: "bg-destructive",
    high:     "bg-destructive/70",
    medium:   "bg-warning",
    low:      "bg-neon",
  }[level];
  const textColor = {
    critical: "text-destructive",
    high:     "text-destructive/80",
    medium:   "text-warning",
    low:      "text-neon",
  }[level];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Rug rate</span>
        <span className={cn("font-bold tabular-nums", textColor)}>{rugRate.toFixed(1)}%</span>
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

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-3 py-2 min-w-[72px]">
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function OperatorImpactCard({ report }: Props) {
  if (report === undefined) return null;
  if (report === null) {
    return (
      <ForensicCard icon="🎭" title="Operator Impact" empty emptyLabel="No multi-wallet operator detected">
        <></>
      </ForensicCard>
    );
  }

  const cfg = CONFIDENCE_CONFIG[report.confidence];
  const shortFp = report.fingerprint.slice(0, 6) + "…" + report.fingerprint.slice(-4);

  return (
    <ForensicCard icon="🎭" title="Operator Impact">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <code className="text-xs text-muted-foreground font-mono">{shortFp}</code>
          {/* Live campaign pulse */}
          {report.is_campaign_active && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-destructive">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              ACTIVE
            </span>
          )}
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <StatBlock label="tokens" value={report.total_tokens_launched} />
        <StatBlock label="rugs" value={report.total_rug_count} />
        <StatBlock label="wallets" value={report.linked_wallets.length} />
        <StatBlock label="extracted" value={formatUsd(report.estimated_extracted_usd)} />
        {report.peak_concurrent_tokens > 1 && (
          <StatBlock label="peak concurrent" value={report.peak_concurrent_tokens} />
        )}
      </div>

      <RugBar rugRate={report.rug_rate_pct} />

      {/* Narrative chips */}
      {report.narrative_sequence.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Campaign narratives
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(report.narrative_sequence)).slice(0, 6).map((n) => (
              <span
                key={n}
                className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium capitalize"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Activity window */}
      {(report.first_activity || report.last_activity) && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Activity:{" "}
          {report.first_activity ? new Date(report.first_activity).toLocaleDateString() : "?"}
          {" → "}
          {report.last_activity ? new Date(report.last_activity).toLocaleDateString() : "present"}
        </p>
      )}

      {/* Drill-down CTA */}
      <div className="mt-3 border-t border-border/50 pt-2">
        <Link
          href={`/operator/${report.fingerprint}`}
          className="text-xs text-primary hover:text-neon transition-colors font-medium"
        >
          View Full Dossier →
        </Link>
      </div>
    </ForensicCard>
  );
}
