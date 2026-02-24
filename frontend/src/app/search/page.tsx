"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchTokens } from "@/lib/api";
import { SearchBar } from "@/components/SearchBar";
import Link from "next/link";
import { Suspense } from "react";

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchTokens(q),
    enabled: !!q,
  });

  return (
    <div className="space-y-8">
      <SearchBar />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-5 text-center">
          <p className="text-[var(--danger)] font-semibold">Search failed</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            {(error as Error).message}
          </p>
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-center text-[var(--muted)] py-10">
          No tokens found for &quot;{q}&quot;.
        </p>
      )}

      {data && data.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-4">
            🔎 Results for &quot;{q}&quot; ({data.length})
          </h2>
          <div className="space-y-3">
            {data.map((t) => (
              <Link
                key={t.mint}
                href={`/lineage/${t.mint}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)]
                           bg-[var(--card)] p-4 hover:border-[var(--accent)]/50 transition-colors animate-fade-in"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {t.name}{" "}
                    <span className="text-[var(--muted)] text-sm font-normal">
                      {t.symbol}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-[var(--muted)] truncate">
                    {t.mint}
                  </p>
                </div>
                <div className="text-right text-sm flex-shrink-0 ml-4">
                  {t.market_cap_usd != null && (
                    <p>
                      MCap{" "}
                      <strong>
                        ${t.market_cap_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </strong>
                    </p>
                  )}
                  {t.liquidity_usd != null && (
                    <p className="text-[var(--muted)]">
                      Liq ${t.liquidity_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
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
          <div className="h-10 w-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
