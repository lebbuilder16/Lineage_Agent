import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, GitMerge, ArrowRight, Wallet, TrendingDown } from 'lucide-react';
import type { SolFlowReport, SolFlowEdge } from '../types/api';
import { getSolTrace } from '../lib/api';

interface SolTraceScreenProps {
  mint: string;
  onBack: () => void;
}

function FlowEdge({ edge, index }: { edge: SolFlowEdge; index: number }) {
  const pct = Math.min(100, Math.round(edge.confidence_pct ?? 80));
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-glass rounded-2xl p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-tiny font-mono text-white/60 flex-1 truncate">{edge.from_address.slice(0, 14)}…</div>
        <ArrowRight size={11} style={{ color: '#FF3366' }} className="flex-shrink-0" />
        <div className="text-tiny font-mono text-white/60 flex-1 truncate text-right">…{edge.to_address.slice(-14)}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: 0.1 + index * 0.05 }}
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #FF3366, #FF9933)' }}
          />
        </div>
        <span className="text-tiny text-white/40 w-12 text-right">{edge.sol_amount?.toFixed(2) ?? '?'} SOL</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {edge.hop_number != null && <span className="text-tiny text-white/25">Hop {edge.hop_number}</span>}
        {edge.flow_type && <span className="text-tiny text-white/25 capitalize">· {edge.flow_type.replace(/_/g, ' ')}</span>}
        {edge.is_extraction && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: 'rgba(255,51,102,0.15)', color: '#FF3366' }}>EXTRACTION</span>}
      </div>
    </motion.div>
  );
}

export function SolTraceScreen({ mint, onBack }: SolTraceScreenProps) {
  const [report, setReport] = useState<SolFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getSolTrace(mint)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mint]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,51,102,0.12)' }}>
          <GitMerge size={15} style={{ color: '#FF3366' }} />
        </div>
        <div>
          <h2 className="text-small font-bold text-white">SOL FLOW TRACE</h2>
          <p className="text-tiny text-white/40 font-mono">{mint.slice(0, 16)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="bg-glass rounded-2xl h-20 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="bg-glass rounded-2xl p-4 text-center" style={{ border: '1px solid rgba(255,51,102,0.2)' }}>
            <p className="text-small text-white/50">{error}</p>
          </div>
        )}

        {report && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-glass rounded-2xl p-3 text-center">
                <div className="text-subheading font-black" style={{ color: '#FF3366' }}>
                  {report.total_extracted_sol?.toFixed(2) ?? '?'} SOL
                </div>
                <div className="text-tiny text-white/40">Total Extracted</div>
              </div>
              <div className="bg-glass rounded-2xl p-3 text-center">
                <div className="text-subheading font-black text-white">
                  {report.hop_count ?? report.flows.length}
                </div>
                <div className="text-tiny text-white/40">Hops</div>
              </div>
            </div>

            {/* Destination wallets */}
            {(report.destination_wallets?.length ?? 0) > 0 && (
              <div className="bg-glass rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={12} style={{ color: '#ADCEFF' }} />
                  <span className="text-tiny font-bold text-white/60 uppercase">Destination Wallets</span>
                </div>
                <div className="space-y-1.5">
                  {report.destination_wallets!.map((w, i) => (
                    <div key={i} className="text-tiny font-mono text-white/50 bg-white/3 rounded-lg px-2.5 py-1.5">{w}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Flow edges */}
            {report.flows.length > 0 && (
              <div>
                <p className="text-tiny font-bold uppercase tracking-wide text-white/30 px-1 mb-2">
                  Flow Trace ({report.flows.length} hops)
                </p>
                <div className="space-y-2">
                  {report.flows.map((edge, i) => (
                    <FlowEdge key={i} edge={edge} index={i} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {!loading && !error && !report && (
          <div className="text-center py-12 text-small text-white/30">No SOL flow data available</div>
        )}
      </div>
    </div>
  );
}
