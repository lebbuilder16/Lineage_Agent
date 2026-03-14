import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Search, Zap, TrendingDown, AlertTriangle, ChevronRight, ScanLine, GitBranch, Wifi, WifiOff } from 'lucide-react';
import type { Screen } from '../App';
import type { TokenSearchResult, GlobalStats } from '../types/api';
import { searchTokens, getGlobalStats, getHealth, connectAlertsWS } from '../lib/api';
import { useAlertsStore } from '../store/alerts';

interface RadarScreenProps {
  onTokenSelect: (token: TokenSearchResult) => void;
  onNavigate: (screen: Screen) => void;
  onNavigateCompare: (mintA: string, mintB?: string) => void;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#FF3366',
  high: '#FF9933',
  medium: '#FFD700',
  low: '#00FF88',
};

const TYPE_BG: Record<string, string> = {
  critical: 'rgba(255,51,102,0.12)',
  high: 'rgba(255,153,51,0.12)',
  medium: 'rgba(255,215,0,0.12)',
  low: 'rgba(0,255,136,0.12)',
};

function getRiskColor(level?: string) {
  return RISK_COLORS[level ?? 'low'] ?? '#6B7280';
}

function shortenMint(mint: string) {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export function RadarScreen({ onTokenSelect, onNavigate, onNavigateCompare }: RadarScreenProps) {
  const [tokens, setTokens] = useState<TokenSearchResult[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForCompare, setSelectedForCompare] = useState<string | null>(null);
  const addAlert = useAlertsStore((s) => s.addAlert);

  // Load tokens + stats + health on mount
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      searchTokens('', 0, 20).catch(() => [] as TokenSearchResult[]),
      getGlobalStats().catch(() => null),
      getHealth().catch(() => null),
    ]).then(([toks, st, health]) => {
      if (cancelled) return;
      setTokens(toks);
      setStats(st);
      setIsOnline(health?.status === 'ok');
      setIsLoading(false);
    });

    // Connect alerts WebSocket for live badge
    const cleanup = connectAlertsWS(addAlert);
    return () => { cancelled = true; cleanup(); };
  }, [addAlert]);

  // Search filtering (client-side on fetched list; for real search calls API)
  const handleSearch = useCallback(
    async (q: string) => {
      setSearchQuery(q);
      if (!q.trim()) {
        setIsLoading(true);
        searchTokens('', 0, 20).then((t) => { setTokens(t); setIsLoading(false); });
        return;
      }
      setIsLoading(true);
      searchTokens(q, 0, 20)
        .then(setTokens)
        .catch(() => {})
        .finally(() => setIsLoading(false));
    },
    []
  );

  const handleCompare = (mint: string) => {
    if (!selectedForCompare) {
      setSelectedForCompare(mint);
    } else {
      onNavigateCompare(selectedForCompare, mint);
      setSelectedForCompare(null);
    }
  };

  return (
    <div className="px-4 pt-2 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-main-heading font-black tracking-tight text-white">
            LINEAGE <span style={{ color: '#ADCEFF' }}>RADAR</span>
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isOnline === null ? (
              <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
            ) : isOnline ? (
              <Wifi size={11} className="text-[#00FF88]" />
            ) : (
              <WifiOff size={11} className="text-[#FF3366]" />
            )}
            <span className="text-tiny" style={{ color: isOnline ? '#00FF88' : '#FF3366', fontWeight: 600 }}>
              {isOnline === null ? 'CONNECTING…' : isOnline ? 'NODE ACTIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onNavigate('alerts')}
          className="w-10 h-10 rounded-2xl bg-glass flex items-center justify-center"
        >
          <Activity size={18} style={{ color: '#ADCEFF' }} />
        </motion.button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'SCANNED TODAY', value: stats.total_scanned_24h?.toLocaleString() ?? '—', color: '#ADCEFF' },
            { label: 'RUGS 24H', value: stats.rug_count_24h?.toLocaleString() ?? '—', color: '#FF3366' },
            { label: 'DEPLOYERS', value: stats.active_deployers_24h?.toLocaleString() ?? '—', color: '#FF9933' },
          ].map((s) => (
            <div key={s.label} className="bg-glass rounded-2xl p-2.5 text-center">
              <div className="text-subheading font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[9px] text-white/40 font-semibold tracking-wide mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search token name or mint address…"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full bg-glass rounded-2xl pl-10 pr-4 py-3 text-small text-white placeholder-white/25 outline-none border border-white/5 focus:border-white/15 transition-colors"
        />
      </div>

      {/* Compare hint */}
      {selectedForCompare && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: 'rgba(111,106,207,0.15)', border: '1px solid rgba(111,106,207,0.3)' }}
        >
          <GitBranch size={13} style={{ color: '#ADCEFF' }} />
          <span className="text-tiny text-white/70">Select a second token to compare</span>
          <button onClick={() => setSelectedForCompare(null)} className="ml-auto text-tiny text-white/40">✕</button>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { label: 'Deep Scan', icon: ScanLine, screen: 'scan', color: '#ADCEFF' },
          { label: 'Death Clock', icon: TrendingDown, screen: 'death-clock', color: '#FF3366' },
        ].map((a) => (
          <motion.button
            key={a.label}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate(a.screen as Screen)}
            className="bg-glass rounded-2xl p-3 flex items-center gap-2.5"
            style={{ border: `1px solid ${a.color}20` }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${a.color}18` }}>
              <a.icon size={15} style={{ color: a.color }} />
            </div>
            <span className="text-small font-semibold text-white/80">{a.label}</span>
            <ChevronRight size={13} className="ml-auto text-white/20" />
          </motion.button>
        ))}
      </div>

      {/* Token List */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={13} style={{ color: '#FF9933' }} />
        <span className="text-tiny font-bold text-white/50 tracking-wider uppercase">Risk Radar</span>
        {isLoading && <div className="ml-auto w-3 h-3 rounded-full border border-white/20 border-t-transparent animate-spin" />}
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {isLoading && tokens.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={`sk-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-16 bg-glass rounded-2xl animate-pulse"
                />
              ))
            : tokens.map((token, i) => (
                <motion.div
                  key={token.mint}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-glass rounded-2xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                  style={{
                    border: `1px solid ${getRiskColor(token.risk_level)}20`,
                    background: `${TYPE_BG[token.risk_level ?? 'low']}`,
                  }}
                  onClick={() => { onTokenSelect(token); onNavigate('scan'); }}
                >
                  {/* Token Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-small"
                    style={{ background: `${getRiskColor(token.risk_level)}20`, color: getRiskColor(token.risk_level) }}
                  >
                    {token.image_uri
                      ? <img src={token.image_uri} alt={token.symbol} className="w-full h-full rounded-xl object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : (token.symbol ?? '?').slice(0, 2).toUpperCase()
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-small font-bold text-white truncate">{token.name ?? token.symbol}</span>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0"
                        style={{ background: `${getRiskColor(token.risk_level)}20`, color: getRiskColor(token.risk_level) }}
                      >
                        {token.risk_level ?? 'unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-tiny text-white/40">{shortenMint(token.mint)}</span>
                      {token.market_cap_usd != null && (
                        <span className="text-tiny text-white/30">MCap ${(token.market_cap_usd / 1000).toFixed(1)}K</span>
                      )}
                    </div>
                  </div>

                  {/* Risk score + compare button */}
                  <div className="flex flex-col items-end gap-1">
                    {token.risk_score != null && (
                      <div className="text-small font-black" style={{ color: getRiskColor(token.risk_level) }}>
                        {Math.round(token.risk_score)}
                      </div>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={(e) => { e.stopPropagation(); handleCompare(token.mint); }}
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{
                        background: selectedForCompare === token.mint ? 'rgba(111,106,207,0.4)' : 'rgba(255,255,255,0.06)',
                        color: selectedForCompare === token.mint ? '#ADCEFF' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <Zap size={9} className="inline mr-0.5" />CMP
                    </motion.button>
                  </div>
                </motion.div>
              ))
          }
        </AnimatePresence>

        {!isLoading && tokens.length === 0 && (
          <div className="text-center py-10 text-white/30 text-small">No tokens found</div>
        )}
      </div>
    </div>
  );
}
