import { motion } from 'motion/react';
import { User, Shield, Bell, Settings, LogOut, ChevronRight, TrendingUp, Eye, Zap } from 'lucide-react';

export function ProfileScreen() {
  const userStats = {
    tokensScanned: 1247,
    alertsReceived: 342,
    rugsPrevented: 18,
    savedAmount: '$47,234'
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
            <User className="text-secondary relative z-10" size={26} strokeWidth={2.5} />
            <div className="absolute inset-0 bg-secondary blur-md opacity-50 rounded-full" />
          </div>
          <h1 className="text-white" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Profile
          </h1>
        </div>
        <p className="text-body text-white/60 ml-10">
          Manage your identity & preferences
        </p>
      </motion.div>

      {/* Identity Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative p-5 mb-5 overflow-hidden bg-card-glass"
        style={{ borderRadius: 'var(--radius-card)' }}
      >
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-secondary blur-[80px] opacity-8 pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-4 mb-5">
          {/* Avatar with gradient ring */}
          <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-secondary to-primary/80 shrink-0">
            <div className="w-full h-full bg-popover rounded-full flex items-center justify-center">
              <User size={28} className="text-secondary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white mb-0.5 truncate" style={{ fontSize: '18px', fontWeight: 700 }}>
              0xAgent.sol
            </h2>
            <p className="text-small text-secondary/60 font-mono truncate">
              trader@solana.com
            </p>
          </div>
        </div>

        <div className="relative z-10 pt-4 border-t border-white/8">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-success/10 border border-success/20 rounded-xl">
            <Shield size={14} className="text-success" />
            <span className="tracking-wide text-tiny text-success" style={{ fontWeight: 700 }}>
              PRO ELITE MEMBER
            </span>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 gap-2.5 mb-6"
      >
        {[
          { icon: Eye, value: userStats.tokensScanned, label: 'Scanned', color: 'var(--color-secondary)' },
          { icon: Bell, value: userStats.alertsReceived, label: 'Alerts', color: 'var(--color-warning)' },
          { icon: Shield, value: userStats.rugsPrevented, label: 'Prevented', color: 'var(--color-success)' },
          { icon: TrendingUp, value: userStats.savedAmount, label: 'Saved', color: 'var(--color-success)' }
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-glass p-4 relative overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
              <div className="absolute top-0 right-0 p-3 opacity-8">
                <Icon size={40} color={stat.color} />
              </div>
              <Icon size={18} className="mb-2.5" color={stat.color} />
              <p className="text-white mb-0.5" style={{ fontSize: '18px', fontWeight: 700 }}>
                {stat.value}
              </p>
              <p className="text-white/35 uppercase tracking-wider text-tiny" style={{ fontWeight: 600 }}>
                {stat.label}
              </p>
            </div>
          );
        })}
      </motion.div>

      {/* Settings Menu */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-2.5 mb-6"
      >
        {[
          { icon: Zap, label: 'Neural Engine Settings', color: 'var(--color-secondary)' },
          { icon: Shield, label: 'Security & Wallets', color: 'var(--color-success)' },
          { icon: Settings, label: 'App Preferences', color: '#ffffff60' }
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={index}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-glass p-4 flex items-center justify-between min-h-[56px]"
              style={{ borderRadius: 'var(--radius-standard)' }}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <Icon size={18} style={{ color: item.color }} />
                </div>
                <span className="text-white text-body" style={{ fontWeight: 500 }}>
                  {item.label}
                </span>
              </div>
              <ChevronRight size={18} className="text-white/15" />
            </motion.button>
          );
        })}
      </motion.div>

      {/* Destructive Action */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        whileTap={{ scale: 0.95 }}
        className="w-full bg-error/8 border border-error/20 p-4 flex justify-center items-center gap-3 relative overflow-hidden min-h-[52px]"
        style={{ borderRadius: 'var(--radius-standard)' }}
      >
        <LogOut size={18} className="text-accent" />
        <span className="tracking-wide text-body text-accent" style={{ fontWeight: 700 }}>
          TERMINATE SESSION
        </span>
      </motion.button>

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-center mt-8 pb-4"
      >
        <p className="text-secondary/25 font-mono tracking-widest mb-1 text-tiny">
          AGENT_VERSION: 2.4.0 (2026)
        </p>
        <p className="text-secondary/15 font-mono text-tiny">
          SYS.UPTIME: 99.99% • NODE: LA-04
        </p>
      </motion.div>
    </div>
  );
}
