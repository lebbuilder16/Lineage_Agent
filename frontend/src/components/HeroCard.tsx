"use client";

import type { LineageResult } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/api";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/utils";
import { riskLevel } from "@/components/forensics/shared";
import { ShareButton } from "@/components/ShareButton";
import {
  Crown,
  ExternalLink,
  CheckCircle2,
  Copy,
  Loader2,
  Users,
  ArrowRight,
} from "lucide-react";

/* ── Price formatter ───────────────────────────────────────────────── */

function formatPrice(price: number): string {
  if (price === 0) return "$0";
  if (price >= 1)
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  const exp = Math.floor(Math.log10(Math.abs(price)));
  const decimals = Math.abs(exp) + 2;
  return `$${price.toFixed(Math.min(decimals, 10))}`;
}

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  data: LineageResult;
  analysis: AnalyzeResponse | null;
  analysisLoading: boolean;
}

export default function HeroCard({ data, analysis, analysisLoading }: Props) {
  // Always show the SCANNED token as primary identity — the user scanned this
  // token and wants to evaluate it.  root is only referenced as a "Clone of X"
  // pointer when the scanned token is not the original.
  const token = data.query_token ?? data.root;
  const root = data.root;
  const ai = analysis?.ai_analysis;
  const risk = riskLevel(ai?.risk_score ?? null);
  const isOriginal = data.query_is_root;
  // Show "Clone of X" strip when scanned token is a clone and root is known
  const showCloneOf = !isOriginal && root && root.mint !== token?.mint;

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-5 animate-fade-in hover:border-neon/20 transition-all">
      {/* ── Row 1: Avatar + Name + Badges + Share ──────────────────── */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative h-12 w-12 shrink-0">
          <div className="h-12 w-12 rounded-full overflow-hidden bg-muted">
            {token?.image_uri ? (
              <Image
                src={token.image_uri}
                alt={token.name || "Token"}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg text-muted-foreground">
                ?
              </div>
            )}
          </div>
          {isOriginal && (
            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon shadow-md">
              <Crown className="h-2.5 w-2.5 text-black" />
            </div>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="font-bold text-lg truncate">
              {token?.name || "Unknown"}
            </h2>
            {token?.symbol && (
              <span className="text-sm text-muted-foreground font-mono">
                ${token.symbol}
              </span>
            )}
            {/* Original / Clone pill */}
            {isOriginal ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Original
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                <Copy className="h-3 w-3" /> Clone
              </span>
            )}
            {data.zombie_alert && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                💀 Zombie
              </span>
            )}
            {data.factory_rhythm?.is_factory && (
              <span className="rounded-full border border-red-700/70 bg-red-950/50 px-2 py-0.5 text-[10px] font-bold text-red-300">
                🏭 Factory
              </span>
            )}
            {/* Family size */}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
              <Users className="h-3 w-3" />
              {data.family_size} token{data.family_size !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Mint address — always the scanned mint, never the root */}
          <p className="font-mono text-xs text-muted-foreground truncate">
            {data.mint}
          </p>

          {/* Clone-of reference — shows the original token this copies */}
          {showCloneOf && (
            <p className="flex items-center gap-1 text-[11px] text-zinc-500 mt-0.5 mb-1.5">
              <ArrowRight className="h-3 w-3 shrink-0 text-amber-500/70" />
              <span>Clone of </span>
              <a
                href={`/lineage/${root!.mint}`}
                className="font-medium text-amber-400/90 hover:text-amber-300 transition-colors truncate max-w-[180px]"
                title={root!.mint}
              >
                {root!.name || root!.symbol || `${root!.mint.slice(0, 8)}…`}
              </a>
              <span className="font-mono text-zinc-600 shrink-0">
                ({root!.mint.slice(0, 4)}…{root!.mint.slice(-4)})
              </span>
            </p>
          )}

          {/* Spacer when no clone-of strip */}
          {!showCloneOf && <div className="mb-2" />}

          {/* ── Row 2: Stats pills ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {token?.market_cap_usd != null && (
              <Pill label="MCap" value={formatUsd(token.market_cap_usd)} />
            )}
            {token?.liquidity_usd != null && (
              <Pill label="Liq" value={formatUsd(token.liquidity_usd)} />
            )}
            {token?.price_usd != null && (
              <Pill label="Price" value={formatPrice(token.price_usd)} />
            )}
            {token?.deployer && (
              <Pill
                label="Deployer"
                value={`${token.deployer.slice(0, 4)}…${token.deployer.slice(-4)}`}
                mono
                href={`https://solscan.io/account/${token.deployer}`}
              />
            )}
            {token?.dex_url && (
              <a
                href={token.dex_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:text-neon transition-colors"
              >
                DexScreener
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Share */}
        <div className="shrink-0 pt-1">
          <ShareButton data={data} />
        </div>
      </div>

      {/* ── Row 3: AI Risk Verdict Bar ─────────────────────────────── */}
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
        {analysisLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
            <span className="text-xs text-zinc-500">
              AI analysis in progress…
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden ml-2">
              <div className="h-full w-1/3 rounded-full bg-zinc-700 animate-pulse" />
            </div>
          </div>
        ) : ai ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {/* Risk bar */}
              <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    risk.bar,
                  )}
                  style={{ width: `${ai.risk_score ?? 0}%` }}
                />
              </div>
              {/* Score badge */}
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums",
                  risk.bg,
                  risk.border,
                  risk.color,
                )}
              >
                {ai.risk_score ?? "?"}/100
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  ai.confidence === "high"
                    ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                    : ai.confidence === "medium"
                      ? "border-amber-500/30 bg-amber-950/40 text-amber-400"
                      : "border-zinc-600 bg-zinc-900 text-zinc-400",
                )}
              >
                {ai.confidence}
              </span>
            </div>
            {/* 1-line verdict */}
            <p className={cn("text-xs leading-relaxed", risk.color)}>
              {ai.verdict_summary}
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">
            AI analysis unavailable for this token
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Pill helper ───────────────────────────────────────────────────── */

function Pill({
  label,
  value,
  mono = false,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{label}</span>{" "}
      <span className={cn("text-foreground font-medium", mono && "font-mono")}>
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-neon transition-colors"
      >
        {content}
      </a>
    );
  }
  return <span>{content}</span>;
}
