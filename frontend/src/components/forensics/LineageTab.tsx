"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { LineageResult, LiquidityArchReport, DerivativeInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/utils";
import { FamilyTree } from "@/components/FamilyTree";
import { EvidencePanel } from "@/components/EvidencePanel";
import {
  ChevronDown,
  GitBranch,
  Droplets,
  TrendingUp,
  Layers,
  BarChart2,
  Users,
} from "lucide-react";

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  data: LineageResult;
  liquidityArch: LiquidityArchReport | null | undefined;
}

/* ── Style constants ───────────────────────────────────────────────── */

const SECTION = "rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-4";
const LABEL   = "text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500";

const GEN_BADGE: Record<number, string> = {
  1: "bg-[#39ff14]/10 text-[#39ff14]/80 border border-[#39ff14]/20",
  2: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  4: "bg-red-500/10 text-red-400 border border-red-500/20",
  5: "bg-red-800/10 text-red-500/70 border border-red-800/20",
};

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  FRAGMENTED_LIQUIDITY:      { label: "Fragmented",       color: "border-yellow-600/30 bg-yellow-950/40 text-yellow-300" },
  LOW_VOLUME_HIGH_LIQ:       { label: "Low Vol / High Liq", color: "border-orange-600/30 bg-orange-950/40 text-orange-300" },
  ZERO_VOLUME_WITH_LIQUIDITY:{ label: "Zero Volume",       color: "border-red-600/30 bg-red-950/40 text-red-300" },
  POSSIBLE_DEPLOYER_LP_ONLY: { label: "Deployer LP Only",  color: "border-red-700/30 bg-red-950/60 text-red-300" },
  CRITICAL_LOW_VOLUME:       { label: "Critical Low Vol",  color: "border-red-500/30 bg-red-950/60 text-red-200" },
  NO_SOLANA_PAIRS:           { label: "No SOL Pairs",      color: "border-zinc-700/30 bg-zinc-900/60 text-zinc-400" },
};

const DEX_COLORS = [
  "bg-violet-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-blue-500",
];

