"use client";

import type { FactoryRhythmReport } from "@/lib/api";

interface Props {
  report: FactoryRhythmReport | null | undefined;
}

export default function FactoryRhythm({ report }: Props) {
  if (!report) return null;

  const pct = Math.round(report.factory_score * 100);
  const isFactory = report.is_factory;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        isFactory
          ? "border-red-700/70 bg-red-950/50 text-red-300"
          : "border-zinc-700/50 bg-zinc-900/50 text-zinc-400"
      }`}
    >
      <span>🏭</span>
      {isFactory ? (
        <>
          <span className="font-bold text-red-200">Factory Deployer</span>
          <span className="text-red-400/80">
            {report.tokens_launched} tokens •{" "}
            {report.median_interval_hours < 24
              ? `${report.median_interval_hours.toFixed(1)}h intervals`
              : `${(report.median_interval_hours / 24).toFixed(1)}d intervals`}{" "}
            • {report.naming_pattern} names
          </span>
          <span className="ml-auto text-red-300 font-semibold">{pct}% score</span>
        </>
      ) : (
        <>
          <span>Scripted Deployer Score</span>
          <div className="w-16 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-zinc-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span>{pct}%</span>
        </>
      )}
    </div>
  );
}
