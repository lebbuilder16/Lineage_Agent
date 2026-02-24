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
import { AlertCircle, RefreshCw, Crown, List, ChevronRight, TrendingUp, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LineagePage() {
  const params = useParams<{ mint: string }>();
  const mint = params.mint;

  const { data, isLoading, error, progress, analyze } = useLineageWS();

  useEffect(() => {
    if (mint) analyze(mint);
  }, [mint, analyze]);

  useEffect(() => {
    const name = data?.root?.name || data?.query_token?.name;
    document.title = name
      ? `${name} — Lineage Agent`
      : `Lineage: ${mint?.slice(0, 8)}... — Lineage Agent`;
  }, [data, mint]);

  return (
    <div className="space-y-6">
      <SearchBar compact />

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center gap-4 py-24">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          {progress && (
            <div className="w-72 space-y-2">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {progress.step}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <div className="flex justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <p className="font-medium text-sm">Analysis failed</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
          <button
            onClick={() => mint && analyze(mint)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-colors"
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary */}
          <LineageCard data={data} />

          {/* Root token */}
          {data.root && (
            <section className="space-y-3">
              <SectionHeader icon={<Crown className="h-4 w-4" />} title="Root Token" />
              <TokenInfo token={data.root} isRoot />
            </section>
          )}

          {/* Family tree */}
          {data.derivatives.length > 0 && <FamilyTree data={data} />}

          {/* Derivatives */}
          {data.derivatives.length > 0 && (
            <section className="space-y-3">
              <SectionHeader
                icon={<List className="h-4 w-4" />}
                title="Derivatives"
                count={data.derivatives.length}
              />
              <div className="space-y-4 stagger-children">
                {data.derivatives.map((d: import("@/lib/api").DerivativeInfo) => (
                  <div key={d.mint} className="grid md:grid-cols-2 gap-3 animate-slide-up">
                    <Link
                      href={`/lineage/${d.mint}`}
                      className="group rounded-lg border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all duration-150 block"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm truncate">
                          {d.name || d.symbol || d.mint.slice(0, 12)}
                        </h4>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground truncate mb-2">
                        {d.mint}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {d.market_cap_usd != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <strong className="text-foreground">
                              ${d.market_cap_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </strong>
                          </span>
                        )}
                        {d.liquidity_usd != null && (
                          <span className="flex items-center gap-1">
                            <Droplets className="h-3 w-3" />
                            <strong className="text-foreground">
                              ${d.liquidity_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </strong>
                          </span>
                        )}
                      </div>
                    </Link>
                    <EvidencePanel evidence={d.evidence} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="font-semibold text-sm">{title}</h2>
      {count != null && (
        <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}
