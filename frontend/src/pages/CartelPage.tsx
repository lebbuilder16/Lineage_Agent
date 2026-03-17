import { useParams, Link } from 'react-router-dom';
import { useCartel } from '../lib/query';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function CartelPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useCartel(id ?? '');

  if (isLoading) return <div style={{ maxWidth: 700 }}><div className="ff-skeleton" style={{ height: 40, width: '50%', marginBottom: 16 }} /><div className="ff-skeleton" style={{ height: 200 }} /></div>;
  if (error) return <p style={{ fontFamily: ff.font }}>Error: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 8 }}>Cartel Network</h1>
      {data.community_id && <div className="ff-address" style={{ marginBottom: 32 }}>{data.community_id}</div>}

      {/* Stats */}
      <div className="ff-section">
        <div className="ff-stat-grid">
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Deployers</div><div className="ff-stat-number">{data.deployer_count ?? data.connected_deployers?.length ?? '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Tokens</div><div className="ff-stat-number">{data.total_tokens_launched ?? '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>SOL Extracted</div><div className="ff-stat-number">{data.total_sol_extracted != null ? data.total_sol_extracted.toFixed(1) : '—'}</div></div>
        </div>
      </div>

      {/* Signals */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Signals</h2>
        <div className="ff-stat-grid">
          {data.funding_links != null && <div><div className="ff-label" style={{ fontSize: 13 }}>Funding Links</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.funding_links}</div></div>}
          {data.sniper_ring_count != null && <div><div className="ff-label" style={{ fontSize: 13 }}>Sniper Ring</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.sniper_ring_count}</div></div>}
          {data.shared_lp_count != null && <div><div className="ff-label" style={{ fontSize: 13 }}>Shared LP</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.shared_lp_count}</div></div>}
          {data.dna_match_count != null && <div><div className="ff-label" style={{ fontSize: 13 }}>DNA Match</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.dna_match_count}</div></div>}
        </div>
      </div>

      {/* Connected Deployers */}
      {data.connected_deployers && data.connected_deployers.length > 0 && (
        <div className="ff-section">
          <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Connected Deployers</h2>
          {data.connected_deployers.map(addr => (
            <Link key={addr} to={`/deployer/${addr}`} className="ff-row" style={{ textDecoration: 'none' }}>
              <span className="ff-address">{addr}</span>
              <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
