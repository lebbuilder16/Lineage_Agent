// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway — WebSocket client singleton
// Connects to the user's self-hosted OpenClaw instance for augmented features.
// Falls back gracefully: isOpenClawAvailable() === false when not configured.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { useOpenClawStore } from '../store/openclaw';
import { signDeviceIdentity } from './openclaw-identity';
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

  doConnect(host, token).catch(() => {
    // Errors are handled inside doConnect; this guards against unhandled rejection.
  });
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

async function doConnect(host: string, token: string) {
  const protocol = host.startsWith('wss://') || host.startsWith('ws://') ? '' : 'ws://';
  const url = `${protocol}${host}`;

  const clientId = Platform.OS === 'ios'
    ? 'openclaw-ios' as const
    : Platform.OS === 'android'
      ? 'openclaw-android' as const
      : 'node-host' as const;

  const SCOPES = [
    'operator.admin',
    'operator.read',
    'operator.write',
    'operator.approvals',
    'operator.pairing',
  ];

  ws = new WebSocket(url);

  // The gateway immediately sends connect.challenge after WS open.
  // We wait for it before sending the connect frame.
  ws.onopen = () => {
    // Nothing — wait for connect.challenge from server
  };

  ws.onmessage = async (event) => {
    let frame: OpenClawResponse | OpenClawEvent;
    try {
      frame = JSON.parse(event.data as string) as OpenClawResponse | OpenClawEvent;
    } catch {
      return; // ignore malformed frames
    }

    // Handle server challenge: sign nonce and send connect handshake
    if (frame.type === 'event' && (frame as OpenClawEvent).event === 'connect.challenge') {
      const challengePayload = (frame as OpenClawEvent).payload as { nonce: string; ts: number };
      let device: ConnectParams['device'];
      try {
        device = await signDeviceIdentity({
          nonce: challengePayload.nonce,
          clientId,
          clientMode: 'node',
          role: 'node',
          scopes: SCOPES,
          token,
        });
      } catch {
        // Proceed without device identity — gateway will assign minimal scopes
      }

      const params: ConnectParams = {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: { id: clientId, version: '1.0.0', platform: Platform.OS, mode: 'node', deviceFamily: 'mobile' },
        role: 'node',
        auth: {
          token,
          ...(useOpenClawStore.getState().roleToken
            ? { deviceToken: useOpenClawStore.getState().roleToken! }
            : {}),
        },
        scopes: SCOPES,
        caps: ['lineage.scan', 'lineage.watchlist', 'lineage.alert', 'notifications.send'],
        ...(device ? { device } : {}),
      };
      const connectFrame: OpenClawRequest = {
        type: 'req',
        id: 'connect-0',
        method: 'connect',
        params: params as unknown as Record<string, unknown>,
      };
      ws!.send(JSON.stringify(connectFrame));
      return;
    }

    handleFrame(frame, host, token);
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
      reconnectTimer = setTimeout(() => { doConnect(host, token).catch(() => {}); }, delay);
    } else {
      store.setStatus('offline');
    }
  };
}

function handleFrame(
  frame: OpenClawResponse | OpenClawEvent,
  _host: string,
  _token: string,
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
        // Store device token if issued by gateway
        if (hello?.deviceToken) {
          store.setDeviceToken(hello.deviceToken);
        }
        // If the hello response did NOT include a device token, the device is
        // not yet paired. Explicitly request pairing so the admin can approve.
        if (!hello?.deviceToken && ws && ws.readyState === WebSocket.OPEN) {
          const pairFrame: OpenClawRequest = {
            type: 'req',
            id: 'pair-0',
            method: 'node.pair.request',
            params: {
              scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'],
              label: `Lineage Agent (${typeof navigator !== 'undefined' ? navigator.userAgent : 'mobile'})`,
            },
          };
          try { ws.send(JSON.stringify(pairFrame)); } catch { /* ignore */ }
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
