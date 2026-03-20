/** @deprecated Use /investigate/[mint] instead. */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  X,
  CheckCircle,
  AlertTriangle,
  Brain,
  Search,
  Clock,
  Package,
  ArrowRightLeft,
  User,
  Network,
  TrendingDown,
  Fingerprint,
  GitCompareArrows,
} from 'lucide-react-native';
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

import { agentStream } from '../../src/lib/agent-streaming';
import type { AgentEvent, AgentDoneEvent } from '../../src/lib/agent-streaming';
import { useAgentStore } from '../../src/store/agent';
import type { AgentStep } from '../../src/store/agent';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useRemainingQuota } from '../../src/store/subscription';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { FeatureGate } from '../../src/components/ui/FeatureGate';
import { tokens } from '../../src/theme/tokens';

// ─── Tool labels & icons ─────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; Icon: React.ElementType }> = {
  scan_token:          { label: 'Lineage Scan',     Icon: Search },
  get_deployer_profile:{ label: 'Deployer Profile', Icon: User },
  get_bundle_report:   { label: 'Bundle Analysis',  Icon: Package },
  trace_sol_flow:      { label: 'SOL Flow Trace',   Icon: ArrowRightLeft },
  get_cartel_report:   { label: 'Cartel Network',   Icon: Network },
  get_insider_sell:    { label: 'Insider Sells',     Icon: TrendingDown },
  get_operator_impact: { label: 'Operator Impact',  Icon: Fingerprint },
  compare_tokens:      { label: 'Token Compare',    Icon: GitCompareArrows },
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

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
        { width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: `${color}25` },
      ]} />
      <View style={[
        styles.spinnerArc,
        {
          width: size, height: size, borderRadius: r, borderWidth: stroke,
          borderTopColor: color, borderRightColor: 'transparent',
          borderBottomColor: 'transparent', borderLeftColor: 'transparent',
        },
      ]} />
    </Animated.View>
  );
}

// ─── Risk color helper ───────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk?.critical ?? '#FF3366';
  if (score >= 50) return tokens.risk?.high ?? '#FF6B6B';
  if (score >= 25) return tokens.risk?.medium ?? '#FFB700';
  return tokens.risk?.low ?? '#00FF88';
}

// ─── Step cards ──────────────────────────────────────────────────────────────

