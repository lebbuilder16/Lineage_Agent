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
import ZombieAlert from "@/components/forensics/ZombieAlert";
import DeathClock from "@/components/forensics/DeathClock";
import OperatorFingerprint from "@/components/forensics/OperatorFingerprint";
import LiquidityArch from "@/components/forensics/LiquidityArch";
import FactoryRhythm from "@/components/forensics/FactoryRhythm";
import DeployerProfileCard from "@/components/forensics/DeployerProfile";
import OperatorImpactCard from "@/components/forensics/OperatorImpact";
import SolTraceCard from "@/components/forensics/SolTrace";
import CartelReportCard from "@/components/forensics/CartelReportCard";
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
          {/* NProgress-style top bar — z-[60] above pill nav z-50 */}
          {progress && (
            <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-white/5 overflow-hidden">
              <div
                className="h-full bg-neon transition-all duration-300 ease-out shadow-[0_0_8px_rgba(57,255,20,0.5)]"
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
              "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-display font-bold",
              "bg-neon text-black hover:bg-neon/90",
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

          {/* Zombie alert — prominent banner, only shown when confirmed */}
          {data.zombie_alert && <ZombieAlert alert={data.zombie_alert} />}

          {/* Root token */}
          {data.root && (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <SectionHeader icon={<Crown className="h-4 w-4" />} title="Root Token" />
                {data.factory_rhythm?.is_factory && (
                  <span className="rounded-full border border-red-700/70 bg-red-950/50 px-2.5 py-0.5 text-xs font-bold text-red-300">
                    🏭 Factory Deployer
                  </span>
                )}
              </div>
              <TokenInfo token={data.root} isRoot />
            </motion.section>
          )}

          {/* Forensic signals — always rendered when backend supports them */}
          {(data.liquidity_arch !== undefined ||
            data.death_clock !== undefined ||
            data.zombie_alert !== undefined ||
            data.factory_rhythm !== undefined ||
            data.operator_fingerprint !== undefined ||
            data.deployer_profile !== undefined ||
            data.operator_impact !== undefined ||
            data.sol_flow !== undefined ||
            data.cartel_report !== undefined) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="space-y-0"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
                <span className="w-4 h-px bg-zinc-700" />
                Forensic Intelligence
                <span className="flex-1 h-px bg-zinc-700" />
              </h3>
              <DeployerProfileCard profile={data.deployer_profile} />
              <OperatorImpactCard report={data.operator_impact} />
              <SolTraceCard report={data.sol_flow} mint={data.sol_flow?.mint ?? mint} />
              <CartelReportCard report={data.cartel_report} />
              <LiquidityArch report={data.liquidity_arch} />
              <DeathClock forecast={data.death_clock} />
              <FactoryRhythm report={data.factory_rhythm} />
              <OperatorFingerprint fp={data.operator_fingerprint} />
            </motion.div>
          )}

          {/* Family tree */}
          {data.derivatives.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <FamilyTree key={mint} data={data} />
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
                      className="group rounded-2xl border border-white/5 bg-card p-4 hover:border-neon/20 hover:bg-white/[0.03] transition-all duration-150 block"
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
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neon/10 text-neon">
        {icon}
      </div>
      <h2 className="display-heading font-bold text-sm text-white uppercase tracking-wide">{title}</h2>
      {count != null && (
        <span className="ml-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/50 tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}
