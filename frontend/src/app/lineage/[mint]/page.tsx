"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useLineageWS } from "@/lib/useLineageWS";
import { useAnalysisStream } from "@/lib/useAnalysisStream";
import AnalysisProgress from "@/components/AnalysisProgress";
import { SearchBar } from "@/components/SearchBar";
import { addToHistory } from "@/components/CommandPalette";
import { useWatchlist } from "@/hooks/useWatchlist";
import HeroCard from "@/components/HeroCard";
import WatchButton from "@/components/WatchButton";
import ZombieAlert from "@/components/forensics/ZombieAlert";
import ForensicTabs, { type TabDef } from "@/components/forensics/ForensicTabs";
import OverviewTab from "@/components/forensics/OverviewTab";
import BundleTab from "@/components/forensics/BundleTab";
import MoneyFlowTab from "@/components/forensics/MoneyFlowTab";
import LineageTab from "@/components/forensics/LineageTab";
import DeployerTab from "@/components/forensics/DeployerTab";
import { formatSol } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/ChatPanel";
import BackButton from "@/components/BackButton";

// ── Debug helper (no-op in prod) ──────────────────────────────────────────
const log = process.env.NODE_ENV === "development"
  ? (...args: unknown[]) => console.debug("[LineagePage]", ...args)
  : () => {};

