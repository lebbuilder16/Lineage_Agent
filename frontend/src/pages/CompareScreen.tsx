import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { GaugeRing } from '../components/GaugeRing';
import { RiskBadge } from '../components/RiskBadge';
import { useCompareTokens } from '../lib/query';

const VERDICT_COLORS: Record<string, string> = {
  IDENTICAL_OPERATOR: '#FF0033',
  CLONE: '#FF3366',
  RELATED: '#FF9933',
  UNRELATED: '#00FF88',
};

export default function CompareScreen() {
  const [mintA, setMintA] = useState('');
  const [mintB, setMintB] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const enabled = submitted && mintA.trim().length > 10 && mintB.trim().length > 10;
  const { data, isLoading, error } = useCompareTokens(mintA.trim(), mintB.trim(), enabled);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const verdictColor = data?.verdict ? VERDICT_COLORS[data.verdict] ?? 'rgba(255,255,255,0.5)' : '';

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-main-heading)', fontWeight: 700, color: '#fff', marginBottom: 20 }}>Compare Tokens</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="token-a" className="sr-only">Token A address</label>
          <input
            id="token-a"
            value={mintA}
            onChange={(e) => { setMintA(e.target.value); setSubmitted(false); }}
            placeholder="Token A address..."
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 'var(--radius-pill)',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 'var(--text-body)', fontFamily: 'monospace',
            }}
          />
        </div>
        <ArrowRightLeft size={20} color="rgba(255,255,255,0.3)" aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <label htmlFor="token-b" className="sr-only">Token B address</label>
          <input
            id="token-b"
            value={mintB}
            onChange={(e) => { setMintB(e.target.value); setSubmitted(false); }}
            placeholder="Token B address..."
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 'var(--radius-pill)',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 'var(--text-body)', fontFamily: 'monospace',
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '10px 24px', borderRadius: 'var(--radius-pill)',
            background: 'var(--color-primary)', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-body)',
          }}
        >
          Compare
        </button>
      </form>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--color-error)' }}>Failed to compare tokens: {(error as Error).message}</p>
      )}

      {data && (
        <div>
          {/* Verdict Banner */}
          <div style={{
            padding: '16px 24px', borderRadius: 'var(--radius-card)',
            background: verdictColor + '12', border: `1px solid ${verdictColor}33`,
            marginBottom: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 'var(--text-section-header)', fontWeight: 700, color: verdictColor, marginBottom: 4 }}>
              {data.verdict?.replace('_', ' ')}
            </div>
            {data.verdict_reasons?.map((r, i) => (
              <div key={i} style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.65)' }}>{r}</div>
            ))}
          </div>

          {/* Gauge Rings */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 28 }}>
            <GaugeRing value={(data.composite_score ?? data.similarity_score ?? 0) * 100} size={96} label="Composite" />
            {data.name_similarity != null && <GaugeRing value={data.name_similarity * 100} size={80} label="Name" />}
            {data.temporal_similarity != null && <GaugeRing value={data.temporal_similarity * 100} size={80} label="Temporal" />}
          </div>

          {/* Token Cards Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[data.token_a, data.token_b].map((t, idx) => t && (
              <div key={idx} style={{
                padding: 16, borderRadius: 'var(--radius-card)',
                background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {t.image_uri && <img src={t.image_uri} alt={t.name || 'Token'} width={32} height={32} loading="lazy" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>{t.name || t.mint.slice(0, 12)}</div>
                    <div style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.55)' }}>{t.symbol}</div>
                  </div>
                  <RiskBadge level={t.risk_level} />
                </div>
                <div style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.mint}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          form { flex-direction: column !important; }
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
