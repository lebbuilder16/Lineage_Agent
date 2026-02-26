"use client";

import { useEffect, useState } from "react";
import { fetchFinancialGraph, type FinancialGraphSummary } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  deployer: string;
}

const SIGNAL_META: Record<
  string,
  { label: string; color: string; description: string; icon: string }
> = {
  funding_link: {
    label: "Funding Link",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    description: "Pre-deploy SOL transfer from another known deployer",
    icon: "💸",
  },
  shared_lp: {
    label: "Shared LP",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    description: "Same wallet bootstrapped liquidity for multiple operators",
    icon: "🏊",
  },
  sniper_ring: {
    label: "Sniper Ring",
    color: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    description: "Coordinated early buyers across different deployers",
    icon: "🎯",
  },
};

function ScoreGauge({ score }: { score: number }) {
  const capped = Math.min(score, 500);
  const pct = (capped / 500) * 100;
  const color =
    pct >= 70
      ? "text-destructive"
      : pct >= 40
      ? "text-warning"
      : "text-neon";
  const trackColor =
    pct >= 70
      ? "bg-destructive"
      : pct >= 40
      ? "bg-warning"
      : "bg-neon";
  const label =
    pct >= 70 ? "High risk" : pct >= 40 ? "Moderate risk" : "Low risk";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className={cn("text-2xl font-bold tabular-nums", color)}>
          {score.toFixed(0)}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", trackColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Score = funding×30 + shared LP×25 + sniper×20 + timing×15 + metadata×10
      </p>
    </div>
  );
}

function SignalRow({
  icon,
  label,
  count,
  color,
  description,
}: {
  icon: string;
  label: string;
  count: number;
  color: string;
  description: string;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="text-base leading-tight">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              color,
            )}
          >
            {label}
          </span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {count}×
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function CartelFinancialGraph({ deployer }: Props) {
  const [data, setData] = useState<FinancialGraphSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deployer) return;
    setLoading(true);
    setError(null);
    fetchFinancialGraph(deployer)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [deployer]);

  if (loading) {
    return (
      <ForensicCard icon="💰" title="Financial Coordination">
        <div className="space-y-2">
          <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-2 w-full rounded bg-muted animate-pulse" />
          <div className="h-12 w-full rounded bg-muted animate-pulse" />
        </div>
      </ForensicCard>
    );
  }

  if (error || !data) {
    return (
      <ForensicCard
        icon="💰"
        title="Financial Coordination"
        empty
        emptyLabel={error ? "Failed to load financial graph" : "No financial data available"}
      >
        <></>
      </ForensicCard>
    );
  }

  const hasAnySignal =
    data.funding_links + data.shared_lp_count + data.sniper_ring_count > 0;

  if (!hasAnySignal && data.financial_score === 0) {
    return (
      <ForensicCard
        icon="💰"
        title="Financial Coordination"
        empty
        emptyLabel="No financial coordination signals found"
      >
        <></>
      </ForensicCard>
    );
  }

  return (
    <ForensicCard icon="💰" title="Financial Coordination">
      {/* Score gauge */}
      <div className="mb-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
          Coordination Score
        </p>
        <ScoreGauge score={data.financial_score} />
      </div>

      {/* Financial signal breakdown */}
      <div className="mb-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
          Financial Signals
        </p>
        <div>
          <SignalRow
            icon={SIGNAL_META.funding_link.icon}
            label={SIGNAL_META.funding_link.label}
            count={data.funding_links}
            color={SIGNAL_META.funding_link.color}
            description={SIGNAL_META.funding_link.description}
          />
          <SignalRow
            icon={SIGNAL_META.shared_lp.icon}
            label={SIGNAL_META.shared_lp.label}
            count={data.shared_lp_count}
            color={SIGNAL_META.shared_lp.color}
            description={SIGNAL_META.shared_lp.description}
          />
          <SignalRow
            icon={SIGNAL_META.sniper_ring.icon}
            label={SIGNAL_META.sniper_ring.label}
            count={data.sniper_ring_count}
            color={SIGNAL_META.sniper_ring.color}
            description={SIGNAL_META.sniper_ring.description}
          />
        </div>
      </div>

      {/* Connected deployers */}
      {data.connected_deployers.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            Linked Deployers ({data.connected_deployers.length})
          </p>
          <div className="space-y-1">
            {data.connected_deployers.slice(0, 5).map((w) => (
              <a
                key={w}
                href={`/deployer/${w}`}
                className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1 hover:bg-muted/70 transition-colors"
              >
                <span className="font-mono text-[11px] text-muted-foreground truncate">
                  {w.slice(0, 8)}…{w.slice(-6)}
                </span>
              </a>
            ))}
            {data.connected_deployers.length > 5 && (
              <p className="text-[10px] text-muted-foreground pl-2">
                +{data.connected_deployers.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top financial edges */}
      {data.edges.filter((e) =>
        ["funding_link", "shared_lp", "sniper_ring"].includes(e.signal_type),
      ).length > 0 && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
            Top Edges
          </p>
          <div className="space-y-1">
            {data.edges
              .filter((e) =>
                ["funding_link", "shared_lp", "sniper_ring"].includes(
                  e.signal_type,
                ),
              )
              .sort((a, b) => b.signal_strength - a.signal_strength)
              .slice(0, 5)
              .map((e, i) => {
                const meta = SIGNAL_META[e.signal_type];
                const other =
                  e.wallet_a === deployer ? e.wallet_b : e.wallet_a;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm">{meta?.icon}</span>
                      <code className="font-mono text-[10px] text-muted-foreground truncate">
                        {other.slice(0, 6)}…{other.slice(-4)}
                      </code>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                        meta?.color,
                      )}
                    >
                      {(e.signal_strength * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </ForensicCard>
  );
}
