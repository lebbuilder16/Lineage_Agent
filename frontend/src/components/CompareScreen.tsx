import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, GitCompare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TokenCompareResult } from '../types/api';
import { compareTokens } from '../lib/api';

interface CompareScreenProps {
  initialMints: [string, string];
  onBack: () => void;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#FF3366', high: '#FF9933', medium: '#FFD700', low: '#00FF88',
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, score)}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-small font-black w-8 text-right" style={{ color }}>{Math.round(score)}</span>
    </div>
  );
}

export function CompareScreen({ initialMints, onBack }: CompareScreenProps) {
  const [result, setResult] = useState<TokenCompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mintA, mintB] = initialMints;

  useEffect(() => {
    setLoading(true);
    compareTokens(mintA, mintB)
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mintA, mintB]);

  const a = result?.token_a;
  const b = result?.token_b;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(111,106,207,0.15)' }}>
          <GitCompare size={15} style={{ color: '#ADCEFF' }} />
        </div>
        <div>
          <h2 className="text-small font-bold text-white">TOKEN COMPARE</h2>
          <p className="text-tiny text-white/40">Side-by-side risk analysis</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
        {loading && (
          <div className="space-y-3">
            <div className="bg-glass rounded-2xl h-32 animate-pulse" />
            <div className="bg-glass rounded-2xl h-48 animate-pulse" />
          </div>
        )}

        {error && (
          <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
            <p className="text-small text-white/50">{error}</p>
          </div>
        )}

        {result && !loading && a && b && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Token Headers */}
            <div className="grid grid-cols-2 gap-2">
              {[a, b].map((t, i) => {
                const rc = RISK_COLORS[t.risk_level ?? 'low'];
                return (
                  <div key={i} className="bg-glass rounded-2xl p-3 text-center" style={{ border: `1px solid ${rc}20` }}>
                    <div className="w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center font-bold text-small" style={{ background: `${rc}15`, color: rc }}>
                      {t.image_uri ? <img src={t.image_uri} alt="" className="w-full h-full rounded-xl object-cover" /> : (t.symbol ?? '?').slice(0, 2)}
                    </div>
                    <div className="text-small font-bold text-white truncate">{t.symbol ?? t.mint.slice(0, 6)}</div>
                    <div className="text-hero font-black mt-1" style={{ color: rc }}>
                      {t.risk_score != null ? Math.round(t.risk_score) : '?'}
                    </div>
                    <div className="text-tiny font-bold uppercase" style={{ color: rc }}>{t.risk_level ?? 'unknown'}</div>
                  </div>
                );
              })}
            </div>

            {/* Similarity */}
            {result.similarity_score != null && (
              <div className="bg-glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-small font-bold text-white">Similarity Score</span>
                  <span className="text-small font-black" style={{ color: result.similarity_score > 0.7 ? '#FF3366' : result.similarity_score > 0.4 ? '#FF9933' : '#00FF88' }}>
                    {(result.similarity_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${result.similarity_score * 100}%` }}
                    transition={{ duration: 0.7 }}
                    className="h-full rounded-full"
                    style={{ background: result.similarity_score > 0.7 ? '#FF3366' : result.similarity_score > 0.4 ? '#FF9933' : '#00FF88' }}
                  />
                </div>
                {result.same_deployer && (
                  <p className="text-tiny text-white/50 mt-2">⚠ Same deployer detected</p>
                )}
              </div>
            )}

            {/* Risk Score Comparison */}
            <div className="bg-glass rounded-2xl p-4">
              <p className="text-tiny font-bold uppercase tracking-wide text-white/40 mb-3">Risk Score Comparison</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-tiny text-white/60">{a.symbol ?? 'Token A'}</span>
                  </div>
                  <ScoreBar score={a.risk_score ?? 0} color={RISK_COLORS[a.risk_level ?? 'low']} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-tiny text-white/60">{b.symbol ?? 'Token B'}</span>
                  </div>
                  <ScoreBar score={b.risk_score ?? 0} color={RISK_COLORS[b.risk_level ?? 'low']} />
                </div>
              </div>
            </div>

            {/* Shared Flags */}
            {(result.shared_suspicious_flags?.length ?? 0) > 0 && (
              <div className="bg-glass rounded-2xl p-4">
                <p className="text-tiny font-bold uppercase tracking-wide text-white/40 mb-2">Shared Suspicious Flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.shared_suspicious_flags!.map((f) => (
                    <span key={f} className="px-2 py-0.5 rounded-full text-tiny font-semibold" style={{ background: 'rgba(255,153,51,0.12)', color: '#FF9933' }}>
                      ⚠ {f.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Verdict */}
            {result.verdict && (
              <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(111,106,207,0.2)' }}>
                <p className="text-small font-bold text-white mb-1">Analysis Verdict</p>
                <p className="text-small text-white/60">{result.verdict}</p>
              </div>
            )}
          </motion.div>
        )}

        {!loading && !error && !result && (
          <div className="text-center py-12 text-small text-white/30">No comparison data available</div>
        )}
      </div>
    </div>
  );
}