/* ── Stat pill ─────────────────────────────────────────────────────── */

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        <span className={LABEL}>{label}</span>
      </div>
      <span className="text-lg font-bold text-white tabular-nums leading-none">{value}</span>
    </div>
  );
}

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

  /* Summary stats */
  const familySize  = 1 + data.derivatives.length;
  const maxGen      = Math.max(...data.derivatives.map((d) => d.generation ?? 1));
  const avgScore    = data.derivatives.length
    ? Math.round((data.derivatives.reduce((s, d) => s + d.evidence.composite_score, 0) / data.derivatives.length) * 100)
    : 0;
  const poolCount   = liquidityArch?.pool_count ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Summary strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill icon={Users}    label="Family size"    value={familySize} />
        <StatPill icon={Layers}   label="Max generation" value={`G${maxGen}`} />
        <StatPill icon={BarChart2} label="Avg confidence" value={`${avgScore}%`} />
        <StatPill icon={Droplets} label="Liquidity pools" value={poolCount || "—"} />
      </div>

      {/* ── Family Tree Graph ──────────────────────────────────────── */}
      <FamilyTree key={data.mint} data={data} scannedMint={data.mint} />

      {/* ── Liquidity Architecture ─────────────────────────────────── */}
      {liquidityArch && <LiquiditySection report={liquidityArch} />}

      {/* ── Derivatives list ───────────────────────────────────────── */}
      <section className={SECTION}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-3.5 w-3.5 text-zinc-500" />
          <h4 className={LABEL}>Derivatives</h4>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50 tabular-nums">
            {data.derivatives.length}
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="pb-2 pr-3 font-medium">Token</th>
                <th className="pb-2 pr-3 font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">MCap</th>
                <th className="pb-2 pr-3 font-medium">Gen</th>
                <th className="pb-2 pr-3 font-medium">Created</th>
                <th className="pb-2 w-6 font-medium" />
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
  const pct       = Math.round(d.evidence.composite_score * 100);
  const level     = pct >= 70 ? "high" : pct >= 40 ? "medium" : ("low" as const);
  const barColor  = { high: "bg-[#39ff14]", medium: "bg-amber-400", low: "bg-red-500" }[level];
  const textColor = { high: "text-[#39ff14]", medium: "text-amber-400", low: "text-red-400" }[level];
  const rowTint   = {
    high:   "hover:bg-[#39ff14]/[0.025]",
    medium: "hover:bg-amber-950/20",
    low:    "hover:bg-red-950/20",
  }[level];
  const genColor = GEN_BADGE[d.generation] ?? GEN_BADGE[5];

  return (
    <>
      <tr
        className={cn(
          "group border-b border-zinc-800/40 cursor-pointer transition-colors",
          rowTint,
          open && { high: "bg-[#39ff14]/[0.02]", medium: "bg-amber-950/10", low: "bg-red-950/10" }[level],
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Token */}
        <td className="py-2.5 pr-3">
          <Link
            href={`/lineage/${d.mint}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-white hover:text-[#39ff14] transition-colors truncate block max-w-[180px]"
          >
            {d.name || d.symbol || d.mint.slice(0, 12)}
          </Link>
          {d.symbol && d.name && (
            <span className="text-[10px] text-zinc-500 font-mono">${d.symbol}</span>
          )}
        </td>

        {/* Score */}
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            <div className="w-16 h-[3px] rounded-full bg-zinc-800 overflow-hidden">
              <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
            </div>
            <span className={cn("font-mono tabular-nums font-semibold text-[11px]", textColor)}>
              {pct}%
            </span>
          </div>
        </td>

        {/* MCap */}
        <td className="py-2.5 pr-3 text-zinc-400 tabular-nums">
          {d.market_cap_usd != null ? formatUsd(d.market_cap_usd) : "—"}
        </td>

        {/* Gen */}
        <td className="py-2.5 pr-3">
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold border", genColor)}>
            G{d.generation}
          </span>
        </td>

        {/* Created */}
        <td className="py-2.5 pr-3 text-zinc-400">
          {d.created_at
            ? new Date(d.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "—"}
        </td>

        {/* Chevron */}
        <td className="py-2.5 text-zinc-600">
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
          />
        </td>
      </tr>

      {/* Evidence panel — animated */}
      <AnimatePresence initial={false}>
        {open && (
          <tr>
            <td colSpan={6} className="p-0">
              <motion.div
                key="evidence"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-2 py-3">
                  <EvidencePanel evidence={d.evidence} name={d.name || d.symbol} />
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Mobile card with expandable evidence ──────────────────────────── */

function DerivativeCardMobile({ d }: { d: DerivativeInfo }) {
  const [open, setOpen] = useState(false);
  const pct       = Math.round(d.evidence.composite_score * 100);
  const level     = pct >= 70 ? "high" : pct >= 40 ? "medium" : ("low" as const);
  const barColor  = { high: "bg-[#39ff14]", medium: "bg-amber-400", low: "bg-red-500" }[level];
  const textColor = { high: "text-[#39ff14]", medium: "text-amber-400", low: "text-red-400" }[level];
  const genColor  = GEN_BADGE[d.generation] ?? GEN_BADGE[5];

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
      <div
        className="flex items-center justify-between cursor-pointer px-3 py-2.5"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/lineage/${d.mint}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-sm text-white hover:text-[#39ff14] transition-colors truncate"
            >
              {d.name || d.symbol || d.mint.slice(0, 12)}
            </Link>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-bold border shrink-0", genColor)}>
              G{d.generation}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-[3px] rounded-full bg-zinc-800 overflow-hidden">
                <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
              </div>
              <span className={cn("font-mono tabular-nums text-[10px] font-semibold", textColor)}>
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
        <ChevronDown
          className={cn("h-4 w-4 text-zinc-500 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ev-mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-zinc-800/40"
          >
            <div className="p-3">
              <EvidencePanel evidence={d.evidence} name={d.name || d.symbol} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Liquidity Architecture Section ────────────────────────────────── */

function LiquiditySection({ report }: { report: LiquidityArchReport }) {
  const poolEntries = Object.entries(report.pools ?? {});
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

  const authPct = Math.round(report.authenticity_score * 100);
  const authLevel = authPct >= 70 ? "high" : authPct >= 40 ? "medium" : "low";
  const authBar  = { high: "bg-emerald-500", medium: "bg-amber-400", low: "bg-red-500" }[authLevel];
  const authText = { high: "text-emerald-400", medium: "text-amber-400", low: "text-red-400" }[authLevel];

  return (
    <div className={SECTION}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5 text-zinc-500" />
          <h4 className={LABEL}>Liquidity Architecture</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">Authenticity</span>
          <div className="w-20 h-[3px] rounded-full bg-zinc-800 overflow-hidden">
            <div className={cn("h-full rounded-full", authBar)} style={{ width: `${authPct}%` }} />
          </div>
          <span className={cn("text-xs font-bold tabular-nums", authText)}>{authPct}%</span>
        </div>
      </div>

      {/* Pool distribution bar */}
      {poolEntries.length > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
          {poolEntries.map(([dex, liq], i) => (
            <div
              key={dex}
              className={cn(DEX_COLORS[i % DEX_COLORS.length], "transition-all")}
              style={{
                width: `${report.total_liquidity_usd > 0
                  ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%`,
              }}
              title={`${dex}: ${report.total_liquidity_usd > 0
                ? ((liq / report.total_liquidity_usd) * 100).toFixed(1) : 0}%`}
            />
          ))}
        </div>
      )}

      {/* Pool legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-4">
        {poolEntries.map(([dex, liq], i) => (
          <div key={dex} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={cn("h-2 w-2 rounded-full shrink-0", DEX_COLORS[i % DEX_COLORS.length])} />
            <span className="truncate">{dex}</span>
            <span className="text-zinc-300 ml-auto tabular-nums">{fmt(liq)}</span>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 mb-3">
        <span>Total: <span className="text-zinc-200 font-medium">{fmt(report.total_liquidity_usd)}</span></span>
        <span>Pools: <span className="text-zinc-200 font-medium">{report.pool_count}</span></span>
        <span>HHI: <span className="text-zinc-200 font-medium">{report.concentration_hhi.toFixed(3)}</span></span>
        {report.liq_to_volume_ratio != null && report.liq_to_volume_ratio < 999 && (
          <span>L/V: <span className="text-zinc-200 font-medium">{report.liq_to_volume_ratio.toFixed(1)}×</span></span>
        )}
      </div>

      {/* Flags */}
      {report.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.flags.map((f) => {
            const cfg = FLAG_LABELS[f] ?? { label: f, color: "border-zinc-700 bg-zinc-900 text-zinc-400" };
            return (
              <span key={f} className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", cfg.color)}>
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
