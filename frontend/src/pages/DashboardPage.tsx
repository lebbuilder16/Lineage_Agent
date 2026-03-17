import { Link, useNavigate } from 'react-router-dom';
import { useGlobalStats, useWatches, useDeleteWatch } from '../lib/query';
import { useAuthStore } from '../store/auth';
import { useAlertsStore } from '../store/alerts';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats } = useGlobalStats();
  const apiKey = useAuthStore(s => s.apiKey);
  const { data: watches } = useWatches(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);
  const alerts = useAlertsStore(s => s.alerts);

  // History from localStorage
  let history: string[] = [];
  try { history = JSON.parse(localStorage.getItem('lineage_history') ?? '[]'); } catch { /* */ }

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 32 }}>Dashboard</h1>

      {/* Network Stats */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Network Stats</h2>
        <div className="ff-stat-grid">
          <div>
            <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Scanned 24h</div>
            <div className="ff-stat-number">{stats?.total_scanned_24h?.toLocaleString() ?? '—'}</div>
          </div>
          <div>
            <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Rugs 24h</div>
            <div className="ff-stat-number">{stats?.rug_count_24h?.toLocaleString() ?? '—'}</div>
          </div>
          <div>
            <div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Active Deployers</div>
            <div className="ff-stat-number">{stats?.active_deployers_24h?.toLocaleString() ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="ff-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="ff-label" style={{ textTransform: 'uppercase', margin: 0 }}>Watchlist</h2>
          <Link to="/account" className="ff-link" style={{ fontSize: 13 }}>
            Manage <svg className="ff-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
        {!apiKey && <p className="ff-body">Connect your API key in <Link to="/account" className="ff-link">Account</Link> to see your watchlist.</p>}
        {watches && watches.length === 0 && <p className="ff-body">No watches yet.</p>}
        {watches && watches.map(w => (
          <div key={w.id} className="ff-row">
            <button onClick={() => navigate(w.sub_type === 'mint' ? `/lineage/${w.value}` : `/deployer/${w.value}`)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff.font }}>
              <div style={{ fontSize: 16, letterSpacing: '-0.48px', color: '#000' }}>{w.label || w.value.slice(0, 16)}</div>
              <div className="ff-address" style={{ marginTop: 2 }}>{w.value}</div>
            </button>
            <button onClick={() => deleteMutation.mutate(w.id)} className="ff-link" style={{ fontSize: 13, color: ff.gray }} aria-label="Remove watch">✕</button>
          </div>
        ))}
      </div>

      {/* Recent Alerts */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Recent Alerts</h2>
        {alerts.length === 0 && <p className="ff-body">No alerts received yet.</p>}
        {alerts.slice(0, 5).map(a => (
          <button key={a.id} onClick={() => a.mint && navigate(`/lineage/${a.mint}`)} className="ff-row" style={{ width: '100%', textAlign: 'left', cursor: a.mint ? 'pointer' : 'default', background: 'none', fontFamily: ff.font }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.48px', color: '#000', textTransform: 'uppercase' }}>{a.type}</span>
              <p className="ff-body" style={{ margin: '4px 0 0' }}>{a.message}</p>
            </div>
            <span style={{ fontSize: 13, color: ff.gray, whiteSpace: 'nowrap' }}>{new Date(a.timestamp).toLocaleDateString()}</span>
          </button>
        ))}
      </div>

      {/* Recent Analyses */}
      {history.length > 0 && (
        <div className="ff-section">
          <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Recent Analyses</h2>
          {history.slice(0, 5).map(mint => (
            <Link key={mint} to={`/lineage/${mint}`} className="ff-row" style={{ textDecoration: 'none' }}>
              <span className="ff-address">{mint}</span>
              <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
