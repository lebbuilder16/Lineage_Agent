import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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
  Linking,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
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
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  XOctagon,
  Share2,
  Timer,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
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
import { useHistoryStore } from '../../src/store/history';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { SkeletonLoader, SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { UpgradePrompt } from '../../src/components/ui/UpgradePrompt';
import { useToast } from '../../src/components/ui/Toast';
import { shortAddr, timeAgo } from '../../src/lib/format';
import { tokens } from '../../src/theme/tokens';

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

const SCAN_STEP_COUNT = Object.keys(SCAN_STEPS).length;

// ─── Finding category badges ────────────────────────────────────────────────

const FINDING_CATEGORIES: Record<string, { color: string; icon: React.ElementType }> = {
  FINANCIAL:     { color: tokens.risk?.high ?? '#FF9933',     icon: TrendingDown },
  EXIT:          { color: tokens.risk?.critical ?? '#FF3366', icon: XOctagon },
  COORDINATION:  { color: tokens.risk?.critical ?? '#FF3366', icon: Network },
  DEPLOYMENT:    { color: tokens.risk?.medium ?? '#F59E0B',   icon: Package },
  IDENTITY:      { color: tokens.secondary,                   icon: Fingerprint },
  TIMING:        { color: tokens.risk?.medium ?? '#F59E0B',   icon: Clock },
};

function parseFinding(text: string): { category: string | null; body: string } {
  const match = text.match(/^\[([A-Z_]+)\]\s*(.*)$/);
  if (match) return { category: match[1], body: match[2] };
  return { category: null, body: text };
}

// ─── Risk level helpers ─────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk?.critical ?? '#FF3366';
  if (score >= 50) return tokens.risk?.high ?? '#FF9933';
  if (score >= 25) return tokens.risk?.medium ?? '#F59E0B';
  return tokens.risk?.low ?? '#00FF88';
}

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/** Colorblind-safe icon companion for risk levels */
function RiskIcon({ level, size = 14 }: { level: RiskLevel; size?: number }) {
  const color = tokens.risk?.[level] ?? tokens.white60;
  switch (level) {
    case 'low': return <ShieldCheck size={size} color={color} />;
    case 'medium': return <AlertTriangle size={size} color={color} />;
    case 'high': return <ShieldAlert size={size} color={color} />;
    case 'critical': return <XOctagon size={size} color={color} />;
  }
}

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

// ─── Pulsing dot (chat indicator) ───────────────────────────────────────────

function PulsingDot({ color = tokens.secondary, size = 8 }: { color?: string; size?: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animStyle]}
    />
  );
}

// ─── Tool call deduplication ────────────────────────────────────────────────

interface GroupedTool {
  toolName: string;
  callCount: number;
  latestResult: AgentStep | null;
  latestCall: AgentStep | null;
  hasError: boolean;
}

function groupToolCalls(steps: AgentStep[]): GroupedTool[] {
  const map = new Map<string, GroupedTool>();
  for (const step of steps) {
    if (step.type !== 'tool_call' && step.type !== 'tool_result') continue;
    const tool = String(step.data.tool ?? 'unknown');
    const existing = map.get(tool) ?? { toolName: tool, callCount: 0, latestResult: null, latestCall: null, hasError: false };
    if (step.type === 'tool_call') {
      existing.callCount++;
      existing.latestCall = step;
    }
    if (step.type === 'tool_result') {
      existing.latestResult = step;
      if (step.data.error) existing.hasError = true;
    }
    map.set(tool, existing);
  }
  return Array.from(map.values());
}

// ─── Scan step card ──────────────────────────────────────────────────────────

