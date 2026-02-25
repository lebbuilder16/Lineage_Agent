"use client";

import type { DeployerProfile as DeployerProfileType } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";
import { cn } from "@/lib/utils";

interface Props {
  profile: DeployerProfileType | null | undefined;
}

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",   label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30", label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",  label: "Low confidence" },
} as const;

function RugBar({ rugRate }: { rugRate: number }) {
  const level = rugRate >= 80 ? "critical" : rugRate >= 50 ? "high" : rugRate >= 25 ? "medium" : "low";
  const barColor = { critical: "bg-destructive", high: "bg-destructive/70", medium: "bg-warning", low: "bg-neon" }[level];
  const textColor = { critical: "text-destructive", high: "text-destructive/80", medium: "text-warning", low: "text-neon" }[level];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Rug rate</span>
        <span className={cn("font-bold tabular-nums", textColor)}>{rugRate.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${Math.min(rugRate, 100)}%` }} />
      </div>
    </div>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-3 py-2 min-w-[72px]">
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground/60">{sub}</span>}
    </div>
  );
}

export default function DeployerProfileCard({ profile }: Props) {
  if (profile === undefined) return null;
  if (profile === null) {
    return (
      <ForensicCard icon="🏭" title="Deployer Profile" empty emptyLabel="No deployment history found">
        <></>
      </ForensicCard>
    );
  }

  const cfg = CONFIDENCE_CONFIG[profile.confidence];
  const shortAddr = `${profile.address.slice(0, 6)}…${profile.address.slice(-4)}`;

  return (
    <ForensicCard icon="🏭" title="Deployer Profile">
      {/* Header: address + confidence badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <code className="text-xs text-muted-foreground font-mono">{shortAddr}</code>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <StatBlock label="tokens launched" value={profile.total_tokens_launched} />
        <StatBlock label="rugs" value={profile.rug_count} />
        <StatBlock label="active" value={profile.active_tokens} />
        {profile.avg_lifespan_days !== null && profile.avg_lifespan_days !== undefined && (
          <StatBlock label="avg lifespan" value={`${profile.avg_lifespan_days.toFixed(1)}d`} />
        )}
      </div>

      <RugBar rugRate={profile.rug_rate_pct} />

      {/* Preferred narrative */}
      {profile.preferred_narrative && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Preferred narrative:</span>
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium capitalize">
            {profile.preferred_narrative}
          </span>
        </div>
      )}

      {/* Activity window */}
      {(profile.first_seen || profile.last_seen) && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Activity:{" "}
          {profile.first_seen ? new Date(profile.first_seen).toLocaleDateString() : "?"}
          {" → "}
          {profile.last_seen ? new Date(profile.last_seen).toLocaleDateString() : "present"}
        </p>
      )}

      {/* Recent tokens */}
      {profile.tokens.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Recent tokens
          </p>
          {profile.tokens.slice(0, 5).map((t) => (
            <div key={t.mint} className="flex items-center justify-between text-xs gap-2">
              <a
                href={`/lineage/${t.mint}`}
                className="truncate font-medium hover:text-neon transition-colors max-w-[160px]"
              >
                {t.name || t.symbol || t.mint.slice(0, 8)}
              </a>
              <div className="flex items-center gap-1.5 shrink-0">
                {t.rugged_at && (
                  <span className="rounded bg-destructive/20 text-destructive px-1.5 py-0.5 text-[10px]">
                    RUGGED
                  </span>
                )}
                {t.mcap_usd && (
                  <span className="text-muted-foreground tabular-nums">
                    ${t.mcap_usd >= 1_000_000
                      ? `${(t.mcap_usd / 1_000_000).toFixed(1)}M`
                      : `${(t.mcap_usd / 1_000).toFixed(0)}K`}
                  </span>
                )}
              </div>
            </div>
          ))}
          {profile.tokens.length > 5 && (
            <p className="text-[10px] text-muted-foreground/60">
              +{profile.tokens.length - 5} more tokens
            </p>
          )}
        </div>
      )}
    </ForensicCard>
  );
}
