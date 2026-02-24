"use client";

import type { LineageResult } from "@/lib/api";
import { useEffect, useRef } from "react";

interface Props {
  data: LineageResult;
}

/**
 * Interactive family tree rendered with HTML Canvas.
 * Pure implementation — no external graph library required.
 */
export function FamilyTree({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.root) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear
    ctx.clearRect(0, 0, W, H);

    const root = data.root!;
    const derivatives = data.derivatives.slice(0, 20);

    // Root position (center top)
    const rootX = W / 2;
    const rootY = 60;
    const rootR = 28;

    // Layout derivatives in a semicircle below the root
    const count = derivatives.length;
    const arcRadius = Math.min(W * 0.38, 200);
    const arcCenterY = rootY + arcRadius + 40;

    const nodes: { x: number; y: number; r: number; label: string; score: number; isRoot: boolean }[] = [];

    // Root node
    nodes.push({
      x: rootX,
      y: rootY,
      r: rootR,
      label: root.name || root.symbol || root.mint.slice(0, 6),
      score: 1,
      isRoot: true,
    });

    // Derivative nodes arranged in arc
    for (let i = 0; i < count; i++) {
      const d = derivatives[i];
      const angle = Math.PI * 0.15 + (Math.PI * 0.7 * i) / Math.max(count - 1, 1);
      const x = rootX + arcRadius * Math.cos(angle - Math.PI / 2 + Math.PI * 0.15);
      const y = arcCenterY + arcRadius * 0.55 * Math.sin(angle - Math.PI / 2 + Math.PI * 0.15);
      const score = d.evidence.composite_score;
      const r = 12 + score * 10;

      nodes.push({
        x,
        y: Math.min(y, H - 30),
        r,
        label: (d.name || d.symbol || d.mint.slice(0, 6)).slice(0, 10),
        score,
        isRoot: false,
      });
    }

    // Draw links (from root to each derivative)
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const alpha = 0.15 + n.score * 0.5;
      const width = 1 + n.score * 2.5;

      ctx.beginPath();
      ctx.moveTo(rootX, rootY + rootR);
      // Curved line
      const cpY = (rootY + rootR + n.y - n.r) / 2;
      ctx.quadraticCurveTo(rootX, cpY, n.x, n.y - n.r);
      ctx.strokeStyle = `rgba(51, 166, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    // Draw nodes
    for (const n of nodes) {
      // Shadow
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fill();

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      if (n.isRoot) {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        grad.addColorStop(0, "#5bbfff");
        grad.addColorStop(1, "#1b87f5");
        ctx.fillStyle = grad;
      } else {
        const g = Math.round(n.score * 100 + 60);
        ctx.fillStyle = `rgb(${60}, ${g}, ${Math.min(g + 40, 200)})`;
      }
      ctx.fill();

      // Border
      ctx.strokeStyle = n.isRoot ? "#fff" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = n.isRoot ? 2 : 1;
      ctx.stroke();

      // Crown for root
      if (n.isRoot) {
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.fillText("👑", n.x, n.y - n.r - 4);
      }

      // Label
      ctx.font = `${n.isRoot ? "bold 11px" : "10px"} Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(n.label, n.x, n.y + n.r + 4);

      // Score badge for derivatives
      if (!n.isRoot) {
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(`${(n.score * 100).toFixed(0)}`, n.x, n.y);
      }
    }
    }; // end draw

    draw();

    // Redraw on resize
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [data]);

  if (!data.root) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 animate-fade-in">
      <h3 className="font-bold text-lg mb-3">🌳 Family Tree</h3>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: "380px" }}
      />
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#33a6ff]" /> Root
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#475569]" /> Derivative
        </span>
        <span>Line thickness = similarity score</span>
      </div>
    </div>
  );
}
