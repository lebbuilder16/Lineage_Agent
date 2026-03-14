import { useState } from 'react';
import { motion } from 'motion/react';
import { Wallet, Mail, Lock, ArrowRight, ShieldCheck, Fingerprint } from 'lucide-react';
import { Screen } from '../App';

interface LoginScreenProps {
  onNavigate: (screen: Screen) => void;
}

export function LoginScreen({ onNavigate }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectWallet = () => {
    setIsConnecting(true);
    // Mock connection delay
    setTimeout(() => {
      setIsConnecting(false);
      onNavigate('radar');
    }, 1500);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onNavigate('radar');
    }
  };

  return (
    <div className="min-h-screen px-6 pt-16 pb-8 flex flex-col relative">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-secondary blur-[120px] opacity-20 pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <div className="w-12 h-12 bg-card-glass rounded-2xl flex items-center justify-center mb-6 border border-white/10">
          <ShieldCheck size={24} className="text-secondary" />
        </div>
        <h1 className="text-main-heading text-white mb-2">Secure Access</h1>
        <p className="text-body text-white/60">
          Connect your wallet or login to synchronize your intel node.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="flex-1"
      >
        {/* Wallet Connect */}
        <div className="mb-8">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleConnectWallet}
            className="w-full h-14 bg-gradient-to-r from-[#AB9FF2] to-[#512DA8] rounded-[var(--radius-standard)] flex items-center justify-center gap-3 relative overflow-hidden shadow-[0_0_20px_rgba(81,45,168,0.3)] border border-[#AB9FF2]/50"
          >
            {isConnecting ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Fingerprint size={24} className="text-white" />
              </motion.div>
            ) : (
              <>
                <Wallet size={20} className="text-white" />
                <span className="font-bold text-body text-white">Connect Phantom Wallet</span>
              </>
            )}
          </motion.button>
          
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="h-[1px] flex-1 bg-white/10" />
            <span className="text-tiny text-white/40 uppercase tracking-widest font-semibold">Or standard login</span>
            <div className="h-[1px] flex-1 bg-white/10" />
          </div>
        </div>

        {/* Email Login Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-tiny ml-2">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail size={18} className="text-white/40" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@solana.com"
                className="w-full h-14 bg-glass border border-white/10 rounded-[var(--radius-standard)] pl-12 pr-4 text-white text-body placeholder:text-white/20 outline-none focus:border-secondary/50 focus:ring-1 focus:ring-secondary/50 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1 mb-6">
            <label className="text-tiny ml-2">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className="text-white/40" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-14 bg-glass border border-white/10 rounded-[var(--radius-standard)] pl-12 pr-4 text-white text-body placeholder:text-white/20 outline-none focus:border-secondary/50 focus:ring-1 focus:ring-secondary/50 transition-all"
                required
              />
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="w-full h-14 bg-card-glass rounded-[var(--radius-standard)] flex items-center justify-center gap-2 border border-white/20 mt-8"
          >
            <span className="font-bold text-body text-white">Sign In</span>
            <ArrowRight size={18} className="text-secondary" />
          </motion.button>
        </form>
      </motion.div>
      
      <div className="mt-auto text-center">
        <p className="text-tiny text-white/40">
          Don't have an account? <span className="text-secondary" style={{ fontWeight: 500 }}>Request Access</span>
        </p>
      </div>
    </div>
  );
}