"use client";

/**
 * useAlerts — real-time push notifications via the backend WebSocket.
 *
 * The backend fires `alert` events on `/ws/lineage` when a monitored deployer
 * or narrative produces a new token.  This hook maintains a persistent
 * connection and surfaces alerts as a badge count + dismissible list.
 *
 * Reconnect strategy: exponential backoff (1s → 2s → 4s → 8s, max 5 attempts).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AlertNotification {
  id: string;          // unique, used as React key
  type: "deployer" | "narrative" | "rug" | "info";
  title: string;
  body: string;
  mint?: string;
  timestamp: number;   // Unix ms
  read: boolean;
}

interface UseAlertsOptions {
  /** Disable the WebSocket connection entirely (e.g. bot-only users). */
  disabled?: boolean;
}

const MAX_ALERTS = 50;
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

function getWsBase(): string {
  if (typeof window === "undefined") return "";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  // Convert http(s):// → ws(s)://
  return apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
}

function retryDelay(attempt: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, attempt), 8000);
}

export function useAlerts({ disabled = false }: UseAlertsOptions = {}) {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const unreadCount = alerts.filter((a) => !a.read).length;

  const addAlert = useCallback((raw: Omit<AlertNotification, "id" | "timestamp" | "read">) => {
    const entry: AlertNotification = {
      ...raw,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      read: false,
    };
    setAlerts((prev) => [entry, ...prev].slice(0, MAX_ALERTS));

    // Browser notification (requires permission)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`🧬 ${entry.title}`, { body: entry.body, tag: entry.id });
    }
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────────
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (disabled || unmountedRef.current) return;
    const base = getWsBase();
    if (!base) return;

    const ws = new WebSocket(`${base}/ws/alerts`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      // Handle server-side keepalive ping
      if (typeof ev.data === "string" && ev.data === "ping") {
        if (ws.readyState === WebSocket.OPEN) ws.send("pong");
        return;
      }
      // Ignore non-alert frames (e.g. "pong")
      if (typeof ev.data === "string" && ev.data === "pong") return;
      try {
        const msg = JSON.parse(ev.data as string) as {
          event?: string;
          type?: AlertNotification["type"];
          title?: string;
          body?: string;
          mint?: string;
        };
        if (msg.event === "alert" || msg.title) {
          addAlert({
            type: msg.type ?? "info",
            title: msg.title ?? "New alert",
            body: msg.body ?? "",
            mint: msg.mint,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onopen = () => {
      retryRef.current = 0;
      // Send a keepalive ping every 30 s to prevent proxy timeouts
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 30_000);
    };

    ws.onclose = () => {
      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (unmountedRef.current) return;
      const attempt = retryRef.current;
      if (attempt >= MAX_RETRIES) return;
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, retryDelay(attempt));
    };

    ws.onerror = () => {
      ws.close(); // triggers onclose → retry
    };
  }, [disabled, addAlert]);

  useEffect(() => {
    unmountedRef.current = false;
    if (!disabled) connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pingIntervalRef.current !== null) clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, [disabled, connect]);

  return {
    alerts,
    unreadCount,
    markAllRead,
    dismiss,
    addAlert,
    requestPermission,
  };
}
