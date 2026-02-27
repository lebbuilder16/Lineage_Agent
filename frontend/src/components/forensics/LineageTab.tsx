"use client";

import { useState } from "react";
import Link from "next/link";
import type { LineageResult, LiquidityArchReport, DerivativeInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/utils";
import { FamilyTree } from "@/components/FamilyTree";
import { EvidencePanel } from "@/components/EvidencePanel";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  data: LineageResult;
  liquidityArch: LiquidityArchReport | null | undefined;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const GEN_BADGE: Record<number, string> = {
  1: "bg-neon/15 text-neon/80",
  2: "bg-warning/15 text-warning/80",
  3: "bg-orange-500/15 text-orange-400",
  4: "bg-destructive/15 text-destructive",
  5: "bg-destructive/10 text-destructive/70",
};

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

/* ── Component ─────────────────────────────────────────────────────── */

export default function LineageTab({ data, liquidityArch }: Props) {
  const hasDerivatives = data.derivatives.length > 0;

  if (!hasDerivatives) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
        <p className="text-sm text-zinc-500">No derivatives found for this token.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Family Tree Graph ──────────────────────────────────────── */}
      <FamilyTree key={data.mint} data={data} />

      {/* ── Liquidity Architecture ─────────────────────────────────── */}
      {liquidityArch && <LiquiditySection report={liquidityArch} />}

      {/* ── Derivatives Table ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">📋</span>
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            Derivatives
          </h4>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50 tabular-nums">
            {data.derivatives.length}
          </span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-2 pr-3 font-medium">Token</th>
                <th className="py-2 pr-3 font-medium">Score</th>
                <th className="py-2 pr-3 font-medium">MCap</th>
                <th className="py-2 pr-3 font-medium">Gen</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 font-medium w-6" />
              </tr>
            </thead>
            <tbody>
              {data.derivatives.map((d) => (
                <DerivativeRow key={d.mint} d={d} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {data.derivatives.map((d) => (
            <DerivativeCardMobile key={d.mint} d={d} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Desktop row with expandable evidence ──────────────────────────── */

function DerivativeRow({ d }: { d: DerivativeInfo }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(d.evidence.composite_score * 100);
  const level =
    pct >= 70 ? "high" : pct >= 40 ? "medium" : ("low" as const);
  const barColor = {
    high: "bg-neon",
    medium: "bg-warning",
    low: "bg-destructive",
  }[level];
  const textColor = {
    high: "text-neon",
    medium: "text-warning",
    low: "text-destructive",
  }[level];
  const genColor = GEN_BADGE[d.generation] ?? GEN_BADGE[5];

  return (
    <>
      <tr
        className="group border-b border-zinc-800/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Token */}
        <td className="py-2.5 pr-3">
          <Link
            href={`/lineage/${d.mint}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium hover:text-neon transition-colors truncate block max-w-[180px]"
          >
            {d.name || d.symbol || d.mint.slice(0, 12)}
          </Link>
          {d.symbol && d.name && (
            <span className="text-[10px] text-muted-foreground font-mono">
              ${d.symbol}
            </span>
          )}
        </td>

        {/* Score bar */}
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={cn("font-mono tabular-nums font-medium", textColor)}>
              {pct}%
            </span>
          </div>
        </td>

        {/* MCap */}
        <td className="py-2.5 pr-3 text-muted-foreground tabular-nums">
          {d.market_cap_usd != null ? formatUsd(d.market_cap_usd) : "—"}
        </td>

        {/* Gen badge */}
        <td className="py-2.5 pr-3">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", genColor)}>
            G{d.generation}
          </span>
        </td>

        {/* Created */}
        <td className="py-2.5 pr-3 text-muted-foreground">
          {d.created_at
            ? new Date(d.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "—"}
        </td>

        {/* Chevron */}
        <td className="py-2.5 text-muted-foreground/40">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </td>
      </tr>

      {/* Expanded evidence row */}
      {open && (
        <tr>
          <td colSpan={6} className="py-3 px-2">
            <EvidencePanel evidence={d.evidence} name={d.name || d.symbol} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Mobile card with expandable evidence ──────────────────────────── */

function DerivativeCardMobile({ d }: { d: DerivativeInfo }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(d.evidence.composite_score * 100);
  const level =
    pct >= 70 ? "high" : pct >= 40 ? "medium" : ("low" as const);
  const barColor = {
    high: "bg-neon",
    medium: "bg-warning",
    low: "bg-destructive",
  }[level];
  const textColor = {
    high: "text-neon",
    medium: "text-warning",
    low: "text-destructive",
  }[level];
  const genColor = GEN_BADGE[d.generation] ?? GEN_BADGE[5];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/lineage/${d.mint}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm hover:text-neon transition-colors truncate"
            >
              {d.name || d.symbol || d.mint.slice(0, 12)}
            </Link>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0", genColor)}>
              G{d.generation}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={cn("h-full rounded-full", barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={cn("font-mono tabular-nums text-[10px]", textColor)}>
                {pct}%
              </span>
            </div>
            {d.market_cap_usd != null && (
              <span className="flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {formatUsd(d.market_cap_usd)}
              </span>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </div>

      {open && (
        <div className="mt-3">
          <EvidencePanel evidence={d.evidence} name={d.name || d.symbol} />
        </div>
      )}
    </div>
  );
}

/* ── Liquidity Architecture Section ────────────────────────────────── */

function LiquiditySection({ report }: { report: LiquidityArchReport }) {
  const poolEntries = Object.entries(report.pools ?? {});
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : n >= 1_000
        ? `$${(n / 1_000).toFixed(1)}K`
        : `$${n.toFixed(0)}`;

  const authPct = Math.round(report.authenticity_score * 100);
  const authColor =
    authPct >= 70
      ? "bg-emerald-500"
      : authPct >= 40
        ? "bg-yellow-500"
        : "bg-red-500";
  const authText =
    authPct >= 70
      ? "text-emerald-400"
      : authPct >= 40
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">💧</span>
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            Liquidity Architecture
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">Authenticity</span>
          <div className="w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full", authColor)}
              style={{ width: `${authPct}%` }}
            />
          </div>
          <span className={cn("text-xs font-semibold", authText)}>
            {authPct}%
          </span>
        </div>
      </div>

      {/* Pool distribution */}
      {poolEntries.length > 0 && (
        <div className="flex rounded-full h-2.5 overflow-hidden mb-2 gap-px">
          {poolEntries.map(([dex, liq], i) => (
            <div
              key={dex}
              className={cn(DEX_COLORS[i % DEX_COLORS.length], "transition-all")}
              style={{
                width: `${report.total_liquidity_usd > 0 ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%`,
              }}
              title={`${dex}: ${report.total_liquidity_usd > 0 ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%`}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-3">
        {poolEntries.map(([dex, liq], i) => (
          <div key={dex} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", DEX_COLORS[i % DEX_COLORS.length])} />
            <span className="truncate">{dex}</span>
            <span className="text-zinc-300 ml-auto">{fmt(liq)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mb-3">
        <span>Total: <span className="text-zinc-200">{fmt(report.total_liquidity_usd)}</span></span>
        <span>Pools: <span className="text-zinc-200">{report.pool_count}</span></span>
        <span>HHI: <span className="text-zinc-200">{report.concentration_hhi.toFixed(3)}</span></span>
        {report.liq_to_volume_ratio != null && report.liq_to_volume_ratio < 999 && (
          <span>L/V ratio: <span className="text-zinc-200">{report.liq_to_volume_ratio.toFixed(1)}×</span></span>
        )}
      </div>

      {report.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {report.flags.map((f) => {
            const cfg = FLAG_LABELS[f] ?? { label: f, color: "bg-zinc-700 text-zinc-300" };
            return (
              <span key={f} className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cfg.color)}>
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
