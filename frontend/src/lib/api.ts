// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — API Client
// ─────────────────────────────────────────────────────────────────────────────
import type {
  TokenSearchResult,
  SolFlowReport,
  GlobalStats,
  HealthStatus,
} from '../types/api';

const BASE_URL = 'https://lineage-agent.fly.dev';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ─── search ───────────────────────────────────────────────────────────────────

export function searchTokens(q = '', offset = 0, limit = 20): Promise<TokenSearchResult[]> {
  const params = new URLSearchParams({ q, offset: String(offset), limit: String(limit) });
  return apiFetch<TokenSearchResult[]>(`/search?${params}`);
}

// ─── sol trace ────────────────────────────────────────────────────────────────

export function getSolTrace(mint: string): Promise<SolFlowReport> {
  return apiFetch<SolFlowReport>(`/lineage/${encodeURIComponent(mint)}/sol-trace`);
}

// ─── stats / health ───────────────────────────────────────────────────────────

export function getGlobalStats(): Promise<GlobalStats> {
  return apiFetch<GlobalStats>('/stats/global');
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/health');
}
