// app/(tabs)/watchlist.tsx
// Watchlist — tokens et deployers suivis par l'utilisateur

import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown, SlideOutRight } from "react-native-reanimated";
import { getWatches, removeWatch } from "@/src/lib/api";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { colors } from "@/src/theme/colors";
import type { Watch } from "@/src/types/api";
import { useAuthStore } from "@/src/store/auth";

function WatchRow({ item, onRemove }: { item: Watch; onRemove: (id: number) => void }) {
  const isMint = !!item.mint;
  const addr = (item.mint ?? item.deployer) as string;

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={SlideOutRight}
    >
      <TouchableOpacity
        style={styles.watchRow}
        onPress={() =>
          isMint
            ? router.push(`/lineage/${addr}`)
            : router.push(`/deployer/${addr}`)
        }
        activeOpacity={0.7}
      >
        <View style={[styles.watchIcon, { backgroundColor: isMint ? `${colors.accent.safe}20` : `${colors.accent.ai}20` }]}>
          <Text style={{ fontSize: 16 }}>{isMint ? "◈" : "◉"}</Text>
        </View>
        <View style={styles.watchInfo}>
          <Text style={styles.watchLabel}>{item.label || (isMint ? "Token" : "Deployer")}</Text>
          <Text style={styles.watchAddr}>
            {addr.slice(0, 8)}…{addr.slice(-6)}
          </Text>
        </View>
        <RoleTag type={isMint ? "token" : "deployer"} />
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeTxt}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

function RoleTag({ type }: { type: "token" | "deployer" }) {
  const color = type === "token" ? colors.accent.safe : colors.accent.ai;
  return (
    <View style={[styles.roleTag, { borderColor: `${color}60`, backgroundColor: `${color}15` }]}>
      <Text style={[styles.roleText, { color }]}>{type.toUpperCase()}</Text>
    </View>
  );
}

export default function WatchlistScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();

  const { data: watches, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["watches"],
    queryFn: getWatches,
    enabled: isAuthenticated,
  });

  const removeMutation = useMutation({
    mutationFn: removeWatch,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Watch>) => (
      <WatchRow item={item} onRemove={(id) => removeMutation.mutate(id)} />
    ),
    [removeMutation]
  );

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.authGate}>
          <Text style={styles.authIcon}>☆</Text>
          <Text style={styles.authTitle}>Connect to use Watchlist</Text>
          <Text style={styles.authSub}>Track tokens and deployers, get push alerts</Text>
          <HapticButton
            label="Connect Wallet"
            onPress={() => router.push("/auth")}
            style={{ marginTop: 24 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <Text style={styles.count}>
          {watches?.length ?? 0} items
        </Text>
      </View>

      <FlatList
        data={watches ?? []}
        keyExtractor={(w) => w.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent.safe}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <Animated.View entering={FadeIn} style={styles.empty}>
              <Text style={styles.emptyIcon}>☆</Text>
              <Text style={styles.emptyTitle}>Nothing tracked yet</Text>
              <Text style={styles.emptySub}>
                Open any token and tap "Track" to add it here
              </Text>
            </Animated.View>
          ) : null
        }
      />
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
    paddingVertical: 16,
  },
  title: { color: colors.text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  count: { color: colors.text.muted, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
    gap: 12,
  },
  watchIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  watchInfo: { flex: 1 },
  watchLabel: { color: colors.text.primary, fontSize: 15, fontWeight: "600" },
  watchAddr: { color: colors.text.muted, fontSize: 11, fontFamily: "monospace", marginTop: 3 },
  roleTag: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  removeBtn: { padding: 4 },
  removeTxt: { color: colors.text.muted, fontSize: 14 },
  authGate: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  authIcon: { fontSize: 48, marginBottom: 16 },
  authTitle: { color: colors.text.primary, fontSize: 20, fontWeight: "700", textAlign: "center" },
  authSub: { color: colors.text.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: colors.text.primary, fontSize: 18, fontWeight: "600" },
  emptySub: { color: colors.text.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
});
