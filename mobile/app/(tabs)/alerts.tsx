// app/(tabs)/alerts.tsx
// Notification Center — historique des alertes push reçues

import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useAlertsStore } from "@/src/store/alerts";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { colors } from "@/src/theme/colors";
import type { AlertItem } from "@/src/types/api";

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

function AlertFilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AlertCard({ item, index }: { item: AlertItem; index: number }) {
  const color = TYPE_COLOR[item.type];
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <TouchableOpacity
        style={[styles.alertCard, !item.read && styles.alertCardUnread]}
        onPress={() => {
          useAlertsStore.getState().markRead(item.id);
          router.push(`/lineage/${item.mint}`);
        }}
        activeOpacity={0.75}
      >
        <View style={[styles.alertIcon, { backgroundColor: `${color}20` }]}>
          <View style={[styles.alertDot, { backgroundColor: color }]} />
        </View>
        <View style={styles.alertBody}>
          <View style={styles.alertHeader}>
            <Text style={[styles.alertType, { color }]}>{TYPE_LABEL[item.type]}</Text>
            <Text style={styles.alertTime}>
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Text style={styles.alertToken}>{item.token_name}</Text>
          <Text style={styles.alertMsg} numberOfLines={2}>
            {item.message}
          </Text>
        </View>
        {!item.read && <View style={styles.unreadBadge} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

type FilterType = "all" | AlertItem["type"];

export default function AlertsScreen() {
  const { alerts, unreadCount, markAllRead, clearAll } = useAlertsStore();
  const [filter, setFilter] = React.useState<FilterType>("all");

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.type === filter);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<AlertItem>) => (
      <AlertCard item={item} index={index} />
    ),
    []
  );

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
          <HapticButton
            label="Mark all read"
            variant="ghost"
            size="sm"
            onPress={markAllRead}
          />
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filters}>
        {(["all", "rug", "bundle", "insider", "zombie"] as FilterType[]).map((f) => (
          <AlertFilterChip
            key={f}
            label={f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Animated.View entering={FadeIn} style={styles.empty}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptySub}>
              Add tokens to your watchlist to start receiving alerts
            </Text>
          </Animated.View>
        }
      />
    </SafeAreaView>
  );
}

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
  filters: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.glass.border,
    backgroundColor: colors.glass.bg,
  },
  chipActive: {
    borderColor: colors.accent.safe,
    backgroundColor: `${colors.accent.safe}20`,
  },
  chipText: { color: colors.text.muted, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.accent.safe },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  alertCard: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
    gap: 12,
  },
  alertCardUnread: { backgroundColor: "rgba(255,255,255,0.02)" },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  alertDot: { width: 12, height: 12, borderRadius: 6 },
  alertBody: { flex: 1 },
  alertHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alertType: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  alertTime: { color: colors.text.muted, fontSize: 11 },
  alertToken: { color: colors.text.primary, fontSize: 14, fontWeight: "600", marginTop: 4 },
  alertMsg: { color: colors.text.secondary, fontSize: 12, marginTop: 3, lineHeight: 17 },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.safe,
    alignSelf: "center",
  },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: colors.text.primary, fontSize: 18, fontWeight: "600" },
  emptySub: { color: colors.text.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
});