function ScanStepCard({ step }: { step: ScanStep }) {
  const meta = SCAN_STEPS[step.step] ?? { label: step.step, Icon: Clock };
  const StepIcon = meta.Icon;
  const isDone = step.status === 'done';

  return (
    <Animated.View entering={FadeInDown.duration(200).springify()}>
      <View
        style={styles.scanStepRow}
        accessibilityLabel={`${meta.label} — ${isDone ? 'complete' : 'in progress'}`}
      >
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

// ─── Collapsible forensic scan section ──────────────────────────────────────

function ForensicScanSection({ steps, isRunning }: { steps: ScanStep[]; isRunning: boolean }) {
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
              color={tokens.white35}
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

// ─── Grouped tool card (deduplicated) ───────────────────────────────────────

function GroupedToolCard({ group }: { group: GroupedTool }) {
  const meta = TOOL_META[group.toolName] ?? { label: group.toolName, Icon: Search };
  const ToolIcon = meta.Icon;
  const isDone = group.latestResult != null;
  const hasError = group.hasError;
  const durationMs = isDone ? Number(group.latestResult?.data.durationMs ?? group.latestResult?.data.duration_ms ?? 0) : 0;

  return (
    <View
      style={styles.groupedToolRow}
      accessibilityLabel={`${meta.label} — ${hasError ? 'error' : isDone ? 'complete' : 'running'}${group.callCount > 1 ? `, called ${group.callCount} times` : ''}`}
    >
      {isDone ? (
        hasError ? <AlertTriangle size={16} color={tokens.risk?.high ?? '#FF6B6B'} /> : <CheckCircle size={16} color={tokens.success} />
      ) : (
        <Spinner size={16} color={tokens.secondary} />
      )}
      <ToolIcon size={14} color={tokens.secondary} />
      <Text style={[styles.toolLabel, hasError && styles.errorText]}>{meta.label}</Text>
      {group.callCount > 1 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>x{group.callCount}</Text>
        </View>
      )}
      {isDone && !hasError && durationMs > 0 && (
        <Text style={styles.stepMeta}>{durationMs}ms</Text>
      )}
    </View>
  );
}

// ─── Agent reasoning section (collapsible) ──────────────────────────────────

function AgentReasoningSection({ steps, isReasoning }: { steps: AgentStep[]; isReasoning: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const groupedTools = useMemo(() => groupToolCalls(steps), [steps]);
  const textSteps = useMemo(() => steps.filter(s => s.type === 'text'), [steps]);
  const thinkingSteps = useMemo(() => steps.filter(s => s.type === 'thinking'), [steps]);
  const maxTurn = useMemo(() => Math.max(...steps.map(s => s.turn), 0), [steps]);

  // Auto-collapse when reasoning done
  useEffect(() => {
    if (!isReasoning && steps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isReasoning, steps.length]);

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <TouchableOpacity
          onPress={() => setExpanded(e => !e)}
          style={styles.sectionHeaderRow}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Agent reasoning, ${maxTurn} turn${maxTurn !== 1 ? 's' : ''}`}
          accessibilityState={{ expanded }}
        >
          <View style={styles.sectionHeaderLeft}>
            <Brain size={16} color={tokens.secondary} />
            <Text style={styles.sectionLabel}>AGENT REASONING</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            <Text style={styles.sectionMeta}>{maxTurn} turn{maxTurn !== 1 ? 's' : ''}</Text>
            {isReasoning && <Spinner size={14} color={tokens.secondary} />}
            <ChevronDown
              size={16}
              color={tokens.white35}
              style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </View>
        </TouchableOpacity>
        {expanded && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {/* Grouped tool calls */}
            {groupedTools.map(g => (
              <GroupedToolCard key={g.toolName} group={g} />
            ))}
            {/* Thinking excerpts (last only) */}
            {thinkingSteps.length > 0 && (
              <View style={styles.stepRow}>
                <Brain size={14} color={tokens.white60} />
                <Text style={styles.thinkingText} numberOfLines={3}>
                  {String(thinkingSteps[thinkingSteps.length - 1].data.text ?? 'Reasoning...')}
                </Text>
              </View>
            )}
            {/* Narrative text blocks */}
            {textSteps.map((s, i) => (
              <Text key={`tx-${i}`} style={styles.narrativeText}>{String(s.data.text ?? '')}</Text>
            ))}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ─── Finding item with category badge ───────────────────────────────────────

function FindingItem({ text }: { text: string }) {
  const { category, body } = parseFinding(text);
  const cat = category ? FINDING_CATEGORIES[category] : null;
  const CatIcon = cat?.icon;

  return (
    <View style={styles.findingRow}>
      {cat && CatIcon && (
        <View style={[styles.findingBadge, { backgroundColor: `${cat.color}1A`, borderColor: `${cat.color}50` }]}>
          <CatIcon size={10} color={cat.color} />
          <Text style={[styles.findingBadgeText, { color: cat.color }]}>{category}</Text>
        </View>
      )}
      <Text style={styles.findingBody}>{body}</Text>
    </View>
  );
}

// ─── Verdict hero (score + gauge + summary) ─────────────────────────────────

function VerdictHero() {
  const verdict = useInvestigateStore((s) => s.verdict);
  const mint = useInvestigateStore((s) => s.mint);
  if (!verdict) return null;

  const score = verdict.risk_score ?? 0;
  const color = riskColor(score);
  const level = riskLevel(score);

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View
          style={styles.verdictHeroCenter}
          accessibilityLabel={`Risk score ${score} out of 100, ${level} risk`}
          accessibilityRole="summary"
        >
          <GaugeRing
            value={score / 100}
            color={color}
            size={100}
            strokeWidth={7}
            label={String(score)}
            sublabel="RISK SCORE"
          />
          <View style={styles.verdictBadgeRow}>
            <RiskBadge level={level} size="md" />
            <RiskIcon level={level} size={16} />
          </View>
        </View>
        <Text style={styles.verdictSummary}>{verdict.verdict_summary}</Text>

        {/* Key findings with category badges */}
        {Array.isArray(verdict.key_findings) && verdict.key_findings.length > 0 && (
          <View style={styles.findingsSection}>
            {verdict.key_findings.map((f, i) => (
              <FindingItem key={i} text={String(f)} />
            ))}
          </View>
        )}

        {verdict.conviction_chain ? (
          <Text style={styles.convictionText}>{verdict.conviction_chain}</Text>
        ) : null}

        <View style={styles.verdictActions}>
          <HapticButton
            variant="primary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => router.push(`/token/${mint}`)}
            accessibilityLabel="View full token report"
          >
            <Text style={styles.btnText}>VIEW REPORT</Text>
          </HapticButton>
          <HapticButton
            variant="ghost"
            size="md"
            onPress={() => {
              const text = `Lineage Investigation\n`
                + `Risk: ${verdict.risk_score}/100 — ${verdict.verdict_summary}\n`
                + `Key findings:\n${Array.isArray(verdict.key_findings) ? verdict.key_findings.map((f: string) => `- ${f}`).join('\n') : ''}\n`
                + `\nAnalyzed by Lineage Agent`;
              Share.share({ message: text });
            }}
            accessibilityLabel="Share verdict"
          >
            <Share2 size={18} color={tokens.secondary} />
          </HapticButton>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Verdict Feedback ────────────────────────────────────────────────────────

function VerdictFeedback() {
  const mint = useInvestigateStore((s) => s.mint);
  const verdict = useInvestigateStore((s) => s.verdict);
  const previous = useHistoryStore((s) => mint ? s.getByMint(mint) : undefined);
  const setFeedback = useHistoryStore((s) => s.setFeedback);

  if (!verdict || !mint) return null;
  if (previous?.feedback) {
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <View style={styles.feedbackDone}>
          <CheckCircle size={14} color={tokens.success} />
          <Text style={styles.feedbackDoneText}>
            Feedback recorded: {previous.feedback === 'accurate' ? 'Accurate' : 'Incorrect'}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <GlassCard>
        <Text style={styles.feedbackTitle}>Was this verdict accurate?</Text>
        <View style={styles.feedbackRow}>
          <HapticButton
            variant="ghost"
            size="sm"
            style={styles.feedbackBtn}
            onPress={() => setFeedback(mint, 'accurate')}
          >
            <CheckCircle size={16} color={tokens.success} />
            <Text style={[styles.feedbackBtnText, { color: tokens.success }]}>Accurate</Text>
          </HapticButton>
          <HapticButton
            variant="ghost"
            size="sm"
            style={styles.feedbackBtn}
            onPress={() => setFeedback(mint, 'incorrect')}
          >
            <XOctagon size={16} color={tokens.risk?.high ?? '#FF6B6B'} />
            <Text style={[styles.feedbackBtnText, { color: tokens.risk?.high ?? '#FF6B6B' }]}>Incorrect</Text>
          </HapticButton>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Verdict skeleton (shown while running) ─────────────────────────────────

function VerdictSkeleton() {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <GlassCard>
        <View style={styles.verdictHeroCenter}>
          <SkeletonLoader width={100} height={100} borderRadius={50} />
          <View style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
            <SkeletonLoader width={120} height={14} />
            <SkeletonLoader width={80} height={12} />
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <SkeletonBlock lines={3} />
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Heuristic card (Free tier) with GaugeRing ──────────────────────────────

function HeuristicCard({ score }: { score: number }) {
  const color = riskColor(score);
  const level = riskLevel(score);
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View
          style={styles.verdictHeroCenter}
          accessibilityLabel={`Heuristic risk score ${score} out of 100, ${level} risk`}
        >
          <GaugeRing
            value={score / 100}
            color={color}
            size={100}
            strokeWidth={7}
            label={String(score)}
            sublabel="HEURISTIC"
          />
          <View style={styles.verdictBadgeRow}>
            <RiskBadge level={level} size="md" />
            <RiskIcon level={level} size={16} />
          </View>
        </View>
        <Text style={styles.heuristicInfo}>
          This is a rule-based pre-score. Upgrade to Pro to unlock AI-powered analysis with deeper insights.
        </Text>
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
      <TouchableOpacity
        style={styles.chatCollapsed}
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open follow-up chat"
      >
        <PulsingDot color={tokens.secondary} size={8} />
        <Send size={14} color={tokens.secondary} />
        <Text style={styles.chatCollapsedText}>Ask a follow-up question</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.chatPanel}>
      <TouchableOpacity
        style={styles.chatHandle}
        onPress={() => setExpanded(false)}
        accessibilityRole="button"
        accessibilityLabel="Collapse chat"
      >
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
          accessibilityLabel="Chat message input"
        />
        <TouchableOpacity
          style={[styles.chatSendBtn, (!input.trim() || busy) && styles.chatSendDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !input.trim() || busy }}
        >
          <Send size={18} color={input.trim() && !busy ? tokens.white100 : tokens.white35} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Elapsed Timer ──────────────────────────────────────────────────────────

function ElapsedTimer() {
  const startedAt = useInvestigateStore((s) => s.startedAt);
  const status = useInvestigateStore((s) => s.status);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const frozen = status === 'done' || status === 'error' || status === 'cancelled';
    if (frozen) {
      setElapsed(Date.now() - startedAt);
      return;
    }
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  if (!startedAt) return null;
  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const display = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;

  return (
    <View style={styles.timerRow}>
      <Timer size={12} color={tokens.white35} />
      <Text style={styles.timerText}>
        {status === 'done' || status === 'error' ? `Completed in ${display}` : `Started ${display} ago`}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function InvestigateScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const apiKey = useAuthStore((s) => s.apiKey);
  const plan = useSubscriptionStore((s) => s.plan);
  const { showToast, toast } = useToast();

  // Reactive selectors (fix: no getState() in render)
  const status = useInvestigateStore((s) => s.status);
  const scanSteps = useInvestigateStore((s) => s.scanSteps);
  const agentSteps = useInvestigateStore((s) => s.agentSteps);
  const heuristicScore = useInvestigateStore((s) => s.heuristicScore);
  const verdict = useInvestigateStore((s) => s.verdict);
  const chatAvailable = useInvestigateStore((s) => s.chatAvailable);
  const error = useInvestigateStore((s) => s.error);
  const startedAt = useInvestigateStore((s) => s.startedAt);
  const remaining = useRemainingQuota('investigate');

  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleCopy = useCallback(async (value: string, label = 'Address') => {
    await Clipboard.setStringAsync(value);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${label} copied`);
  }, [showToast]);

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
          data: event.data as unknown as Record<string, unknown>,
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
  }, []);

  const handleDone = useCallback((result: InvestigateDoneEvent | null) => {
    const s = useInvestigateStore.getState();
    if (result) {
      s.setDone(result.chat_available);
      if (result.turns_used > 0 || result.tokens_used > 0) {
        useInvestigateStore.setState({ turnsUsed: result.turns_used, tokensUsed: result.tokens_used });
      }
      useSubscriptionStore.getState().incrementUsage('investigate');
      // Save to investigation history for cross-session memory
      const verdict = useInvestigateStore.getState().verdict;
      if (verdict && mint) {
        useHistoryStore.getState().addInvestigation({
          mint,
          riskScore: verdict.risk_score ?? 0,
          verdict: verdict.verdict_summary ?? '',
          keyFindings: Array.isArray(verdict.key_findings) ? verdict.key_findings : [],
          timestamp: Date.now(),
        });
      }
    } else if (!s.error) {
      s.setError('Investigation completed without result');
    }
  }, [mint]);

  const handleError = useCallback((err: Error) => {
    useInvestigateStore.getState().setError(err.message);
  }, []);

  const launchStream = useCallback(() => {
    if (!mint) return;
    useInvestigateStore.getState().confirmInvestigation();
    cancelRef.current = investigateStream(mint, apiKey ?? '', {
      onEvent: handleEvent,
      onDone: handleDone,
      onError: handleError,
    });
  }, [mint, apiKey]);

  const startInvestigation = useCallback(() => {
    if (!mint) return;
    useInvestigateStore.getState().startInvestigation(mint, plan);
  }, [mint, plan]);

  useEffect(() => {
    startInvestigation();
    return () => { cancelRef.current?.(); };
  }, [mint]);

  const handleAbort = () => {
    cancelRef.current?.();
    useInvestigateStore.getState().cancel();
  };

  const handleRetry = () => {
    cancelRef.current?.();
    useInvestigateStore.getState().reset();
    startInvestigation();
    // Auto-launch on retry (skip preview)
    setTimeout(() => launchStream(), 50);
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

      {/* Quota + Mint address with copy/explorer */}
      <Text style={styles.quota}>
        {remaining === -1 ? 'Unlimited' : `${remaining} investigations remaining today`}
      </Text>
      <View style={styles.mintRow}>
        <TouchableOpacity
          onPress={() => handleCopy(mint ?? '', 'Mint address')}
          style={styles.mintCopyBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Copy mint address"
          accessibilityHint="Double tap to copy to clipboard"
        >
          <Text style={styles.mintAddr} numberOfLines={1}>{shortAddr(mint ?? '')}</Text>
          <Copy size={11} color={tokens.white35} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(`https://solscan.io/token/${mint}`)}
          style={styles.explorerBtn}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="View on Solscan"
        >
          <ExternalLink size={12} color={tokens.secondary} />
        </TouchableOpacity>
      </View>

      {/* Live elapsed timer */}
      {startedAt && (
        <ElapsedTimer />
      )}

      {/* Intent Preview — show plan before starting */}
      {status === 'preview' && (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.previewContainer}>
          <GlassCard style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Brain size={18} color={tokens.secondary} />
              <Text style={styles.previewTitle}>INVESTIGATION PLAN</Text>
            </View>
            <Text style={styles.previewSubtitle}>I'll analyze this token in 3 phases:</Text>
            <View style={styles.previewSteps}>
              <View style={styles.previewStep}>
                <View style={[styles.previewDot, { backgroundColor: tokens.secondary }]} />
                <Text style={styles.previewStepText}>Lineage scan + deployer forensics</Text>
                <Text style={styles.previewEta}>~15s</Text>
              </View>
              <View style={styles.previewStep}>
                <View style={[styles.previewDot, { backgroundColor: tokens.accent }]} />
                <Text style={styles.previewStepText}>Bundle, cartel & SOL flow check</Text>
                <Text style={styles.previewEta}>~10s</Text>
              </View>
              <View style={styles.previewStep}>
                <View style={[styles.previewDot, { backgroundColor: tokens.success }]} />
                <Text style={styles.previewStepText}>AI risk verdict & key findings</Text>
                <Text style={styles.previewEta}>~10s</Text>
              </View>
            </View>
            <HapticButton
              variant="primary"
              size="lg"
              fullWidth
              onPress={launchStream}
              accessibilityLabel="Start investigation"
            >
              <Text style={styles.btnText}>START INVESTIGATION</Text>
            </HapticButton>
          </GlassCard>
        </Animated.View>
      )}

      {/* ─── INVERTED PYRAMID LAYOUT ─── */}
      <ScrollView
        ref={scrollRef}
        style={styles.timeline}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.timelineContent}
      >
        {/* 1. Verdict hero at TOP (Pro / Pro+) */}
        {status === 'done' && verdict && <VerdictHero />}

        {/* 1a. Verdict feedback */}
        {status === 'done' && verdict && <VerdictFeedback />}

        {/* 1b. Heuristic at TOP (Free tier) */}
        {status === 'done' && heuristicScore != null && !verdict && (
          <>
            <HeuristicCard score={heuristicScore} />
            <UpgradePrompt feature="AI Analysis" requiredPlan="pro" />
          </>
        )}

        {/* 1c. Skeleton placeholder while running */}
        {isRunning && <VerdictSkeleton />}

        {/* 2. Running indicator */}
        {isRunning && (scanSteps.length > 0 || agentSteps.length > 0) && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.runningRow}>
            <Spinner size={16} color={tokens.white35} />
            <Text style={styles.runningText}>
              {status === 'scanning' ? 'Scanning...' : status === 'analyzing' ? 'Analyzing...' : 'Agent investigating...'}
            </Text>
          </Animated.View>
        )}

        {/* 3. Collapsible forensic scan */}
        {scanSteps.length > 0 && (
          <ForensicScanSection steps={scanSteps} isRunning={status === 'scanning'} />
        )}

        {/* 4. Collapsible agent reasoning (Pro+ only) */}
        {agentSteps.length > 0 && (
          <AgentReasoningSection steps={agentSteps} isReasoning={status === 'reasoning'} />
        )}

        {/* 5. Initial skeleton (before first event) */}
        {isRunning && scanSteps.length === 0 && agentSteps.length === 0 && (
          <GlassCard>
            <SkeletonBlock lines={4} gap={10} />
          </GlassCard>
        )}

        {/* 6. Error */}
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
                accessibilityLabel="Retry investigation"
              >
                <Text style={styles.retryText}>RETRY</Text>
              </HapticButton>
            </GlassCard>
          </Animated.View>
        )}

        {/* 7. Cancelled */}
        {status === 'cancelled' && (
          <Animated.View entering={FadeIn.duration(200)}>
            <GlassCard>
              <Text style={styles.cancelledText}>Investigation cancelled</Text>
              <HapticButton
                variant="ghost"
                size="sm"
                onPress={handleRetry}
                style={styles.retryBtn}
                accessibilityLabel="Restart investigation"
              >
                <Text style={styles.retryText}>RESTART</Text>
              </HapticButton>
            </GlassCard>
          </Animated.View>
        )}
      </ScrollView>

      {/* Chat panel (Pro+ only, after investigation done) */}
      {status === 'done' && chatAvailable && mint && (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <ChatPanel mint={mint} />
        </View>
      )}

      {/* Toast overlay */}
      {toast}
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
  mintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 4,
  },
  mintCopyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  mintAddr: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  explorerBtn: {
    padding: 4,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  timestamp: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, textAlign: 'center', marginBottom: 8,
  },
  timeline: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  timelineContent: { gap: 8, paddingBottom: 32 },

  // Section headers (collapsible)
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 32,
  },
  sectionHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
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
    color: tokens.white35,
  },

  // Scan steps
  scanStepsContainer: { gap: 6, marginTop: 8 },
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
    flex: 1,
  },
  stepMeta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35,
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

  // Grouped tool row
  groupedToolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  countBadge: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.bgGlass12 ?? 'rgba(255,255,255,0.12)',
  },
  countBadgeText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny,
    color: tokens.white60,
  },

  // Verdict hero
  verdictHeroCenter: {
    alignItems: 'center', gap: 8, marginBottom: 16,
  },
  verdictBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
  },
  verdictSummary: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading,
    color: tokens.white100, marginBottom: 12,
  },
  findingsSection: { gap: 8, marginBottom: 12 },
  findingRow: {
    gap: 6,
  },
  findingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  findingBadgeText: {
    fontFamily: 'Lexend-Bold', fontSize: 9,
    letterSpacing: 0.5,
  },
  findingBody: {
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
  heuristicInfo: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 20, textAlign: 'center',
  },

  // Intent Preview
  previewContainer: {
    paddingHorizontal: tokens.spacing.screenPadding,
    flex: 1, justifyContent: 'center',
  },
  previewCard: {
    borderColor: `${tokens.secondary}30`, borderWidth: 1,
  },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  previewTitle: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader,
    color: tokens.white100, letterSpacing: 1,
  },
  previewSubtitle: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white60, marginBottom: 16,
  },
  previewSteps: { gap: 14, marginBottom: 24 },
  previewStep: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  previewDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  previewStepText: {
    flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.small,
    color: tokens.white80,
  },
  previewEta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Timer
  timerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: 12,
  },
  timerText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, letterSpacing: 0.3,
  },

  // Feedback
  feedbackTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, textAlign: 'center', marginBottom: 10,
  },
  feedbackRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 16,
  },
  feedbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  feedbackBtnText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
  },
  feedbackDone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
  },
  feedbackDoneText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Verdict actions
  verdictActions: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
  },

  // Chat panel
  chatCollapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderTopWidth: 2, borderTopColor: tokens.secondary + '40',
  },
  chatCollapsedText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.secondary,
  },
  chatPanel: {
    maxHeight: 420,
    borderTopWidth: 2, borderTopColor: tokens.secondary + '40',
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
