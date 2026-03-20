import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  Send,
  ChevronUp,
  Lock,
  ArrowUpRight,
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

import { investigateStream, investigateChatStream } from '../../src/lib/investigate-streaming';
import type { InvestigateEvent, InvestigateDoneEvent } from '../../src/lib/investigate-streaming';
import { useInvestigateStore } from '../../src/store/investigate';
import type { AgentStep, ScanStep } from '../../src/store/investigate';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore, useRemainingQuota } from '../../src/store/subscription';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import type { PlanTier } from '../../src/lib/tier-limits';

// ─── Tool meta ───────────────────────────────────────────────────────────────

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

const SCAN_STEPS: Record<string, { label: string; Icon: React.ElementType }> = {
  lineage:  { label: 'Lineage Trace',    Icon: Search },
  deployer: { label: 'Deployer Profile', Icon: User },
  cartel:   { label: 'Cartel Detection', Icon: Network },
  bundle:   { label: 'Bundle Analysis',  Icon: Package },
  sol_flow: { label: 'SOL Flow',         Icon: ArrowRightLeft },
  ai:       { label: 'AI Analysis',      Icon: Brain },
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = tokens.secondary }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));
  const r = size / 2;
  const stroke = size * 0.12;
  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <View style={[styles.spinnerTrack, { width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: `${color}25` }]} />
      <View style={[styles.spinnerArc, { width: size, height: size, borderRadius: r, borderWidth: stroke, borderTopColor: color, borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }]} />
    </Animated.View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk?.critical ?? '#FF3366';
  if (score >= 50) return tokens.risk?.high ?? '#FF6B6B';
  if (score >= 25) return tokens.risk?.medium ?? '#FFB700';
  return tokens.risk?.low ?? '#00FF88';
}

// ─── Scan step card ──────────────────────────────────────────────────────────

