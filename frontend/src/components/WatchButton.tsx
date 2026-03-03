"use client";

/**
 * WatchButton — star/unstar a token in the local watchlist.
 * 
 * Usage:
 *   <WatchButton mint={mint} name={name} symbol={symbol} riskScore={score} />
 */

import { Star } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

interface WatchButtonProps {
  mint: string;
  name: string;
  symbol?: string;
  riskScore?: number;
  className?: string;
  /** Show the label text next to the icon */
  showLabel?: boolean;
}

export default function WatchButton({
  mint,
  name,
  symbol,
  riskScore,
  className,
  showLabel = false,
}: WatchButtonProps) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(mint);

  return (
    <button
      onClick={() => toggle({ mint, name, symbol, riskScore })}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        "border transition-colors duration-150",
        watched
          ? "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
          : "border-white/10 bg-white/5 text-muted-foreground hover:border-amber-400/30 hover:text-amber-400",
        className,
      )}
    >
      <Star
        className={cn("h-3.5 w-3.5 transition-all duration-150", watched && "fill-amber-400")}
      />
      {showLabel && (
        <span>{watched ? "Watching" : "Watch"}</span>
      )}
    </button>
  );
}
