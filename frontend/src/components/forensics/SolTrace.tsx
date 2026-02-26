"use client";

import Link from "next/link";
import type { SolFlowReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  report: SolFlowReport | null | undefined;
  mint: string;
}

function formatSol(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K SOL`;
  return `${n.toFixed(2)} SOL`;
}

function formatUsd(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function StatBlock({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-3 py-2 min-w-[72px]">
      <span className={cn("text-sm font-bold tabular-nums", accent ? "text-destructive" : "text-foreground")}>
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

export default function SolTraceCard({ report, mint }: Props) {
  if (report === undefined) return null;
  if (report === null) {
    return (
      <ForensicCard icon="💸" title="SOL Flow Trace" empty emptyLabel="No SOL flow data available yet">
        <></>
      </ForensicCard>
    );
  }

  const shortDeployer = `${report.deployer.slice(0, 6)}…${report.deployer.slice(-4)}`;

  return (
    <ForensicCard icon="💸" title="SOL Flow Trace">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <code className="text-xs text-muted-foreground font-mono">{shortDeployer}</code>
        {report.known_cex_detected && (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            CEX detected
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <StatBlock label="extracted" value={formatSol(report.total_extracted_sol)} accent />
        <StatBlock label="≈ USD" value={formatUsd(report.total_extracted_usd)} />
        <StatBlock label="hops" value={report.hop_count} />
        <StatBlock label="destinations" value={report.terminal_wallets.length} />
      </div>

      {/* Top flows preview */}
      {report.flows.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Top flows
          </p>
          {report.flows
            .slice()
            .sort((a, b) => b.amount_sol - a.amount_sol)
            .slice(0, 3)
            .map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <span className="text-muted-foreground tabular-nums">hop {f.hop}</span>
                <span className="truncate font-mono text-[10px] text-foreground/70 max-w-[120px]">
                  {f.to_address.slice(0, 6)}…{f.to_address.slice(-4)}
                </span>
                <span className="font-medium text-destructive tabular-nums shrink-0">
                  {formatSol(f.amount_sol)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Drill-down CTA */}
      <div className="mt-3 border-t border-border/50 pt-2">
        <Link
          href={`/sol-trace/${mint}`}
          className="text-xs text-primary hover:text-neon transition-colors font-medium"
        >
          Trace Full Flow Graph →
        </Link>
      </div>
    </ForensicCard>
  );
}
