"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OperatorFingerprint as OperatorFingerprintType } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  fp: OperatorFingerprintType | null | undefined;
}

function formatMcap(v: number | null) {
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function OperatorFingerprint({ fp }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);

  if (fp === undefined) return null;
  if (fp === null) {
    return (
      <ForensicCard icon="🔗" title="Operator Fingerprint" empty emptyLabel="No cross-wallet DNA match found">
        <></>
      </ForensicCard>
    );
  }
  if (fp.linked_wallets.length < 2) return null;

  const isConfirmed = fp.confidence === "confirmed";
  const walletTokens = fp.linked_wallet_tokens ?? {};

  return (
    <div className="w-full rounded-xl border border-purple-800/60 bg-purple-950/40 mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left"
      >
        <div className="flex items-center gap-2">
          <span>🔗</span>
          <span className="font-semibold text-purple-300">Operator Fingerprint</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              isConfirmed
                ? "bg-purple-600 text-white"
                : "bg-purple-900 text-purple-300 border border-purple-700"
            }`}
          >
            {isConfirmed ? "Confirmed" : "Probable"} — {fp.linked_wallets.length} wallets
          </span>
        </div>
        <span className={`text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="fp-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* DNA meta */}
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="rounded bg-zinc-900 px-2 py-1 text-zinc-400">
                  Upload:{" "}
                  <span className="text-zinc-200 font-medium">{fp.upload_service}</span>
                </div>
                <div className="rounded bg-zinc-900 px-2 py-1 text-zinc-400 font-mono">
                  DNA: <span className="text-purple-300">{fp.fingerprint}</span>
                </div>
              </div>

              {/* Linked wallets — each expandable to show their tokens */}
              <div>
                <p className="text-xs text-zinc-500 mb-2">Linked deployer wallets</p>
                <ul className="space-y-2">
                  {fp.linked_wallets.map((w) => {
                    const tokens = walletTokens[w] ?? [];
                    const isExpanded = expandedWallet === w;
                    return (
                      <li key={w} className="rounded-lg border border-purple-900/50 bg-purple-950/30 overflow-hidden">
                        <button
                          onClick={() => setExpandedWallet(isExpanded ? null : w)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-purple-900/20 transition-colors"
                        >
                          <a
                            href={`https://solscan.io/account/${w}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-purple-300 hover:text-purple-100 underline underline-offset-2"
                          >
                            {w.slice(0, 8)}…{w.slice(-6)}
                          </a>
                          <div className="flex items-center gap-2 shrink-0">
                            {tokens.length > 0 && (
                              <span className="text-[10px] text-purple-400/70">
                                {tokens.length} token{tokens.length !== 1 ? "s" : ""}
                              </span>
                            )}
                            {tokens.length > 0 && (
                              <span className={cn("text-purple-500 transition-transform text-[10px]", isExpanded ? "rotate-180" : "")}>▾</span>
                            )}
                          </div>
                        </button>

                        {/* Token list for this wallet */}
                        <AnimatePresence initial={false}>
                          {isExpanded && tokens.length > 0 && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <ul className="px-3 pb-2 space-y-1.5 border-t border-purple-900/40 pt-2">
                                {tokens.map((t) => (
                                  <li key={t.mint} className="flex items-center justify-between gap-2 text-[11px]">
                                    <a
                                      href={`/lineage/${t.mint}`}
                                      className="truncate font-medium text-zinc-200 hover:text-purple-300 transition-colors max-w-[160px]"
                                    >
                                      {t.name || t.symbol || t.mint.slice(0, 8)}
                                      {t.symbol && t.name && t.symbol !== t.name && (
                                        <span className="text-zinc-500 ml-1">({t.symbol})</span>
                                      )}
                                    </a>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {t.narrative && (
                                        <span className="rounded-full bg-purple-900/50 text-purple-400 px-1.5 py-px text-[9px] capitalize">
                                          {t.narrative}
                                        </span>
                                      )}
                                      {t.rugged_at && (
                                        <span className="rounded bg-destructive/20 text-destructive px-1.5 py-px text-[10px] font-medium">
                                          RUGGED
                                        </span>
                                      )}
                                      {t.mcap_usd && (
                                        <span className="text-zinc-400 tabular-nums">{formatMcap(t.mcap_usd)}</span>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
