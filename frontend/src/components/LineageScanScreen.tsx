import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, AlertTriangle, CheckCircle, Clock, GitBranch, User, Layers, Skull, ChevronRight, ArrowLeft, X } from 'lucide-react';
import type { TokenSearchResult, LineageResult, AnalysisStep } from '../types/api';
import { connectLineageWS, getLineage } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface LineageScanScreenProps {
  selectedToken: TokenSearchResult | null;
  onNavigateDeployer: (address: string) => void;
  onNavigateSolTrace: (mint: string) => void;
  onNavigateCartel: (fingerprint: string) => void;
  onNavigateFamilyTree: (mint: string) => void;
  onNavigateToken: (token: TokenSearchResult) => void;
}

type Tab = 'overview' | 'bundle' | 'sol-trace' | 'family';

const RISK_COLOR: Record<string, string> = {
  critical: '#FF3366', high: '#FF9933', medium: '#FFD700', low: '#00FF88',
};

export function LineageScanScreen({
  selectedToken,
  onNavigateDeployer,
  onNavigateSolTrace,
  onNavigateCartel,
  onNavigateFamilyTree,
  onNavigateToken,
}: LineageScanScreenProps) {
  const [searchInput, setSearchInput] = useState(selectedToken?.mint ?? '');
  const [result, setResult] = useState<LineageResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSteps, setScanSteps] = useState<AnalysisStep[]>([]);
  const [currentStepLabel, setCurrentStepLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const wsRef = useRef<{ scan: (m: string) => void; close: () => void } | null>(null);
  const incrementScan = useAuthStore((s) => s.incrementScanCount);

  // If a token is pre-selected, auto-scan
  useEffect(() => {
    if (selectedToken?.mint && selectedToken.mint !== result?.mint) {
      setSearchInput(selectedToken.mint);
      handleScan(selectedToken.mint);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedToken?.mint]);

  // Teardown WS on unmount
  useEffect(() => () => wsRef.current?.close(), []);

  const handleScan = async (mintOverride?: string) => {
    const mint = mintOverride ?? searchInput.trim();
    if (!mint) return;
    setIsScanning(true);
    setError(null);
    setResult(null);
    setScanSteps([]);
    setActiveTab('overview');
    incrementScan();

    // Try WebSocket first, fall back to REST
    try {
      if (!wsRef.current) {
        wsRef.current = connectLineageWS(
          (step) => {
            setScanSteps((prev) => [...prev.filter((s) => s.step !== step.step), step]);
            setCurrentStepLabel(step.label);
          },
          (res) => {
            setResult(res);
            setIsScanning(false);
          },
          () => {
            // WS error — fall back to REST
            getLineage(mint)
              .then((res) => { setResult(res); setIsScanning(false); })
              .catch((e: Error) => { setError(e.message); setIsScanning(false); });
          },
        );
      }
      wsRef.current.scan(mint);
    } catch {
      // REST fallback
      getLineage(mint)
        .then((res) => { setResult(res); setIsScanning(false); })
        .catch((e: Error) => { setError(e.message); setIsScanning(false); });
    }
  };

  const riskColor = RISK_COLOR[result?.risk_level ?? 'low'] ?? '#6B7280';

  return (
    <div className="px-4 pt-2 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(173,200,255,0.12)' }}>
          <Search size={16} style={{ color: '#ADCEFF' }} />
        </div>
        <div>
          <h2 className="text-section-header font-bold text-white">LINEAGE SCAN</h2>
          <p className="text-tiny text-white/40">Token forensics & family analysis</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Enter mint address…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          className="flex-1 bg-glass rounded-2xl px-4 py-3 text-small text-white placeholder-white/25 outline-none border border-white/5 focus:border-white/20 transition-colors"
        />
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleScan()}
          disabled={isScanning || !searchInput.trim()}
          className="px-4 py-3 rounded-2xl font-bold text-small text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #6F6ACF, #ADCEFF)' }}
        >
          {isScanning ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : 'SCAN'}
        </motion.button>
      </div>

      {/* Scanning Overlay Steps */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 rounded-2xl p-4"
            style={{ background: 'rgba(111,106,207,0.1)', border: '1px solid rgba(111,106,207,0.2)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ADCEFF' }} />
              <span className="text-small font-semibold text-white/80">Analyzing…</span>
              <span className="text-tiny text-white/40 ml-auto">{currentStepLabel}</span>
            </div>
            <div className="space-y-1.5">
              {(['lineage', 'bundle', 'sol_flow', 'ai'] as const).map((stepKey) => {
                const step = scanSteps.find((s) => s.step === stepKey);
                return (
                  <div key={stepKey} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${step?.done ? '' : step ? 'animate-pulse' : ''}`}
                      style={{ background: step?.done ? '#00FF88' : step ? '#ADCEFF' : 'rgba(255,255,255,0.15)' }} />
                    <span className="text-tiny capitalize" style={{ color: step?.done ? '#00FF88' : step ? '#ADCEFF' : 'rgba(255,255,255,0.3)' }}>
                      {stepKey.replace('_', ' ')}
                    </span>
                    {step?.done && step.duration_ms && (
                      <span className="text-tiny text-white/25 ml-auto">{step.duration_ms}ms</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-2xl flex items-center gap-2" style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <X size={14} style={{ color: '#FF3366' }} />
          <span className="text-small text-white/70">{error}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Token Header */}
          <div className="rounded-2xl p-4 mb-3" style={{ background: `${riskColor}10`, border: `1px solid ${riskColor}25` }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-body" style={{ background: `${riskColor}20`, color: riskColor }}>
                {result.image_uri
                  ? <img src={result.image_uri} alt="" className="w-full h-full rounded-2xl object-cover" />
                  : (result.symbol ?? '?').slice(0, 2).toUpperCase()
                }
              </div>
              <div className="flex-1">
                <div className="font-bold text-white text-subheading">{result.name ?? result.symbol}</div>
                <div className="text-tiny text-white/40">{result.mint.slice(0, 8)}…{result.mint.slice(-6)}</div>
              </div>
              <div className="text-right">
                <div className="text-section-header font-black" style={{ color: riskColor }}>
                  {result.risk_score != null ? Math.round(result.risk_score) : '?'}
                </div>
                <div className="text-tiny font-bold uppercase" style={{ color: riskColor }}>{result.risk_level}</div>
              </div>
            </div>

            {/* Flags */}
            {(result.suspicious_flags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {result.suspicious_flags!.map((flag) => (
                  <span key={flag} className="px-2 py-0.5 rounded-full text-tiny font-semibold" style={{ background: 'rgba(255,153,51,0.15)', color: '#FF9933' }}>
                    ⚠ {flag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tab Bar */}
          <div className="flex gap-1 mb-3 bg-glass rounded-2xl p-1">
            {(['overview', 'bundle', 'sol-trace', 'family'] as Tab[]).map((tab) => (
              <motion.button
                key={tab}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-1.5 rounded-xl text-tiny font-bold uppercase tracking-wide transition-all"
                style={{
                  background: activeTab === tab ? 'rgba(111,106,207,0.3)' : 'transparent',
                  color: activeTab === tab ? '#ADCEFF' : 'rgba(255,255,255,0.35)',
                }}
              >
                {tab === 'overview' ? 'OVERVIEW' : tab === 'bundle' ? 'BUNDLE' : tab === 'sol-trace' ? 'SOL TRACE' : 'FAMILY'}
              </motion.button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'overview' && (
                <div className="space-y-2">
                  {/* Deployer */}
                  {result.deployer?.address && (
                    <button
                      onClick={() => onNavigateDeployer(result.deployer!.address)}
                      className="w-full bg-glass rounded-2xl p-3 flex items-center gap-3 text-left"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(173,200,255,0.12)' }}>
                        <User size={14} style={{ color: '#ADCEFF' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-tiny font-bold text-white/50 uppercase tracking-wide">Deployer</div>
                        <div className="text-small text-white font-mono truncate">{result.deployer.address.slice(0, 20)}…</div>
                        {result.deployer.rug_rate_pct != null && (
                          <div className="text-tiny mt-0.5" style={{ color: result.deployer.rug_rate_pct > 50 ? '#FF3366' : '#FF9933' }}>
                            {result.deployer.rug_rate_pct.toFixed(0)}% rug rate
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
                    </button>
                  )}

                  {/* Zombie alert */}
                  {result.zombie_alert?.is_zombie && (
                    <div className="bg-glass rounded-2xl p-3" style={{ border: '1px solid rgba(255,51,102,0.25)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Skull size={13} style={{ color: '#FF3366' }} />
                        <span className="text-small font-bold" style={{ color: '#FF3366' }}>ZOMBIE TOKEN DETECTED</span>
                      </div>
                      {result.zombie_alert.parent_mint && (
                        <p className="text-tiny text-white/50">Clone of {result.zombie_alert.parent_mint.slice(0, 12)}…</p>
                      )}
                      {(result.zombie_alert.clone_signals?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {result.zombie_alert.clone_signals!.map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white/50 bg-white/5">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cartel fingerprint */}
                  {result.operator_fingerprint && (
                    <button
                      onClick={() => onNavigateCartel(result.operator_fingerprint!)}
                      className="w-full bg-glass rounded-2xl p-3 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.12)' }}>
                        <GitBranch size={14} style={{ color: '#FF3366' }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-tiny text-white/50 uppercase font-bold">Operator Fingerprint</div>
                        <div className="text-small text-white font-mono">{result.operator_fingerprint.slice(0, 24)}…</div>
                      </div>
                      <ChevronRight size={14} className="text-white/20" />
                    </button>
                  )}

                  {/* DeathClock summary */}
                  {result.death_clock && (
                    <div className="bg-glass rounded-2xl p-3" style={{ border: `1px solid ${RISK_COLOR[result.death_clock.risk_level]}25` }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={13} style={{ color: RISK_COLOR[result.death_clock.risk_level] }} />
                        <span className="text-small font-bold" style={{ color: RISK_COLOR[result.death_clock.risk_level] }}>
                          {result.death_clock.risk_level.toUpperCase()} RISK
                        </span>
                        {result.death_clock.confidence_level != null && (
                          <span className="ml-auto text-tiny text-white/40">
                            {Math.round(result.death_clock.confidence_level * 100)}% confidence
                          </span>
                        )}
                      </div>
                      {result.death_clock.predicted_window_start && (
                        <p className="text-tiny text-white/50">
                          Est. crash: {result.death_clock.predicted_window_start}
                          {result.death_clock.predicted_window_end ? ` – ${result.death_clock.predicted_window_end}` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'bundle' && (
                <div>
                  {result.bundle_report ? (
                    <div className="space-y-2">
                      <div className="bg-glass rounded-2xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Layers size={14} style={{ color: result.bundle_report.overall_verdict === 'confirmed_rug' ? '#FF3366' : '#FF9933' }} />
                          <span className="text-small font-bold uppercase" style={{ color: result.bundle_report.overall_verdict === 'confirmed_rug' ? '#FF3366' : '#FF9933' }}>
                            {result.bundle_report.overall_verdict.replace('_', ' ')}
                          </span>
                          {result.bundle_report.total_sol_extracted_confirmed != null && (
                            <span className="ml-auto text-small font-bold" style={{ color: '#FF3366' }}>
                              {result.bundle_report.total_sol_extracted_confirmed.toFixed(2)} SOL extracted
                            </span>
                          )}
                        </div>
                        {result.bundle_report.bundle_wallets.slice(0, 6).map((w, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 border-t border-white/5">
                            <div className="w-2 h-2 rounded-full" style={{ background: w.is_confirmed ? '#FF3366' : 'rgba(255,255,255,0.2)' }} />
                            <span className="text-tiny font-mono text-white/60 flex-1">{w.address.slice(0, 16)}…</span>
                            {w.sol_extracted != null && <span className="text-tiny text-white/40">{w.sol_extracted.toFixed(2)} SOL</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/30 text-small">No bundle data</div>
                  )}
                </div>
              )}

              {activeTab === 'sol-trace' && (
                <div>
                  {result.sol_flow ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-glass rounded-xl p-2.5 text-center">
                          <div className="text-subheading font-black" style={{ color: '#FF3366' }}>
                            {result.sol_flow.total_extracted_sol?.toFixed(1) ?? '?'} SOL
                          </div>
                          <div className="text-tiny text-white/40">Extracted</div>
                        </div>
                        <div className="bg-glass rounded-xl p-2.5 text-center">
                          <div className="text-subheading font-black text-white">{result.sol_flow.hop_count ?? result.sol_flow.flows.length}</div>
                          <div className="text-tiny text-white/40">Hops</div>
                        </div>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onNavigateSolTrace(result!.mint)}
                        className="w-full py-3 rounded-2xl font-bold text-small flex items-center justify-center gap-2"
                        style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.25)', color: '#FF3366' }}
                      >
                        View Full SOL Flow Trace
                        <ChevronRight size={14} />
                      </motion.button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/30 text-small">No SOL flow data</div>
                  )}
                </div>
              )}

              {activeTab === 'family' && (
                <div>
                  {(result.family?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {result.family!.slice(0, 5).map((t) => (
                        <button
                          key={t.mint}
                          onClick={() => onNavigateToken(t)}
                          className="w-full bg-glass rounded-xl p-2.5 flex items-center gap-2.5"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-tiny font-bold" style={{ background: `${RISK_COLOR[t.risk_level ?? 'low']}20`, color: RISK_COLOR[t.risk_level ?? 'low'] }}>
                            {(t.symbol ?? '?').slice(0, 2)}
                          </div>
                          <div className="flex-1 text-left">
                            <div className="text-small font-semibold text-white">{t.name ?? t.symbol}</div>
                            <div className="text-tiny text-white/40">{t.mint.slice(0, 12)}…</div>
                          </div>
                          <ChevronRight size={12} className="text-white/20" />
                        </button>
                      ))}
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onNavigateFamilyTree(result!.mint)}
                        className="w-full py-2.5 rounded-2xl font-bold text-small flex items-center justify-center gap-2"
                        style={{ background: 'rgba(111,106,207,0.12)', border: '1px solid rgba(111,106,207,0.2)', color: '#ADCEFF' }}
                      >
                        View Family Tree Graph
                        <ChevronRight size={14} />
                      </motion.button>
                    </div>
                  ) : (
                    <div>
                      <div className="text-center py-4 text-white/30 text-small mb-2">No related tokens found</div>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onNavigateFamilyTree(result!.mint)}
                        className="w-full py-2.5 rounded-2xl font-bold text-small flex items-center justify-center gap-2"
                        style={{ background: 'rgba(111,106,207,0.12)', border: '1px solid rgba(111,106,207,0.2)', color: '#ADCEFF' }}
                      >
                        Explore Family Tree
                        <ChevronRight size={14} />
                      </motion.button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      {/* Empty state */}
      {!result && !isScanning && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(173,200,255,0.08)' }}>
            <Search size={28} style={{ color: '#ADCEFF' }} />
          </div>
          <p className="text-small text-white/30">Enter a Solana token mint address<br />to start the forensic scan</p>
        </div>
      )}
    </div>
  );
}
