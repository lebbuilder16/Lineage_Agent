// Lineage Agent -- SSE & WebSocket streaming helpers
import { WS_BASE } from './api-client';
import type { AnalysisStep, AlertItem, LineageResult } from '../types/api';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// Analyze token via SSE stream (React Native has no built-in EventSource)
export function analyzeStream(
  mint: string,
  onStep: (step: AnalysisStep) => void,
  onDone: (result?: LineageResult) => void,
  onError?: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/analyze/${encodeURIComponent(mint)}/stream`;
  let cancelled = false;

  fetch(url, { headers: { Accept: 'text/event-stream' } })
    .then((res) => {
      if (!res.ok || !res.body) {
        onError?.(new Error(`Stream ${res.status}`));
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = () => {
        if (cancelled) return;
        reader.read().then(({ done, value }) => {
          if (done) { onDone(); return; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const step = JSON.parse(line.slice(6)) as AnalysisStep;
                onStep(step);
                if (step.done) { onDone(); return; }
              } catch (e) {
                console.warn('[analyzeStream] unparseable SSE line', e);
              }
            }
          }
          read();
        }).catch((err: unknown) => {
          if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)));
          onDone();
        });
      };

      read();
    })
    .catch((err: unknown) => {
      if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)));
      onDone();
    });

  return () => { cancelled = true; };
}

// Chat stream via POST SSE
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
            try { onChunk(JSON.parse(text) as string); } catch { onChunk(text); }
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

// WebSocket: real-time alerts feed
export function connectAlertsWS(
  onAlert: (alert: AlertItem) => void,
  onError?: () => void,
  onStatusChange?: (connected: boolean) => void,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let closed = false;

  const connect = () => {
    ws = new WebSocket(`${WS_BASE}/ws/alerts`);

    ws.onopen = () => onStatusChange?.(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as AlertItem;
        if (!data.id) data.id = `${Date.now()}-${Math.random()}`;
        if (!data.read) data.read = false;
        onAlert(data);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => { onError?.(); onStatusChange?.(false); };

    ws.onclose = () => {
      onStatusChange?.(false);
      if (!closed) reconnectTimer = setTimeout(connect, 5_000);
    };
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}

// WebSocket: lineage progress feed
export function connectLineageWS(
  onProgress: (step: AnalysisStep) => void,
  onDone: (result: LineageResult) => void,
  onError?: (msg: string) => void,
): { scan: (mint: string) => void; close: () => void } {
  let ws: WebSocket | null = null;

  const ensureOpen = (): Promise<void> =>
    new Promise((resolve) => {
      if (ws && ws.readyState === WebSocket.OPEN) { resolve(); return; }
      ws = new WebSocket(`${WS_BASE}/ws/lineage`);
      ws.onopen = () => resolve();
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { done?: boolean; result?: LineageResult } & AnalysisStep;
          if (data.done && data.result) {
            onDone(data.result);
          } else {
            onProgress(data);
          }
        } catch {
          // ignore malformed frames
        }
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