function ScanStepCard({ step }: { step: ScanStep }) {
  const meta = SCAN_STEPS[step.step] ?? { label: step.step, Icon: Clock };
  const StepIcon = meta.Icon;
  const isDone = step.status === 'done';

  return (
    <Animated.View entering={FadeInDown.duration(200).springify()}>
      <View style={styles.scanStepRow}>
        {isDone ? (
          <CheckCircle size={16} color={tokens.success} />
        ) : (
          <Spinner size={16} color={tokens.secondary} />
        )}
        <StepIcon size={14} color={isDone ? tokens.white60 : tokens.secondary} />
        <Text style={[styles.scanStepLabel, isDone && styles.scanStepDone]}>
          {meta.label}
        </Text>
        {isDone && step.ms != null && (
          <Text style={styles.scanStepMs}>{step.ms}ms</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Agent step cards (reused from agent screen) ─────────────────────────────

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
              <Text style={styles.errorDetail} numberOfLines={2}>{String(step.data.error)}</Text>
            ) : (
              <Text style={styles.stepMeta}>{durationMs > 0 ? `${durationMs}ms` : 'Done'}</Text>
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
  const verdict = useInvestigateStore((s) => s.verdict);
  const mint = useInvestigateStore((s) => s.mint);
  if (!verdict) return null;

  const score = verdict.risk_score ?? 0;
  const color = riskColor(score);
  const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View style={styles.verdictHeader}>
          <Text style={[styles.verdictScore, { color }]}>{score}</Text>
          <Text style={styles.verdictScoreLabel}>/100</Text>
          <RiskBadge level={level} size="md" />
        </View>
        <Text style={styles.verdictSummary}>{verdict.verdict_summary}</Text>
        {verdict.key_findings?.length > 0 && (
          <View style={styles.findingsSection}>
            {verdict.key_findings.map((f, i) => (
              <Text key={i} style={styles.findingItem}>{f}</Text>
            ))}
          </View>
        )}
        {verdict.conviction_chain ? (
          <Text style={styles.convictionText}>{verdict.conviction_chain}</Text>
        ) : null}
        <HapticButton variant="primary" size="md" fullWidth onPress={() => router.push(`/token/${mint}`)} style={styles.viewReportBtn}>
          <Text style={styles.btnText}>VIEW FULL REPORT</Text>
        </HapticButton>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Heuristic card (Free tier) ──────────────────────────────────────────────

function HeuristicCard({ score }: { score: number }) {
  const color = riskColor(score);
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View style={styles.verdictHeader}>
          <Text style={[styles.verdictScore, { color }]}>{score}</Text>
          <Text style={styles.verdictScoreLabel}>/100</Text>
          <Text style={styles.heuristicLabel}>Heuristic</Text>
        </View>
        <Text style={styles.heuristicInfo}>
          This is a rule-based pre-score. Upgrade to Pro to unlock AI-powered analysis with deeper insights.
        </Text>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Upsell card ─────────────────────────────────────────────────────────────

function UpgradeCard({ feature, plan }: { feature: string; plan: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <GlassCard>
        <View style={styles.upgradeRow}>
          <Lock size={20} color={tokens.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>Unlock {feature}</Text>
            <Text style={styles.upgradeSubtitle}>
              Upgrade to {plan === 'pro' ? 'Pro' : 'Pro+'} for AI-powered investigation and follow-up chat.
            </Text>
          </View>
          <ArrowUpRight size={18} color={tokens.secondary} />
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Chat panel ──────────────────────────────────────────────────────────────

function ChatPanel({ mint }: { mint: string }) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const messages = useInvestigateStore((s) => s.chatMessages);
  const busy = useInvestigateStore((s) => s.chatBusy);
  const { addChatMessage, setChatBusy } = useInvestigateStore.getState();

  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;

    addChatMessage({ role: 'user', content: text });
    setInput('');
    setChatBusy(true);

    let assistantContent = '';
    addChatMessage({ role: 'assistant', content: '' });

    cancelRef.current = investigateChatStream(
      mint,
      apiKey ?? '',
      text,
      messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8),
      (token) => {
        assistantContent += token;
        // Update last message in-place
        const currentMsgs = useInvestigateStore.getState().chatMessages;
        const updated = [...currentMsgs];
        updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
        useInvestigateStore.setState({ chatMessages: updated });
      },
      () => {
        setChatBusy(false);
      },
      (err) => {
        setChatBusy(false);
        addChatMessage({ role: 'assistant', content: `Error: ${err.message}` });
      },
    );
  }, [input, busy, mint, apiKey, messages]);

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.chatCollapsed} onPress={() => setExpanded(true)} activeOpacity={0.8}>
        <ChevronUp size={16} color={tokens.white60} />
        <Text style={styles.chatCollapsedText}>Ask a follow-up</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.chatPanel}>
      <TouchableOpacity style={styles.chatHandle} onPress={() => setExpanded(false)}>
        <View style={styles.chatHandleBar} />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => `msg-${i}`}
        style={styles.chatList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.chatBubble, item.role === 'user' ? styles.chatUser : styles.chatAssistant]}>
            <Text style={[styles.chatText, item.role === 'user' && styles.chatTextUser]}>
              {item.content || (busy ? '...' : '')}
            </Text>
          </View>
        )}
      />

      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about this token..."
          placeholderTextColor={tokens.white35}
          maxLength={600}
          editable={!busy}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.chatSendBtn, (!input.trim() || busy) && styles.chatSendDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || busy}
        >
          <Send size={18} color={input.trim() && !busy ? tokens.white100 : tokens.white35} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function InvestigateScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const apiKey = useAuthStore((s) => s.apiKey);
  const plan = useSubscriptionStore((s) => s.plan);

  const status = useInvestigateStore((s) => s.status);
  const scanSteps = useInvestigateStore((s) => s.scanSteps);
  const agentSteps = useInvestigateStore((s) => s.agentSteps);
  const heuristicScore = useInvestigateStore((s) => s.heuristicScore);
  const chatAvailable = useInvestigateStore((s) => s.chatAvailable);
  const error = useInvestigateStore((s) => s.error);
  const remaining = useRemainingQuota('investigate');

  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const store = useInvestigateStore.getState();

  const handleEvent = useCallback((event: InvestigateEvent) => {
    const s = useInvestigateStore.getState();

    switch (event.type) {
      case 'phase':
        if (event.data.phase === 'agent' && event.data.status === 'started') s.setReasoning();
        if (event.data.phase === 'ai_verdict' && event.data.status === 'started') s.setAnalyzing();
        break;

      case 'step':
        s.addScanStep({
          step: event.data.step,
          status: event.data.status,
          ms: event.data.ms,
          heuristic: event.data.heuristic,
          timestamp: Date.now(),
        });
        break;

      case 'heuristic_complete':
        s.setHeuristicComplete(event.data.heuristic_score);
        break;

      case 'thinking':
      case 'tool_call':
      case 'tool_result':
      case 'text':
        s.addAgentStep({
          type: event.type,
          turn: (event.data as { turn: number }).turn ?? 0,
          data: event.data as Record<string, unknown>,
          timestamp: Date.now(),
        });
        break;

      case 'verdict':
        s.setVerdict(event.data as any, 0, 0);
        break;

      case 'done':
      case 'error':
        break; // handled by onDone/onError
    }

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const handleDone = useCallback((result: InvestigateDoneEvent | null) => {
    const s = useInvestigateStore.getState();
    if (result) {
      s.setDone(result.chat_available);
      if (result.turns_used > 0 || result.tokens_used > 0) {
        // Update turns/tokens from done event if verdict was set earlier
        useInvestigateStore.setState({ turnsUsed: result.turns_used, tokensUsed: result.tokens_used });
      }
      useSubscriptionStore.getState().incrementUsage('investigate');
    } else if (!s.error) {
      s.setError('Investigation completed without result');
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const handleError = useCallback((err: Error) => {
    useInvestigateStore.getState().setError(err.message);
  }, []);

  const startInvestigation = useCallback(() => {
    if (!mint) return;
    store.startInvestigation(mint, plan);
    cancelRef.current = investigateStream(mint, apiKey ?? '', {
      onEvent: handleEvent,
      onDone: handleDone,
      onError: handleError,
    });
  }, [mint, apiKey, plan]);

  useEffect(() => {
    startInvestigation();
    return () => { cancelRef.current?.(); };
  }, [mint]);

  const handleAbort = () => {
    cancelRef.current?.();
    store.cancel();
  };

  const handleRetry = () => {
    cancelRef.current?.();
    store.reset();
    startInvestigation();
  };

  const isRunning = status === 'scanning' || status === 'analyzing' || status === 'reasoning';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        {isRunning ? (
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

      {/* Quota */}
      <Text style={styles.quota}>
        {remaining === -1 ? 'Unlimited' : `${remaining} investigations remaining today`}
      </Text>
      <Text style={styles.mintAddr} numberOfLines={1}>{mint}</Text>

      {/* Timeline */}
      <ScrollView
        ref={scrollRef}
        style={styles.timeline}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.timelineContent}
      >
        {/* Scan steps */}
        {scanSteps.length > 0 && (
          <GlassCard>
            <Text style={styles.sectionLabel}>Forensic Scan</Text>
            <View style={styles.scanStepsContainer}>
              {scanSteps.map((step, i) => (
                <ScanStepCard key={`scan-${step.step}-${step.status}-${i}`} step={step} />
              ))}
            </View>
          </GlassCard>
        )}

        {/* Agent reasoning steps (Pro+ only) */}
        {agentSteps.map((step, i) => {
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
        {isRunning && (scanSteps.length > 0 || agentSteps.length > 0) && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.runningRow}>
            <Spinner size={16} color={tokens.white35} />
            <Text style={styles.runningText}>
              {status === 'scanning' ? 'Scanning...' : status === 'analyzing' ? 'Analyzing...' : 'Agent investigating...'}
            </Text>
          </Animated.View>
        )}

        {/* Verdict (Pro / Pro+) */}
        {status === 'done' && useInvestigateStore.getState().verdict && <VerdictCard />}

        {/* Heuristic (Free) */}
        {status === 'done' && heuristicScore != null && !useInvestigateStore.getState().verdict && (
          <>
            <HeuristicCard score={heuristicScore} />
            <UpgradeCard feature="AI Analysis" plan="pro" />
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <Animated.View entering={FadeInDown.duration(300).springify()}>
            <GlassCard>
              <View style={styles.stepRow}>
                <AlertTriangle size={20} color={tokens.risk?.high ?? '#FF6B6B'} />
                <Text style={styles.errorText}>{error ?? 'Unknown error'}</Text>
              </View>
              <HapticButton variant="ghost" size="sm" onPress={handleRetry} style={styles.retryBtn}>
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
              <HapticButton variant="ghost" size="sm" onPress={handleRetry} style={styles.retryBtn}>
                <Text style={styles.retryText}>RESTART</Text>
              </HapticButton>
            </GlassCard>
          </Animated.View>
        )}
      </ScrollView>

      {/* Chat panel (Pro+ only, after investigation done) */}
      {status === 'done' && chatAvailable && mint && <ChatPanel mint={mint} />}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding, paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader,
    color: tokens.white100, letterSpacing: 1.5,
  },
  quota: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, textAlign: 'center', marginBottom: 4,
  },
  mintAddr: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, textAlign: 'center',
    paddingHorizontal: tokens.spacing.screenPadding, marginBottom: 12,
  },
  timeline: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  timelineContent: { gap: 8, paddingBottom: 32 },

  // Scan steps
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, marginBottom: 8, letterSpacing: 0.5,
  },
  scanStepsContainer: { gap: 6 },
  scanStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanStepLabel: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small,
    color: tokens.white80, flex: 1,
  },
  scanStepDone: { color: tokens.white60 },
  scanStepMs: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35,
  },

  // Agent step cards
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  toolInfo: { flex: 1 },
  toolLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80,
  },
  stepMeta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, marginTop: 2,
  },
  thinkingText: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, fontStyle: 'italic',
  },
  narrativeText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white80, lineHeight: 22,
  },
  errorText: {
    flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.body,
    color: tokens.risk?.high ?? '#FF6B6B',
  },
  errorDetail: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.risk?.high ?? '#FF6B6B', marginTop: 2,
  },
  cancelledText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.body,
    color: tokens.white60, textAlign: 'center',
  },

  // Running
  runningRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8,
  },
  runningText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35,
  },

  // Verdict
  verdictHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 12 },
  verdictScore: { fontFamily: 'Lexend-Bold', fontSize: 36 },
  verdictScoreLabel: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white35, marginRight: 10,
  },
  verdictSummary: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading,
    color: tokens.white100, marginBottom: 12,
  },
  findingsSection: { gap: 6, marginBottom: 12 },
  findingItem: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80, lineHeight: 20,
  },
  convictionText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, fontStyle: 'italic', marginBottom: 16, lineHeight: 20,
  },
  viewReportBtn: { marginTop: 4 },
  btnText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.body,
    color: tokens.white100, letterSpacing: 0.5,
  },
  retryBtn: { marginTop: 12, alignSelf: 'center' },
  retryText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.small,
    color: tokens.secondary, letterSpacing: 0.5,
  },

  // Heuristic
  heuristicLabel: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny,
    color: tokens.white35, marginLeft: 4,
  },
  heuristicInfo: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 20,
  },

  // Upgrade card
  upgradeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  upgradeTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body,
    color: tokens.secondary, marginBottom: 2,
  },
  upgradeSubtitle: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 18,
  },

  // Chat panel
  chatCollapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  chatCollapsedText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white60,
  },
  chatPanel: {
    maxHeight: 300,
    borderTopWidth: 1, borderTopColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  chatHandle: { alignItems: 'center', paddingVertical: 8 },
  chatHandleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: tokens.white35,
  },
  chatList: { paddingHorizontal: tokens.spacing.screenPadding },
  chatBubble: {
    maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, marginBottom: 6,
  },
  chatUser: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.secondary + '30',
  },
  chatAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  chatText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80, lineHeight: 20,
  },
  chatTextUser: { color: tokens.white100 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 8,
  },
  chatInput: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white100, backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
  },
  chatSendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.secondary, alignItems: 'center', justifyContent: 'center',
  },
  chatSendDisabled: { opacity: 0.4 },

  // Spinner
  spinnerTrack: { position: 'absolute' },
  spinnerArc: { position: 'absolute' },
});
