"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useLineageWS } from "@/lib/useLineageWS";
import { LineageCard } from "@/components/LineageCard";
import { TokenInfo } from "@/components/TokenInfo";
import { EvidencePanel } from "@/components/EvidencePanel";
import { FamilyTree } from "@/components/FamilyTree";
import { SearchBar } from "@/components/SearchBar";

export default function LineagePage() {
  const params = useParams<{ mint: string }>();
  const mint = params.mint;

  const { data, isLoading, error, progress, analyze } = useLineageWS();

  // Start analysis when mint changes
  useEffect(() => {
    if (mint) analyze(mint);
  }, [mint, analyze]);

  useEffect(() => {
    const name = data?.root?.name || data?.query_token?.name;
    document.title = name
      ? `${name} Lineage | Meme Lineage Agent`
      : `Lineage: ${mint?.slice(0, 8)}… | Meme Lineage Agent`;
  }, [data, mint]);

  return (
    <div className="space-y-8">
      <SearchBar />

      {isLoading && (
        <div className="flex flex-col items-center gap-3 py-20">
          <div className="h-10 w-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
          {progress && (
            <div className="w-64 space-y-1">
              <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-[var(--muted)]">
                {progress.step}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-5 text-center">
          <p className="text-[var(--danger)] font-semibold">Analysis failed</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            {error}
          </p>
          <button
            onClick={() => mint && analyze(mint)}
            className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Summary card */}
          <LineageCard data={data} />

          {/* Root token info */}
          {data.root && (
            <section>
              <h2 className="font-bold text-lg mb-3">👑 Root Token</h2>
              <TokenInfo token={data.root} isRoot />
            </section>
          )}

          {/* Family tree visualisation */}
          {data.derivatives.length > 0 && <FamilyTree data={data} />}

          {/* Derivatives list */}
          {data.derivatives.length > 0 && (
            <section>
              <h2 className="font-bold text-lg mb-3">
                📋 Derivatives / Clones ({data.derivatives.length})
              </h2>
              <div className="space-y-4">
                {data.derivatives.map((d: import("@/lib/api").DerivativeInfo) => (
                  <div
                    key={d.mint}
                    className="grid md:grid-cols-2 gap-4"
                  >
                    <Link
                      href={`/lineage/${d.mint}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 animate-fade-in hover:border-[var(--accent)]/50 transition-colors block"
                    >
                      <h4 className="font-semibold truncate">
                        {d.name || d.symbol || d.mint.slice(0, 12)}
                        <span className="text-xs text-[var(--accent)] ml-2">→ Analyze</span>
                      </h4>
                      <p className="font-mono text-xs text-[var(--muted)] truncate">
                        {d.mint}
                      </p>
                      <div className="flex gap-4 text-sm mt-2">
                        {d.market_cap_usd != null && (
                          <span>
                            MCap:{" "}
                            <strong>
                              ${d.market_cap_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </strong>
                          </span>
                        )}
                        {d.liquidity_usd != null && (
                          <span>
                            Liq:{" "}
                            <strong>
                              ${d.liquidity_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </strong>
                          </span>
                        )}
                      </div>
                    </Link>
                    <EvidencePanel
                      evidence={d.evidence}
                      name={`Evidence – ${d.name || d.mint.slice(0, 8)}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
