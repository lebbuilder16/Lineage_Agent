import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertItem } from '../types/api';

const MAX_ALERTS = 500;

interface AlertsState {
  alerts: AlertItem[];
  wsConnected: boolean;
  addAlert: (alert: AlertItem) => void;
  setWsConnected: (connected: boolean) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteAlert: (id: string) => void;
  unreadCount: () => number;
  updateEnrichment: (id: string, data: NonNullable<AlertItem['enrichedData']>) => void;
  markDelivered: (id: string, channels: string[]) => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],
      wsConnected: false,

      setWsConnected: (connected) => set({ wsConnected: connected }),

      addAlert: (alert) =>
        set((state) => ({
          alerts: [alert, ...state.alerts].slice(0, MAX_ALERTS),
        })),

      markRead: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
        })),

      deleteAlert: (id) =>
        set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

      markAllRead: () =>
        set((state) => ({ alerts: state.alerts.map((a) => ({ ...a, read: true })) })),

      unreadCount: () => get().alerts.filter((a) => !a.read).length,

      updateEnrichment: (id, data) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, enrichedData: data } : a,
          ),
        })),

      markDelivered: (id, channels) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, deliveredChannels: channels } : a,
          ),
        })),
    }),
    {
      name: 'lineage-alerts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ alerts: state.alerts }),
    },
  ),
);
