import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Shared formatters ─────────────────────────────────────────────── */

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatSol(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ◎`;
  return `${n.toFixed(2)} ◎`;
}

export function short(addr: string): string {
  if (!addr || addr.length <= 12) return addr ?? "";
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}
