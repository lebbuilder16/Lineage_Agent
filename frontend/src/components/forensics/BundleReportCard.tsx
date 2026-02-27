"use client";

import {
  type BundleExtractionReport,
  type BundleWalletAnalysis,
  type BundleWalletVerdict,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

function short(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

const OVERALL_VERDICT_CONFIG: Record<
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

const WALLET_VERDICT_CONFIG: Record<
  BundleWalletVerdict,
  { label: string; style: string }
> = {
  confirmed_team: {
    label: "TEAM",
    style: "bg-red-900/40 border-red-700/40 text-red-300",
  },
  suspected_team: {
    label: "SUSPECTED",
    style: "bg-orange-900/40 border-orange-700/40 text-orange-300",
  },
  coordinated_dump: {
    label: "DUMP",
    style: "bg-amber-900/40 border-amber-700/40 text-amber-300",
  },
  early_buyer: {
    label: "BUYER",
    style: "bg-zinc-900 border-zinc-700 text-zinc-400",
  },
};

// ─── sub-components ──────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-black/30 px-3 py-2 flex flex-col gap-0.5">
      <span
        className={cn(
          "text-base font-bold tabular-nums",
          accent ? "text-red-400" : "text-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function WalletRow({ w, index }: { w: BundleWalletAnalysis; index: number }) {
  const vc = WALLET_VERDICT_CONFIG[w.verdict];
  const hasPreLink = w.pre_sell.prefund_source_is_deployer;
  const hasPostLink =
    w.post_sell.direct_transfer_to_deployer ||
    w.post_sell.transfer_to_deployer_linked_wallet ||
    w.post_sell.indirect_via_intermediary;

  return (
    <tr className="border-b border-border/40 hover:bg-white/[0.02] transition-colors text-xs">
      <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">
        {index + 1}
      </td>
      <td className="py-1.5 pr-3">
        <a
          href={`/deployer/${w.wallet}`}
          className="font-mono hover:text-primary transition-colors"
        >
          {short(w.wallet)}
        </a>
      </td>
      <td className="py-1.5 pr-3 tabular-nums">{fmt(w.sol_spent)} ◎</td>
      <td className="py-1.5 pr-3">
        {hasPreLink ? (
          <span className="text-red-400 font-semibold text-[10px]">
            funded by deployer
          </span>
        ) : w.pre_sell.prefund_source_is_known_funder ? (
          <span className="text-amber-400 text-[10px]">common funder</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {w.post_sell.sell_detected ? (
          <span className="text-red-400 text-[10px]">
            {fmt(w.post_sell.sol_received_from_sell)} ◎
          </span>
        ) : (
          <span className="text-zinc-600 text-[10px]">no sell</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {hasPostLink ? (
          <span className="text-orange-400 text-[10px]">
            {w.post_sell.direct_transfer_to_deployer
              ? "→ deployer"
              : w.post_sell.transfer_to_deployer_linked_wallet
              ? "→ linked wallet"
              : "→ indirect"}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5">
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
            vc.style
          )}
        >
          {vc.label}
        </span>
      </td>
    </tr>
  );
}

function FlagPill({ flag }: { flag: string }) {
  return (
    <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">
      {flag}
    </span>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface Props {
  report: BundleExtractionReport;
}

export default function BundleReportCard({ report }: Props) {
  const cfg =
    OVERALL_VERDICT_CONFIG[report.overall_verdict] ??
    OVERALL_VERDICT_CONFIG["early_buyers_no_link_proven"];

  const confirmedCount = report.confirmed_team_wallets.length;
  const suspectedCount = report.suspected_team_wallets.length;
  const dumpCount = report.coordinated_dump_wallets.length;
  const teamLinked = confirmedCount + suspectedCount;
  const teamLinkedPct =
    report.bundle_wallets.length > 0
      ? Math.round((teamLinked / report.bundle_wallets.length) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-300">
            Bundle Forensics
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            cfg.badge
          )}
        >
          {cfg.icon} {cfg.label}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox
            label="Bundle wallets"
            value={String(report.bundle_wallets.length)}
          />
          <StatBox
            label="Team-linked"
            value={`${teamLinked} (${teamLinkedPct}%)`}
            accent={teamLinked > 0}
          />
          <StatBox
            label="SOL spent at launch"
            value={`${fmt(report.total_sol_spent_by_bundle)} ◎`}
          />
          <StatBox
            label="SOL extracted (confirmed)"
            value={
              report.total_sol_extracted_confirmed > 0
                ? `${fmt(report.total_sol_extracted_confirmed)} ◎${
                    report.total_usd_extracted
                      ? ` ($${report.total_usd_extracted.toLocaleString()})`
                      : ""
                  }`
                : "—"
            }
            accent={report.total_sol_extracted_confirmed > 1}
          />
        </div>

        {/* Team-link ratio bar */}
        {report.bundle_wallets.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Team-linked wallets (on-chain proof required)</span>
              <span>
                {teamLinked} / {report.bundle_wallets.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
              {confirmedCount > 0 && (
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{
                    width: `${(confirmedCount / report.bundle_wallets.length) * 100}%`,
                  }}
                />
              )}
              {suspectedCount > 0 && (
                <div
                  className="h-full bg-orange-400 transition-all"
                  style={{
                    width: `${(suspectedCount / report.bundle_wallets.length) * 100}%`,
                  }}
                />
              )}
              {dumpCount > 0 && (
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{
                    width: `${(dumpCount / report.bundle_wallets.length) * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="flex gap-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                confirmed ({confirmedCount})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                suspected ({suspectedCount})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                coordinated dump ({dumpCount})
              </span>
            </div>
          </div>
        )}

        {/* Evidence chain */}
        {report.evidence_chain.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              On-chain Evidence
            </p>
            <ul className="space-y-0.5">
              {report.evidence_chain.map((e, i) => (
                <li
                  key={i}
                  className="text-[11px] text-zinc-400 flex items-start gap-1.5"
                >
                  <span className="text-zinc-600 shrink-0 mt-0.5">▸</span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Coordination signals */}
        {(report.common_prefund_source ||
          report.coordinated_sell_detected ||
          report.common_sink_wallets.length > 0) && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Coordination Signals
            </p>
            {report.common_prefund_source && (
              <p className="text-[11px] text-zinc-400">
                Common funder:{" "}
                <span className="font-mono text-amber-300">
                  {short(report.common_prefund_source)}
                </span>
              </p>
            )}
            {report.coordinated_sell_detected && (
              <p className="text-[11px] text-amber-300">
                ⚠ Coordinated sell within 5-slot window
              </p>
            )}
            {report.common_sink_wallets.length > 0 && (
              <p className="text-[11px] text-zinc-400">
                {report.common_sink_wallets.length} common sink wallet
                {report.common_sink_wallets.length > 1 ? "s" : ""} across bundle
              </p>
            )}
          </div>
        )}

        {/* Wallet table */}
        {report.bundle_wallets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Wallet</th>
                  <th className="pb-1.5 pr-3 font-medium">SOL in</th>
                  <th className="pb-1.5 pr-3 font-medium">Pre-sell link</th>
                  <th className="pb-1.5 pr-3 font-medium">SOL sold</th>
                  <th className="pb-1.5 pr-3 font-medium">Post-sell flow</th>
                  <th className="pb-1.5 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {report.bundle_wallets.map((w, i) => (
                  <WalletRow key={w.wallet} w={w} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Red flags for top wallets */}
        {report.bundle_wallets
          .filter((w) => w.red_flags.length > 0)
          .slice(0, 3)
          .map((w) => (
            <div key={w.wallet} className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-mono">
                {short(w.wallet)} flags:
              </p>
              <div className="flex flex-wrap gap-1">
                {w.red_flags.map((f) => (
                  <FlagPill key={f} flag={f} />
                ))}
              </div>
            </div>
          ))}

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
            {" · "}
            <span className="text-zinc-700">
              Only wallets with verified on-chain deployer links are attributed
              to the team.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}


// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

function short(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

const VERDICT_CONFIG = {
  confirmed_bundle: {
    label: "⚡ Confirmed Bundle",
    badge: "border-red-500/40 bg-red-950/50 text-red-300",
    bar: "bg-red-500",
  },
  suspected_bundle: {
    label: "⚠ Suspected Bundle",
    badge: "border-amber-500/40 bg-amber-950/50 text-amber-300",
    bar: "bg-amber-400",
  },
  clean: {
    label: "✓ No Bundle Detected",
    badge: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300",
    bar: "bg-emerald-500",
  },
} as const;

// ─── sub-components ──────────────────────────────────────────────────────────

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-black/30 px-3 py-2 flex flex-col gap-0.5">
      <span className={cn("text-base font-bold tabular-nums", accent ? "text-red-400" : "text-foreground")}>
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function WalletRow({ w, index }: { w: BundleWallet; index: number }) {
  const linked = w.funded_by_deployer || w.sol_returned_to_deployer > 0.05;
  return (
    <tr className="border-b border-border/40 hover:bg-white/[0.02] transition-colors text-xs">
      <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">{index + 1}</td>
      <td className="py-1.5 pr-3">
        <a
          href={`/deployer/${w.address}`}
          className="font-mono hover:text-primary transition-colors"
        >
          {short(w.address)}
        </a>
      </td>
      <td className="py-1.5 pr-3 tabular-nums">{fmt(w.sol_spent)} ◎</td>
      <td className="py-1.5 pr-3">
        {w.funded_by_deployer ? (
          <span className="text-red-400 font-semibold">✓ funded</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3 tabular-nums">
        {w.sol_returned_to_deployer > 0.01 ? (
          <span className="text-orange-400">{fmt(w.sol_returned_to_deployer)} ◎</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {w.exited ? (
          <span className="rounded-full bg-red-900/40 border border-red-700/30 text-red-400 px-1.5 py-0.5 text-[9px] font-medium">SOLD</span>
        ) : (
          <span className="rounded-full bg-zinc-900 border border-zinc-700 text-zinc-500 px-1.5 py-0.5 text-[9px]">holding</span>
        )}
      </td>
      <td className="py-1.5">
        {linked ? (
          <span className="rounded-full bg-red-900/40 border border-red-700/40 text-red-300 px-1.5 py-0.5 text-[9px] font-semibold">LINKED</span>
        ) : (
          <span className="text-zinc-700 text-[9px]">unconfirmed</span>
        )}
      </td>
    </tr>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface Props {
  report: BundleReport;
}

export default function BundleReportCard({ report }: Props) {
  const cfg = VERDICT_CONFIG[report.verdict];

  const linkedWallets = report.bundle_wallets.filter(
    (w) => w.funded_by_deployer || w.sol_returned_to_deployer > 0.05
  );
  const linkedPct = report.bundle_wallets.length > 0
    ? Math.round((linkedWallets.length / report.bundle_wallets.length) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-300">
            Bundle Detection
          </h3>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label="Bundle wallets" value={String(report.bundle_wallets.length)} />
          <StatBox label="Linked to deployer" value={`${report.confirmed_linked_wallets} (${linkedPct}%)`} accent={report.confirmed_linked_wallets > 0} />
          <StatBox label="SOL spent at launch" value={`${fmt(report.total_sol_spent_by_bundle)} ◎`} />
          <StatBox
            label="SOL extracted"
            value={
              report.total_sol_returned_to_deployer > 0
                ? `${fmt(report.total_sol_returned_to_deployer)} ◎${report.total_usd_extracted ? ` ($${report.total_usd_extracted.toLocaleString()})` : ""}`
                : "—"
            }
            accent={report.total_sol_returned_to_deployer > 1}
          />
        </div>

        {/* Linked wallet ratio bar */}
        {report.bundle_wallets.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Deployer-linked wallets</span>
              <span>{report.confirmed_linked_wallets} / {report.bundle_wallets.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", cfg.bar)}
                style={{ width: `${linkedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Wallet table */}
        {report.bundle_wallets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 pr-3 font-medium">#</th>
                  <th className="pb-1.5 pr-3 font-medium">Wallet</th>
                  <th className="pb-1.5 pr-3 font-medium">SOL in</th>
                  <th className="pb-1.5 pr-3 font-medium">Pre-funded</th>
                  <th className="pb-1.5 pr-3 font-medium">SOL returned</th>
                  <th className="pb-1.5 pr-3 font-medium">Position</th>
                  <th className="pb-1.5 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {report.bundle_wallets.map((w, i) => (
                  <WalletRow key={w.address} w={w} index={i} />
                ))}
              </tbody>
            </table>
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
    </div>
  );
}
