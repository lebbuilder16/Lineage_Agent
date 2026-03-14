import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Skull, TrendingDown, TrendingUp, Minus, Clock, Activity } from 'lucide-react';
import type { TokenSearchResult, LineageResult } from '../types/api';
import { getLineage } from '../lib/api';

interface DeathClockScreenProps {
  selectedToken: TokenSearchResult | null;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#FF3366', high: '#FF9933', medium: '#FFD700', low: '#00FF88',
};

const CONFIDENCE_ANGLES: Record<string, number> = {
  low: 45, medium: 112, high: 180, critical: 230,
};

function GaugeArc({ angle, color }: { angle: number; color: string }) {
  const r = 60;
  const cx = 80;
  const cy = 80;
  const startAngle = -200;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = ((startAngle + angle) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = angle > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 160 100" className="w-full max-w-[200px]">
      {/* Track */}
      <path
        d={`M ${cx + r * Math.cos(-200 * Math.PI / 180)} ${cy + r * Math.sin(-200 * Math.PI / 180)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(-20 * Math.PI / 180)} ${cy + r * Math.sin(-20 * Math.PI / 180)}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round"
      />
      {/* Value arc */}
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
      />
    </svg>
  );
}

export function DeathClockScreen({ selectedToken }: DeathClockScreenProps) {
  const [result, setResult] = useState<LineageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedToken?.mint) return;
    setLoading(true);
    setError(null);
    getLineage(selectedToken.mint)
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedToken?.mint]);

  const dc = result?.death_clock;
  const riskColor = RISK_COLORS[dc?.risk_level ?? result?.risk_level ?? 'low'] ?? '#6B7280';
  const confidenceKey = dc?.confidence_level != null
    ? (dc.confidence_level >= 0.75 ? 'critical' : dc.confidence_level >= 0.5 ? 'high' : dc.confidence_level >= 0.25 ? 'medium' : 'low')
    : 'low';
  const gaugeAngle = CONFIDENCE_ANGLES[confidenceKey] ?? 45;
  const confidencePct = dc?.confidence_level != null ? Math.round(dc.confidence_level * 100) : 25;

  const signals = dc?.market_signals;

  const SignalRow = ({ label, value }: { label: string; value: string | null }) => {
    if (!value) return null;
    const up = value === 'rising' || value === 'low';
    const down = value === 'falling' || value === 'high';
    return (
      <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: down ? 'rgba(255,51,102,0.1)' : up ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)' }}>
          {down ? <TrendingDown size={12} style={{ color: '#FF3366' }} /> : up ? <TrendingUp size={12} style={{ color: '#00FF88' }} /> : <Minus size={12} className="text-white/30" />}
        </div>
        <span className="text-small text-white/60 flex-1 capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="text-small font-semibold capitalize" style={{ color: down ? '#FF3366' : up ? '#00FF88' : 'rgba(255,255,255,0.5)' }}>{value}</span>
      </div>
    );
  };

  if (!selectedToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,51,102,0.08)' }}>
          <Skull size={28} style={{ color: '#FF3366', opacity: 0.4 }} />
        </div>
        <p className="text-small text-white/30">Select a token from the radar<br />to see its death clock forecast</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.12)' }}>
          <Skull size={16} style={{ color: '#FF3366' }} />
        </div>
        <div>
          <h2 className="text-section-header font-bold text-white">DEATH CLOCK</h2>
          <p className="text-tiny text-white/40">Rug probability forecast</p>
        </div>
        {selectedToken && (
          <div className="ml-auto text-right">
            <div className="text-small font-bold text-white">{selectedToken.symbol ?? '?'}</div>
            <div className="text-tiny text-white/30">{selectedToken.mint.slice(0, 8)}…</div>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="bg-glass rounded-2xl h-48 animate-pulse" />
          <div className="bg-glass rounded-2xl h-32 animate-pulse" />
        </div>
      )}

      {error && (
        <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
          <p className="text-small text-white/50">{error}</p>
        </div>
      )}

      {!loading && result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Risk Gauge */}
          <div className="bg-glass rounded-3xl p-5 flex flex-col items-center">
            <GaugeArc angle={gaugeAngle} color={riskColor} />
            <div className="text-center -mt-2">
              <div className="text-hero font-black" style={{ color: riskColor }}>
                {result.risk_score != null ? Math.round(result.risk_score) : '—'}
              </div>
              <div className="text-tiny font-bold uppercase tracking-widest" style={{ color: riskColor }}>{dc?.risk_level ?? result.risk_level ?? 'unknown'} risk</div>
              {dc?.confidence_level && (
                <div className="text-tiny text-white/30 mt-1">{confidencePct}% confidence</div>
              )}
            </div>
          </div>

          {/* Prediction Window */}
          {(dc?.predicted_window_start || dc?.predicted_window_end) && (
            <div className="bg-glass rounded-2xl p-4 flex items-start gap-3" style={{ border: `1px solid ${riskColor}20` }}>
              <Clock size={16} style={{ color: riskColor }} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-small font-bold text-white mb-0.5">Estimated Crash Window</div>
                <p className="text-small text-white/60">
                  {dc.predicted_window_start ?? ''}
                  {dc.predicted_window_end ? ` – ${dc.predicted_window_end}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Market Signals */}
          {signals && (
            <div className="bg-glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={13} style={{ color: '#ADCEFF' }} />
                <span className="text-small font-bold text-white">Market Signals</span>
              </div>
              <SignalRow label="Liquidity Trend" value={signals.liquidity_trend ?? null} />
              <SignalRow label="Sell Pressure" value={signals.sell_pressure != null ? `${Math.round(signals.sell_pressure * 100)}%` : null} />
              <SignalRow label="Volume Trend" value={signals.volume_trend ?? null} />
            </div>
          )}

          {/* Suspicious Flags */}
          {(result.suspicious_flags?.length ?? 0) > 0 && (
            <div className="bg-glass rounded-2xl p-4">
              <p className="text-tiny font-bold uppercase tracking-wide text-white/40 mb-2">Risk Factors</p>
              <div className="flex flex-wrap gap-1.5">
                {result.suspicious_flags!.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-full text-tiny font-semibold" style={{ background: 'rgba(255,153,51,0.12)', color: '#FF9933' }}>
                    ⚠ {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* No death_clock data */}
          {!dc && (
            <div className="bg-glass rounded-2xl p-4 text-center">
              <p className="text-small text-white/30">No death clock data available for this token</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
