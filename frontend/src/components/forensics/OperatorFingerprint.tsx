"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OperatorFingerprint as OperatorFingerprintType } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

interface Props {
  fp: OperatorFingerprintType | null | undefined;
}

export default function OperatorFingerprint({ fp }: Props) {
  const [open, setOpen] = useState(false);
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
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="rounded bg-zinc-900 px-2 py-1 text-zinc-400">
                  Upload:{" "}
                  <span className="text-zinc-200 font-medium">{fp.upload_service}</span>
                </div>
                <div className="rounded bg-zinc-900 px-2 py-1 text-zinc-400 font-mono">
                  DNA: <span className="text-purple-300">{fp.fingerprint}</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-1">Linked deployer wallets</p>
                <ul className="space-y-1">
                  {fp.linked_wallets.map((w) => (
                    <li key={w}>
                      <a
                        href={`https://solscan.io/account/${w}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-purple-300 hover:text-purple-100 underline underline-offset-2"
                      >
                        {w.slice(0, 8)}…{w.slice(-6)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
