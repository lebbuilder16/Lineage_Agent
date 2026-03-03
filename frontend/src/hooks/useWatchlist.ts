"use client";

/**
 * useWatchlist — persistent favourites stored in localStorage.
 *
 * Each entry holds the mint address, human-readable name, optional risk score,
 * and the timestamp it was starred. The list is capped at MAX_ITEMS entries
 * (oldest removed first).
 */

import { useCallback, useEffect, useState } from "react";

export interface WatchlistEntry {
  mint: string;
  name: string;
  symbol?: string;
  riskScore?: number;
  addedAt: number; // Unix ms
}

const STORAGE_KEY = "lineage:watchlist";
const MAX_ITEMS = 50;

function readStorage(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: WatchlistEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    setEntries(readStorage());
  }, []);

  const isWatched = useCallback(
    (mint: string) => entries.some((e) => e.mint === mint),
    [entries],
  );

  const add = useCallback(
    (entry: Omit<WatchlistEntry, "addedAt">) => {
      setEntries((prev) => {
        // Prevent duplicates
        if (prev.some((e) => e.mint === entry.mint)) return prev;
        const next: WatchlistEntry[] = [
          { ...entry, addedAt: Date.now() },
          ...prev,
        ].slice(0, MAX_ITEMS);
        writeStorage(next);
        return next;
      });
    },
    [],
  );

  const remove = useCallback((mint: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.mint !== mint);
      writeStorage(next);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (entry: Omit<WatchlistEntry, "addedAt">) => {
      if (isWatched(entry.mint)) {
        remove(entry.mint);
      } else {
        add(entry);
      }
    },
    [isWatched, add, remove],
  );

  const clear = useCallback(() => {
    setEntries([]);
    writeStorage([]);
  }, []);

  return { entries, isWatched, add, remove, toggle, clear };
}
