"use client";

import type { LiquidityArchReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  FRAGMENTED_LIQUIDITY: { label: "Fragmented", color: "bg-yellow-700 text-yellow-200" },
  LOW_VOLUME_HIGH_LIQ: { label: "Low Vol / High Liq", color: "bg-orange-700 text-orange-200" },
  ZERO_VOLUME_WITH_LIQUIDITY: { label: "Zero Volume", color: "bg-red-700 text-red-200" },
  POSSIBLE_DEPLOYER_LP_ONLY: { label: "Deployer LP Only", color: "bg-red-800 text-red-200" },
  CRITICAL_LOW_VOLUME: { label: "Critical Low Vol", color: "bg-red-600 text-white" },
  NO_SOLANA_PAIRS: { label: "No SOL Pairs", color: "bg-zinc-700 text-zinc-300" },
};

const DEX_COLORS = [
  "bg-violet-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-blue-500",
];

interface Props {
  report: LiquidityArchReport | null | undefined;
}

export default function LiquidityArch({ report }: Props) {
  if (report === undefined) return null;
  if (report === null) {
    return (
      <ForensicCard icon="💧" title="Liquidity Architecture" empty emptyLabel="No pairs data available">
        <></>
      </ForensicCard>
    );
  }

  const poolEntries = Object.entries(report.pools ?? {});
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : n >= 1_000
      ? `$${(n / 1_000).toFixed(1)}K`
      : `$${n.toFixed(0)}`;

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          💧 Liquidity Architecture
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Authenticity</span>
          <AuthenticityBar score={report.authenticity_score} />
        </div>
      </div>

      {/* Pool distribution bar */}
      {poolEntries.length > 0 && (
        <div className="flex rounded-full h-2.5 overflow-hidden mb-2 gap-px">
          {poolEntries.map(([dex, liq], i) => (
            <div
              key={dex}
              className={`${DEX_COLORS[i % DEX_COLORS.length]} transition-all`}
              style={{ width: `${report.total_liquidity_usd > 0 ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%` }}
              title={`${dex}: ${report.total_liquidity_usd > 0 ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%`}
            />
          ))}
        </div>
      )}

      {/* Pool breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-3">
        {poolEntries.map(([dex, liq], i) => (
          <div key={dex} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DEX_COLORS[i % DEX_COLORS.length]}`} />
            <span className="truncate">{dex}</span>
            <span className="text-zinc-300 ml-auto">{fmt(liq)}</span>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mb-3">
        <span>Total: <span className="text-zinc-200">{fmt(report.total_liquidity_usd)}</span></span>
        <span>Pools: <span className="text-zinc-200">{report.pool_count}</span></span>
        <span>HHI: <span className="text-zinc-200">{report.concentration_hhi.toFixed(3)}</span></span>
        {report.liq_to_volume_ratio < 999 && (
          <span>L/V ratio: <span className="text-zinc-200">{report.liq_to_volume_ratio.toFixed(1)}×</span></span>
        )}
      </div>

      {/* Flags */}
      {report.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {report.flags.map((f) => {
            const cfg = FLAG_LABELS[f] ?? { label: f, color: "bg-zinc-700 text-zinc-300" };
            return (
              <span key={f} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuthenticityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"}`}>
        {pct}%
      </span>
    </div>
  );
}
