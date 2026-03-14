import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, Filter, ExternalLink } from 'lucide-react';
import type { AlertItem } from '../types/api';
import { connectAlertsWS } from '../lib/api';
import { useAlertsStore } from '../store/alerts';

interface AlertsScreenProps {
  onNavigateToken: (mint: string) => void;
}

type FilterType = 'ALL' | 'RUG' | 'BUNDLE' | 'INSIDER' | 'ZOMBIE' | 'DEPLOYER';

const FILTER_COLOR: Record<string, string> = {
  RUG: '#FF3366', BUNDLE: '#FF9933', INSIDER: '#FFD700',
  ZOMBIE: '#CC44FF', DEPLOYER: '#ADCEFF', ALL: '#6F6ACF',
};

const ALERT_BORDER: Record<string, string> = {
  rug_detection: '#FF3366', bundle_extraction: '#FF9933',
  insider_sell: '#FFD700', zombie_detected: '#CC44FF',
  deployer_alert: '#ADCEFF', generic: '#6F6ACF',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function AlertsScreen({ onNavigateToken }: AlertsScreenProps) {
  const { alerts, addAlert, markAllRead, unreadCount } = useAlertsStore();
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    let close: (() => void) | undefined;
    try {
      const ws = connectAlertsWS(
        (alert) => { addAlert(alert); setWsConnected(true); },
        () => setWsConnected(false),
      );
      setWsConnected(true);
      close = ws.close;
    } catch {
      setWsConnected(false);
    }
    return () => close?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark all read when screen opens
  useEffect(() => { markAllRead(); }, [markAllRead]);

  const filtered = filter === 'ALL'
    ? alerts
    : alerts.filter((a) => a.alert_type?.toUpperCase().includes(filter));

  return (
    <div className="px-4 pt-2 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center relative" style={{ background: 'rgba(255,51,102,0.12)' }}>
          <Bell size={16} style={{ color: '#FF3366' }} />
          {unreadCount() > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: '#FF3366' }}>
              {unreadCount() > 9 ? '9+' : unreadCount()}
            </span>
          )}
        </div>
        <div>
          <h2 className="text-section-header font-bold text-white">LIVE ALERTS</h2>
          <p className="text-tiny text-white/40">{wsConnected ? 'Receiving live events' : 'Connecting…'}</p>
        </div>
        <div className="ml-auto">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'animate-pulse' : ''}`} style={{ background: wsConnected ? '#00FF88' : '#FF3366' }} />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {(['ALL', 'RUG', 'BUNDLE', 'INSIDER', 'ZOMBIE', 'DEPLOYER'] as FilterType[]).map((f) => (
          <motion.button
            key={f}
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-tiny font-bold uppercase tracking-wide transition-all"
            style={{
              background: filter === f ? `${FILTER_COLOR[f]}25` : 'rgba(255,255,255,0.05)',
              border: filter === f ? `1px solid ${FILTER_COLOR[f]}50` : '1px solid transparent',
              color: filter === f ? FILTER_COLOR[f] : 'rgba(255,255,255,0.35)',
            }}
          >
            {f}
          </motion.button>
        ))}
      </div>

      {/* Alert List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,51,102,0.07)' }}>
            <BellOff size={28} style={{ color: '#FF3366', opacity: 0.3 }} />
          </div>
          <p className="text-small text-white/30">
            {wsConnected ? 'No alerts yet — watching for rug events' : 'Connecting to alert stream…'}
          </p>
          {!wsConnected && (
            <div className="mt-3 w-6 h-6 rounded-full border-2 border-white/10 border-t-white/50 animate-spin mx-auto" />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((alert) => {
              const borderColor = ALERT_BORDER[alert.alert_type ?? 'generic'] ?? '#6F6ACF';
              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-glass rounded-2xl p-3.5"
                  style={{ borderLeft: `3px solid ${borderColor}` }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-tiny font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: `${borderColor}18`, color: borderColor }}>
                          {(alert.alert_type ?? 'alert').replace(/_/g, ' ')}
                        </span>
                        {!alert.read && (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#FF3366' }} />
                        )}
                      </div>
                      <p className="text-small text-white/80 leading-snug">{alert.message ?? alert.title ?? 'New event detected'}</p>
                      {alert.mint && (
                        <div className="text-tiny text-white/30 font-mono mt-1">
                          {alert.mint.slice(0, 8)}…{alert.mint.slice(-6)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-tiny text-white/25">{timeAgo(alert.created_at ?? new Date().toISOString())}</span>
                      {alert.mint && (
                        <button
                          onClick={() => onNavigateToken(alert.mint!)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          <ExternalLink size={10} className="text-white/40" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
