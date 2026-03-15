// Lineage Agent -- SSE & WebSocket streaming helpers
import { WS_BASE } from './api-client';
import type { AnalysisStep, AlertItem, LineageResult } from '../types/api';
import * as Notifications from 'expo-notifications';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// Analyze token via SSE stream.
// Uses XMLHttpRequest + onprogress for reliable incremental delivery in React Native
// (fetch ReadableStream has inconsistent behaviour across RN versions/devices).
export function analyzeStream(
  mint: string,
  onStep: (step: AnalysisStep) => void,
  onDone: (result?: LineageResult) => void,
  onError?: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/analyze/${encodeURIComponent(mint)}/stream`;
  let cancelled = false;
  let done = false;
  let offset = 0;
  let buffer = '';
  let pendingEvent = '';

  const processNewText = (newText: string) => {
    buffer += newText;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        pendingEvent = line.slice(7).trim();
      } else if (line === '') {
        pendingEvent = '';
      } else if (line.startsWith('data: ')) {
        const text = line.slice(6);
        try {
          const payload = JSON.parse(text);
          if (pendingEvent === 'complete') {
            if (!done) { done = true; onDone(payload as LineageResult); }
            return;
          } else if (pendingEvent === 'error') {
            if (!done) {
              done = true;
              onError?.(new Error((payload as { detail?: string }).detail ?? 'Analysis error'));
              onDone();
            }
            return;
          } else {
            onStep(payload as AnalysisStep);
          }
        } catch (e) {
          console.warn('[analyzeStream] unparseable SSE line', e);
        }
      }
    }
  };

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');

  xhr.onprogress = () => {
    if (cancelled) return;
    const newText = xhr.responseText.slice(offset);
    offset = xhr.responseText.length;
    if (newText) processNewText(newText);
  };

  xhr.onload = () => {
    if (cancelled || done) return;
    // Drain any remaining buffer
    const newText = xhr.responseText.slice(offset);
    if (newText) processNewText(newText);
    if (!done) { done = true; onDone(); }
  };

  xhr.onerror = () => {
    if (cancelled || done) return;
    done = true;
    onError?.(new Error('Stream connection failed'));
    onDone();
  };

  xhr.ontimeout = () => {
    if (cancelled || done) return;
    done = true;
    onError?.(new Error('Stream timed out'));
    onDone();
  };

  xhr.timeout = 120_000; // 2 min max
  xhr.send();

  return () => { cancelled = true; xhr.abort(); };
}

// Chat stream via POST SSE.
// Uses XMLHttpRequest for reliable incremental delivery in React Native.
export function chatStream(
  mint: string | undefined,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  const path = mint ? `/chat/${encodeURIComponent(mint)}` : '/chat';

  let cancelled = false;
  let done = false;
  let offset = 0;
  let buffer = '';
  let pendingEvent = '';

  const processNewText = (newText: string) => {
    buffer += newText;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        pendingEvent = line.slice(7).trim();
      } else if (line === '') {
        pendingEvent = '';
      } else if (line.startsWith('data: ')) {
        const text = line.slice(6);
        if (pendingEvent === 'done' || text === '[DONE]') {
          if (!done) { done = true; onDone(); }
          return;
        }
        if (pendingEvent === 'error') {
          if (!done) {
            done = true;
            try {
              const parsed = JSON.parse(text) as { detail?: string };
              onError?.(new Error(parsed.detail ?? 'Chat error'));
            } catch { onError?.(new Error(text)); }
            onDone();
          }
          return;
        }
        // event: token → { text: "<chunk>" }
        try {
          const parsed = JSON.parse(text) as unknown;
          const chunk =
            parsed !== null && typeof (parsed as { text?: string }).text === 'string'
              ? (parsed as { text: string }).text
              : typeof parsed === 'string' ? parsed : '';
          if (chunk) onChunk(chunk);
        } catch { if (text) onChunk(text); }
      }
    }
  };

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BASE_URL}${path}`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');

  xhr.onprogress = () => {
    if (cancelled) return;
    const newText = xhr.responseText.slice(offset);
    offset = xhr.responseText.length;
    if (newText) processNewText(newText);
  };

  xhr.onload = () => {
    if (cancelled || done) return;
    const newText = xhr.responseText.slice(offset);
    if (newText) processNewText(newText);
    if (!done) { done = true; onDone(); }
  };

  xhr.onerror = () => {
    if (cancelled || done) return;
    done = true;
    onError?.(new Error('Chat connection failed'));
    onDone();
  };

  xhr.timeout = 60_000;
  xhr.ontimeout = () => {
    if (cancelled || done) return;
    done = true;
    onError?.(new Error('Chat timed out'));
    onDone();
  };

  xhr.send(JSON.stringify({ message, history }));

  return Promise.resolve(() => { cancelled = true; xhr.abort(); });
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
          const data = JSON.parse(event.data as string) as { is_done?: boolean; result?: LineageResult } & AnalysisStep;
          if (data.is_done && data.result) {
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
