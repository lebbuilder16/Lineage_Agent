import { useEffect, useMemo, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Play, AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { GaugeRing } from '../components/GaugeRing';
import { RiskBadge } from '../components/RiskBadge';
import { AddressChip } from '../components/AddressChip';
import { useLineage, useLineageGraph, useSolTrace, useDeployer, useCartel } from '../lib/query';
import { useAnalysisStore } from '../store/analysis';
import { addRecentScan } from '../layouts/AppLayout';
import { analyzeStream } from '../lib/api';
import type { LineageResult, AnalysisStep, GraphNode, GraphEdge, SolFlowEdge, DeployerProfile } from '../types/api';

// ─── Analysis Progress Strip ─────────────────────────────────────────────────

const ANALYSIS_STEPS: AnalysisStep['step'][] = ['lineage', 'deployer', 'bundle', 'sol_flow', 'cartel', 'ai'];
const STEP_LABELS: Record<string, string> = { lineage: 'Lineage', deployer: 'Deployer', bundle: 'Bundle', sol_flow: 'SOL Flow', cartel: 'Cartel', ai: 'AI' };

function AnalysisProgressStrip({ mint }: { mint: string }) {
  const run = useAnalysisStore((s) => s.runs[mint]);
  if (!run?.running && !run?.result) return null;

  return (
    <div style={{
      position: 'sticky', top: 52, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 16px', height: 32,
      background: 'rgba(10,10,7,0.9)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      fontSize: 'var(--text-small)',
    }}>
      {ANALYSIS_STEPS.map((step) => {
        const s = run?.steps[step];
        const icon = s?.done ? '✓' : s ? '⏳' : '○';
        const color = s?.done ? 'var(--color-success)' : s ? 'var(--color-warning)' : 'rgba(255,255,255,0.3)';
        return (
          <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 4, color }}>
            <span>{icon}</span> {STEP_LABELS[step]}
          </span>
        );
      })}
      {run?.error && <span style={{ color: 'var(--color-error)', marginLeft: 'auto' }}>{run.error}</span>}
    </div>
  );
}

// ─── Collapsible Panel ───────────────────────────────────────────────────────

