"use client";

import { useState } from "react";
import Link from "next/link";
import type { SolFlowReport, OperatorImpactReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd, formatSol, short } from "@/lib/utils";
import { RugBar, CONFIDENCE_CONFIG } from "@/components/forensics/shared";
import {
  TrendingDown,
  ExternalLink,
  ArrowRight,
  Activity,
  Users,
  Radio,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ── Shared style constants ─────────────────────────────────────────── */

const SECTION = "rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-4";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-3";

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  solFlow: SolFlowReport | null | undefined;
  operatorImpact: OperatorImpactReport | null | undefined;
  mint: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function MoneyFlowTab({ solFlow, operatorImpact, mint }: Props) {
  const [showAllWallets, setShowAllWallets] = useState(false);
  const hasSol = solFlow != null;
  const hasOperator = operatorImpact != null;

  if (!hasSol && !hasOperator) {
    return (
      <div className={cn(SECTION, "text-center py-10")}>
        <TrendingDown className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No money flow data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Section 1: Extraction Summary ───────────────────────── */}
      {hasSol && (
        <div className={SECTION}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />
              <p className={cn(LABEL, "mb-0")}>Extraction Path</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://solscan.io/account/${solFlow.deployer}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {short(solFlow.deployer)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              {solFlow.known_cex_detected && (
                <span className="rounded-md border border-amber-500/40 bg-amber-950/50 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  CEX exit
                </span>
              )}
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatPill
              label="SOL extracted"
              value={formatSol(solFlow.total_extracted_sol)}
              danger={solFlow.total_extracted_sol > 1}
            />
            <StatPill label="≈ USD" value={formatUsd(solFlow.total_extracted_usd)} />
            <StatPill label="Hops" value={String(solFlow.hop_count)} />
            <StatPill label="Destinations" value={String(solFlow.terminal_wallets.length)} />
          </div>

          {/* Top Flows — bar table */}
          {solFlow.flows.length > 0 && (() => {
            const sorted = [...solFlow.flows].sort((a, b) => b.amount_sol - a.amount_sol).slice(0, 5);
            const maxSol = sorted[0]?.amount_sol ?? 1;
            return (
              <div className="mb-4">
                <p className={LABEL}>Top flows</p>
                <div className="space-y-1.5">
                  {sorted.map((f, i) => (
                    <div key={i} className="relative rounded-md overflow-hidden">
                      {/* background bar */}
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-md",
                          i === 0 ? "bg-red-900/35" : "bg-zinc-800/50",
                        )}
                        style={{ width: `${(f.amount_sol / maxSol) * 100}%` }}
                      />
                      <div className="relative flex items-center gap-2 px-2.5 py-1.5 text-xs">
                        <span className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400">
                          hop {f.hop}
                        </span>
                        <ArrowRight className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
                        <a
                          href={`https://solscan.io/account/${f.to_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-mono text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors max-w-[110px]"
                        >
                          {short(f.to_address)}
                        </a>
                        {f.to_label && (
                          <span className="shrink-0 text-[10px] font-medium text-amber-400 bg-amber-950/40 border border-amber-700/30 rounded px-1.5 py-0.5">
                            {f.to_label}
                          </span>
                        )}
                        <span className={cn(
                          "ml-auto shrink-0 font-semibold tabular-nums text-xs",
                          i === 0 ? "text-red-300" : "text-zinc-300",
                        )}>
                          {formatSol(f.amount_sol)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Terminal Wallets */}
          {solFlow.terminal_wallets.length > 0 && (
            <div className="mb-4">
              <p className={LABEL}>Terminal wallets</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(showAllWallets
                  ? solFlow.terminal_wallets
                  : solFlow.terminal_wallets.slice(0, 6)
                ).map((w) => (
                  <a
                    key={w}
                    href={`https://solscan.io/account/${w}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 hover:border-zinc-600 transition-colors"
                  >
                    <span className="font-mono text-[10px] text-zinc-400 truncate">
                      {short(w)}
                    </span>
                    <ExternalLink className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
                  </a>
                ))}
              </div>
              {solFlow.terminal_wallets.length > 6 && (
                <button
                  onClick={() => setShowAllWallets((p) => !p)}
                  className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showAllWallets ? (
                    <><ChevronUp className="h-3 w-3" /> Show less</>
                  ) : (
                    <><ChevronDown className="h-3 w-3" /> {solFlow.terminal_wallets.length - 6} more wallets</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Cross-chain exits */}
          {solFlow.cross_chain_exits.length > 0 && (
            <div className="mb-4">
              <p className={LABEL}>Cross-chain exits</p>
              <div className="space-y-1.5">
                {solFlow.cross_chain_exits.map((x, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2"
                  >
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-700/40 rounded px-1.5 py-0.5">
                      {x.bridge_name}
                    </span>
                    <ArrowRight className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="text-xs text-zinc-300">{x.dest_chain}</span>
                    <span className="ml-auto text-xs font-semibold tabular-nums text-amber-200">
                      {x.amount_sol.toFixed(2)} ◎
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/sol-trace/${mint}`}
            className="flex items-center justify-center gap-2 w-full rounded-lg border border-sky-700/40 bg-sky-950/30 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-950/50 hover:border-sky-600/50 transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            Trace Full Flow Graph
          </Link>
        </div>
      )}

      {/* ── Section 2: Operator Impact ───────────────────────────── */}
      {hasOperator && (
        <div className={SECTION}>
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400 shrink-0" />
              <p className={cn(LABEL, "mb-0")}>Operator Profile</p>
            </div>
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {operatorImpact.is_campaign_active && (
                <span className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-950/50 px-2 py-0.5 text-[10px] font-bold text-red-300">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  LIVE CAMPAIGN
                </span>
              )}
              <span className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                CONFIDENCE_CONFIG[operatorImpact.confidence].badge,
              )}>
                {CONFIDENCE_CONFIG[operatorImpact.confidence].label}
              </span>
            </div>
          </div>

          {/* Fingerprint */}
          <a
            href={`https://solscan.io/account/${operatorImpact.fingerprint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
          >
            {short(operatorImpact.fingerprint)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <StatPill label="Tokens" value={String(operatorImpact.total_tokens_launched)} />
            <StatPill label="Rugs" value={String(operatorImpact.total_rug_count)} danger />
            <StatPill label="Linked wallets" value={String(operatorImpact.linked_wallets.length)} />
            <StatPill label="Extracted" value={formatUsd(operatorImpact.estimated_extracted_usd)} danger />
            {operatorImpact.peak_concurrent_tokens > 1 && (
              <StatPill label="Peak concurrent" value={String(operatorImpact.peak_concurrent_tokens)} />
            )}
          </div>

          <RugBar rugRate={operatorImpact.rug_rate_pct} />

          {/* Campaign narratives */}
          {operatorImpact.narrative_sequence.length > 0 && (
            <div className="mt-3">
              <p className={LABEL}>Campaign narratives</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(operatorImpact.narrative_sequence))
                  .slice(0, 6)
                  .map((n) => (
                    <span
                      key={n}
                      className="rounded-md border border-violet-700/30 bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium text-violet-300 capitalize"
                    >
                      {n}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Activity window */}
          {(operatorImpact.first_activity || operatorImpact.last_activity) && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono">
                {operatorImpact.first_activity
                  ? new Date(operatorImpact.first_activity).toLocaleDateString()
                  : "?"}
              </span>
              <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
              <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono">
                {operatorImpact.last_activity
                  ? new Date(operatorImpact.last_activity).toLocaleDateString()
                  : "present"}
              </span>
            </div>
          )}

          {/* CTA */}
          <div className="mt-4 border-t border-zinc-800/60 pt-3">
            <Link
              href={`/operator/${operatorImpact.fingerprint}`}
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-violet-700/40 bg-violet-950/30 py-2.5 text-xs font-semibold text-violet-300 hover:bg-violet-950/50 hover:border-violet-600/50 transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              View Full Operator Dossier
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── StatPill ───────────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
      <span className={cn(
        "text-sm font-bold tabular-nums leading-tight",
        danger ? "text-red-300" : "text-zinc-100",
      )}>
        {value}
      </span>
      <span className="text-[10px] text-zinc-500 leading-tight">{label}</span>
    </div>
  );
}
