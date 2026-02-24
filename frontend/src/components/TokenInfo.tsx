"use client";

import type { TokenMetadata } from "@/lib/api";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Crown, ExternalLink } from "lucide-react";

interface Props {
  token: TokenMetadata;
  isRoot?: boolean;
}

export function TokenInfo({ token, isRoot = false }: Props) {
  const fmt = (n: number | null) =>
    n != null
      ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "—";

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border bg-card p-5 animate-fade-in transition-colors",
        isRoot ? "border-primary/30" : "border-border"
      )}
    >
      {/* Avatar */}
      <div className="relative h-12 w-12 flex-shrink-0 rounded-full overflow-hidden bg-muted">
        {token.image_uri ? (
          <Image
            src={token.image_uri}
            alt={token.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-muted-foreground">
            ?
          </div>
        )}
        {isRoot && (
          <div className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
            <Crown className="h-2.5 w-2.5 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <h3 className="font-semibold truncate">
            {token.name || "Unknown"}{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {token.symbol}
            </span>
          </h3>
          <p className="font-mono text-xs text-muted-foreground truncate">
            {token.mint}
          </p>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <StatBadge label="MCap" value={fmt(token.market_cap_usd)} />
          <StatBadge label="Liq" value={fmt(token.liquidity_usd)} />
          <StatBadge
            label="Price"
            value={
              token.price_usd != null ? `$${token.price_usd}` : "—"
            }
          />
          {token.deployer && (
            <StatBadge
              label="Deployer"
              value={`${token.deployer.slice(0, 4)}...${token.deployer.slice(-4)}`}
              mono
            />
          )}
        </div>

        {/* DexScreener link */}
        {token.dex_url && (
          <a
            href={token.dex_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            View on DexScreener
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", mono && "font-mono")}>{value}</span>
    </span>
  );
}
