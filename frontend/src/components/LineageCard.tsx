"use client";

import type { LineageResult } from "@/lib/api";

interface Props {
  data: LineageResult;
}

export function LineageCard({ data }: Props) {
  const root = data.root;
  const pct = (data.confidence * 100).toFixed(0);

  // Colour of confidence bar
  const barColour =
    data.confidence >= 0.7
      ? "var(--success)"
      : data.confidence >= 0.4
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 animate-fade-in">
      <h2 className="font-bold text-xl mb-4">🧬 Lineage Summary</h2>

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        {/* Confidence */}
        <div>
          <p className="text-sm text-[var(--muted)]">Confidence</p>
          <p className="text-2xl font-bold" style={{ color: barColour }}>
            {pct}%
          </p>
          <div className="mt-1 h-1.5 w-full rounded bg-[var(--background)]">
            <div
              className="h-full rounded transition-all duration-700"
              style={{ width: `${pct}%`, background: barColour }}
            />
          </div>
        </div>

        {/* Root */}
        <div>
          <p className="text-sm text-[var(--muted)]">Root token</p>
          <p className="font-semibold truncate">
            {root?.name || root?.symbol || "Unknown"}
          </p>
          <p className="font-mono text-xs text-[var(--muted)] truncate">
            {root?.mint ?? "—"}
          </p>
        </div>

        {/* Family size */}
        <div>
          <p className="text-sm text-[var(--muted)]">Family size</p>
          <p className="text-2xl font-bold">{data.family_size}</p>
          <p className="text-xs text-[var(--muted)]">
            {data.derivatives.length} derivative{data.derivatives.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
