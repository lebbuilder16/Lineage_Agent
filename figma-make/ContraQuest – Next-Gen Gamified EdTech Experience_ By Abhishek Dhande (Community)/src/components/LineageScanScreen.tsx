import { useState } from 'react';
import { motion } from 'motion/react';
import { Search as SearchIcon, AlertTriangle, Link2, Users, ExternalLink, Network, Hexagon } from 'lucide-react';

interface LineageScanScreenProps {
  selectedToken: any;
}

export function LineageScanScreen({ selectedToken }: LineageScanScreenProps) {
  const [searchInput, setSearchInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = () => {
    if (!searchInput) return;
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000);
  };

  const lineageData = selectedToken ? {
    token: selectedToken,
    deployer: {
      address: '7xKz...Wp2m',
      totalDeployed: 47,
      ruggedTokens: 38,
      successRate: '19%'
    },
    relatedTokens: [
      { name: 'Moon Rocket V1', status: 'rugged', rugDate: '2024-01-15', loss: '$127K' },
      { name: 'Moon Rocket V2', status: 'rugged', rugDate: '2024-02-08', loss: '$89K' },
      { name: 'Safe Moon Clone', status: 'rugged', rugDate: '2024-02-20', loss: '$234K' },
      { name: 'Moon Rocket V3', status: 'active', rugDate: null, marketCap: '$12K' },
    ],
    walletCluster: {
      linkedWallets: 23,
      coordinatedActivity: true,
      totalVolume: '$2.4M'
    }
  } : null;

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
            <Network className="text-secondary relative z-10" size={26} strokeWidth={2.5} />
            <div className="absolute inset-0 bg-secondary blur-md opacity-50 rounded-full" />
          </div>
          <h1 className="text-white" style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Lineage Scan
          </h1>
        </div>
        <p className="text-body text-white/60 ml-10">
          Trace token history, deployers & connections
        </p>
      </motion.div>

      {/* Input Field */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <div className="relative p-1 bg-glass rounded-[var(--radius-pill)] flex items-center">
          <div className="pl-4 pr-2">
            <SearchIcon size={20} className="text-white/40" />
          </div>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="Paste token address..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 h-12 text-body"
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleScan}
            className="h-11 px-5 bg-secondary rounded-[var(--radius-standard)] flex items-center justify-center relative overflow-hidden ml-1 mr-0.5 min-w-[72px]"
          >
            {isScanning ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <SearchIcon size={18} className="text-primary" />
              </motion.div>
            ) : (
              <span className="text-primary text-body" style={{ fontWeight: 700 }}>Scan</span>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Results */}
      {lineageData ? (
        <div className="space-y-4">
          {/* Deployer Analysis */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card-glass p-5 relative overflow-hidden"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="absolute -right-8 -top-8 w-28 h-28 bg-warning blur-[60px] opacity-15" />
            
            <div className="flex items-center gap-3 mb-5 relative z-10">
              <div className="p-2 bg-warning/15 rounded-xl">
                <Users size={18} className="text-warning" />
              </div>
              <h3 className="text-white" style={{ fontSize: '17px', fontWeight: 600 }}>
                Deployer Profile
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-4 relative z-10">
              <div className="bg-black/30 rounded-2xl p-3.5">
                <span className="text-tiny text-white/35 block mb-1" style={{ fontWeight: 500 }}>Address</span>
                <div className="flex items-center gap-2">
                  <span className="text-small text-white font-mono">{lineageData.deployer.address}</span>
                  <ExternalLink size={11} className="text-secondary/60" />
                </div>
              </div>
              <div className="bg-black/30 rounded-2xl p-3.5">
                <span className="text-tiny text-white/35 block mb-1" style={{ fontWeight: 500 }}>Success Rate</span>
                <span className="text-small text-accent" style={{ fontWeight: 700 }}>{lineageData.deployer.successRate}</span>
              </div>
              <div className="bg-black/30 rounded-2xl p-3.5">
                <span className="text-tiny text-white/35 block mb-1" style={{ fontWeight: 500 }}>Total Deployed</span>
                <span className="text-small text-white" style={{ fontWeight: 600 }}>{lineageData.deployer.totalDeployed}</span>
              </div>
              <div className="bg-black/30 rounded-2xl p-3.5">
                <span className="text-tiny text-white/35 block mb-1" style={{ fontWeight: 500 }}>Rugged Tokens</span>
                <span className="text-small text-accent" style={{ fontWeight: 700 }}>{lineageData.deployer.ruggedTokens}</span>
              </div>
            </div>

            <div className="p-3.5 bg-accent/10 border border-accent/20 flex items-start gap-3 relative z-10" style={{ borderRadius: 'var(--radius-standard)' }}>
              <AlertTriangle size={16} className="text-accent shrink-0 mt-0.5" />
              <p className="text-small text-accent" style={{ lineHeight: 1.5, fontWeight: 500 }}>
                High risk deployer with 81% rug rate across 47 tracked contracts.
              </p>
            </div>
          </motion.div>

          {/* Related Tokens Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card-glass p-5 relative"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="absolute -left-8 top-8 w-28 h-28 bg-[#FF3399] blur-[60px] opacity-8" />

            <div className="flex items-center gap-3 mb-5 relative z-10">
              <div className="p-2 bg-[#FF3399]/15 rounded-xl">
                <Link2 size={18} className="text-[#FF3399]" />
              </div>
              <h3 className="text-white" style={{ fontSize: '17px', fontWeight: 600 }}>
                Known Token Family
              </h3>
            </div>

            <div className="space-y-2.5 relative z-10 pl-2">
              {lineageData.relatedTokens.map((token, index) => (
                <div key={index} className="relative pl-6 pb-1">
                  {/* Timeline line */}
                  {index !== lineageData.relatedTokens.length - 1 && (
                    <div className="absolute left-[3px] top-5 bottom-[-12px] w-0.5 bg-white/8" />
                  )}
                  {/* Timeline dot */}
                  <div className={`absolute left-[-2px] top-2 w-3 h-3 rounded-full border-2 border-popover ${token.status === 'rugged' ? 'bg-accent' : 'bg-success'}`} />
                  
                  <div className="bg-black/25 border border-white/5 rounded-2xl p-3.5 flex justify-between items-center">
                    <div>
                      <h4 className="text-small text-white mb-0.5" style={{ fontWeight: 600 }}>{token.name}</h4>
                      {token.status === 'rugged' ? (
                        <span className="text-tiny text-white/35">Rugged: {token.rugDate}</span>
                      ) : (
                        <span className="text-tiny text-success/70">Currently Active</span>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span 
                        className="px-2.5 py-0.5 rounded-lg text-tiny"
                        style={{ 
                          backgroundColor: token.status === 'rugged' ? 'rgba(255, 51, 102, 0.12)' : 'rgba(0, 255, 136, 0.12)',
                          color: token.status === 'rugged' ? 'var(--color-neon-pink)' : 'var(--color-success)',
                          fontWeight: 700
                        }}
                      >
                        {token.status.toUpperCase()}
                      </span>
                      <span className="text-tiny text-white/50 font-mono">
                        {token.loss || token.marketCap}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
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
              <Hexagon size={96} className="text-secondary/10" strokeWidth={1} />
            </motion.div>
            <Network size={48} className="text-secondary/25 relative z-10" />
          </div>
          <h3 className="text-white mb-3" style={{ fontSize: '18px', fontWeight: 600 }}>
            Awaiting Input
          </h3>
          <p className="text-body text-white/40 text-center" style={{ lineHeight: 1.6 }}>
            Paste a token address or select from<br />Radar to begin lineage mapping
          </p>
        </motion.div>
      )}
    </div>
  );
}
