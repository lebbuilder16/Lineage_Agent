import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompareTokens } from '../lib/query';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function ComparePage() {
  const [mintA, setMintA] = useState('');
  const [mintB, setMintB] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const enabled = submitted && mintA.trim().length > 10 && mintB.trim().length > 10;
  const { data, isLoading, error } = useCompareTokens(mintA.trim(), mintB.trim(), enabled);

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 24 }}>Compare Tokens</h1>

      <form onSubmit={e => { e.preventDefault(); setSubmitted(true); }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="cmp-a" className="ff-label" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Token A</label>
            <input id="cmp-a" className="ff-input" value={mintA} onChange={e => { setMintA(e.target.value); setSubmitted(false); }} placeholder="Paste token address…" />
          </div>
          <div>
            <label htmlFor="cmp-b" className="ff-label" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Token B</label>
            <input id="cmp-b" className="ff-input" value={mintB} onChange={e => { setMintB(e.target.value); setSubmitted(false); }} placeholder="Paste token address…" />
          </div>
          <button type="submit" className="ff-btn" style={{ alignSelf: 'flex-start' }}>Compare</button>
        </div>
      </form>

      {isLoading && <div className="ff-skeleton" style={{ height: 200 }} />}
      {error && <p style={{ color: '#000' }}>Error: {(error as Error).message}</p>}

      {data && (
        <div>
          {/* Verdict */}
          <div className="ff-section">
            <div className="ff-stat-number" style={{ marginBottom: 8 }}>{data.verdict?.replace('_', ' ')}</div>
            {data.verdict_reasons?.map((r, i) => <p key={i} className="ff-body">{r}</p>)}
          </div>

          {/* Scores */}
          <div className="ff-section">
            <div className="ff-stat-grid">
              <div>
                <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Composite</div>
                <div className="ff-stat-number">{((data.composite_score ?? data.similarity_score ?? 0) * 100).toFixed(0)}</div>
              </div>
              {data.name_similarity != null && (
                <div>
                  <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Name</div>
                  <div style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 400, letterSpacing: '-2px' }}>{(data.name_similarity * 100).toFixed(0)}</div>
                </div>
              )}
              {data.temporal_similarity != null && (
                <div>
                  <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Temporal</div>
                  <div style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 400, letterSpacing: '-2px' }}>{(data.temporal_similarity * 100).toFixed(0)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Token cards */}
          {[data.token_a, data.token_b].map((t, i) => t && (
            <div key={i} className="ff-section">
              <Link to={`/lineage/${t.mint}`} className="ff-link" style={{ fontSize: 16, fontWeight: 600 }}>
                {t.name || t.mint.slice(0, 12)} {t.symbol && <span style={{ fontWeight: 400, color: ff.gray }}>{t.symbol}</span>}
                <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
              <div className="ff-address" style={{ marginTop: 4 }}>{t.mint}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