function ThinkingCard({ step }: { step: AgentStep }) {
  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <View style={styles.stepRow}>
          <Brain size={18} color={tokens.white60} />
          <Text style={styles.thinkingText} numberOfLines={4}>
            {String(step.data.text ?? 'Reasoning...')}
          </Text>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

function ToolCallCard({ step }: { step: AgentStep }) {
  const toolName = String(step.data.tool ?? 'unknown');
  const meta = TOOL_META[toolName] ?? { label: toolName, Icon: Search };
  const ToolIcon = meta.Icon;

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <View style={styles.stepRow}>
          <Spinner size={18} color={tokens.secondary} />
          <View style={styles.toolInfo}>
            <View style={styles.toolLabelRow}>
              <ToolIcon size={14} color={tokens.secondary} />
              <Text style={styles.toolLabel}>{meta.label}</Text>
            </View>
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

function ToolResultCard({ step }: { step: AgentStep }) {
  const toolName = String(step.data.tool ?? 'unknown');
  const meta = TOOL_META[toolName] ?? { label: toolName, Icon: Search };
  const hasError = Boolean(step.data.error);
  const durationMs = Number(step.data.durationMs ?? step.data.duration_ms ?? 0);

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <View style={styles.stepRow}>
          {hasError ? (
            <AlertTriangle size={18} color={tokens.risk?.high ?? '#FF6B6B'} />
          ) : (
            <CheckCircle size={18} color={tokens.success} />
          )}
          <View style={styles.toolInfo}>
            <Text style={[styles.toolLabel, hasError && styles.errorText]}>
              {meta.label}
            </Text>
            {hasError ? (
              <Text style={styles.errorDetail} numberOfLines={2}>
                {String(step.data.error)}
              </Text>
            ) : (
              <Text style={styles.stepMeta}>
                {durationMs > 0 ? `${durationMs}ms` : 'Done'}
              </Text>
            )}
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

function TextCard({ step }: { step: AgentStep }) {
  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <GlassCard>
        <Text style={styles.narrativeText}>{String(step.data.text ?? '')}</Text>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Verdict card ────────────────────────────────────────────────────────────

function VerdictCard() {
  const verdict = useAgentStore((s) => s.verdict);
  const mint = useAgentStore((s) => s.mint);
  if (!verdict) return null;

  const score = verdict.risk_score ?? 0;
  const color = riskColor(score);
  const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        {/* Score */}
        <View style={styles.verdictHeader}>
          <Text style={[styles.verdictScore, { color }]}>{score}</Text>
          <Text style={styles.verdictScoreLabel}>/100</Text>
          <RiskBadge level={level} size="md" />
        </View>

        {/* Summary */}
        <Text style={styles.verdictSummary}>{verdict.verdict_summary}</Text>

        {/* Key findings */}
        {verdict.key_findings?.length > 0 && (
          <View style={styles.findingsSection}>
            {verdict.key_findings.map((f, i) => (
              <Text key={i} style={styles.findingItem}>{f}</Text>
            ))}
          </View>
        )}

        {/* Conviction */}
        {verdict.conviction_chain ? (
          <Text style={styles.convictionText}>{verdict.conviction_chain}</Text>
        ) : null}

        {/* View report button */}
        <HapticButton
          variant="primary"
          size="md"
          fullWidth
          onPress={() => router.push(`/token/${mint}`)}
          style={styles.viewReportBtn}
        >
          <Text style={styles.btnText}>VIEW FULL REPORT</Text>
        </HapticButton>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const apiKey = useAuthStore((s) => s.apiKey);
  const status = useAgentStore((s) => s.status);
  const steps = useAgentStore((s) => s.steps);
  const error = useAgentStore((s) => s.error);
  const remaining = useRemainingQuota('agent');

  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { startSession, addStep, setVerdict, setError, cancel, reset } = useAgentStore.getState();

  const handleEvent = useCallback((event: AgentEvent) => {
    if (event.type === 'done' || event.type === 'error') return; // handled separately
    addStep({
      type: event.type as AgentStep['type'],
      turn: (event.data as { turn?: number }).turn ?? 0,
      data: event.data as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    // Auto-scroll
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const handleDone = useCallback((result: AgentDoneEvent | null) => {
    if (result?.verdict) {
      setVerdict(result.verdict, result.turns_used, result.tokens_used);
      useSubscriptionStore.getState().incrementUsage('agent');
    } else if (!useAgentStore.getState().error) {
      setError('Investigation completed without verdict');
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const startInvestigation = useCallback(() => {
    if (!mint) return;
    startSession(mint);
    cancelRef.current = agentStream(mint, apiKey ?? '', handleEvent, handleDone, handleError);
  }, [mint, apiKey]);

  useEffect(() => {
    startInvestigation();
    return () => {
      cancelRef.current?.();
    };
  }, [mint]);

  const handleAbort = () => {
    cancelRef.current?.();
    cancel();
  };

  const handleRetry = () => {
    cancelRef.current?.();
    reset();
    startInvestigation();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <AuroraBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { cancelRef.current?.(); router.back(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={tokens.white80} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>INVESTIGATION</Text>
        {status === 'running' ? (
          <TouchableOpacity
            onPress={handleAbort}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Abort investigation"
          >
            <X size={22} color={tokens.white60} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <FeatureGate feature="Agent Investigation" requiredPlan="pro_plus">
        {/* Quota */}
        <Text style={styles.quota}>
          {remaining === -1 ? 'Unlimited' : `${remaining} investigations remaining today`}
        </Text>

        {/* Mint address */}
        <Text style={styles.mintAddr} numberOfLines={1}>{mint}</Text>

        {/* Timeline */}
        <ScrollView
          ref={scrollRef}
          style={styles.timeline}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.timelineContent}
        >
          {steps.map((step, i) => {
            switch (step.type) {
              case 'thinking':
                return <ThinkingCard key={`t-${i}`} step={step} />;
              case 'tool_call':
                return <ToolCallCard key={`tc-${i}`} step={step} />;
              case 'tool_result':
                return <ToolResultCard key={`tr-${i}`} step={step} />;
              case 'text':
                return <TextCard key={`tx-${i}`} step={step} />;
              default:
                return null;
            }
          })}

          {/* Running indicator */}
          {status === 'running' && steps.length > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.runningRow}>
              <Spinner size={16} color={tokens.white35} />
              <Text style={styles.runningText}>Agent investigating...</Text>
            </Animated.View>
          )}

          {/* Verdict */}
          {status === 'done' && <VerdictCard />}

          {/* Error */}
          {status === 'error' && (
            <Animated.View entering={FadeInDown.duration(300).springify()}>
              <GlassCard>
                <View style={styles.stepRow}>
                  <AlertTriangle size={20} color={tokens.risk?.high ?? '#FF6B6B'} />
                  <Text style={styles.errorText}>{error ?? 'Unknown error'}</Text>
                </View>
                <HapticButton
                  variant="ghost"
                  size="sm"
                  onPress={handleRetry}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>RETRY</Text>
                </HapticButton>
              </GlassCard>
            </Animated.View>
          )}

          {/* Cancelled */}
          {status === 'cancelled' && (
            <Animated.View entering={FadeIn.duration(200)}>
              <GlassCard>
                <Text style={styles.cancelledText}>Investigation cancelled</Text>
                <HapticButton
                  variant="ghost"
                  size="sm"
                  onPress={handleRetry}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>RESTART</Text>
                </HapticButton>
              </GlassCard>
            </Animated.View>
          )}
        </ScrollView>
      </FeatureGate>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    letterSpacing: 1.5,
  },
  quota: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginBottom: 4,
  },
  mintAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    paddingHorizontal: tokens.spacing.screenPadding,
    marginBottom: 12,
  },
  timeline: {
    flex: 1,
    paddingHorizontal: tokens.spacing.screenPadding,
  },
  timelineContent: {
    gap: 8,
    paddingBottom: 32,
  },

  // Step cards
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  toolInfo: {
    flex: 1,
  },
  toolLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white80,
  },
  stepMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 2,
  },
  thinkingText: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    fontStyle: 'italic',
  },
  narrativeText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white80,
    lineHeight: 22,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body,
    color: tokens.risk?.high ?? '#FF6B6B',
  },
  errorDetail: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk?.high ?? '#FF6B6B',
    marginTop: 2,
  },
  cancelledText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body,
    color: tokens.white60,
    textAlign: 'center',
  },

  // Running indicator
  runningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  runningText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },

  // Verdict card
  verdictHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 12,
  },
  verdictScore: {
    fontFamily: 'Lexend-Bold',
    fontSize: 36,
  },
  verdictScoreLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    marginRight: 10,
  },
  verdictSummary: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    marginBottom: 12,
  },
  findingsSection: {
    gap: 6,
    marginBottom: 12,
  },
  findingItem: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 20,
  },
  convictionText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 20,
  },
  viewReportBtn: {
    marginTop: 4,
  },
  btnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 0.5,
  },
  retryBtn: {
    marginTop: 12,
    alignSelf: 'center',
  },
  retryText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    letterSpacing: 0.5,
  },

  // Spinner
  spinnerTrack: { position: 'absolute' },
  spinnerArc: { position: 'absolute' },
});
