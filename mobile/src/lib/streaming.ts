// Lineage Agent -- SSE & WebSocket streaming helpers
// Uses XMLHttpRequest for SSE (React Native's fetch may lack ReadableStream support)
import { WS_BASE } from './api-client';
import type { AnalysisStep, AlertItem, LineageResult } from '../types/api';
import * as Notifications from 'expo-notifications';
import { isOpenClawAvailable } from './openclaw';
import { routeAlertToChannels, enrichAlert } from './openclaw-alerts';
import { useAlertPrefsStore } from '../store/alert-prefs';
import { useAlertsStore } from '../store/alerts';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// ─── SSE line parser (shared) ────────────────────────────────────────────────

interface SSECallbacks {
  onEvent: (event: string, data: string) => boolean; // return true to stop
}

/**
 * Creates a progressive SSE parser that works with XMLHttpRequest.onprogress.
 * Call `feed(responseText)` each time onprogress fires — it tracks its own
 * read cursor so only new bytes are parsed.
 */
function createSSEParser(cb: SSECallbacks) {
  let cursor = 0;
  let buffer = '';
  let pendingEvent = '';

  return {
    feed(responseText: string) {
      const newData = responseText.substring(cursor);
      cursor = responseText.length;
      buffer += newData;

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? ''; // keep incomplete trailing line

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          pendingEvent = line.slice(7).trim();
        } else if (line === '') {
          pendingEvent = '';
        } else if (line.startsWith('data: ')) {
          const dataText = line.slice(6);
          const shouldStop = cb.onEvent(pendingEvent, dataText);
          if (shouldStop) return true;
        }
      }
      return false;
    },
  };
}

// ─── Analyze SSE stream (GET) ────────────────────────────────────────────────

