"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchTokens } from "@/lib/api";
import { SearchBar } from "@/components/SearchBar";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { Search, TrendingUp, Droplets, ChevronRight, AlertCircle } from "lucide-react";

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchTokens(q),
    enabled: !!q,
  });

  useEffect(() => {
    document.title = q ? `"${q}" — Lineage Agent` : "Search — Lineage Agent";
  }, [q]);

  return (
    <div className="space-y-6" aria-live="polite">
      <SearchBar compact />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Searching...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Search failed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(error as Error).message}
            </p>
          </div>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No tokens found for{" "}
            <span className="font-medium text-foreground">&quot;{q}&quot;</span>
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data.length}</span> result{data.length !== 1 ? "s" : ""} for &quot;{q}&quot;
          </p>
          <div className="space-y-2 stagger-children">
            {data.map((t) => (
              <Link
                key={t.mint}
                href={`/lineage/${t.mint}`}
                className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4
                           hover:border-primary/30 hover:shadow-sm transition-all duration-150 animate-slide-up"
              >
                {/* Token avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                  {t.symbol?.slice(0, 2) || "?"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {t.name}{" "}
                    <span className="text-muted-foreground font-normal">{t.symbol}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground truncate">
                    {t.mint}
                  </p>
                </div>

                {/* Stats row — always visible, horizontal scroll on mobile */}
                <div className="flex items-center gap-3 overflow-x-auto text-xs text-muted-foreground shrink-0 no-scrollbar pb-0.5">
                  {t.market_cap_usd != null && (
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <TrendingUp className="h-3 w-3 shrink-0" />
                      <strong className="text-foreground">
                        ${t.market_cap_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </strong>
                    </span>
                  )}
                  {t.liquidity_usd != null && (
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Droplets className="h-3 w-3 shrink-0" />
                      <strong className="text-foreground">
                        ${t.liquidity_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </strong>
                    </span>
                  )}
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
