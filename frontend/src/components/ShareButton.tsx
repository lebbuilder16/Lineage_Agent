"use client";

import { useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { LineageResult, AnalyzeResponse } from "@/lib/api";

interface Props {
  data: LineageResult;
  analysis?: AnalyzeResponse | null;
}

const PATTERN_LABEL: Record<string, string> = {
  classic_rug: "classic rug",
  slow_rug: "slow rug",
  pump_dump: "pump & dump",
  coordinated_bundle: "coordinated bundle",
  factory_jito_bundle: "Jito factory bundle",
  serial_clone: "serial clone farm",
  insider_drain: "insider drain",
};

const DEATH_CLOCK_LABEL: Record<string, string> = {
  critical: "CRITICAL ⚡",
  high: "HIGH 🔴",
  medium: "MEDIUM 🟠",
  low: "LOW 🟢",
  first_rug: "FIRST RUG 💀",
  insufficient_data: "unknown",
};

// Contextual hashtag per rug pattern (in addition to #Solana #DYOR)
const PATTERN_HASHTAG: Record<string, string> = {
  classic_rug: "#RugPull",
  slow_rug: "#SlowRug",
  pump_dump: "#PumpAndDump",
  coordinated_bundle: "#BundleDump",
  factory_jito_bundle: "#JitoBundle",
  serial_clone: "#CloneFarm",
  insider_drain: "#InsiderDrain",
};

/** Strip AI-prefixes like "[FINANCIAL] ", "[COORDINATION] " etc. from key_findings entries. */
function stripFindingPrefix(s: string): string {
  return s.replace(/^\[[A-Z_]+\]\s*/, "");
}

/**
 * Return the first sentence of a string, truncated to maxLen chars.
 * Falls back to a hard truncation if no sentence boundary is found.
 */
function firstSentence(s: string, maxLen = 140): string {
  const end = s.search(/[.!?]/);
  const sentence = end !== -1 ? s.slice(0, end + 1) : s;
  return sentence.length > maxLen ? sentence.slice(0, maxLen - 1) + "…" : sentence;
}

function buildTweetText(
  data: LineageResult,
  analysis: AnalyzeResponse | null | undefined,
  url: string
): string {
  const token = data.query_token ?? data.root;
  const ticker = token?.symbol ? `$${token.symbol}` : (token?.name ?? "this token");
  const ai = analysis?.ai_analysis;
  const score = ai?.risk_score ?? null;
  const pattern = ai?.rug_pattern ?? null;
  const family = data.family_size ?? 1;
  const confidence = Math.round(data.confidence * 100);
  const patternStr =
    pattern && pattern !== "unknown" ? (PATTERN_LABEL[pattern] ?? pattern) : null;
  const patternHashtag =
    pattern && pattern !== "unknown" ? (PATTERN_HASHTAG[pattern] ?? null) : null;

  // ── AI-specific signals (token-contextual) ───────────────────────────────
  const keyFindings: string[] = ai?.key_findings ?? [];
  // Take up to 2 most incriminating findings, stripped of their prefix
  const finding1 = keyFindings[0] ? stripFindingPrefix(keyFindings[0]) : null;
  const finding2 = keyFindings[1] ? stripFindingPrefix(keyFindings[1]) : null;
  // conviction_chain: first sentence only, used as contextual footer
  const convictionFooter = ai?.conviction_chain
    ? firstSentence(ai.conviction_chain, 140)
    : null;
  // operator_hypothesis: first sentence, used instead of generic deployer line when available
  const opHypo = ai?.operator_hypothesis
    ? firstSentence(ai.operator_hypothesis, 120)
    : null;

  // ── Forensic on-chain signals ────────────────────────────────────────────
  const bundle = data.bundle_report;
  const bundleTeamCount =
    (bundle?.confirmed_team_wallets?.length ?? 0) +
    (bundle?.suspected_team_wallets?.length ?? 0);
  const solExtracted =
    bundle?.total_sol_extracted_confirmed ??
    data.sol_flow?.total_extracted_sol ??
    null;
  const usdExtracted = bundle?.total_usd_extracted ?? data.sol_flow?.total_extracted_usd ?? null;

  // Deployer history
  const rugCount =
    data.death_clock?.historical_rug_count ??
    data.deployer_profile?.rug_count ??
    null;
  const deathClockRisk = data.death_clock?.risk_level ?? null;
  const deathClockLabel =
    deathClockRisk && deathClockRisk !== "insufficient_data"
      ? (DEATH_CLOCK_LABEL[deathClockRisk] ?? deathClockRisk.toUpperCase())
      : null;

  // Operator impact (cross-wallet damage)
  const opImpact = data.operator_impact;
  const totalOpUsd = opImpact?.estimated_extracted_usd ?? null;

  // Additional signals
  const isFactory = data.factory_rhythm?.is_factory ?? false;
  const significantExtraction = solExtracted != null && solExtracted > 50;
  const zombieAlert = data.zombie_alert ?? null;
  const insiderDump = data.insider_sell?.verdict === "insider_dump";
  const coordSell = bundle?.coordinated_sell_detected ?? false;
  const crossChain = (data.sol_flow?.cross_chain_exits?.length ?? 0) > 0;

  // ── helpers ─────────────────────────────────────────────────────────────
  const fmtSol = (n: number) => `${n.toFixed(1)} SOL`;
  const fmtUsd = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `$${Math.round(n / 1_000)}K`
      : `$${Math.round(n)}`;

  // ── Extreme risk (>=85) — confirmed extraction ──────────────────────────
  if (score !== null && score >= 85) {
    const extractionStr =
      usdExtracted != null
        ? `${fmtUsd(usdExtracted)} extracted on-chain`
        : solExtracted != null
        ? `${fmtSol(solExtracted)} extracted on-chain`
        : null;

    // Deployer line: prefer operator hypothesis (token-specific) over generic rug count
    const deployerLine = opHypo
      ? `🕵️ ${opHypo}`
      : rugCount != null && rugCount > 0
        ? `☠️ Deployer: ${rugCount} prior rug${rugCount > 1 ? "s" : ""}` +
          (totalOpUsd != null ? ` · ${fmtUsd(totalOpUsd)} total damage` : "")
        : null;

    // Footer: conviction_chain first sentence (token-specific) or fallback
    const footer = convictionFooter ?? "receipts on-chain — don't say we didn't warn you";

    const lines = [
      `🚨 ${ticker} — CONFIRMED ${patternStr?.toUpperCase() ?? "RUG"} · ${score}/100`,
      ``,
      // AI key findings (most incriminating, token-specific)
      ...(finding1 ? [`→ ${finding1}`] : []),
      ...(finding2 ? [`→ ${finding2}`] : []),
      // On-chain extraction figures
      ...(extractionStr && !finding1 ? [`💸 ${extractionStr}`] : []),
      ...(extractionStr && finding1 ? [`💸 ${extractionStr}`] : []),
      // Coordinated sell / cross-chain exit
      ...(coordSell ? [`⚡ Coordinated sell: multiple wallets exited within 5 slots`] : []),
      ...(crossChain ? [`🌉 Cross-chain exit detected`] : []),
      // Bundle team wallets (only if not already covered by finding lines)
      ...(bundleTeamCount > 0 && !finding1
        ? [`📦 ${bundleTeamCount} coordinated team wallet${bundleTeamCount > 1 ? "s" : ""} confirmed`]
        : []),
      // Deployer line
      ...(deployerLine ? [deployerLine] : []),
      // Clone family
      ...(family > 1 ? [`🧬 ${family}-token clone farm · same operator`] : []),
      // Zombie resurrection
      ...(zombieAlert
        ? [`💀 Resurrection of previously rugged $${zombieAlert.original_name} detected`]
        : []),
      // Insider dump
      ...(insiderDump ? [`🩸 Deployer wallet confirmed emptied (insider dump)`] : []),
      ``,
      footer,
      url,
      `#Solana #DYOR${patternHashtag ? ` ${patternHashtag}` : " #NotYourKeys"}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── High risk (75-84) — strong signals ─────────────────────────────────
  if (score !== null && score >= 75) {
    const footer = convictionFooter ?? "full on-chain forensics →";

    const lines = [
      `⚠️ ${ticker} — HIGH RISK · ${score}/100`,
      ``,
      ...(patternStr ? [`🎭 Pattern: ${patternStr}`] : []),
      // AI findings take priority over generic signals
      ...(finding1 ? [`→ ${finding1}`] : [
        ...(deathClockLabel ? [`⏱️ Death clock: ${deathClockLabel}`] : []),
        ...(bundleTeamCount > 0
          ? [`📦 ${bundleTeamCount} suspicious wallet${bundleTeamCount > 1 ? "s" : ""} in launch bundle`]
          : []),
        ...(rugCount != null && rugCount > 0
          ? [`☠️ ${rugCount} prior rug${rugCount > 1 ? "s" : ""} by this deployer`]
          : []),
      ]),
      ...(finding2 ? [`→ ${finding2}`] : []),
      ...(finding1 && deathClockLabel ? [`⏱️ Death clock: ${deathClockLabel}`] : []),
      ...(zombieAlert
        ? [`💀 Resurrection of $${zombieAlert.original_name} detected`]
        : []),
      ...(insiderDump ? [`🩸 Insider dump confirmed`] : []),
      ...(family > 1
        ? [`🧬 ${family}-token family · ${confidence}% lineage confidence`]
        : []),
      ``,
      footer,
      url,
      `#Solana #MemeCoin #DYOR${patternHashtag ? ` ${patternHashtag}` : ""}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── Medium risk (50-74) — caution ───────────────────────────────────────
  if (score !== null && score >= 50) {
    const footer = convictionFooter ?? "NFA — do your homework 👇";

    const lines = [
      `🟡 ${ticker} — SKETCHY · ${score}/100`,
      ``,
      ...(patternStr ? [`🎭 ${patternStr}`] : []),
      ...(finding1 ? [`→ ${finding1}`] : [
        ...(rugCount != null && rugCount > 0
          ? [`🔗 Deployer linked to ${rugCount} previous rug${rugCount > 1 ? "s" : ""}` +
              (totalOpUsd != null ? ` · ${fmtUsd(totalOpUsd)} total damage` : "")]
          : []),
        ...(isFactory ? [`🏭 Factory deployer detected — scripted launches`] : []),
        ...(significantExtraction ? [`🔴 ${fmtSol(solExtracted!)} moved out of project wallets`] : []),
      ]),
      ...(finding2 ? [`→ ${finding2}`] : []),
      ...(family > 1
        ? [`🧬 ${family}-token lineage · ${confidence}% confidence`]
        : []),
      ``,
      footer,
      url,
      `#Solana #DYOR${patternHashtag ? ` ${patternHashtag}` : ""}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── Low risk / no score ─────────────────────────────────────────────────
  const noBundle = !bundle || bundle.overall_verdict === "early_buyers_no_link_proven";
  const lines = [
    score !== null
      ? `✅ ${ticker} — ${score}/100 · no major red flags`
      : `🔍 Lineage scan complete: ${ticker}`,
    ``,
    ...(family > 1
      ? [`🧬 ${family} tokens in family · ${confidence}% lineage confidence`]
      : [`🧬 Original token — no known clones detected`]),
    ...(noBundle ? [`📦 No suspicious bundle activity`] : []),
    ``,
    `still DYOR though 🙏`,
    url,
    `#Solana #DYOR`,
  ];
  return encodeURIComponent(lines.join("\n"));
}

export function ShareButton({ data, analysis }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const url = typeof window !== "undefined" ? window.location.href : "";
  const tweetText = buildTweetText(data, analysis, url);
  const tweetUrl = `https://x.com/intent/tweet?text=${tweetText}`;

  // Farcaster / Warpcast — crypto-native community platform
  const farcasterText = tweetText; // same message, same encoding
  const farcasterUrl = `https://warpcast.com/~/compose?text=${farcasterText}&embeds[]=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium min-h-[44px] sm:min-h-0",
          "border border-white/10 bg-background text-muted-foreground",
          "hover:text-foreground hover:bg-white/5 transition-colors",
          open && "bg-white/5 text-foreground"
        )}
        aria-label="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />

          {isMobile ? (
            /* ── Bottom sheet (mobile) ─────────────────────────── */
            <div
              className="fixed bottom-0 inset-x-0 z-[56] rounded-t-2xl border-t border-white/10 bg-[#0f0f0f] shadow-2xl overflow-hidden"
              role="menu"
              aria-label="Share options"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2 pt-1">
                <p className="text-xs text-white/40 font-medium uppercase tracking-widest">Share</p>
                <button onClick={() => setOpen(false)} className="p-2 text-white/40 hover:text-white transition-colors" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="pb-safe-area pb-8">
                <button onClick={copyLink} role="menuitem" className="flex w-full items-center gap-3 px-4 py-3.5 text-sm hover:bg-white/5 transition-colors text-left min-h-[52px]">
                  {copied ? <Check className="h-5 w-5 text-neon shrink-0" /> : <Copy className="h-5 w-5 text-muted-foreground shrink-0" />}
                  <span>{copied ? "Copied!" : "Copy link"}</span>
                </button>
                <div className="border-t border-white/5" />
                <a href={tweetUrl} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-white/5 transition-colors min-h-[52px]">
                  <svg className="h-5 w-5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.402 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  <span>Share on X</span>
                </a>
                <div className="border-t border-white/5" />
                <a href={farcasterUrl} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-white/5 transition-colors min-h-[52px]">
                  <svg className="h-5 w-5 text-muted-foreground shrink-0" viewBox="0 0 1000 1000" fill="currentColor" aria-hidden="true"><path d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z" /><path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" /><path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" /></svg>
                  <span>Share on Farcaster</span>
                </a>
              </div>
            </div>
          ) : (
            /* ── Dropdown (desktop) ────────────────────────────── */
            <div
              className="absolute right-0 top-10 z-[56] w-52 rounded-xl border border-white/10 bg-[#0f0f0f] shadow-2xl animate-fade-in-scale overflow-hidden"
              role="menu"
              aria-label="Share options"
            >
              <button onClick={copyLink} role="menuitem" className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors text-left">
                {copied ? <Check className="h-4 w-4 text-neon" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                <span>{copied ? "Copied!" : "Copy link"}</span>
              </button>
              <div className="border-t border-white/5" />
              <a href={tweetUrl} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors">
                <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.402 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                <span>Share on X</span>
              </a>
              <div className="border-t border-white/5" />
              <a href={farcasterUrl} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors">
                <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 1000 1000" fill="currentColor" aria-hidden="true"><path d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z" /><path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" /><path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" /></svg>
                <span>Share on Farcaster</span>
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
