"use client";

import { type BundleReport, type BundleWallet } from "@/lib/api";
import { cn } from "@/lib/utils";

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
