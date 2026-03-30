/**
 * Shared token search hook — extracted from scan.tsx for reuse in watchlist.
 */
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { searchTokens } from '../lib/api';
import { useAuthStore } from '../store/auth';
import type { TokenSearchResult } from '../types/api';

/** Solana addresses are 32-44 chars of Base58 (no 0, O, I, l). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function useTokenSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const addRecentSearch = useAuthStore((s) => s.addRecentSearch);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) { setResults([]); return; }

    // Full Solana mint address → navigate directly
    if (BASE58_RE.test(trimmed) && trimmed.length >= 32) {
      addRecentSearch(trimmed);
      router.push(`/token/${trimmed}` as any);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchTokens(trimmed);
        setResults(data);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 250);
  }, [addRecentSearch]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  return { query, setQuery: handleChange, results, loading, clear };
}
