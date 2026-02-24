"use client";

import type { SimilarityEvidence } from "@/lib/api";

interface Props {
  evidence: SimilarityEvidence;
  name?: string;
}

export function EvidencePanel({ evidence, name }: Props) {
  const bars: { label: string; value: number }[] = [
    { label: "Name", value: evidence.name_score },
    { label: "Symbol", value: evidence.symbol_score },
    { label: "Image", value: evidence.image_score },
    { label: "Deployer", value: evidence.deployer_score },
    { label: "Temporal", value: evidence.temporal_score },
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 animate-fade-in">
      {name && <h4 className="font-semibold mb-3">{name}</h4>}

      <div className="space-y-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3 text-sm">
            <span className="w-20 text-[var(--muted)]">{b.label}</span>
            <div className="flex-1 h-2 rounded bg-[var(--background)]">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${(b.value * 100).toFixed(0)}%`,
                  background: scoreColour(b.value),
                }}
              />
            </div>
            <span className="w-12 text-right font-mono">
              {(b.value * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-sm">
        <span className="text-[var(--muted)]">Composite</span>
        <span
          className="font-bold text-lg"
          style={{ color: scoreColour(evidence.composite_score) }}
        >
          {(evidence.composite_score * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function scoreColour(v: number): string {
  if (v >= 0.7) return "var(--success)";
  if (v >= 0.4) return "var(--warning)";
  return "var(--danger)";
}
