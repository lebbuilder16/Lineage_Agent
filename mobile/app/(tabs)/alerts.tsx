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
import { Ionicons } from "@expo/vector-icons";
import { useAlertsStore } from "@/src/store/alerts";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { useTheme } from "@/src/theme/ThemeContext";
import { Fonts } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import type { AlertItem } from "@/src/types/api";

function typeColor(type: AlertItem["type"], colors: ReturnType<typeof useTheme>["colors"]): string {
  switch (type) {
    case "rug":
    case "death_clock": return colors.accent.danger;
    case "bundle":
    case "insider":     return colors.accent.warning;
    case "zombie":      return colors.accent.aiLight;
    default:            return colors.text.muted;
  }
}

const TYPE_ICON: Record<AlertItem["type"], string> = {
  rug: "💀", bundle: "📦", insider: "👁", zombie: "🧟", death_clock: "⏳",
};

function getSeverity(type: AlertItem["type"]): "critical" | "high" | "medium" {
  if (type === "rug" || type === "death_clock") return "critical";
  if (type === "bundle" || type === "insider") return "high";
  return "medium";
}

function severityColor(severity: "critical" | "high" | "medium"): string {
  switch (severity) {
    case "critical": return "#FF3366";
    case "high": return "#FF9933";
    default: return "#00FF88";
  }
}

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
  const { colors } = useTheme();
  if (active) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected: true }}
        accessibilityLabel={`Filter by ${label}`}
      >
        <LinearGradient
          colors={["#622EC3", "#4D65DB", "#379AEE", "#53E9F6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chipActive}
        >
          <Text style={[styles.chipText, styles.chipTextActive]}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.chip, { borderColor: colors.glass.border, backgroundColor: colors.glass.bg }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: false }}
      accessibilityLabel={`Filter by ${label}`}
    >
      <Text style={[styles.chipText, { color: colors.text.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const AlertCard = React.memo(function AlertCard({ item, index }: { item: AlertItem; index: number }) {
  const { colors } = useTheme();
  const severity = getSeverity(item.type);
  const sevColor = severityColor(severity);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).springify()}>
      <TouchableOpacity
        style={[
          styles.alertCard,
          {
            borderBottomColor: colors.glass.border,
            backgroundColor: !item.read ? `${sevColor}08` : "transparent",
          },
        ]}
        onPress={() => {
          useAlertsStore.getState().markRead(item.id);
          router.push(`/lineage/${item.mint}`);
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${TYPE_LABEL[item.type]} alert for ${item.token_name}${item.read ? "" : ", unread"}`}
        accessibilityHint="Opens token lineage"
      >
        <View style={[styles.severityDot, { backgroundColor: sevColor, shadowColor: sevColor }]} />
        <View style={styles.alertBody}>
          <Text style={[styles.alertToken, { color: colors.text.primary }]}>{item.token_name}</Text>
          <Text style={[styles.alertMsg, { color: colors.text.secondary }]} numberOfLines={2}>
            {item.message}
          </Text>
          <View style={styles.alertFooter}>
            <View style={[styles.alertTypeChip, { backgroundColor: `${sevColor}18`, borderColor: `${sevColor}40` }]}>
              <Text style={[styles.alertType, { color: sevColor }]}>{TYPE_LABEL[item.type]}</Text>
            </View>
            <Text style={[styles.alertTime, { color: colors.text.muted }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>
        {!item.read && <View style={[styles.unreadBadge, { backgroundColor: colors.accent.cyan }]} />}
      </TouchableOpacity>
    </Animated.View>
  );
});

type FilterType = "all" | "critical" | "high" | "medium";

const SEVERITY_TYPE_MAP: Record<string, AlertItem["type"][]> = {
  critical: ["rug", "death_clock"],
  high: ["bundle", "insider"],
  medium: ["zombie"],
};

export default function AlertsScreen() {
  const { colors } = useTheme();
  const { alerts, unreadCount, markAllRead } = useAlertsStore();
  const [filter, setFilter] = React.useState<FilterType>("all");

  const filtered = filter === "all" ? alerts : alerts.filter((a) => (SEVERITY_TYPE_MAP[filter] ?? []).includes(a.type));

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<AlertItem>) => (
      <AlertCard item={item} index={index} />
    ),
    []
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.deep }]} edges={["top"]}>
      {/* Header (Figma Make AlertsScreen) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications" size={26} color="#ADC8FF" />
            <View style={styles.iconGlow} />
          </View>
          <Text style={[styles.title, { color: colors.text.primary }]}>Alerts</Text>
        </View>
        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>ACTIVE</Text>
        </View>
      </View>
      <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.6)" }]}>
        Real-time network threat monitoring
      </Text>
      {unreadCount > 0 && (
        <View style={styles.markReadRow}>
          <HapticButton
            label="Mark all read"
            variant="ghost"
            size="sm"
            onPress={markAllRead}
          />
        </View>
      )}

      {/* Filter chips (Figma Make severity) */}
      <View style={styles.filters}>
        {(["all", "critical", "high", "medium"] as FilterType[]).map((f) => (
          <AlertFilterChip
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
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
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No alerts yet</Text>
            <Text style={[styles.emptySub, { color: colors.text.muted }]}>
              Add tokens to your watchlist to start receiving alerts
            </Text>
            <HapticButton
              label="Go to Watchlist"
              variant="ghost"
              size="sm"
              onPress={() => router.push("/(tabs)/watchlist")}
              style={{ marginTop: 16 }}
            />
          </Animated.View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 30, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  iconGlow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, backgroundColor: "#ADC8FF", opacity: 0.3 },
  title: { fontFamily: Fonts.bold, fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontFamily: Fonts.regular, fontSize: 12, paddingHorizontal: 20, marginBottom: 14 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00FF88", shadowColor: "#00FF88", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
  activeText: { fontFamily: Fonts.bold, fontSize: 10, color: "#FFFFFF", letterSpacing: 1 },
  markReadRow: { paddingHorizontal: 20, paddingBottom: 6, alignItems: "flex-end" },
  filters: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipActive: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontFamily: Fonts.semiBold, fontSize: 12, letterSpacing: 0.3 },
  chipTextActive: { color: "#FFFFFF" },
  list: { paddingBottom: 110 },
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    gap: 16,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  alertBody: { flex: 1, gap: 4 },
  alertFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  alertTypeChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  alertType: { fontFamily: Fonts.bold, fontSize: 10, letterSpacing: 0.5 },
  alertTime: { fontSize: 11 },
  alertToken: { fontFamily: Fonts.semiBold, fontSize: 14 },
  alertMsg: { fontSize: 12, lineHeight: 17 },
  unreadBadge: { width: 8, height: 8, borderRadius: 4, alignSelf: "flex-start", marginTop: 6 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 18 },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: 18 },
  emptySub: { fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 20 },
});
