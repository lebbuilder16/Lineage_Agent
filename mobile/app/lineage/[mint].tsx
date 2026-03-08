// app/lineage/[mint].tsx
// Lineage Detail screen — Family tree + forensic signal cards défilantes

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { getLineage, addWatch } from "@/src/lib/api";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { RiskGauge } from "@/src/components/ui/RiskGauge";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { TokenCardSkeleton } from "@/src/components/ui/SkeletonLoader";
import { ForensicSignalCards } from "@/src/components/forensics/ForensicSignalCards";
import { FamilyTreeView } from "@/src/components/lineage/FamilyTreeView";
import { colors, verdictColor, riskLevelFromScore } from "@/src/theme/colors";
import { useAuthStore } from "@/src/store/auth";
import type { LineageResult } from "@/src/types/api";

function formatMcap(v: number | null) {
  if (!v) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ─── Header Token Info ─────────────────────────────────────────────────────────

function TokenHeader({ data }: { data: LineageResult }) {
  const token = data.query_token;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();

  const watchMutation = useMutation({
    mutationFn: () => addWatch({ mint: data.mint, label: token?.name ?? data.mint }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });

  const handleShare = async () => {
    await Share.share({
      message: `Lineage analysis for ${token?.name ?? data.mint}: https://lineageagent.io/lineage/${data.mint}`,
    });
  };

  // Calculate a global risk score from available signals
  const riskScore = calculateRiskScore(data);
  const riskLevel = riskLevelFromScore(riskScore);

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.tokenHeader}>
      <View style={styles.tokenHeaderLeft}>
        <TokenImage
          uri={token?.image_uri ?? ""}
          size={64}
          symbol={token?.symbol}
          borderRadius={16}
        />
        <View style={styles.tokenHeaderInfo}>
          <Text style={styles.tokenName} numberOfLines={1}>
            {token?.name ?? "Unknown Token"}
          </Text>
          <Text style={styles.tokenSymbol}>${token?.symbol}</Text>
          <View style={styles.tokenStats}>
            <Text style={styles.tokenMcap}>{formatMcap(token?.market_cap_usd ?? null)}</Text>
            <RiskBadge
              label={data.query_is_root ? "ROOT" : "CLONE"}
              riskLevel={data.query_is_root ? "low" : "high"}
              size="sm"
            />
          </View>
        </View>
      </View>
      <View style={styles.tokenHeaderRight}>
        <RiskGauge score={riskScore} size={72} />
        <Text style={[styles.riskLabel, { color: colors.risk[riskLevel] }]}>
          {riskLevel.toUpperCase()}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Quick Action Buttons ──────────────────────────────────────────────────────

function QuickActions({ mint, name }: { mint: string; name?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();

  const watchMutation = useMutation({
    mutationFn: () => addWatch({ mint, label: name ?? mint }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });

  return (
    <View style={styles.actions}>
      <HapticButton
        label="⚡ AI Analysis"
        variant="primary"
        size="sm"
        hapticStyle="medium"
        onPress={() => router.push(`/chat/${mint}`)}
        style={styles.actionBtn}
      />
      {isAuthenticated && (
        <HapticButton
          label={watchMutation.isSuccess ? "✓ Watching" : "☆ Track"}
          variant="secondary"
          size="sm"
          onPress={() => watchMutation.mutate()}
          disabled={watchMutation.isPending || watchMutation.isSuccess}
          style={styles.actionBtn}
        />
      )}
      <HapticButton
        label="↑ Share"
        variant="ghost"
        size="sm"
        onPress={async () => {
          await Share.share({
            message: `Check this token analysis: https://lineageagent.io/lineage/${mint}`,
          });
        }}
        style={styles.actionBtn}
      />
    </View>
  );
}

// ─── Risk Score Calculator ─────────────────────────────────────────────────────

function calculateRiskScore(data: LineageResult): number {
  let score = 0;
  let weight = 0;

  if (!data.query_is_root) { score += 0.4; weight++; }

  if (data.death_clock) {
    const levels = { low: 0.1, medium: 0.4, high: 0.7, critical: 0.95, first_rug: 0.9, insufficient_data: 0.2 };
    score += levels[data.death_clock.risk_level] ?? 0.2;
    weight++;
  }

  if (data.insider_sell) {
    score += data.insider_sell.risk_score;
    weight++;
  }

  if (data.bundle_report) {
    const verdictScores: Record<string, number> = {
      confirmed_team_extraction: 1.0,
      suspected_team_extraction: 0.7,
      coordinated_dump_unknown_team: 0.5,
      early_buyers_no_link_proven: 0.05,
    };
    score += verdictScores[data.bundle_report.overall_verdict] ?? 0;
    weight++;
  }

  if (data.liquidity_arch) {
    score += 1 - data.liquidity_arch.authenticity_score;
    weight++;
  }

  return weight > 0 ? Math.min(score / weight, 1.0) : 0;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LineageDetailScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["lineage", mint],
    queryFn: () => getLineage(mint),
    enabled: !!mint,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <View>
          {[...Array(3)].map((_, i) => <TokenCardSkeleton key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Failed to load lineage data.</Text>
          <Text style={styles.errorMint}>{mint}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Nav header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {data.query_token?.symbol ? `$${data.query_token.symbol}` : "Lineage"}
        </Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Token header */}
        <TokenHeader data={data} />

        {/* Quick actions */}
        <QuickActions
          mint={data.mint}
          name={data.query_token?.name}
        />

        {/* Family tree */}
        <Text style={styles.sectionTitle}>Family Tree</Text>
        <GlassCard style={styles.treeCard}>
          <FamilyTreeView result={data} />
          <View style={styles.treeMeta}>
            <Text style={styles.treeMetaText}>{data.family_size} members · Confidence {Math.round(data.confidence * 100)}%</Text>
          </View>
        </GlassCard>

        {/* Forensic signals */}
        <Text style={styles.sectionTitle}>Forensic Signals</Text>
        <ForensicSignalCards result={data} />

        {/* Deployer info */}
        {data.deployer_profile && (
          <>
            <Text style={styles.sectionTitle}>Deployer</Text>
            <TouchableOpacity
              onPress={() => router.push(`/deployer/${data.deployer_profile!.address}`)}
            >
              <GlassCard style={styles.deployerRow}>
                <Text style={styles.deployerAddr}>
                  {data.deployer_profile.address.slice(0, 8)}…{data.deployer_profile.address.slice(-6)}
                </Text>
                <View style={styles.deployerStats}>
                  <Text style={styles.deployerStat}>{data.deployer_profile.total_tokens_launched} tokens</Text>
                  <Text style={styles.deployerStat}>
                    {data.deployer_profile.rug_rate_pct.toFixed(0)}% rug rate
                  </Text>
                  <RiskBadge
                    label={data.deployer_profile.rug_rate_pct > 70 ? "SERIAL RUGGER" : "ACTIVE"}
                    riskLevel={data.deployer_profile.rug_rate_pct > 70 ? "critical" : "medium"}
                    size="sm"
                  />
                </View>
              </GlassCard>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 56 },
  backTxt: { color: colors.accent.safe, fontSize: 16 },
  navTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  loadingHeader: { paddingHorizontal: 16, paddingVertical: 12 },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.accent.danger, fontSize: 16, fontWeight: "600" },
  errorMint: { color: colors.text.muted, fontSize: 11, marginTop: 8, fontFamily: "monospace" },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 16,
  },
  tokenHeaderLeft: { flexDirection: "row", flex: 1, gap: 14 },
  tokenHeaderInfo: { flex: 1 },
  tokenName: { color: colors.text.primary, fontSize: 20, fontWeight: "700" },
  tokenSymbol: { color: colors.text.muted, fontSize: 14, marginTop: 2 },
  tokenStats: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tokenMcap: { color: colors.text.primary, fontSize: 14, fontWeight: "600" },
  tokenHeaderRight: { alignItems: "center" },
  riskLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 20 },
  actionBtn: { flex: 1 },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  treeCard: { padding: 0, overflow: "hidden", marginBottom: 8 },
  treeMeta: { padding: 12, borderTopWidth: 1, borderTopColor: colors.glass.border },
  treeMetaText: { color: colors.text.muted, fontSize: 12, textAlign: "center" },
  deployerRow: { padding: 14 },
  deployerAddr: { color: colors.text.primary, fontSize: 13, fontFamily: "monospace", marginBottom: 10 },
  deployerStats: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  deployerStat: { color: colors.text.secondary, fontSize: 13 },
});
