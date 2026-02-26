"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
import { fetchCartelCommunity, type CartelCommunity, type CartelEdge, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Three.js must be client-side only (no SSR)
const CartelGraph3D = dynamic(
  () => import("@/components/forensics/CartelGraph3D"),
  { ssr: false, loading: () => <div className="h-[580px] rounded-xl border border-border bg-muted animate-pulse" /> }
);

interface Props {
  params: { id: string };
}

const SIGNAL_COLORS: Record<string, { stroke: string; label: string }> = {
  dna_match:     { stroke: "#a855f7", label: "DNA match" },
  sol_transfer:  { stroke: "#f97316", label: "SOL transfer" },
  timing_sync:   { stroke: "#eab308", label: "Timing sync" },
  phash_cluster: { stroke: "#14b8a6", label: "Image cluster" },
  cross_holding: { stroke: "#3b82f6", label: "Cross-holding" },
  funding_link:  { stroke: "#ef4444", label: "💸 Funding link" },
  shared_lp:     { stroke: "#f97316", label: "🏊 Shared LP" },
  sniper_ring:   { stroke: "#f43f5e", label: "🎯 Sniper ring" },
};

const CONFIDENCE_CONFIG = {
  high:   { badge: "bg-neon/20 text-neon border-neon/30",               label: "High confidence" },
  medium: { badge: "bg-warning/20 text-warning border-warning/30",      label: "Medium confidence" },
  low:    { badge: "bg-muted text-muted-foreground border-border",      label: "Low confidence" },
} as const;

function buildGraph(community: CartelCommunity): { nodes: Node[]; edges: Edge[] } {
  // Count tokens per wallet from edges evidence
  const tokenCounts: Record<string, number> = {};
  community.wallets.forEach((w) => (tokenCounts[w] = 0));
  community.edges.forEach((e) => {
    tokenCounts[e.wallet_a] = (tokenCounts[e.wallet_a] ?? 0) + 1;
  });
  const maxTokens = Math.max(...Object.values(tokenCounts), 1);

  // Circular layout
  const n = community.wallets.length;
  const radius = Math.max(180, n * 40);

  const nodes: Node[] = community.wallets.map((wallet, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const nodeSize = 24 + (tokenCounts[wallet] / maxTokens) * 32;
    return {
      id: wallet,
      position: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
      data: {
        label: (
          <div className="text-center px-1">
            <div className="text-[10px] font-mono leading-tight">
              {wallet.slice(0, 4)}…{wallet.slice(-4)}
            </div>
          </div>
        ),
      },
      style: {
        background: "#4f46e5",
        color: "#fff",
        border: "none",
        borderRadius: "50%",
        fontSize: "10px",
        width: nodeSize,
        height: nodeSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
    };
  });

  // Aggregate edges: strongest signal per pair
  const edgeMap: Record<string, CartelEdge> = {};
  community.edges.forEach((e) => {
    const key = [e.wallet_a, e.wallet_b].sort().join("::");
    if (!edgeMap[key] || e.signal_strength > edgeMap[key].signal_strength) {
      edgeMap[key] = e;
    }
  });

  const edges: Edge[] = Object.entries(edgeMap).map(([key, e]) => {
    const color = SIGNAL_COLORS[e.signal_type]?.stroke ?? "#888";
    return {
      id: key,
      source: e.wallet_a,
      target: e.wallet_b,
      animated: e.signal_strength > 0.7,
      style: { stroke: color, strokeWidth: 1 + e.signal_strength * 3 },
      label: SIGNAL_COLORS[e.signal_type]?.label ?? e.signal_type,
      labelStyle: { fontSize: "9px", fill: color, fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
    };
  });

  return { nodes, edges };
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function CartelPage({ params }: Props) {
  const { id } = params;
  const [community, setCommunity] = useState<CartelCommunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"2d" | "3d">("3d");

  useEffect(() => {
    setLoading(true);
    fetchCartelCommunity(id)
      .then(setCommunity)
      .catch((e) => setError(e instanceof ApiError ? e.detail : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const graph = useMemo(() => (community ? buildGraph(community) : null), [community]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-4">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-[520px] rounded-xl bg-muted animate-pulse" />
      </main>
    );
  }

  if (error || !community || !graph) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-destructive">{error ?? "Community not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back</Link>
      </main>
    );
  }

  const cfg = CONFIDENCE_CONFIG[community.confidence];
  const signalColor = SIGNAL_COLORS[community.strongest_signal];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">🕸️ Cartel Community</h1>
          <span
            className="rounded-full border px-3 py-1 text-xs font-bold"
            style={{ borderColor: signalColor?.stroke, color: signalColor?.stroke, backgroundColor: `${signalColor?.stroke}18` }}
          >
            {signalColor?.label ?? community.strongest_signal}
          </span>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", cfg.badge)}>
            {cfg.label}
          </span>
        </div>
        <code className="text-sm text-muted-foreground font-mono">{community.community_id}</code>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Wallets", value: community.wallets.length },
          { label: "Tokens launched", value: community.total_tokens_launched },
          { label: "Rugs", value: community.total_rugs, accent: true },
          { label: "Extracted", value: formatUsd(community.estimated_extracted_usd), accent: true },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
            <span className={cn("text-xl font-bold tabular-nums", accent ? "text-destructive" : "text-foreground")}>
              {value}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Network Graph</h2>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
            <button
              onClick={() => setView("3d")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                view === "3d" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              3D
            </button>
            <button
              onClick={() => setView("2d")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                view === "2d" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              2D
            </button>
          </div>
        </div>

        {view === "3d" ? (
          <CartelGraph3D wallets={community.wallets} edges={community.edges} />
        ) : (
          <>
            {/* 2D legend */}
            <div className="flex flex-wrap gap-4 mb-3 text-xs">
              {Object.entries(SIGNAL_COLORS).map(([key, { stroke, label }]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: stroke }} />
                  {label}
                </span>
              ))}
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
                <MiniMap nodeColor={() => "#4f46e5"} />
              </ReactFlow>
            </div>
          </>
        )}
      </section>

      {/* Active since */}
      {community.active_since && (
        <p className="text-sm text-muted-foreground">
          Active since: <span className="text-foreground font-medium">{new Date(community.active_since).toLocaleDateString()}</span>
        </p>
      )}

      {/* Wallets list */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Wallet Members ({community.wallets.length})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {community.wallets.map((w) => (
            <div
              key={w}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <code className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{w}</code>
              <Link
                href={`/deployer/${w}`}
                className="ml-2 shrink-0 text-xs text-primary hover:text-neon transition-colors"
              >
                Profile →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Edges table */}
      {community.edges.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Signal Edges ({community.edges.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Wallet A</th>
                  <th className="text-left py-2 pr-4 font-medium">Wallet B</th>
                  <th className="text-left py-2 pr-4 font-medium">Signal</th>
                  <th className="text-right py-2 font-medium">Strength</th>
                </tr>
              </thead>
              <tbody>
                {community.edges
                  .slice()
                  .sort((a, b) => b.signal_strength - a.signal_strength)
                  .slice(0, 20)
                  .map((e, i) => {
                    const sc = SIGNAL_COLORS[e.signal_type];
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                          {e.wallet_a.slice(0, 6)}…{e.wallet_a.slice(-4)}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                          {e.wallet_b.slice(0, 6)}…{e.wallet_b.slice(-4)}
                        </td>
                        <td className="py-1.5 pr-4">
                          <span
                            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{ borderColor: sc?.stroke, color: sc?.stroke, backgroundColor: `${sc?.stroke}18` }}
                          >
                            {sc?.label ?? e.signal_type}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">
                          {(e.signal_strength * 100).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