export default function LineagePage() {
  const params = useParams<{ mint: string }>();
  const mint = params.mint;

  const { data, isLoading, error, progress, analyze, restoreFromCache } = useLineageWS();
  const { isWatched, updateRiskScore } = useWatchlist();

  // Log state transitions so we can trace in DevTools
  log("render", { mint: mint?.slice(0, 8), isLoading, hasData: !!data, error: error?.slice(0, 60) });

  const {
    steps: analysisSteps,
    analysis,
    loading: analysisLoading,
    error: analysisError,
    retryCount,
    retryNow,
  } = useAnalysisStream(data ? mint : null);

  useEffect(() => {
    if (!mint) return;
    // Restore cached result immediately so the UI isn't blank while the fresh
    // fetch is in flight (stale-while-revalidate pattern). Then always call
    // analyze() so every page visit gets up-to-date on-chain data.
    log("useEffect[mint] — restoring cache (if any) then analyzing", mint.slice(0, 8));
    restoreFromCache(mint);
    analyze(mint);
  }, [mint, analyze, restoreFromCache]);

  // Sync risk score back into the watchlist whenever analysis finishes
  useEffect(() => {
    const score = analysis?.ai_analysis?.risk_score;
    if (mint && score != null && isWatched(mint)) {
      updateRiskScore(mint, score);
    }
  }, [mint, analysis?.ai_analysis?.risk_score, isWatched, updateRiskScore]);

  useEffect(() => {
    // Use the SCANNED token's name for the page title, not the root
    const name = data?.query_token?.name || data?.query_token?.symbol || data?.root?.name;
    document.title = name
      ? `${name} — Lineage Agent`
      : `Lineage: ${mint?.slice(0, 8)}... — Lineage Agent`;

    if (data && mint) {
      const historyName =
        data.query_token?.name ||
        data.query_token?.symbol ||
        data.root?.name ||
        data.root?.symbol ||
        mint.slice(0, 8);
      addToHistory(mint, historyName);
    }
  }, [data, mint]);

  /* ── Build tab definitions ────────────────────────────────────────── */
  const tabs: TabDef[] = useMemo(() => {
    if (!data) return [];
    log("useMemo[tabs] — building tabs from data", {
      family_size: data.family_size,
      bundle_verdict: data.bundle_report?.overall_verdict ?? "null",
      deployer: data.deployer_profile?.address?.slice(0, 8) ?? "null",
    });

    const riskBadge = analysis?.ai_analysis?.risk_score != null
      ? `${analysis.ai_analysis.risk_score}`
      : analysisLoading
        ? "…"
        : null;

    const bundleBadge = data.bundle_report?.overall_verdict
      ? data.bundle_report.overall_verdict === "confirmed_team_extraction"
        ? "🔴"
        : data.bundle_report.overall_verdict === "suspected_team_extraction"
          ? "🟠"
          : data.bundle_report.overall_verdict === "coordinated_dump_unknown_team"
            ? "⚠️"
            : "✅"
      : null;

    const hasMoneyFlow = data.sol_flow != null || data.operator_impact != null;
    const hasDeployer =
      data.deployer_profile != null ||
      data.cartel_report?.deployer_community != null ||
      (data.death_clock != null && data.death_clock.risk_level !== "insufficient_data") ||
      data.factory_rhythm != null;

    return [
      {
        id: "overview",
        label: "Overview",
        icon: "🔍",
        badge: riskBadge,
        content: (
          <OverviewTab
            data={data}
            analysis={analysis}
            analysisLoading={analysisLoading}
          />
        ),
      },
      {
        id: "bundle",
        label: "Bundle",
        icon: "📦",
        badge: bundleBadge,
        disabled: data.bundle_report == null,
        content: <BundleTab report={data.bundle_report} />,
      },
      {
        id: "money-flow",
        label: "Money Flow",
        icon: "💸",
        badge: data.sol_flow
          ? formatSol(data.sol_flow.total_extracted_sol)
          : null,
        disabled: !hasMoneyFlow,
        content: (
          <MoneyFlowTab
            solFlow={data.sol_flow}
            operatorImpact={data.operator_impact}
            mint={mint}
          />
        ),
      },
      {
        id: "lineage",
        label: "Lineage",
        icon: "🌳",
        badge: data.family_size > 1 ? data.family_size : null,
        disabled: data.derivatives.length === 0,
        content: (
          <LineageTab data={data} liquidityArch={data.liquidity_arch} />
        ),
      },
      {
        id: "deployer",
        label: "Deployer",
        icon: "🏭",
        badge: data.deployer_profile
          ? `${data.deployer_profile.rug_rate_pct.toFixed(0)}%`
          : null,
        disabled: !hasDeployer,
        content: (
          <DeployerTab
            profile={data.deployer_profile}
            cartel={data.cartel_report}
            deathClock={data.death_clock}
            factory={data.factory_rhythm}
          />
        ),
      },
    ];
  }, [data, analysis, analysisLoading, mint]);

  return (
    <div className="space-y-5">
      <BackButton />
      <SearchBar compact />

      {/* ── Loading — skeleton ──────────────────────────────────────── */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          {progress && (
            <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-white/5 overflow-hidden">
              <div
                className="h-full bg-[#622EC3] transition-all duration-300 ease-out shadow-[0_0_8px_rgba(98,46,195,0.5)]"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          )}
          {/* Hero skeleton */}
          <div className="rounded-2xl border border-white/5 bg-card p-5 animate-pulse space-y-4">
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 rounded bg-muted" />
                <div className="h-3 w-64 rounded bg-muted/60" />
              </div>
            </div>
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-3 w-16 rounded bg-muted/40" />
              ))}
            </div>
            <div className="h-8 w-full rounded-lg bg-muted/30" />
          </div>
          {/* Tab skeleton */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 w-20 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
            <div className="h-48 rounded-xl border border-zinc-800 bg-zinc-950/70 animate-pulse" />
          </div>
          {progress && (
            <p className="text-xs text-center text-muted-foreground animate-pulse-subtle">
              {progress.step}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Error ──────────────────────────────────────────────────── */}
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
              "bg-[#622EC3] text-white hover:bg-[#7B45E0]",
              "transition-colors",
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="space-y-5"
          >
            {/* Zombie banner — above hero when confirmed */}
            {data.zombie_alert && <ZombieAlert alert={data.zombie_alert} />}

            {/* Hero: token info + badges + AI verdict */}
            <div className="relative">
              <HeroCard
                data={data}
                analysis={analysis}
                analysisLoading={analysisLoading}
              />
              {/* Watch / star button — overlaid on the hero card */}
              <div className="absolute right-4 top-4">
                <WatchButton
                  mint={mint}
                  name={
                    data.query_token?.name ||
                    data.query_token?.symbol ||
                    data.root?.name ||
                    mint.slice(0, 8)
                  }
                  symbol={data.query_token?.symbol || data.root?.symbol}
                  riskScore={analysis?.ai_analysis?.risk_score ?? undefined}
                  showLabel
                />
              </div>
            </div>

            {/* AI analysis progress — shown while stream is running */}
            {analysisLoading && (
              <AnalysisProgress steps={analysisSteps} />
            )}

            {/* AI streaming error (non-fatal — lineage results still shown) */}
            {analysisError && !analysisLoading && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-300">{analysisError}</p>
                </div>
                {retryCount <= 3 && (
                  <button
                    onClick={retryNow}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-400/10 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry AI
                  </button>
                )}
              </div>
            )}

            {/* Forensic tabs */}
            {tabs.length > 0 && (
              <ForensicTabs tabs={tabs} defaultTab="overview" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forensic AI Chat — floating overlay */}
      {data && (
        <ChatPanel
          mint={mint}
          tokenName={
            data.query_token?.name ||
            data.query_token?.symbol ||
            data.root?.name ||
            undefined
          }
        />
      )}
    </div>
  );
}
