import { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, AlertTriangle, ChevronRight } from 'lucide-react';

export function AlertsScreen() {
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');

  const alerts = [
    {
      id: 1,
      type: 'critical',
      title: 'Zombie Token Detected',
      description: 'MOON ROCKET - Same deployer relaunched after rug',
      token: 'MNRKT',
      timestamp: '2m ago',
      action: 'View Details'
    },
    {
      id: 2,
      type: 'critical',
      title: 'Death Clock Alert',
      description: 'ElonMars shows 97% crash probability in 24-48h',
      token: 'EMARS',
      timestamp: '5m ago',
      action: 'View Prediction'
    },
    {
      id: 3,
      type: 'high',
      title: 'Bundle Detected',
      description: 'SafeMoon V3 - Coordinated wallet dumping detected',
      token: 'SFMV3',
      timestamp: '8m ago',
      action: 'View Network'
    },
    {
      id: 4,
      type: 'critical',
      title: 'Insider Sell Alert',
      description: 'Dev wallet sold 45% holdings in DogeCoin 2.0',
      token: 'DOGE2',
      timestamp: '12m ago',
      action: 'View Wallet'
    },
    {
      id: 5,
      type: 'high',
      title: 'Liquidity Warning',
      description: 'Shiba King liquidity dropped 67% in last hour',
      token: 'SHIBK',
      timestamp: '15m ago',
      action: 'View Chart'
    },
    {
      id: 6,
      type: 'medium',
      title: 'Price Alert',
      description: 'SafePepe down 89% from ATH with low volume',
      token: 'SPEPE',
      timestamp: '22m ago',
      action: 'View Details'
    }
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'critical': return { bg: '#FF0033', text: '#FF3366', glow: 'rgba(255,0,51,0.15)' };
      case 'high': return { bg: '#FF9933', text: '#FF9933', glow: 'rgba(255,153,51,0.15)' };
      case 'medium': return { bg: '#00FF88', text: '#00FF88', glow: 'rgba(0,255,136,0.15)' };
      default: return { bg: '#ADC8FF', text: '#ADC8FF', glow: 'rgba(173,200,255,0.15)' };
    }
  };

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(alert => alert.type === filter);

  const alertCounts = {
    all: alerts.length,
    critical: alerts.filter(a => a.type === 'critical').length,
    high: alerts.filter(a => a.type === 'high').length,
    medium: alerts.filter(a => a.type === 'medium').length,
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
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="text-secondary relative z-10" size={26} strokeWidth={2.5} />
              <div className="absolute inset-0 bg-secondary blur-md opacity-50 rounded-full" />
            </div>
            <h1 className="text-white" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Alerts
            </h1>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-success shadow-[0_0_10px_var(--color-success)]"
            />
            <span className="text-white uppercase tracking-wider text-tiny" style={{ fontWeight: 600 }}>
              Active
            </span>
          </div>
        </div>
        <p className="text-body text-white/60 ml-10">
          Real-time network threat monitoring
        </p>
      </motion.div>

      {/* Filter Pills with counts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {(['all', 'critical', 'high', 'medium'] as const).map((type) => {
            const isSelected = filter === type;
            const colors = type !== 'all' ? getTypeColor(type) : { bg: 'var(--color-secondary)', text: 'var(--color-secondary)', glow: 'rgba(173,200,255,0.15)' };
            
            return (
              <motion.button
                key={type}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilter(type)}
                className="px-4 py-2.5 whitespace-nowrap relative overflow-hidden transition-colors flex items-center gap-2 min-h-[44px]"
                style={{
                  borderRadius: 'var(--radius-standard)',
                  backgroundColor: isSelected ? (type === 'all' ? 'rgba(173,200,255,0.12)' : colors.glow) : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${isSelected ? `${colors.bg}40` : 'rgba(255, 255, 255, 0.06)'}`
                }}
              >
                <span className="text-small capitalize" style={{ color: isSelected ? colors.text : '#ffffff50', fontWeight: 600 }}>
                  {type}
                </span>
                <span 
                  className="text-tiny px-1.5 py-0.5 rounded-md"
                  style={{ 
                    backgroundColor: isSelected ? `${colors.bg}20` : 'rgba(255,255,255,0.05)',
                    color: isSelected ? colors.text : '#ffffff30',
                    fontWeight: 700
                  }}
                >
                  {alertCounts[type]}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {filteredAlerts.map((alert, index) => {
          const colors = getTypeColor(alert.type);
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index + 0.3, duration: 0.5 }}
              whileTap={{ scale: 0.98 }}
              className="bg-card-glass p-4 relative overflow-hidden"
              style={{ borderRadius: 'var(--radius-card)' }}
            >
              {/* Severity ambient glow */}
              <div 
                className="absolute -right-12 -top-12 w-28 h-28 rounded-full blur-[50px] opacity-15 pointer-events-none"
                style={{ backgroundColor: colors.bg }}
              />

              {/* Header */}
              <div className="flex items-start gap-3 mb-3 relative z-10">
                <div
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: colors.bg, boxShadow: `0 0 8px ${colors.bg}` }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white mb-1" style={{ fontSize: '15px', fontWeight: 600 }}>
                    {alert.title}
                  </h3>
                  <p className="text-body text-white/55" style={{ lineHeight: 1.5 }}>
                    {alert.description}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="px-2.5 py-1 bg-black/30 rounded-lg border border-white/5">
                    <span className="text-tiny text-white/80 font-mono">
                      {alert.token}
                    </span>
                  </div>
                  <span className="text-tiny text-white/30">
                    {alert.timestamp}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 text-secondary">
                  <span className="text-tiny" style={{ fontWeight: 600 }}>
                    {alert.action}
                  </span>
                  <ChevronRight size={14} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
