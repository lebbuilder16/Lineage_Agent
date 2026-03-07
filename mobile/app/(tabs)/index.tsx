// app/(tabs)/index.tsx
// Home Feed — AI Brief + Live Alert Feed + Trending Scans

import React, { useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
import { getGlobalStats, getStatsBrief } from "@/src/lib/api";
import { Fonts } from "@/src/theme/fonts";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { AlertCardSkeleton } from "@/src/components/ui/SkeletonLoader";
import { useAlertsStore } from "@/src/store/alerts";
import { colors } from "@/src/theme/colors";
import type { AlertItem } from "@/src/types/api";

// ─── AI Brief Card ────────────────────────────────────────────────────────────

function AIBriefCard() {
  const pulse = useSharedValue(0.6);
  const { data: brief, isLoading } = useQuery({
    queryKey: ["stats-brief"],
    queryFn: getStatsBrief,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0.6, { duration: 1200 })
      ),
      -1,
      false
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.9 + pulse.value * 0.1 }],
  }));

  const updatedAgo = brief?.generated_at
    ? (() => {
        const diffMs = Date.now() - new Date(brief.generated_at).getTime();
        const diffMin = Math.floor(diffMs / 60_000);
        return diffMin < 1 ? "just now" : `${diffMin}m ago`;
      })()
    : "—";

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <GlassCard elevated borderColor={`${colors.accent.ai}40`} style={styles.aiBrief}>
        <View style={styles.aiBriefHeader}>
          <Animated.View style={[styles.aiOrb, orbStyle]} />
          <Text style={styles.aiBriefTitle}>AI Intelligence Brief</Text>
          <Text style={styles.aiBriefTime}>Updated {updatedAgo}</Text>
        </View>
        {isLoading || !brief ? (
          <View style={styles.aiBriefSkeleton} />
        ) : (
          <Text style={styles.aiBriefText}>{brief.text}</Text>
        )}
        <TouchableOpacity
          style={styles.aiBriefCta}
          onPress={() => router.push("/chat/latest")}
        >
          <Text style={styles.aiBriefCtaText}>Ask AI →</Text>
        </TouchableOpacity>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Live Alert Item ──────────────────────────────────────────────────────────

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

function AlertRow({ item, index }: { item: AlertItem; index: number }) {
  const color = ALERT_COLORS[item.type];
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <TouchableOpacity
        style={styles.alertRow}
        onPress={() => router.push(`/lineage/${item.mint}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.alertDot, { backgroundColor: color }]} />
        <TokenImage uri={item.token_image} size={32} symbol={item.token_name} borderRadius={8} />
        <View style={styles.alertContent}>
          <Text style={styles.alertName} numberOfLines={1}>
            {item.token_name}
          </Text>
          <Text style={styles.alertMsg} numberOfLines={1}>
            {item.message}
          </Text>
        </View>
        <RiskBadge label={ALERT_LABELS[item.type]} riskLevel={item.type === "rug" || item.type === "death_clock" ? "critical" : "medium"} size="sm" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const { data } = useQuery({
    queryKey: ["global-stats"],
    queryFn: getGlobalStats,
    refetchInterval: 60_000,
  });

  if (!data) return null;

  return (
    <View style={styles.statsBar}>
      <StatItem label="Scanned 24h" value={data.tokens_scanned_24h.toString()} />
      <View style={styles.statsDivider} />
      <StatItem label="Rugs 24h" value={data.tokens_rugged_24h.toString()} danger />
      <View style={styles.statsDivider} />
      <StatItem label="Active deployers" value={data.active_deployers_24h.toString()} />
    </View>
  );
}

function StatItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, danger && { color: colors.accent.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeFeedScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lineage Agent</Text>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Pressable
          style={styles.headerSearch}
          onPress={() => router.push("/(tabs)/search")}
        >
          <Text style={styles.headerSearchText}>⌕  Search tokens…</Text>
        </Pressable>
      </View>

      <ScrollView
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
        <StatsBar />

        {/* AI Brief */}
        <Text style={styles.sectionTitle}>Intelligence Brief</Text>
        <AIBriefCard />

        {/* Live Alert Feed */}
        <Text style={styles.sectionTitle}>Live Alerts</Text>
        <GlassCard style={styles.alertList}>
          {alerts.length === 0 ? (
            <>
              <AlertCardSkeleton />
              <AlertCardSkeleton />
              <AlertCardSkeleton />
            </>
          ) : (
            alerts.slice(0, 20).map((alert, i) => (
              <AlertRow key={alert.id} item={alert} index={i} />
            ))
          )}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },
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
    fontFamily: Fonts.bold,
    letterSpacing: -0.5,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.safe,
  },
  liveText: {
    color: colors.accent.safe,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerSearch: {
    flex: 1,
    marginLeft: 16,
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerSearchText: { color: colors.text.muted, fontSize: 14 },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  statItem: { alignItems: "center" },
  statValue: { color: colors.text.primary, fontSize: 18, fontFamily: Fonts.bold },
  statLabel: { color: colors.text.muted, fontSize: 10, marginTop: 2 },
  statsDivider: { width: 1, backgroundColor: colors.glass.border },
  aiBrief: { padding: 16, marginBottom: 4 },
  aiBriefHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  aiOrb: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.ai,
    marginRight: 8,
  },
  aiBriefTitle: {
    color: colors.accent.ai,
    fontSize: 13,
    fontFamily: Fonts.bold,
    flex: 1,
  },
  aiBriefTime: { color: colors.text.muted, fontSize: 11 },
  aiBriefText: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  aiBriefCta: { alignSelf: "flex-start" },
  aiBriefCtaText: { color: colors.accent.ai, fontSize: 14, fontWeight: "600" },
  aiBriefSkeleton: {
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.glass.bg,
    marginBottom: 12,
  },
  alertList: { overflow: "hidden" },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
    gap: 10,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertContent: { flex: 1 },
  alertName: { color: colors.text.primary, fontSize: 13, fontWeight: "600" },
  alertMsg: { color: colors.text.muted, fontSize: 11, marginTop: 2 },
});
