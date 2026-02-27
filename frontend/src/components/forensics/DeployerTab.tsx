"use client";

import { useState } from "react";
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
  RugBar,
  CONFIDENCE_CONFIG,
  SIGNAL_COLORS,
  SIGNAL_LABELS,
} from "@/components/forensics/shared";
import {
  Building2,
  Skull,
  Cpu,
  Network,
  ExternalLink,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ── Shared style constants ─────────────────────────────────────────── */

const SECTION = "rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-4";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-3";

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
      <div className={cn(SECTION, "text-center py-10")}>
        <Building2 className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No deployer intelligence available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasProfile && <DeployerProfileSection profile={profile!} />}
      {hasClock && <DeathClockSection forecast={deathClock!} />}
      {hasFactory && <FactorySection report={factory!} />}
      {hasCartel && <CartelSection report={cartel!} />}
    </div>
  );
}

/* ── Deployer Profile ──────────────────────────────────────────────── */

function DeployerProfileSection({ profile }: { profile: DeployerProfile }) {
  const [showAllTokens, setShowAllTokens] = useState(false);
  const visibleTokens = showAllTokens ? profile.tokens : profile.tokens.slice(0, 5);

  return (
    <div className={SECTION}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-400 shrink-0" />
          <p className={cn(LABEL, "mb-0")}>Deployer Profile</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <a
            href={`https://solscan.io/account/${profile.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {profile.address.slice(0, 6)}…{profile.address.slice(-4)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
          <span className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
            CONFIDENCE_CONFIG[profile.confidence].badge,
          )}>
            {CONFIDENCE_CONFIG[profile.confidence].label}
          </span>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatPill label="Launched" value={String(profile.total_tokens_launched)} />
        <StatPill label="Rugs" value={String(profile.rug_count)} danger />
        <StatPill label="Active" value={String(profile.active_tokens)} />
        {profile.avg_lifespan_days != null && (
          <StatPill label="Avg lifespan" value={`${profile.avg_lifespan_days.toFixed(1)}d`} />
        )}
      </div>

      <RugBar rugRate={profile.rug_rate_pct} />

      {/* Preferred narrative + activity */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {profile.preferred_narrative && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Preferred narrative:</span>
            <span className="rounded-md border border-violet-700/30 bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium text-violet-300 capitalize">
              {profile.preferred_narrative}
            </span>
          </div>
        )}
        {(profile.first_seen || profile.last_seen) && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono">
              {profile.first_seen
                ? new Date(profile.first_seen).toLocaleDateString()
                : "?"}
            </span>
            <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
            <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono">
              {profile.last_seen
                ? new Date(profile.last_seen).toLocaleDateString()
                : "present"}
            </span>
          </div>
        )}
      </div>

      {/* Recent tokens mini-table */}
      {profile.tokens.length > 0 && (
        <div className="mt-4">
          <p className={LABEL}>Recent tokens</p>
          <div className="space-y-1">
            {visibleTokens.map((t) => (
              <div
                key={t.mint}
                className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
              >
                <a
                  href={`/lineage/${t.mint}`}
                  className="truncate text-xs font-medium text-zinc-200 hover:text-sky-300 transition-colors max-w-[160px]"
                >
                  {t.name || t.symbol || t.mint.slice(0, 8)}
                </a>
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {t.rugged_at ? (
                    <span className="rounded border border-red-700/40 bg-red-950/50 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                      RUGGED
                    </span>
                  ) : (
                    <span className="rounded border border-emerald-700/30 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      ACTIVE
                    </span>
                  )}
                  {t.mcap_usd != null && (
                    <span className="text-[10px] text-zinc-500 tabular-nums">
                      {formatUsd(t.mcap_usd)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {profile.tokens.length > 5 && (
            <button
              onClick={() => setShowAllTokens((p) => !p)}
              className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showAllTokens ? (
                <><ChevronUp className="h-3 w-3" /> Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> {profile.tokens.length - 5} more tokens</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Death Clock ───────────────────────────────────────────────────── */

const RISK_CONFIG = {
  low: { bar: "bg-emerald-500", text: "text-emerald-400", badge: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300", label: "Low Risk", widthPct: 15 },
  medium: { bar: "bg-yellow-400", text: "text-yellow-400", badge: "border-yellow-500/40 bg-yellow-950/50 text-yellow-300", label: "Medium Risk", widthPct: 45 },
  high: { bar: "bg-orange-500", text: "text-orange-400", badge: "border-orange-500/40 bg-orange-950/50 text-orange-300", label: "High Risk", widthPct: 72 },
  critical: { bar: "bg-red-500", text: "text-red-400", badge: "border-red-500/40 bg-red-950/50 text-red-300", label: "Critical", widthPct: 95 },
  first_rug: { bar: "bg-amber-400", text: "text-amber-400", badge: "border-amber-500/40 bg-amber-950/50 text-amber-300", label: "1st Rug on Record", widthPct: 50 },
  insufficient_data: { bar: "bg-zinc-600", text: "text-zinc-400", badge: "border-zinc-700 bg-zinc-900 text-zinc-400", label: "Insufficient Data", widthPct: 0 },
} as const;

function DeathClockSection({ forecast }: { forecast: DeathClockForecast }) {
  const cfg = RISK_CONFIG[forecast.risk_level] ?? RISK_CONFIG.insufficient_data;
  const elapsedPct = Math.min(
    (forecast.elapsed_hours / (forecast.median_rug_hours || 1)) * 100,
    100,
  );

  return (
    <div className={SECTION}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skull className="h-4 w-4 text-zinc-400 shrink-0" />
          <p className={cn(LABEL, "mb-0")}>Death Clock</p>
        </div>
        <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Zone-banded timeline bar */}
      <div className="relative h-4 rounded-full overflow-hidden mb-1.5" style={{ background: "linear-gradient(to right, #14532d 0%, #14532d 25%, #78350f 25%, #78350f 60%, #7c2d12 60%, #7c2d12 85%, #450a0a 85%, #450a0a 100%)" }}>
        {/* Filled progress */}
        <div
          className={cn("absolute left-0 top-0 h-full opacity-60", cfg.bar)}
          style={{ width: `${cfg.widthPct}%` }}
        />
        {/* Milestone ticks */}
        {[25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute top-0 bottom-0 w-px bg-zinc-950/60"
            style={{ left: `${p}%` }}
          />
        ))}
        {/* Elapsed cursor */}
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-white/90 rounded-full"
          style={{ left: `calc(${elapsedPct}% - 1px)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600 mb-3">
        <span>Launch</span>
        <span>Median rug ({Math.round(forecast.median_rug_hours / 24)}d)</span>
      </div>

      <p className="text-xs text-zinc-300 leading-relaxed">
        <span className="font-semibold text-zinc-100">{Math.round(forecast.elapsed_hours)}h elapsed</span>
        {" · "}
        based on{" "}
        <span className="font-semibold text-zinc-100">{forecast.historical_rug_count} prior rugs</span>
        {forecast.predicted_window_start && forecast.predicted_window_end ? (
          <>
            {" · predicted window: "}
            <span className="text-zinc-200">
              {fmtDate(forecast.predicted_window_start)} – {fmtDate(forecast.predicted_window_end)}
            </span>
          </>
        ) : (
          forecast.confidence_note ? (
            <span className="text-zinc-500"> · {forecast.confidence_note}</span>
          ) : null
        )}
      </p>
    </div>
  );
}

/* ── Factory Rhythm ────────────────────────────────────────────────── */

function FactorySection({ report }: { report: FactoryRhythmReport }) {
  const pct = Math.round(report.factory_score * 100);
  const isFactory = report.is_factory;

  return (
    <div className={SECTION}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-zinc-400 shrink-0" />
          <p className={cn(LABEL, "mb-0")}>Factory Rhythm</p>
        </div>
        <div className="flex items-center gap-2">
          {/* wide gauge bar */}
          <div className="w-20 h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", isFactory ? "bg-red-500" : "bg-zinc-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={cn("text-xs font-bold tabular-nums", isFactory ? "text-red-400" : "text-zinc-500")}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Alert banner if scripted */}
      {isFactory && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2 mb-3">
          <Cpu className="h-4 w-4 text-red-400 shrink-0" />
          <div>
            <span className="text-xs font-bold text-red-300 mr-1.5">Scripted Deployer</span>
            <span className="text-[11px] text-red-400/80">Automated launch pattern confirmed.</span>
          </div>
        </div>
      )}

      {/* 2×2 stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatPill label="Tokens" value={String(report.tokens_launched)} />
        <StatPill
          label="Deploy interval"
          value={report.median_interval_hours < 24
            ? `${report.median_interval_hours.toFixed(1)}h`
            : `${(report.median_interval_hours / 24).toFixed(1)}d`}
        />
        <StatPill label="Naming pattern" value={report.naming_pattern} />
        <StatPill label="Regularity" value={`${Math.round(report.regularity_score * 100)}%`} />
      </div>
    </div>
  );
}

/* ── Cartel Detection ──────────────────────────────────────────────── */

function CartelSection({ report }: { report: CartelReport }) {
  const c = report.deployer_community!;
  const cfg = CONFIDENCE_CONFIG[c.confidence];
  const signalColor =
    SIGNAL_COLORS[c.strongest_signal] ??
    "bg-zinc-900 text-zinc-400 border-zinc-700";
  const signalLabel = SIGNAL_LABELS[c.strongest_signal] ?? c.strongest_signal;
  const uniqueSignals = Array.from(new Set(c.edges.map((e) => e.signal_type)));

  return (
    <div className={SECTION}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-violet-400 shrink-0" />
          <p className={cn(LABEL, "mb-0")}>Cartel Detection</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", signalColor)}>
            {signalLabel}
          </span>
          <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", cfg.badge)}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* 3-col metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatPill label="Wallets" value={String(c.wallets.length)} />
        <StatPill label="Tokens" value={String(c.total_tokens_launched)} />
        <StatPill label="Rugs" value={String(c.total_rugs)} danger />
        <StatPill label="Extracted" value={formatUsd(c.estimated_extracted_usd)} danger />
      </div>

      {/* Signal chips */}
      {uniqueSignals.length > 0 && (
        <div className="mb-3">
          <p className={LABEL}>Signal breakdown</p>
          <div className="flex flex-wrap gap-1.5">
            {uniqueSignals.map((s) => (
              <span
                key={s}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                  SIGNAL_COLORS[s] ?? "bg-zinc-900 text-zinc-400 border-zinc-700",
                )}
              >
                {SIGNAL_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      {c.active_since && (
        <p className="mb-3 text-[11px] text-zinc-500">
          Active since:{" "}
          <span className="text-zinc-400 font-medium">
            {new Date(c.active_since).toLocaleDateString()}
          </span>
        </p>
      )}

      <div className="border-t border-zinc-800/60 pt-3">
        <Link
          href={`/cartel/${c.community_id}`}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-violet-700/40 bg-violet-950/30 py-2.5 text-xs font-semibold text-violet-300 hover:bg-violet-950/50 hover:border-violet-600/50 transition-colors"
        >
          <Network className="h-3.5 w-3.5" />
          View Cartel Graph
        </Link>
      </div>
    </div>
  );
}

/* ── StatPill ───────────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
      <span className={cn(
        "text-sm font-bold tabular-nums leading-tight truncate",
        danger ? "text-red-300" : "text-zinc-100",
      )}>
        {value}
      </span>
      <span className="text-[10px] text-zinc-500 leading-tight">{label}</span>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
