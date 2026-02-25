"use client";

import { motion } from "framer-motion";
import type { NarrativeTimingReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

const STATUS_CONFIG = {
  early: { label: "Early", color: "text-emerald-400", bgBar: "bg-emerald-500", dotPct: 10 },
  rising: { label: "Rising 🚀", color: "text-cyan-400", bgBar: "bg-cyan-500", dotPct: 35 },
  peak: { label: "Peak ⚡", color: "text-yellow-400", bgBar: "bg-yellow-400", dotPct: 62 },
  late: { label: "Late Stage ⚠️", color: "text-orange-400", bgBar: "bg-orange-500", dotPct: 88 },
  insufficient_data: { label: "Not enough data", color: "text-zinc-500", bgBar: "bg-zinc-700", dotPct: 0 },
} as const;

const NARRATIVE_LABELS: Record<string, string> = {
  pepe: "Pepe",
  doge: "Doge",
  inu: "Inu",
  ai: "AI",
  trump: "Trump",
  elon: "Elon",
  cat: "Cat",
  anime: "Anime",
  wojak: "Wojak",
  sol: "SOL",
  moon: "Moon",
  baby: "Baby",
  ape: "Ape",
  dragon: "Dragon",
  bear: "Bear",
  other: "Other",
};

interface Props {
  report: NarrativeTimingReport | null | undefined;
}

export default function NarrativeTiming({ report }: Props) {
  if (report === undefined) return null;
  if (report === null || report.status === "insufficient_data") {
    return (
      <ForensicCard icon="📊" title="Narrative Timing" empty emptyLabel="Needs ≥10 tokens in same narrative">
        <></>
      </ForensicCard>
    );
  }
  const cfg = STATUS_CONFIG[report.status];
  const dotPct = report.cycle_percentile * 100;

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            📊 Narrative Timing
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
            {NARRATIVE_LABELS[report.narrative] ?? report.narrative}
          </span>
        </div>
        <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
      </div>

      {/* Lifecycle bar */}
      <div className="relative h-3 rounded-full bg-zinc-800 overflow-visible mb-1">
        {/* Gradient fill zones */}
        <div className="absolute inset-0 flex rounded-full overflow-hidden">
          <div className="flex-1 bg-emerald-900/40" />
          <div className="flex-1 bg-cyan-900/40" />
          <div className="flex-1 bg-yellow-900/40" />
          <div className="flex-1 bg-orange-900/40" />
        </div>
        {/* Token position dot */}
        <motion.div
          className={`absolute top-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg ${cfg.bgBar}`}
          style={{ left: `calc(${dotPct}% - 6px)`, translateY: "-50%" }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
      </div>

      <div className="flex justify-between text-xs text-zinc-600 mb-2">
        <span>Early</span>
        <span>Rising</span>
        <span>Peak</span>
        <span>Late</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        <span>
          Momentum:{" "}
          <span className="text-zinc-200 font-medium">
            {(report.momentum_score * 100).toFixed(0)}%
          </span>
        </span>
        <span>
          Sample:{" "}
          <span className="text-zinc-200">{report.sample_size} tokens</span>
        </span>
        {report.days_since_peak !== null && (
          <span>
            Peak:{" "}
            <span className="text-zinc-200">{report.days_since_peak}d ago</span>
          </span>
        )}
      </div>
      {report.interpretation && (
        <p className="text-xs text-zinc-400 mt-1 italic">{report.interpretation}</p>
      )}
    </div>
  );
}
