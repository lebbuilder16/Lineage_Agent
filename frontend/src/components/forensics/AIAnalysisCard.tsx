"use client";

import { useState } from "react";
import { type AnalyzeResponse, type AIAnalysis } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Brain, Loader2 } from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : addr;
}

function riskLevel(score: number | null): {
  label: string;
  color: string;
  bg: string;
  border: string;
  bar: string;
} {
  if (score === null)
    return {
      label: "Unknown",
      color: "text-zinc-400",
      bg: "bg-zinc-900",
      border: "border-zinc-700",
      bar: "bg-zinc-600",
    };
  if (score >= 75)
    return {
      label: "High Risk",
      color: "text-red-300",
      bg: "bg-red-950/50",
      border: "border-red-500/40",
      bar: "bg-red-500",
    };
  if (score >= 45)
    return {
      label: "Medium Risk",
      color: "text-amber-300",
      bg: "bg-amber-950/50",
      border: "border-amber-500/40",
      bar: "bg-amber-400",
    };
  return {
    label: "Low Risk",
    color: "text-emerald-300",
    bg: "bg-emerald-950/50",
    border: "border-emerald-500/40",
    bar: "bg-emerald-500",
  };
}

function confidenceBadge(level: AIAnalysis["confidence"]) {
  const map = {
    high: "border-emerald-500/30 bg-emerald-950/40 text-emerald-400",
    medium: "border-amber-500/30 bg-amber-950/40 text-amber-400",
    low: "border-zinc-600 bg-zinc-900 text-zinc-400",
  } as const;
  return map[level] ?? map.low;
}

/** Parse [TAG] prefixes from key findings */
function parseTag(finding: string): { tag: string | null; text: string } {
  const m = finding.match(/^\[([A-Z_]+)\]\s*/);
  if (!m) return { tag: null, text: finding };
  return { tag: m[1], text: finding.slice(m[0].length) };
}

const TAG_COLORS: Record<string, string> = {
  DEPLOYMENT: "border-violet-500/40 bg-violet-950/40 text-violet-300",
  TIMING: "border-sky-500/40 bg-sky-950/40 text-sky-300",
  BUNDLE: "border-orange-500/40 bg-orange-950/40 text-orange-300",
  WALLET: "border-blue-500/40 bg-blue-950/40 text-blue-300",
  LINEAGE: "border-pink-500/40 bg-pink-950/40 text-pink-300",
  LIQUIDITY: "border-cyan-500/40 bg-cyan-950/40 text-cyan-300",
  SOL_FLOW: "border-amber-500/40 bg-amber-950/40 text-amber-300",
  OPERATOR: "border-red-500/40 bg-red-950/40 text-red-300",
};

// ─── sub-components ──────────────────────────────────────────────────────────

function NarrativeRow({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr] gap-x-3 gap-y-0.5 items-start py-1.5 border-b border-zinc-800/60 last:border-0">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest mt-0.5",
          accent
        )}
      >
        {label}
      </span>
      <p className="text-xs text-zinc-300 leading-relaxed">{text}</p>
    </div>
  );
}

