import { useEffect, useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLineage, useLineageGraph, useSolTrace } from '../lib/query';
import { useAnalysisStore } from '../store/analysis';
import { analyzeStream } from '../lib/api';
import { addToHistory } from '../components/CommandPalette';
import type { LineageResult } from '../types/api';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ff-section">
      <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>{title}</h2>
      {children}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 400, letterSpacing: '-0.48px', color: '#000' }}>{value ?? '—'}</div>
    </div>
  );
}

function RiskDisplay({ data }: { data: LineageResult }) {
  const score = data.risk_score ?? 0;
  const level = data.risk_level ?? 'unknown';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
      <span className="ff-stat-number">{score}</span>
      <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.48px', color: '#000', textTransform: 'uppercase' }}>{level}</span>
    </div>
  );
}

const STEPS = ['lineage', 'deployer', 'bundle', 'sol_flow', 'cartel', 'ai'] as const;

export default function LineagePage() {
  const { mint } = useParams<{ mint: string }>();
  const { data, isLoading, error } = useLineage(mint ?? '');
  const { data: graph } = useLineageGraph(mint ?? '');
  const { data: solTrace } = useSolTrace(mint ?? '');
  const { setStep, setResult, setRunning, setError } = useAnalysisStore();
  const run = useAnalysisStore(s => mint ? s.runs[mint] : undefined);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => { if (mint) addToHistory(mint); }, [mint]);

  const startAnalysis = useCallback(() => {
    if (!mint || run?.running) return;
    setRunning(mint, true);
    analyzeStream(mint, step => setStep(mint, step), result => { if (result) setResult(mint, result); }, err => setError(mint, err.message));
  }, [mint, run?.running, setRunning, setStep, setResult, setError]);

  if (!mint) return <p className="ff-body">No token address provided.</p>;

  if (error) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 16, color: '#000', marginBottom: 8 }}>Failed to load token data</p>
      <p className="ff-body">{(error as Error).message}</p>
    </div>
  );

  if (isLoading) return (
    <div style={{ maxWidth: 700 }}>
      <div className="ff-skeleton" style={{ height: 48, width: '60%', marginBottom: 16 }} />
      <div className="ff-skeleton" style={{ height: 24, width: '40%', marginBottom: 40 }} />
      {[1,2,3,4].map(i => <div key={i} className="ff-skeleton" style={{ height: 80, marginBottom: 1 }} />)}
    </div>
  );

  if (!data) return null;

  const deployer = data.deployer ?? data.deployer_profile;
  const dc = data.death_clock;
  const bundle = data.bundle_report;

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      {/* Hero */}
      <div className="ff-section">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          {data.image_uri && <img src={data.image_uri} alt={data.name || ''} width={56} height={56} loading="lazy" style={{ width: 56, height: 56, border: '1px solid #000', objectFit: 'cover' }} />}
          <div>
            <h1 style={{ fontSize: 'clamp(24px, 3vw, 37px)', fontWeight: 400, letterSpacing: '-1.11px', lineHeight: 1, margin: 0 }}>
              {data.name || mint.slice(0, 12)}
            </h1>
            {data.symbol && <span style={{ fontSize: 16, color: ff.gray, letterSpacing: '-0.48px' }}>{data.symbol}</span>}
          </div>
        </div>
        <div className="ff-address" style={{ marginBottom: 16 }}>{mint}</div>
        <RiskDisplay data={data} />

        {/* Analysis trigger */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={startAnalysis} disabled={run?.running} className="ff-btn" style={{ opacity: run?.running ? 0.5 : 1 }}>
            {run?.running ? 'Analysing…' : 'Run AI Analysis'}
          </button>
          {run?.running && (
            <div style={{ display: 'flex', gap: 8, fontSize: 13, color: ff.gray }}>
              {STEPS.map(s => {
                const st = run?.steps[s];
                return <span key={s}>{st?.done ? '✓' : st ? '…' : '○'} {s}</span>;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Death Clock */}
      {dc && (
        <Section title="Death Clock">
          <div className="ff-stat-grid">
            <StatItem label="Risk Level" value={dc.risk_level?.toUpperCase()} />
            {dc.predicted_window_start && <StatItem label="Window" value={`${dc.predicted_window_start} — ${dc.predicted_window_end ?? '?'}`} />}
            {dc.confidence_level != null && <StatItem label="Confidence" value={`${(dc.confidence_level * 100).toFixed(0)}%`} />}
            {dc.market_signals?.liquidity_trend && <StatItem label="Liquidity" value={dc.market_signals.liquidity_trend} />}
            {dc.market_signals?.sell_pressure != null && <StatItem label="Sell Pressure" value={`${(dc.market_signals.sell_pressure * 100).toFixed(0)}%`} />}
            {dc.market_signals?.volume_trend && <StatItem label="Volume" value={dc.market_signals.volume_trend} />}
          </div>
        </Section>
      )}

      {/* Deployer */}
      {deployer && (
        <Section title="Deployer">
          <div className="ff-stat-grid" style={{ marginBottom: 12 }}>
            <StatItem label="Rug Rate" value={deployer.rug_rate_pct != null ? `${deployer.rug_rate_pct.toFixed(0)}%` : undefined} />
            <StatItem label="Confirmed Rugs" value={deployer.confirmed_rug_count ?? deployer.confirmed_rugs} />
            <StatItem label="Tokens Launched" value={deployer.total_tokens_launched ?? deployer.total_tokens_deployed} />
            <StatItem label="SOL Extracted" value={deployer.total_sol_extracted != null ? `${deployer.total_sol_extracted.toFixed(1)} SOL` : undefined} />
          </div>
          <Link to={`/deployer/${deployer.address}`} className="ff-link">
            View deployer profile <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </Section>
      )}

      {/* Bundle */}
      {bundle && (
        <Section title="Bundle Extraction">
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.48px', color: '#000', textTransform: 'uppercase', marginBottom: 12 }}>
            {bundle.overall_verdict?.replace('_', ' ')}
          </div>
          <div className="ff-stat-grid">
            <StatItem label="Wallets" value={bundle.bundle_wallets?.length} />
            <StatItem label="SOL Extracted" value={bundle.total_sol_extracted_confirmed != null ? `${bundle.total_sol_extracted_confirmed.toFixed(1)}` : undefined} />
            <StatItem label="Jito Bundle" value={bundle.jito_bundle_detected ? 'Yes' : 'No'} />
          </div>
        </Section>
      )}

      {/* Family Tree */}
      {graph && graph.nodes.length > 0 && (
        <Section title="Family Tree">
          <p className="ff-body" style={{ marginBottom: 12 }}>{graph.nodes.length} tokens in family · {graph.edges.length} connections</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {graph.nodes.slice(0, 10).map(n => (
              <Link key={n.id} to={`/lineage/${n.mint}`} className="ff-row" style={{ textDecoration: 'none' }}>
                <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: '#000' }}>{n.name || n.symbol || n.mint.slice(0, 12)}</span>
                {n.risk_score != null && <span className="ff-label" style={{ fontSize: 13 }}>{n.risk_score}%</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* SOL Trace */}
      {solTrace && solTrace.flows?.length > 0 && (
        <Section title="SOL Trace">
          <div className="ff-stat-grid" style={{ marginBottom: 16 }}>
            <StatItem label="SOL Extracted" value={solTrace.total_extracted_sol != null ? `${solTrace.total_extracted_sol.toFixed(1)}` : undefined} />
            <StatItem label="USD Value" value={solTrace.total_extracted_usd != null ? `$${solTrace.total_extracted_usd.toLocaleString()}` : undefined} />
            <StatItem label="Hops" value={solTrace.hop_count ?? solTrace.flows.length} />
          </div>
          <Link to={`/sol-trace/${mint}`} className="ff-link">
            View full trace <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </Section>
      )}

      {/* Cartel */}
      {data.cartel_report && (
        <Section title="Cartel Detection">
          <div className="ff-stat-grid">
            <StatItem label="Deployers" value={data.cartel_report.deployer_count ?? data.cartel_report.connected_deployers?.length} />
            <StatItem label="Tokens" value={data.cartel_report.total_tokens_launched} />
            <StatItem label="SOL Extracted" value={data.cartel_report.total_sol_extracted != null ? `${data.cartel_report.total_sol_extracted.toFixed(1)}` : undefined} />
          </div>
          {data.cartel_report.community_id && (
            <Link to={`/cartel/${data.cartel_report.community_id}`} className="ff-link" style={{ marginTop: 12, display: 'inline-flex' }}>
              View cartel network <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          )}
        </Section>
      )}

      {/* Flags */}
      {data.suspicious_flags && data.suspicious_flags.length > 0 && (
        <Section title="Suspicious Flags">
          {data.suspicious_flags.map((f, i) => (
            <div key={i} className="ff-row" style={{ justifyContent: 'flex-start' }}>
              <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: '#000' }}>{f}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Chat */}
      <Section title="Ask AI">
        <form onSubmit={e => { e.preventDefault(); /* TODO: wire chatStream */ setChatInput(''); }} style={{ display: 'flex', gap: 12 }}>
          <label htmlFor="chat-input" className="sr-only">Ask about this token</label>
          <input id="chat-input" className="ff-input" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything about this token…" style={{ flex: 1 }} />
          <button type="submit" className="ff-btn">Ask</button>
        </form>
      </Section>
    </div>
  );
}
