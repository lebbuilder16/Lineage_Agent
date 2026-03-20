/**
 * Solana wallet detection and connection utilities.
 * Zero-dependency — communicates directly with browser-injected wallet providers.
 */

export interface DetectedWallet {
  name: string;
  color: string;
  installed: boolean;
  downloadUrl: string;
}

export interface ConnectedWallet {
  name: string;
  publicKey: string;
  provider: unknown;
}

/* ── Provider detection ──────────────────────────────────── */

function getPhantom(): any {
  const p = (window as any).phantom?.solana;
  return p?.isPhantom ? p : null;
}

function getSolflare(): any {
  const p = (window as any).solflare;
  return p?.isSolflare ? p : null;
}

function getBackpack(): any {
  return (window as any).backpack ?? null;
}

function getCoinbase(): any {
  return (window as any).coinbaseSolana ?? null;
}

/* ── Wallet registry ─────────────────────────────────────── */

const REGISTRY = [
  { name: 'Phantom',         color: '#AB9FF2', get: getPhantom,  downloadUrl: 'https://phantom.app/download' },
  { name: 'Solflare',        color: '#FC7227', get: getSolflare, downloadUrl: 'https://solflare.com/download' },
  { name: 'Backpack',        color: '#E33E3F', get: getBackpack, downloadUrl: 'https://backpack.app/download' },
  { name: 'Coinbase Wallet', color: '#0052FF', get: getCoinbase, downloadUrl: 'https://www.coinbase.com/wallet' },
];

/* ── Public API ──────────────────────────────────────────── */

export function detectWallets(): DetectedWallet[] {
  return REGISTRY.map((w) => ({
    name: w.name,
    color: w.color,
    installed: !!w.get(),
    downloadUrl: w.downloadUrl,
  }));
}

export async function connectWallet(name: string): Promise<ConnectedWallet> {
  const entry = REGISTRY.find((w) => w.name === name);
  if (!entry) throw new Error(`Unknown wallet: ${name}`);

  const provider = entry.get();
  if (!provider) throw new Error(`${name} is not installed`);

  const resp = await provider.connect();
  const publicKey = resp?.publicKey?.toString?.() ?? provider.publicKey?.toString?.();
  if (!publicKey) throw new Error('Could not retrieve public key');

  return { name, publicKey, provider };
}

export async function disconnectWallet(provider: unknown): Promise<void> {
  try { await (provider as any)?.disconnect?.(); } catch { /* ok */ }
}

export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
