import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { useAlertsStore } from '../store/alerts';

export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const alerts = useAlertsStore((s) => s.alerts);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const unread = useAlertsStore((s) => s.unreadCount)();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label={`Alerts${unread > 0 ? ` (${unread} unread)` : ''}`}
          style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          <Bell size={20} color="rgba(255,255,255,0.7)" />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 0, right: 0,
              background: 'var(--color-error)', color: '#fff',
              fontSize: 10, fontWeight: 700,
              width: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" style={{ width: 380, background: 'var(--bg-app)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <SheetHeader>
          <SheetTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
            <span>Alerts</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 'var(--text-small)', color: 'var(--color-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </SheetTitle>
        </SheetHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 100px)' }}>
          {alerts.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No alerts yet</p>
          )}
          {alerts.slice(0, 50).map((a) => (
            <button
              key={a.id}
              onClick={() => { if (a.mint) { setOpen(false); navigate(`/token/${a.mint}`); } }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '10px 12px', borderRadius: 'var(--radius-small)',
                background: a.read ? 'transparent' : 'rgba(111,106,207,0.08)',
                border: '1px solid rgba(255,255,255,0.04)',
                textAlign: 'left', cursor: a.mint ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-small)', fontWeight: 600, color: '#fff', textTransform: 'uppercase' }}>{a.type}</span>
                <span style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <span style={{ fontSize: 'var(--text-body)', color: 'rgba(255,255,255,0.6)' }}>{a.message}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
