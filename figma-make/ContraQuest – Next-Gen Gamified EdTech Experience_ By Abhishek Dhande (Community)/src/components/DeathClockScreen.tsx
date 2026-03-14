import { useState } from 'react';
import { motion } from 'motion/react';
import { Skull, AlertTriangle, Brain, Activity, Hexagon } from 'lucide-react';

interface DeathClockScreenProps {
  selectedToken: any;
}

// SVG Ring Gauge Component
function RiskGauge({ percentage, color }: { percentage: number; color: string }) {
  const radius = 72;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-[180px] h-[180px] flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180" className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 200, damping: 15 }}
        >
          <span style={{ fontSize: '52px', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.04em' }}>
            {percentage}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: `${color}99` }}>%</span>
        </motion.div>
        <p className="text-tiny text-white/50 mt-1 uppercase tracking-widest" style={{ fontWeight: 600 }}>
          Crash Risk
        </p>
      </div>
    </div>
  );
}

export function DeathClockScreen({ selectedToken }: DeathClockScreenProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => setIsAnalyzing(false), 2500);
  };

  const prediction = selectedToken ? {
    crashProbability: 94,
    timeframe: '24-48h',
    confidence: 'Very High',
    signals: [
      { name: 'Liquidity Drain Pattern', severity: 'critical', weight: 85 },
      { name: 'Whale Sell Pressure', severity: 'high', weight: 65 },
      { name: 'Dev Wallet Activity', severity: 'critical', weight: 90 },
      { name: 'Social Sentiment Drop', severity: 'medium', weight: 45 }
    ],
    aiInsights: [
      'Deployer wallet shows identical behavior to 12 previous rug pulls',
      'Liquidity pool manipulation detected in last 6 hours',
      'Price action matches 94% of known rug patterns',
      'Social media activity spike suggests coordinated exit'
    ]
  } : null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#FF0033';
      case 'high': return '#FF3366';
      case 'medium': return '#FF9933';
      default: return '#00FF88';
    }
  };

  return (
    <div className="min-h-screen px-5 pt-6 pb-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="relative">
            <Skull className="text-accent relative z-10" size={28} strokeWidth={2.5} />
            <div className="absolute inset-0 bg-accent blur-md opacity-50 rounded-full" />
          </div>
          <h1 className="text-white" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Death Clock
          </h1>
        </div>
        <p className="text-body text-white/60 ml-10">
          AI-powered crash probability engine
        </p>
      </motion.div>

      {prediction ? (
        <div className="space-y-5">
          {/* Main Prediction Terminal with Ring Gauge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            className="relative overflow-hidden p-6"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-2xl border border-white/5" style={{ borderRadius: 'var(--radius-card)' }} />
            <div className="absolute inset-0 bg-gradient-to-br from-error/8 to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center">
              {/* Token name */}
              {selectedToken && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-tiny text-white/40 uppercase tracking-widest" style={{ fontWeight: 600 }}>
                    Analyzing
                  </span>
                  <span className="px-3 py-1 bg-white/5 rounded-lg text-white text-small font-mono border border-white/10">
                    {selectedToken.symbol}
                  </span>
                </div>
              )}

              {/* Ring Gauge */}
              <RiskGauge percentage={prediction.crashProbability} color="#FF0033" />

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-3 w-full mt-5">
                <div className="bg-white/5 border border-white/8 p-4 flex flex-col items-center justify-center" style={{ borderRadius: 'var(--radius-standard)' }}>
                  <p className="text-tiny text-white/40 mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Timeframe
                  </p>
                  <p className="text-white" style={{ fontSize: '15px', fontWeight: 700 }}>
                    {prediction.timeframe}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/8 p-4 flex flex-col items-center justify-center" style={{ borderRadius: 'var(--radius-standard)' }}>
                  <p className="text-tiny text-white/40 mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Confidence
                  </p>
                  <p className="text-accent" style={{ fontSize: '15px', fontWeight: 700 }}>
                    {prediction.confidence}
                  </p>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="relative z-10 mt-5 p-3.5 bg-error/10 border border-error/20 flex items-start gap-3" style={{ borderRadius: 'var(--radius-standard)' }}>
              <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
              <p className="text-small text-accent" style={{ fontWeight: 500, lineHeight: 1.5 }}>
                EXTREME RISK: Immediate exit advised. Multiple critical failure patterns detected.
              </p>
            </div>
          </motion.div>

          {/* Risk Signals */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card-glass p-5"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-warning/15 rounded-xl">
                <Activity size={18} className="text-warning" />
              </div>
              <h3 className="text-white" style={{ fontSize: '17px', fontWeight: 600 }}>
                Anomaly Signals
              </h3>
            </div>

            <div className="space-y-4">
              {prediction.signals.map((signal, index) => {
                const color = getSeverityColor(signal.severity);
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-body text-white/80" style={{ fontWeight: 500 }}>
                        {signal.name}
                      </span>
                      <span className="text-body" style={{ color, fontWeight: 700 }}>
                        {signal.weight}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${signal.weight}%` }}
                        transition={{ duration: 1.5, delay: 0.5 + index * 0.1, ease: "easeOut" }}
                        className="h-full rounded-full relative"
                        style={{ backgroundColor: color }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* AI Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-card-glass p-5"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-secondary/15 rounded-xl">
                <Brain size={18} className="text-secondary" />
              </div>
              <h3 className="text-white" style={{ fontSize: '17px', fontWeight: 600 }}>
                Neural Analysis
              </h3>
            </div>

            <div className="space-y-2.5">
              {prediction.aiInsights.map((insight, index) => (
                <div key={index} className="flex gap-3 p-3.5 bg-black/20 rounded-2xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 shrink-0 shadow-[0_0_6px_var(--color-secondary)]" />
                  <p className="text-small text-white/75" style={{ lineHeight: 1.6 }}>
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Action Button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAnalyze}
            className="w-full relative overflow-hidden p-4 flex justify-center items-center gap-3 min-h-[52px]"
            style={{ borderRadius: 'var(--radius-standard)' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-error to-accent opacity-90" />
            
            {isAnalyzing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="relative z-10"
              >
                <Activity size={22} className="text-white" />
              </motion.div>
            ) : (
              <>
                <Brain size={20} className="text-white relative z-10" />
                <span className="text-white relative z-10 tracking-wide" style={{ fontSize: '14px', fontWeight: 700 }}>
                  RE-RUN ANALYSIS
                </span>
              </>
            )}
          </motion.button>
        </div>
      ) : (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center justify-center py-28"
        >
          <div className="relative mb-8 w-24 h-24 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Hexagon size={96} className="text-accent/10" strokeWidth={1} />
            </motion.div>
            <Skull size={48} className="text-accent/30 relative z-10" />
          </div>
          <h3 className="text-white mb-3" style={{ fontSize: '18px', fontWeight: 600 }}>
            Awaiting Target
          </h3>
          <p className="text-body text-white/40 text-center" style={{ lineHeight: 1.6 }}>
            Select a token from the Radar to calculate<br />its imminent crash probability
          </p>
        </motion.div>
      )}
    </div>
  );
}
