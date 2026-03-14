import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Activity, TrendingUp, AlertTriangle, Zap, Radar } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonLoader, SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useGlobalStats, useSearchTokens } from '../../src/lib/query';
import { connectAlertsWS } from '../../src/lib/api';
import { useAlertsStore } from '../../src/store/alerts';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { TokenSearchResult } from '../../src/types/api';

export default function RadarScreen() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats();
  const { data: trending, isLoading: trendingLoading, refetch: refetchTrending } =
    useSearchTokens('', true);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const wsCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    wsCleanup.current = connectAlertsWS(addAlert);
    return () => wsCleanup.current?.();
  }, []);

  const refreshing = statsLoading || trendingLoading;
  const onRefresh = () => { refetchStats(); refetchTrending(); };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconGlowWrap}>
                <View style={styles.iconGlow} />
                <Radar size={26} color={tokens.secondary} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Lineage Agent</Text>
                <Text style={styles.headerSub}>Live Threat Intelligence</Text>
              </View>
            </View>
            <View style={[styles.dot, { backgroundColor: stats ? tokens.success : tokens.white20 }]} />
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatCard
              label="Scanned 24h"
              value={statsLoading ? null : stats?.tokens_scanned_24h ?? 0}
              icon={<Activity size={16} color={tokens.secondary} />}
              accentColor={tokens.secondary}
            />
            <StatCard
              label="Rugs 24h"
              value={statsLoading ? null : stats?.tokens_rugged_24h ?? 0}
              icon={<AlertTriangle size={16} color={tokens.accent} />}
              accentColor={tokens.accent}
            />
            <StatCard
              label="Deployers"
              value={statsLoading ? null : stats?.active_deployers_24h ?? 0}
              icon={<Zap size={16} color={tokens.secondary} />}
              accentColor={tokens.secondary}
            />
          </View>

          {/* Trending tokens */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={16} color={tokens.secondary} />
              <Text style={styles.sectionTitle}>Trending Tokens</Text>
            </View>

            {trendingLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <GlassCard key={i} style={styles.tokenCard} noPadding>
                    <View style={{ padding: tokens.spacing.cardPadding }}>
                      <SkeletonBlock lines={2} />
                    </View>
                  </GlassCard>
                ))
              : (trending ?? []).slice(0, 20).map((token: TokenSearchResult, index: number) => (
                  <Animated.View key={token.mint} entering={FadeInDown.delay(index * 40).duration(350).springify()}>
                    <TokenCard
                      token={token}
                      onPress={() => router.push(`/token/${token.mint}` as any)}
                    />
                  </Animated.View>
                ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  accentColor = tokens.primary,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  accentColor?: string;
}) {

  return (
    <GlassCard style={styles.statCard}>
      <View style={styles.statIcon}>{icon}</View>
      {value === null ? (
        <SkeletonLoader width={48} height={24} style={{ marginTop: 4 }} />
      ) : (
        <Text style={[styles.statValue, { color: accentColor }]}>
          {value.toLocaleString()}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </GlassCard>
  );
}

function TokenCard({
  token,
  onPress,
}: {
  token: TokenSearchResult;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`View token ${token.name} (${token.symbol})`}
    >
      <GlassCard style={styles.tokenCard} noPadding>
        <View style={styles.tokenInner}>
          {token.image_uri ? (
            <Image source={{ uri: token.image_uri }} style={styles.tokenImage} />
          ) : (
            <View style={[styles.tokenImage, styles.tokenImageFallback]}>
              <Text style={styles.tokenImageFallbackText}>{token.symbol?.[0] ?? '?'}</Text>
            </View>
          )}
          <View style={styles.tokenInfo}>
            <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
          </View>
          <View style={styles.tokenRight}>
            {token.market_cap_usd != null && (
              <Text style={styles.tokenMcap}>
                ${(token.market_cap_usd / 1_000).toFixed(0)}K
              </Text>
            )}
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconGlowWrap: { position: 'relative', width: 26, height: 26 },
  iconGlow: {
    position: 'absolute',
    top: -6, left: -6, right: -6, bottom: -6,
    backgroundColor: tokens.secondary,
    opacity: 0.20,
    borderRadius: 100,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: 26,
    color: tokens.white100,
    letterSpacing: -0.52,
  },
  headerSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statCard: { flex: 1, alignItems: 'center' },
  statIcon: { marginBottom: 4 },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 2,
    textAlign: 'center',
  },

  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
  },

  tokenCard: { marginBottom: 0 },
  tokenInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
  },
  tokenImage: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
  },
  tokenImageFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenImageFallbackText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  tokenInfo: { flex: 1 },
  tokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  tokenSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  tokenRight: { alignItems: 'flex-end', gap: 4 },
  tokenMcap: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});
