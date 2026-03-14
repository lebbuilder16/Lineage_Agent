// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — API Client
// ─────────────────────────────────────────────────────────────────────────────
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
  AnalysisStep,
  AlertItem,
  User,
  Watch,
} from '../types/api';

const BASE_URL = 'https://lineage-agent.fly.dev';
const WS_BASE = 'wss://lineage-agent.fly.dev';

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

// ─── lineage ──────────────────────────────────────────────────────────────────

export function getLineage(mint: string): Promise<LineageResult> {
  return apiFetch<LineageResult>(`/lineage?mint=${encodeURIComponent(mint)}`);
}

export function getLineageGraph(mint: string): Promise<LineageGraph> {
  return apiFetch<LineageGraph>(`/lineage/${encodeURIComponent(mint)}/graph`);
}

export function getSolTrace(mint: string): Promise<SolFlowReport> {
  return apiFetch<SolFlowReport>(`/lineage/${encodeURIComponent(mint)}/sol-trace`);
}

// ─── intelligence ─────────────────────────────────────────────────────────────

export function getDeployer(address: string): Promise<DeployerProfile> {
  return apiFetch<DeployerProfile>(`/deployer/${encodeURIComponent(address)}`);
}

// ─── cartel ───────────────────────────────────────────────────────────────────

export function getCartelSearch(deployer: string): Promise<CartelReport> {
  return apiFetch<CartelReport>(`/cartel/search?deployer=${encodeURIComponent(deployer)}`);
}

export function getCartelFinancial(communityId: string): Promise<CartelReport> {
  return apiFetch<CartelReport>(`/cartel/${encodeURIComponent(communityId)}/financial`);
}

// ─── compare ──────────────────────────────────────────────────────────────────

export function compareTokens(mintA: string, mintB: string): Promise<TokenCompareResult> {
  const params = new URLSearchParams({ mint_a: mintA, mint_b: mintB });
  return apiFetch<TokenCompareResult>(`/compare?${params}`);
}

// ─── stats / health ───────────────────────────────────────────────────────────

export function getGlobalStats(): Promise<GlobalStats> {
  return apiFetch<GlobalStats>('/stats/global');
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/health');
}

// ─── streaming: analyze (SSE) ─────────────────────────────────────────────────

export function analyzeStream(
  mint: string,
  onStep: (step: AnalysisStep) => void,
  onDone: (result?: LineageResult) => void,
  onError?: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/analyze/${encodeURIComponent(mint)}/stream`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as AnalysisStep;
      onStep(data);
      if (data.done) {
        es.close();
        onDone();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = (err) => {
    es.close();
    onError?.(new Error('Stream error: ' + String(err)));
    onDone();
  };

  return () => es.close();
}

// ─── streaming: chat (SSE via POST) ───────────────────────────────────────────

export function chatStream(
  mint: string | undefined,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  const path = mint ? `/chat/${encodeURIComponent(mint)}` : '/chat';

  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, history }),
  }).then((res) => {
    if (!res.ok || !res.body) {
      onError?.(new Error(`Chat API ${res.status}`));
      onDone();
      return () => {};
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let cancelled = false;

    const read = () => {
      if (cancelled) return;
      reader.read().then(({ done, value }) => {
        if (done) { onDone(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const text = line.slice(6);
            if (text === '[DONE]') { onDone(); return; }
            try { onChunk(JSON.parse(text)); } catch { onChunk(text); }
          }
        }
        read();
      }).catch((err: unknown) => {
        if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)));
        onDone();
      });
    };

    read();
    return () => { cancelled = true; reader.cancel(); };
  });
}

// ─── WebSocket: alerts ────────────────────────────────────────────────────────

export function connectAlertsWS(
  onAlert: (alert: AlertItem) => void,
  onError?: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let closed = false;

  const connect = () => {
    ws = new WebSocket(`${WS_BASE}/ws/alerts`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AlertItem;
        // assign a unique id if missing
        if (!data.id) data.id = `${Date.now()}-${Math.random()}`;
        if (!data.read) data.read = false;
        onAlert(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => onError?.();

    ws.onclose = () => {
      if (!closed) reconnectTimer = setTimeout(connect, 5000); // auto-reconnect
    };
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}

// ─── WebSocket: lineage progress ─────────────────────────────────────────────

export function connectLineageWS(
  onProgress: (step: AnalysisStep) => void,
  onDone: (result: LineageResult) => void,
  onError?: (msg: string) => void,
): { scan: (mint: string) => void; close: () => void } {
  let ws: WebSocket | null = null;
  let openCallbacks: (() => void)[] = [];

  const ensureOpen = (): Promise<void> =>
    new Promise((resolve) => {
      if (ws && ws.readyState === WebSocket.OPEN) { resolve(); return; }
      ws = new WebSocket(`${WS_BASE}/ws/lineage`);
      ws.onopen = () => { resolve(); openCallbacks.forEach((cb) => cb()); openCallbacks = []; };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.done && data.result) {
            onDone(data.result as LineageResult);
          } else {
            onProgress(data as AnalysisStep);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => onError?.('WebSocket error');
    });

  return {
    scan: (mint: string) => {
      ensureOpen().then(() => {
        ws?.send(JSON.stringify({ mint }));
      });
    },
    close: () => ws?.close(),
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authLogin(privyId: string): Promise<{ api_key: string }> {
  return apiFetch<{ api_key: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ privy_id: privyId }),
  });
}

export async function getMe(apiKey: string): Promise<User> {
  return apiFetch<User>('/auth/me', { headers: { 'X-API-Key': apiKey } });
}

export async function getWatches(apiKey: string): Promise<Watch[]> {
  return apiFetch<Watch[]>('/auth/watches', { headers: { 'X-API-Key': apiKey } });
}

export async function addWatch(
  apiKey: string,
  sub_type: 'deployer' | 'mint',
  value: string,
): Promise<Watch> {
  return apiFetch<Watch>('/auth/watches', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: JSON.stringify({ sub_type, value }),
  });
}

export async function deleteWatch(apiKey: string, id: string): Promise<void> {
  await fetch(`${BASE_URL}/auth/watches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });
}
