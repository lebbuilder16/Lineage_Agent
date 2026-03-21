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
  Zap,
  Skull,
  BookMarked,
  ChevronRight,
  ScanLine,
  User,
  Shield,
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
import { useBriefingStore, startBriefingListener } from '../../src/lib/openclaw-briefing';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import { tokens } from '../../src/theme/tokens';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import type { TokenSearchResult, TopToken, AlertItem } from '../../src/types/api';
import { fmtMcap, fmtCount, timeAgo } from '../../src/lib/format';
import { deriveMarketRisk } from '../../src/lib/risk';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Alert type icons ─────────────────────────────────────────────────────────

const ALERT_ICONS: Record<AlertItem['type'], React.ReactNode> = {
  rug: <AlertTriangle size={14} color={tokens.risk.critical} />,
  bundle: <Zap size={14} color={tokens.risk.high} />,
  insider: <Zap size={14} color={tokens.risk.medium} />,
  zombie: <Skull size={14} color={tokens.accent} />,
  death_clock: <Skull size={14} color={tokens.risk.critical} />,
  deployer: <BookMarked size={14} color={tokens.secondary} />,
  narrative: <Bell size={14} color={tokens.secondary} />,
};

// ─── Radar Pulse Animation ───────────────────────────────────────────────────

const SONAR_SIZE = 140;
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
      {[0.33, 0.6, 0.88].map((ratio, i) => (
        <View
          key={i}
          style={[
            styles.sonarRing,
            { width: SONAR_SIZE * ratio, height: SONAR_SIZE * ratio, borderRadius: (SONAR_SIZE * ratio) / 2 },
          ]}
        />
      ))}
      <View style={[styles.sonarCross, { width: SONAR_SIZE, height: 1 }]} />
      <View style={[styles.sonarCross, { width: 1, height: SONAR_SIZE }]} />
      <Animated.View style={[styles.sonarArmWrap, trail2Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}30` }]} />
      </Animated.View>
      <Animated.View style={[styles.sonarArmWrap, trail1Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}55` }]} />
      </Animated.View>
      <Animated.View style={[styles.sonarArmWrap, armStyle]}>
        <View style={styles.sonarArm} />
      </Animated.View>
      {BLIPS.map((bp, i) => {
        const rad = (bp.a * Math.PI) / 180;
        const bx = R + bp.r * R * Math.cos(rad) - 4;
        const by = R + bp.r * R * Math.sin(rad) - 4;
        return (
          <Animated.View
            key={i}
            style={[styles.sonarBlip, { left: bx, top: by }, blipStyles[i]]}
          />
        );
      })}
      <View style={styles.sonarDot}>
        <Radar size={18} color={tokens.secondary} strokeWidth={2} />
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

// ─── Compact Stat Pill ──────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  icon,
  accentColor,
  onPress,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  accentColor: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={[styles.statPill, { borderColor: `${accentColor}15` }]}>
      <View style={[styles.statPillIcon, { backgroundColor: `${accentColor}10` }]}>
        {icon}
      </View>
      <View style={styles.statPillContent}>
        <NumberTicker value={value} color={accentColor} />
        <Text style={styles.statPillLabel}>{label}</Text>
      </View>
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ flex: 1 }}>
      {inner}
    </TouchableOpacity>
  );
}

// ─── Token Card ─────────────────────────────────────────────────────────────

