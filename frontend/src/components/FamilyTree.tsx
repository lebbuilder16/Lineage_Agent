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

const LEVEL_STYLE = {
  high:   { border: "#39ff14", bar: "bg-[#39ff14]",  text: "text-[#39ff14]",  glow: "0 0 14px rgba(57,255,20,.25)"  },
  medium: { border: "#f59e0b", bar: "bg-amber-400",  text: "text-amber-400",  glow: "0 0 14px rgba(245,158,11,.2)"  },
  low:    { border: "#ef4444", bar: "bg-red-500",    text: "text-red-400",    glow: "0 0 14px rgba(239,68,68,.18)"  },
} as const;

const GEN_PILL: Record<number, string> = {
  0: "bg-[#39ff14]/15 text-[#39ff14] border border-[#39ff14]/30",
  1: "bg-[#39ff14]/10 text-[#39ff14]/80 border border-[#39ff14]/20",
  2: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  4: "bg-red-500/10 text-red-400 border border-red-500/20",
};

/* ─── Custom node ──────────────────────────────────────────────── */

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
  const level = scoreLevel(data.score);
  const pct   = Math.round(data.score * 100);
  const ls    = LEVEL_STYLE[level];
  const genCls = GEN_PILL[data.generation] ?? GEN_PILL[4];

  const borderColor = data.isRoot ? "#39ff14" : data.isScanned ? "#38bdf8" : ls.border;
  const boxShadow   = data.isRoot
    ? "0 0 20px rgba(57,255,20,.2), inset 0 0 20px rgba(57,255,20,.04)"
    : data.isScanned
    ? "0 0 16px rgba(56,189,248,.2)"
    : ls.glow;

  return (
    <div
      className="relative flex flex-col gap-1.5 rounded-xl bg-[#0e0e10] px-3 py-2.5 cursor-pointer select-none transition-all duration-150 hover:brightness-110"
      style={{
        minWidth: 128,
        border: `1px solid ${borderColor}44`,
        boxShadow,
        outline: data.isScanned ? `1px solid ${borderColor}55` : undefined,
        outlineOffset: data.isScanned ? "2px" : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "transparent", border: "none", width: 1, height: 1, top: -1 }}
      />

      {/* Header: gen badge + score / crown */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded-md px-1.5 py-px text-[9px] font-bold leading-none", genCls)}>
          {data.isRoot ? "ROOT" : `G${data.generation}`}
        </span>
        {data.isRoot ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#39ff14] shrink-0">
            <Crown className="h-2.5 w-2.5 text-black" />
          </span>
        ) : (
          <span className={cn("text-[10px] font-bold tabular-nums leading-none", ls.text)}>
            {pct}%
          </span>
        )}
      </div>

      {/* Name */}
      <p className="text-[11px] font-semibold text-white leading-tight truncate" style={{ maxWidth: 112 }}>
        {data.label}
      </p>

      {/* Symbol */}
      {data.symbol && data.symbol !== data.label && (
        <p className="text-[10px] text-zinc-500 leading-none">${data.symbol}</p>
      )}

      {/* Score bar — clones only */}
      {!data.isRoot && (
        <div className="h-[3px] w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className={cn("h-full rounded-full", ls.bar)} style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* SCANNING badge */}
      {data.isScanned && !data.isRoot && (
        <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-500/40 bg-sky-950/80 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-sky-300">
          scanning
        </span>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "transparent", border: "none", width: 1, height: 1, bottom: -1 }}
      />
    </div>
  );
}

const nodeTypes = { token: TokenNode };

/* ─── Dagre auto-layout ─────────────────────────────────────────── */

const NODE_W = 142;
const NODE_H = 84;

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 72, nodesep: 36, marginx: 24, marginy: 24 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

/* ─── Edge color ────────────────────────────────────────────────── */

function edgeStroke(score: number) {
  if (score >= 0.7) return "#39ff14";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

/* ─── Main component ───────────────────────────────────────────── */

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
          fontSize:   10,
          fill:       color,
          fontWeight: 700,
          fontFamily: "ui-monospace, monospace",
        },
        labelBgStyle:   { fill: "#0e0e10", fillOpacity: 0.9, rx: 3, ry: 3 },
        labelBgPadding: [4, 6] as [number, number],
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        style: {
          stroke:      color,
          strokeWidth: 1.5,
          opacity:     0.45 + d.evidence.composite_score * 0.5,
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

  const maxGen = Math.max(0, ...data.derivatives.map((d) => d.generation ?? 1));
  const height = Math.min(540, Math.max(268, (maxGen + 2) * 118));

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-[#09090b]">
      {/* ReactFlow canvas */}
      <div style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.25}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="#27272a"
          />
          <Controls
            showInteractive={false}
            position="bottom-right"
            style={{ background: "transparent", border: "none" }}
          />
        </ReactFlow>
      </div>

      {/* Footer legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-zinc-800/60 bg-zinc-950/60 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Crown className="h-3 w-3 text-[#39ff14]" />
          Original
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="h-[3px] w-4 rounded-full bg-[#39ff14]" />
          High ≥70%
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="h-[3px] w-4 rounded-full bg-amber-400" />
          Medium ≥40%
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="h-[3px] w-4 rounded-full bg-red-500" />
          Low
        </span>
        {data.derivatives.length > 24 && (
          <span className="rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-400">
            Showing 24 of {data.derivatives.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
          <ExternalLink className="h-2.5 w-2.5" />
          <span className="hidden sm:inline">Click node to analyse</span>
          <span className="sm:hidden">Tap to analyse • Pinch to zoom</span>
        </span>
      </div>
    </div>
  );
}
