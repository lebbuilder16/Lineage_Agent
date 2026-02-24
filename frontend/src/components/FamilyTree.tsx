"use client";

import type { LineageResult } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

interface Props {
  data: LineageResult;
}

/**
 * Interactive family tree using a pure-canvas force-directed layout.
 *
 * We use `react-force-graph-2d` if available, otherwise fall back to
 * a static SVG representation.
 */
export function FamilyTree({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ForceGraph, setForceGraph] = useState<any>(null);

  // Dynamic import (react-force-graph-2d is browser-only)
  useEffect(() => {
    import("react-force-graph-2d").then((mod) =>
      setForceGraph(() => mod.default)
    );
  }, []);

  if (!data.root) return null;

  const root = data.root;
  const nodes = [
    {
      id: root.mint,
      label: root.name || root.symbol || root.mint.slice(0, 8),
      isRoot: true,
      val: 20,
    },
    ...data.derivatives.map((d) => ({
      id: d.mint,
      label: d.name || d.symbol || d.mint.slice(0, 8),
      isRoot: false,
      val: 8 + (d.evidence.composite_score ?? 0) * 12,
    })),
  ];

  const links = data.derivatives.map((d) => ({
    source: root.mint,
    target: d.mint,
    value: d.evidence.composite_score,
  }));

  if (!ForceGraph) {
    // Fallback: static SVG
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 animate-fade-in">
        <h3 className="font-bold text-lg mb-4">🌳 Family Tree</h3>
        <div className="flex flex-wrap gap-3 items-center justify-center min-h-[200px]">
          <div className="rounded-full bg-[var(--accent)] w-16 h-16 flex items-center justify-center text-xs text-white font-bold">
            👑 Root
          </div>
          {data.derivatives.slice(0, 12).map((d) => (
            <div
              key={d.mint}
              className="rounded-full bg-[var(--card-hover)] w-10 h-10 flex items-center justify-center text-[10px] text-[var(--muted)] border border-[var(--border)]"
              title={d.name || d.mint}
            >
              {(d.name || d.symbol || "?").slice(0, 3)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 animate-fade-in overflow-hidden"
    >
      <h3 className="font-bold text-lg mb-2">🌳 Family Tree</h3>
      <ForceGraph
        graphData={{ nodes, links }}
        width={containerRef.current?.clientWidth ?? 700}
        height={400}
        backgroundColor="transparent"
        nodeLabel={(n: any) => n.label}
        nodeColor={(n: any) => (n.isRoot ? "#33a6ff" : "#475569")}
        linkColor={() => "rgba(148,163,184,0.25)"}
        linkWidth={(l: any) => 1 + (l.value ?? 0) * 3}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const r = Math.sqrt(node.val ?? 8) * 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = node.isRoot ? "#33a6ff" : "#475569";
          ctx.fill();

          if (globalScale > 1.2) {
            ctx.font = `${10 / globalScale}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#e2e8f0";
            ctx.fillText(node.label, node.x, node.y + r + 2);
          }
        }}
        nodePointerAreaPaint={(node: any, colour: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.sqrt(node.val ?? 8) * 2 + 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = colour;
          ctx.fill();
        }}
      />
    </div>
  );
}
