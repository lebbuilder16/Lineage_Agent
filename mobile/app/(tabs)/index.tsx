// app/(tabs)/index.tsx
// Home Feed — Header contextuel + Stats animées + AI Brief dynamique + Live Alerts groupées

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
import { colors, riskLevelFromScore } from "@/src/theme/colors";
import { toast } from "@/src/lib/toast";
import type { AlertItem } from "@/src/types/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Fallbacks quand risk_score absent (valeurs 0.0–1.0)
const RISK_FALLBACK: Record<AlertItem["type"], number> = {
  rug: 0.95,
  death_clock: 0.9,
  bundle: 0.7,
  insider: 0.65,
  zombie: 0.6,
};

// ─── Alert Row ────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<AlertItem["type"], string> = {
  rug: colors.accent.danger,
  bundle: colors.accent.warning,
  insider: colors.accent.warning,
  zombie: "#C084FC",
  death_clock: colors.accent.danger,
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

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
      <Animated.View
        entering={isNew ? FadeInLeft.springify() : FadeInDown.delay(index * 50).springify()}
      >
        <Pressable
          style={[styles.alertRow, !item.read && styles.alertRowUnread]}
          onPressIn={() => { scale.value = withSpring(0.98, { damping: 20 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
          onPress={() => {
            markRead(item.id);
            router.push(`/lineage/${item.mint}`);
          }}
        >
          <Animated.View style={pressStyle}>
            <View style={styles.alertInner}>
              <TokenImage uri={item.token_image} size={44} symbol={item.token_name} borderRadius={10} />
              <View style={styles.alertContent}>
                <View style={styles.alertTopRow}>
                  <View style={[styles.alertTypeChip, { backgroundColor: `${color}20`, borderColor: `${color}40` }]}>
                    <Text style={[styles.alertTypeText, { color }]}>{ALERT_LABELS[item.type]}</Text>
                  </View>
                  <Text style={styles.alertTime}>{formatRelative(item.timestamp)}</Text>
                </View>
                <Text style={styles.alertName} numberOfLines={1}>{item.token_name}</Text>
                <Text style={styles.alertMsg} numberOfLines={2}>{item.message}</Text>
                <RiskBadge label={riskLevel.toUpperCase()} riskLevel={riskLevel} size="sm" />
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeableRow>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["global-stats"],
    queryFn: getGlobalStats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.statsCard}>
        <StatsBarSkeleton />
      </Animated.View>
    );
  }

  if (isError || !data) {
    return (
      <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.statsCard}>
        <TouchableOpacity
          onPress={() => queryClient.invalidateQueries({ queryKey: ["global-stats"] })}
        >
          <Text style={styles.errorRetry}>⚠ Failed to load stats — tap to retry</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const rugRate = data.rug_rate_24h_pct;

  return (
    <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.statsCard}>
      <View style={styles.statItem}>
        <AnimatedNumber
          value={data.total_scanned_24h ?? 0}
          fontSize={18}
          fontWeight="700"
        />
        <Text style={styles.statLabel}>Scanned 24h</Text>
      </View>
      <View style={styles.statsDivider} />
      <View style={styles.statItem}>
        <View style={styles.statValueRow}>
          <AnimatedNumber
            value={data.rug_count_24h ?? 0}
            fontSize={18}
            fontWeight="700"
            color={colors.accent.danger}
          />
          {rugRate !== undefined && rugRate > 0 && (
            <Text style={styles.rugRateBadge}>↑ {rugRate.toFixed(1)}%</Text>
          )}
        </View>
        <Text style={styles.statLabel}>Rugs 24h</Text>
      </View>
      <View style={styles.statsDivider} />
      <View style={styles.statItem}>
        <AnimatedNumber
          value={data.active_deployers_24h ?? 0}
          fontSize={18}
          fontWeight="700"
        />
        <Text style={styles.statLabel}>Deployers</Text>
      </View>
    </Animated.View>
  );
}

// ─── AI Brief Card ────────────────────────────────────────────────────────────

