// src/lib/websocket.ts
// WebSocket client for live alert streaming from /ws/lineage.
// Reconnects with exponential backoff. Controlled by start()/stop().

import { useAlertsStore } from "@/src/store/alerts";
import type { AlertItem } from "@/src/types/api";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev";
// Convert https:// → wss://, http:// → ws://
const WS_BASE = BASE_URL.replace(/^http/, "ws");

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES = 10;

type LiveAlertsSocket = WebSocket & { ping?: () => void };

let socket: LiveAlertsSocket | null = null;
let retryCount = 0;
let backoffMs = INITIAL_BACKOFF_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function clearRetryTimer() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function connect() {
  if (stopped) return;

  try {
    const nextSocket = new WebSocket(`${WS_BASE}/ws/lineage`) as LiveAlertsSocket;
    socket = nextSocket;

    nextSocket.onopen = () => {
      retryCount = 0;
      backoffMs = INITIAL_BACKOFF_MS;
    };

    nextSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Partial<AlertItem>;
        if (!msg.id || !msg.type || !msg.mint) return;

        const alert: AlertItem = {
          id: msg.id,
          type: msg.type,
          mint: msg.mint,
          token_name: msg.token_name ?? msg.mint,
          token_image: msg.token_image ?? "",
          message: msg.message ?? "",
          timestamp: msg.timestamp ?? new Date().toISOString(),
          read: false,
        };

        useAlertsStore.getState().addAlert(alert);
      } catch {
        // Malformed message — ignore.
      }
    };

    nextSocket.onerror = () => {
      nextSocket.close();
    };

    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (stopped || retryCount >= MAX_RETRIES) return;

  retryCount += 1;
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  retryTimer = setTimeout(connect, backoffMs);
}

export const liveAlerts = {
  start() {
    stopped = false;
    retryCount = 0;
    backoffMs = INITIAL_BACKOFF_MS;
    clearRetryTimer();
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }
  },

  stop() {
    stopped = true;
    clearRetryTimer();
    socket?.close();
    socket = null;
  },
};
