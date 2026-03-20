import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSearchTokens } from '../lib/query';
import type { TokenSearchResult } from '../types/api';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

function TokenRow({ token }: { token: TokenSearchResult }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/sol-trace/${token.mint}`)} className="ff-row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', fontFamily: ff.font }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.48px', color: '#000' }}>
          {token.name || token.mint.slice(0, 12)}
          {token.symbol && <span style={{ fontWeight: 400, color: ff.gray, marginLeft: 8 }}>{token.symbol}</span>}
        </div>
        <div className="ff-address" style={{ marginTop: 4 }}>{token.mint}</div>
      </div>
      {token.market_cap_usd != null && (
        <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: ff.gray, whiteSpace: 'nowrap' }}>
          ${token.market_cap_usd >= 1e6 ? `${(token.market_cap_usd / 1e6).toFixed(1)}M` : `${(token.market_cap_usd / 1e3).toFixed(0)}K`}
        </span>
      )}
      <svg className="ff-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </button>
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(query);
  const navigate = useNavigate();

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { const q = params.get('q'); if (q) setQuery(q); }, [params]);

  const { data, isLoading } = useSearchTokens(debounced, debounced.length > 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q)) navigate(`/sol-trace/${q}`);
    else navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 24 }}>Analyse</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <label htmlFor="search-input" className="sr-only">Token address or name</label>
        <input id="search-input" className="ff-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Paste token address or search by name…" style={{ flex: 1 }} />
        <button type="submit" className="ff-btn">Search</button>
      </form>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[1,2,3].map(i => <div key={i} className="ff-skeleton" style={{ height: 60, marginBottom: 1 }} />)}
        </div>
      )}

      {!isLoading && data && data.length === 0 && debounced.length > 1 && (
        <p className="ff-body" style={{ padding: '40px 0', textAlign: 'center' }}>No tokens found for "{debounced}"</p>
      )}

      {data && data.length > 0 && (
        <div>
          <p className="ff-label" style={{ marginBottom: 12 }}>{data.length} result{data.length > 1 ? 's' : ''}</p>
          {data.map(t => <TokenRow key={t.mint} token={t} />)}
        </div>
      )}
    </div>
  );
}
