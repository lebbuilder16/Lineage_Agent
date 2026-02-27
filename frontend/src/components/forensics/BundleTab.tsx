"use client";

import { useState } from "react";
import type { BundleExtractionReport, BundleWalletAnalysis, BundleWalletVerdict } from "@/lib/api";
import { cn } from "@/lib/utils";
import { short } from "@/lib/utils";
import { StatBlock, CollapsibleSection } from "@/components/forensics/shared";
import { ChevronDown, ChevronRight } from "lucide-react";

/* ── Constants ─────────────────────────────────────────────────────── */

const VERDICT_CONFIG: Record<
  string,
  { label: string; badge: string; bar: string; icon: string }
> = {
  confirmed_team_extraction: {
    label: "Confirmed Team Extraction",
    badge: "border-red-500/40 bg-red-950/50 text-red-300",
    bar: "bg-red-500",
    icon: "🔴",
  },
  suspected_team_extraction: {
    label: "Suspected Team Extraction",
    badge: "border-orange-500/40 bg-orange-950/50 text-orange-300",
    bar: "bg-orange-400",
    icon: "🟠",
  },
  coordinated_dump_unknown_team: {
    label: "Coordinated Dump (team link unproven)",
    badge: "border-amber-500/40 bg-amber-950/50 text-amber-300",
    bar: "bg-amber-400",
    icon: "⚠️",
  },
  early_buyers_no_link_proven: {
    label: "No Team Link Proven",
    badge: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300",
    bar: "bg-emerald-500",
    icon: "✅",
  },
};

