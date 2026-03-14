import { motion } from 'motion/react';
import { TrendingDown, AlertTriangle, Shield, Activity, Search as SearchIcon, Skull, Droplets, ChevronRight } from 'lucide-react';
import { Screen } from '../App';

interface RadarScreenProps {
  onTokenSelect: (token: any) => void;
  onNavigate: (screen: Screen) => void;
}

export function RadarScreen({ onTokenSelect, onNavigate }: RadarScreenProps) {
  const riskyTokens = [
    {
      id: 1,
      name: 'MOON ROCKET',
      symbol: 'MNRKT',
      address: 'A7Bx...Kp9z',
      riskScore: 95,
      reason: 'Zombie Token Detected',
      type: 'zombie',
      price: '$0.00042',
      change: '-87.4%',
      liquidity: '$12.4K',
      holders: 234,
      timestamp: '2m ago',
      flags: ['Same deployer', 'Cloned image', 'Previous rug']
    },
    {
      id: 2,
      name: 'SafeMoon V3',
      symbol: 'SFMV3',
      address: 'B2Cy...Mp4x',
      riskScore: 89,
      reason: 'Bundle Detected',
      type: 'bundle',
      price: '$0.0012',
      change: '-62.1%',
      liquidity: '$45.2K',
      holders: 892,
      timestamp: '5m ago',
      flags: ['Coordinated wallets', 'Team dumping', 'High concentration']
    },
    {
      id: 3,
      name: 'DogeCoin 2.0',
      symbol: 'DOGE2',
      address: 'C8Dz...Qr5w',
      riskScore: 92,
      reason: 'Insider Sell Alert',
      type: 'insider',
      price: '$0.00089',
      change: '-73.9%',
      liquidity: '$8.7K',
      holders: 156,
      timestamp: '8m ago',
      flags: ['Dev wallet sold', 'Pre-dump pattern', 'Low liquidity']
    },
    {
      id: 4,
      name: 'ElonMars',
      symbol: 'EMARS',
      address: 'D9Ex...Ts6y',
      riskScore: 97,
      reason: 'Death Clock: 94% crash',
      type: 'death-clock',
      price: '$0.00156',
      change: '-91.2%',
      liquidity: '$3.2K',
      holders: 67,
      timestamp: '12m ago',
      flags: ['AI high risk', 'Liquidity drain', 'Pattern match']
    },
    {
      id: 5,
      name: 'Shiba King',
      symbol: 'SHIBK',
      address: 'E4Fy...Uv7z',
      riskScore: 85,
      reason: 'Lineage Pattern Detected',
      type: 'lineage',
      price: '$0.00234',
      change: '-54.6%',
      liquidity: '$67.8K',
      holders: 445,
      timestamp: '15m ago',
      flags: ['Family of rugs', 'Linked wallets', 'Repeat operator']
    }
  ];

  const quickActions = [
    { icon: SearchIcon, label: 'Scan Token', screen: 'scan' as Screen, color: '#ADC8FF', bg: 'rgba(173, 200, 255, 0.12)' },
    { icon: Skull, label: 'Death Clock', screen: 'death-clock' as Screen, color: '#FF3366', bg: 'rgba(255, 51, 102, 0.12)' },
    { icon: Shield, label: 'Protection', screen: 'alerts' as Screen, color: '#00FF88', bg: 'rgba(0, 255, 136, 0.12)' },
  ];

  const getRiskColor = (score: number) => {
    if (score >= 90) return '#FF3366';
    if (score >= 75) return '#FF9933';
    return '#00FF88';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'zombie': return '#B066FF';
      case 'bundle': return '#FF3366'; 
      case 'insider': return '#FF9933'; 
      case 'death-clock': return '#FF0033'; 
      case 'lineage': return '#FF3399';
      default: return '#ADC8FF';
    }
  };

  return (
    <div className="min-h-screen px-5 pt-6 pb-4 flex flex-col">
      {/* Sleek Header */}
      <motion.div
        initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between mb-6"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="relative">
              <Activity className="text-secondary relative z-10" size={26} strokeWidth={2.5} />
              <div className="absolute inset-0 bg-secondary blur-md opacity-50 rounded-full" />
            </div>
            <h1 className="text-white leading-none" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Radar Feed
            </h1>
          </div>
          <p className="text-tiny text-secondary/70 ml-10">
            Real-time Solana intelligence
          </p>
        </div>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute w-2 h-2 rounded-full bg-success"
            />
            <div className="w-1.5 h-1.5 rounded-full bg-success relative z-10 shadow-[0_0_8px_var(--color-success)]" />
          </div>
          <span className="text-[10px] text-success tracking-wide uppercase" style={{ fontWeight: 700 }}>
            {riskyTokens.length} Live
          </span>
        </div>
      </motion.div>

      {/* Minimalist Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-6 flex gap-2"
      >
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={index}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate(action.screen)}
              className="flex-1 p-3.5 flex flex-col items-center justify-center gap-2 relative overflow-hidden min-h-[68px]"
              style={{ 
                borderRadius: 'var(--radius-standard)',
                backgroundColor: action.bg,
                border: '1px solid rgba(255,255,255,0.06)'
              }}
            >
              <Icon size={18} style={{ color: action.color }} strokeWidth={2} />
              <span className="text-[10px] text-white/70" style={{ fontWeight: 500 }}>
                {action.label}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Section label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex items-center justify-between mb-4"
      >
        <span className="text-tiny text-white/40 uppercase tracking-widest" style={{ fontWeight: 600 }}>
          Threat Feed
        </span>
        <span className="text-tiny text-white/20">
          Updated just now
        </span>
      </motion.div>

      {/* Risky Tokens Feed */}
      <div className="space-y-3">
        {riskyTokens.map((token, index) => {
          const riskColor = getRiskColor(token.riskScore);
          const typeColor = getTypeColor(token.type);
          
          return (
            <motion.div
              key={token.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index + 0.3, duration: 0.5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onTokenSelect(token);
                onNavigate('scan');
              }}
              className="bg-glass border border-white/5 p-4 relative overflow-hidden flex items-center gap-3 min-h-[80px]"
              style={{ borderRadius: 'var(--radius-card)' }}
            >
              {/* Risk Color Indicator Line */}
              <div 
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                style={{ backgroundColor: riskColor, boxShadow: `0 0 8px ${riskColor}40` }}
              />

              {/* Left Content - Info */}
              <div className="flex-1 pl-2 min-w-0">
                {/* Title row */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-white truncate" style={{ fontSize: '15px', fontWeight: 600 }}>{token.name}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-md text-white/50 font-mono shrink-0">
                    {token.symbol}
                  </span>
                </div>

                {/* Threat Insight */}
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle size={11} style={{ color: typeColor }} />
                  <span className="text-[11px]" style={{ color: typeColor, fontWeight: 500 }}>
                    {token.reason}
                  </span>
                  <span className="text-[10px] text-white/25 ml-auto shrink-0">
                    {token.timestamp}
                  </span>
                </div>

                {/* Simplified Metrics Row */}
                <div className="flex items-center gap-3 text-[11px] text-white/40">
                  <div className="flex items-center gap-1.5">
                    <Droplets size={11} className="text-secondary/60" />
                    <span>{token.liquidity}</span>
                  </div>
                  <div className="w-[1px] h-3 bg-white/8" />
                  <div className="flex items-center gap-1.5 text-accent/90">
                    <TrendingDown size={11} />
                    <span>{token.change}</span>
                  </div>
                </div>
              </div>

              {/* Right Content - Score + Arrow */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center relative bg-black/30 border border-white/8">
                  <div 
                    className="absolute inset-0 rounded-full opacity-15 blur-md pointer-events-none" 
                    style={{ backgroundColor: riskColor }} 
                  />
                  <span className="relative z-10" style={{ color: riskColor, fontSize: '18px', fontWeight: 700 }}>
                    {token.riskScore}
                  </span>
                </div>
                <ChevronRight size={16} className="text-white/15" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
