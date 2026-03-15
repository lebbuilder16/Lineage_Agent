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
  Zap,
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
import { useGlobalStats, useSearchTokens, useAddWatch } from '../../src/lib/query';
import { connectAlertsWS } from '../../src/lib/api';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import type { TokenSearchResult } from '../../src/types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const PULSE_SIZE = 90;

function RadarPulse() {
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);

  useEffect(() => {
    const cfg = { duration: 2400, easing: Easing.out(Easing.quad) };
    ring1.value = withRepeat(withTiming(1, cfg), -1, false);
    ring2.value = withDelay(800, withRepeat(withTiming(1, cfg), -1, false));
    ring3.value = withDelay(1600, withRepeat(withTiming(1, cfg), -1, false));
  }, []);

  const r1Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ring1.value, [0, 1], [0.4, 2.6]) }],
    opacity: interpolate(ring1.value, [0, 0.3, 1], [0.7, 0.5, 0]),
  }));
  const r2Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ring2.value, [0, 1], [0.4, 2.6]) }],
    opacity: interpolate(ring2.value, [0, 0.3, 1], [0.7, 0.5, 0]),
  }));
  const r3Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ring3.value, [0, 1], [0.4, 2.6]) }],
    opacity: interpolate(ring3.value, [0, 0.3, 1], [0.7, 0.5, 0]),
  }));

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.pulseRing, r1Style]} />
      <Animated.View style={[styles.pulseRing, r2Style]} />
      <Animated.View style={[styles.pulseRing, r3Style]} />
      <View style={styles.pulseDot}>
        <Radar size={22} color={tokens.secondary} strokeWidth={2} />
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
      <RadarPulse />
      <Text style={styles.emptyTitle}>Listening to the blockchain…</Text>
      <Text style={styles.emptySubtitle}>
        Live alerts will appear here as threats are detected on-chain.
      </Text>
    </Animated.View>
  );
}

// ─── Feed query pool — always returns real data ───────────────────────────────
const FEED_QUERIES = ['pump', 'sol', 'ai', 'cat', 'dog'];

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats();

  // Pick a random stable query from the pool so each open feels fresh
  const [queryIndex] = useState(() => Math.floor(Math.random() * FEED_QUERIES.length));
  const feedQuery = FEED_QUERIES[queryIndex];
  const { data: feedTokens, isLoading: feedLoading, refetch: refetchFeed } =
    useSearchTokens(feedQuery, true);

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

  const refreshing = statsLoading || feedLoading;
  const onRefresh = () => { refetchStats(); refetchFeed(); };

  const rugRate = stats?.rug_rate_24h_pct != null
    ? `${stats.rug_rate_24h_pct.toFixed(1)}%`
    : null;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />
          }
        >
          {/* Header */}
          <ScreenHeader
            icon={<Radar size={26} color={tokens.secondary} strokeWidth={2.5} />}
            title="Lineage Agent"
            subtitle="Live Threat Intelligence"
            dotConnected={wsConnected}
            paddingBottom={24}
            style={{ paddingHorizontal: 0 }}
          />

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
              <StatCard
                label="Deployers"
                value={statsLoading ? null : stats?.active_deployers_24h ?? 0}
                icon={<Zap size={15} color={tokens.warning} />}
                accentColor={tokens.warning}
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

          {/* ── Live Feed ── */}
          <Animated.View
            entering={FadeInDown.delay(180).duration(400)}
            style={[styles.section, { marginTop: 24 }]}
          >
            <View style={styles.sectionHeader}>
              <TrendingUp size={14} color={tokens.secondary} />
              <Text style={styles.sectionTitle}>LIVE FEED</Text>
              <Text style={styles.feedTag}>#{feedQuery.toUpperCase()}</Text>
            </View>

            {feedLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <GlassCard key={i} noPadding style={{ marginBottom: 0 }}>
                    <View style={{ padding: tokens.spacing.cardPadding }}>
                      <SkeletonBlock lines={2} />
                    </View>
                  </GlassCard>
                ))
              : (feedTokens ?? []).length === 0
                ? (
                  <GlassCard style={styles.emptyFeedCard}>
                    <Text style={styles.emptyFeedText}>No tokens found — pull to refresh</Text>
                  </GlassCard>
                )
                : (feedTokens ?? []).slice(0, 20).map((token: TokenSearchResult, index: number) => (
                    <Animated.View
                      key={token.mint}
                      entering={FadeInDown.delay(index * 35).duration(320).springify()}
                    >
                      <TokenCard
                        token={token}
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
  pulseContainer: { width: PULSE_SIZE, height: PULSE_SIZE, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: PULSE_SIZE, height: PULSE_SIZE, borderRadius: PULSE_SIZE / 2, borderWidth: 1.5, borderColor: tokens.secondary },
  pulseDot: { width: 46, height: 46, borderRadius: 23, backgroundColor: `${tokens.secondary}18`, borderWidth: 1, borderColor: `${tokens.secondary}40`, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
});
