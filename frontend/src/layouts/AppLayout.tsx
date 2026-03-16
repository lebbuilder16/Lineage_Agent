import { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Radar, Eye, GitCompare } from 'lucide-react';
import { GlobalSearchBar } from '../components/GlobalSearchBar';
import { AlertsBell } from '../components/AlertsBell';
import { ChatFloatingPanel } from '../components/ChatFloatingPanel';
import { useAlertsStore } from '../store/alerts';
import { useAuthStore } from '../store/auth';
import { useWatches } from '../lib/query';
import { connectAlertsWS } from '../lib/api';

const NAV_LINKS = [
  { to: '/radar', icon: Radar, label: 'Radar' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/watchlist', icon: Eye, label: 'Watchlist' },
] as const;

const RECENT_KEY = 'lineage_recent_scans';

export function getRecentScans(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, 5);
  } catch { return []; }
}

export function addRecentScan(mint: string) {
  const recent = getRecentScans().filter((m) => m !== mint);
  recent.unshift(mint);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)));
}

export function AppLayout() {
  const addAlert = useAlertsStore((s) => s.addAlert);
  const apiKey = useAuthStore((s) => s.apiKey);
  const { data: watches } = useWatches(apiKey);

  // Connect WebSocket alerts
  useEffect(() => {
    const disconnect = connectAlertsWS(addAlert);
    return disconnect;
  }, [addAlert]);

  const navLinkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-small)',
    fontWeight: 500,
    color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
    background: isActive ? 'rgba(111,106,207,0.2)' : 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: '#fff', fontFamily: 'Lexend, sans-serif' }}>
      {/* Skip navigation */}
      <a href="#main-content" className="skip-nav">Skip to main content</a>

      {/* TopNav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        height: 52, display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px',
        background: 'rgba(10,10,7,0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <NavLink to="/" style={{ fontWeight: 700, fontSize: 'var(--text-subheading)', color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
          Lineage
        </NavLink>

        <GlobalSearchBar />

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV_LINKS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => navLinkStyle(isActive)}>
              <Icon size={16} />
              <span className="hidden-mobile">{label}</span>
            </NavLink>
          ))}
        </nav>

        <AlertsBell />
      </header>

      {/* Body: Sidebar + Content */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)' }}>
        {/* Left Sidebar */}
        <aside aria-label="Sidebar navigation" style={{
          width: 240, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '16px 12px',
          display: 'flex', flexDirection: 'column', gap: 24,
          overflowY: 'auto',
        }}
          className="hidden-sidebar"
        >
          {/* Recent Scans */}
          <div>
            <label style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'block' }}>
              Recent Scans
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {getRecentScans().map((mint) => (
                <NavLink
                  key={mint}
                  to={`/token/${mint}`}
                  style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', padding: '4px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
                >
                  {mint.slice(0, 6)}...{mint.slice(-4)}
                </NavLink>
              ))}
              {getRecentScans().length === 0 && (
                <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.45)', padding: '4px 8px' }}>None yet</span>
              )}
            </div>
          </div>

          {/* Watchlist Quick-view */}
          {apiKey && watches && watches.length > 0 && (
            <div>
              <label style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'block' }}>
                Watched
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {watches.slice(0, 5).map((w) => (
                  <NavLink
                    key={w.id}
                    to={w.sub_type === 'mint' ? `/token/${w.value}` : `/token/${w.value}`}
                    style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {w.label || `${w.value.slice(0, 6)}...${w.value.slice(-4)}`}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main id="main-content" style={{ flex: 1, minWidth: 0, padding: '24px 28px' }}>
          <Outlet />
        </main>
      </div>

      <ChatFloatingPanel />

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .hidden-sidebar { display: none !important; }
          .hidden-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}
