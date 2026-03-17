// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw connection state — Zustand store with AsyncStorage persistence
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OpenClawStatus = 'connected' | 'reconnecting' | 'offline' | 'unconfigured';

interface OpenClawState {
  /** Gateway host, e.g. "192.168.1.50:18789" or "my-claw.tail1234.ts.net" */
  host: string | null;
  /** Device token issued after pairing */
  deviceToken: string | null;
  /** Whether the WebSocket is currently open and authenticated */
  connected: boolean;
  /** Detailed connection status for UI */
  status: OpenClawStatus;
  /** Whether device has been successfully paired */
  paired: boolean;

  // Actions
  setHost: (host: string | null) => void;
  setDeviceToken: (token: string | null) => void;
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
      connected: false,
      status: 'unconfigured',
      paired: false,

      setHost: (host) => set({ host }),
      setDeviceToken: (deviceToken) => set({ deviceToken }),
      setConnected: (connected) => set({ connected }),
      setStatus: (status) => set({ status }),
      setPaired: (paired) => set({ paired }),
      reset: () =>
        set({
          host: null,
          deviceToken: null,
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
        paired: state.paired,
      }),
    },
  ),
);
