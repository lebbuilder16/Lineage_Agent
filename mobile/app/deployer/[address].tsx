// app/deployer/[address].tsx
// Profil d'un déployeur — taux de rug, historique, tokens liés

import React from "react";
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
import { SkeletonLoader } from "@/src/components/ui/SkeletonLoader";
import { colors } from "@/src/theme/colors";
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
  const pct = Math.min(value / max, 1);
  return (
    <View style={styles.barWrap}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barVal, { color: accent }]}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function DeployerScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { data: profile, isLoading, error } = useQuery({
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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
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
        <ScrollView contentContainerStyle={styles.content}>
          {[...Array(4)].map((_, i) => (
            <SkeletonLoader key={i} width="100%" height={80} borderRadius={12} style={{ marginBottom: 12 }} />
          ))}
        </ScrollView>
      )}

      {!!error && (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Failed to load deployer profile</Text>
          <HapticButton label="Go Back" onPress={() => router.back()} variant="secondary" />
        </View>
      )}

      {profile && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <GlassCard style={styles.headerCard} elevated>
            <View style={styles.headerRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(address ?? "?").slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.addressText}>{abbreviate(address ?? "")}</Text>
                <Text style={styles.chainText}>{profile.chain ?? "Solana"}</Text>
              </View>
            </View>

            {/* Rug rate gauge */}
            <View style={styles.rugWrap}>
              <View style={styles.rugHeader}>
                <Text style={styles.rugLabel}>Rug Rate</Text>
                <Text
                  style={[
                    styles.rugPct,
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
              <View style={styles.rugTrack}>
                <View
                  style={[
                    styles.rugFill,
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
          <GlassCard style={styles.statsCard}>
            <Text style={styles.sectionTitle}>ACTIVITY STATS</Text>
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
          <GlassCard style={styles.riskCard}>
            <Text style={styles.sectionTitle}>NARRATIVES</Text>
            <View style={styles.pillRow}>
              {profile.preferred_narrative ? (
                <View style={styles.flagPill}>
                  <Text style={styles.flagText}>{profile.preferred_narrative}</Text>
                </View>
              ) : (
                <Text style={styles.noFlagsText}>No preferred narrative</Text>
              )}
            </View>
          </GlassCard>

          {/* Known tokens */}
          {profile.tokens && profile.tokens.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>DEPLOYED TOKENS</Text>
              {profile.tokens.slice(0, 10).map((t) => (
                <TouchableOpacity
                  key={t.mint}
                  onPress={() => router.push(`/lineage/${t.mint}`)}
                  style={styles.tokenRow}
                >
                  <GlassCard style={styles.tokenCard}>
                    <View style={styles.tokenRowInner}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tokenName}>{t.name || t.symbol}</Text>
                        <Text style={styles.tokenMint}>{abbreviate(t.mint)}</Text>
                      </View>
                      {t.rugged_at && (
                        <View style={[styles.flagPill, { borderColor: colors.accent.danger }]}>
                          <Text style={[styles.flagText, { color: colors.accent.danger }]}>RUGGED</Text>
                        </View>
                      )}
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.deep },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: { color: colors.accent.danger, fontSize: 15 },
  headerCard: { padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.glass.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  avatarText: { color: colors.accent.ai, fontSize: 18, fontWeight: "800" },
  addressText: { color: colors.text.primary, fontSize: 16, fontWeight: "700", fontFamily: "monospace" },
  chainText: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  rugWrap: { marginTop: 14 },
  rugHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  rugLabel: { color: colors.text.secondary, fontSize: 13 },
  rugPct: { fontSize: 16, fontWeight: "800" },
  rugTrack: {
    height: 8,
    backgroundColor: colors.glass.bg,
    borderRadius: 4,
    overflow: "hidden",
  },
  rugFill: { height: 8, borderRadius: 4 },
  statsCard: { padding: 16 },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  barWrap: { marginBottom: 10 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { color: colors.text.secondary, fontSize: 12 },
  barVal: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, backgroundColor: colors.glass.bg, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  riskCard: { padding: 16 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flagPill: {
    backgroundColor: `${colors.accent.danger}22`,
    borderColor: colors.accent.danger,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flagText: { color: colors.accent.danger, fontSize: 11, fontWeight: "600" },
  noFlagsText: { color: colors.accent.safe, fontSize: 13 },
  sectionHeader: {
    color: colors.text.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 4,
  },
  tokenRow: { marginBottom: 8 },
  tokenCard: { padding: 12 },
  tokenRowInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenName: { color: colors.text.primary, fontSize: 14, fontWeight: "600" },
  tokenMint: { color: colors.text.muted, fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  chevron: { color: colors.text.muted, fontSize: 20 },
});
