// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway — WebSocket client singleton
// Connects to the user's self-hosted OpenClaw instance for augmented features.
// Falls back gracefully: isOpenClawAvailable() === false when not configured.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { useOpenClawStore } from '../store/openclaw';
import type {
  OpenClawRequest,
  OpenClawResponse,
  OpenClawEvent,
  ConnectParams,
  HelloPayload,
} from '../types/openclaw';

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKOFF_BASE = 2_000;
const BACKOFF_MAX = 30_000;
const REQUEST_TIMEOUT = 15_000;
const PROTOCOL_VERSION = 3;

let ws: WebSocket | null = null;
let requestId = 0;
let retryCount = 0;
let closed = true;
let reconnectTimer: ReturnType<typeof setTimeout>;

// Pending request map: id → { resolve, reject, timer }
const pending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
>();

// Event subscribers: eventType → Set<callback>
const subscribers = new Map<string, Set<(payload: unknown) => void>>();

// ─── Public API ──────────────────────────────────────────────────────────────

/** Whether the OpenClaw Gateway is connected and ready */
export function isOpenClawAvailable(): boolean {
  return useOpenClawStore.getState().connected;
}

/** Connect to the OpenClaw Gateway WebSocket */
export function connectOpenClaw(host: string, token: string): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return; // already connected / connecting
  }

  closed = false;
  retryCount = 0;

  const store = useOpenClawStore.getState();
  store.setStatus('reconnecting');

  doConnect(host, token);
}

/** Disconnect and stop reconnecting */
export function disconnectOpenClaw(): void {
  closed = true;
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null; // prevent reconnect loop
    ws.close();
    ws = null;
  }
  const store = useOpenClawStore.getState();
  store.setConnected(false);
  store.setStatus('offline');
  // Reject all pending requests
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error('OpenClaw disconnected'));
    pending.delete(id);
  }
}

/** Send a request and await the response */
export function sendRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('OpenClaw not connected'));
      return;
    }

    const id = String(++requestId);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`OpenClaw request timeout: ${method}`));
    }, REQUEST_TIMEOUT);

    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

    const frame: OpenClawRequest = { type: 'req', id, method, params };
    ws.send(JSON.stringify(frame));
  });
}

/** Subscribe to a server-push event. Returns an unsubscribe function. */
export function subscribe(
  event: string,
  cb: (payload: unknown) => void,
): () => void {
  let set = subscribers.get(event);
  if (!set) {
    set = new Set();
    subscribers.set(event, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subscribers.delete(event);
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

function doConnect(host: string, token: string) {
  const protocol = host.startsWith('wss://') || host.startsWith('ws://') ? '' : 'ws://';
  const url = `${protocol}${host}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    // Send connect handshake
    const params: ConnectParams = {
      id: `lineage-${Platform.OS}-${Date.now()}`,
      token,
      platform: Platform.OS as 'ios' | 'android',
      mode: 'node',
      version: '1.0.0',
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      capabilities: ['lineage.scan', 'lineage.watchlist', 'lineage.alert', 'notifications.send'],
    };
    const frame: OpenClawRequest = {
      type: 'req',
      id: 'connect-0',
      method: 'connect',
      params: params as unknown as Record<string, unknown>,
    };
    ws!.send(JSON.stringify(frame));
  };

  ws.onmessage = (event) => {
    try {
      const frame = JSON.parse(event.data as string) as OpenClawResponse | OpenClawEvent;
      handleFrame(frame, host, token);
    } catch {
      // ignore malformed frames
    }
  };

  ws.onerror = () => {
    const store = useOpenClawStore.getState();
    store.setConnected(false);
  };

  ws.onclose = () => {
    const store = useOpenClawStore.getState();
    store.setConnected(false);

    if (!closed) {
      const delay = Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
      retryCount++;
      store.setStatus('reconnecting');
      reconnectTimer = setTimeout(() => doConnect(host, token), delay);
    } else {
      store.setStatus('offline');
    }
  };
}

function handleFrame(
  frame: OpenClawResponse | OpenClawEvent,
  host: string,
  token: string,
) {
  if (frame.type === 'res') {
    const res = frame as OpenClawResponse;

    // Handle connect handshake response
    if (res.id === 'connect-0') {
      if (res.ok) {
        const hello = res.payload as HelloPayload | undefined;
        const store = useOpenClawStore.getState();
        retryCount = 0;
        store.setConnected(true);
        store.setStatus('connected');
        store.setPaired(true);
        // Store device token if issued
        if (hello?.deviceToken) {
          store.setDeviceToken(hello.deviceToken);
        }
      } else {
        // Auth failed — don't reconnect
        closed = true;
        ws?.close();
        const store = useOpenClawStore.getState();
        store.setStatus('offline');
        store.setPaired(false);
      }
      return;
    }

    // Handle regular request responses
    const p = pending.get(res.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(res.id);
      if (res.ok) {
        p.resolve(res.payload);
      } else {
        p.reject(new Error(res.error?.message ?? 'OpenClaw request failed'));
      }
    }
    return;
  }

  if (frame.type === 'event') {
    const evt = frame as OpenClawEvent;
    const set = subscribers.get(evt.event);
    if (set) {
      for (const cb of set) {
        try { cb(evt.payload); } catch { /* subscriber error — ignore */ }
      }
    }
    // Also dispatch to wildcard subscribers
    const wildcard = subscribers.get('*');
    if (wildcard) {
      for (const cb of wildcard) {
        try { cb({ event: evt.event, payload: evt.payload }); } catch { /* ignore */ }
      }
    }
  }
}
