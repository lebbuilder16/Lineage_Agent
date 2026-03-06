"use client";

import { useState } from "react";
import type { LineageResult, AnalyzeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatSol } from "@/lib/utils";
import { riskLevel, TAG_COLORS, parseTag } from "@/components/forensics/shared";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

/* ── Shared style constants ─────────────────────────────────────────── */

const SECTION = "rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-4";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-3";

/* ── Severity + action helpers ─────────────────────────────────────── */

type Severity = "high" | "medium" | "info";
type ActionLevel = "avoid" | "caution" | "monitor" | "clear";

function actionFromScore(score: number | null): ActionLevel {
  if (score === null) return "monitor";
  if (score >= 75) return "avoid";
  if (score >= 45) return "caution";
  if (score >= 20) return "monitor";
  return "clear";
}

const ACTION_CONFIG: Record<
  ActionLevel,
  { label: string; description: string; hero: string; heroBorder: string; Icon: React.ElementType }
> = {
  avoid: {
    label: "AVOID",
    description: "Multiple high-severity signals detected. Do not engage.",
    hero: "bg-red-950/40 text-red-100",
    heroBorder: "border-red-500/60",
    Icon: ShieldAlert,
  },
  caution: {
    label: "CAUTION",
    description: "Suspicious patterns present. Proceed with full due diligence.",
    hero: "bg-amber-950/30 text-amber-100",
    heroBorder: "border-amber-500/50",
    Icon: AlertTriangle,
  },
  monitor: {
    label: "MONITOR",
    description: "Low-to-medium signals. Watch for deteriorating activity.",
    hero: "bg-sky-950/30 text-sky-100",
    heroBorder: "border-sky-500/40",
    Icon: Activity,
  },
  clear: {
    label: "CLEAR",
    description: "No significant red flags identified at this time.",
    hero: "bg-emerald-950/30 text-emerald-100",
    heroBorder: "border-emerald-500/40",
    Icon: CheckCircle2,
  },
};

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  data: LineageResult;
  analysis: AnalyzeResponse | null;
  analysisLoading: boolean;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function OverviewTab({
  data,
  analysis,
  analysisLoading,
}: Props) {
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const ai = analysis?.ai_analysis;
  const f = analysis?.forensic;
  const risk = riskLevel(ai?.risk_score ?? null);
  const action = actionFromScore(ai?.risk_score ?? null);
  const { label: actionLabel, description: actionDesc, hero: actionHero, heroBorder: actionHeroBorder, Icon: ActionIcon } =
    ACTION_CONFIG[action];

  /* Loading state */
  if (analysisLoading) {
    return (
      <div className={cn(SECTION, "flex items-center justify-center gap-3 py-8")}>
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
        <span className="text-sm text-zinc-500">AI analysis running — up to 30s…</span>
      </div>
    );
  }

  if (!ai) {
    return (
      <div className={cn(SECTION, "text-center py-10")}>
        <ShieldQuestion className="h-7 w-7 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">No AI analysis available for this token.</p>
      </div>
    );
  }

  /* ── Derive ranked signals ──────────────────────────────────────── */
  const signals: { label: string; value: string; severity: Severity }[] = [];

  if (f?.sol_flow && f.sol_flow.total_extracted_sol > 0)
    signals.push({
      label: "SOL extracted",
      value: formatSol(f.sol_flow.total_extracted_sol),
      severity: f.sol_flow.total_extracted_sol > 1 ? "high" : "medium",
    });

  if (f?.bundle?.verdict && f.bundle.verdict !== "early_buyers_no_link_proven")
    signals.push({
      label: "Bundle activity",
      value:
        f.bundle.verdict === "confirmed_team_extraction"
          ? "Team extraction"
          : f.bundle.verdict === "suspected_team_extraction"
            ? "Suspected"
            : "Coordinated dump",
      severity: f.bundle.verdict === "confirmed_team_extraction" ? "high" : "medium",
    });

  if (f?.lineage && f.lineage.clones_count > 0)
    signals.push({
      label: "Clone family",
      value: `${f.lineage.clones_count} clone${f.lineage.clones_count > 1 ? "s" : ""}`,
      severity: f.lineage.clones_count > 3 ? "high" : "medium",
    });

  if (data.deployer_profile && data.deployer_profile.rug_rate_pct >= 25)
    signals.push({
      label: "Deployer rug rate",
      value: `${data.deployer_profile.rug_rate_pct.toFixed(0)}%`,
      severity: data.deployer_profile.rug_rate_pct >= 50 ? "high" : "medium",
    });

  if (data.liquidity_arch)
    signals.push({
      label: "Liquidity authenticity",
      value: `${Math.round(data.liquidity_arch.authenticity_score * 100)}%`,
      severity: data.liquidity_arch.authenticity_score < 0.4 ? "high" : "info",
    });

  if (f?.sol_flow?.known_cex_detected)
    signals.push({ label: "CEX exit", value: "Detected", severity: "high" });

  if (f?.lineage?.zombie_relaunch_detected)
    signals.push({ label: "Zombie relaunch", value: "Confirmed", severity: "high" });

  const severityWeight: Record<Severity, number> = { high: 2, medium: 1, info: 0 };
  const topSignals = [...signals]
    .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])
    .slice(0, 3);

  const allFindings = ai.key_findings.map((f) => parseTag(f));
  const visibleFindings = showAllFindings ? allFindings : allFindings.slice(0, 5);

  const confidenceLabel =
    ai.confidence === "high" ? "High conf."
    : ai.confidence === "medium" ? "Med. conf."
    : "Low conf.";
  const confidencePill =
    ai.confidence === "high"
      ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
      : ai.confidence === "medium"
        ? "border-amber-500/30 bg-amber-950/40 text-amber-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";

  return (
    <div className="space-y-3">

      {/* ── DECISION HERO ─────────────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border-2 px-5 py-5",
        actionHero,
        actionHeroBorder,
      )}>
        {/* Action label — dominant */}
        <div className="flex items-center gap-3 mb-3">
          <ActionIcon className="h-6 w-6 shrink-0" />
          <span className="text-2xl font-black tracking-[0.06em]">{actionLabel}</span>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <span className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-bold tabular-nums",
              risk.border, risk.bg, risk.color,
            )}>
              {ai.risk_score ?? "?"}/100
            </span>
            <span className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
              confidencePill,
            )}>
              {confidenceLabel}
            </span>
          </div>
        </div>
        {/* Verdict + description */}
        <p className="text-sm font-medium leading-relaxed opacity-95">{ai.verdict_summary}</p>
        <p className="mt-1 text-[11px] opacity-55">{actionDesc}</p>
      </div>

      {/* ── TOP 3 SIGNALS ─────────────────────────────────────────── */}
      {topSignals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {topSignals.map((s, i) => (
            <SignalCard key={i} signal={s} />
          ))}
        </div>
      )}

      {/* ── FULL ANALYSIS TOGGLE ──────────────────────────────────── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className={cn(
          "w-full flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold transition-colors",
          expanded
            ? "border-zinc-700 bg-zinc-900 text-zinc-300"
            : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700",
        )}
      >
        <span>{expanded ? "Hide reasoning" : "See full reasoning"}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* ── COLLAPSIBLE DETAIL ────────────────────────────────────── */}
      {expanded && (
        <div className="space-y-3">

          {/* Analysis */}
          {(ai.analysis || ai.narrative?.observation) && (
            <div className={SECTION}>
              <p className={LABEL}>Analysis</p>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {ai.analysis ?? ai.narrative?.observation}
              </p>
            </div>
          )}

          {/* Key Evidence */}
          {allFindings.length > 0 && (
            <div className={SECTION}>
              <p className={LABEL}>Key Evidence</p>
              <ol className="space-y-2">
                {visibleFindings.map(({ tag, text }, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-[10px] font-mono text-zinc-600 w-4 text-right">{i + 1}.</span>
                    {tag && (
                      <span className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none mt-[3px]",
                        TAG_COLORS[tag] ?? "border-zinc-700 bg-zinc-900 text-zinc-400",
                      )}>
                        {tag.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
              {allFindings.length > 5 && (
                <button
                  onClick={() => setShowAllFindings((p) => !p)}
                  className="mt-3 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showAllFindings ? (
                    <><ChevronUp className="h-3 w-3" /> Show less</>
                  ) : (
                    <><ChevronDown className="h-3 w-3" /> {allFindings.length - 5} more findings</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Conviction */}
          {/* Operator Profile */}

        </div>
      )}

      {/* ── Footer meta ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2.5 text-[10px] text-zinc-600 border-t border-zinc-800/60">
        <span>
          Analyzed by <span className="text-zinc-500">{ai.model}</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          {new Date(ai.analyzed_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
        {ai.parse_error && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-amber-600/80">⚠ structured output unavailable — fallback used</span>
          </>
        )}
      </div>

    </div>
  );
}

/* ── SignalCard ─────────────────────────────────────────────────────── */

function SignalCard({
  signal,
}: {
  signal: { label: string; value: string; severity: Severity };
}) {
  const colors: Record<Severity, { dot: string; value: string; border: string }> = {
    high: {
      dot: "bg-red-500",
      value: "text-red-300",
      border: "border-red-900/40 bg-red-950/20",
    },
    medium: {
      dot: "bg-amber-400",
      value: "text-amber-300",
      border: "border-amber-900/40 bg-amber-950/20",
    },
    info: {
      dot: "bg-zinc-500",
      value: "text-zinc-300",
      border: "border-zinc-800 bg-zinc-900/40",
    },
  };
  const c = colors[signal.severity];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 flex items-start gap-2.5", c.border)}>
      <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
      <div className="min-w-0">
        <p className="text-[10px] text-zinc-500 leading-tight mb-0.5">{signal.label}</p>
        <p className={cn("text-sm font-semibold tabular-nums leading-tight", c.value)}>
          {signal.value}
        </p>
      </div>
    </div>
  );
}
