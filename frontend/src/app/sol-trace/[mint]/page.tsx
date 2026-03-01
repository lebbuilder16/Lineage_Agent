"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchSolTrace,
  type CrossChainExit,
  type SolFlowReport,
  type SolFlowEdge,
  ApiError,
} from "@/lib/api";

interface Props {
  params: { mint: string };
}

// ── Colour palette ────────────────────────────────────────────────────────────
const ENTITY_COLORS: Record<string, string> = {
  deployer:  "#ef4444",  // red
  cex:       "#f97316",  // orange
  dex:       "#8b5cf6",  // purple
  bridge:    "#a855f7",  // violet
  launchpad: "#ec4899",  // pink
  mev:       "#14b8a6",  // teal
  system:    "#6b7280",  // grey
  terminal:  "#4b5563",  // dark grey
  wallet:    "#3b82f6",  // blue (unknown wallets)
};

function nodeColor(addr: string, report: SolFlowReport): string {
  if (addr === report.deployer) return ENTITY_COLORS.deployer;
  const flow = report.flows.find((f) => f.to_address === addr || f.from_address === addr);
  if (!flow) return ENTITY_COLORS.wallet;
  const et = flow.to_address === addr ? flow.entity_type : null;
  if (et && ENTITY_COLORS[et]) return ENTITY_COLORS[et];
  if (report.terminal_wallets.includes(addr)) return ENTITY_COLORS.terminal;
  return ENTITY_COLORS.wallet;
}

// ── buildGraph ────────────────────────────────────────────────────────────────

