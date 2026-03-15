import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import {
  Activity,
  TrendingUp,
  AlertTriangle,
  Radar,
  Bell,
  BookmarkPlus,
  Check,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SkeletonLoader, SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useGlobalStats, useTopTokens, useAddWatch } from '../../src/lib/query';
import { connectAlertsWS } from '../../src/lib/api';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import type { TokenSearchResult, TopToken } from '../../src/types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a TopToken to the shape TokenCard expects. */
function topTokenToSearchResult(t: TopToken): TokenSearchResult {
  return {
    mint: t.mint,
    name: t.name,
    symbol: t.symbol,
    image_uri: '',
    metadata_uri: '',
    dex_url: '',
    market_cap_usd: t.mcap_usd ?? null,
    pair_created_at: t.created_at ?? null,
  };
}

function deriveRisk(token: TokenSearchResult): 'low' | 'medium' | 'high' | 'critical' {
  const mcap = token.market_cap_usd ?? 0;
  const liq = token.liquidity_usd ?? 0;
  const ageMs = token.pair_created_at
    ? Date.now() - new Date(token.pair_created_at).getTime()
    : Infinity;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (mcap < 10_000 || ageDays < 0.5) return 'critical';
  if (mcap < 100_000 || ageDays < 2 || (liq > 0 && mcap > 0 && liq / mcap < 0.05)) return 'high';
  if (mcap < 1_000_000 || ageDays < 7) return 'medium';
  return 'low';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ─── Radar Pulse Animation ───────────────────────────────────────────────────

const SONAR_SIZE = 160;
// Blip positions (% of radius, angle in degrees)
const BLIPS = [
  { r: 0.45, a: 42 },
  { r: 0.68, a: 145 },
  { r: 0.55, a: 235 },
];

function SonarSweep() {
  const rotation = useSharedValue(0);
  const blip1 = useSharedValue(0);
  const blip2 = useSharedValue(0);
  const blip3 = useSharedValue(0);

  useEffect(() => {
    const CYCLE = 3000;
    rotation.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
    const blipAnim = (sv: typeof blip1, delay: number) => {
      sv.value = withDelay(delay, withRepeat(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
        -1,
        true,
      ));
    };
    blipAnim(blip1, 0);
    blipAnim(blip2, 1100);
    blipAnim(blip3, 2200);
  }, []);

  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 360])}deg` }],
  }));
  const trail1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-20, 340])}deg` }],
    opacity: 0.45,
  }));
  const trail2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-40, 320])}deg` }],
    opacity: 0.18,
  }));
  const b1Style = useAnimatedStyle(() => ({ opacity: blip1.value, transform: [{ scale: interpolate(blip1.value, [0, 1], [0.6, 1]) }] }));
  const b2Style = useAnimatedStyle(() => ({ opacity: blip2.value, transform: [{ scale: interpolate(blip2.value, [0, 1], [0.6, 1]) }] }));
  const b3Style = useAnimatedStyle(() => ({ opacity: blip3.value, transform: [{ scale: interpolate(blip3.value, [0, 1], [0.6, 1]) }] }));
  const blipStyles = [b1Style, b2Style, b3Style];

  const R = SONAR_SIZE / 2;

  return (
    <View style={styles.sonarContainer}>
      {/* Grid rings */}
      {[0.33, 0.6, 0.88].map((ratio, i) => (
        <View
          key={i}
          style={[
            styles.sonarRing,
            { width: SONAR_SIZE * ratio, height: SONAR_SIZE * ratio, borderRadius: (SONAR_SIZE * ratio) / 2 },
          ]}
        />
      ))}
      {/* Crosshairs */}
      <View style={[styles.sonarCross, { width: SONAR_SIZE, height: 1 }]} />
      <View style={[styles.sonarCross, { width: 1, height: SONAR_SIZE }]} />

      {/* Sweep trails (behind arm) */}
      <Animated.View style={[styles.sonarArmWrap, trail2Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}30` }]} />
      </Animated.View>
      <Animated.View style={[styles.sonarArmWrap, trail1Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}55` }]} />
      </Animated.View>
      {/* Main sweep arm */}
      <Animated.View style={[styles.sonarArmWrap, armStyle]}>
        <View style={styles.sonarArm} />
      </Animated.View>

      {/* Blips */}
      {BLIPS.map((bp, i) => {
        const rad = (bp.a * Math.PI) / 180;
        const bx = R + bp.r * R * Math.cos(rad) - 4;
        const by = R + bp.r * R * Math.sin(rad) - 4;
        return (
          <Animated.View
            key={i}
            style={[
              styles.sonarBlip,
              { left: bx, top: by },
              blipStyles[i],
            ]}
          />
        );
      })}

      {/* Centre dot */}
      <View style={styles.sonarDot}>
        <Radar size={20} color={tokens.secondary} strokeWidth={2} />
      </View>
    </View>
  );
}

// ─── Number Ticker ────────────────────────────────────────────────────────────

function NumberTicker({ value, color }: { value: number | null; color: string }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value === null) return;
    const target = value;
    const duration = 1200;
    const startTime = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  if (value === null) {
    return <SkeletonLoader width={52} height={26} style={{ marginVertical: 4 }} />;
  }
  return (
    <Text style={[styles.statValue, { color }]}>
      {displayed.toLocaleString()}
    </Text>
  );
}

// ─── Bento Stat Card ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accentColor,
  large,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  accentColor: string;
  large?: boolean;
}) {
  return (
    <GlassCard
      style={[
        styles.bentoCard,
        large && styles.bentoLarge,
        { borderColor: `${accentColor}20` },
      ]}
    >
      <View style={[styles.bentoGlow, { backgroundColor: `${accentColor}0D` }]} />
      <View style={styles.bentoIcon}>{icon}</View>
      <NumberTicker value={value} color={accentColor} />
      <Text style={styles.bentoLabel}>{label}</Text>
    </GlassCard>
  );
}

// ─── Token Card with quick-watch ─────────────────────────────────────────────

function TokenCard({
  token,
  apiKey,
  onPress,
}: {
  token: TokenSearchResult;
  apiKey: string | null;
  onPress: () => void;
}) {
  const addMutation = useAddWatch(apiKey);
  const watches = useAuthStore((s) => s.watches);
  const isWatched = watches.some((w) => w.value === token.mint);
  const [justAdded, setJustAdded] = useState(false);
  const scaleAnim = useSharedValue(1);

  const isNew = token.pair_created_at
    ? Date.now() - new Date(token.pair_created_at).getTime() < 24 * 60 * 60 * 1000
    : false;
  const risk = deriveRisk(token);

  const riskAccent =
    risk === 'critical' ? tokens.risk.critical
    : risk === 'high' ? tokens.risk.high
    : risk === 'medium' ? tokens.risk.medium
    : tokens.risk.low;

  const handleWatch = useCallback(() => {
    if (isWatched || !apiKey) return;
    scaleAnim.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withTiming(1.18, { duration: 140 }),
      withTiming(1, { duration: 110 }),
    );
    addMutation.mutate({ sub_type: 'mint', value: token.mint });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  }, [isWatched, apiKey, token.mint]);

  const watchBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`View ${token.name}`}
    >
      <GlassCard
        style={[styles.tokenCard, { borderLeftColor: `${riskAccent}50`, borderLeftWidth: 3 }]}
        noPadding
      >
        <View style={styles.tokenInner}>
          {token.image_uri ? (
            <Image source={{ uri: token.image_uri }} style={styles.tokenImage} />
          ) : (
            <View style={[styles.tokenImage, styles.tokenImageFallback]}>
              <Text style={styles.tokenImageFallbackText}>{token.symbol?.[0] ?? '?'}</Text>
            </View>
          )}
          <View style={styles.tokenInfo}>
            <View style={styles.tokenNameRow}>
              <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
              {isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>
            <View style={styles.tokenMetaRow}>
              <Text style={styles.tokenSymbol}>{token.symbol}</Text>
              {token.market_cap_usd != null && (
                <Text style={styles.tokenMcap}>{fmtMcap(token.market_cap_usd)}</Text>
              )}
            </View>
          </View>
          <View style={styles.tokenRight}>
            <RiskBadge level={risk} size="sm" />
            {apiKey ? (
              <Animated.View style={watchBtnAnimStyle}>
                <Pressable
                  onPress={handleWatch}
                  style={[
                    styles.watchBtn,
                    (isWatched || justAdded) && styles.watchBtnActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={isWatched ? 'Already watching' : 'Add to watchlist'}
                >
                  {isWatched || justAdded
                    ? <Check size={13} color={tokens.success} strokeWidth={2.5} />
                    : <BookmarkPlus size={13} color={tokens.white60} strokeWidth={2} />
                  }
                </Pressable>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// ─── Immersive Empty State ────────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <SonarSweep />
      <Text style={styles.emptyTitle}>Listening to the blockchain…</Text>
      <Text style={styles.emptySubtitle}>
        Live alerts will appear here as threats are detected on-chain.
      </Text>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats();

  const { data: topTokens, isLoading: topLoading, refetch: refetchTopTokens } = useTopTokens(10);

  const addAlert = useAlertsStore((s) => s.addAlert);
  const setWsConnected = useAlertsStore((s) => s.setWsConnected);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const markRead = useAlertsStore((s) => s.markRead);
  const allAlerts = useAlertsStore((s) => s.alerts);
  const recentAlerts = useMemo(() => allAlerts.slice(0, 3), [allAlerts]);

  const apiKey = useAuthStore((s) => s.apiKey);

  const wsCleanup = useRef<(() => void) | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    wsCleanup.current = connectAlertsWS(addAlert, undefined, setWsConnected);
    return () => wsCleanup.current?.();
  }, []);

  const refreshing = statsLoading || topLoading;
  const onRefresh = () => { refetchStats(); refetchTopTokens(); };

  const rugRate = stats?.rug_rate_24h_pct != null
    ? `${stats.rug_rate_24h_pct.toFixed(1)}%`
    : null;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Header fixed outside scroll so it doesn't move with content */}
        <ScreenHeader
          icon={<Radar size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Lineage Agent"
          subtitle="Live Threat Intelligence"
          dotConnected={wsConnected}
          paddingBottom={8}
          style={{ paddingHorizontal: tokens.spacing.screenPadding }}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />
          }
        >
          {/* no header here — it's above the ScrollView */}

          {/* ── Bento Stats Grid ── */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.bentoGrid}>
            <StatCard
              label="Scanned 24h"
              value={statsLoading ? null : stats?.tokens_scanned_24h ?? 0}
              icon={<Activity size={18} color={tokens.secondary} />}
              accentColor={tokens.secondary}
              large
            />
            <View style={styles.bentoCol}>
              <StatCard
                label="Rugs 24h"
                value={statsLoading ? null : stats?.tokens_rugged_24h ?? 0}
                icon={<AlertTriangle size={15} color={tokens.accent} />}
                accentColor={tokens.accent}
              />
            </View>
          </Animated.View>

          {/* Rug rate pill */}
          {rugRate && (
            <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.rugRateRow}>
              <View style={styles.rugRatePill}>
                <View style={styles.rugRateDot} />
                <Text style={styles.rugRateText}>
                  Rug rate 24h —{' '}
                  <Text style={{ color: tokens.accent }}>{rugRate}</Text>
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Live Alerts ── */}
          <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Bell size={14} color={tokens.secondary} />
              <Text style={styles.sectionTitle}>LIVE ALERTS</Text>
              {wsConnected && <View style={styles.liveDot} />}
            </View>

            {recentAlerts.length === 0 ? (
              <EmptyFeed />
            ) : (
              recentAlerts.map((alert, i) => (
                <Animated.View
                  key={alert.id}
                  entering={FadeInDown.delay(i * 60).duration(350).springify()}
                >
                  <TouchableOpacity
                    onPress={() => {
                      markRead(alert.id);
                      if (alert.mint) router.push(`/token/${alert.mint}` as any);
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Alert: ${alert.title ?? alert.type}`}
                  >
                    <GlassCard
                      style={[styles.alertCard, !alert.read && styles.alertCardUnread]}
                      noPadding
                    >
                      <View style={styles.alertInner}>
                        <View style={styles.alertDot}>
                          {!alert.read && <View style={styles.alertUnreadDot} />}
                        </View>
                        <View style={styles.alertBody}>
                          <Text style={styles.alertTitle} numberOfLines={1}>
                            {alert.title ?? alert.token_name ?? alert.type.toUpperCase()}
                          </Text>
                          <Text style={styles.alertMsg} numberOfLines={1}>
                            {alert.message}
                          </Text>
                        </View>
                        <Text style={styles.alertTime}>
                          {timeAgo(alert.timestamp ?? alert.created_at ?? '')}
                        </Text>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                </Animated.View>
              ))
            )}
          </Animated.View>

          {/* ── Most Scanned 24h ── */}
          <Animated.View
            entering={FadeInDown.delay(180).duration(400)}
            style={[styles.section, { marginTop: 24 }]}
          >
            <View style={styles.sectionHeader}>
              <TrendingUp size={14} color={tokens.secondary} />
              <Text style={styles.sectionTitle}>MOST SCANNED 24H</Text>
              {!topLoading && (topTokens ?? []).length > 0 && (
                <Text style={styles.feedTag}>{(topTokens ?? []).length} TOKENS</Text>
              )}
            </View>

            {topLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <GlassCard key={i} noPadding style={{ marginBottom: 0 }}>
                    <View style={{ padding: tokens.spacing.cardPadding }}>
                      <SkeletonBlock lines={2} />
                    </View>
                  </GlassCard>
                ))
              : (topTokens ?? []).length === 0
                ? (
                  <GlassCard style={styles.emptyFeedCard}>
                    <Text style={styles.emptyFeedText}>No activity in 24h — pull to refresh</Text>
                  </GlassCard>
                )
                : (topTokens ?? []).map((token: TopToken, index: number) => (
                    <Animated.View
                      key={token.mint}
                      entering={FadeInDown.delay(index * 35).duration(320).springify()}
                    >
                      <TokenCard
                        token={topTokenToSearchResult(token)}
                        apiKey={apiKey}
                        onPress={() => router.push(`/token/${token.mint}` as any)}
                      />
                    </Animated.View>
                  ))
            }
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding },
  bentoGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  bentoCard: { flex: 1, alignItems: 'flex-start', justifyContent: 'flex-end', minHeight: 100, overflow: 'hidden', position: 'relative', borderWidth: 1 },
  bentoLarge: { flex: 1.4, minHeight: 110 },
  bentoCol: { flex: 1, gap: 10 },
  bentoGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 60, borderRadius: tokens.radius.sm },
  bentoIcon: { marginBottom: 6 },
  statValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, lineHeight: 22 },
  bentoLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, marginTop: 3, letterSpacing: 0.5 },
  rugRateRow: { alignItems: 'flex-start', marginBottom: 24 },
  rugRatePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${tokens.accent}10`, borderWidth: 1, borderColor: `${tokens.accent}25`, borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  rugRateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent },
  rugRateText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  sectionTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white35, letterSpacing: 1.5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.success },
  feedTag: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: `${tokens.secondary}70`, letterSpacing: 1, marginLeft: 'auto' },
  feedSeeAll: { alignItems: 'center', paddingVertical: 10 },
  feedSeeAllText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary, letterSpacing: 0.5 },
  alertCard: { marginBottom: 0 },
  alertCardUnread: { borderColor: `${tokens.secondary}35`, borderWidth: 1 },
  alertInner: { flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.cardPadding, gap: 10 },
  alertDot: { width: 8, alignItems: 'center' },
  alertUnreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.secondary },
  alertBody: { flex: 1 },
  alertTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white100 },
  alertMsg: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60, marginTop: 2 },
  alertTime: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35 },
  tokenCard: { marginBottom: 0, overflow: 'hidden' },
  tokenInner: { flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.cardPadding, gap: 12 },
  tokenImage: { width: 42, height: 42, borderRadius: tokens.radius.sm },
  tokenImageFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  tokenImageFallbackText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white60 },
  tokenInfo: { flex: 1, gap: 3 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100, flexShrink: 1 },
  tokenMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35 },
  tokenMcap: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  newBadge: { backgroundColor: `${tokens.secondary}20`, borderRadius: tokens.radius.pill, paddingHorizontal: 5, paddingVertical: 2 },
  newBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.secondary, letterSpacing: 0.8 },
  watchBtn: { width: 26, height: 26, borderRadius: tokens.radius.xs, borderWidth: 1, borderColor: tokens.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  watchBtnActive: { borderColor: `${tokens.success}50`, backgroundColor: `${tokens.success}12` },
  emptyFeedCard: { alignItems: 'center', paddingVertical: 20 },
  emptyFeedText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 32, gap: 14 },
  pulseContainer: { width: SONAR_SIZE, height: SONAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  sonarContainer: { width: SONAR_SIZE, height: SONAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', borderWidth: 1, borderColor: `${tokens.secondary}15` },
  sonarCross: { position: 'absolute', backgroundColor: `${tokens.secondary}10` },
  sonarArmWrap: { position: 'absolute', width: 0, height: 0, left: SONAR_SIZE / 2, top: SONAR_SIZE / 2 },
  sonarArm: { position: 'absolute', left: 0, top: 0, width: SONAR_SIZE / 2, height: 1.5, backgroundColor: tokens.secondary },
  sonarBlip: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.secondary },
  sonarDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${tokens.secondary}18`, borderWidth: 1, borderColor: `${tokens.secondary}50`, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
});
