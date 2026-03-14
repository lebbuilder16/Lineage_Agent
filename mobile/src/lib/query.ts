import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  searchTokens,
  getLineage,
  getLineageGraph,
  getSolTrace,
  getDeployer,
  getCartelSearch,
  compareTokens,
  getGlobalStats,
  getHealth,
  getMe,
  getWatches,
  addWatch,
  deleteWatch,
} from './api';
import type {
  TokenSearchResult,
  LineageResult,
  LineageGraph,
  SolFlowReport,
  DeployerProfile,
  CartelReport,
  TokenCompareResult,
  GlobalStats,
  HealthStatus,
  User,
  Watch,
} from '../types/api';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const QK = {
  search: (q: string) => ['search', q] as const,
  lineage: (mint: string) => ['lineage', mint] as const,
  lineageGraph: (mint: string) => ['lineageGraph', mint] as const,
  solTrace: (mint: string) => ['solTrace', mint] as const,
  deployer: (address: string) => ['deployer', address] as const,
  cartel: (deployer: string) => ['cartel', deployer] as const,
  compare: (a: string, b: string) => ['compare', a, b] as const,
  globalStats: () => ['globalStats'] as const,
  health: () => ['health'] as const,
  me: (key: string) => ['me', key] as const,
  watches: (key: string) => ['watches', key] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSearchTokens(q: string, enabled = true) {
  return useQuery<TokenSearchResult[]>({
    queryKey: QK.search(q),
    queryFn: () => searchTokens(q),
    enabled: enabled && q.length > 1,
    staleTime: 30_000,
  });
}

export function useLineage(mint: string, enabled = true) {
  return useQuery<LineageResult>({
    queryKey: QK.lineage(mint),
    queryFn: () => getLineage(mint),
    enabled: enabled && mint.length > 10,
    staleTime: 60_000,
  });
}

export function useLineageGraph(mint: string, enabled = true) {
  return useQuery<LineageGraph>({
    queryKey: QK.lineageGraph(mint),
    queryFn: () => getLineageGraph(mint),
    enabled: enabled && mint.length > 10,
    staleTime: 60_000,
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

export function useDeployer(address: string, enabled = true) {
  return useQuery<DeployerProfile>({
    queryKey: QK.deployer(address),
    queryFn: () => getDeployer(address),
    enabled: enabled && address.length > 10,
    staleTime: 120_000,
  });
}

export function useCartel(deployer: string, enabled = true) {
  return useQuery<CartelReport>({
    queryKey: QK.cartel(deployer),
    queryFn: () => getCartelSearch(deployer),
    enabled: enabled && deployer.length > 10,
    staleTime: 120_000,
  });
}

export function useCompareTokens(mintA: string, mintB: string, enabled = true) {
  return useQuery<TokenCompareResult>({
    queryKey: QK.compare(mintA, mintB),
    queryFn: () => compareTokens(mintA, mintB),
    enabled: enabled && mintA.length > 10 && mintB.length > 10,
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

export function useMe(apiKey: string | null) {
  return useQuery<User>({
    queryKey: QK.me(apiKey ?? ''),
    queryFn: () => getMe(apiKey!),
    enabled: !!apiKey,
    staleTime: 300_000,
  });
}

export function useWatches(apiKey: string | null) {
  return useQuery<Watch[]>({
    queryKey: QK.watches(apiKey ?? ''),
    queryFn: () => getWatches(apiKey!),
    enabled: !!apiKey,
    staleTime: 60_000,
  });
}

export function useAddWatch(apiKey: string | null) {
  return useMutation({
    mutationFn: ({ sub_type, value }: { sub_type: 'deployer' | 'mint'; value: string }) =>
      addWatch(apiKey!, sub_type, value),
  });
}

export function useDeleteWatch(apiKey: string | null) {
  return useMutation({
    mutationFn: (id: string) => deleteWatch(apiKey!, id),
  });
}
