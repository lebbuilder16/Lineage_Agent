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
  const verdict = ai?.verdict_summary ?? null;
  const family = data.family_size ?? 1;
  const confidence = Math.round(data.confidence * 100);
  const patternStr =
    pattern && pattern !== "unknown" ? (PATTERN_LABEL[pattern] ?? pattern) : null;

  // trim verdict to fit tweet budget (~90 chars)
  const shortVerdict = verdict ? (verdict.length > 90 ? verdict.slice(0, 87) + "…" : verdict) : null;

  // ── Extreme risk (>=85) — confirmed extraction ──────────────────────────
  if (score !== null && score >= 85) {
    const lines = [
      `\u{1F6A8} ser GTFO — ${ticker} is a ${patternStr ?? "rug"} (${score}/100)`,
      ``,
      ...(shortVerdict ? [`\u201C${shortVerdict}\u201D`] : []),
      ...(family > 1 ? [`\u{1F9EC} ${family}-token clone farm. Same operator, different wallets.`] : []),
      ``,
      `receipts on-chain \u{1F447} don\u2019t say we didn\u2019t warn you`,
      url,
      `#Solana #DYOR #NotYourKeys`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── High risk (75-84) — strong signals ─────────────────────────────────
  if (score !== null && score >= 75) {
    const lines = [
      `\u26A0\uFE0F ${ticker} flagged ${score}/100 by Lineage Agent`,
      ``,
      ...(patternStr ? [`pattern: ${patternStr}`] : []),
      ...(shortVerdict ? [`\u201C${shortVerdict}\u201D`] : []),
      ...(family > 1 ? [`${family} tokens linked to same operator\u2019s ring` ] : []),
      ``,
      `full on-chain forensics \u2192`,
      url,
      `#Solana #MemeCoin #DYOR`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── Medium risk (50-74) — caution ───────────────────────────────────────
  if (score !== null && score >= 50) {
    const lines = [
      `\u{1F7E1} ${ticker} \u2014 sketchy signals (${score}/100)`,
      ``,
      ...(patternStr ? [`pattern: ${patternStr}`] : []),
      ...(family > 1
        ? [`${family}-token lineage detected \u00B7 ${confidence}% confidence`]
        : []),
      ``,
      `NFA but do your homework \u{1F447}`,
      url,
      `#Solana #DYOR`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // ── Low risk / no score ─────────────────────────────────────────────────
  const lines = [
    score !== null
      ? `\u2705 ${ticker} scanned clean \u2014 ${score}/100 risk`
      : `\u{1F50D} Lineage scan: ${ticker}`,
    ...(family > 1
      ? [`${family} tokens in family \u00B7 ${confidence}% lineage confidence`]
      : []),
    ``,
    `still DYOR though \u{1F64F}`,
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
