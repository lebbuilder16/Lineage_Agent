// app/(tabs)/index.tsx
// Radar Feed — Aurora Glass design (Figma Make)

import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  FadeInDown,
  FadeInLeft,
} from "react-native-reanimated";

import { getGlobalStats, getStatsBrief } from "@/src/lib/api";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { AIBriefSkeleton, StatsBarSkeleton } from "@/src/components/ui/SkeletonLoader";
import { AnimatedNumber } from "@/src/components/ui/AnimatedNumber";
import { SwipeableRow } from "@/src/components/ui/SwipeableRow";
import { NewAlertsBanner } from "@/src/components/ui/NewAlertsBanner";
import { WsStatusBar } from "@/src/components/ui/WsStatusBar";
import { TimeSectionHeader } from "@/src/components/ui/TimeSectionHeader";
import { EmptyRadar } from "@/src/components/ui/EmptyRadar";
import { useAlertsStore } from "@/src/store/alerts";
import { useWsState } from "@/src/hooks/useWsState";
import { useNewAlerts } from "@/src/hooks/useNewAlerts";
import { darkColors as colors, aurora } from "@/src/theme/colors";
import { Fonts } from "@/src/theme/fonts";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { toast } from "@/src/lib/toast";
import type { AlertItem } from "@/src/types/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function riskLevelFromScore(score: number): string {
  if (score >= 0.9) return "critical";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type AlertGroup = { label: string; items: AlertItem[] };

