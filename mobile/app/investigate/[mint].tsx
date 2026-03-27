import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, X, AlertTriangle, Brain, Copy, ExternalLink } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { investigateStream } from '../../src/lib/investigate-streaming';
import type { InvestigateEvent, InvestigateDoneEvent } from '../../src/lib/investigate-streaming';
import { useInvestigateStore } from '../../src/store/investigate';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore, useRemainingQuota } from '../../src/store/subscription';
import { useHistoryStore } from '../../src/store/history';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { UpgradePrompt } from '../../src/components/ui/UpgradePrompt';
import { useToast } from '../../src/components/ui/Toast';
import { Spinner } from '../../src/components/ui/Spinner';
import { shortAddr } from '../../src/lib/format';
import { tokens } from '../../src/theme/tokens';

import { VerdictHero } from '../../src/components/investigate/VerdictHero';
import { ForensicScanSection } from '../../src/components/investigate/ForensicScanSection';
import { AgentReasoningSection } from '../../src/components/investigate/AgentReasoningSection';
import { ChatPanel } from '../../src/components/investigate/ChatPanel';
import { VerdictFeedback } from '../../src/components/investigate/VerdictFeedback';
import { VerdictSkeleton, HeuristicCard, ElapsedTimer } from '../../src/components/investigate/InvestigateHelpers';

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function InvestigateScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const apiKey = useAuthStore((s) => s.apiKey);
  const plan = useSubscriptionStore((s) => s.plan);
  const { showToast, toast } = useToast();

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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        s.addScanStep({ step: event.data.step, status: event.data.status, ms: event.data.ms, heuristic: event.data.heuristic, timestamp: Date.now() });
        break;
      case 'heuristic_complete':
        s.setHeuristicComplete(event.data.heuristic_score);
        break;
      case 'thinking': case 'tool_call': case 'tool_result': case 'text':
        s.addAgentStep({ type: event.type, turn: (event.data as { turn: number }).turn ?? 0, data: event.data as unknown as Record<string, unknown>, timestamp: Date.now() });
        break;
      case 'verdict':
        s.setVerdict(event.data as any, 0, 0);
        break;
      case 'done': case 'error': break;
    }
  }, []);

  const handleDone = useCallback((result: InvestigateDoneEvent | null) => {
    const s = useInvestigateStore.getState();
    if (result) {
      s.setDone(result.chat_available);
      if (result.turns_used > 0 || result.tokens_used > 0) useInvestigateStore.setState({ turnsUsed: result.turns_used, tokensUsed: result.tokens_used });
      useSubscriptionStore.getState().incrementUsage('investigate');
      const v = useInvestigateStore.getState().verdict;
      if (v && mint) useHistoryStore.getState().addInvestigation({ mint, riskScore: v.risk_score ?? 0, verdict: v.verdict_summary ?? '', keyFindings: Array.isArray(v.key_findings) ? v.key_findings : [], timestamp: Date.now() });
    } else if (!s.error) s.setError('Investigation completed without result');
  }, [mint]);

  const handleError = useCallback((err: Error) => { useInvestigateStore.getState().setError(err.message); }, []);

  const launchStream = useCallback(() => {
    if (!mint) return;
    useInvestigateStore.getState().confirmInvestigation();
    cancelRef.current = investigateStream(mint, apiKey ?? '', { onEvent: handleEvent, onDone: handleDone, onError: handleError });
  }, [mint, apiKey]);

  const startInvestigation = useCallback(() => { if (mint) useInvestigateStore.getState().startInvestigation(mint, plan); }, [mint, plan]);

  useEffect(() => { startInvestigation(); return () => { cancelRef.current?.(); if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }; }, [mint]);

  const handleAbort = () => { cancelRef.current?.(); useInvestigateStore.getState().cancel(); };
  const handleRetry = () => { cancelRef.current?.(); useInvestigateStore.getState().reset(); startInvestigation(); retryTimerRef.current = setTimeout(() => launchStream(), 50); };

  const isRunning = status === 'scanning' || status === 'analyzing' || status === 'reasoning';

  // Auto-scroll to latest content as scan steps / agent steps arrive
  const prevStepCountRef = useRef(0);
  useEffect(() => {
    const totalSteps = scanSteps.length + agentSteps.length;
    if (totalSteps > prevStepCountRef.current) {
      prevStepCountRef.current = totalSteps;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [scanSteps.length, agentSteps.length]);

  // Also scroll when verdict arrives
  useEffect(() => {
    if (verdict) setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 150);
  }, [verdict]);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { cancelRef.current?.(); router.back(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={tokens.white80} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>INVESTIGATION</Text>
        {isRunning ? (
          <TouchableOpacity onPress={handleAbort} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Abort investigation">
            <X size={22} color={tokens.white60} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      <Text style={styles.quota}>{remaining === -1 ? 'Unlimited' : `${remaining} investigations remaining today`}</Text>
      <View style={styles.mintRow}>
        <TouchableOpacity onPress={() => handleCopy(mint ?? '', 'Mint address')} style={styles.mintCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy mint address">
          <Text style={styles.mintAddr} numberOfLines={1}>{shortAddr(mint ?? '')}</Text>
          <Copy size={11} color={tokens.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(`https://solscan.io/token/${mint}`)} style={styles.explorerBtn} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel="View on Solscan">
          <ExternalLink size={12} color={tokens.secondary} />
        </TouchableOpacity>
      </View>

      {startedAt && <ElapsedTimer />}

      {/* Intent Preview */}
      {status === 'preview' && (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.previewContainer}>
          <GlassCard style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Brain size={18} color={tokens.secondary} />
              <Text style={styles.previewTitle}>INVESTIGATION PLAN</Text>
            </View>
            <Text style={styles.previewSubtitle}>I'll analyze this token in 3 phases:</Text>
            <View style={styles.previewSteps}>
              {[
                { color: tokens.secondary, text: 'Lineage scan + deployer forensics', eta: '~15s' },
                { color: tokens.accent, text: 'Bundle, cartel & SOL flow check', eta: '~10s' },
                { color: tokens.success, text: 'AI risk verdict & key findings', eta: '~10s' },
              ].map((step, i) => (
                <View key={i} style={styles.previewStep}>
                  <View style={[styles.previewDot, { backgroundColor: step.color }]} />
                  <Text style={styles.previewStepText}>{step.text}</Text>
                  <Text style={styles.previewEta}>{step.eta}</Text>
                </View>
              ))}
            </View>
            <HapticButton variant="primary" size="lg" fullWidth onPress={launchStream} accessibilityLabel="Start investigation">
              <Text style={styles.btnText}>START INVESTIGATION</Text>
            </HapticButton>
          </GlassCard>
        </Animated.View>
      )}

      {/* Timeline */}
      <ScrollView ref={scrollRef} style={styles.timeline} showsVerticalScrollIndicator={false} contentContainerStyle={styles.timelineContent}>
        {status === 'done' && verdict && <VerdictHero />}
        {status === 'done' && verdict && <VerdictFeedback />}
        {status === 'done' && heuristicScore != null && !verdict && (<><HeuristicCard score={heuristicScore} /><UpgradePrompt feature="AI Analysis" requiredPlan="pro" /></>)}
        {isRunning && <VerdictSkeleton />}

        {isRunning && (scanSteps.length > 0 || agentSteps.length > 0) && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.runningRow}>
            <Spinner size={16} color={tokens.textTertiary} />
            <Text style={styles.runningText}>{status === 'scanning' ? 'Scanning...' : status === 'analyzing' ? 'Analyzing...' : 'Agent investigating...'}</Text>
          </Animated.View>
        )}

        {scanSteps.length > 0 && <ForensicScanSection steps={scanSteps} isRunning={status === 'scanning'} />}
        {agentSteps.length > 0 && <AgentReasoningSection steps={agentSteps} isReasoning={status === 'reasoning'} />}
        {isRunning && scanSteps.length === 0 && agentSteps.length === 0 && <GlassCard><SkeletonBlock lines={4} gap={10} /></GlassCard>}

        {status === 'error' && (
          <Animated.View entering={FadeInDown.duration(300).springify()}>
            <GlassCard>
              <View style={styles.stepRow}><AlertTriangle size={20} color={tokens.risk?.high ?? '#FF6B6B'} /><Text style={styles.errorText}>{error ?? 'Unknown error'}</Text></View>
              <HapticButton variant="ghost" size="sm" onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry investigation"><Text style={styles.retryText}>RETRY</Text></HapticButton>
            </GlassCard>
          </Animated.View>
        )}

        {status === 'cancelled' && (
          <Animated.View entering={FadeIn.duration(200)}>
            <GlassCard>
              <Text style={styles.cancelledText}>Investigation cancelled</Text>
              <HapticButton variant="ghost" size="sm" onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Restart investigation"><Text style={styles.retryText}>RESTART</Text></HapticButton>
            </GlassCard>
          </Animated.View>
        )}
      </ScrollView>

      {status === 'done' && chatAvailable && mint && (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}><ChatPanel mint={mint} /></View>
      )}
      {toast}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.screenPadding, paddingVertical: 12 },
  headerTitle: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100, letterSpacing: 1.5 },
  quota: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, textAlign: 'center', marginBottom: 4 },
  mintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  mintCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: tokens.radius.xs, backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)' },
  mintAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60 },
  explorerBtn: { padding: 4, borderRadius: tokens.radius.xs, backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)' },
  timeline: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  timelineContent: { gap: 8, paddingBottom: 32 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  errorText: { flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.body, color: tokens.risk?.high ?? '#FF6B6B' },
  cancelledText: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.body, color: tokens.white60, textAlign: 'center' },
  runningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  runningText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },
  btnText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100, letterSpacing: 0.5 },
  retryBtn: { marginTop: 12, alignSelf: 'center' },
  retryText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.secondary, letterSpacing: 0.5 },
  previewContainer: { paddingHorizontal: tokens.spacing.screenPadding, flex: 1, justifyContent: 'center' },
  previewCard: { borderColor: `${tokens.secondary}30`, borderWidth: 1 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  previewTitle: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100, letterSpacing: 1 },
  previewSubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60, marginBottom: 16 },
  previewSteps: { gap: 14, marginBottom: 24 },
  previewStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewStepText: { flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white80 },
  previewEta: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
});
