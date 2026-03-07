"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ScanDelta } from "@/lib/useScanHistory";

interface Props {
  delta: ScanDelta;
  className?: string;
}

const TREND_CONFIG = {
  worsening: {
    Icon: TrendingUp,
    color: "text-red-400",
    label: "Worsening",
    bg: "bg-red-500/10 border-red-500/20",
  },
  improving: {
    Icon: TrendingDown,
    color: "text-emerald-400",
    label: "Improving",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  stable: {
    Icon: Minus,
    color: "text-white/50",
    label: "Stable",
    bg: "bg-white/5 border-white/10",
  },
};

const FLAG_COLOR: Record<string, string> = {
  BUNDLE_CONFIRMED: "bg-red-600/90 text-white",
  BUNDLE_SUSPECTED: "bg-orange-500/80 text-white",
  COORDINATED_DUMP: "bg-orange-400/80 text-black",
  INSIDER_DUMP: "bg-red-500/80 text-white",
  INSIDER_SUSPICIOUS: "bg-yellow-500/80 text-black",
  ZOMBIE_ALERT: "bg-purple-500/80 text-white",
  DEATH_CLOCK_CRITICAL: "bg-red-700/90 text-white",
  DEATH_CLOCK_HIGH: "bg-red-500/80 text-white",
  FACTORY_DETECTED: "bg-zinc-500/80 text-white",
  CARTEL_LINKED: "bg-violet-500/80 text-white",
  SERIAL_RUGGER: "bg-red-800/90 text-white",
};

function FLAG_LABEL(flag: string): string {
  const map: Record<string, string> = {
    BUNDLE_CONFIRMED: "Bundle confirmed",
    BUNDLE_SUSPECTED: "Bundle suspected",
    COORDINATED_DUMP: "Coordinated dump",
    INSIDER_DUMP: "Insider dump",
    INSIDER_SUSPICIOUS: "Insider suspicious",
    ZOMBIE_ALERT: "Zombie alert",
    DEATH_CLOCK_CRITICAL: "Death clock → critical",
    DEATH_CLOCK_HIGH: "Death clock → high",
    FACTORY_DETECTED: "Factory detected",
    CARTEL_LINKED: "Cartel linked",
    SERIAL_RUGGER: "Serial rugger",
  };
  return map[flag] ?? flag.replace(/_/g, " ").toLowerCase();
}

/**
 * ScanDeltaPanel — shows the evolution between the two most recent scans.
 * Only rendered when delta is available (≥ 2 scans).
 */
export function ScanDeltaPanel({ delta, className }: Props) {
  const { Icon, color, label, bg } = TREND_CONFIG[delta.trend];
  const prev = delta.previous_scan;
  const curr = delta.current_scan;
  const scoreDelta = delta.risk_score_delta;
  const scoreDeltaStr = scoreDelta > 0 ? `+${scoreDelta}` : String(scoreDelta);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-sm",
        bg,
        className
      )}
      aria-label="Scan evolution delta"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4 shrink-0", color)} />
          <span className={cn("font-semibold text-xs", color)}>{label}</span>
          <span className="text-white/30 text-xs">
            · scan #{prev.scan_number} → #{curr.scan_number}
          </span>
        </div>

        {/* Risk score arrow */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-white/50">{prev.risk_score}</span>
          <span className="text-white/30">→</span>
          <span
            className={cn(
              "font-bold",
              scoreDelta > 5
                ? "text-red-400"
                : scoreDelta < -5
                ? "text-emerald-400"
                : "text-white/70"
            )}
          >
            {curr.risk_score}
          </span>
          <span
            className={cn(
              "text-[10px]",
              scoreDelta > 0 ? "text-red-400" : scoreDelta < 0 ? "text-emerald-400" : "text-white/30"
            )}
          >
            ({scoreDeltaStr})
          </span>
        </div>
      </div>

      {/* New flags */}
      {delta.new_flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {delta.new_flags.map((f) => (
            <span
              key={f}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                "ring-1 ring-red-500/40",
                FLAG_COLOR[f] ?? "bg-zinc-600/80 text-white"
              )}
              title="New signal since last scan"
            >
              🆕 {FLAG_LABEL(f)}
            </span>
          ))}
        </div>
      )}

      {/* Resolved flags */}
      {delta.resolved_flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {delta.resolved_flags.map((f) => (
            <span
              key={f}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
              title="Signal resolved since last scan"
            >
              ✅ {FLAG_LABEL(f)}
            </span>
          ))}
        </div>
      )}

      {/* Context changes */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/40">
        {delta.family_size_delta !== 0 && (
          <span>
            Family {delta.family_size_delta > 0 ? `+${delta.family_size_delta}` : delta.family_size_delta} clones
          </span>
        )}
        {delta.rug_count_delta !== 0 && (
          <span>
            Deployer {delta.rug_count_delta > 0 ? `+${delta.rug_count_delta}` : delta.rug_count_delta} rugs
          </span>
        )}
      </div>

      {/* LLM narrative (when available) */}
      {delta.narrative && (
        <p className="mt-2 text-xs text-white/60 italic leading-relaxed border-t border-white/5 pt-2">
          {delta.narrative}
        </p>
      )}
    </div>
  );
}
