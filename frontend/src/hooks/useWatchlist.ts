"use client";

/**
 * useWatchlist — persistent favourites stored in localStorage.
 * When the user is authenticated (api_key available), changes are also
 * synced to the backend (POST/DELETE /auth/watches).
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
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev";

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

function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("lineage:api_key");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.api_key ?? null;
  } catch {
    return null;
  }
}

async function backendAdd(mint: string, name: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/watches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ sub_type: "mint", value: mint }),
    });
  } catch {
    // non-blocking — localStorage is source of truth
  }
}

async function backendRemove(mint: string, apiKey: string): Promise<void> {
  // We don't store the server-side id in WatchlistEntry, so we fetch the list
  // first to find the matching id, then delete it.
  try {
    const res = await fetch(`${API_BASE}/auth/watches`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) return;
    const data = await res.json() as { watches: { id: number; sub_type: string; value: string }[] };
    const match = data.watches.find((w) => w.sub_type === "mint" && w.value === mint);
    if (match) {
      await fetch(`${API_BASE}/auth/watches/${match.id}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
    }
  } catch {
    // non-blocking
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
      // Sync to backend if authenticated
      const apiKey = getApiKey();
      if (apiKey) backendAdd(entry.mint, entry.name, apiKey);
    },
    [],
  );

  const remove = useCallback((mint: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.mint !== mint);
      writeStorage(next);
      return next;
    });
    // Sync to backend if authenticated
    const apiKey = getApiKey();
    if (apiKey) backendRemove(mint, apiKey);
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

