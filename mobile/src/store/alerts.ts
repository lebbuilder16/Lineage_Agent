// src/store/alerts.ts
// Zustand store pour les alertes live (WebSocket)

import { create } from "zustand";
import type { AlertItem } from "@/types/api";

interface AlertsState {
  alerts: AlertItem[];
  unreadCount: number;
  lastAddedAt: number;

  addAlert: (alert: AlertItem) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  markReadBatch: (ids: string[]) => void;
  clearAll: () => void;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  lastAddedAt: 0,

  addAlert: (alert) => {
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100), // max 100 alertes
      unreadCount: state.unreadCount + 1,
      lastAddedAt: Date.now(),
    }));
  },

  markRead: (id) => {
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      );
      const unreadCount = alerts.filter((a) => !a.read).length;
      return { alerts, unreadCount };
    });
  },

  markReadBatch: (ids) => {
    const idSet = new Set(ids);
    set((state) => {
      const alerts = state.alerts.map((a) =>
        idSet.has(a.id) ? { ...a, read: true } : a
      );
      const unreadCount = alerts.filter((a) => !a.read).length;
      return { alerts, unreadCount };
    });
  },

  markAllRead: () => {
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => set({ alerts: [], unreadCount: 0, lastAddedAt: 0 }),
}));
