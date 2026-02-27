"use client";

import Link from "next/link";
import type { SolFlowReport, OperatorImpactReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd, formatSol, short } from "@/lib/utils";
import { StatBlock, RugBar, CONFIDENCE_CONFIG } from "@/components/forensics/shared";

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  solFlow: SolFlowReport | null | undefined;
  operatorImpact: OperatorImpactReport | null | undefined;
  mint: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function MoneyFlowTab({ solFlow, operatorImpact, mint }: Props) {
  const hasSol = solFlow != null;
  const hasOperator = operatorImpact != null;

  if (!hasSol && !hasOperator) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
        <p className="text-sm text-zinc-500">No money flow data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Section 1: Extraction Path ──────────────────────────── */}
      {hasSol && (
        <section>
          <SectionLabel icon="💸" title="Extraction Path" />

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <code className="text-xs text-muted-foreground font-mono">
              {short(solFlow.deployer)}
            </code>
            {solFlow.known_cex_detected && (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                CEX detected
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <StatBlock
              label="Extracted"
              value={formatSol(solFlow.total_extracted_sol)}
              danger={solFlow.total_extracted_sol > 1}
            />
            <StatBlock
              label="≈ USD"
              value={formatUsd(solFlow.total_extracted_usd)}
            />
            <StatBlock label="Hops" value={solFlow.hop_count} />
            <StatBlock
              label="Destinations"
              value={solFlow.terminal_wallets.length}
            />
          </div>

          {/* Top flows */}
          {solFlow.flows.length > 0 && (
            <div className="space-y-1 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Top flows
              </p>
              {solFlow.flows
                .slice()
                .sort((a, b) => b.amount_sol - a.amount_sol)
                .slice(0, 5)
                .map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs gap-2"
                  >
                    <span className="text-muted-foreground tabular-nums">
                      hop {f.hop}
                    </span>
                    <span className="truncate font-mono text-[10px] text-foreground/70 max-w-[120px]">
                      {short(f.to_address)}
                    </span>
                    {f.to_label && (
                      <span className="text-amber-400 text-[10px]">
                        {f.to_label}
                      </span>
                    )}
                    <span className="font-medium text-destructive tabular-nums shrink-0 ml-auto">
                      {formatSol(f.amount_sol)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Terminal wallets */}
          {solFlow.terminal_wallets.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Terminal wallets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {solFlow.terminal_wallets.map((w) => (
                  <a
                    key={w}
                    href={`https://solscan.io/account/${w}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-sky-400 hover:text-sky-200 transition-colors"
                  >
                    {short(w)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Cross-chain exits */}
          {solFlow.cross_chain_exits.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Cross-chain exits
              </p>
              {solFlow.cross_chain_exits.map((x, i) => (
                <div key={i} className="text-[11px] text-zinc-400 flex gap-2">
                  <span className="text-amber-400">{x.bridge_name}</span>
                  <span>→ {x.dest_chain}</span>
                  <span className="text-zinc-300">{x.amount_sol.toFixed(2)} ◎</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border/50 pt-2">
            <Link
              href={`/sol-trace/${mint}`}
              className="text-xs text-primary hover:text-neon transition-colors font-medium"
            >
              Trace Full Flow Graph →
            </Link>
          </div>
        </section>
      )}

      {/* ── Section 2: Operator Profile ─────────────────────────── */}
      {hasOperator && (
        <section>
          <SectionLabel icon="🎭" title="Operator Profile" />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <code className="text-xs text-muted-foreground font-mono">
                {short(operatorImpact.fingerprint)}
              </code>
              {operatorImpact.is_campaign_active && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-destructive">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  ACTIVE
                </span>
              )}
            </div>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                CONFIDENCE_CONFIG[operatorImpact.confidence].badge,
              )}
            >
              {CONFIDENCE_CONFIG[operatorImpact.confidence].label}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <StatBlock label="Tokens" value={operatorImpact.total_tokens_launched} />
            <StatBlock label="Rugs" value={operatorImpact.total_rug_count} />
            <StatBlock label="Wallets" value={operatorImpact.linked_wallets.length} />
            <StatBlock label="Extracted" value={formatUsd(operatorImpact.estimated_extracted_usd)} />
            {operatorImpact.peak_concurrent_tokens > 1 && (
              <StatBlock label="Peak concurrent" value={operatorImpact.peak_concurrent_tokens} />
            )}
          </div>

          <RugBar rugRate={operatorImpact.rug_rate_pct} />

          {/* Narrative chips */}
          {operatorImpact.narrative_sequence.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Campaign narratives
              </p>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(operatorImpact.narrative_sequence))
                  .slice(0, 6)
                  .map((n) => (
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
          {(operatorImpact.first_activity || operatorImpact.last_activity) && (
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              Activity:{" "}
              {operatorImpact.first_activity
                ? new Date(operatorImpact.first_activity).toLocaleDateString()
                : "?"}
              {" → "}
              {operatorImpact.last_activity
                ? new Date(operatorImpact.last_activity).toLocaleDateString()
                : "present"}
            </p>
          )}

          <div className="mt-3 border-t border-border/50 pt-2">
            <Link
              href={`/operator/${operatorImpact.fingerprint}`}
              className="text-xs text-primary hover:text-neon transition-colors font-medium"
            >
              View Full Dossier →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function SectionLabel({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm">{icon}</span>
      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
        {title}
      </h4>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}
