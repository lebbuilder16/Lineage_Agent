"use client";

/**
 * /compare — Side-by-side token comparison
 *
 * Uses GET /compare?mint_a=…&mint_b=… from the backend.
 * Displays similarity scores, shared deployer detection, family membership,
 * and an overall verdict.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight, Search, ExternalLink } from "lucide-react";
import { fetchCompare, type TokenCompareResult, type TokenMetadata } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ── Verdict badge ─────────────────────────────────────────────────────── */
const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  // Backend-canonical values (api.py Literal type)
  clone:             { label: "Clone detected",   color: "text-red-400 border-red-500/30 bg-red-500/10" },
  identical_operator:{ label: "Same operator",    color: "text-red-400 border-red-500/30 bg-red-500/10" },
  related:           { label: "Related tokens",   color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  unrelated:         { label: "Unrelated",        color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  // Legacy / alternate labels kept for backwards compatibility
  same_family:       { label: "Same family",      color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  similar:           { label: "Similar tokens",   color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg = VERDICT_CONFIG[verdict] ?? { label: verdict, color: "text-zinc-400 border-zinc-600 bg-zinc-800" };
  return (
    <span className={cn("rounded-full border px-3 py-1 text-sm font-bold", cfg.color)}>
      {cfg.label}
    </span>
  );
}

/* ── Score bar ─────────────────────────────────────────────────────────── */
function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : pct >= 25 ? "bg-yellow-400" : "bg-zinc-600";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-medium text-zinc-200">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Token card ────────────────────────────────────────────────────────── */
function TokenCard({ token }: { token: TokenMetadata | null }) {
  if (!token) return <div className="rounded-xl border border-white/5 bg-card p-6 text-center text-sm text-muted-foreground">No data</div>;
  return (
    <div className="rounded-xl border border-white/5 bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        {token.image_uri ? (
          <Image
            src={token.image_uri}
            alt={token.name || "token"}
            width={48}
            height={48}
            className="rounded-lg object-cover w-12 h-12 border border-white/10"
            unoptimized
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-2xl">🪙</div>
        )}
        <div className="min-w-0">
          <p className="font-display font-bold truncate">{token.name || "Unknown"}</p>
          <p className="text-xs text-muted-foreground uppercase">{token.symbol}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {token.market_cap_usd != null && (
          <div>
            <p className="text-muted-foreground">Market cap</p>
            <p className="font-medium">${token.market_cap_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        )}
        {token.liquidity_usd != null && (
          <div>
            <p className="text-muted-foreground">Liquidity</p>
            <p className="font-medium">${token.liquidity_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        )}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground truncate">{token.mint}</div>
      <div className="flex gap-2">
        <Link
          href={`/lineage/${token.mint}`}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium hover:bg-white/10 transition-colors"
        >
          Full analysis
        </Link>
        {token.dex_url && (
          <a
            href={token.dex_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function ComparePage() {
  const [mintA, setMintA] = useState("");
  const [mintB, setMintB] = useState("");
  const [result, setResult] = useState<TokenCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare() {
    const a = mintA.trim();
    const b = mintB.trim();
    if (!a || !b) { setError("Enter both mint addresses."); return; }
    if (a === b) { setError("Enter two different mint addresses."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchCompare(a, b);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-[#53E9F6]" />
          Compare tokens
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Detect clones, family membership, and similarity between two Solana tokens.
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-white/5 bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token A</label>
            <input
              value={mintA}
              onChange={(e) => setMintA(e.target.value)}
              placeholder="Mint address…"
              className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm font-mono placeholder:text-zinc-600 focus:border-[#622EC3]/60 focus:outline-none transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token B</label>
            <input
              value={mintB}
              onChange={(e) => setMintB(e.target.value)}
              placeholder="Mint address…"
              className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm font-mono placeholder:text-zinc-600 focus:border-[#622EC3]/60 focus:outline-none transition-colors"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={handleCompare}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#622EC3] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#7B45E0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_12px_rgba(98,46,195,0.4)]"
        >
          {loading ? (
            <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Verdict */}
          <div className="rounded-xl border border-white/5 bg-card p-5 flex flex-col items-center gap-3 text-center">
            <VerdictBadge verdict={result.verdict} />
            <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              {result.same_deployer && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  ⚠️ Same deployer
                </span>
              )}
              {result.same_family && (
                <span className="flex items-center gap-1 text-orange-400 font-medium">
                  🔗 Same family
                </span>
              )}
              {result.metadata_uri_match && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  🔗 Same metadata URI
                </span>
              )}
              {result.image_url_match && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  🖼 Same image URL
                </span>
              )}
              <span>Composite score: <strong className="text-zinc-200">{Math.round(result.composite_score * 100)}%</strong></span>
            </div>
          </div>

          {/* Token cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <TokenCard token={result.token_a} />
            <TokenCard token={result.token_b} />
          </div>

          {/* Similarity breakdown */}
          <div className="rounded-xl border border-white/5 bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">Similarity breakdown</h2>
            <ScoreBar label="Name similarity" value={result.name_similarity} />
            <ScoreBar label="Symbol similarity" value={result.symbol_similarity} />
            <ScoreBar
              label={
                result.image_similarity === -2
                  ? "Image similarity (fetch failed)"
                  : result.image_similarity < 0
                  ? "Image similarity (no image)"
                  : "Image similarity"
              }
              value={Math.max(0, result.image_similarity)}
            />
            <ScoreBar
              label="Temporal proximity"
              value={1 - 2 * Math.abs(result.temporal_score - 0.5)}
            />
            <div className="border-t border-white/5 pt-3">
              <ScoreBar label="Composite score" value={result.composite_score} />
            </div>
          </div>

          {/* Extra signals */}
          {(result.metadata_uri_match || result.image_url_match || result.same_token_program || result.verdict_reasons.length > 0) && (
            <div className="rounded-xl border border-white/5 bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300">Signals</h2>
              <div className="flex flex-wrap gap-2">
                {result.metadata_uri_match && (
                  <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-400">🔗 Same metadata URI</span>
                )}
                {result.image_url_match && (
                  <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-400">🖼 Same image URL</span>
                )}
                {result.same_token_program && (
                  <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 px-2.5 py-1 text-xs font-medium text-yellow-400">⚙ Same custom program</span>
                )}
                <span className="rounded-full bg-zinc-800 border border-white/5 px-2.5 py-1 text-xs text-zinc-400">
                  {result.temporal_score >= 0.6
                    ? `Token A is older (temporal score ${Math.round(result.temporal_score * 100)}%)`
                    : result.temporal_score <= 0.4
                    ? `Token B is older (temporal score ${Math.round((1 - result.temporal_score) * 100)}%)`
                    : "Similar age"}
                </span>
              </div>
              {result.verdict_reasons.length > 0 && (
                <ul className="space-y-1 text-xs text-zinc-400">
                  {result.verdict_reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[#53E9F6]/60">›</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
