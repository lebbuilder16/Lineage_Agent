"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type {
  DeployerProfile,
  CartelReport,
  DeathClockForecast,
  FactoryRhythmReport,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/utils";
import {
  StatBlock,
  RugBar,
  CONFIDENCE_CONFIG,
  SIGNAL_COLORS,
  SIGNAL_LABELS,
  CollapsibleSection,
} from "@/components/forensics/shared";

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  profile: DeployerProfile | null | undefined;
  cartel: CartelReport | null | undefined;
  deathClock: DeathClockForecast | null | undefined;
  factory: FactoryRhythmReport | null | undefined;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function DeployerTab({ profile, cartel, deathClock, factory }: Props) {
  const hasProfile = profile != null;
  const hasCartel = cartel?.deployer_community != null;
  const hasClock = deathClock != null && deathClock.risk_level !== "insufficient_data";
  const hasFactory = factory != null;

  if (!hasProfile && !hasCartel && !hasClock && !hasFactory) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
        <p className="text-sm text-zinc-500">No deployer intelligence available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Section 1: Deployer Profile ────────────────────────────── */}
      {hasProfile && (
        <section>
          <SectionLabel icon="🏭" title="Deployer Profile" />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <code className="text-xs text-muted-foreground font-mono">
              {profile.address.slice(0, 6)}…{profile.address.slice(-4)}
            </code>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                CONFIDENCE_CONFIG[profile.confidence].badge,
              )}
            >
              {CONFIDENCE_CONFIG[profile.confidence].label}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <StatBlock label="Launched" value={profile.total_tokens_launched} />
            <StatBlock label="Rugs" value={profile.rug_count} />
            <StatBlock label="Active" value={profile.active_tokens} />
            {profile.avg_lifespan_days != null && (
              <StatBlock
                label="Avg lifespan"
                value={`${profile.avg_lifespan_days.toFixed(1)}d`}
              />
            )}
          </div>

          <RugBar rugRate={profile.rug_rate_pct} />

          {profile.preferred_narrative && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Preferred narrative:</span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium capitalize">
                {profile.preferred_narrative}
              </span>
            </div>
          )}

          {(profile.first_seen || profile.last_seen) && (
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              Activity:{" "}
              {profile.first_seen
                ? new Date(profile.first_seen).toLocaleDateString()
                : "?"}
              {" → "}
              {profile.last_seen
                ? new Date(profile.last_seen).toLocaleDateString()
                : "present"}
            </p>
          )}

          {/* Recent tokens */}
          {profile.tokens.length > 0 && (
            <CollapsibleSection title={`Recent tokens (${profile.tokens.length})`}>
              <div className="space-y-1">
                {profile.tokens.slice(0, 5).map((t) => (
                  <div
                    key={t.mint}
                    className="flex items-center justify-between text-xs gap-2"
                  >
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
                      {t.mcap_usd != null && (
                        <span className="text-muted-foreground tabular-nums">
                          {formatUsd(t.mcap_usd)}
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
            </CollapsibleSection>
          )}
        </section>
      )}

      {/* ── Section 2: Death Clock ─────────────────────────────────── */}
      {hasClock && <DeathClockSection forecast={deathClock} />}

      {/* ── Section 3: Factory Rhythm ──────────────────────────────── */}
      {hasFactory && <FactorySection report={factory} />}

      {/* ── Section 4: Cartel Detection ────────────────────────────── */}
      {hasCartel && <CartelSection report={cartel!} />}
    </div>
  );
}

/* ── Death Clock ───────────────────────────────────────────────────── */

const RISK_CONFIG = {
  low: { color: "bg-green-500", text: "text-green-400", label: "Low Risk", widthPct: 15 },
  medium: { color: "bg-yellow-400", text: "text-yellow-400", label: "Medium Risk", widthPct: 45 },
  high: { color: "bg-orange-500", text: "text-orange-400", label: "High Risk", widthPct: 72 },
  critical: { color: "bg-red-500", text: "text-red-400", label: "Critical", widthPct: 95 },
  first_rug: { color: "bg-amber-400", text: "text-amber-400", label: "1st Rug on Record", widthPct: 50 },
  insufficient_data: { color: "bg-zinc-600", text: "text-zinc-400", label: "Insufficient Data", widthPct: 0 },
} as const;

function DeathClockSection({ forecast }: { forecast: DeathClockForecast }) {
  const cfg = RISK_CONFIG[forecast.risk_level] ?? RISK_CONFIG.insufficient_data;
  const elapsedPct = Math.min(
    (forecast.elapsed_hours / (forecast.median_rug_hours || 1)) * 100,
    100,
  );

  return (
    <section>
      <SectionLabel icon="☠️" title="Death Clock" />

      <div className="flex items-center justify-between mb-2">
        <span className={cn("text-xs font-semibold", cfg.text)}>{cfg.label}</span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden mb-2">
        <div
          className={cn("absolute left-0 top-0 h-full rounded-full opacity-30", cfg.color)}
          style={{ width: `${cfg.widthPct}%` }}
        />
        <motion.div
          className="absolute top-0 h-full rounded-full bg-white/80"
          style={{ width: 4, left: `calc(${elapsedPct}% - 2px)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        />
      </div>

      <div className="flex justify-between text-xs text-zinc-500 mb-2">
        <span>Launch</span>
        <span>Median rug ({Math.round(forecast.median_rug_hours / 24)}d)</span>
      </div>

      <p className="text-zinc-300 text-xs">
        Based on{" "}
        <span className="text-white font-medium">
          {forecast.historical_rug_count} prior rugs
        </span>{" "}
        by this deployer. Elapsed:{" "}
        <span className="font-medium">{Math.round(forecast.elapsed_hours)}h</span>
        {" • "}
        {forecast.predicted_window_start && forecast.predicted_window_end ? (
          <>
            Predicted window:{" "}
            <span className="text-zinc-200">
              {fmtDate(forecast.predicted_window_start)} –{" "}
              {fmtDate(forecast.predicted_window_end)}
            </span>
          </>
        ) : (
          <span className="text-zinc-500">{forecast.confidence_note}</span>
        )}
      </p>
    </section>
  );
}

/* ── Factory Rhythm ────────────────────────────────────────────────── */

function FactorySection({ report }: { report: FactoryRhythmReport }) {
  const pct = Math.round(report.factory_score * 100);
  const isFactory = report.is_factory;

  return (
    <section>
      <SectionLabel icon="🏭" title="Factory Rhythm" />

      <div className="flex flex-wrap items-center gap-4 mb-2">
        {isFactory ? (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
            SCRIPTED DEPLOYER
          </span>
        ) : (
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
            Low factory probability
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                isFactory ? "bg-red-500" : "bg-zinc-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-semibold",
              isFactory ? "text-red-400" : "text-zinc-500",
            )}
          >
            {pct}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>
          Tokens: <span className="text-zinc-200 font-medium">{report.tokens_launched}</span>
        </span>
        <span>
          Interval:{" "}
          <span className="text-zinc-200">
            {report.median_interval_hours < 24
              ? `${report.median_interval_hours.toFixed(1)}h`
              : `${(report.median_interval_hours / 24).toFixed(1)}d`}
          </span>
        </span>
        <span>
          Naming: <span className="text-zinc-200 capitalize">{report.naming_pattern}</span>
        </span>
        <span>
          Regularity: <span className="text-zinc-200">{Math.round(report.regularity_score * 100)}%</span>
        </span>
      </div>
    </section>
  );
}

/* ── Cartel Detection ──────────────────────────────────────────────── */

function CartelSection({ report }: { report: CartelReport }) {
  const c = report.deployer_community!;
  const cfg = CONFIDENCE_CONFIG[c.confidence];
  const signalColor =
    SIGNAL_COLORS[c.strongest_signal] ??
    "bg-muted text-muted-foreground border-border";
  const signalLabel = SIGNAL_LABELS[c.strongest_signal] ?? c.strongest_signal;

  return (
    <section>
      <SectionLabel icon="🕸️" title="Cartel Detection" />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            signalColor,
          )}
        >
          {signalLabel}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            cfg.badge,
          )}
        >
          {cfg.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <StatBlock label="Wallets" value={c.wallets.length} />
        <StatBlock label="Tokens" value={c.total_tokens_launched} />
        <StatBlock label="Rugs" value={c.total_rugs} />
        <StatBlock label="Extracted" value={formatUsd(c.estimated_extracted_usd)} />
      </div>

      {/* Signal breakdown */}
      {c.edges.length > 0 && (
        <CollapsibleSection title={`Signals (${c.edges.length})`}>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(c.edges.map((e) => e.signal_type))).map((s) => (
              <span
                key={s}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  SIGNAL_COLORS[s] ?? "bg-muted text-muted-foreground border-border",
                )}
              >
                {SIGNAL_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {c.active_since && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Active since: {new Date(c.active_since).toLocaleDateString()}
        </p>
      )}

      <div className="mt-3 border-t border-border/50 pt-2">
        <Link
          href={`/cartel/${c.community_id}`}
          className="text-xs text-primary hover:text-neon transition-colors font-medium"
        >
          View Cartel Graph →
        </Link>
      </div>
    </section>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function SectionLabel({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm">{icon}</span>
      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
        {title}
      </h4>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
