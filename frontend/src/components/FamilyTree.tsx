"use client";

import type { LineageResult } from "@/lib/api";
import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  Handle,
  BackgroundVariant,
  MarkerType,
  Panel,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { useRouter } from "next/navigation";
import { Crown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Score helpers ─────────────────────────────────────────────── */

function scoreLevel(s: number): "high" | "medium" | "low" {
  if (s >= 0.7) return "high";
  if (s >= 0.4) return "medium";
  return "low";
}

const SCORE_PALETTE = {
  high:   { hex: "#39ff14", bar: "bg-[#39ff14]", text: "text-[#39ff14]", shadow: "rgba(57,255,20,.35)"   },
  medium: { hex: "#f59e0b", bar: "bg-amber-400",  text: "text-amber-400", shadow: "rgba(245,158,11,.3)"   },
  low:    { hex: "#ef4444", bar: "bg-red-500",    text: "text-red-400",   shadow: "rgba(239,68,68,.25)"   },
} as const;

/* Avatar gradient by generation */
const GEN_AVATAR: Record<number, string> = {
  0: "from-[#39ff14] to-[#00d4aa]",
  1: "from-[#22d3ee] to-[#39ff14]",
  2: "from-amber-400 to-orange-400",
  3: "from-orange-500 to-rose-500",
  4: "from-red-500 to-rose-700",
};

/* Badge pill by generation */
const GEN_BADGE: Record<number, string> = {
  0: "bg-[#39ff14]/10 text-[#39ff14] ring-1 ring-[#39ff14]/25",
  1: "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20",
  2: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20",
  3: "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20",
  4: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
};

const INVISIBLE_HANDLE = {
  background: "transparent",
  border: "none",
  width: 1,
  height: 1,
};

/* ─── Custom node ────────────────────────────────────────────────── */

interface TokenNodeData {
  label: string;
  symbol: string;
  score: number;
  isRoot: boolean;
  mint: string;
  generation: number;
  isScanned: boolean;
  [key: string]: unknown;
}

function TokenNode({ data }: { data: TokenNodeData }) {
  const level  = scoreLevel(data.score);
  const pal    = SCORE_PALETTE[level];
  const pct    = Math.round(data.score * 100);
  const gen    = Math.min(data.generation, 4);
  const accent = data.isRoot ? "#39ff14" : data.isScanned ? "#38bdf8" : pal.hex;
  const initial = (data.label?.[0] ?? data.symbol?.[0] ?? "?").toUpperCase();

  return (
    <div className="group relative cursor-pointer select-none" style={{ width: NODE_W }}>

      {/* Root: subtle outer glow ring */}
      {data.isRoot && (
        <div
          className="pointer-events-none absolute -inset-[4px] rounded-[22px] animate-pulse"
          style={{ boxShadow: "0 0 0 1px rgba(57,255,20,0.2), 0 0 28px rgba(57,255,20,0.15)" }}
        />
      )}

      <Handle type="target" position={Position.Top} style={{ ...INVISIBLE_HANDLE, top: -1 }} />

      {/* Card */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden transition-all duration-200 group-hover:brightness-[1.15] group-hover:-translate-y-px"
        style={{
          background: data.isRoot
            ? "linear-gradient(145deg, rgba(57,255,20,0.07) 0%, rgba(0,0,0,0) 55%), #0c0d0f"
            : "linear-gradient(150deg, rgba(255,255,255,0.04) 0%, #09090b 100%)",
          border: `1px solid ${accent}${data.isRoot ? "55" : "2e"}`,
          boxShadow: data.isRoot
            ? "0 0 0 1px rgba(57,255,20,0.12), 0 8px 32px rgba(57,255,20,0.12), inset 0 1px 0 rgba(255,255,255,0.07)"
            : `0 4px 24px ${pal.shadow}22, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Top shimmer bar */}
        <div
          className="h-[2px] w-full flex-shrink-0"
          style={{
            background: data.isRoot
              ? "linear-gradient(90deg, transparent 0%, #39ff14 50%, transparent 100%)"
              : `linear-gradient(90deg, transparent 0%, ${accent}77 50%, transparent 100%)`,
          }}
        />

        <div className="flex flex-col gap-2 px-3 py-2.5">
          {/* Row 1: avatar · name/symbol · score */}
          <div className="flex items-center gap-2">
            {/* Avatar circle */}
            <div
              className={cn(
                "flex-shrink-0 h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-black text-black",
                GEN_AVATAR[gen],
              )}
              style={{ boxShadow: `0 0 10px ${accent}55` }}
            >
              {initial}
            </div>

            {/* Name + symbol */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-white leading-tight truncate tracking-tight">
                {data.label}
              </p>
              {data.symbol && data.symbol !== data.label && (
                <p className="text-[9px] text-zinc-500 leading-none mt-px">${data.symbol}</p>
              )}
            </div>

            {/* Score / crown */}
            {data.isRoot ? (
              <div
                className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#39ff14]"
                style={{ boxShadow: "0 0 10px rgba(57,255,20,0.6)" }}
              >
                <Crown className="h-3.5 w-3.5 text-black" />
              </div>
            ) : (
              <span
                className={cn("flex-shrink-0 text-[12px] font-black font-mono tabular-nums", pal.text)}
                style={{ textShadow: `0 0 10px ${pal.hex}88` }}
              >
                {pct}%
              </span>
            )}
          </div>

          {/* Row 2: score bar (clones only) */}
          {!data.isRoot && (
            <div
              className="h-[3px] w-full rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className={cn("h-full rounded-full", pal.bar)}
                style={{ width: `${pct}%`, boxShadow: `0 0 8px ${pal.hex}` }}
              />
            </div>
          )}

          {/* Row 3: gen badge + active dot */}
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "rounded-md px-1.5 py-px text-[8px] font-bold leading-none uppercase tracking-widest",
                GEN_BADGE[gen],
              )}
            >
              {data.isRoot ? "Original" : `Gen ${data.generation}`}
            </span>
            {data.isScanned && (
              <span className="flex items-center gap-1 text-[8px] font-semibold text-sky-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-300" />
                </span>
                active
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ ...INVISIBLE_HANDLE, bottom: -1 }} />
    </div>
  );
}

const nodeTypes = { token: TokenNode };

/* ─── Dagre auto-layout ──────────────────────────────────────────── */

const NODE_W = 172;
const NODE_H = 108;

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 88, nodesep: 52, marginx: 48, marginy: 48 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

/* ─── Edge color ─────────────────────────────────────────────────── */

function edgeStroke(score: number) {
  if (score >= 0.7) return "#39ff14";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

/* ─── Main component ─────────────────────────────────────────────── */

interface Props {
  data: LineageResult;
  scannedMint?: string;
}

export function FamilyTree({ data, scannedMint }: Props) {
  const router   = useRouter();
  const resolved = scannedMint ?? data.mint;

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data.root) return { initialNodes: [], initialEdges: [] };

    const visible = data.derivatives.slice(0, 24);
    const nodeIds = new Set([data.root.mint, ...visible.map((d) => d.mint)]);

    const rawNodes: Node[] = [
      {
        id:   data.root.mint,
        type: "token",
        position: { x: 0, y: 0 },
        data: {
          label:      data.root.name || data.root.symbol || data.root.mint.slice(0, 8),
          symbol:     data.root.symbol ?? "",
          score:      1,
          isRoot:     true,
          mint:       data.root.mint,
          generation: 0,
          isScanned:  data.root.mint === resolved,
        },
      },
      ...visible.map((d) => ({
        id:   d.mint,
        type: "token",
        position: { x: 0, y: 0 },
        data: {
          label:      d.name || d.symbol || d.mint.slice(0, 8),
          symbol:     d.symbol ?? "",
          score:      d.evidence.composite_score,
          isRoot:     false,
          mint:       d.mint,
          generation: d.generation ?? 1,
          isScanned:  d.mint === resolved,
        },
      })),
    ];

    const rawEdges: Edge[] = visible.map((d) => {
      const parent = d.parent_mint && nodeIds.has(d.parent_mint)
        ? d.parent_mint
        : data.root!.mint;
      const color = edgeStroke(d.evidence.composite_score);
      const pct   = Math.round(d.evidence.composite_score * 100);
      return {
        id:       `${parent}->${d.mint}`,
        source:   parent,
        target:   d.mint,
        animated: d.evidence.composite_score >= 0.7,
        type:     "smoothstep",
        label:    `${pct}%`,
        labelStyle: {
          fontSize:   9,
          fill:       color,
          fontWeight: 800,
          fontFamily: "ui-monospace, monospace",
        },
        labelBgStyle:   { fill: "#09090b", fillOpacity: 0.92, rx: 4, ry: 4 },
        labelBgPadding: [4, 7] as [number, number],
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 11, height: 11 },
        style: {
          stroke:      color,
          strokeWidth: 1.5 + d.evidence.composite_score * 0.8,
          opacity:     0.3 + d.evidence.composite_score * 0.65,
        },
      };
    });

    return { initialNodes: layoutGraph(rawNodes, rawEdges), initialEdges: rawEdges };
  }, [data, resolved]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      router.push(`/lineage/${(node.data as TokenNodeData).mint}`);
    },
    [router],
  );

  if (!data.root) return null;

  const totalNodes   = data.derivatives.length + 1;
  const maxGen       = Math.max(0, ...data.derivatives.map((d) => d.generation ?? 1));
  const canvasHeight = Math.min(660, Math.max(320, (maxGen + 2) * 136));

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: "#07070a",
        border: "1px solid rgba(57,255,20,0.1)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.035), 0 24px 64px rgba(0,0,0,0.65)",
      }}
    >
      <div style={{ height: canvasHeight }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          {/* Fine cross-hatch grid — more technical, modern */}
          <Background
            variant={BackgroundVariant.Cross}
            gap={32}
            size={1.5}
            color="#161618"
          />

          <Controls
            showInteractive={false}
            position="bottom-right"
            style={{
              background: "rgba(12,12,15,0.85)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              backdropFilter: "blur(10px)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          />

          {/* Floating legend */}
          <Panel position="top-left">
            <div
              className="flex flex-col gap-2 rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(7,7,10,0.88)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
              }}
            >
              <span className="text-[8px] font-bold uppercase tracking-widest text-white/30">
                Confidence
              </span>
              {[
                { color: "#39ff14", shadow: "#39ff1466", label: "High ≥ 70%" },
                { color: "#f59e0b", shadow: "#f59e0b66", label: "Medium ≥ 40%" },
                { color: "#ef4444", shadow: "#ef444466", label: "Low" },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span
                    className="h-[3px] w-5 flex-shrink-0 rounded-full"
                    style={{ background: l.color, boxShadow: `0 0 6px ${l.shadow}` }}
                  />
                  {l.label}
                </span>
              ))}
              <div className="h-px bg-white/5 my-0.5" />
              <span className="text-[9px] text-zinc-600">
                {totalNodes} node{totalNodes !== 1 ? "s" : ""} · {maxGen + 1} gen
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Bottom bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(0,0,0,0.45)",
        }}
      >
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Crown className="h-3 w-3 text-[#39ff14]" />
          Click any node to deep-dive
        </span>
        <div className="flex items-center gap-3">
          {data.derivatives.length > 24 && (
            <span className="rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-400">
              Showing 24 / {data.derivatives.length}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <ExternalLink className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">Scroll to zoom · Drag to pan</span>
          </span>
        </div>
      </div>
    </div>
  );
}