function MetricPill({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60">
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          danger ? "text-red-300" : "text-white"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ─── main card ───────────────────────────────────────────────────────────────

interface Props {
  analysis: AnalyzeResponse | null;
  isLoading: boolean;
}

export default function AIAnalysisCard({ analysis, isLoading }: Props) {
  const ai = analysis?.ai_analysis;
  const risk = riskLevel(ai?.risk_score ?? null);

  // ── skeleton ──────────────────────────────────────────────────────────────
  if (isLoading || (!analysis && !ai)) {
    return (
      <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Loader2 className="inline h-3 w-3 mr-1.5 animate-spin" />
            🤖 AI Forensic Analysis
          </span>
          <span className="text-[10px] text-zinc-600 ml-auto">Analyzing…</span>
        </div>
        <div className="space-y-2">
          <div className="h-4 rounded bg-zinc-800/70 animate-pulse w-3/4" />
          <div className="h-3 rounded bg-zinc-800/50 animate-pulse w-full" />
          <div className="h-3 rounded bg-zinc-800/50 animate-pulse w-5/6" />
          <div className="h-3 rounded bg-zinc-800/50 animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  if (!ai) return null;

  const f = analysis!.forensic;
  const e = analysis!.evidence;

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-neon" />
          AI Forensic Analysis
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              confidenceBadge(ai.confidence)
            )}
          >
            {ai.confidence} confidence
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold",
              risk.bg,
              risk.border,
              risk.color
            )}
          >
            {ai.risk_score !== null ? `${ai.risk_score}/100` : "?/100"}
          </span>
        </div>
      </div>

      {/* ── risk bar ───────────────────────────────────────────────────── */}
      {ai.risk_score !== null && (
        <div className="mb-3 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", risk.bar)}
            style={{ width: `${ai.risk_score}%` }}
          />
        </div>
      )}

      {/* ── verdict ────────────────────────────────────────────────────── */}
      <p
        className={cn(
          "mb-3 rounded-lg border px-3 py-2 text-xs font-medium leading-relaxed",
          risk.bg,
          risk.border,
          risk.color
        )}
      >
        {ai.verdict_summary}
      </p>

      {/* ── metrics row ────────────────────────────────────────────────── */}
      {(f.bundle || f.sol_flow || f.lineage) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {f.bundle && (
            <MetricPill
              label="Bundle SOL"
              value={`${f.bundle.total_sol_extracted.toFixed(2)} ◎`}
              danger={f.bundle.total_sol_extracted > 1}
            />
          )}
          {f.sol_flow && (
            <MetricPill
              label="SOL Extracted"
              value={`${f.sol_flow.total_extracted_sol.toFixed(2)} ◎`}
              danger={f.sol_flow.total_extracted_sol > 1}
            />
          )}
          {f.lineage && (
            <MetricPill
              label="Clones"
              value={String(f.lineage.clones_count)}
              danger={f.lineage.clones_count > 2}
            />
          )}
          {f.lineage && f.lineage.zombie_relaunch_detected && (
            <MetricPill label="Zombie" value="⚠️ Yes" danger />
          )}
          {f.sol_flow && f.sol_flow.known_cex_detected && (
            <MetricPill label="CEX Exit" value="Detected" danger />
          )}
        </div>
      )}

      {/* ── narrative ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 mb-3">
        <NarrativeRow
          label="Observation"
          text={ai.narrative.observation}
          accent="text-sky-400"
        />
        <NarrativeRow
          label="Pattern"
          text={ai.narrative.pattern}
          accent="text-violet-400"
        />
        <NarrativeRow
          label="Risk"
          text={ai.narrative.risk}
          accent="text-red-400"
        />
      </div>

      {/* ── key findings ───────────────────────────────────────────────── */}
      {ai.key_findings.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
            Key Findings
          </p>
          <ul className="space-y-1">
            {ai.key_findings.map((f, i) => {
              const { tag, text } = parseTag(f);
              return (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-zinc-600 mt-0.5">›</span>
                  {tag && (
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        TAG_COLORS[tag] ??
                          "border-zinc-700 bg-zinc-900 text-zinc-400"
                      )}
                    >
                      {tag.replace("_", " ")}
                    </span>
                  )}
                  <span className="text-zinc-300 leading-relaxed">{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── operator hypothesis ────────────────────────────────────────── */}
      {ai.operator_hypothesis && (
        <div className="mb-3 rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
            Operator Hypothesis
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {ai.operator_hypothesis}
          </p>
        </div>
      )}

      {/* ── evidence (collapsible) ─────────────────────────────────────── */}
      {e.clone_tokens && e.clone_tokens.length > 0 && (
        <CollapsibleSection title={`Clone Tokens (${e.clone_tokens.length})`}>
          <div className="space-y-1">
            {e.clone_tokens.map((t) => (
              <div
                key={t.mint}
                className="flex items-center justify-between gap-2 rounded px-2 py-1 bg-zinc-900/60 text-xs"
              >
                <span className="font-mono text-zinc-400">{short(t.mint)}</span>
                <span className="text-zinc-300">
                  {t.name || t.symbol || "?"}
                </span>
                {t.similarity_score !== null && (
                  <span className="text-zinc-500">
                    {(t.similarity_score * 100).toFixed(0)}% sim
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {e.sol_flows && e.sol_flows.length > 0 && (
        <CollapsibleSection title={`SOL Flows (${e.sol_flows.length} hops)`}>
          <div className="space-y-1">
            {e.sol_flows.map((hop, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-zinc-400"
              >
                <span className="text-zinc-600">#{hop.hop}</span>
                <span className="font-mono">{short(hop.from)}</span>
                <span className="text-zinc-600">→</span>
                <span className="font-mono">{short(hop.to)}</span>
                {hop.to_label && (
                  <span className="text-amber-400 text-[10px]">
                    {hop.to_label}
                  </span>
                )}
                <span className="ml-auto text-zinc-300">
                  {hop.amount_sol.toFixed(3)} ◎
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {e.terminal_wallets && e.terminal_wallets.length > 0 && (
        <CollapsibleSection
          title={`Terminal Wallets (${e.terminal_wallets.length})`}
        >
          <div className="flex flex-wrap gap-1.5">
            {e.terminal_wallets.map((w) => (
              <a
                key={w}
                href={`https://solscan.io/account/${w}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-sky-400 hover:text-sky-200 transition-colors"
              >
                {short(w)}
              </a>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── footer ─────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-600">
        <span>Model: {ai.model}</span>
        <span>·</span>
        <span>{new Date(ai.analyzed_at).toLocaleString()}</span>
        {ai.parse_error && (
          <>
            <span>·</span>
            <span className="text-amber-600">⚠ parse fallback</span>
          </>
        )}
      </div>
    </div>
  );
}
