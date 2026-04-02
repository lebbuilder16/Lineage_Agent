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
const MAX_RETRIES = 5;
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
  timeoutMs: number = REQUEST_TIMEOUT,
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
    }, timeoutMs);

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

  ws.onmessage = (event) => {
    const raw = event.data as string;

    // Respond to server keepalive pings (plain text, not JSON)
    if (raw === 'ping') {
      try { ws?.send('pong'); } catch { /* connection closing */ }
      return;
    }

    let frame: OpenClawResponse | OpenClawEvent;
    try {
      frame = JSON.parse(raw) as OpenClawResponse | OpenClawEvent;
    } catch {
      return; // ignore malformed frames
    }

    // Handle server challenge: sign nonce and send connect handshake
    if (frame.type === 'event' && (frame as OpenClawEvent).event === 'connect.challenge') {
      const challengePayload = (frame as OpenClawEvent).payload as { nonce: string; ts: number };
      console.log('[openclaw] received connect.challenge, signing device identity...');

      // Use operator role when already paired (has deviceToken), node role for initial pairing
      const store = useOpenClawStore.getState();
      const isPaired = !!(store.paired || store.deviceToken || store.roleToken);
      const connectRole = isPaired ? 'operator' : 'node';
      const connectMode = isPaired ? 'ui' : 'node';

      // Handle async signing in a .then/.catch chain (not async handler)
      signDeviceIdentity({
        nonce: challengePayload.nonce,
        clientId,
        clientMode: connectMode,
        role: connectRole,
        scopes: SCOPES,
        token,
      })
        .then((device) => {
          console.log(`[openclaw] device identity signed (role=${connectRole}), sending connect frame...`);
          const params: ConnectParams = {
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
            client: { id: clientId, version: '1.0.0', platform: Platform.OS, mode: connectMode, deviceFamily: 'mobile' },
            role: connectRole,
            auth: {
              token,
              ...(useOpenClawStore.getState().roleToken
                ? { deviceToken: useOpenClawStore.getState().roleToken! }
                : {}),
            },
            scopes: SCOPES,
            caps: ['lineage.scan', 'lineage.analyze', 'lineage.watchlist', 'lineage.alert', 'notifications.send'],
            device,
          };
          const connectFrame: OpenClawRequest = {
            type: 'req',
            id: 'connect-0',
            method: 'connect',
            params: params as unknown as Record<string, unknown>,
          };
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(connectFrame));
          }
        })
        .catch((err) => {
          console.error('[openclaw] signDeviceIdentity failed:', err);
          useOpenClawStore.getState().setStatus('offline');
        });
      return;
    }

    handleFrame(frame, host, token);
  };

  ws.onerror = () => {
    const store = useOpenClawStore.getState();
    store.setConnected(false);
  };

  ws.onclose = (event) => {
    const store = useOpenClawStore.getState();
    store.setConnected(false);

    // If gateway says "pairing required", reset paired state and retry as node role
    const reason = (event as { reason?: string }).reason ?? '';
    if (event.code === 1008 && reason.includes('pairing')) {
      console.log('[openclaw] pairing required — resetting paired state, retrying as node');
      store.setPaired(false);
      store.setDeviceToken(null);
      store.setStatus('reconnecting');
      reconnectTimer = setTimeout(() => { doConnect(host, token).catch((e) => console.warn('[openclaw] reconnect failed', e)); }, 1000);
      return;
    }

    if (!closed && retryCount < MAX_RETRIES) {
      const delay = Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
      retryCount++;
      store.setStatus('reconnecting');
      reconnectTimer = setTimeout(() => { doConnect(host, token).catch((e) => console.warn('[openclaw] reconnect failed', e)); }, delay);
    } else {
      closed = true;
      store.setStatus('offline');
      console.log(`[openclaw] giving up after ${retryCount} retries — going offline`);
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
        // node.pair.request is no longer needed — pairing is handled via
        // the connect handshake with device identity + admin approval.
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
