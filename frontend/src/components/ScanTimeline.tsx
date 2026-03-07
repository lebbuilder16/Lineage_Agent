"use client";

import { cn } from "@/lib/utils";
import type { ScanSnapshot } from "@/lib/useScanHistory";

interface Props {
  snapshots: ScanSnapshot[];
  className?: string;
}

const RISK_BUCKET = (score: number) => {
  if (score >= 85) return { label: "EXTREME", color: "bg-red-600 text-white" };
  if (score >= 75) return { label: "HIGH", color: "bg-orange-500 text-white" };
  if (score >= 50) return { label: "MEDIUM", color: "bg-yellow-500 text-black" };
  return { label: "LOW", color: "bg-emerald-600 text-white" };
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * ScanTimeline — horizontal strip of past scans shown under HeroCard.
 * Only rendered when there is at least 1 scan in history.
 */
export function ScanTimeline({ snapshots, className }: Props) {
  if (snapshots.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto scrollbar-none py-1",
        className
      )}
      role="list"
      aria-label="Scan history timeline"
    >
      <span className="shrink-0 text-[10px] font-medium text-white/30 uppercase tracking-widest">
        History
      </span>

      {snapshots.map((snap) => {
        const bucket = RISK_BUCKET(snap.risk_score);
        return (
          <div
            key={snap.snapshot_id}
            role="listitem"
            className="shrink-0 flex flex-col items-center gap-0.5"
            title={`Scan #${snap.scan_number} — ${new Date(snap.scanned_at).toLocaleString()}`}
          >
            {/* Risk badge */}
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                bucket.color
              )}
            >
              {snap.risk_score}
            </span>
            {/* Relative timestamp */}
            <span className="text-[9px] text-white/30">
              {formatRelative(snap.scanned_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