function Panel({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '12px 0', cursor: 'pointer', background: 'none', border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {open ? <ChevronDown size={16} color="rgba(255,255,255,0.5)" /> : <ChevronRight size={16} color="rgba(255,255,255,0.5)" />}
          <h3 style={{ fontSize: 'var(--text-subheading)', fontWeight: 600, color: '#fff', margin: 0 }}>{title}</h3>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div style={{ padding: '12px 0 20px' }}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Death Clock Panel ───────────────────────────────────────────────────────

function DeathClockPanel({ data }: { data: LineageResult }) {
  const dc = data.death_clock;
  if (!dc) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No death clock data available.</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <StatBox label="Risk Level"><RiskBadge level={dc.risk_level} /></StatBox>
      {dc.predicted_window_start && <StatBox label="Window">{dc.predicted_window_start} — {dc.predicted_window_end ?? '?'}</StatBox>}
      {dc.confidence_level != null && <StatBox label="Confidence">{(dc.confidence_level * 100).toFixed(0)}%</StatBox>}
      {dc.market_signals?.liquidity_trend && <StatBox label="Liquidity">{dc.market_signals.liquidity_trend}</StatBox>}
      {dc.market_signals?.sell_pressure != null && <StatBox label="Sell Pressure">{(dc.market_signals.sell_pressure * 100).toFixed(0)}%</StatBox>}
      {dc.market_signals?.volume_trend && <StatBox label="Volume">{dc.market_signals.volume_trend}</StatBox>}
      {dc.market_signals?.holder_exodus && <StatBox label="Holder Exodus">Yes</StatBox>}
    </div>
  );
}

// ─── Deployer Panel ──────────────────────────────────────────────────────────

function DeployerPanel({ data, onViewFull }: { data: LineageResult; onViewFull: () => void }) {
  const d = data.deployer ?? data.deployer_profile;
  if (!d) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No deployer data available.</p>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <StatBox label="Rug Rate">{d.rug_rate_pct != null ? `${d.rug_rate_pct.toFixed(0)}%` : '—'}</StatBox>
        <StatBox label="Total Rugs">{d.confirmed_rug_count ?? d.confirmed_rugs ?? '—'}</StatBox>
        <StatBox label="Tokens Launched">{d.total_tokens_launched ?? d.total_tokens_deployed ?? '—'}</StatBox>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AddressChip address={d.address} />
        <button onClick={onViewFull} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--color-secondary)', cursor: 'pointer', fontSize: 'var(--text-small)' }}>
          View full profile <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Deployer Sheet ──────────────────────────────────────────────────────────

function DeployerSheet({ address, open, onClose }: { address: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useDeployer(address, open);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" style={{ width: 480, background: 'var(--bg-app)', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
        <SheetHeader>
          <SheetTitle style={{ color: '#fff' }}>Deployer Profile</SheetTitle>
        </SheetHeader>
        {isLoading && <div style={{ padding: 20 }}><Skeleton className="h-8 w-full mb-4" /><Skeleton className="h-8 w-full mb-4" /><Skeleton className="h-8 w-full" /></div>}
        {data && <DeployerSheetContent data={data} />}
      </SheetContent>
    </Sheet>
  );
}

function DeployerSheetContent({ data }: { data: DeployerProfile }) {
  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <GaugeRing value={data.rug_rate_pct ?? 0} size={80} label="Rug Rate" />
        <div>
          <AddressChip address={data.address} chars={6} />
          {data.operator_fingerprint && <p style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>FP: {data.operator_fingerprint}</p>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatBox label="Tokens">{data.total_tokens_launched ?? data.total_tokens_deployed ?? '—'}</StatBox>
        <StatBox label="Confirmed Rugs">{data.confirmed_rug_count ?? data.confirmed_rugs ?? '—'}</StatBox>
        <StatBox label="SOL Extracted">{data.total_sol_extracted != null ? `${data.total_sol_extracted.toFixed(1)} SOL` : '—'}</StatBox>
        <StatBox label="Avg Lifespan">{data.avg_lifespan_days != null ? `${data.avg_lifespan_days.toFixed(0)}d` : data.avg_rug_time_hours != null ? `${data.avg_rug_time_hours.toFixed(0)}h` : '—'}</StatBox>
      </div>
      {data.tokens && data.tokens.length > 0 && (
        <div>
          <h3 style={{ fontSize: 'var(--text-subheading)', fontWeight: 600, color: '#fff', marginBottom: 8 }}>Tokens Launched</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.tokens.map((t) => (
              <div key={t.mint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: 'var(--text-body)', color: '#fff' }}>{t.name || t.mint.slice(0, 8)}</span>
                {t.is_rug && <RiskBadge level="critical" />}
                {t.status === 'rugged' && <RiskBadge level="critical" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bundle Panel ────────────────────────────────────────────────────────────

function BundlePanel({ data }: { data: LineageResult }) {
  const b = data.bundle_report;
  if (!b) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No bundle data available.</p>;

  const verdictColor = b.overall_verdict === 'clean' ? 'var(--color-success)' : b.overall_verdict === 'confirmed_rug' ? 'var(--color-error)' : 'var(--color-warning)';

  return (
    <div>
      <div style={{ padding: '8px 14px', borderRadius: 8, background: verdictColor + '15', border: `1px solid ${verdictColor}33`, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, color: verdictColor, textTransform: 'uppercase', fontSize: 'var(--text-small)' }}>{b.overall_verdict.replace('_', ' ')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <StatBox label="Wallets">{b.bundle_wallets?.length ?? 0}</StatBox>
        <StatBox label="SOL Extracted">{b.total_sol_extracted_confirmed != null ? `${b.total_sol_extracted_confirmed.toFixed(1)}` : '—'}</StatBox>
        <StatBox label="Jito Bundle">{b.jito_bundle_detected ? 'Yes' : 'No'}</StatBox>
      </div>
    </div>
  );
}

// ─── Family Tree Panel (inline SVG) ─────────────────────────────────────────

function FamilyTreePanel({ mint }: { mint: string }) {
  const { data, isLoading } = useLineageGraph(mint);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.nodes.length === 0) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No family tree data.</p>;

  // BFS layout
  const nodeW = 120, nodeH = 48, gapX = 40, gapY = 60;
  const byGen = new Map<number, GraphNode[]>();
  data.nodes.forEach((n) => {
    const g = n.generation ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(n);
  });
  const maxGen = Math.max(...byGen.keys(), 0);
  const maxPerGen = Math.max(...[...byGen.values()].map((a) => a.length), 1);
  const svgW = maxPerGen * (nodeW + gapX);
  const svgH = (maxGen + 1) * (nodeH + gapY) + 20;

  const positions = new Map<string, { x: number; y: number }>();
  byGen.forEach((nodes, gen) => {
    const totalW = nodes.length * nodeW + (nodes.length - 1) * gapX;
    const startX = (svgW - totalW) / 2;
    nodes.forEach((n, i) => {
      positions.set(n.id, { x: startX + i * (nodeW + gapX), y: gen * (nodeH + gapY) + 10 });
    });
  });

  const nodeColor = (score?: number) => {
    if (score == null) return 'rgba(255,255,255,0.1)';
    if (score >= 75) return 'rgba(255,0,51,0.3)';
    if (score >= 50) return 'rgba(255,51,102,0.3)';
    if (score >= 25) return 'rgba(255,153,51,0.3)';
    return 'rgba(0,255,136,0.3)';
  };

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label={`Family tree graph with ${data.nodes.length} tokens`}>
        {/* Edges */}
        {data.edges.map((e: GraphEdge, i: number) => {
          const s = positions.get(e.source);
          const t = positions.get(e.target);
          if (!s || !t) return null;
          return <line key={i} x1={s.x + nodeW / 2} y1={s.y + nodeH} x2={t.x + nodeW / 2} y2={t.y} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />;
        })}
        {/* Nodes */}
        {data.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const isRoot = n.mint === data.root_mint;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={8} fill={nodeColor(n.risk_score)} stroke={isRoot ? 'var(--color-secondary)' : 'rgba(255,255,255,0.1)'} strokeWidth={isRoot ? 2 : 1} />
              <text x={p.x + nodeW / 2} y={p.y + 20} textAnchor="middle" fill="#fff" fontSize={11} fontFamily="Lexend">{n.name || n.symbol || n.mint.slice(0, 8)}</text>
              {n.risk_score != null && <text x={p.x + nodeW / 2} y={p.y + 36} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={9} fontFamily="Lexend">{n.risk_score}%</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── SOL Trace Panel (inline SVG) ────────────────────────────────────────────

function SolTracePanel({ mint }: { mint: string }) {
  const { data, isLoading } = useSolTrace(mint);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data || !data.flows?.length) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No SOL trace data.</p>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <StatBox label="SOL Extracted">{data.total_extracted_sol != null ? `${data.total_extracted_sol.toFixed(1)}` : '—'}</StatBox>
        <StatBox label="USD Value">{data.total_extracted_usd != null ? `$${data.total_extracted_usd.toLocaleString()}` : '—'}</StatBox>
        <StatBox label="Hops">{data.hop_count ?? data.flows.length}</StatBox>
      </div>
      {data.known_cex_detected && (
        <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,153,51,0.1)', border: '1px solid rgba(255,153,51,0.2)', marginBottom: 12, fontSize: 'var(--text-small)', color: 'var(--color-warning)' }}>
          CEX detected in flow path
        </div>
      )}
      {/* Flow table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-small)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>From</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>To</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>SOL</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {data.flows.slice(0, 20).map((f: SolFlowEdge, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)' }}>{(f.from_wallet || f.from_address || '').slice(0, 6)}...</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)' }}>{(f.to_wallet || f.to_address || '').slice(0, 6)}...</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#fff' }}>{(f.amount_sol ?? f.sol_amount ?? 0).toFixed(2)}</td>
                <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.55)' }}>{f.entity_type ?? f.flow_type ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.cross_chain_exits && data.cross_chain_exits.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Cross-Chain Exits</h4>
          {data.cross_chain_exits.map((e, i) => (
            <div key={i} style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.75)', padding: '4px 0' }}>
              {e.bridge_name} → {e.destination_chain}: {e.amount_sol.toFixed(2)} SOL
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cartel Panel ────────────────────────────────────────────────────────────

function CartelPanel({ data }: { data: LineageResult }) {
  const deployerAddr = data.deployer?.address ?? data.deployer_profile?.address ?? '';
  const { data: cartel, isLoading } = useCartel(deployerAddr, !!deployerAddr);

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!cartel && !data.cartel_report) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No cartel data found.</p>;

  const c = cartel ?? data.cartel_report!;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <StatBox label="Deployers">{c.deployer_count ?? c.connected_deployers?.length ?? '—'}</StatBox>
        <StatBox label="Tokens">{c.total_tokens_launched ?? '—'}</StatBox>
        <StatBox label="SOL Extracted">{c.total_sol_extracted != null ? `${c.total_sol_extracted.toFixed(1)}` : '—'}</StatBox>
      </div>
      {(c.funding_links || c.sniper_ring_count || c.shared_lp_count || c.dna_match_count) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c.funding_links ? <SignalChip label="Funding Links" count={c.funding_links} /> : null}
          {c.sniper_ring_count ? <SignalChip label="Sniper Ring" count={c.sniper_ring_count} /> : null}
          {c.shared_lp_count ? <SignalChip label="Shared LP" count={c.shared_lp_count} /> : null}
          {c.dna_match_count ? <SignalChip label="DNA Match" count={c.dna_match_count} /> : null}
        </div>
      )}
    </div>
  );
}

function SignalChip({ label, count }: { label: string; count: number }) {
  return (
    <span style={{ padding: '2px 10px', borderRadius: 'var(--radius-pill)', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)', fontSize: 'var(--text-tiny)', color: 'var(--color-accent)' }}>
      {label}: {count}
    </span>
  );
}

// ─── Flags Panel ─────────────────────────────────────────────────────────────

function FlagsPanel({ data }: { data: LineageResult }) {
  if (!data.suspicious_flags?.length) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No suspicious flags detected.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.suspicious_flags.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.1)' }}>
          <AlertTriangle size={14} color="var(--color-accent)" />
          <span style={{ fontSize: 'var(--text-body)', color: 'rgba(255,255,255,0.7)' }}>{f}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Box helper ─────────────────────────────────────────────────────────

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-body)', color: '#fff', fontWeight: 500 }}>{children}</div>
    </div>
  );
}

// ─── Token Workspace (main page) ─────────────────────────────────────────────

export default function TokenWorkspace() {
  const { mint } = useParams<{ mint: string }>();
  const { data, isLoading, error } = useLineage(mint ?? '', !!mint);
  const [deployerSheetOpen, setDeployerSheetOpen] = useState(false);

  const { setStep, setResult, setRunning, setError } = useAnalysisStore();
  const run = useAnalysisStore((s) => mint ? s.runs[mint] : undefined);

  // Track recent scan
  useEffect(() => {
    if (mint) addRecentScan(mint);
  }, [mint]);

  const riskScore = useMemo(() => {
    if (!data) return 0;
    return data.risk_score ?? (data.death_clock?.confidence_level ? data.death_clock.confidence_level * 100 : 0);
  }, [data]);

  const startAnalysis = useCallback(() => {
    if (!mint || run?.running) return;
    setRunning(mint, true);
    analyzeStream(
      mint,
      (step) => setStep(mint, step),
      (result) => { if (result) setResult(mint, result); },
      (err) => setError(mint, err.message),
    );
  }, [mint, run?.running, setRunning, setStep, setResult, setError]);

  const deployerAddr = data?.deployer?.address ?? data?.deployer_profile?.address ?? '';

  if (!mint) return <p style={{ color: 'rgba(255,255,255,0.55)' }}>No token address provided.</p>;

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--color-error)', marginBottom: 12 }}>Failed to load token data</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 'var(--text-small)' }}>{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div>
      <AnalysisProgressStrip mint={mint} />

      {/* Hero: two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, marginBottom: 24 }}>
        {/* Token Hero Panel */}
        <div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          ) : data ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {data.image_uri && <img src={data.image_uri} alt={data.name || 'Token'} width={64} height={64} loading="lazy" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} />}
              <div>
                <h1 style={{ fontSize: 'var(--text-main-heading)', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
                  {data.name || mint.slice(0, 12)}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {data.symbol && <span style={{ fontSize: 'var(--text-subheading)', color: 'rgba(255,255,255,0.5)' }}>{data.symbol}</span>}
                  <AddressChip address={mint} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Risk Summary Panel (sticky) */}
        <div style={{ position: 'sticky', top: 84, alignSelf: 'start' }}>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : data ? (
            <div style={{
              padding: 20, borderRadius: 'var(--radius-card)',
              background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <GaugeRing value={riskScore} size={96} label="Risk Score" />
              <RiskBadge level={data.risk_level} />
              {data.death_clock && (
                <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                  Death Clock: {data.death_clock.risk_level}
                </span>
              )}
              <button
                onClick={startAnalysis}
                disabled={run?.running}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', borderRadius: 'var(--radius-pill)',
                  background: run?.running ? 'rgba(111,106,207,0.3)' : 'var(--color-primary)',
                  color: '#fff', border: 'none', cursor: run?.running ? 'default' : 'pointer',
                  fontSize: 'var(--text-body)', fontWeight: 500,
                }}
              >
                <Play size={14} /> {run?.running ? 'Analyzing...' : 'Run Analysis'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Collapsible Panels */}
      {data && (
        <div style={{ maxWidth: 800 }}>
          <Panel title="Death Clock"><DeathClockPanel data={data} /></Panel>
          <Panel title="Deployer"><DeployerPanel data={data} onViewFull={() => setDeployerSheetOpen(true)} /></Panel>
          <Panel title="Bundle Extraction"><BundlePanel data={data} /></Panel>
          <Panel title="Family Tree"><FamilyTreePanel mint={mint} /></Panel>
          <Panel title="SOL Trace"><SolTracePanel mint={mint} /></Panel>
          <Panel title="Cartel Detection"><CartelPanel data={data} /></Panel>
          <Panel title="Suspicious Flags"><FlagsPanel data={data} /></Panel>
        </div>
      )}

      {/* Deployer Sheet */}
      {deployerAddr && (
        <DeployerSheet address={deployerAddr} open={deployerSheetOpen} onClose={() => setDeployerSheetOpen(false)} />
      )}

      {/* Responsive */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 280px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
