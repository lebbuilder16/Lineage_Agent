import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Brain, Bot } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { useSweepFlagsStore } from '../../src/store/sweep-flags';
import { useInsightsStore } from '../../src/store/insights';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { tokens } from '../../src/theme/tokens';
import { AgentHero, MemoryLensPanel, InsightCard } from '../../src/components/agent';
import { tokenName as fmtName, shortAddr } from '../../src/lib/token-display';
import { useMemoryEntities, useAgentMemory } from '../../src/lib/query';
import { deriveEffectiveRisk } from '../../src/lib/flag-helpers';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface AgentStatus {
  watching: number;
  last_sweep: number | null;
  investigations_today: number;
  total_investigations: number;
}

/* ─── Intel section (memory entities + detail) ─── */
function IntelSection() {
  const apiKey = useAuthStore((s) => s.apiKey);
  const { data: entities, isLoading } = useMemoryEntities(apiKey);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);
  const memoryParams = useMemo(() => ({
    entity_type: selected?.type,
    entity_id: selected?.id,
  }), [selected?.type, selected?.id]);
  const { data: memory, isLoading: memoryLoading, error: memoryError } = useAgentMemory(apiKey, memoryParams, !!selected);

  if (isLoading) {
    return (
      <View style={{ alignItems: 'center', padding: 20 }}>
        <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 13 }}>Loading...</Text>
      </View>
    );
  }

  const entityList = entities?.entities ?? [];

  if (entityList.length === 0) {
    return (
      <View style={{ alignItems: 'center', padding: 20, gap: 6 }}>
        <Brain size={24} color={tokens.textTertiary} />
        <Text style={{ color: tokens.white60, fontFamily: 'Lexend-Medium', fontSize: 13, textAlign: 'center' }}>No intelligence yet</Text>
        <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 12, textAlign: 'center' }}>
          Investigate tokens to build deployer profiles
        </Text>
      </View>
    );
  }

  // Selected entity — show loading, error, or memory detail
  if (selected) {
    if (memoryLoading) {
      return (
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <Text style={{ color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 13 }}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 13 }}>Loading entity memory...</Text>
          </View>
        </View>
      );
    }

    if (memoryError) {
      return (
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <Text style={{ color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 13 }}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <Text style={{ color: tokens.risk.critical, fontFamily: 'Lexend-Medium', fontSize: 13 }}>Failed to load entity memory</Text>
            <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 12, textAlign: 'center' }}>
              {(memoryError as Error)?.message || 'Unknown error'}
            </Text>
            <TouchableOpacity onPress={() => setSelected(null)} style={{ marginTop: 8 }}>
              <Text style={{ color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 13 }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (memory) {
      return (
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <Text style={{ color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 13 }}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <MemoryLensPanel data={memory} />
        </View>
      );
    }
  }

  return (
    <View style={{ gap: 6 }}>
      {entityList.slice(0, 10).map((e: any, i: number) => (
        <TouchableOpacity
          key={`${e.entity_type}-${e.entity_id}-${i}`}
          onPress={() => setSelected({ type: e.entity_type, id: e.entity_id })}
          style={styles.entityRow}
          activeOpacity={0.7}
        >
          <View style={[styles.entityIcon, {
            backgroundColor: e.entity_type === 'deployer' ? 'rgba(207,230,228,0.08)' : 'rgba(149,210,230,0.08)',
          }]}>
            <Brain size={14} color={e.entity_type === 'deployer' ? tokens.step?.deployer_profile ?? tokens.secondary : tokens.lavender ?? tokens.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.entityId} numberOfLines={1}>
              {e.entity_id.slice(0, 8)}...{e.entity_id.slice(-4)}
            </Text>
            <Text style={styles.entityMeta}>
              {e.entity_type} · {e.total_tokens ?? 0} tokens · {e.total_rugs ?? 0} rugs
            </Text>
          </View>
          <Text style={{ color: tokens.textTertiary, fontSize: 14 }}>{'\u203A'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const apiKey = useAuthStore((s) => s.apiKey);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const watches = useAuthStore((s) => s.watches);
  const investigations = useHistoryStore((s) => s.investigations);
  const insights = useInsightsStore((s) => s.insights);
  const fetchInsights = useInsightsStore((s) => s.fetchInsights);
  const unreadFlags = useSweepFlagsStore((s) => s.flags.filter((f) => !f.read).length);

  const [serverStatus, setServerStatus] = useState<AgentStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const fetchStatus = useCallback(async () => {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/status`, { headers: { 'X-API-Key': key } });
      if (res.ok) setServerStatus(await res.json());
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    useAgentPrefsStore.getState().hydrate();
    useHistoryStore.getState().hydrate();
    fetchStatus();
    fetchInsights();
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !isFocused) return;
    const interval = setInterval(() => { fetchStatus(); fetchInsights(); }, 60_000);
    return () => clearInterval(interval);
  }, [apiKey, isFocused]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchInsights()]);
    setRefreshing(false);
  };

  // ── Derived stats ──
  const watchCount = serverStatus?.watching ?? watches.length;
  const todayCount = serverStatus?.investigations_today ?? investigations.filter(
    (i) => Date.now() - i.timestamp < 24 * 3600 * 1000,
  ).length;
  const totalCount = serverStatus?.total_investigations ?? investigations.length;
  const withFeedback = investigations.filter((i) => i.feedback);
  const accuratePct = withFeedback.length > 0
    ? Math.round((withFeedback.filter((i) => i.feedback === 'accurate').length / withFeedback.length) * 100)
    : null;

  // Recent investigations (last 10)
  const recentInvestigations = useMemo(
    () => investigations.slice(0, 10),
    [investigations],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tokens.secondary} />}
        >
          <AgentHero
            wsConnected={wsConnected}
            watchCount={watchCount}
            todayCount={todayCount}
            totalCount={totalCount}
            accuratePct={accuratePct}
            lastSweep={serverStatus?.last_sweep ?? null}
            unreadFlags={unreadFlags}
          />

          {/* ── Intelligence (cross-token insights) ── */}
          <Animated.View entering={FadeInDown.delay(100).duration(300)} style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>INTELLIGENCE</Text>
            {insights.length > 0 ? (
              insights.map((insight, i) => (
                <InsightCard
                  key={`${insight.type}-${i}`}
                  insight={insight}
                  onPress={insight.type === 'shared_deployer' && insight.detail.deployer
                    ? () => router.push(`/deployer/${insight.detail.deployer}` as any)
                    : undefined}
                />
              ))
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>
                  {useInsightsStore.getState().loading
                    ? 'Analyzing cross-token patterns...'
                    : 'No cross-token patterns detected yet. Investigate more tokens to build intelligence.'}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── Known entities ── */}
          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>KNOWN ENTITIES</Text>
            <IntelSection />
          </Animated.View>

          {/* ── Recent investigations ── */}
          {recentInvestigations.length > 0 && (
            <Animated.View entering={FadeInDown.delay(300).duration(300)} style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>RECENT INVESTIGATIONS</Text>
              {recentInvestigations.map((inv) => {
                const name = fmtName(inv.name, inv.symbol, inv.mint);
                const risk = deriveEffectiveRisk(inv.riskScore, inv.verdict, inv.keyFindings);
                return (
                  <TouchableOpacity
                    key={inv.mint}
                    onPress={() => router.push(`/investigate/${inv.mint}` as any)}
                    style={styles.invRow}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.invDot, { backgroundColor: risk.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.invName} numberOfLines={1}>{name}</Text>
                      <Text style={styles.invVerdict} numberOfLines={1}>{inv.verdict ?? `Risk: ${inv.riskScore}`}</Text>
                    </View>
                    <View style={[styles.invScore, { borderColor: `${risk.color}40` }]}>
                      <Text style={[styles.invScoreText, { color: risk.color }]}>{risk.score}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  sectionLabel: {
    color: tokens.white35, fontFamily: 'Lexend-SemiBold', fontSize: 11,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  // Entity rows
  entityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  entityIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  entityId: { color: tokens.white80, fontFamily: 'Lexend-Medium', fontSize: 13 },
  entityMeta: { color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 11, marginTop: 1 },
  // Investigation rows
  invRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  invDot: { width: 8, height: 8, borderRadius: 4 },
  invName: { color: tokens.white80, fontFamily: 'Lexend-Medium', fontSize: 13 },
  invVerdict: { color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 11, marginTop: 1 },
  invScore: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: tokens.radius.sm,
    borderWidth: 1,
  },
  invScoreText: { fontFamily: 'Lexend-SemiBold', fontSize: 12 },
  emptySection: {
    padding: 16, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  emptySectionText: {
    color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 12,
    textAlign: 'center', lineHeight: 18,
  },
});
