import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader } from 'lucide-react';
import type { AnalysisStep, LineageResult } from '../types/api';
import { analyzeStream } from '../lib/api';

interface AnalysisStreamOverlayProps {
  mint: string;
  visible: boolean;
  onDone: (result: LineageResult) => void;
  onClose: () => void;
}

const STEP_LABELS: Record<string, string> = {
  lineage: 'Tracing token lineage',
  bundle: 'Detecting bundle wallets',
  sol_flow: 'Mapping SOL flow',
  ai: 'Running AI analysis',
};

export function AnalysisStreamOverlay({ mint, visible, onDone, onClose }: AnalysisStreamOverlayProps) {
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [currentLabel, setCurrentLabel] = useState('Initializing…');
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !mint) return;
    setSteps([]);
    setIsDone(false);
    setError(null);
    setCurrentLabel('Initializing…');

    const close = analyzeStream(
      mint,
      (step) => {
        setSteps((prev) => {
          const filtered = prev.filter((s) => s.step !== step.step);
          return [...filtered, step];
        });
        setCurrentLabel(STEP_LABELS[step.step] ?? step.label);
      },
      (result) => {
        setIsDone(true);
        setCurrentLabel('Analysis complete!');
        setTimeout(() => onDone(result), 800);
      },
      (err) => {
        setError(err?.message ?? 'Analysis failed');
      },
    );

    return () => { close?.(); };
  }, [mint, visible]);

  const allStepKeys = ['lineage', 'bundle', 'sol_flow', 'ai'];
  const completedCount = steps.filter((s) => s.done).length;
  const progress = isDone ? 100 : (completedCount / allStepKeys.length) * 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-end justify-center pb-8"
          style={{ background: 'rgba(10,10,7,0.85)', backdropFilter: 'blur(20px)' }}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="w-full max-w-sm mx-4 rounded-3xl p-6"
            style={{ background: 'rgba(20,20,16,0.95)', border: '1px solid rgba(111,106,207,0.25)' }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <X size={13} className="text-white/40" />
            </button>

            {/* Header */}
            <div className="mb-5">
              <h3 className="text-subheading font-black text-white mb-0.5">Forensic Analysis</h3>
              <p className="text-tiny text-white/40 font-mono">{mint.slice(0, 16)}…</p>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-5">
              <motion.div
                className="h-full rounded-full"
                style={{ background: isDone ? '#00FF88' : 'linear-gradient(90deg, #6F6ACF, #ADCEFF)' }}
                initial={{ width: '5%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            {/* Steps */}
            <div className="space-y-3 mb-5">
              {allStepKeys.map((key) => {
                const step = steps.find((s) => s.step === key);
                const isActive = !step?.done && steps.some((s) => s.step === key);
                const isDoneStep = step?.done;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isDoneStep ? 'rgba(0,255,136,0.15)' : isActive ? 'rgba(111,106,207,0.2)' : 'rgba(255,255,255,0.04)',
                      }}
                    >
                      {isDoneStep
                        ? <Check size={12} style={{ color: '#00FF88' }} />
                        : isActive
                          ? <Loader size={11} style={{ color: '#ADCEFF' }} className="animate-spin" />
                          : <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      }
                    </div>
                    <div className="flex-1">
                      <span className="text-small" style={{ color: isDoneStep ? '#00FF88' : isActive ? '#ADCEFF' : 'rgba(255,255,255,0.3)' }}>
                        {STEP_LABELS[key]}
                      </span>
                    </div>
                    {step?.duration_ms && isDoneStep && (
                      <span className="text-tiny text-white/20">{step.duration_ms}ms</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status */}
            {error ? (
              <p className="text-small text-center" style={{ color: '#FF3366' }}>{error}</p>
            ) : (
              <p className="text-tiny text-center text-white/40">
                {isDone ? '✓ Analysis complete' : currentLabel}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
