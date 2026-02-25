"use client";

import type { FactoryRhythmReport } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

interface Props {
  report: FactoryRhythmReport | null | undefined;
}

export default function FactoryRhythm({ report }: Props) {
  if (report === undefined) return null;

  if (report === null) {
    return (
      <ForensicCard icon="🏭" title="Factory Rhythm" empty emptyLabel="Needs ≥3 tokens from this deployer">
        <></>
      </ForensicCard>
    );
  }

  const pct = Math.round(report.factory_score * 100);
  const isFactory = report.is_factory;

  return (
    <ForensicCard
      icon="🏭"
      title="Factory Rhythm"
      className={isFactory ? "border-red-800/60 bg-red-950/30" : ""}
    >
      <div className="flex flex-wrap items-center gap-4 mb-2">
        {isFactory ? (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
            SCRIPTED DEPLOYER
          </span>
        ) : (
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
            Low factory probability
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${isFactory ? "bg-red-500" : "bg-zinc-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${isFactory ? "text-red-400" : "text-zinc-500"}`}>
            {pct}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>
          Tokens launched:{" "}
          <span className="text-zinc-200 font-medium">{report.tokens_launched}</span>
        </span>
        <span>
          Interval:{" "}
          <span className="text-zinc-200">
            {report.median_interval_hours < 24
              ? `${report.median_interval_hours.toFixed(1)}h`
              : `${(report.median_interval_hours / 24).toFixed(1)}d`}
          </span>
        </span>
        <span>
          Naming:{" "}
          <span className="text-zinc-200 capitalize">{report.naming_pattern}</span>
        </span>
        <span>
          Regularity:{" "}
          <span className="text-zinc-200">{Math.round(report.regularity_score * 100)}%</span>
        </span>
      </div>
    </ForensicCard>
  );
}
