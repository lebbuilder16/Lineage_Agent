import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Shield, User, ChevronRight, TrendingDown, Network } from 'lucide-react';
import type { CartelReport } from '../types/api';
import { getCartelSearch, getCartelFinancial } from '../lib/api';

interface CartelScreenProps {
  fingerprint: string;
  onNavigateDeployer: (address: string) => void;
  onBack: () => void;
}

export function CartelScreen({ fingerprint, onNavigateDeployer, onBack }: CartelScreenProps) {
  const [report, setReport] = useState<CartelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Try search first, then financial if we have community_id
    getCartelSearch(fingerprint)
      .then(async (r) => {
        setReport(r);
        if (r.community_id) {
          try {
            const fin = await getCartelFinancial(r.community_id);
            setReport((prev) => prev ? { ...prev, ...fin } : fin);
          } catch { /* financial data optional */ }
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fingerprint]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.12)' }}>
          <Network size={15} style={{ color: '#FF3366' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-small font-bold text-white">CARTEL NETWORK</h2>
          <p className="text-tiny text-white/40 font-mono truncate">{fingerprint.slice(0, 24)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="bg-glass rounded-2xl h-24 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
            <p className="text-small text-white/50">{error}</p>
          </div>
        )}

        {report && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Overview */}
            <div className="bg-glass rounded-3xl p-5" style={{ border: '1px solid rgba(255,51,102,0.15)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.1)' }}>
                  <Shield size={22} style={{ color: '#FF3366' }} />
                </div>
                <div>
                  <div className="text-subheading font-black text-white">
                    {report.deployer_count ?? report.deployers?.length ?? '?'}
                  </div>
                  <div className="text-small text-white/50">Deployers in cartel</div>
                </div>
                <div className="ml-auto text-right">
                  {report.risk_score != null && (
                    <>
                      <div className="text-subheading font-black" style={{ color: '#FF3366' }}>{Math.round(report.risk_score)}</div>
                      <div className="text-tiny text-white/40">Risk Score</div>
                    </>
                  )}
                </div>
              </div>

              {/* Financial stats */}
              {(report.total_sol_extracted != null || report.total_tokens_launched != null) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {report.total_sol_extracted != null && (
                    <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,51,102,0.08)' }}>
                      <div className="text-small font-black" style={{ color: '#FF3366' }}>{report.total_sol_extracted.toFixed(1)} SOL</div>
                      <div className="text-tiny text-white/30">Extracted</div>
                    </div>
                  )}
                  {report.total_tokens_launched != null && (
                    <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,153,51,0.08)' }}>
                      <div className="text-small font-black" style={{ color: '#FF9933' }}>{report.total_tokens_launched}</div>
                      <div className="text-tiny text-white/30">Tokens Launched</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cartel edges */}
            {(report.edges?.length ?? 0) > 0 && (
              <div className="bg-glass rounded-2xl p-4">
                <p className="text-tiny font-bold uppercase tracking-wide text-white/40 mb-2">Connections</p>
                <div className="space-y-2">
                  {report.edges!.slice(0, 8).map((edge, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                      <div className="text-tiny font-mono text-white/50 flex-1 truncate">{edge.source.slice(0, 14)}…</div>
                      <div className="text-tiny text-white/20">→</div>
                      <div className="text-tiny font-mono text-white/50 flex-1 truncate text-right">…{edge.target.slice(-14)}</div>
                      {edge.weight != null && <span className="text-tiny text-white/25 ml-1 flex-shrink-0">{edge.weight.toFixed(0)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployers */}
            {(report.deployers?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-tiny font-bold uppercase tracking-wide text-white/30 px-1">
                  Cartel Members
                </p>
                {report.deployers!.slice(0, 6).map((d, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigateDeployer(d.address)}
                    className="w-full bg-glass rounded-2xl p-3 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(173,200,255,0.1)' }}>
                      <User size={13} style={{ color: '#ADCEFF' }} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-small text-white font-mono truncate">{d.address.slice(0, 20)}…</div>
                      {d.rug_rate_pct != null && (
                        <div className="text-tiny mt-0.5" style={{ color: d.rug_rate_pct > 50 ? '#FF3366' : '#FF9933' }}>
                          {d.rug_rate_pct.toFixed(0)}% rug rate
                        </div>
                      )}
                    </div>
                    <ChevronRight size={13} className="text-white/20 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