function TokenCard({
  token,
  apiKey,
  onPress,
  rank,
  scanCount,
}: {
  token: TokenSearchResult;
  apiKey: string | null;
  onPress: () => void;
  rank?: number;
  scanCount?: number;
}) {
  const addMutation = useAddWatch(apiKey);
  const watches = useAuthStore((s) => s.watches);
  const isWatched = watches.some((w) => w.value === token.mint);
  const [justAdded, setJustAdded] = useState(false);
  const scaleAnim = useSharedValue(1);

  const isNew = token.pair_created_at
    ? Date.now() - new Date(token.pair_created_at).getTime() < 24 * 60 * 60 * 1000
    : false;
  const risk = deriveMarketRisk(token);

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
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.tokenCard, { borderLeftColor: `${riskAccent}40`, borderLeftWidth: 3 }]}>
        {/* Rank */}
        {rank != null && (
          <View style={styles.rankBadge}>
            <Text style={[
              styles.rankText,
              rank === 1 && { color: '#FFD700' },
              rank === 2 && { color: '#C0C0C0' },
              rank === 3 && { color: '#CD7F32' },
            ]}>
              {rank}
            </Text>
          </View>
        )}

        {/* Avatar */}
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
            {scanCount != null && scanCount > 0 && (
              <View style={styles.scanCountRow}>
                <ScanLine size={10} color={tokens.secondary} strokeWidth={2} />
                <Text style={styles.scanCountText}>{fmtCount(scanCount)}</Text>
              </View>
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
              >
                {isWatched || justAdded
                  ? <Check size={12} color={tokens.success} strokeWidth={2.5} />
                  : <BookmarkPlus size={12} color={tokens.white35} strokeWidth={2} />
                }
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty Feed ──────────────────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <SonarSweep />
      <Text style={styles.emptyTitle}>Listening to the blockchain...</Text>
      <Text style={styles.emptySubtitle}>
        Live alerts will appear here as threats are detected on-chain.
      </Text>
    </Animated.View>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionTitle({
  icon,
  title,
  badge,
  onSeeAll,
  liveDot,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  onSeeAll?: () => void;
  liveDot?: boolean;
}) {
  return (
    <Pressable
      onPress={onSeeAll}
      disabled={!onSeeAll}
      style={styles.sectionHeader}
    >
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
      {liveDot && <View style={styles.liveDot} />}
      {badge && <Text style={styles.feedTag}>{badge}</Text>}
      {onSeeAll && (
        <View style={styles.sectionSeeAll}>
          <Text style={styles.sectionSeeAllText}>See all</Text>
          <ChevronRight size={12} color={`${tokens.secondary}60`} strokeWidth={2.5} />
        </View>
      )}
    </Pressable>
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
  const recentAlerts = useMemo(() => allAlerts.slice(0, 2), [allAlerts]);

  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);

  const [wsStatus, setWsStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const wsCleanup = useRef<(() => void) | null>(null);
  const insets = useSafeAreaInsets();

  const briefing = useBriefingStore((s) => s.latest);
  const briefingUnread = useBriefingStore((s) => s.unread);
  const markBriefingRead = useBriefingStore((s) => s.markRead);
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  useEffect(() => {
    wsCleanup.current = connectAlertsWS(
      addAlert,
      undefined,
      setWsConnected,
      setWsStatus,
    );
    const unsubBriefing = startBriefingListener();
    return () => {
      wsCleanup.current?.();
      unsubBriefing();
    };
  }, []);

  const refreshing = statsLoading || topLoading;
  const onRefresh = () => { refetchStats(); refetchTopTokens(); };

  const rugRate = stats?.rug_rate_24h_pct != null
    ? `${stats.rug_rate_24h_pct.toFixed(1)}%`
    : null;

  const displayedTokens = (topTokens ?? []).slice(0, 5);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.logoMark}>
              <Shield size={16} color={tokens.secondary} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.greetingText}>
                {greeting}{user?.username ? `, ${user.username}` : ''}
              </Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: wsConnected ? tokens.success : tokens.risk.critical },
                ]} />
                <Text style={styles.statusText}>
                  {wsConnected ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/account' as any)}
            hitSlop={8}
            style={styles.avatarBtn}
          >
            <User size={18} color={tokens.white60} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Connection banner */}
        {wsStatus !== 'connected' && wsStatus !== 'offline' && (
          <View style={styles.wsBanner}>
            <View style={[styles.wsDot, { backgroundColor: tokens.risk.medium }]} />
            <Text style={styles.wsBannerText}>Reconnecting to live feed...</Text>
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />
          }
        >
          {/* Stats row */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statsRow}>
            <StatPill
              label="Scanned 24h"
              value={statsLoading ? null : stats?.tokens_scanned_24h ?? 0}
              icon={<Activity size={14} color={tokens.secondary} />}
              accentColor={tokens.secondary}
              onPress={() => router.push('/(tabs)/scan' as any)}
            />
            <StatPill
              label="Rugs 24h"
              value={statsLoading ? null : stats?.tokens_rugged_24h ?? 0}
              icon={<AlertTriangle size={14} color={tokens.accent} />}
              accentColor={tokens.accent}
              onPress={() => router.push('/(tabs)/alerts' as any)}
            />
          </Animated.View>

          {/* Rug rate */}
          {rugRate && (
            <Animated.View entering={FadeInDown.delay(60).duration(400)}>
              <View style={styles.rugRatePill}>
                <View style={styles.rugRateDot} />
                <Text style={styles.rugRateText}>
                  Rug rate 24h —{' '}
                  <Text style={{ color: tokens.accent }}>{rugRate}</Text>
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Agent Intelligence Summary */}
          {(() => {
            const recent = allAlerts.filter(a => Date.now() - new Date(a.timestamp ?? a.created_at ?? '').getTime() < 24 * 3600 * 1000);
            const criticalCount = recent.filter(a => (a.risk_score ?? 0) >= 75).length;
            const rugCount = recent.filter(a => a.type === 'rug').length;
            if (recent.length === 0) return null;
            const summary = criticalCount > 0
              ? `${criticalCount} critical event${criticalCount > 1 ? 's' : ''} in the last 24h — tap Alerts for details`
              : rugCount > 0
                ? `${rugCount} rug event${rugCount > 1 ? 's' : ''} detected today`
                : `${recent.length} event${recent.length > 1 ? 's' : ''} monitored — all clear`;
            return (
              <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.section}>
                <TouchableOpacity onPress={() => router.push('/(tabs)/alerts' as any)} activeOpacity={0.75}>
                  <GlassCard style={[styles.briefingCard, criticalCount > 0 && { borderColor: `${tokens.risk?.critical ?? tokens.accent}30`, borderWidth: 1 }]} noPadding={false}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Shield size={14} color={criticalCount > 0 ? (tokens.risk?.critical ?? tokens.accent) : tokens.secondary} />
                      <Text style={[styles.briefingTitle, { flex: 1 }]}>AGENT INTEL</Text>
                      <ChevronRight size={14} color={tokens.white35} />
                    </View>
                    <Text style={[styles.briefingPreview, { marginTop: 6 }]}>{summary}</Text>
                  </GlassCard>
                </TouchableOpacity>
              </Animated.View>
            );
          })()}

          {/* Daily Briefing (OpenClaw) */}
          {briefing ? (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
              <TouchableOpacity
                onPress={() => {
                  setBriefingExpanded((v) => !v);
                  if (briefingUnread) markBriefingRead();
                }}
                activeOpacity={0.8}
              >
                <GlassCard style={styles.briefingCard} noPadding={false}>
                  <View style={styles.briefingHeader}>
                    <View style={styles.briefingTitleRow}>
                      <View style={styles.briefingDot} />
                      <Text style={styles.briefingTitle}>DAILY BRIEFING</Text>
                      {briefingUnread && <View style={styles.briefingUnread} />}
                    </View>
                    <ChevronRight
                      size={14}
                      color={tokens.secondary}
                      style={briefingExpanded ? { transform: [{ rotate: '90deg' }] } : undefined}
                    />
                  </View>
                  <Text
                    style={briefingExpanded ? styles.briefingContent : styles.briefingPreview}
                    numberOfLines={briefingExpanded ? undefined : 2}
                    selectable={briefingExpanded}
                  >
                    {briefing}
                  </Text>
                </GlassCard>
              </TouchableOpacity>
            </Animated.View>
          ) : isOpenClawAvailable() && (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
              <GlassCard style={styles.briefingCard} noPadding={false}>
                <View style={styles.briefingHeader}>
                  <View style={styles.briefingTitleRow}>
                    <Zap size={12} color={tokens.secondary} />
                    <Text style={styles.briefingTitle}>DAILY BRIEFING</Text>
                  </View>
                </View>
                <Text style={styles.briefingPreview}>
                  Briefing en preparation — next generation scheduled. Data will appear here automatically.
                </Text>
              </GlassCard>
            </Animated.View>
          )}

          {/* Live Alerts */}
          <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.section}>
            <SectionTitle
              icon={<Bell size={13} color={tokens.secondary} />}
              title="LIVE ALERTS"
              liveDot={wsConnected}
              onSeeAll={() => router.push('/(tabs)/alerts' as any)}
            />

            {recentAlerts.length === 0 ? (
              <EmptyFeed />
            ) : (
              <View style={styles.alertList}>
                {recentAlerts.map((alert, i) => (
                  <Animated.View
                    key={alert.id}
                    entering={FadeInDown.delay(i * 50).duration(300).springify()}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        markRead(alert.id);
                        if (alert.mint) router.push(`/token/${alert.mint}` as any);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.alertCard, !alert.read && styles.alertCardUnread]}>
                        <View style={styles.alertIconWrap}>
                          {ALERT_ICONS[alert.type] ?? <Bell size={14} color={tokens.secondary} />}
                        </View>
                        <View style={styles.alertBody}>
                          <Text style={styles.alertTitle} numberOfLines={1}>
                            {alert.title ?? alert.token_name ?? alert.type.toUpperCase()}
                          </Text>
                          <Text style={styles.alertMsg} numberOfLines={1}>
                            {alert.message}
                          </Text>
                        </View>
                        <View style={styles.alertMetaCol}>
                          <Text style={styles.alertTime}>
                            {timeAgo(alert.timestamp ?? alert.created_at ?? '')}
                          </Text>
                          {!alert.read && <View style={styles.alertUnreadDot} />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Most Scanned */}
          <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.section}>
            <SectionTitle
              icon={<TrendingUp size={13} color={tokens.secondary} />}
              title="MOST SCANNED 24H"
              badge={!topLoading && displayedTokens.length > 0 ? `${displayedTokens.length}` : undefined}
            />

            {topLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={styles.tokenCard}>
                    <SkeletonBlock lines={2} />
                  </View>
                ))
              : displayedTokens.length === 0
                ? (
                  <View style={styles.emptyFeedCard}>
                    <Text style={styles.emptyFeedText}>No activity in 24h — pull to refresh</Text>
                  </View>
                )
                : <>
                    {displayedTokens.map((token: TopToken, index: number) => (
                      <Animated.View
                        key={token.mint}
                        entering={FadeInDown.delay(index * 30).duration(280).springify()}
                      >
                        <TokenCard
                          token={topTokenToSearchResult(token)}
                          apiKey={apiKey}
                          onPress={() => router.push(`/token/${token.mint}` as any)}
                          rank={index + 1}
                          scanCount={token.event_count}
                        />
                      </Animated.View>
                    ))}
                    {displayedTokens.length >= 5 && (
                      <TouchableOpacity
                        onPress={() => router.push('/(tabs)/scan' as any)}
                        style={styles.feedSeeAll}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.feedSeeAllText}>See all tokens</Text>
                        <ChevronRight size={14} color={tokens.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </>
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
  scrollContent: { paddingHorizontal: tokens.spacing.screenPadding, gap: 14 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 10,
    marginBottom: 4,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${tokens.secondary}12`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // WS banner
  wsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    marginHorizontal: tokens.spacing.screenPadding,
    marginBottom: 6,
    borderRadius: tokens.radius.xs,
    backgroundColor: `${tokens.risk.medium}10`,
    borderWidth: 1,
    borderColor: `${tokens.risk.medium}20`,
  },
  wsDot: { width: 5, height: 5, borderRadius: 3 },
  wsBannerText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10 },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  statPillIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statPillContent: { flex: 1 },
  statPillLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 1,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    lineHeight: 22,
  },

  // Rug rate
  rugRatePill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${tokens.accent}08`,
    borderWidth: 1,
    borderColor: `${tokens.accent}18`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rugRateDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.accent },
  rugRateText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35 },

  // Section
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1.5,
  },
  sectionSeeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionSeeAllText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: `${tokens.secondary}60`, letterSpacing: 0.3 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.success },
  feedTag: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: `${tokens.secondary}60`,
    letterSpacing: 1,
    marginLeft: 'auto',
  },
  feedSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  feedSeeAllText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },

  // Alert cards
  alertList: { gap: 6 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  alertCardUnread: {
    borderColor: `${tokens.secondary}25`,
    backgroundColor: tokens.bgGlass8,
  },
  alertIconWrap: { width: 20, alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1 },
  alertMetaCol: { alignItems: 'flex-end', gap: 3 },
  alertTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white100 },
  alertMsg: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, marginTop: 2 },
  alertTime: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white20 },
  alertUnreadDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.secondary },

  // Token cards
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 12,
    overflow: 'hidden',
  },
  rankBadge: { width: 20, alignItems: 'center' },
  rankText: { fontFamily: 'Lexend-Bold', fontSize: 11, color: tokens.white35 },
  tokenImage: { width: 38, height: 38, borderRadius: 10 },
  tokenImageFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  tokenImageFallbackText: { fontFamily: 'Lexend-Bold', fontSize: 13, color: tokens.white60 },
  tokenInfo: { flex: 1, gap: 3 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100, flexShrink: 1 },
  tokenMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35 },
  tokenMcap: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  scanCountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scanCountText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: `${tokens.secondary}70` },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  newBadge: { backgroundColor: `${tokens.secondary}15`, borderRadius: tokens.radius.pill, paddingHorizontal: 5, paddingVertical: 2 },
  newBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.secondary, letterSpacing: 0.8 },
  watchBtn: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnActive: { borderColor: `${tokens.success}40`, backgroundColor: `${tokens.success}10` },

  // Empty
  emptyFeedCard: { alignItems: 'center', paddingVertical: 20, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle },
  emptyFeedText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 16, gap: 12 },

  // Sonar
  sonarContainer: { width: SONAR_SIZE, height: SONAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', borderWidth: 1, borderColor: `${tokens.secondary}12` },
  sonarCross: { position: 'absolute', backgroundColor: `${tokens.secondary}08` },
  sonarArmWrap: { position: 'absolute', width: 0, height: 0, left: SONAR_SIZE / 2, top: SONAR_SIZE / 2 },
  sonarArm: { position: 'absolute', left: 0, top: 0, width: SONAR_SIZE / 2, height: 1.5, backgroundColor: tokens.secondary },
  sonarBlip: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.secondary },
  sonarDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${tokens.secondary}14`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white20, textAlign: 'center', maxWidth: 240, lineHeight: 18 },

  // Briefing
  briefingCard: {
    borderWidth: 1,
    borderColor: `${tokens.secondary}20`,
    backgroundColor: `${tokens.secondary}06`,
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  briefingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  briefingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.secondary,
  },
  briefingTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
    letterSpacing: 1.2,
  },
  briefingUnread: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.accent,
  },
  briefingPreview: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
    lineHeight: 18,
    marginTop: 8,
  },
  briefingContent: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 20,
    marginTop: 8,
  },
});
