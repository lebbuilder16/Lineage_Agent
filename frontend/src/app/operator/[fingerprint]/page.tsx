"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchOperatorImpact,
  type OperatorImpactReport,
  ApiError,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  params: { fingerprint: string };
}

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",               label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30",      label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",      label: "Low confidence" },
} as const;

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <span className={cn("text-xl font-bold tabular-nums", accent ? "text-destructive" : "text-foreground")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function OperatorPage({ params }: Props) {
  const { fingerprint } = params;
  const [report, setReport] = useState<OperatorImpactReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchOperatorImpact(fingerprint)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.detail : String(e)))
      .finally(() => setLoading(false));
  }, [fingerprint]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-4">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-destructive">{error ?? "Not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back</Link>
      </main>
    );
  }

  const cfg = CONFIDENCE_CONFIG[report.confidence];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      {/* Title */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">🎭 Operator Dossier</h1>
          {report.is_campaign_active && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-3 py-1 text-xs font-bold text-destructive">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              CAMPAIGN ACTIVE
            </span>
          )}
          <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", cfg.badge)}>
            {cfg.label}
          </span>
        </div>
        <code className="text-sm text-muted-foreground font-mono">{report.fingerprint}</code>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Tokens launched" value={report.total_tokens_launched} />
        <StatCard label="Rugs" value={report.total_rug_count} accent />
        <StatCard label="Rug rate" value={`${report.rug_rate_pct.toFixed(1)}%`} accent={report.rug_rate_pct >= 50} />
        <StatCard label="Extracted" value={formatUsd(report.estimated_extracted_usd)} accent />
        <StatCard label="Peak concurrent" value={report.peak_concurrent_tokens} />
      </div>

      {/* Linked wallets */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Linked Wallets ({report.linked_wallets.length})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {report.linked_wallets.map((w) => (
            <div
              key={w}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <code className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{w}</code>
              <Link
                href={`/deployer/${w}`}
                className="ml-2 shrink-0 text-xs text-primary hover:text-neon transition-colors"
              >
                Profile →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Narrative campaign sequence */}
      {report.narrative_sequence.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Campaign Narrative Sequence</h2>
          <div className="flex flex-wrap gap-2">
            {report.narrative_sequence.map((n, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
                <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium capitalize">
                  {n}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity window */}
      {(report.first_activity || report.last_activity) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Activity Timeline</h2>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">First seen:</span>{" "}
            {report.first_activity ? new Date(report.first_activity).toLocaleString() : "unknown"}
            <span className="mx-4">→</span>
            <span className="font-medium text-foreground">Last activity:</span>{" "}
            {report.last_activity ? new Date(report.last_activity).toLocaleString() : "ongoing"}
          </div>
        </section>
      )}

      {/* Active tokens */}
      {report.active_tokens.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Active Tokens ({report.active_tokens.length})</h2>
          <div className="flex flex-wrap gap-2">
            {report.active_tokens.map((mint) => (
              <Link
                key={mint}
                href={`/lineage/${mint}`}
                className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-neon hover:border-neon/30 transition-colors"
              >
                {mint.slice(0, 8)}…
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Wallet profiles */}
      {report.wallet_profiles.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Wallet Profiles</h2>
          <div className="space-y-3">
            {report.wallet_profiles.map((profile) => (
              <div
                key={profile.address}
                className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <code className="font-mono text-sm text-muted-foreground">{profile.address}</code>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                    <span>{profile.total_tokens_launched} tokens</span>
                    <span className="text-destructive">{profile.rug_count} rugs</span>
                    <span>{profile.rug_rate_pct.toFixed(1)}% rug rate</span>
                    {profile.preferred_narrative && (
                      <span className="capitalize text-primary">{profile.preferred_narrative}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/deployer/${profile.address}`}
                  className="text-xs text-primary hover:text-neon transition-colors"
                >
                  Full Profile →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
