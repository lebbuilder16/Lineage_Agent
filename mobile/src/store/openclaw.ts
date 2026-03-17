// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw connection state — Zustand store with AsyncStorage persistence
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OpenClawStatus = 'connected' | 'reconnecting' | 'offline' | 'unconfigured';

interface OpenClawState {
  /** Gateway host, e.g. "192.168.1.50:18789" */
  host: string | null;
  /** Gateway auth token (entered by user in Settings) */
  deviceToken: string | null;
  /** Device role token from `openclaw devices rotate` — grants full operator scopes */
  roleToken: string | null;
  /** Whether the WebSocket is currently open and authenticated */
  connected: boolean;
  /** Detailed connection status for UI */
  status: OpenClawStatus;
  /** Whether device has been successfully paired */
  paired: boolean;

  // Actions
  setHost: (host: string | null) => void;
  setDeviceToken: (token: string | null) => void;
  setRoleToken: (token: string | null) => void;
  setConnected: (connected: boolean) => void;
  setStatus: (status: OpenClawStatus) => void;
  setPaired: (paired: boolean) => void;
  reset: () => void;
}

export const useOpenClawStore = create<OpenClawState>()(
  persist(
    (set) => ({
      host: null,
      deviceToken: null,
      roleToken: null,
      connected: false,
      status: 'unconfigured',
      paired: false,

      setHost: (host) => set({ host }),
      setDeviceToken: (deviceToken) => set({ deviceToken }),
      setRoleToken: (roleToken) => set({ roleToken }),
      setConnected: (connected) => set({ connected }),
      setStatus: (status) => set({ status }),
      setPaired: (paired) => set({ paired }),
      reset: () =>
        set({
          host: null,
          deviceToken: null,
          roleToken: null,
          connected: false,
          status: 'unconfigured',
          paired: false,
        }),
    }),
    {
      name: 'lineage-openclaw',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        host: state.host,
        deviceToken: state.deviceToken,
        roleToken: state.roleToken,
        paired: state.paired,
      }),
    },
  ),
);