function AIBriefCard() {
  const pulse = useSharedValue(0.6);
  const borderOpacity = useSharedValue(0.25);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stats-brief"],
    queryFn: getStatsBrief,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200 }), withTiming(0.6, { duration: 1200 })),
      -1,
      false
    );
    borderOpacity.value = withRepeat(
      withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.15, { duration: 2000 })),
      -1,
      false
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.9 + pulse.value * 0.1 }],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(155, 89, 247, ${borderOpacity.value})`,
  }));

  const updatedLabel = data?.generated_at
    ? (() => {
        const diff = Date.now() - new Date(data.generated_at).getTime();
        const m = Math.round(diff / 60_000);
        return m < 1 ? "Just now" : `${m}m ago`;
      })()
    : null;

  const words = data?.summary?.split(" ") ?? [];

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <Animated.View style={borderStyle}>
        <GlassCard elevated style={styles.aiBrief}>
          <View style={styles.aiBriefHeader}>
            <Animated.View style={[styles.aiOrb, orbStyle]} />
            <Text style={styles.aiBriefTitle}>AI Intelligence Brief</Text>
            {updatedLabel && (
              <Text style={styles.aiBriefTime}>Updated {updatedLabel}</Text>
            )}
          </View>

          {isLoading && <AIBriefSkeleton />}

          {isError && (
            <View style={styles.briefError}>
              <Text style={styles.briefErrorText}>Failed to load brief</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={styles.briefRetryText}>Retry →</Text>
              </TouchableOpacity>
            </View>
          )}

          {data && (
            <View style={styles.briefWordsRow}>
              {words.map((word, i) => (
                <Animated.Text
                  key={`${word}-${i}`}
                  entering={FadeInDown.delay(i * 25).duration(180)}
                  style={styles.aiBriefWord}
                >
                  {word}{" "}
                </Animated.Text>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.aiBriefCta}
            onPress={() => router.push("/chat/latest")}
          >
            <Text style={styles.aiBriefCtaText}>Ask AI →</Text>
          </TouchableOpacity>
        </GlassCard>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeFeedScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const unreadCount = useAlertsStore((s) => s.unreadCount);
  const [refreshing, setRefreshing] = React.useState(false);
  const queryClient = useQueryClient();
  const wsState = useWsState();
  const { newCount, clearNewAlerts } = useNewAlerts();
  const scrollRef = useRef<ScrollView>(null);

  // Badge bell pop animation
  const bellScale = useSharedValue(1);
  const prevUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      bellScale.value = withSequence(
        withSpring(1.35, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ scale: bellScale.value }] }));

  // Dot WS color
  const wsColor =
    wsState === "connected" ? colors.accent.safe :
    wsState === "reconnecting" ? colors.accent.warning :
    colors.text.muted;
  const wsLabel =
    wsState === "connected" ? "LIVE" :
    wsState === "reconnecting" ? "RECONNECTING" :
    "OFFLINE";

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["stats-brief"] }),
    ]);
    setRefreshing(false);
    toast.success("Updated just now");
  }, [queryClient]);

  const groups = groupAlertsByTime(alerts.slice(0, 20));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lineage Agent</Text>
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: wsColor }]} />
            <Text style={[styles.liveText, { color: wsColor }]}>{wsLabel}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerSearch}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Text style={styles.headerSearchText}>⌕  Search tokens…</Text>
          </Pressable>
          <Animated.View style={bellStyle}>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(tabs)/alerts");
              }}
            >
              <Text style={styles.bellIcon}>◎</Text>
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* WS Status bar */}
      <WsStatusBar state={wsState} />

      {/* Feed */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent.safe}
            />
          }
        >
          {/* Stats */}
          <Text style={styles.sectionTitle}>Market Overview</Text>
          <StatsBar />

          {/* AI Brief */}
          <Text style={styles.sectionTitle}>Intelligence Brief</Text>
          <AIBriefCard />

          {/* Live Alerts */}
          <Text style={styles.sectionTitle}>Live Alerts</Text>
          <GlassCard style={styles.alertList}>
            {alerts.length === 0 ? (
              <EmptyRadar
                message={
                  wsState === "connected"
                    ? "Monitoring all mints..."
                    : "Connect to receive live alerts"
                }
              />
            ) : (
              groups.map((group) => (
                <View key={group.label}>
                  <TimeSectionHeader label={group.label} />
                  {group.items.map((alert, i) => (
                    <AlertRow key={alert.id} item={alert} index={i} />
                  ))}
                </View>
              ))
            )}
          </GlassCard>
        </ScrollView>

        {/* New alerts banner (absolue, z-index élevé) */}
        <NewAlertsBanner
          count={newCount}
          onPress={() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            clearNewAlerts();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginLeft: 12 },
  headerSearch: {
    flex: 1,
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerSearchText: { color: colors.text.muted, fontSize: 14 },
  bellBtn: { padding: 6, position: "relative" },
  bellIcon: { color: colors.text.secondary, fontSize: 20 },
  bellBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: colors.accent.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  bellBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },

  // Stats
  statsCard: {
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: { color: colors.text.muted, fontSize: 10, marginTop: 3, textAlign: "center" },
  statsDivider: { width: 1, height: 36, backgroundColor: colors.glass.border, alignSelf: "center" },
  rugRateBadge: {
    color: colors.accent.danger,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: `${colors.accent.danger}18`,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  errorRetry: {
    color: colors.accent.warning,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },

  // AI Brief
  aiBrief: { padding: 16, marginBottom: 4 },
  aiBriefHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  aiOrb: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.ai,
    marginRight: 8,
  },
  aiBriefTitle: { color: colors.accent.ai, fontSize: 13, fontWeight: "700", flex: 1 },
  aiBriefTime: { color: colors.text.muted, fontSize: 11 },
  briefWordsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  aiBriefWord: { color: colors.text.secondary, fontSize: 14, lineHeight: 22 },
  briefError: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
  briefErrorText: { color: colors.text.muted, fontSize: 13 },
  briefRetryText: { color: colors.accent.ai, fontSize: 13, fontWeight: "600" },
  aiBriefCta: { alignSelf: "flex-start" },
  aiBriefCtaText: { color: colors.accent.ai, fontSize: 14, fontWeight: "600" },

  // Alert list
  alertList: { overflow: "hidden" },
  alertRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
  },
  alertRowUnread: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  alertInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  alertContent: { flex: 1, gap: 4 },
  alertTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alertTypeChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alertTypeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  alertTime: { color: colors.text.muted, fontSize: 10 },
  alertName: { color: colors.text.primary, fontSize: 13, fontWeight: "600" },
  alertMsg: { color: colors.text.muted, fontSize: 11, lineHeight: 16 },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent.safe,
    marginTop: 6,
  },
});
