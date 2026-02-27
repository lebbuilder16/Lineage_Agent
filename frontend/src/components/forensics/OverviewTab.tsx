"use client";

import type { LineageResult, AnalyzeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatUsd, formatSol } from "@/lib/utils";
import {
  StatBlock,
  riskLevel,
  TAG_COLORS,
  parseTag,
} from "@/components/forensics/shared";
import { Loader2 } from "lucide-react";

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
  const ai = analysis?.ai_analysis;
  const f = analysis?.forensic;
  const risk = riskLevel(ai?.risk_score ?? null);

  /* Loading state */
  if (analysisLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 flex items-center justify-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
        <span className="text-sm text-zinc-500">
          AI analysis in progress — this may take up to 30s…
        </span>
      </div>
    );
  }

  if (!ai) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
        <p className="text-sm text-zinc-500">
          No AI analysis available for this token.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── At a Glance: key metrics grid ──────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {f?.sol_flow && (
          <StatBlock
            label="SOL extracted"
            value={formatSol(f.sol_flow.total_extracted_sol)}
            danger={f.sol_flow.total_extracted_sol > 1}
          />
        )}
        {f?.bundle && (
          <StatBlock
            label="Bundle verdict"
            value={
              f.bundle.verdict === "confirmed_team_extraction"
                ? "🔴 Team"
                : f.bundle.verdict === "suspected_team_extraction"
                  ? "🟠 Suspected"
                  : f.bundle.verdict === "coordinated_dump_unknown_team"
                    ? "⚠️ Dump"
                    : "✅ Clean"
            }
          />
        )}
        {f?.lineage && (
          <StatBlock
            label="Clones"
            value={f.lineage.clones_count}
            danger={f.lineage.clones_count > 2}
          />
        )}
        {data.deployer_profile && (
          <StatBlock
            label="Rug rate"
            value={`${data.deployer_profile.rug_rate_pct.toFixed(0)}%`}
            danger={data.deployer_profile.rug_rate_pct >= 50}
          />
        )}
        {data.liquidity_arch && (
          <StatBlock
            label="Liq. authenticity"
            value={`${Math.round(data.liquidity_arch.authenticity_score * 100)}%`}
          />
        )}
        {f?.sol_flow?.known_cex_detected && (
          <StatBlock label="CEX exit" value="Detected" danger />
        )}
        {f?.lineage?.zombie_relaunch_detected && (
          <StatBlock label="Zombie" value="⚠️ Yes" danger />
        )}
      </div>

      {/* ── Narrative ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
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

      {/* ── Key Findings ───────────────────────────────────────── */}
      {ai.key_findings.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Key Findings
          </p>
          <ul className="space-y-1.5">
            {ai.key_findings.map((finding, i) => {
              const { tag, text } = parseTag(finding);
              return (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-zinc-600 mt-0.5">›</span>
                  {tag && (
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        TAG_COLORS[tag] ??
                          "border-zinc-700 bg-zinc-900 text-zinc-400",
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

      {/* ── Operator Hypothesis ─────────────────────────────────── */}
      {ai.operator_hypothesis && (
        <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/60 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
            Operator Hypothesis
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {ai.operator_hypothesis}
          </p>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
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

/* ── Sub-component ─────────────────────────────────────────────────── */

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
    <div className="grid grid-cols-[84px_1fr] gap-x-3 items-start py-2 border-b border-zinc-800/60 last:border-0">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest mt-0.5",
          accent,
        )}
      >
        {label}
      </span>
      <p className="text-xs text-zinc-300 leading-relaxed">{text}</p>
    </div>
  );
}
