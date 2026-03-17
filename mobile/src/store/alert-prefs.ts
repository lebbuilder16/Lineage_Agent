// ─────────────────────────────────────────────────────────────────────────────
// Alert preferences — channel toggles + escalation rules
// Persisted with AsyncStorage.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertChannelId, EscalationRule } from '../types/openclaw';

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

export const useAlertPrefsStore = create<AlertPrefsState>()(
  persist(
    (set) => ({
      channels: {
        telegram: false,
        whatsapp: false,
        discord: false,
        push: true,
      },
      escalationRules: DEFAULT_RULES,
      enrichmentEnabled: true,

      setChannelEnabled: (channel, enabled) =>
        set((state) => ({
          channels: { ...state.channels, [channel]: enabled },
        })),

      setEscalationRules: (rules) => set({ escalationRules: rules }),

      setEnrichmentEnabled: (enabled) => set({ enrichmentEnabled: enabled }),
    }),
    {
      name: 'lineage-alert-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
