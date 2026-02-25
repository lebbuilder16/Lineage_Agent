"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface Props {
  icon: string;
  title: string;
  children: ReactNode;
  empty?: boolean;               // show grey "collecting" placeholder
  emptyLabel?: string;
  className?: string;
}

/** Shared card shell for all forensic signal panels. */
export function ForensicCard({ icon, title, children, empty, emptyLabel, className = "" }: Props) {
  return (
    <div
      className={`w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          {icon} {title}
        </span>
        {empty && (
          <span className="text-xs text-zinc-600 italic">{emptyLabel ?? "Collecting data…"}</span>
        )}
      </div>
      {empty ? (
        <div className="space-y-2">
          <motion.div
            className="h-2 rounded-full bg-zinc-800"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: "70%" }}
          />
          <motion.div
            className="h-2 rounded-full bg-zinc-800"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
            style={{ width: "45%" }}
          />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
