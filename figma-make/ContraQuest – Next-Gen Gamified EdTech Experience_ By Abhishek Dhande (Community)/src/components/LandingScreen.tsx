import { motion } from 'motion/react';
import { Shield, Hexagon, ArrowRight, Zap, Network, Brain } from 'lucide-react';
import { Screen } from '../App';

interface LandingScreenProps {
  onNavigate: (screen: Screen) => void;
}

export function LandingScreen({ onNavigate }: LandingScreenProps) {
  return (
    <div className="min-h-screen px-6 pt-12 pb-4 flex flex-col items-center justify-center relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary blur-[120px] opacity-60 pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-48 h-48 bg-accent blur-[100px] opacity-20 pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex-1 flex flex-col items-center justify-center w-full relative z-10"
      >
        {/* Logo / Main Graphic - Fixed centering */}
        <div className="relative mb-12 w-[150px] h-[150px] flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Hexagon size={120} className="text-secondary/20" strokeWidth={1} />
          </motion.div>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Hexagon size={150} className="text-primary/40" strokeWidth={1} />
          </motion.div>
          
          <div className="w-24 h-24 bg-card-glass rounded-3xl flex items-center justify-center relative z-10 shadow-glow">
            <Shield size={48} className="text-white" strokeWidth={1.5} />
            <div className="absolute inset-0 bg-secondary blur-2xl opacity-20 rounded-3xl" />
          </div>
        </div>

        {/* Typographic Header */}
        <div className="text-center mb-8">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-0.04em' }}
          >
            LINEAGE <span className="text-secondary">AGENT</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-body text-white/60"
          >
            Advanced On-Chain Intelligence<br/>for Solana Traders
          </motion.p>
        </div>

        {/* Feature Pills */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap justify-center gap-3 mb-16 w-full max-w-[280px]"
        >
          <div className="bg-glass px-4 py-2.5 rounded-full flex items-center gap-2">
            <Brain size={14} className="text-accent" />
            <span className="text-tiny text-white/80" style={{ fontWeight: 500 }}>Neural Detection</span>
          </div>
          <div className="bg-glass px-4 py-2.5 rounded-full flex items-center gap-2">
            <Network size={14} className="text-secondary" />
            <span className="text-tiny text-white/80" style={{ fontWeight: 500 }}>Lineage Mapping</span>
          </div>
          <div className="bg-glass px-4 py-2.5 rounded-full flex items-center gap-2">
            <Zap size={14} className="text-success" />
            <span className="text-tiny text-white/80" style={{ fontWeight: 500 }}>Real-time Alerts</span>
          </div>
        </motion.div>

        {/* Primary Action Button - removed hover effect */}
        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 20 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate('login')}
          className="w-full h-14 bg-white rounded-[var(--radius-standard)] flex items-center justify-center gap-3 relative overflow-hidden min-h-[48px]"
        >
          <span className="text-body relative z-10 text-primary" style={{ fontWeight: 700 }}>INITIALIZE NODE</span>
          <ArrowRight size={20} className="relative z-10 text-primary" />
        </motion.button>
      </motion.div>
      
      {/* Footer text */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-10 text-tiny text-white/40 font-mono"
      >
        SECURE PROTOCOL v2.4
      </motion.p>
    </div>
  );
}
