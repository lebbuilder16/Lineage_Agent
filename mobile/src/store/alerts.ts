import { create } from 'zustand';
import type { AlertItem } from '../types/api';

interface AlertsState {
  alerts: AlertItem[];
  wsConnected: boolean;
  addAlert: (alert: AlertItem) => void;
  setWsConnected: (connected: boolean) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  unreadCount: () => number;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  alerts: [],
  wsConnected: false,

  setWsConnected: (connected) => set({ wsConnected: connected }),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100),
    })),

  markRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
    })),

  markAllRead: () =>
    set((state) => ({ alerts: state.alerts.map((a) => ({ ...a, read: true })) })),

  unreadCount: () => get().alerts.filter((a) => !a.read).length,
}));
