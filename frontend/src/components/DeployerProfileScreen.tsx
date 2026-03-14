import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, User, AlertTriangle, GitBranch, TrendingDown, ChevronRight, Shield } from 'lucide-react';
import type { DeployerProfile } from '../types/api';
import { getDeployer } from '../lib/api';

interface DeployerProfileScreenProps {
  address: string;
  onNavigateSolTrace: (mint: string) => void;
  onNavigateCartel: (fingerprint: string) => void;
  onNavigateToken: (mint: string) => void;
  onBack: () => void;
}

const RISK_COLORS = { critical: '#FF3366', high: '#FF9933', medium: '#FFD700', low: '#00FF88' };

export function DeployerProfileScreen({ address, onNavigateSolTrace, onNavigateCartel, onNavigateToken, onBack }: DeployerProfileScreenProps) {
  const [profile, setProfile] = useState<DeployerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDeployer(address)
      .then(setProfile)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  const rugRisk = profile?.rug_rate_pct != null
    ? profile.rug_rate_pct >= 75 ? 'critical' : profile.rug_rate_pct >= 50 ? 'high' : profile.rug_rate_pct >= 25 ? 'medium' : 'low'
    : 'low';
  const riskColor = RISK_COLORS[rugRisk];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(173,200,255,0.12)' }}>
          <User size={15} style={{ color: '#ADCEFF' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-small font-bold text-white">DEPLOYER PROFILE</h2>
          <p className="text-tiny text-white/40 font-mono truncate">{address.slice(0, 20)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="bg-glass rounded-2xl h-20 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
            <p className="text-small text-white/50">{error}</p>
          </div>
        )}

        {profile && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Risk Score Card */}
            <div className="bg-glass rounded-3xl p-5 flex items-center gap-4" style={{ border: `1px solid ${riskColor}25` }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${riskColor}15` }}>
                <AlertTriangle size={28} style={{ color: riskColor }} />
              </div>
              <div>
                <div className="text-hero font-black" style={{ color: riskColor }}>
                  {profile.rug_rate_pct?.toFixed(0) ?? '?'}%
                </div>
                <div className="text-small font-bold text-white/60">Rug Rate</div>
                {profile.total_tokens_deployed != null && (
                  <div className="text-tiny text-white/30">{profile.total_tokens_deployed} tokens deployed</div>
                )}
              </div>
              <div className="ml-auto text-right">
                {profile.total_sol_extracted != null && (
                  <>
                    <div className="text-subheading font-black" style={{ color: '#FF3366' }}>
                      {profile.total_sol_extracted.toFixed(1)}
                    </div>
                    <div className="text-tiny text-white/40">SOL extracted</div>
                  </>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            {(profile.confirmed_rugs != null || profile.avg_rug_time_hours != null) && (
              <div className="grid grid-cols-2 gap-2">
                {profile.confirmed_rugs != null && (
                  <div className="bg-glass rounded-2xl p-3 text-center">
                    <div className="text-subheading font-black" style={{ color: '#FF3366' }}>{profile.confirmed_rugs}</div>
                    <div className="text-tiny text-white/40">Confirmed Rugs</div>
                  </div>
                )}
                {profile.avg_rug_time_hours != null && (
                  <div className="bg-glass rounded-2xl p-3 text-center">
                    <div className="text-subheading font-black text-white">{profile.avg_rug_time_hours.toFixed(0)}h</div>
                    <div className="text-tiny text-white/40">Avg Rug Time</div>
                  </div>
                )}
              </div>
            )}

            {/* Cartel fingerprint */}
            {profile.operator_fingerprint && (
              <button
                onClick={() => onNavigateCartel(profile.operator_fingerprint!)}
                className="w-full bg-glass rounded-2xl p-3.5 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.1)' }}>
                  <GitBranch size={15} style={{ color: '#FF3366' }} />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-tiny text-white/40 uppercase font-bold">Operator Cartel</div>
                  <div className="text-small text-white font-mono">{profile.operator_fingerprint.slice(0, 24)}…</div>
                </div>
                <ChevronRight size={14} className="text-white/20" />
              </button>
            )}

            {/* Tokens deployed */}
            {(profile.tokens?.length ?? 0) > 0 && (
              <div className="bg-glass rounded-2xl p-4">
                <p className="text-tiny font-bold uppercase tracking-wide text-white/40 mb-2">
                  Recent Tokens ({profile.tokens!.length})
                </p>
                <div className="space-y-2">
                  {profile.tokens!.slice(0, 8).map((t) => {
                    const tc = RISK_COLORS[t.risk_level ?? 'low'];
                    return (
                      <button
                        key={t.mint}
                        onClick={() => onNavigateToken(t.mint)}
                        className="w-full flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0 text-left"
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-tiny font-bold" style={{ background: `${tc}15`, color: tc }}>
                          {(t.symbol ?? '?').slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <div className="text-small text-white/80 font-semibold">{t.name ?? t.symbol}</div>
                          <div className="text-tiny text-white/30 font-mono">{t.mint.slice(0, 12)}…</div>
                        </div>
                        {t.is_rug && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,51,102,0.15)', color: '#FF3366' }}>RUG</span>
                        )}
                        <ChevronRight size={11} className="text-white/15" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
