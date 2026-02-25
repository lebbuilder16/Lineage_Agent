"use client";

import type { OnChainRiskScore } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  risk: OnChainRiskScore | null | undefined;
}

const LEVEL_CONFIG = {
  low:      { bg: "bg-neon/10 border-neon/30",         badge: "bg-neon/20 text-neon border border-neon/40",                label: "LOW RISK",      meterColor: "bg-neon" },
  medium:   { bg: "bg-warning/10 border-warning/30",   badge: "bg-warning/20 text-warning border border-warning/40",       label: "MEDIUM RISK",   meterColor: "bg-warning" },
  high:     { bg: "bg-orange-900/30 border-orange-600",badge: "bg-orange-600/20 text-orange-400 border border-orange-600", label: "HIGH RISK",     meterColor: "bg-orange-500" },
  critical: { bg: "bg-red-950/60 border-red-600",      badge: "bg-red-600/20 text-red-400 border border-red-600",          label: "CRITICAL RISK", meterColor: "bg-destructive" },
} as const;

function PctBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function OnChainRisk({ risk }: Props) {
  if (risk === undefined) return null;
  if (risk === null) {
    return (
      <ForensicCard icon="🔐" title="On-Chain Risk" empty emptyLabel="No holder data available">
        <></>
      </ForensicCard>
    );
  }

  const cfg = LEVEL_CONFIG[risk.risk_level];

  return (
    <div className={cn("w-full rounded-xl border px-4 py-3 text-sm mb-4", cfg.bg)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          🔐 On-Chain Risk
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Risk score gauge */}
      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Risk score</span>
          <span className="font-mono font-bold tabular-nums">{risk.risk_score} / 100</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", cfg.meterColor)}
            style={{ width: `${risk.risk_score}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-2 mb-3">
        <PctBar label={`Top-10 holder concentration`}      value={risk.top_10_pct}         colorClass={cfg.meterColor} />
        <PctBar label={`Top-1 wallet`}                    value={risk.top_1_pct}           colorClass={cfg.meterColor} />
        {risk.deployer_holds_pct > 0 && (
          <PctBar label="Deployer holding"                 value={risk.deployer_holds_pct}  colorClass="bg-destructive" />
        )}
      </div>

      {/* Holder count */}
      <p className="text-xs text-muted-foreground mb-2">
        <span className="font-semibold text-foreground">{risk.holder_count}</span> holder accounts analysed
      </p>

      {/* Flags */}
      {risk.flags.length > 0 && (
        <ul className="space-y-0.5">
          {risk.flags.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <span className="mt-0.5">⚠️</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