function buildGraph(
  report: SolFlowReport,
  activeFlows: SolFlowEdge[],
  nodeSpacing: number = 280,
  nodeWidth: number = 126,
): { nodes: Node[]; edges: Edge[] } {
  const addrSet = new Set<string>([report.deployer]);
  activeFlows.forEach((f) => {
    addrSet.add(f.from_address);
    addrSet.add(f.to_address);
  });
  const addrs = Array.from(addrSet);

  const hopOf: Record<string, number> = { [report.deployer]: 0 };
  activeFlows.forEach((f) => {
    if (hopOf[f.to_address] === undefined) hopOf[f.to_address] = f.hop;
    hopOf[f.from_address] = Math.min(hopOf[f.from_address] ?? f.hop - 1, f.hop - 1);
  });

  const hopCounts: Record<number, number> = {};
  addrs.forEach((a) => { const h = hopOf[a] ?? 0; hopCounts[h] = (hopCounts[h] ?? 0) + 1; });
  const hopIdx: Record<number, number> = {};
  const nodeY: Record<string, number> = {};
  addrs.forEach((a) => {
    const h = hopOf[a] ?? 0;
    hopIdx[h] = hopIdx[h] ?? 0;
    const total = hopCounts[h];
    nodeY[a] = (hopIdx[h] - Math.floor(total / 2)) * 110;
    hopIdx[h]++;
  });

  const nodeLabel = (addr: string): string => {
    for (const f of report.flows) {
      if (f.to_address === addr && f.to_label) return f.to_label;
      if (f.from_address === addr && f.from_label) return f.from_label;
    }
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  };

  const entityType = (addr: string): string | null => {
    if (addr === report.deployer) return "deployer";
    for (const f of report.flows) {
      if (f.to_address === addr && f.entity_type) return f.entity_type;
    }
    if (report.terminal_wallets.includes(addr)) return "terminal";
    return null;
  };

  const nodes: Node[] = addrs.map((addr) => {
    const hop = hopOf[addr] ?? 0;
    const bg = nodeColor(addr, report);
    const et = entityType(addr);
    const label = nodeLabel(addr);
    const isLong = label.length > 12;

    return {
      id: addr,
      position: { x: hop * nodeSpacing, y: nodeY[addr] ?? 0 },
      data: {
        label: (
          <div className="text-center px-1">
            <div className={`font-mono leading-tight ${isLong ? "text-[8px]" : "text-[10px]"}`}>
              {label}
            </div>
            {et && (
              <div className="text-[8px] font-bold mt-0.5 uppercase tracking-wide opacity-80">
                {et}
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: bg,
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontSize: "11px",
        width: nodeWidth,
        padding: "6px 4px",
      },
    };
  });

  const edgeMap: Record<string, SolFlowEdge & { count: number }> = {};
  activeFlows.forEach((f) => {
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
      label: `${f.amount_sol.toFixed(2)} SOL`,
      animated: true,
      style: { stroke: "#f97316", strokeWidth },
      labelStyle: { fontSize: "10px", fill: "#f97316", fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
    };
  });

  return { nodes, edges };
}

// ── Flow Timeline component ──────────────────────────────────────────────────

interface FlowTimelineProps {
  flows: SolFlowEdge[];
  rugTimestamp: Date | null;
  value: number;
  onChange: (v: number) => void;
  playing: boolean;
  onPlayPause: () => void;
  cutoffDate: Date | null;
}

function FlowTimeline({
  flows,
  rugTimestamp,
  value,
  onChange,
  playing,
  onPlayPause,
  cutoffDate,
}: FlowTimelineProps) {
  const timedFlows = flows.filter((f) => f.block_time !== null);
  if (timedFlows.length === 0) return null;

  const times = timedFlows.map((f) => new Date(f.block_time!).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const relLabel = (): string => {
    if (!cutoffDate) return "All time";
    const base = rugTimestamp ?? new Date(minT);
    const diffMs = cutoffDate.getTime() - base.getTime();
    if (diffMs < 0) return "Before rug";
    const s = Math.floor(diffMs / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `+${h}h ${m}m after rug`;
    return `+${m}m after rug`;
  };

  const visible = cutoffDate
    ? timedFlows.filter((f) => new Date(f.block_time!).getTime() <= cutoffDate.getTime()).length
    : timedFlows.length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">⏱ Flow Replay Timeline</h3>
        <span className="text-xs text-muted-foreground">
          {visible} / {timedFlows.length} flows visible
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onPlayPause}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm transition hover:opacity-80"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{new Date(minT).toLocaleTimeString()}</span>
            <span className="font-semibold text-orange-400">{relLabel()}</span>
            <span>{new Date(maxT).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SolTracePage({ params }: Props) {
  const { mint } = params;
  const [report, setReport] = useState<SolFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [sliderVal, setSliderVal] = useState(100);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSolTrace(mint)
      .then((r) => { setReport(r); setSliderVal(100); })
      .catch((e) => setError(e instanceof ApiError ? e.detail : String(e)))
      .finally(() => setLoading(false));
  }, [mint]);

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setSliderVal((v) => {
          if (v >= 100) { setPlaying(false); return 100; }
          return Math.min(v + 1, 100);
        });
      }, 80);
    } else if (playRef.current) {
      clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing]);

  const rugTimestamp = useMemo(() => {
    if (!report?.rug_timestamp) return null;
    return new Date(report.rug_timestamp);
  }, [report]);

  const timelineRange = useMemo(() => {
    if (!report) return null;
    const timed = report.flows.filter((f) => f.block_time !== null);
    if (timed.length === 0) return null;
    const times = timed.map((f) => new Date(f.block_time!).getTime());
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [report]);

  const cutoffDate = useMemo(() => {
    if (!timelineRange) return null;
    const { min, max } = timelineRange;
    const t = min + ((max - min) * sliderVal) / 100;
    return new Date(t);
  }, [sliderVal, timelineRange]);

  const activeFlows = useMemo(() => {
    if (!report) return [];
    if (!cutoffDate || sliderVal === 100) return report.flows;
    return report.flows.filter((f) => {
      if (!f.block_time) return true;
      return new Date(f.block_time).getTime() <= cutoffDate.getTime();
    });
  }, [report, cutoffDate, sliderVal]);

  const graph = useMemo(() => {
    if (!report) return null;
    const isSm = typeof window !== "undefined" && window.innerWidth < 640;
    return buildGraph(report, activeFlows, isSm ? 160 : 280, isSm ? 90 : 126);
  }, [report, activeFlows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-96 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !report || !graph) {
    const is404 = error?.includes("404") || error?.includes("No deployer") || error?.includes("analyse it first") || error?.includes("No SOL flows");
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          {is404 ? (
            <>
              <div className="text-4xl">🔍</div>
              <h2 className="text-xl font-semibold">No trace data available</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                This token hasn&apos;t been analysed yet, or no SOL flows were detected.
                Run a lineage analysis first to populate the data.
              </p>
              <Link
                href={`/lineage/${mint}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                ← Analyse this token
              </Link>
            </>
          ) : (
            <>
              <div className="text-4xl">⚠️</div>
              <h2 className="text-xl font-semibold text-destructive">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">{error ?? "No flow data available for this token."}</p>
              <Link
                href={`/lineage/${mint}`}
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                ← Back to lineage
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const hasBridge = report.cross_chain_exits.length > 0;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">💸 SOL Flow Trace</h1>
          {report.known_cex_detected && (
            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-400">
              CEX destination detected
            </span>
          )}
          {hasBridge && (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-400">
              🌉 Cross-chain exit detected
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
        {report.rug_timestamp && (
          <div>
            <span className="text-muted-foreground">Rug at: </span>
            <span className="font-bold">{new Date(report.rug_timestamp).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <FlowTimeline
        flows={report.flows}
        rugTimestamp={rugTimestamp}
        value={sliderVal}
        onChange={(v) => { setSliderVal(v); setPlaying(false); }}
        playing={playing}
        onPlayPause={() => {
          if (sliderVal >= 100) setSliderVal(0);
          setPlaying((p) => !p);
        }}
        cutoffDate={cutoffDate}
      />

      {/* Flow graph */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Flow Graph</h2>
        <div className="legend flex flex-wrap gap-3 mb-3 text-xs">
          {Object.entries(ENTITY_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              <span className="capitalize">{type}</span>
            </span>
          ))}
        </div>
        <div className="rounded-xl border border-border overflow-hidden h-[300px] sm:h-[420px] md:h-[520px]">
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

      {/* Cross-chain exits */}
      {hasBridge && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🌉 Cross-Chain Exits
            <span className="text-sm font-normal text-muted-foreground">
              ({report.cross_chain_exits.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.cross_chain_exits.map((exit: CrossChainExit, i: number) => (
              <div
                key={i}
                className="rounded-xl border border-violet-500/30 bg-card p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-400">{exit.bridge_name}</span>
                  <span className="text-xs font-bold text-destructive">{formatSol(exit.amount_sol)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {exit.from_address.slice(0, 6)}…{exit.from_address.slice(-4)}
                  </span>
                  <span>→</span>
                  <span className="font-semibold text-violet-300">{exit.dest_chain}</span>
                  {exit.dest_address && (
                    <>
                      <span>→</span>
                      <span className="font-mono text-[10px]">{exit.dest_address.slice(0, 10)}…</span>
                    </>
                  )}
                </div>
                {exit.tx_signature && (
                  <a
                    href={`https://solscan.io/tx/${exit.tx_signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[10px] text-primary hover:underline"
                  >
                    View tx on Solscan ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Terminal wallets */}
      {report.terminal_wallets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            Terminal Wallets
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({report.terminal_wallets.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.terminal_wallets.map((w) => {
              const labelInfo = report.flows.find((f) => f.to_address === w);
              const label = labelInfo?.to_label;
              return (
                <div
                  key={w}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="space-y-0.5">
                    {label && (
                      <div className="text-xs font-semibold text-orange-400">{label}</div>
                    )}
                    <code className="font-mono text-xs text-muted-foreground">{w}</code>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}


