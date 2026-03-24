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
export { agentStream } from './agent-streaming';
export type { AgentEvent, AgentDoneEvent, AgentVerdict } from './agent-streaming';

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
  if (!data) throw new Error('Empty response from /lineage');
  return data;
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
  if (!data) throw new Error('Empty response from /sol-trace');
  return data;
}

// intelligence
export async function getDeployer(address: string): Promise<DeployerProfile> {
  const { data } = await apiClient.GET('/deployer/{address}', {
    params: { path: { address } },
  });
  if (!data) throw new Error('Empty response from /deployer');
  return data;
}

// operator
export async function getOperatorImpact(fingerprint: string): Promise<OperatorImpactReport> {
  const { data } = await apiClient.GET('/operator/{fingerprint}', {
    params: { path: { fingerprint } },
  });
  if (!data) throw new Error('Empty response from /operator');
  return data;
}

// cartel
export async function getCartelSearch(deployer: string): Promise<CartelReport> {
  const { data } = await apiClient.GET('/cartel/search', {
    params: { query: { deployer } },
  });
  if (!data) throw new Error('Empty response from /cartel/search');
  return data;
}

export async function getCartelFinancial(communityId: string): Promise<FinancialGraphSummary> {
  const { data } = await apiClient.GET('/cartel/{deployer}/financial', {
    params: { path: { deployer: communityId } },
  });
  if (!data) throw new Error('Empty response from /cartel/financial');
  return data;
}

// compare
export async function compareTokens(mintA: string, mintB: string): Promise<TokenCompareResult> {
  const { data } = await apiClient.GET('/compare', {
    params: { query: { mint_a: mintA, mint_b: mintB } },
  });
  if (!data) throw new Error('Empty response from /compare');
  return data;
}

// stats / health
export async function getGlobalStats(): Promise<GlobalStats> {
  const { data } = await apiClient.GET('/stats/global');
  if (!data) throw new Error('Empty response from /stats/global');
  return data;
}

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await apiClient.GET('/health');
  // /health returns unknown in schema -- cast to manual type
  return data as unknown as HealthStatus;
}

// auth (schema returns `unknown` for auth endpoints -- cast manually)
export async function authLogin(
  privyId: string,
  opts?: { wallet_address?: string; email?: string },
): Promise<{ api_key: string; wallet_address?: string; email?: string; plan?: string }> {
  const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const body = {
    privy_id: privyId,
    wallet_address: opts?.wallet_address ?? null,
    email: opts?.email ?? null,
  };
  console.log('[api] authLogin →', BASE, JSON.stringify(body));
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  console.log('[api] authLogin ←', res.status, JSON.stringify(json));
  if (!res.ok) {
    throw new Error(json?.detail ?? `HTTP ${res.status}`);
  }
  if (!json?.api_key) {
    throw new Error('Backend returned no api_key');
  }
  return json;
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
  // Backend returns { watches: Watch[] } — extract the array
  const raw = data as unknown as { watches?: Watch[] } | Watch[];
  if (Array.isArray(raw)) return raw;
  return raw?.watches ?? [];
}

export async function addWatch(
  apiKey: string,
  sub_type: 'deployer' | 'mint',
  value: string,
): Promise<Watch> {
  try {
    const { data } = await apiClient.POST('/auth/watches', {
      headers: { 'X-API-Key': apiKey },
      body: { sub_type, value },
    });
    return data as unknown as Watch;
  } catch (err: unknown) {
    // 409 = already exists — treat as success, fetch existing watch
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
      const watches = await getWatches(apiKey);
      const existing = watches.find((w) => w.value === value && w.sub_type === sub_type);
      if (existing) return existing;
    }
    throw err;
  }
}

export async function deleteWatch(apiKey: string, id: string): Promise<void> {
  await apiClient.DELETE('/auth/watches/{watch_id}', {
    headers: { 'X-API-Key': apiKey },
    params: { path: { watch_id: Number(id) } },
  });
}

export async function updateProfile(
  apiKey: string,
  updates: { username?: string; display_name?: string; avatar_url?: string },
): Promise<User> {
  const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const res = await fetch(`${BASE}/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Update failed' }));
    throw new Error(err.detail ?? 'Update failed');
  }
  return res.json() as Promise<User>;
}

export interface Graduation {
  mint: string;
  deployer: string;
  timestamp: number;
  signature: string;
}

export async function getGraduations(limit = 20): Promise<Graduation[]> {
  const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const res = await fetch(`${BASE}/graduations?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<Graduation[]>;
}

export async function regenerateApiKey(apiKey: string): Promise<string> {
  const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const res = await fetch(`${BASE}/auth/regenerate-key`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error('Key rotation failed');
  const data = await res.json();
  return data.api_key;
}

export async function getTopTokens(limit = 10): Promise<TopToken[]> {
  const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
  const res = await fetch(`${BASE_URL}/stats/top-tokens?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<TopToken[]>;
}
