import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  searchTokens,
  getLineage,
  getLineageGraph,
  getSolTrace,
  getDeployer,
  getCartelSearch,
  compareTokens,
  getGlobalStats,
  getTopTokens,
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
  TopToken,
  HealthStatus,
  User,
  Watch,
} from '../types/api';

// Query keys
export const QK = {
  search: (q: string) => ['search', q] as const,
  lineage: (mint: string) => ['lineage', mint] as const,
  lineageGraph: (mint: string) => ['lineageGraph', mint] as const,
  solTrace: (mint: string) => ['solTrace', mint] as const,
  deployer: (address: string) => ['deployer', address] as const,
  cartel: (deployer: string) => ['cartel', deployer] as const,
  compare: (a: string, b: string) => ['compare', a, b] as const,
  globalStats: () => ['globalStats'] as const,
  topTokens: () => ['topTokens'] as const,
  health: () => ['health'] as const,
  me: (key: string) => ['me', key] as const,
  watches: (key: string) => ['watches', key] as const,
};

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

export function useTopTokens(limit = 10) {
  return useQuery<TopToken[]>({
    queryKey: QK.topTokens(),
    queryFn: () => getTopTokens(limit),
    staleTime: 300_000,
    refetchInterval: 300_000,
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
  const qc = useQueryClient();
  const key = QK.watches(apiKey ?? '');

  return useMutation<Watch, Error, { sub_type: 'deployer' | 'mint'; value: string }, { previous: Watch[] | undefined }>({
    mutationFn: ({ sub_type, value }) => addWatch(apiKey!, sub_type, value),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Watch[]>(key);
      const optimistic: Watch = { id: `tmp-${Date.now()}`, sub_type: vars.sub_type, value: vars.value };
      qc.setQueryData<Watch[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData<Watch[]>(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteWatch(apiKey: string | null) {
  const qc = useQueryClient();
  const key = QK.watches(apiKey ?? '');

  return useMutation<void, Error, string, { previous: Watch[] | undefined }>({
    mutationFn: (id) => deleteWatch(apiKey!, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Watch[]>(key);
      qc.setQueryData<Watch[]>(key, (old) => (old ?? []).filter((w) => w.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData<Watch[]>(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
