"use client";

import type { LineageResult } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import react-force-graph-2d with SSR disabled
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px]">
      <div className="h-8 w-8 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  ),
});

interface Props {
  data: LineageResult;
}

/**
 * Interactive family tree using a force-directed graph layout.
 */
export function FamilyTree({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth - 32);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth - 32);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  if (!mounted) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 animate-fade-in">
        <h3 className="font-bold text-lg mb-4">🌳 Family Tree</h3>
        <div className="flex items-center justify-center h-[200px]">
          <div className="h-8 w-8 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
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
      <ForceGraph2D
        graphData={{ nodes, links }}
        width={width}
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
