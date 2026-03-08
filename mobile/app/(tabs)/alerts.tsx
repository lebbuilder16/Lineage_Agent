// app/(tabs)/alerts.tsx
// Notification Center — alertes avec filtres animés, swipe, TokenImage, risk_score

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ListRenderItemInfo,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { useAlertsStore } from "@/src/store/alerts";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { SwipeableRow } from "@/src/components/ui/SwipeableRow";
import { EmptyRadar } from "@/src/components/ui/EmptyRadar";
import { colors, riskLevelFromScore } from "@/src/theme/colors";
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

const RISK_FALLBACK: Record<AlertItem["type"], number> = {
  rug: 0.95,
  death_clock: 0.9,
  bundle: 0.7,
  insider: 0.65,
  zombie: 0.6,
};

const TYPE_COLOR: Record<AlertItem["type"], string> = {
  rug: colors.accent.danger,
  bundle: colors.accent.warning,
  insider: colors.accent.warning,
  zombie: "#C084FC",
  death_clock: colors.accent.danger,
};

const TYPE_LABEL: Record<AlertItem["type"], string> = {
  rug: "RUG CONFIRMED",
  bundle: "BUNDLE DETECTED",
  insider: "INSIDER SELL",
  zombie: "ZOMBIE TOKEN",
  death_clock: "DEATH CLOCK",
};

// ─── Filter Chip ──────────────────────────────────────────────────────────────

type FilterType = "all" | AlertItem["type"];

const FILTER_DISPLAY: Record<FilterType, string> = {
  all: "All",
  rug: "Rug",
  bundle: "Bundle",
  insider: "Insider",
  zombie: "Zombie",
  death_clock: "Death Clock",
};

function AlertFilterChip({
  filterType,
  active,
  count,
  onPress,
}: {
  filterType: FilterType;
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: active ? `${colors.accent.safe}20` : colors.glass.bg,
    borderColor: active ? colors.accent.safe : colors.glass.border,
  }));

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.92, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={[styles.chip, chipStyle]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {FILTER_DISPLAY[filterType]}
        </Text>
        {count > 0 && filterType !== "all" && (
          <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
            <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>
              {count}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ item, index }: { item: AlertItem; index: number }) {
  const color = TYPE_COLOR[item.type];
  const score = item.risk_score ?? RISK_FALLBACK[item.type];
  const riskLevel = riskLevelFromScore(score);
  const markRead = useAlertsStore((s) => s.markRead);

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <SwipeableRow
      onSwipeRight={() => {
        markRead(item.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onSwipeLeft={() => {
        markRead(item.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/lineage/${item.mint}`);
      }}
      rightActionLabel="Read"
      leftActionLabel="View"
    >
      <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
        <Pressable
          style={[styles.alertCard, !item.read && styles.alertCardUnread]}
          onPressIn={() => { scale.value = withSpring(0.99, { damping: 20 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
          onPress={() => {
            markRead(item.id);
            router.push(`/lineage/${item.mint}`);
          }}
        >
          <Animated.View style={[styles.alertCardInner, pressStyle]}>
            <TokenImage uri={item.token_image} size={44} symbol={item.token_name} borderRadius={10} />
            <View style={styles.alertBody}>
              <View style={styles.alertTopRow}>
                <View style={[styles.typeChip, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                  <Text style={[styles.typeChipText, { color }]}>{TYPE_LABEL[item.type]}</Text>
                </View>
                <Text style={styles.alertTime}>{formatRelative(item.timestamp)}</Text>
              </View>
              <Text style={styles.alertToken} numberOfLines={1}>{item.token_name}</Text>
              <Text style={styles.alertMsg} numberOfLines={2}>{item.message}</Text>
              <RiskBadge label={riskLevel.toUpperCase()} riskLevel={riskLevel} size="sm" />
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeableRow>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const { alerts, unreadCount, markAllRead } = useAlertsStore();
  const [filter, setFilter] = React.useState<FilterType>("all");

  const countsByType = useMemo(() => {
    const counts: Record<string, number> = { all: alerts.length };
    for (const a of alerts) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }
    return counts;
  }, [alerts]);

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.type === filter);

  const handleMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    markAllRead();
  }, [markAllRead]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<AlertItem>) => (
      <AlertCard item={item} index={index} />
    ),
    []
  );

  const filters: FilterType[] = ["all", "rug", "bundle", "insider", "zombie", "death_clock"];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Alerts</Text>
          {unreadCount > 0 && (
            <Text style={styles.unreadCount}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
        style={styles.filtersScroll}
      >
        {filters.map((f) => (
          <AlertFilterChip
            key={f}
            filterType={f}
            active={filter === f}
            count={countsByType[f] ?? 0}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          filter === "all" ? (
            <EmptyRadar message="No alerts yet — monitoring all mints" />
          ) : (
            <View style={styles.filterEmpty}>
              <Text style={styles.filterEmptyText}>
                No {FILTER_DISPLAY[filter].toLowerCase()} alerts
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },

  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { color: colors.text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  unreadCount: { color: colors.accent.danger, fontSize: 12, marginTop: 2 },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${colors.accent.safe}40`,
    backgroundColor: `${colors.accent.safe}10`,
  },
  markAllText: { color: colors.accent.safe, fontSize: 12, fontWeight: "600" },

  filtersScroll: { flexGrow: 0 },
  filtersRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  chipText: { color: colors.text.muted, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.accent.safe },
  chipBadge: {
    backgroundColor: colors.glass.bgElevated,
    borderRadius: 8,
    minWidth: 18,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  chipBadgeActive: { backgroundColor: `${colors.accent.safe}30` },
  chipBadgeText: { color: colors.text.muted, fontSize: 9, fontWeight: "700" },
  chipBadgeTextActive: { color: colors.accent.safe },

  list: { paddingBottom: 100 },

  alertCard: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
  },
  alertCardUnread: { backgroundColor: "rgba(255,255,255,0.02)" },
  alertCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  alertBody: { flex: 1, gap: 4 },
  alertTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeChipText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  alertTime: { color: colors.text.muted, fontSize: 10 },
  alertToken: { color: colors.text.primary, fontSize: 14, fontWeight: "600" },
  alertMsg: { color: colors.text.secondary, fontSize: 12, lineHeight: 17 },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent.safe,
    alignSelf: "flex-start",
    marginTop: 4,
  },

  filterEmpty: { alignItems: "center", paddingTop: 60 },
  filterEmptyText: { color: colors.text.muted, fontSize: 14 },
});
