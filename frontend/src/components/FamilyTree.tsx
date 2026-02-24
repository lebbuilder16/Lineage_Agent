"use client";

import type { LineageResult } from "@/lib/api";
import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  Handle,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Custom node ──────────────────────────────────────────────── */
interface TokenNodeData {
  label: string;
  symbol: string;
  score: number;
  isRoot: boolean;
  mint: string;
  [key: string]: unknown;
}

function scoreLevel(s: number) {
  if (s >= 0.7) return "high" as const;
  if (s >= 0.4) return "medium" as const;
  return "low" as const;
}

const levelRing = { high: "ring-neon/60", medium: "ring-warning/60", low: "ring-destructive/60" };
const levelText = { high: "text-neon", medium: "text-warning", low: "text-destructive" };

function TokenNode({ data }: { data: TokenNodeData }) {
  const level = scoreLevel(data.score);
  const pct = Math.round(data.score * 100);
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md cursor-pointer select-none min-w-[88px]",
        data.isRoot
          ? "border-neon/60 bg-neon/5 ring-2 ring-neon/20"
          : `border-border ring-1 ${levelRing[level]}`
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-neon/40 !border-0 !w-2 !h-2" />
      {data.isRoot && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-neon shadow">
          <Crown className="h-3 w-3 text-black" />
        </div>
      )}
      <span className={cn("text-[11px] font-bold tabular-nums", data.isRoot ? "text-neon" : levelText[level])}>
        {data.isRoot ? "ROOT" : `${pct}%`}
      </span>
      <span className="text-xs font-semibold truncate max-w-[80px] text-center leading-tight">
        {data.label}
      </span>
      {data.symbol && data.symbol !== data.label && (
        <span className="text-[10px] text-muted-foreground">{data.symbol}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-neon/40 !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { token: TokenNode };

/* ─── Dagre layout ─────────────────────────────────────────────── */
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 24 });
  nodes.forEach((n) => g.setNode(n.id, { width: 104, height: 68 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 52, y: pos.y - 34 } };
  });
}

/* ─── Main component ───────────────────────────────────────────── */

interface Props { data: LineageResult; }

export function FamilyTree({ data }: Props) {
  const router = useRouter();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data.root) return { initialNodes: [], initialEdges: [] };

    const rawNodes: Node[] = [
      {
        id: data.root.mint,
        type: "token",
        position: { x: 0, y: 0 },
        data: {
          label: data.root.name || data.root.symbol || data.root.mint.slice(0, 6),
          symbol: data.root.symbol ?? "",
          score: 1,
          isRoot: true,
          mint: data.root.mint,
        },
      },
      ...data.derivatives.slice(0, 20).map((d) => ({
        id: d.mint,
        type: "token",
        position: { x: 0, y: 0 },
        data: {
          label: d.name || d.symbol || d.mint.slice(0, 6),
          symbol: d.symbol ?? "",
          score: d.evidence.composite_score,
          isRoot: false,
          mint: d.mint,
        },
      })),
    ];

    const rawEdges: Edge[] = data.derivatives.slice(0, 20).map((d) => ({
      id: `${data.root!.mint}->${d.mint}`,
      source: data.root!.mint,
      target: d.mint,
      animated: d.evidence.composite_score >= 0.7,
      label: `${Math.round(d.evidence.composite_score * 100)}%`,
      labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.8 },
      style: {
        stroke:
          d.evidence.composite_score >= 0.7
            ? "hsl(var(--success))"
            : d.evidence.composite_score >= 0.4
              ? "hsl(var(--warning))"
              : "hsl(var(--destructive))",
        strokeWidth: 1 + d.evidence.composite_score * 2,
        opacity: 0.5 + d.evidence.composite_score * 0.5,
      },
    }));

    return { initialNodes: layoutGraph(rawNodes, rawEdges), initialEdges: rawEdges };
  }, [data]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const d = node.data as TokenNodeData;
      if (!d.isRoot) router.push(`/lineage/${d.mint}`);
    },
    [router]
  );

  if (!data.root) return null;

  const height = data.derivatives.length <= 3 ? 280 : data.derivatives.length <= 8 ? 380 : 480;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-xs">⎇</div>
        <h3 className="font-semibold text-sm">Family Tree</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {data.derivatives.length > 20 && (
            <span className="mr-1 px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
              Showing 20 of {data.derivatives.length}
            </span>
          )}
          {data.derivatives.length} derivative{data.derivatives.length !== 1 ? "s" : ""}
          {" · "}click a node to analyse
        </span>
      </div>

      <div style={{ height }} className="rounded-md overflow-hidden border border-border/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-30" />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as TokenNodeData;
              return d.isRoot ? "hsl(var(--primary))"
                : d.score >= 0.7 ? "hsl(142, 76%, 36%)"
                : d.score >= 0.4 ? "hsl(38, 92%, 50%)"
                : "hsl(0, 84%, 60%)";
            }}
            maskColor="hsl(var(--background) / 0.7)"
            position="top-right"
            style={{ width: 100, height: 60 }}
          />
        </ReactFlow>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary" />Root</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-success" />High ≥70%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-warning" />Medium ≥40%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-destructive" />Low</span>
      </div>
    </div>
  );
}
