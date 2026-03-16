import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, WifiOff } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { RiskBadge } from '../components/RiskBadge';
import { useGlobalStats, useTopTokens } from '../lib/query';
import { useAlertsStore } from '../store/alerts';

function AnimatedStat({ label, value }: { label: string; value?: number }) {
  return (
    <div style={{
      padding: '20px 24px', borderRadius: 'var(--radius-card)',
      background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
        {value != null ? value.toLocaleString() : '—'}
      </div>
    </div>
  );
}

export default function RadarScreen() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useGlobalStats();
  const { data: topTokens, isLoading: tokensLoading } = useTopTokens();
  const alerts = useAlertsStore((s) => s.alerts);

  const rugRate = useMemo(() => {
    if (!stats?.total_scanned_24h || !stats.rug_count_24h) return null;
    return ((stats.rug_count_24h / stats.total_scanned_24h) * 100).toFixed(1);
  }, [stats]);

  // Group alerts by date
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groupedAlerts = useMemo(() => {
    const groups: { label: string; items: typeof alerts }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Older', items: [] },
    ];
    alerts.forEach((a) => {
      const d = new Date(a.timestamp).toDateString();
      if (d === today) groups[0].items.push(a);
      else if (d === yesterday) groups[1].items.push(a);
      else groups[2].items.push(a);
    });
    return groups.filter((g) => g.items.length > 0);
  }, [alerts, today, yesterday]);

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-main-heading)', fontWeight: 700, color: '#fff', marginBottom: 20 }}>Radar</h1>

      {/* Bento Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {statsLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <AnimatedStat label="Scanned (24h)" value={stats?.total_scanned_24h} />
            <AnimatedStat label="Rugs (24h)" value={stats?.rug_count_24h} />
            <div style={{
              padding: '20px 24px', borderRadius: 'var(--radius-card)',
              background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Rug Rate</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: rugRate ? 'var(--color-warning)' : 'rgba(255,255,255,0.3)' }}>
                {rugRate ? `${rugRate}%` : '—'}
              </div>
            </div>
            <AnimatedStat label="Active Deployers" value={stats?.active_deployers_24h} />
          </>
        )}
      </div>

      {/* Two columns: Alerts + Top Tokens */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Live Alerts */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{ fontSize: 'var(--text-section-header)', fontWeight: 600, color: '#fff', margin: 0 }}>Live Alerts</h2>
            {alerts.length > 0 ? <Wifi size={14} color="var(--color-success)" /> : <WifiOff size={14} color="rgba(255,255,255,0.3)" />}
          </div>
          {alerts.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.5)', padding: '20px 0' }}>Waiting for alerts via WebSocket...</p>
          )}
          {groupedAlerts.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{group.label}</div>
              {group.items.slice(0, 10).map((a) => (
                <button
                  key={a.id}
                  onClick={() => a.mint && navigate(`/token/${a.mint}`)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '8px 12px', marginBottom: 4, borderRadius: 8, width: '100%',
                    background: a.read ? 'transparent' : 'rgba(111,106,207,0.06)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    textAlign: 'left', cursor: a.mint ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--text-tiny)', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' }}>{a.type}</span>
                    <span style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.25)' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.6)' }}>{a.message}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Top Tokens */}
        <div>
          <h2 style={{ fontSize: 'var(--text-section-header)', fontWeight: 600, color: '#fff', marginBottom: 12 }}>Top Tokens (24h)</h2>
          {tokensLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !topTokens?.length ? (
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>No data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topTokens.map((t, i) => (
                <button
                  key={t.mint}
                  onClick={() => navigate(`/token/${t.mint}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8, width: '100%',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-section-header)', fontWeight: 700, color: 'var(--color-secondary)', minWidth: 28, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 'var(--text-body)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name || t.mint.slice(0, 12)}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 'var(--text-small)' }}>{t.symbol}</div>
                  </div>
                  <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.5)' }}>{t.event_count} events</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
