"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchDeployerProfile,
  type DeployerProfile,
  type DeployerTokenSummary,
  ApiError,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  params: { address: string };
}

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",          label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30", label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",  label: "Low confidence" },
} as const;

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <span
        className={cn(
          "text-xl font-bold tabular-nums",
          accent ? "text-destructive" : "text-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TokenRow({ token }: { token: DeployerTokenSummary }) {
  const isRugged = !!token.rugged_at;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
        isRugged
          ? "border-destructive/20 bg-destructive/5"
          : "border-border bg-card hover:border-primary/30"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Rug indicator */}
        <span
          className={cn(
            "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            isRugged
              ? "bg-destructive/20 text-destructive"
              : "bg-neon/20 text-neon"
          )}
        >
          {isRugged ? "RUGGED" : "ACTIVE"}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate">
            {token.name || token.symbol || "Unknown"}
            {token.symbol && token.name ? (
              <span className="ml-1 text-muted-foreground text-xs">{token.symbol}</span>
            ) : null}
          </div>
          <code className="text-[10px] text-muted-foreground font-mono">
            {token.mint.slice(0, 8)}…{token.mint.slice(-4)}
          </code>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-2">
        {token.mcap_usd != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatUsd(token.mcap_usd)}
          </span>
        )}
        {token.narrative && (
          <span className="hidden sm:inline-block rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium capitalize">
            {token.narrative}
          </span>
        )}
        <Link
          href={`/lineage/${token.mint}`}
          className="text-xs text-primary hover:text-neon transition-colors"
        >
          Lineage →
        </Link>
      </div>
    </div>
  );
}

export default function DeployerPage({ params }: Props) {
  const { address } = params;
  const [profile, setProfile] = useState<DeployerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDeployerProfile(address)
      .then(setProfile)
      .catch((e) => setError(e instanceof ApiError ? e.detail : String(e)))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-72 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">
          {error ?? "No profile found for this deployer. Analyse one of their tokens first."}
        </p>
        <Link href="/" className="inline-block text-sm text-primary hover:underline">
          ← Back to Home
        </Link>
      </div>
    );
  }

  const cfg = CONFIDENCE_CONFIG[profile.confidence];
  const rugPct = profile.rug_rate_pct;
  const rugColor =
    rugPct >= 80
      ? "text-destructive"
      : rugPct >= 50
      ? "text-destructive/80"
      : rugPct >= 25
      ? "text-warning"
      : "text-neon";

  // Sort tokens: rugged first, then by created_at desc
  const sortedTokens = [...profile.tokens].sort((a, b) => {
    if (!!a.rugged_at !== !!b.rugged_at) return a.rugged_at ? -1 : 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">🕵️ Deployer Profile</h1>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", cfg.badge)}>
            {cfg.label}
          </span>
        </div>
        <code className="block text-sm text-muted-foreground font-mono break-all">{profile.address}</code>
        {(profile.first_seen || profile.last_seen) && (
          <p className="text-xs text-muted-foreground/70">
            Active:{" "}
            {profile.first_seen ? new Date(profile.first_seen).toLocaleDateString() : "?"}
            {" → "}
            {profile.last_seen ? new Date(profile.last_seen).toLocaleDateString() : "present"}
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Tokens launched" value={profile.total_tokens_launched} />
        <StatCard label="Rugs confirmed" value={profile.rug_count} accent={profile.rug_count > 0} />
        <StatCard
          label="Rug rate"
          value={`${rugPct.toFixed(1)}%`}
          accent={rugPct >= 50}
        />
        <StatCard label="Active tokens" value={profile.active_tokens} />
        {profile.avg_lifespan_days != null && (
          <StatCard
            label="Avg lifespan"
            value={`${profile.avg_lifespan_days.toFixed(1)}d`}
          />
        )}
      </div>

      {/* Rug rate bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Rug rate</span>
          <span className={cn("font-bold tabular-nums", rugColor)}>{rugPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              rugPct >= 80 ? "bg-destructive" : rugPct >= 50 ? "bg-destructive/70" : rugPct >= 25 ? "bg-warning" : "bg-neon"
            )}
            style={{ width: `${Math.min(rugPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Preferred narrative */}
      {profile.preferred_narrative && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Primary narrative:</span>
          <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium capitalize">
            {profile.preferred_narrative}
          </span>
        </div>
      )}

      {/* Token list */}
      {sortedTokens.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Token History ({sortedTokens.length})
          </h2>
          <div className="space-y-2">
            {sortedTokens.map((t) => (
              <TokenRow key={t.mint} token={t} />
            ))}
          </div>
        </section>
      )}

      {sortedTokens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No token history found. Run a lineage analysis on one of this deployer&apos;s tokens to populate the data.
        </p>
      )}

      <Link href="/" className="inline-block text-sm text-primary hover:underline">
        ← Back to Home
      </Link>
    </div>
  );
}
