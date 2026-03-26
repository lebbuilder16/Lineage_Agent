/**
 * Wallet monitor store — manages monitored wallets and their holdings.
 * Talks to /wallet/* backend endpoints.
 */
import { create } from 'zustand';
import { useAuthStore } from './auth';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export interface MonitoredWallet {
  id: number;
  address: string;
  label: string | null;
  source: 'embedded' | 'external';
  enabled: boolean;
  created_at: number;
}

export interface WalletHolding {
  wallet_address: string;
  mint: string;
  token_name: string;
  token_symbol: string;
  image_uri?: string;
  ui_amount: number;
  risk_score: number | null;
  risk_level: string | null;
  liquidity_usd: number | null;
  price_usd: number | null;
  last_scanned: number | null;
}

interface WalletMonitorState {
  wallets: MonitoredWallet[];
  holdings: WalletHolding[];
  lastSweep: number | null;
  totalRisky: number;
  totalHoldings: number;
  loading: boolean;
  scanning: boolean;

  fetchWallets: () => Promise<void>;
  addWallet: (address: string, label?: string, source?: string) => Promise<boolean>;
  removeWallet: (walletId: number) => Promise<void>;
  fetchHoldings: () => Promise<void>;
  triggerScan: () => Promise<{ holdings_count: number; risky_count: number; alerts_sent: number } | null>;
}

function getKey(): string | null {
  return useAuthStore.getState().apiKey;
}

export const useWalletMonitorStore = create<WalletMonitorState>((set) => ({
  wallets: [],
  holdings: [],
  lastSweep: null,
  totalRisky: 0,
  totalHoldings: 0,
  loading: false,
  scanning: false,

  fetchWallets: async () => {
    const apiKey = getKey();
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/wallet/list`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        set({ wallets: data.wallets ?? [] });
      }
    } catch { /* best-effort */ }
  },

  addWallet: async (address, label, source = 'external') => {
    const apiKey = getKey();
    if (!apiKey) return false;
    try {
      const res = await fetch(`${BASE_URL}/wallet/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ address, label, source }),
      });
      if (res.ok) {
        // Refresh wallet list
        const listRes = await fetch(`${BASE_URL}/wallet/list`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (listRes.ok) {
          const data = await listRes.json();
          set({ wallets: data.wallets ?? [] });
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  removeWallet: async (walletId) => {
    const apiKey = getKey();
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/wallet/remove/${walletId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        set((s) => ({
          wallets: s.wallets.filter((w) => w.id !== walletId),
          holdings: s.holdings.filter((h) => {
            const wallet = s.wallets.find((w) => w.id === walletId);
            return wallet ? h.wallet_address !== wallet.address : true;
          }),
        }));
      }
    } catch { /* best-effort */ }
  },

  fetchHoldings: async () => {
    const apiKey = getKey();
    if (!apiKey) return;
    set({ loading: true });
    try {
      const res = await fetch(`${BASE_URL}/wallet/holdings`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        set({
          holdings: data.holdings ?? [],
          totalHoldings: data.total_holdings ?? 0,
          totalRisky: data.total_risky ?? 0,
          lastSweep: data.last_sweep ?? null,
        });
      }
    } catch { /* best-effort */ }
    set({ loading: false });
  },

  triggerScan: async () => {
    const apiKey = getKey();
    if (!apiKey) return null;
    set({ scanning: true });
    try {
      const res = await fetch(`${BASE_URL}/wallet/monitor/scan`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const result = await res.json();
        // Refresh holdings after scan
        const holdingsRes = await fetch(`${BASE_URL}/wallet/holdings`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (holdingsRes.ok) {
          const data = await holdingsRes.json();
          set({
            holdings: data.holdings ?? [],
            totalHoldings: data.total_holdings ?? 0,
            totalRisky: data.total_risky ?? 0,
            lastSweep: data.last_sweep ?? null,
          });
        }
        set({ scanning: false });
        return result;
      }
    } catch { /* best-effort */ }
    set({ scanning: false });
    return null;
  },
}));
