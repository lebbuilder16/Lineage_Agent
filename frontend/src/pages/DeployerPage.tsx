import { useParams, Link } from 'react-router-dom';
import { useDeployer } from '../lib/query';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function DeployerPage() {
  const { address } = useParams<{ address: string }>();
  const { data, isLoading, error } = useDeployer(address ?? '');

  if (isLoading) return <div style={{ maxWidth: 700 }}><div className="ff-skeleton" style={{ height: 40, width: '50%', marginBottom: 16 }} /><div className="ff-skeleton" style={{ height: 200 }} /></div>;
  if (error) return <p style={{ fontFamily: ff.font }}>Error: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 8 }}>Deployer Profile</h1>
      <div className="ff-address" style={{ marginBottom: 32 }}>{data.address}</div>

      {/* Risk Score */}
      <div className="ff-section">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="ff-stat-number">{data.rug_rate_pct?.toFixed(0) ?? '—'}</span>
          <span className="ff-label">% rug rate</span>
        </div>
      </div>

      {/* Stats */}
      <div className="ff-section">
        <div className="ff-stat-grid">
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Tokens Launched</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.total_tokens_launched ?? data.total_tokens_deployed ?? '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Confirmed Rugs</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.confirmed_rug_count ?? data.confirmed_rugs ?? '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>SOL Extracted</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.total_sol_extracted != null ? `${data.total_sol_extracted.toFixed(1)}` : '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Avg Lifespan</div><div style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-1px' }}>{data.avg_lifespan_days != null ? `${data.avg_lifespan_days.toFixed(0)}d` : data.avg_rug_time_hours != null ? `${data.avg_rug_time_hours.toFixed(0)}h` : '—'}</div></div>
        </div>
      </div>

      {/* Tokens */}
      {data.tokens && data.tokens.length > 0 && (
        <div className="ff-section">
          <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Tokens Launched</h2>
          {data.tokens.map(t => (
            <Link key={t.mint} to={`/lineage/${t.mint}`} className="ff-row" style={{ textDecoration: 'none' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: '#000', fontWeight: t.is_rug || t.status === 'rugged' ? 600 : 400 }}>
                  {t.name || t.mint.slice(0, 12)}
                </span>
                {(t.is_rug || t.status === 'rugged') && <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: '#000', textTransform: 'uppercase' }}>RUGGED</span>}
              </div>
              {t.market_cap_usd != null && <span style={{ fontSize: 13, color: ff.gray }}>${t.market_cap_usd >= 1e6 ? `${(t.market_cap_usd / 1e6).toFixed(1)}M` : `${(t.market_cap_usd / 1e3).toFixed(0)}K`}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
