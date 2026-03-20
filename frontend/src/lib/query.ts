import { useQuery } from '@tanstack/react-query';
import {
  searchTokens,
  getSolTrace,
  getGlobalStats,
  getHealth,
} from './api';
import type {
  TokenSearchResult,
  SolFlowReport,
  GlobalStats,
  HealthStatus,
} from '../types/api';

// Query keys
export const QK = {
  search: (q: string) => ['search', q] as const,
  solTrace: (mint: string) => ['solTrace', mint] as const,
  globalStats: () => ['globalStats'] as const,
  health: () => ['health'] as const,
};

export function useSearchTokens(q: string, enabled = true) {
  return useQuery<TokenSearchResult[]>({
    queryKey: QK.search(q),
    queryFn: () => searchTokens(q),
    enabled: enabled && q.length > 1,
    staleTime: 30_000,
  });
}

export function useSolTrace(mint: string, enabled = true) {
  return useQuery<SolFlowReport>({
    queryKey: QK.solTrace(mint),
    queryFn: () => getSolTrace(mint),
    enabled: enabled && mint.length > 10,
    staleTime: 60_000,
  });
}

export function useGlobalStats() {
  return useQuery<GlobalStats>({
    queryKey: QK.globalStats(),
    queryFn: getGlobalStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: QK.health(),
    queryFn: getHealth,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
