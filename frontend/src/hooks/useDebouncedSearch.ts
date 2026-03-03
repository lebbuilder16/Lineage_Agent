"use client";

import { useState, useEffect, useRef } from "react";
import { searchTokens, type TokenSearchResult } from "@/lib/api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 6;

export interface DebouncedSearchState {
  results: TokenSearchResult[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Debounced token search hook.
 *
 * Skips the network call when:
 * - query is shorter than MIN_QUERY_LEN characters
 * - query looks like a Base58 mint address (let the page handle it directly)
 */
export function useDebouncedSearch(query: string): DebouncedSearchState {
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort controller ref — cancel in-flight request on query change
  const abortRef = useRef<AbortController | null>(null);

  const isMintAddress = (q: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q.trim());

  useEffect(() => {
    const trimmed = query.trim();

    // Reset immediately when query is cleared
    if (!trimmed || trimmed.length < MIN_QUERY_LEN || isMintAddress(trimmed)) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      // Cancel any previous request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const data = await searchTokens(trimmed);
        setResults(data.slice(0, MAX_RESULTS));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Search failed");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading, error };
}
