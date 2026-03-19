// Lineage Agent -- REST API functions (openapi-fetch typed client)
import { apiClient } from './api-client';
import type {
  TokenSearchResult,
  LineageResult,
  LineageGraph,
  SolFlowReport,
  DeployerProfile,
  CartelReport,
  FinancialGraphSummary,
  TokenCompareResult,
  GlobalStats,
  HealthStatus,
  User,
  Watch,
  TopToken,
  OperatorImpactReport,
} from '../types/api';

// Re-export streaming for callers that imported from this module
export { analyzeStream, chatStream, connectAlertsWS, connectLineageWS } from './streaming';

// search
export async function searchTokens(q = '', offset = 0, limit = 20): Promise<TokenSearchResult[]> {
  const { data } = await apiClient.GET('/search', {
    params: { query: { q, offset, limit } },
  });
  return data ?? [];
}

// lineage
export async function getLineage(mint: string, forceRefresh = false): Promise<LineageResult> {
  const { data } = await apiClient.GET('/lineage', {
    params: { query: { mint, force_refresh: forceRefresh } },
  });
  return data!;
}

export async function getLineageGraph(mint: string): Promise<LineageGraph> {
  const { data } = await apiClient.GET('/lineage/{mint}/graph', {
    params: { path: { mint } },
  });
  // Schema types this endpoint as Record<string,unknown> -- cast to our manual type
  return data as unknown as LineageGraph;
}

export async function getSolTrace(mint: string): Promise<SolFlowReport> {
  const { data } = await apiClient.GET('/lineage/{mint}/sol-trace', {
    params: { path: { mint } },
  });
  return data!;
}

// intelligence
export async function getDeployer(address: string): Promise<DeployerProfile> {
  const { data } = await apiClient.GET('/deployer/{address}', {
    params: { path: { address } },
  });
  return data!;
}

// operator
export async function getOperatorImpact(fingerprint: string): Promise<OperatorImpactReport> {
  const { data } = await apiClient.GET('/operator/{fingerprint}', {
    params: { path: { fingerprint } },
  });
  return data!;
}

// cartel
export async function getCartelSearch(deployer: string): Promise<CartelReport> {
  const { data } = await apiClient.GET('/cartel/search', {
    params: { query: { deployer } },
  });
  return data!;
}

export async function getCartelFinancial(communityId: string): Promise<FinancialGraphSummary> {
  const { data } = await apiClient.GET('/cartel/{deployer}/financial', {
    params: { path: { deployer: communityId } },
  });
  return data!;
}

// compare
export async function compareTokens(mintA: string, mintB: string): Promise<TokenCompareResult> {
  const { data } = await apiClient.GET('/compare', {
    params: { query: { mint_a: mintA, mint_b: mintB } },
  });
  return data!;
}

// stats / health
export async function getGlobalStats(): Promise<GlobalStats> {
  const { data } = await apiClient.GET('/stats/global');
  return data!;
}

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await apiClient.GET('/health');
  // /health returns unknown in schema -- cast to manual type
  return data as unknown as HealthStatus;
}

// auth (schema returns `unknown` for auth endpoints -- cast manually)
export async function authLogin(privyId: string): Promise<{ api_key: string }> {
  const { data } = await apiClient.POST('/auth/login', {
    body: { privy_id: privyId },
  });
  return data as unknown as { api_key: string };
}

export async function getMe(apiKey: string): Promise<User> {
  const { data } = await apiClient.GET('/auth/me', {
    headers: { 'X-API-Key': apiKey },
  });
  return data as unknown as User;
}

export async function getWatches(apiKey: string): Promise<Watch[]> {
  const { data } = await apiClient.GET('/auth/watches', {
    headers: { 'X-API-Key': apiKey },
  });
  return (data as unknown as Watch[]) ?? [];
}

export async function addWatch(
  apiKey: string,
  sub_type: 'deployer' | 'mint',
  value: string,
): Promise<Watch> {
  const { data } = await apiClient.POST('/auth/watches', {
    headers: { 'X-API-Key': apiKey },
    body: { sub_type, value },
  });
  return data as unknown as Watch;
}

export async function deleteWatch(apiKey: string, id: string): Promise<void> {
  await apiClient.DELETE('/auth/watches/{watch_id}', {
    headers: { 'X-API-Key': apiKey },
    params: { path: { watch_id: Number(id) } },
  });
}

export async function getTopTokens(limit = 10): Promise<TopToken[]> {
  const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const res = await fetch(`${BASE_URL}/stats/top-tokens?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<TopToken[]>;
}