const WALLET_VERDICT: Record<BundleWalletVerdict, { label: string; style: string }> = {
  confirmed_team: { label: "TEAM", style: "bg-red-900/40 border-red-700/40 text-red-300" },
  suspected_team: { label: "SUSPECTED", style: "bg-orange-900/40 border-orange-700/40 text-orange-300" },
  coordinated_dump: { label: "DUMP", style: "bg-amber-900/40 border-amber-700/40 text-amber-300" },
  early_buyer: { label: "BUYER", style: "bg-zinc-900 border-zinc-700 text-zinc-400" },
};

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  report: BundleExtractionReport | null | undefined;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function BundleTab({ report }: Props) {
  if (!report) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
        <p className="text-sm text-zinc-500">No bundle data available.</p>
      </div>
    );
  }

  const cfg = VERDICT_CONFIG[report.overall_verdict] ?? VERDICT_CONFIG.early_buyers_no_link_proven;
  const confirmedCount = report.confirmed_team_wallets.length;
  const suspectedCount = report.suspected_team_wallets.length;
  const dumpCount = report.coordinated_dump_wallets.length;
  const teamLinked = confirmedCount + suspectedCount;
  const teamLinkedPct =
    report.bundle_wallets.length > 0
      ? Math.round((teamLinked / report.bundle_wallets.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Verdict + stats */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", cfg.badge)}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBlock label="Bundle wallets" value={report.bundle_wallets.length} />
        <StatBlock label="Team-linked" value={`${teamLinked} (${teamLinkedPct}%)`} danger={teamLinked > 0} />
        <StatBlock label="SOL spent" value={`${report.total_sol_spent_by_bundle.toFixed(2)} ◎`} />
        <StatBlock
          label="SOL extracted"
          value={
            report.total_sol_extracted_confirmed > 0
              ? `${report.total_sol_extracted_confirmed.toFixed(2)} ◎`
              : "—"
          }
          danger={report.total_sol_extracted_confirmed > 1}
        />
      </div>

      {/* Team-link ratio bar */}
      {report.bundle_wallets.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Team-linked wallets</span>
            <span>{teamLinked} / {report.bundle_wallets.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
            {confirmedCount > 0 && (
              <div className="h-full bg-red-500" style={{ width: `${(confirmedCount / report.bundle_wallets.length) * 100}%` }} />
            )}
            {suspectedCount > 0 && (
              <div className="h-full bg-orange-400" style={{ width: `${(suspectedCount / report.bundle_wallets.length) * 100}%` }} />
            )}
            {dumpCount > 0 && (
              <div className="h-full bg-amber-400" style={{ width: `${(dumpCount / report.bundle_wallets.length) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-3 text-[9px] text-muted-foreground">
            <Legend color="bg-red-500" label={`confirmed (${confirmedCount})`} />
            <Legend color="bg-orange-400" label={`suspected (${suspectedCount})`} />
            <Legend color="bg-amber-400" label={`dump (${dumpCount})`} />
          </div>
        </div>
      )}

      {/* Evidence chain */}
      {report.evidence_chain.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">On-chain Evidence</p>
          <ul className="space-y-0.5">
            {report.evidence_chain.map((e, i) => (
              <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                <span className="text-zinc-600 shrink-0 mt-0.5">▸</span>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coordination signals */}
      {(report.common_prefund_source || report.coordinated_sell_detected || report.common_sink_wallets.length > 0) && (
        <CollapsibleSection title="Coordination Signals">
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2 space-y-1">
            {report.common_prefund_source && (
              <p className="text-[11px] text-zinc-400">
                Common funder: <span className="font-mono text-amber-300">{short(report.common_prefund_source)}</span>
              </p>
            )}
            {report.coordinated_sell_detected && (
              <p className="text-[11px] text-amber-300">⚠ Coordinated sell within 5-slot window</p>
            )}
            {report.common_sink_wallets.length > 0 && (
              <p className="text-[11px] text-zinc-400">
                {report.common_sink_wallets.length} common sink wallet{report.common_sink_wallets.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Wallet table — responsive */}
      {report.bundle_wallets.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Wallet Breakdown
          </p>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Wallet</th>
                  <th className="pb-1.5 pr-3 font-medium">SOL in</th>
                  <th className="pb-1.5 pr-3 font-medium">Pre-sell</th>
                  <th className="pb-1.5 pr-3 font-medium">Sold</th>
                  <th className="pb-1.5 pr-3 font-medium">Post-sell</th>
                  <th className="pb-1.5 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {report.bundle_wallets.map((w, i) => (
                  <WalletRowDesktop key={w.wallet} w={w} index={i} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-2">
            {report.bundle_wallets.map((w, i) => (
              <WalletCardMobile key={w.wallet} w={w} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Slot info */}
      {report.launch_slot && (
        <p className="text-[10px] text-zinc-600">
          Launch slot:{" "}
          <a
            href={`https://solscan.io/block/${report.launch_slot}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            {report.launch_slot.toLocaleString()}
          </a>
        </p>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("w-2 h-2 rounded-full inline-block", color)} />
      {label}
    </span>
  );
}

function WalletRowDesktop({ w, index }: { w: BundleWalletAnalysis; index: number }) {
  const vc = WALLET_VERDICT[w.verdict];
  const hasPreLink = w.pre_sell.prefund_source_is_deployer;
  const hasPostLink = w.post_sell.direct_transfer_to_deployer || w.post_sell.transfer_to_deployer_linked_wallet || w.post_sell.indirect_via_intermediary;

  return (
    <tr className="border-b border-border/40 hover:bg-white/[0.02] transition-colors text-xs">
      <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">{index + 1}</td>
      <td className="py-1.5 pr-3 font-mono">{short(w.wallet)}</td>
      <td className="py-1.5 pr-3 tabular-nums">{w.sol_spent.toFixed(2)} ◎</td>
      <td className="py-1.5 pr-3">
        {hasPreLink ? (
          <span className="text-red-400 font-semibold text-[10px]">deployer</span>
        ) : w.pre_sell.prefund_source_is_known_funder ? (
          <span className="text-amber-400 text-[10px]">funder</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {w.post_sell.sell_detected ? (
          <span className="text-red-400 text-[10px]">{w.post_sell.sol_received_from_sell.toFixed(2)} ◎</span>
        ) : (
          <span className="text-zinc-600 text-[10px]">no sell</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {hasPostLink ? (
          <span className="text-orange-400 text-[10px]">
            {w.post_sell.direct_transfer_to_deployer ? "→ deployer" : w.post_sell.transfer_to_deployer_linked_wallet ? "→ linked" : "→ indirect"}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5">
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold", vc.style)}>
          {vc.label}
        </span>
      </td>
    </tr>
  );
}

function WalletCardMobile({ w, index }: { w: BundleWalletAnalysis; index: number }) {
  const [open, setOpen] = useState(false);
  const vc = WALLET_VERDICT[w.verdict];
  const hasPreLink = w.pre_sell.prefund_source_is_deployer;
  const hasPostLink = w.post_sell.direct_transfer_to_deployer || w.post_sell.transfer_to_deployer_linked_wallet || w.post_sell.indirect_via_intermediary;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <button className="flex items-center justify-between w-full gap-2" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-zinc-600 tabular-nums">#{index + 1}</span>
          <span className="font-mono text-xs truncate">{short(w.wallet)}</span>
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold shrink-0", vc.style)}>
            {vc.label}
          </span>
        </div>
        <span className="text-xs text-zinc-400 tabular-nums shrink-0">{w.sol_spent.toFixed(2)} ◎</span>
        {open ? <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0" />}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-zinc-400">
          <span>Pre-sell: {hasPreLink ? <span className="text-red-400">deployer funded</span> : "—"}</span>
          <span>Sold: {w.post_sell.sell_detected ? <span className="text-red-400">{w.post_sell.sol_received_from_sell.toFixed(2)} ◎</span> : "no sell"}</span>
          <span>Post-sell: {hasPostLink ? <span className="text-orange-400">linked</span> : "—"}</span>
          {w.red_flags.length > 0 && (
            <span className="col-span-2 text-amber-400">Flags: {w.red_flags.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}
