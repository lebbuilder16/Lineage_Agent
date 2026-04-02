// ─────────────────────────────────────────────────────────────────────────────
// Alert preferences — channel toggles + escalation rules
// Persisted with AsyncStorage AND synced to backend.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';
import type { AlertChannelId, EscalationRule } from '../types/openclaw';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface AlertPrefsState {
  /** Which external channels are enabled */
  channels: Record<AlertChannelId, boolean>;
  /** Escalation rules: alert type + optional min risk → channels */
  escalationRules: EscalationRule[];
  /** Whether to enrich alerts with AI context via OpenClaw */
  enrichmentEnabled: boolean;

  // Actions
  setChannelEnabled: (channel: AlertChannelId, enabled: boolean) => void;
  setEscalationRules: (rules: EscalationRule[]) => void;
  setEnrichmentEnabled: (enabled: boolean) => void;
  hydrateFromServer: () => Promise<void>;
}

/** Default escalation rules: info→Discord, warning→Telegram, critical→WhatsApp+Push */
const DEFAULT_RULES: EscalationRule[] = [
  { alertType: 'narrative', channels: ['discord'] },
  { alertType: 'zombie', channels: ['discord'] },
  { alertType: 'bundle', channels: ['telegram'] },
  { alertType: 'insider', channels: ['telegram'] },
  { alertType: 'deployer', channels: ['telegram'] },
  { alertType: 'death_clock', channels: ['telegram', 'push'] },
  { alertType: 'rug', channels: ['whatsapp', 'push'] },
];

function syncChannelsToBackend(channels: Record<AlertChannelId, boolean>) {
  const apiKey = useAuthStore.getState().apiKey;
  if (!apiKey) return;
  fetch(`${BASE_URL}/alert-prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ channels }),
  }).catch((e) => console.warn('[alert-prefs] backend sync failed', e));
}

export const useAlertPrefsStore = create<AlertPrefsState>()(
  persist(
    (set, get) => ({
      channels: {
        telegram: false,
        whatsapp: false,
        discord: false,
        push: true,
      },
      escalationRules: DEFAULT_RULES,
      enrichmentEnabled: true,

      setChannelEnabled: (channel, enabled) => {
        set((state) => ({
          channels: { ...state.channels, [channel]: enabled },
        }));
        syncChannelsToBackend(get().channels);
      },

      setEscalationRules: (rules) => set({ escalationRules: rules }),

      setEnrichmentEnabled: (enabled) => set({ enrichmentEnabled: enabled }),

      hydrateFromServer: async () => {
        const apiKey = useAuthStore.getState().apiKey;
        if (!apiKey) return;
        try {
          const res = await fetch(`${BASE_URL}/alert-prefs`, {
            headers: { 'X-API-Key': apiKey },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.channels) {
              set((state) => ({
                channels: { ...state.channels, ...data.channels },
              }));
            }
          }
        } catch (e) {
          console.warn('[alert-prefs] server hydrate failed', e);
        }
      },
    }),
    {
      name: 'lineage-alert-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
