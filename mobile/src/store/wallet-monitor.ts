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
  usd_value: number | null;
  risk_score: number | null;
  risk_level: string | null;
  liquidity_usd: number | null;
  price_usd: number | null;
  last_scanned: number | null;
  risk_flags: string[];
  prev_risk_score: number | null;
  status: 'new' | 'held' | 'risk_up' | 'risk_down';
}

export interface ScanResult {
  holdings_count: number;
  risky_count: number;
  alerts_sent: number;
  wallets_scanned: number;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface WalletMonitorState {
  wallets: MonitoredWallet[];
  holdings: WalletHolding[];
  lastSweep: number | null;
  totalRisky: number;
  totalHoldings: number;
  portfolioUsd: number;
  riskyUsd: number;
  riskDistribution: RiskDistribution;
  loading: boolean;
  scanning: boolean;
  lastScanResult: ScanResult | null;

  fetchWallets: () => Promise<void>;
  addWallet: (address: string, label?: string, source?: string) => Promise<boolean>;
  removeWallet: (walletId: number) => Promise<void>;
  fetchHoldings: () => Promise<void>;
  triggerScan: () => Promise<ScanResult | null>;
  clearScanResult: () => void;
}

function getKey(): string | null {
  return useAuthStore.getState().apiKey;
}

function applyHoldingsData(data: any) {
  return {
    holdings: data.holdings ?? [],
    totalHoldings: data.total_holdings ?? 0,
    totalRisky: data.total_risky ?? 0,
    lastSweep: data.last_sweep ?? null,
    portfolioUsd: data.portfolio_usd ?? 0,
    riskyUsd: data.risky_usd ?? 0,
    riskDistribution: data.risk_distribution ?? { low: 0, medium: 0, high: 0, critical: 0 },
  };
}

export const useWalletMonitorStore = create<WalletMonitorState>((set) => ({
  wallets: [],
  holdings: [],
  lastSweep: null,
  totalRisky: 0,
  totalHoldings: 0,
  portfolioUsd: 0,
  riskyUsd: 0,
  riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
  loading: false,
  scanning: false,
  lastScanResult: null,

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
        set(applyHoldingsData(data));
      }
    } catch { /* best-effort */ }
    set({ loading: false });
  },

  triggerScan: async () => {
    const apiKey = getKey();
    if (!apiKey) return null;
    set({ scanning: true, lastScanResult: null });
    try {
      const res = await fetch(`${BASE_URL}/wallet/monitor/scan`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const result: ScanResult = await res.json();
        // Refresh holdings after scan
        const holdingsRes = await fetch(`${BASE_URL}/wallet/holdings`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (holdingsRes.ok) {
          const data = await holdingsRes.json();
          set({ ...applyHoldingsData(data), scanning: false, lastScanResult: result });
        } else {
          set({ scanning: false, lastScanResult: result });
        }
        return result;
      }
    } catch { /* best-effort */ }
    set({ scanning: false });
    return null;
  },

  clearScanResult: () => set({ lastScanResult: null }),
}));
