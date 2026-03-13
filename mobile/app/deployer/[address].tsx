// app/deployer/[address].tsx
// Profil d'un déployeur — taux de rug, historique, tokens liés

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { Skeleton } from "@/src/components/ui/SkeletonLoader";
import { useTheme } from "@/src/theme/ThemeContext";
import { getDeployerProfile } from "@/src/lib/api";

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function BarStat({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: string;
}) {
  const { colors } = useTheme();
  const pct = Math.min(value / max, 1);
  return (
    <View style={base.barWrap}>
      <View style={base.barHeader}>
        <Text style={[base.barLabel, { color: colors.text.secondary }]}>{label}</Text>
        <Text style={[base.barVal, { color: accent }]}>{value}</Text>
      </View>
      <View style={[base.barTrack, { backgroundColor: colors.glass.bg }]}>
        <View style={[base.barFill, { width: `${pct * 100}%` as any, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function DeployerScreen() {
  const { colors } = useTheme();
  const { address } = useLocalSearchParams<{ address: string }>();
  const [visibleCount, setVisibleCount] = useState(10);
  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ["deployer", address],
    queryFn: () => getDeployerProfile(address!),
    enabled: !!address,
    staleTime: 60_000,
    retry: 2,
  });

  const abbreviate = (addr: string) =>
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const handleShare = async () => {
    await Share.share({ message: `Deployer analysis: ${address}` });
  };

  return (
    <SafeAreaView style={[base.safe, { backgroundColor: colors.background.deep }]} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: abbreviate(address ?? ""),
          headerStyle: { backgroundColor: colors.background.deep },
          headerTintColor: colors.text.primary,
          headerRight: () => (
            <TouchableOpacity onPress={handleShare} style={{ marginRight: 8 }}>
              <Text style={{ color: colors.accent.ai, fontWeight: "600" }}>Share</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading && (
        <ScrollView contentContainerStyle={base.content}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={12} style={{ marginBottom: 12 }} />
          ))}
        </ScrollView>
      )}

      {!!error && (
        <View style={base.errorWrap}>
          <Text style={[base.errorText, { color: colors.accent.danger }]}>Failed to load deployer profile</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <HapticButton label="Retry" onPress={() => refetch()} variant="primary" size="sm" />
            <HapticButton label="Go Back" onPress={() => router.back()} variant="secondary" size="sm" />
          </View>
        </View>
      )}

      {profile && (
        <ScrollView contentContainerStyle={base.content} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <GlassCard style={base.headerCard} elevated>
            <View style={base.headerRow}>
              <View style={[base.avatarCircle, { backgroundColor: colors.glass.bgElevated, borderColor: colors.glass.border }]}>
                <Text style={[base.avatarText, { color: colors.accent.ai }]}>
                  {(address ?? "?").slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[base.addressText, { color: colors.text.primary }]}>{abbreviate(address ?? "")}</Text>
                <Text style={[base.chainText, { color: colors.text.muted }]}>{profile.chain ?? "Solana"}</Text>
              </View>
            </View>

            {/* Rug rate gauge */}
            <View style={base.rugWrap}>
              <View style={base.rugHeader}>
                <Text style={[base.rugLabel, { color: colors.text.secondary }]}>Rug Rate</Text>
                <Text
                  style={[
                    base.rugPct,
                    {
                      color:
                        (profile.rug_rate_pct ?? 0) > 60
                          ? colors.accent.danger
                          : (profile.rug_rate_pct ?? 0) > 30
                          ? colors.accent.warning
                          : colors.accent.safe,
                    },
                  ]}
                >
                  {Math.round(profile.rug_rate_pct ?? 0)}%
                </Text>
              </View>
              <View style={[base.rugTrack, { backgroundColor: colors.glass.bg }]}>
                <View
                  style={[
                    base.rugFill,
                    {
                      width: `${Math.min(profile.rug_rate_pct ?? 0, 100)}%` as any,
                      backgroundColor:
                        (profile.rug_rate_pct ?? 0) > 60
                          ? colors.accent.danger
                          : (profile.rug_rate_pct ?? 0) > 30
                          ? colors.accent.warning
                          : colors.accent.safe,
                    },
                  ]}
                />
              </View>
            </View>
          </GlassCard>

          {/* Stats */}
          <GlassCard style={base.statsCard}>
            <Text style={[base.sectionTitle, { color: colors.text.muted }]}>ACTIVITY STATS</Text>
            <BarStat
              label="Total tokens deployed"
              value={profile.total_tokens_launched ?? 0}
              max={Math.max(profile.total_tokens_launched ?? 1, 20)}
              accent={colors.accent.ai}
            />
            <BarStat
              label="Active tokens"
              value={profile.active_tokens ?? 0}
              max={Math.max(profile.total_tokens_launched ?? 1, 1)}
              accent={colors.accent.safe}
            />
            <BarStat
              label="Rugged tokens"
              value={profile.rug_count ?? 0}
              max={Math.max(profile.total_tokens_launched ?? 1, 1)}
              accent={colors.accent.danger}
            />
          </GlassCard>

          {/* Risk profile */}
          <GlassCard style={base.riskCard}>
            <Text style={[base.sectionTitle, { color: colors.text.muted }]}>NARRATIVES</Text>
            <View style={base.pillRow}>
              {profile.preferred_narrative ? (
                <View style={[base.flagPill, { backgroundColor: `${colors.accent.danger}22`, borderColor: colors.accent.danger }]}>
                  <Text style={[base.flagText, { color: colors.accent.danger }]}>{profile.preferred_narrative}</Text>
                </View>
              ) : (
                <Text style={[base.noFlagsText, { color: colors.accent.safe }]}>No preferred narrative</Text>
              )}
            </View>
          </GlassCard>

          {/* Known tokens */}
          {profile.tokens && profile.tokens.length > 0 && (
            <View>
              <Text style={[base.sectionHeader, { color: colors.text.muted }]}>DEPLOYED TOKENS</Text>
              {profile.tokens.slice(0, visibleCount).map((t) => (
                <TouchableOpacity
                  key={t.mint}
                  onPress={() => router.push(`/lineage/${t.mint}`)}
                  style={base.tokenRow}
                  accessibilityLabel={`View lineage of token ${t.name || t.symbol}`}
                  accessibilityRole="button"
                >
                  <GlassCard style={base.tokenCard}>
                    <View style={base.tokenRowInner}>
                      <View style={{ flex: 1 }}>
                        <Text style={[base.tokenName, { color: colors.text.primary }]}>{t.name || t.symbol}</Text>
                        <Text style={[base.tokenMint, { color: colors.text.muted }]}>{abbreviate(t.mint)}</Text>
                      </View>
                      {t.rugged_at && (
                        <View style={[base.flagPill, { borderColor: colors.accent.danger }]}>
                          <Text style={[base.flagText, { color: colors.accent.danger }]}>RUGGED</Text>
                        </View>
                      )}
                      <Text style={[base.chevron, { color: colors.text.muted }]}>›</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
              {visibleCount < profile.tokens.length && (
                <TouchableOpacity
                  onPress={() => setVisibleCount((n) => n + 10)}
                  style={[base.loadMoreBtn, { borderColor: colors.glass.border, backgroundColor: colors.glass.bg }]}
                  accessibilityLabel="Load more tokens"
                  accessibilityRole="button"
                >
                  <Text style={[base.loadMoreText, { color: colors.accent.ai }]}>
                    Load more ({profile.tokens.length - visibleCount} remaining)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const base = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: { fontSize: 15 },
  headerCard: { padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: { fontSize: 18, fontWeight: "800" },
  addressText: { fontSize: 16, fontWeight: "700", fontFamily: "monospace" },
  chainText: { fontSize: 12, marginTop: 2 },
  rugWrap: { marginTop: 14 },
  rugHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  rugLabel: { fontSize: 13 },
  rugPct: { fontSize: 16, fontWeight: "800" },
  rugTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  rugFill: { height: 8, borderRadius: 4 },
  statsCard: { padding: 16 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  barWrap: { marginBottom: 10 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: 12 },
  barVal: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  riskCard: { padding: 16 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flagPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flagText: { fontSize: 11, fontWeight: "600" },
  noFlagsText: { fontSize: 13 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 4,
  },
  tokenRow: { marginBottom: 8 },
  tokenCard: { padding: 12 },
  tokenRowInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenName: { fontSize: 14, fontWeight: "600" },
  tokenMint: { fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  chevron: { fontSize: 20 },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  loadMoreText: { fontSize: 14, fontWeight: "600" },
});
