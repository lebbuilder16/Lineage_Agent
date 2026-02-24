"use client";

import type { TokenMetadata } from "@/lib/api";
import Image from "next/image";

interface Props {
  token: TokenMetadata;
  isRoot?: boolean;
}

export function TokenInfo({ token, isRoot = false }: Props) {
  const fmt = (n: number | null) =>
    n != null ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";

  return (
    <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 animate-fade-in">
      {/* Logo */}
      <div className="relative h-14 w-14 flex-shrink-0 rounded-full overflow-hidden bg-[var(--background)]">
        {token.image_uri ? (
          <Image
            src={token.image_uri}
            alt={token.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            🪙
          </div>
        )}
        {isRoot && (
          <span className="absolute -top-1 -right-1 text-sm" title="Root token">
            👑
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-lg truncate">
          {token.name || "Unknown"}{" "}
          <span className="text-[var(--muted)] text-sm font-normal">
            {token.symbol}
          </span>
        </h3>

        <p className="font-mono text-xs text-[var(--muted)] truncate mt-0.5">
          {token.mint}
        </p>

        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Stat label="Market Cap" value={fmt(token.market_cap_usd)} />
          <Stat label="Liquidity" value={fmt(token.liquidity_usd)} />
          <Stat label="Price" value={token.price_usd != null ? `$${token.price_usd}` : "—"} />
          {token.deployer && (
            <Stat label="Deployer" value={`${token.deployer.slice(0, 6)}…`} />
          )}
        </div>

        {token.dex_url && (
          <a
            href={token.dex_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
          >
            View on DexScreener →
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--muted)]">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
