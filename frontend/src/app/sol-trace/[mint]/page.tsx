"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchSolTrace, type SolFlowReport, type SolFlowEdge, ApiError } from "@/lib/api";

interface Props {
  params: Promise<{ mint: string }>;
}

// Known CEX addresses (same as backend)
const CEX_PREFIXES = [
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", // Binance
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS", // Coinbase
];

function buildGraph(report: SolFlowReport): { nodes: Node[]; edges: Edge[] } {
  const isCex = (addr: string) => CEX_PREFIXES.some((p) => addr.startsWith(p));
  const isTerminal = (addr: string) => report.terminal_wallets.includes(addr);

  // Gather unique addresses
  const addrSet = new Set<string>([report.deployer]);
  report.flows.forEach((f) => {
    addrSet.add(f.from_address);
    addrSet.add(f.to_address);
  });
  const addrs = Array.from(addrSet);

  // Group by hop for x-axis layout
  const hopOf: Record<string, number> = { [report.deployer]: 0 };
  report.flows.forEach((f) => {
    if (hopOf[f.to_address] === undefined) hopOf[f.to_address] = f.hop;
    hopOf[f.from_address] = Math.min(hopOf[f.from_address] ?? f.hop - 1, f.hop - 1);
  });

  // Y position within each hop column
  const hopCounts: Record<number, number> = {};
  addrs.forEach((a) => {
    const h = hopOf[a] ?? 0;
    hopCounts[h] = (hopCounts[h] ?? 0) + 1;
  });
  const hopIdx: Record<number, number> = {};
  const nodeY: Record<string, number> = {};
  addrs.forEach((a) => {
    const h = hopOf[a] ?? 0;
    hopIdx[h] = (hopIdx[h] ?? 0);
    const total = hopCounts[h];
    nodeY[a] = (hopIdx[h] - Math.floor(total / 2)) * 100;
    hopIdx[h]++;
  });

  const nodes: Node[] = addrs.map((addr) => {
    const hop = hopOf[addr] ?? 0;
    const isSource = addr === report.deployer;
    const cex = isCex(addr);
    const terminal = isTerminal(addr);
    const bgColor = isSource
      ? "#ef4444"            // red — deployer
      : cex
        ? "#f97316"          // orange — CEX
        : terminal
          ? "#6b7280"        // grey — terminal unknown
          : "#3b82f6";       // blue — intermediate

    return {
      id: addr,
      position: { x: hop * 260, y: nodeY[addr] ?? 0 },
      data: {
        label: (
          <div className="text-center px-1">
            <div className="text-[10px] font-mono leading-tight">
              {addr.slice(0, 4)}…{addr.slice(-4)}
            </div>
            {cex && <div className="text-[9px] text-orange-200 font-bold mt-0.5">CEX</div>}
            {isSource && <div className="text-[9px] text-red-200 font-bold mt-0.5">DEPLOYER</div>}
          </div>
        ),
      },
      style: {
        background: bgColor,
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontSize: "11px",
        width: 120,
        padding: "6px 4px",
      },
    };
  });

  // Aggregate parallel flows into a single edge
  const edgeMap: Record<string, SolFlowEdge & { count: number }> = {};
  report.flows.forEach((f) => {
    const key = `${f.from_address}::${f.to_address}`;
    if (edgeMap[key]) {
      edgeMap[key].amount_sol += f.amount_sol;
      edgeMap[key].count++;
    } else {
      edgeMap[key] = { ...f, count: 1 };
    }
  });

  const maxSol = Math.max(...Object.values(edgeMap).map((e) => e.amount_sol), 1);

  const edges: Edge[] = Object.entries(edgeMap).map(([key, f]) => {
    const strokeWidth = 1 + (f.amount_sol / maxSol) * 6;
    return {
      id: key,
      source: f.from_address,
      target: f.to_address,
      label: `${f.amount_sol.toFixed(1)} SOL`,
      animated: true,
      style: { stroke: "#f97316", strokeWidth },
      labelStyle: { fontSize: "10px", fill: "#f97316", fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
    };
  });

  return { nodes, edges };
}

function formatSol(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K SOL`;
  return `${n.toFixed(2)} SOL`;
}

function formatUsd(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return ` ≈ $${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return ` ≈ $${(n / 1_000).toFixed(1)}K`;
  return ` ≈ $${n.toFixed(0)}`;
}

export default function SolTracePage({ params }: Props) {
  const { mint } = use(params);
  const [report, setReport] = useState<SolFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchSolTrace(mint)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.detail : String(e)))
      .finally(() => setLoading(false));
  }, [mint]);

  const graph = useMemo(() => (report ? buildGraph(report) : null), [report]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-4">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-96 rounded-xl bg-muted animate-pulse" />
      </main>
    );
  }

  if (error || !report || !graph) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-destructive">{error ?? "No flow data available for this token."}</p>
        <Link href={`/lineage/${mint}`} className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to lineage
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">💸 SOL Flow Trace</h1>
          {report.known_cex_detected && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
              CEX destination detected
            </span>
          )}
        </div>
        <Link href={`/lineage/${mint}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
          ← {mint.slice(0, 8)}…
        </Link>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-4 text-sm">
        <div>
          <span className="text-muted-foreground">Extracted: </span>
          <span className="font-bold text-destructive">
            {formatSol(report.total_extracted_sol)}{formatUsd(report.total_extracted_usd)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Hops: </span>
          <span className="font-bold">{report.hop_count}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Destinations: </span>
          <span className="font-bold">{report.terminal_wallets.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Flows: </span>
          <span className="font-bold">{report.flows.length}</span>
        </div>
      </div>

      {/* Flow graph */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Flow Graph</h2>
        <div className="legend flex flex-wrap gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" /> Deployer</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-500" /> Intermediate</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-orange-500" /> CEX</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gray-500" /> Terminal</span>
        </div>
        <div className="rounded-xl border border-border overflow-hidden" style={{ height: "520px" }}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#333" />
            <Controls />
            <MiniMap nodeColor={(n) => (n.style?.background as string) ?? "#555"} />
          </ReactFlow>
        </div>
      </section>

      {/* Terminal wallets */}
      {report.terminal_wallets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Terminal Wallets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.terminal_wallets.map((w) => (
              <div
                key={w}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
              >
                <code className="font-mono text-xs text-muted-foreground">{w}</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
