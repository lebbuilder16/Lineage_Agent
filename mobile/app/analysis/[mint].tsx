import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { X, CheckCircle, Circle, Loader } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { analyzeStream } from '../../src/lib/api';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import type { AnalysisStep, LineageResult } from '../../src/types/api';

const STEPS_ORDER = ['lineage', 'deployer', 'bundle', 'sol_flow', 'cartel', 'ai'] as const;

const STEP_LABELS: Record<string, string> = {
  lineage: 'Lineage Trace',
  deployer: 'Deployer Profile',
  bundle: 'Bundle Extraction',
  sol_flow: 'SOL Flow Trace',
  cartel: 'Cartel Network',
  ai: 'AI Analysis',
};

export default function AnalysisModal() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const [steps, setSteps] = useState<Record<string, AnalysisStep>>({});
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<LineageResult | null>(null);
  const cancelRef = useRef<() => void>();
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, []);

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

  const overallProgress =
    Object.values(steps).reduce((acc, s) => acc + s.progress, 0) /
    (STEPS_ORDER.length * 100);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />

      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI ANALYSIS</Text>
          <TouchableOpacity
            onPress={() => { cancelRef.current?.(); router.back(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={24} color={tokens.white60} />
          </TouchableOpacity>
        </View>

        {/* Mint */}
        <Text style={styles.mintAddr} numberOfLines={1}>{mint}</Text>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${overallProgress * 100}%` }]} />
        </View>

        {/* Step list */}
        <ScrollView style={styles.stepsScroll} showsVerticalScrollIndicator={false}>
          {STEPS_ORDER.map((key) => {
            const step = steps[key];
            const isDone = step?.done;
            const inProgress = step && !isDone;
            const label = step?.label ?? STEP_LABELS[key];

            return (
              <View key={key} style={styles.stepRow}>
                {isDone ? (
                  <CheckCircle size={20} color={tokens.success} />
                ) : inProgress ? (
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <Loader size={20} color={tokens.primary} />
                  </Animated.View>
                ) : (
                  <Circle size={20} color={tokens.white20} />
                )}
                <View style={styles.stepInfo}>
                  <Text
                    style={[
                      styles.stepLabel,
                      isDone && styles.stepLabelDone,
                      !step && styles.stepLabelPending,
                    ]}
                  >
                    {label}
                  </Text>
                  {step && (
                    <Text style={styles.stepProgress}>
                      {isDone
                        ? step.duration_ms != null
                          ? `${step.duration_ms}ms`
                          : 'Done'
                        : `${step.progress}%`}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Done state */}
        {done && (
          <View style={styles.doneSection}>
            <Text style={styles.doneTitle}>Analysis Complete</Text>
            <HapticButton
              variant="primary"
              size="md"
              fullWidth
              onPress={() => {
                router.back();
                if (mint) router.push(`/token/${mint}` as any);
              }}
            >
              VIEW FULL REPORT
            </HapticButton>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: tokens.bgCard,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    padding: tokens.spacing.screenPadding,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: tokens.borderSubtle,
    maxHeight: '80%',
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
  progressTrack: {
    height: 3,
    backgroundColor: tokens.white10,
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: tokens.primary,
    borderRadius: 2,
  },
  stepsScroll: { maxHeight: 280 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  stepInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  stepLabelDone: { color: tokens.success },
  stepLabelPending: { color: tokens.white35 },
  stepProgress: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  doneSection: { marginTop: 16, gap: 12 },
  doneTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.success,
    textAlign: 'center',
  },
});
