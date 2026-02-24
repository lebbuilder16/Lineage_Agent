"use client";

import type { LineageResult } from "@/lib/api";
import { useEffect, useRef } from "react";

interface Props {
  data: LineageResult;
}

/**
 * Interactive family tree rendered with HTML Canvas.
 * Uses the new shadcn HSL CSS variables for theme-aware colours.
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
      const isDark = document.documentElement.classList.contains("dark");

      // Theme colours derived from HSL variables
      const primaryH = isDark ? 213 : 220;
      const primary = `hsl(${primaryH}, 94%, ${isDark ? 56 : 54}%)`;
      const primaryAlpha = (a: number) => `hsl(${primaryH}, 94%, ${isDark ? 56 : 54}%, ${a})`;
      const foreground = isDark ? "hsl(213, 31%, 91%)" : "hsl(224, 71%, 4%)";
      const mutedFg = isDark ? "hsl(215, 20%, 55%)" : "hsl(220, 9%, 46%)";
      const bgMuted = isDark ? "hsl(222, 47%, 15%)" : "hsl(220, 14%, 96%)";
      const successColor = isDark ? "hsl(142, 71%, 45%)" : "hsl(142, 76%, 36%)";
      const warningColor = "hsl(38, 92%, 50%)";
      const destructiveColor = isDark ? "hsl(0, 63%, 55%)" : "hsl(0, 84%, 60%)";

      const scoreColor = (s: number) =>
        s >= 0.7 ? successColor : s >= 0.4 ? warningColor : destructiveColor;

      ctx.clearRect(0, 0, W, H);

      const root = data.root!;
      const derivatives = data.derivatives.slice(0, 20);
      const count = derivatives.length;

      const rootX = W / 2;
      const rootY = 64;
      const rootR = 28;
      const arcRadius = Math.min(W * 0.38, 200);
      const arcCenterY = rootY + arcRadius + 40;

      type Node = {
        x: number; y: number; r: number;
        label: string; score: number; isRoot: boolean;
      };
      const nodes: Node[] = [];

      nodes.push({ x: rootX, y: rootY, r: rootR, label: root.name || root.symbol || root.mint.slice(0, 6), score: 1, isRoot: true });

      for (let i = 0; i < count; i++) {
        const d = derivatives[i];
        const angle = Math.PI * 0.15 + (Math.PI * 0.7 * i) / Math.max(count - 1, 1);
        const x = rootX + arcRadius * Math.cos(angle - Math.PI / 2 + Math.PI * 0.15);
        const y = arcCenterY + arcRadius * 0.55 * Math.sin(angle - Math.PI / 2 + Math.PI * 0.15);
        const score = d.evidence.composite_score;
        const r = 12 + score * 10;
        nodes.push({ x, y: Math.min(y, H - 30), r, label: (d.name || d.symbol || d.mint.slice(0, 6)).slice(0, 10), score, isRoot: false });
      }

      // Links
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        const alpha = 0.12 + n.score * 0.45;
        ctx.beginPath();
        ctx.moveTo(rootX, rootY + rootR);
        const cpY = (rootY + rootR + n.y - n.r) / 2;
        ctx.quadraticCurveTo(rootX, cpY, n.x, n.y - n.r);
        ctx.strokeStyle = primaryAlpha(alpha);
        ctx.lineWidth = 1 + n.score * 2;
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        // Subtle shadow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)";
        ctx.fill();

        // Fill
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.isRoot) {
          const grad = ctx.createRadialGradient(n.x - n.r * 0.25, n.y - n.r * 0.25, 0, n.x, n.y, n.r);
          grad.addColorStop(0, `hsl(${primaryH}, 94%, ${isDark ? 70 : 65}%)`);
          grad.addColorStop(1, primary);
          ctx.fillStyle = grad;
        } else {
          const lvl = scoreColor(n.score);
          ctx.fillStyle = lvl;
          ctx.globalAlpha = 0.85;
        }
        ctx.fill();
        ctx.globalAlpha = 1;

        // Ring
        ctx.strokeStyle = n.isRoot ? foreground : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)");
        ctx.lineWidth = n.isRoot ? 2 : 1;
        ctx.stroke();

        // Label
        ctx.font = `${n.isRoot ? "600 11px" : "10px"} Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = foreground;
        ctx.fillText(n.label, n.x, n.y + n.r + 5);

        // Score inside derivative nodes
        if (!n.isRoot && n.r >= 14) {
          ctx.font = "bold 9px monospace";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.fillText(`${Math.round(n.score * 100)}`, n.x, n.y);
        }
      }

      // Root crown label
      ctx.font = "12px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("♛", rootX, rootY - rootR - 4);
    };

    draw();

    const obs = new ResizeObserver(() => draw());
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [data]);

  if (!data.root) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-xs">
          ⎇
        </div>
        <h3 className="font-semibold text-sm">Family Tree</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {data.derivatives.length} derivative{data.derivatives.length !== 1 ? "s" : ""}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: "380px" }}
        aria-label={`Family tree: ${data.root?.name || "root token"} and ${data.derivatives.length} derivatives`}
        role="img"
      />
      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Root
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          High similarity
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-warning" />
          Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
          Low
        </span>
      </div>
      {/* Screen reader */}
      <div className="sr-only">
        <p>Root: {data.root?.name || data.root?.mint}</p>
        <ul>
          {data.derivatives.slice(0, 20).map((d) => (
            <li key={d.mint}>{d.name || d.symbol || d.mint.slice(0, 8)} — {Math.round(d.evidence.composite_score * 100)}%</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