function groupAlertsByTime(alerts: AlertItem[]): AlertGroup[] {
  const now = Date.now();
  const groups: Record<string, AlertItem[]> = {
    "Just now": [],
    "Last hour": [],
    "Earlier today": [],
    Older: [],
  };
  for (const a of alerts) {
    const age = now - new Date(a.timestamp).getTime();
    if (age < 2 * 60_000) groups["Just now"].push(a);
    else if (age < 60 * 60_000) groups["Last hour"].push(a);
    else if (age < 24 * 60 * 60_000) groups["Earlier today"].push(a);
    else groups["Older"].push(a);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

const RISK_FALLBACK: Record<AlertItem["type"], number> = {
  rug: 0.95,
  death_clock: 0.9,
  bundle: 0.7,
  insider: 0.65,
  zombie: 0.6,
};

// ─── Alert Row ────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<AlertItem["type"], string> = {
  rug: aurora.accent,
  bundle: aurora.warning,
  insider: aurora.warning,
  zombie: aurora.secondary,
  death_clock: aurora.accent,
};

const ALERT_LABELS: Record<AlertItem["type"], string> = {
  rug: "RUG",
  bundle: "BUNDLE",
  insider: "INSIDER SELL",
  zombie: "ZOMBIE",
  death_clock: "DEATH CLOCK",
};

function AlertRow({ item, index, isNew = false }: { item: AlertItem; index: number; isNew?: boolean }) {
  const color = ALERT_COLORS[item.type];
  const score = item.risk_score ?? RISK_FALLBACK[item.type];
  const riskLevel = riskLevelFromScore(score);
  const { colors: tc, isDark } = useTheme();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const markRead = useAlertsStore((s) => s.markRead);

  return (
    <SwipeableRow
      onSwipeRight={() => {
        markRead(item.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onSwipeLeft={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/lineage/${item.mint}`);
      }}
      rightActionLabel="Read"
      leftActionLabel="View"
    >
      <Animated.View entering={isNew ? FadeInLeft.springify() : FadeInDown.delay(index * 50).springify()}>
        <Pressable
          style={[s.alertRow, { borderBottomColor: tc.glass.border }, !item.read && { backgroundColor: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)" }]}
          onPressIn={() => { scale.value = withSpring(0.98, { damping: 20 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
          onPress={() => { markRead(item.id); router.push(`/lineage/${item.mint}`); }}
        >
          <Animated.View style={pressStyle}>
            <View style={s.alertInner}>
              <TokenImage uri={item.token_image} size={44} symbol={item.token_name} borderRadius={12} />
              <View style={s.alertContent}>
                <View style={s.alertTopRow}>
                  <View style={[s.alertTypeChip, { backgroundColor: `${color}1A`, borderColor: `${color}44` }]}>
                    <Text style={[s.alertTypeText, { color }]}>{ALERT_LABELS[item.type]}</Text>
                  </View>
                  <Text style={[s.alertTime, { color: tc.text.muted }]}>{formatRelative(item.timestamp)}</Text>
                </View>
                <Text style={[s.alertName, { color: tc.text.primary }]} numberOfLines={1}>{item.token_name}</Text>
                <Text style={[s.alertMsg, { color: tc.text.muted }]} numberOfLines={2}>{item.message}</Text>
                <RiskBadge label={riskLevel.toUpperCase()} riskLevel={riskLevel} size="sm" />
              </View>
              {!item.read && <View style={[s.unreadDot, { backgroundColor: tc.accent.safe }]} />}
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeableRow>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const qc = useQueryClient();
  const { colors: tc } = useTheme();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["global-stats"],
    queryFn: getGlobalStats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Animated.View entering={FadeInDown.delay(0).springify()}>
        <GlassCard style={s.statsCard}>
          <StatsBarSkeleton />
        </GlassCard>
      </Animated.View>
    );
  }
  if (isError || !data) {
    return (
      <Animated.View entering={FadeInDown.delay(0).springify()}>
        <GlassCard style={s.statsCard}>
          <TouchableOpacity onPress={() => qc.invalidateQueries({ queryKey: ["global-stats"] })}>
            <Text style={[s.errorRetry, { color: tc.accent.warning }]}>⚠ Failed to load — tap to retry</Text>
          </TouchableOpacity>
        </GlassCard>
      </Animated.View>
    );
  }

  const rugRate = data.rug_rate_24h_pct;
  return (
    <Animated.View entering={FadeInDown.delay(0).springify()}>
      <GlassCard style={s.statsCard}>
        <View style={s.statItem}>
          <AnimatedNumber value={data.total_scanned_24h ?? data.tokens_scanned_24h ?? 0} fontSize={20} fontWeight="700" />
          <Text style={[s.statLabel, { color: tc.text.muted }]}>Scanned 24h</Text>
        </View>
        <View style={[s.statsDivider, { backgroundColor: tc.glass.border }]} />
        <View style={s.statItem}>
          <View style={s.statValueRow}>
            <AnimatedNumber value={data.rug_count_24h ?? data.tokens_rugged_24h ?? 0} fontSize={20} fontWeight="700" color={tc.accent.danger} />
            {rugRate !== undefined && rugRate > 0 && (
              <Text style={[s.rugRateBadge, { color: tc.accent.danger, backgroundColor: `${tc.accent.danger}18` }]}>↑ {rugRate.toFixed(1)}%</Text>
            )}
          </View>
          <Text style={[s.statLabel, { color: tc.text.muted }]}>Rugs 24h</Text>
        </View>
        <View style={[s.statsDivider, { backgroundColor: tc.glass.border }]} />
        <View style={s.statItem}>
          <AnimatedNumber value={data.active_deployers_24h ?? 0} fontSize={20} fontWeight="700" />
          <Text style={[s.statLabel, { color: tc.text.muted }]}>Deployers</Text>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── AI Brief Card ────────────────────────────────────────────────────────────

function AIBriefCard() {
  const { colors: tc } = useTheme();
  const pulse = useSharedValue(0.6);
  const borderOpacity = useSharedValue(0.25);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stats-brief"],
    queryFn: getStatsBrief,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1200 }), withTiming(0.6, { duration: 1200 })), -1, false);
    borderOpacity.value = withRepeat(withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.15, { duration: 2000 })), -1, false);
  }, []);

  const orbStyle = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.9 + pulse.value * 0.1 }] }));

  const updatedLabel = data?.generated_at
    ? (() => { const m = Math.round((Date.now() - new Date(data.generated_at).getTime()) / 60_000); return m < 1 ? "Just now" : `${m}m ago`; })()
    : null;

  const briefText = data?.summary ?? data?.text ?? "";
  const words = briefText.split(" ");

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <GlassCard elevated style={s.aiBrief}>
        {/* Gradient border top */}
        <LinearGradient colors={["#622EC3", "#53E9F6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.aiBriefGradientBar} />
        <View style={s.aiBriefHeader}>
          <Animated.View style={[s.aiOrb, orbStyle]} />
          <Text style={[s.aiBriefTitle, { color: tc.accent.aiLight }]}>AI Intelligence Brief</Text>
          {updatedLabel && <Text style={[s.aiBriefTime, { color: tc.text.muted }]}>Updated {updatedLabel}</Text>}
        </View>
        {isLoading && <AIBriefSkeleton />}
        {isError && (
          <View style={s.briefError}>
            <Text style={[s.briefErrorText, { color: tc.text.muted }]}>Failed to load brief</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[s.briefRetryText, { color: tc.accent.ai }]}>Retry →</Text>
            </TouchableOpacity>
          </View>
        )}
        {data && briefText.trim().length > 0 ? (
          <View style={s.briefWordsRow}>
            {words.map((word: string, i: number) => (
              <Animated.Text key={`${word}-${i}`} entering={FadeInDown.delay(i * 20).duration(160)} style={[s.aiBriefWord, { color: tc.text.secondary }]}>
                {word}{" "}
              </Animated.Text>
            ))}
          </View>
        ) : data && !isLoading ? (
          <Text style={[s.briefEmptyText, { color: tc.text.muted }]}>No market intelligence available right now.</Text>
        ) : null}
        <TouchableOpacity
          style={s.aiBriefCta}
          onPress={() => {
            const firstMint = useAlertsStore.getState().alerts[0]?.mint;
            if (firstMint) router.push(`/chat/${firstMint}`);
            else router.push("/(tabs)/search");
          }}
        >
          <Text style={[s.aiBriefCtaText, { color: tc.accent.ai }]}>Ask AI →</Text>
        </TouchableOpacity>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeFeedScreen() {
  const { colors: tc } = useTheme();
  const alerts = useAlertsStore((s) => s.alerts);
  const unreadCount = useAlertsStore((s) => s.unreadCount);
  const [refreshing, setRefreshing] = React.useState(false);
  const qc = useQueryClient();
  const wsState = useWsState();
  const { newCount, clearNewAlerts } = useNewAlerts();
  const scrollRef = useRef<ScrollView>(null);

  const bellScale = useSharedValue(1);
  const prevUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      bellScale.value = withSequence(withSpring(1.35, { damping: 8 }), withSpring(1, { damping: 12 }));
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ scale: bellScale.value }] }));

  const wsColor = wsState === "connected" ? tc.accent.safe : wsState === "reconnecting" ? tc.accent.warning : tc.text.muted;
  const wsLabel = wsState === "connected" ? "LIVE" : wsState === "reconnecting" ? "RECONNECTING" : "OFFLINE";

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["global-stats"] }),
      qc.invalidateQueries({ queryKey: ["stats-brief"] }),
    ]);
    setRefreshing(false);
    toast.success("Updated just now");
  }, [qc]);

  const MAX_ALERTS = 50;
  const groups = groupAlertsByTime(alerts.slice(0, MAX_ALERTS));

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.background.deep }]} edges={["top"]}>
      {/* ── Header (Figma Make RadarScreen) ─────────────────── */}
      <View style={s.headerRow}>
        <View>
          <View style={s.headerTitleRow}>
            <View style={s.iconWrap}>
              <Ionicons name="pulse" size={26} color={aurora.secondary} />
              <View style={[s.iconGlow, { backgroundColor: aurora.secondary }]} />
            </View>
            <Text style={[s.headerTitle, { color: tc.text.primary }]}>Radar Feed</Text>
          </View>
          <Text style={[s.headerSubtitle, { color: `${aurora.secondary}B3` }]}>
            Real-time Solana intelligence
          </Text>
        </View>
        <View style={[s.liveChip, { backgroundColor: `${wsColor}1A`, borderColor: `${wsColor}33` }]}>
          <Animated.View style={bellStyle}>
            <View style={[s.liveDot, { backgroundColor: wsColor }]} />
          </Animated.View>
          <Text style={[s.liveText, { color: wsColor }]}>
            {wsState === "connected" ? `${alerts.length} LIVE` : wsLabel}
          </Text>
        </View>
      </View>

      <WsStatusBar state={wsState} />

      {/* ── Quick Actions (Figma Make) ─────────────────────────── */}
      <View style={s.quickActions}>
        <TouchableOpacity style={[s.quickAction, { backgroundColor: `${aurora.secondary}1E` }]} onPress={() => router.push("/(tabs)/search")} activeOpacity={0.7}>
          <Ionicons name="search-outline" size={18} color={aurora.secondary} />
          <Text style={s.quickActionLabel}>Scan Token</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.quickAction, { backgroundColor: `${aurora.accent}1E` }]} activeOpacity={0.7}>
          <Ionicons name="skull-outline" size={18} color={aurora.accent} />
          <Text style={s.quickActionLabel}>Death Clock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.quickAction, { backgroundColor: "rgba(0,255,136,0.12)" }]} onPress={() => router.push("/(tabs)/alerts")} activeOpacity={0.7}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#00FF88" />
          <Text style={s.quickActionLabel}>Protection</Text>
        </TouchableOpacity>
      </View>

      {/* ── Feed ───────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tc.accent.cyan} />}>

          <Text style={[s.sectionLabel, { color: tc.text.muted }]}>LIVE STATS</Text>
          <StatsBar />

          <Text style={[s.sectionLabel, { color: tc.text.muted }]}>INTEL BRIEF</Text>
          <AIBriefCard />

          <View style={s.sectionRow}>
            <Text style={[s.sectionLabel, { color: tc.text.muted, marginTop: 0, marginBottom: 0 }]}>THREAT FEED</Text>
            {alerts.length > MAX_ALERTS && (
              <TouchableOpacity onPress={() => router.push("/(tabs)/alerts")}>
                <Text style={[s.seeAllText, { color: tc.accent.safe }]}>See all →</Text>
              </TouchableOpacity>
            )}
          </View>
          <GlassCard style={s.alertList}>
            {alerts.length === 0 ? (
              <EmptyRadar message={wsState === "connected" ? "Monitoring all mints..." : "Connect to receive live alerts"} />
            ) : (
              groups.map((group) => (
                <View key={group.label}>
                  <TimeSectionHeader label={group.label} />
                  {group.items.map((alert, i) => <AlertRow key={alert.id} item={alert} index={i} />)}
                </View>
              ))
            )}
          </GlassCard>
        </ScrollView>

        <NewAlertsBanner count={newCount} onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); clearNewAlerts(); }} />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header (Figma Make RadarScreen)
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  iconWrap: { width: 30, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  iconGlow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, opacity: 0.3 },
  headerTitle: { fontFamily: Fonts.bold, fontSize: 26, letterSpacing: -0.5 },
  headerSubtitle: { fontFamily: Fonts.regular, fontSize: 12, marginLeft: 42 },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: Fonts.bold, fontSize: 10, letterSpacing: 1 },
  // Quick Actions
  quickActions: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginTop: 6, marginBottom: 14 },
  quickAction: { flex: 1, paddingVertical: 14, alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  quickActionLabel: { fontFamily: Fonts.medium, fontSize: 10, color: "rgba(255,255,255,0.7)" },

  // Feed layout
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionLabel: { fontFamily: Fonts.bold, fontSize: 10, letterSpacing: 1.8, marginTop: 22, marginBottom: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
  seeAllText: { fontFamily: Fonts.semiBold, fontSize: 12 },

  // Stats card
  statsCard: { flexDirection: "row", alignItems: "center", paddingVertical: 18, paddingHorizontal: 20 },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statLabel: { fontFamily: Fonts.medium, fontSize: 10 },
  statsDivider: { width: 1, height: 38, alignSelf: "center" },
  rugRateBadge: { fontFamily: Fonts.semiBold, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  errorRetry: { fontFamily: Fonts.medium, fontSize: 12, textAlign: "center", paddingVertical: 10 },

  // AI Brief
  aiBrief: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 16, overflow: "hidden" },
  aiBriefGradientBar: { height: 2, marginHorizontal: -18, marginBottom: 12 },
  aiBriefHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  aiOrb: { width: 10, height: 10, borderRadius: 5, backgroundColor: aurora.secondary },
  aiBriefTitle: { fontFamily: Fonts.semiBold, fontSize: 13, flex: 1 },
  aiBriefTime: { fontFamily: Fonts.regular, fontSize: 11 },
  briefWordsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  aiBriefWord: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 22 },
  briefError: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
  briefErrorText: { fontFamily: Fonts.regular, fontSize: 13 },
  briefRetryText: { fontFamily: Fonts.semiBold, fontSize: 13 },
  briefEmptyText: { fontFamily: Fonts.regular, fontSize: 13, fontStyle: "italic", marginBottom: 12 },
  aiBriefCta: { alignSelf: "flex-start", marginTop: 4 },
  aiBriefCtaText: { fontFamily: Fonts.semiBold, fontSize: 14 },

  // Alert list
  alertList: { overflow: "hidden" },
  alertRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  alertRowUnread: {},
  alertInner: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  alertContent: { flex: 1, gap: 5 },
  alertTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alertTypeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  alertTypeText: { fontFamily: Fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  alertTime: { fontFamily: Fonts.regular, fontSize: 10 },
  alertName: { fontFamily: Fonts.semiBold, fontSize: 13 },
  alertMsg: { fontFamily: Fonts.regular, fontSize: 11, lineHeight: 16 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});