export function analyzeStream(
  mint: string,
  onStep: (step: AnalysisStep) => void,
  onDone: (result?: LineageResult) => void,
  onError?: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/analyze/${encodeURIComponent(mint)}/stream`;
  let stopped = false;

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.responseType = 'text';

  const parser = createSSEParser({
    onEvent(event, data) {
      if (stopped) return true;

      if (event === 'complete') {
        stopped = true;
        try {
          onDone(JSON.parse(data) as LineageResult);
        } catch {
          onDone();
        }
        return true;
      }

      if (event === 'error') {
        stopped = true;
        try {
          const parsed = JSON.parse(data) as { detail?: string };
          onError?.(new Error(parsed.detail ?? 'Analysis error'));
        } catch {
          onError?.(new Error(data));
        }
        onDone();
        return true;
      }

      // step event
      try {
        onStep(JSON.parse(data) as AnalysisStep);
      } catch (e) {
        console.warn('[analyzeStream] unparseable SSE data', e);
      }
      return false;
    },
  });

  xhr.onprogress = () => {
    if (stopped) return;
    parser.feed(xhr.responseText);
  };

  xhr.onload = () => {
    if (!stopped) {
      // Final parse of any remaining buffered data
      parser.feed(xhr.responseText);
      if (!stopped) onDone();
    }
  };

  xhr.onerror = () => {
    if (!stopped) {
      stopped = true;
      onError?.(new Error('Network error — check your connection'));
      onDone();
    }
  };

  xhr.ontimeout = () => {
    if (!stopped) {
      stopped = true;
      onError?.(new Error('Request timed out'));
      onDone();
    }
  };

  xhr.timeout = 120_000; // 2 min max
  xhr.send();

  return () => {
    stopped = true;
    xhr.abort();
  };
}

// ─── Chat SSE stream (POST) ─────────────────────────────────────────────────

export function chatStream(
  mint: string | undefined,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  const path = mint ? `/chat/${encodeURIComponent(mint)}` : '/chat';
  let stopped = false;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.responseType = 'text';

    const parser = createSSEParser({
      onEvent(event, data) {
        if (stopped) return true;

        if (event === 'done' || data === '[DONE]') {
          stopped = true;
          onDone();
          return true;
        }

        if (event === 'error') {
          stopped = true;
          try {
            const parsed = JSON.parse(data) as { detail?: string };
            onError?.(new Error(parsed.detail ?? 'Chat error'));
          } catch {
            onError?.(new Error(data));
          }
          onDone();
          return true;
        }

        // token event — extract text
        try {
          const parsed = JSON.parse(data) as unknown;
          const chunk =
            typeof parsed === 'string'
              ? parsed
              : parsed !== null && typeof (parsed as { text?: string }).text === 'string'
                ? (parsed as { text: string }).text
                : '';
          if (chunk) onChunk(chunk);
        } catch {
          if (data) onChunk(data);
        }
        return false;
      },
    });

    xhr.onprogress = () => {
      if (stopped) return;
      parser.feed(xhr.responseText);
    };

    xhr.onload = () => {
      if (!stopped) {
        parser.feed(xhr.responseText);
        if (!stopped) onDone();
      }
    };

    xhr.onerror = () => {
      if (!stopped) {
        stopped = true;
        onError?.(new Error('Network error — check your connection'));
        onDone();
      }
    };

    xhr.ontimeout = () => {
      if (!stopped) {
        stopped = true;
        onError?.(new Error('Request timed out'));
        onDone();
      }
    };

    xhr.timeout = 120_000;
    xhr.send(JSON.stringify({ message, history }));

    // Resolve immediately with cancel function
    resolve(() => {
      stopped = true;
      xhr.abort();
    });
  });
}

// ─── WebSocket: real-time alerts feed ────────────────────────────────────────

const BACKOFF_BASE = 2_000;
const BACKOFF_MAX = 30_000;
const DEDUP_WINDOW_MS = 60_000;

export type WsStatus = 'connected' | 'reconnecting' | 'offline';

export function connectAlertsWS(
  onAlert: (alert: AlertItem) => void,
  onError?: () => void,
  onStatusChange?: (connected: boolean) => void,
  onStatusDetailed?: (status: WsStatus) => void,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let closed = false;
  let retryCount = 0;

  // Dedup: track recent alerts by mint+type within a time window
  const recentAlerts = new Map<string, number>();

  function isDuplicate(alert: AlertItem): boolean {
    const key = `${alert.mint ?? ''}:${alert.type}`;
    const lastSeen = recentAlerts.get(key);
    const now = Date.now();
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;
    recentAlerts.set(key, now);
    // Prune old entries periodically
    if (recentAlerts.size > 200) {
      for (const [k, ts] of recentAlerts) {
        if (now - ts > DEDUP_WINDOW_MS) recentAlerts.delete(k);
      }
    }
    return false;
  }

  const connect = () => {
    onStatusDetailed?.('reconnecting');
    ws = new WebSocket(`${WS_BASE}/ws/alerts`);

    ws.onopen = () => {
      retryCount = 0;
      onStatusChange?.(true);
      onStatusDetailed?.('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as AlertItem;
        if (!data.id) data.id = `${Date.now()}-${Math.random()}`;
        if (!data.read) data.read = false;
        if (isDuplicate(data)) return;
        onAlert(data);

        // OpenClaw: multi-channel routing + AI enrichment (best-effort, async)
        if (isOpenClawAvailable()) {
          routeAlertToChannels(data);
          if (useAlertPrefsStore.getState().enrichmentEnabled) {
            enrichAlert(data).then((enriched) => {
              if (enriched) {
                useAlertsStore.getState().updateEnrichment(data.id, enriched);
              }
            }).catch(() => {});
          }
        }

        Notifications.scheduleNotificationAsync({
          content: {
            title: data.title ?? data.token_name ?? data.type.toUpperCase(),
            body: data.message ?? '',
            data: { mint: data.mint },
          },
          trigger: null,
        }).catch(() => {});
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      onError?.();
      onStatusChange?.(false);
    };

    ws.onclose = () => {
      onStatusChange?.(false);
      if (!closed) {
        const delay = Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
        retryCount++;
        onStatusDetailed?.('reconnecting');
        reconnectTimer = setTimeout(connect, delay);
      } else {
        onStatusDetailed?.('offline');
      }
    };
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
    onStatusDetailed?.('offline');
  };
}

// ─── WebSocket: lineage progress feed ────────────────────────────────────────

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
