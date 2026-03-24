import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  Search,
  Clock,
  Package,
  ArrowRightLeft,
  User,
  Network,
  Brain,
  Fingerprint,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ScanStep } from '../../store/investigate';
import { GlassCard } from '../ui/GlassCard';
import { Spinner } from '../ui/Spinner';
import { tokens } from '../../theme/tokens';

// ─── Scan step metadata ──────────────────────────────────────────────────────

const SCAN_STEPS: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  identity:             { label: 'Token Identity',        Icon: Search,         color: tokens.step.identity },
  family_search:        { label: 'Family Search',         Icon: Search,         color: tokens.step.identity },
  lineage:              { label: 'Lineage Trace',         Icon: Search,         color: tokens.step.identity },
  deployer_profile:     { label: 'Deployer Profile',      Icon: User,           color: tokens.step.deployer_profile },
  deployer:             { label: 'Deployer Profile',      Icon: User,           color: tokens.step.deployer_profile },
  death_clock:          { label: 'Death Clock',           Icon: Clock,          color: tokens.step.death_clock },
  factory_rhythm:       { label: 'Factory Rhythm',        Icon: Network,        color: tokens.step.factory_rhythm },
  operator_fingerprint: { label: 'Operator Fingerprint',  Icon: User,           color: tokens.step.operator_fingerprint },
  cartel:               { label: 'Cartel Detection',      Icon: Network,        color: tokens.step.cartel },
  bundle:               { label: 'Bundle Analysis',       Icon: Package,        color: tokens.step.bundle },
  sol_flow:             { label: 'SOL Flow Trace',        Icon: ArrowRightLeft, color: tokens.step.sol_flow },
  insider_sell:         { label: 'Insider Sell',           Icon: ArrowRightLeft, color: tokens.step.insider_sell },
  operator_impact:      { label: 'Operator Impact',       Icon: User,           color: tokens.step.operator_impact },
  dependent_enrichers:  { label: 'Deep Analysis',         Icon: Brain,          color: tokens.violet },
  deployer_forensics:   { label: 'Deployer Forensics',    Icon: User,           color: tokens.step.deployer_profile },
  chain_traces:         { label: 'Chain Traces',          Icon: ArrowRightLeft, color: tokens.cyan },
  ai:                   { label: 'AI Analysis',           Icon: Brain,          color: tokens.lavender },
};

const SCAN_STEP_COUNT = Object.keys(SCAN_STEPS).length;

// ─── ScanStepCard ─────────────────────────────────────────────────────────────

function ScanStepCard({ step }: { step: ScanStep }) {
  const meta = SCAN_STEPS[step.step] ?? { label: step.step, Icon: Clock, color: tokens.secondary };
  const StepIcon = meta.Icon;
  const stepColor = meta.color;
  const isDone = step.status === 'done';
  const hasError = (step as unknown as Record<string, unknown>).error === true;

  return (
    <Animated.View entering={FadeInDown.duration(200).springify()}>
      <View
        style={styles.scanStepRow}
        accessibilityLabel={`${meta.label} — ${isDone ? 'complete' : 'in progress'}`}
      >
        {isDone ? (
          hasError
            ? <AlertTriangle size={16} color={tokens.warning} />
            : <CheckCircle size={16} color={tokens.success} />
        ) : (
          <Spinner size={16} color={stepColor} />
        )}
        <StepIcon size={14} color={isDone ? (hasError ? tokens.warning : `${stepColor}99`) : stepColor} />
        <Text style={[styles.scanStepLabel, isDone && styles.scanStepDone]}>
          {meta.label}
        </Text>
        {isDone && step.ms != null && (
          <Text style={[styles.scanStepMs, { color: hasError ? tokens.warning : tokens.textTertiary }]}>
            {step.ms >= 1000 ? `${(step.ms / 1000).toFixed(1)}s` : `${step.ms}ms`}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── ForensicScanSection ──────────────────────────────────────────────────────

export function ForensicScanSection({ steps, isRunning }: { steps: ScanStep[]; isRunning: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const doneCount = steps.filter(s => s.status === 'done').length;

  // Auto-collapse 500ms after scan finishes
  useEffect(() => {
    if (!isRunning && steps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isRunning, steps.length]);

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <TouchableOpacity
          onPress={() => setExpanded(e => !e)}
          style={styles.sectionHeaderRow}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Forensic scan, ${doneCount} of ${SCAN_STEP_COUNT} complete`}
          accessibilityState={{ expanded }}
        >
          <Text style={styles.sectionLabel}>FORENSIC SCAN</Text>
          <View style={styles.sectionHeaderRight}>
            <Text style={styles.sectionMeta}>{doneCount}/{SCAN_STEP_COUNT}</Text>
            {isRunning && <Spinner size={14} color={tokens.secondary} />}
            <ChevronDown
              size={16}
              color={tokens.textTertiary}
              style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </View>
        </TouchableOpacity>
        {expanded && (
          <View style={styles.scanStepsContainer}>
            {steps.map((step, i) => (
              <ScanStepCard key={`scan-${step.step}-${step.status}-${i}`} step={step} />
            ))}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 32,
  },
  sectionHeaderRight: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, letterSpacing: 0.5,
  },
  sectionMeta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  scanStepsContainer: { gap: 6, marginTop: 8 },
  scanStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanStepLabel: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small,
    color: tokens.white80, flex: 1,
  },
  scanStepDone: { color: tokens.white60 },
  scanStepMs: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary,
  },
});
