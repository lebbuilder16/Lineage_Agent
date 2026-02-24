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
import { ShareButton } from "@/components/ShareButton";
import { SkeletonLineageCard } from "@/components/skeletons/SkeletonLineageCard";
import { SkeletonTokenInfo } from "@/components/skeletons/SkeletonTokenInfo";
import { SkeletonDerivativeList } from "@/components/skeletons/SkeletonDerivativeList";
import { addToHistory } from "@/components/CommandPalette";
import { motion, AnimatePresence } from "framer-motion";
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

    // Save to ⌘K history when data loads
    if (data?.root && mint) {
      addToHistory(mint, data.root.name || data.root.symbol || mint.slice(0, 8));
    }
  }, [data, mint]);

  return (
    <div className="space-y-6">
      <SearchBar compact />

      {/* Loading — skeleton UI */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* NProgress-style top bar */}
          {progress && (
            <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          )}
          <SkeletonLineageCard />
          <SkeletonTokenInfo />
          <SkeletonDerivativeList count={3} />
          {progress && (
            <p className="text-xs text-center text-muted-foreground animate-pulse-subtle">
              {progress.step}
            </p>
          )}
        </motion.div>
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
      <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="space-y-6"
        >
          {/* Header row: summary card + share */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <LineageCard data={data} />
            </div>
            <div className="pt-1 shrink-0">
              <ShareButton data={data} />
            </div>
          </div>

          {/* Root token */}
          {data.root && (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-3"
            >
              <SectionHeader icon={<Crown className="h-4 w-4" />} title="Root Token" />
              <TokenInfo token={data.root} isRoot />
            </motion.section>
          )}

          {/* Family tree */}
          {data.derivatives.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <FamilyTree data={data} />
            </motion.div>
          )}

          {/* Derivatives */}
          {data.derivatives.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-3"
            >
              <SectionHeader
                icon={<List className="h-4 w-4" />}
                title="Derivatives"
                count={data.derivatives.length}
              />
              <div className="space-y-4">
                {data.derivatives.map((d: import("@/lib/api").DerivativeInfo, i: number) => (
                  <motion.div
                    key={d.mint}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.04, ease: "easeOut" }}
                    className="grid md:grid-cols-2 gap-3"
                  >
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
                      <p className="address mb-2">{d.mint}</p>
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
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </motion.div>
      )}
      </AnimatePresence>
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
