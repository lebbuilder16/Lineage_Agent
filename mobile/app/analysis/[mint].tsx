import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { X, CheckCircle, Circle } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeIn,
  FadeInDown,
  Easing,
} from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeStream } from '../../src/lib/api';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import type { AnalysisStep, LineageResult } from '../../src/types/api';

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS_ORDER = ['lineage', 'deployer', 'bundle', 'sol_flow', 'cartel', 'ai'] as const;

const STEP_LABELS: Record<string, string> = {
  lineage: 'Lineage Trace',
  deployer: 'Deployer Profile',
  bundle: 'Bundle Extraction',
  sol_flow: 'SOL Flow Trace',
  cartel: 'Cartel Network',
  ai: 'AI Analysis',
};

// ─── Spinner (Reanimated) ─────────────────────────────────────────────────────

function Spinner({ size = 20, color = tokens.secondary }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  const r = size / 2;
  const stroke = size * 0.12;

  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <View style={[
        styles.spinnerTrack,
        {
          width: size, height: size, borderRadius: r,
          borderWidth: stroke, borderColor: `${color}25`,
        },
      ]} />
      <View style={[
        styles.spinnerArc,
        {
          width: size, height: size, borderRadius: r,
          borderWidth: stroke,
          borderTopColor: color,
          borderRightColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: 'transparent',
        },
      ]} />
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalysisModal() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const [steps, setSteps] = useState<Record<string, AnalysisStep>>({});
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<LineageResult | null>(null);
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  const queryClient = useQueryClient();
  const setReportExpandMint = useAuthStore((s) => s.setReportExpandMint);

  // Progress bar animated value
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    if (!mint) return;
    cancelRef.current = analyzeStream(
      mint,
      (step) => {
        setSteps((prev) => ({ ...prev, [step.step]: step }));
      },
      (finalResult) => {
        setDone(true);
        if (finalResult) setResult(finalResult);
      },
    );
    return () => cancelRef.current?.();
  }, [mint]);

  const doneCount = Object.values(steps).filter((s) => s.status === 'done').length;
  const overallProgress = doneCount / STEPS_ORDER.length;

  // Animate progress bar
  useEffect(() => {
    progressAnim.value = withSpring(overallProgress, { damping: 20, stiffness: 120 });
  }, [overallProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%` as any,
  }));

  return (
    <View style={styles.overlay}>
      <Stack.Screen options={{ headerShown: false, presentation: 'transparentModal' }} />

      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => { cancelRef.current?.(); router.back(); }}
        accessibilityLabel="Dismiss analysis"
      />

      <Animated.View
        entering={FadeInDown.duration(300).springify()}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI ANALYSIS</Text>
          <TouchableOpacity
            onPress={() => { cancelRef.current?.(); router.back(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close analysis"
          >
            <X size={22} color={tokens.white60} />
          </TouchableOpacity>
        </View>

        {/* Mint address */}
        <Text style={styles.mintAddr} numberOfLines={1}>{mint}</Text>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>

        {/* Steps */}
        <ScrollView style={styles.stepsScroll} showsVerticalScrollIndicator={false}>
          {STEPS_ORDER.map((key, index) => {
            const step = steps[key];
            const isDone = step?.status === 'done';
            const inProgress = step?.status === 'running';
            const label = STEP_LABELS[key];
            const isLast = index === STEPS_ORDER.length - 1;

            return (
              <Animated.View
                key={key}
                entering={FadeIn.delay(index * 40).duration(200)}
                style={[styles.stepRow, isLast && { borderBottomWidth: 0 }]}
              >
                {isDone ? (
                  <CheckCircle size={20} color={tokens.success} strokeWidth={2} />
                ) : inProgress ? (
                  <Spinner size={20} color={tokens.secondary} />
                ) : (
                  <Circle size={20} color={tokens.white20} strokeWidth={1.5} />
                )}
                <View style={styles.stepInfo}>
                  <Text style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    !step && styles.stepLabelPending,
                    inProgress && styles.stepLabelActive,
                  ]}>
                    {label}
                  </Text>
                  {step && (
                    <Text style={styles.stepMeta}>
                      {isDone
                        ? step.ms != null ? `${step.ms}ms` : 'Done'
                        : step.step === 'ai' && step.heuristic != null
                        ? `score ${step.heuristic}`
                        : '…'}
                    </Text>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* Done */}
        {done && (
          <Animated.View entering={FadeInDown.duration(300).springify()} style={styles.doneSection}>
            <View style={styles.doneTitleRow}>
              <CheckCircle size={18} color={tokens.success} strokeWidth={2} />
              <Text style={styles.doneTitle}>Analysis Complete</Text>
            </View>
            <HapticButton
              variant="primary"
              size="md"
              fullWidth
              onPress={() => {
                queryClient.invalidateQueries({ queryKey: ['lineage', mint] });
                setReportExpandMint(mint ?? null);
                router.back();
              }}
            >
              <Text style={styles.btnText}>VIEW FULL REPORT</Text>
            </HapticButton>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Semi-transparent overlay — transparent so the content behind is visible
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  // Bottom sheet — bgMain for consistency with rest of app
  sheet: {
    backgroundColor: tokens.bgMain,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingTop: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: tokens.borderSubtle,
    maxHeight: '82%',
  },

  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.white20,
    marginBottom: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    letterSpacing: 1.5,
  },

  mintAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginBottom: 16,
  },

  // Progress bar — secondary color (visible)
  progressTrack: {
    height: 3,
    backgroundColor: tokens.white10,
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: tokens.secondary,
    borderRadius: 2,
  },

  // Steps
  stepsScroll: { maxHeight: 300 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  stepInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  stepLabelActive: {
    color: tokens.white100,
    fontFamily: 'Lexend-SemiBold',
  },
  stepLabelDone: {
    color: tokens.success,
  },
  stepLabelPending: {
    color: tokens.white35,
  },
  stepMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Done section
  doneSection: { marginTop: 16, gap: 12 },
  doneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  doneTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.success,
    textAlign: 'center',
  },
  btnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 0.5,
  },

  // Spinner
  spinnerTrack: { position: 'absolute' },
  spinnerArc: { position: 'absolute' },
});
