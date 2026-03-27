import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { TrendingUp, AlertTriangle, Bell, Zap, Skull, BookMarked, ChevronRight, Shield, Search, Eye, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useGlobalStats, useTopTokens } from '../../src/lib/query';
import { Swipeable } from 'react-native-gesture-handler';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { useBriefingStore, startBriefingListener } from '../../src/lib/openclaw-briefing';
import { BriefingActionCard } from '../../src/components/radar/BriefingActionCard';
import { maybeAutoInvestigate } from '../../src/lib/auto-investigate';
import { tokens } from '../../src/theme/tokens';
import type { TopToken, AlertItem } from '../../src/types/api';
import { timeAgo } from '../../src/lib/format';
import { SonarSweep } from '../../src/components/radar/SonarSweep';
import { RadarTokenCard } from '../../src/components/radar/RadarTokenCard';
import { SectionTitle } from '../../src/components/radar/SectionTitle';

// ── Helpers ─────────────────────────────────────────────────────────────────

function topTokenToSearchResult(t: TopToken) {
  return {
    mint: t.mint, name: t.name, symbol: t.symbol, image_uri: t.image_uri ?? '',
    metadata_uri: '', dex_url: '',
    market_cap_usd: t.mcap_usd ?? null, pair_created_at: t.created_at ?? null,
  };
}

const ALERT_ICONS: Record<AlertItem['type'], React.ReactNode> = {
  rug: <AlertTriangle size={14} color={tokens.risk.critical} />,
  bundle: <Zap size={14} color={tokens.risk.high} />,
  insider: <Zap size={14} color={tokens.risk.medium} />,
  zombie: <Skull size={14} color={tokens.accent} />,
  death_clock: <Skull size={14} color={tokens.risk.critical} />,
  deployer: <BookMarked size={14} color={tokens.secondary} />,
  narrative: <Bell size={14} color={tokens.secondary} />,
  token_graduated: <TrendingUp size={14} color={tokens.success} />,
  deployer_launch: <BookMarked size={14} color={tokens.risk.medium} />,
  wallet_risk: <AlertTriangle size={14} color={tokens.risk.high} />,
};

function EmptyFeed() {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={s.emptyContainer}>
      <SonarSweep />
      <Text style={s.emptyTitle}>Listening to the blockchain...</Text>
      <Text style={s.emptySubtitle}>Live alerts will appear here as threats are detected on-chain.</Text>
      <TouchableOpacity onPress={() => router.push('/(tabs)/scan' as any)} style={s.emptyCta} activeOpacity={0.7}>
        <Search size={14} color={tokens.secondary} />
        <Text style={s.emptyCtaText}>Scan your first token</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats();
  const { data: topTokens, isLoading: topLoading, refetch: refetchTopTokens } = useTopTokens(10);

  const _rawAddAlert = useAlertsStore((st) => st.addAlert);
  const addAlert = useCallback((alert: any) => { _rawAddAlert(alert); maybeAutoInvestigate(alert); }, [_rawAddAlert]);
  const setWsConnected = useAlertsStore((st) => st.setWsConnected);
  const wsConnected = useAlertsStore((st) => st.wsConnected);
  const markRead = useAlertsStore((st) => st.markRead);
  const allAlerts = useAlertsStore((st) => st.alerts);
  const recentAlerts = useMemo(() => allAlerts.filter((a) => !a.read).slice(0, 3), [allAlerts]);
  const totalUnread = useMemo(() => allAlerts.filter((a) => !a.read).length, [allAlerts]);

  const apiKey = useAuthStore((st) => st.apiKey);
  const user = useAuthStore((st) => st.user);
  const recentSearches = useAuthStore((st) => st.recentSearches);
  const insets = useSafeAreaInsets();

  const briefing = useBriefingStore((st) => st.latest);
  const briefingGeneratedAt = useBriefingStore((st) => st.generatedAt);
  const briefingSections = useBriefingStore((st) => st.sections);
  const briefingUnread = useBriefingStore((st) => st.unread);
  const markBriefingRead = useBriefingStore((st) => st.markRead);

  useEffect(() => {
    const unsub = startBriefingListener(apiKey ?? undefined);
    return () => { unsub(); };
  }, [apiKey]);

  const refreshing = statsLoading || topLoading;
  const onRefresh = () => { refetchStats(); refetchTopTokens(); };
  const displayedTokens = (topTokens ?? []).slice(0, 3);

  // Contextual greeting
  const rugsToday = stats?.tokens_rugged_24h ?? 0;
  const scannedToday = stats?.tokens_scanned_24h ?? 0;
  const contextLine = totalUnread > 0
    ? `${totalUnread} new alert${totalUnread > 1 ? 's' : ''}${rugsToday > 0 ? ` · ${rugsToday} rug${rugsToday > 1 ? 's' : ''} detected` : ''}`
    : rugsToday > 0
      ? `${rugsToday} rug${rugsToday > 1 ? 's' : ''} detected today`
      : scannedToday > 0
        ? `${scannedToday} tokens scanned today`
        : 'All clear — no threats detected';

  // Pulse animation for live dot
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (wsConnected) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [wsConnected]);
  const pulseDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  return (
    <View style={s.container}>
      <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>

        {/* ── Top bar ────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <View>
              <Text style={s.greetingText}>
                {user?.display_name ?? user?.username ?? 'Agent'}
              </Text>
              <View style={s.statusRow}>
                <Animated.View style={[s.statusDot, { backgroundColor: wsConnected ? tokens.success : tokens.risk.critical }, wsConnected && pulseDotStyle]} />
                <Text style={[s.statusText, wsConnected && { color: tokens.success }]}>
                  {wsConnected ? 'Live' : 'Offline'}
                </Text>
                <Text style={s.contextText}>{contextLine}</Text>
              </View>
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/account' as any)} hitSlop={8} style={s.avatarBtn}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarLetter}>{(user?.display_name ?? user?.username ?? 'A')[0]?.toUpperCase()}</Text>
            )}
            <View style={[s.avatarRing, { borderColor: wsConnected ? tokens.success : tokens.risk.critical }]} />
          </Pressable>
        </View>

        {/* ── Quick actions ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(250)} style={s.quickActions}>
          <TouchableOpacity style={s.qaBtn} onPress={() => router.push('/(tabs)/scan' as any)} activeOpacity={0.7}>
            <View style={[s.qaIcon, { backgroundColor: `${tokens.secondary}12` }]}>
              <Search size={16} color={tokens.secondary} strokeWidth={2} />
            </View>
            <Text style={s.qaLabel}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={() => router.push('/(tabs)/scan' as any)} activeOpacity={0.7}>
            <View style={[s.qaIcon, { backgroundColor: `${tokens.accent}12` }]}>
              <Eye size={16} color={tokens.accent} strokeWidth={2} />
            </View>
            <Text style={s.qaLabel}>Investigate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={() => router.push('/(tabs)/watchlist' as any)} activeOpacity={0.7}>
            <View style={[s.qaIcon, { backgroundColor: `${tokens.success}12` }]}>
              <Plus size={16} color={tokens.success} strokeWidth={2} />
            </View>
            <Text style={s.qaLabel}>Watch</Text>
          </TouchableOpacity>
        </Animated.View>

        {!wsConnected && allAlerts.length > 0 && (
          <View style={s.wsBanner}>
            <View style={[s.wsDot, { backgroundColor: tokens.risk.medium }]} />
            <Text style={s.wsBannerText}>Live feed offline — pull to refresh</Text>
          </View>
        )}

        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />}
        >
          {/* ── Hero stat card ────────────────────────────────────────── */}
          {!statsLoading && stats && scannedToday > 0 && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <GlassCard style={s.heroCard}>
                <View style={s.heroRow}>
                  <View style={s.heroStatBlock}>
                    <Text style={s.heroStatBig}>{scannedToday}</Text>
                    <Text style={s.heroStatLabel}>Scanned</Text>
                  </View>
                  <View style={s.heroStatDivider} />
                  <View style={s.heroStatBlock}>
                    <Text style={[s.heroStatBig, rugsToday > 0 && { color: tokens.accent }]}>{rugsToday}</Text>
                    <Text style={s.heroStatLabel}>Rugs</Text>
                  </View>
                  <View style={s.heroStatDivider} />
                  <View style={s.heroStatBlock}>
                    <Text style={[s.heroStatBig, { color: rugsToday > 0 ? tokens.accent : tokens.success }]}>
                      {stats.rug_rate_24h_pct != null ? `${stats.rug_rate_24h_pct.toFixed(1)}%` : '0%'}
                    </Text>
                    <Text style={s.heroStatLabel}>Rug Rate</Text>
                  </View>
                  <View style={s.heroStatDivider} />
                  <View style={s.heroStatBlock}>
                    <Text style={[s.heroStatBig, { color: tokens.secondary }]}>{stats.active_deployers_24h ?? 0}</Text>
                    <Text style={s.heroStatLabel}>Deployers</Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          )}

          {/* ── Briefing ──────────────────────────────────────────────── */}
          {briefing && (
            <Animated.View entering={FadeInDown.delay(60).duration(300)}>
              <BriefingActionCard
                text={briefing}
                generatedAt={briefingGeneratedAt}
                sections={briefingSections}
                unread={briefingUnread}
                onMarkRead={markBriefingRead}
              />
            </Animated.View>
          )}

          {/* ── Latest alerts ─────────────────────────────────────────── */}
          {recentAlerts.length > 0 && (
            <Animated.View entering={FadeInDown.delay(90).duration(300)}>
              <SectionTitle icon={<Bell size={13} color={tokens.secondary} />} title="LATEST ALERTS" liveDot={wsConnected} onSeeAll={() => router.push('/(tabs)/alerts' as any)} />
              <View style={s.alertList}>
                {recentAlerts.map((alert, i) => (
                  <Animated.View key={alert.id} entering={FadeInDown.delay(i * 40).duration(250).springify()}>
                    <Swipeable
                      overshootRight={false}
                      renderRightActions={() => (
                        <TouchableOpacity onPress={() => markRead(alert.id)} style={s.swipeDismiss}>
                          <Text style={s.swipeDismissText}>Dismiss</Text>
                        </TouchableOpacity>
                      )}
                      onSwipeableOpen={() => markRead(alert.id)}
                    >
                      <TouchableOpacity onPress={() => { markRead(alert.id); if (alert.mint) router.push(`/token/${alert.mint}` as any); }} activeOpacity={0.75}>
                        <View style={[s.alertCard, !alert.read && s.alertCardUnread]}>
                          {/* Token image or type icon */}
                          {alert.image_uri ? (
                            <Image source={{ uri: alert.image_uri }} style={s.alertImg} />
                          ) : (
                            <View style={s.alertIconWrap}>{ALERT_ICONS[alert.type] ?? <Bell size={14} color={tokens.secondary} />}</View>
                          )}
                          <View style={s.alertBody}>
                            <Text style={s.alertTitle} numberOfLines={1}>{alert.title ?? alert.token_name ?? alert.type.toUpperCase()}</Text>
                            <Text style={s.alertMsg} numberOfLines={1}>{alert.message}</Text>
                          </View>
                          <View style={s.alertRight}>
                            {alert.risk_score != null && alert.risk_score > 0 && (
                              <View style={[s.riskBadge, {
                                backgroundColor: alert.risk_score >= 75 ? `${tokens.risk.critical}20` : alert.risk_score >= 50 ? `${tokens.risk.high}20` : `${tokens.risk.medium}20`,
                                borderColor: alert.risk_score >= 75 ? `${tokens.risk.critical}40` : alert.risk_score >= 50 ? `${tokens.risk.high}40` : `${tokens.risk.medium}40`,
                              }]}>
                                <Text style={[s.riskBadgeText, {
                                  color: alert.risk_score >= 75 ? tokens.risk.critical : alert.risk_score >= 50 ? tokens.risk.high : tokens.risk.medium,
                                }]}>{alert.risk_score}</Text>
                              </View>
                            )}
                            <Text style={s.alertTime}>{timeAgo(alert.timestamp ?? alert.created_at ?? '')}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </Swipeable>
                  </Animated.View>
                ))}
              </View>
              {totalUnread > 3 && (
                <TouchableOpacity onPress={() => router.push('/(tabs)/alerts' as any)} style={s.moreAlerts} activeOpacity={0.7}>
                  <Text style={s.moreAlertsText}>{totalUnread - 3} more alert{totalUnread - 3 > 1 ? 's' : ''}</Text>
                  <ChevronRight size={12} color={tokens.secondary} />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* ── Trending ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(150).duration(300)}>
            <SectionTitle icon={<TrendingUp size={13} color={tokens.secondary} />} title="TRENDING" badge={!topLoading && displayedTokens.length > 0 ? `${displayedTokens.length}` : undefined} />
            {topLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={s.tokenCardSkeleton}><SkeletonBlock lines={2} /></View>
                ))
              : displayedTokens.length === 0
                ? <View style={s.emptyFeedCard}><Text style={s.emptyFeedText}>No trending tokens yet</Text></View>
                : <>
                    {displayedTokens.map((token: TopToken, index: number) => (
                      <Animated.View key={token.mint} entering={FadeInDown.delay(index * tokens.timing.listItem).duration(250).springify()}>
                        <RadarTokenCard token={topTokenToSearchResult(token)} apiKey={apiKey} onPress={() => router.push(`/token/${token.mint}` as any)} rank={index + 1} scanCount={token.event_count} />
                      </Animated.View>
                    ))}
                    {displayedTokens.length >= 3 && (
                      <TouchableOpacity onPress={() => router.push('/trending' as any)} style={s.feedSeeAll} activeOpacity={0.7}>
                        <Text style={s.feedSeeAllText}>See all</Text>
                        <ChevronRight size={14} color={tokens.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </>}
          </Animated.View>

          {/* ── Recent scans ──────────────────────────────────────────── */}
          {recentSearches.length > 0 && (
            <Animated.View entering={FadeInDown.delay(210).duration(300)}>
              <SectionTitle icon={<Search size={13} color={tokens.textTertiary} />} title="RECENT SCANS" />
              <View style={s.recentList}>
                {recentSearches.slice(0, 3).map((item) => (
                  <TouchableOpacity key={item.mint} onPress={() => router.push(`/token/${item.mint}` as any)} style={s.recentItem} activeOpacity={0.7}>
                    <View style={s.recentDot} />
                    <Text style={s.recentName} numberOfLines={1}>{item.name || item.symbol || item.mint.slice(0, 8)}</Text>
                    <ChevronRight size={12} color={tokens.white20} />
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          )}

          {/* ── Empty state ───────────────────────────────────────────── */}
          {recentAlerts.length === 0 && displayedTokens.length === 0 && !topLoading && <EmptyFeed />}

        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: tokens.spacing.screenPadding, gap: 14 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.screenPadding, paddingVertical: 8, marginBottom: 2 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  greetingText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100, marginBottom: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  contextText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginLeft: 4 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarLetter: { fontFamily: 'Lexend-Bold', fontSize: 16, color: tokens.white60 },
  avatarRing: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 21, borderWidth: 2 },

  // Quick actions
  quickActions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: tokens.spacing.screenPadding,
    marginBottom: 6,
  },
  qaBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.borderSubtle },
  qaIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny, color: tokens.white60, letterSpacing: 0.3 },

  // WS banner
  wsBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, marginHorizontal: tokens.spacing.screenPadding, marginBottom: 6, borderRadius: tokens.radius.xs, backgroundColor: `${tokens.risk.medium}10`, borderWidth: 1, borderColor: `${tokens.risk.medium}20` },
  wsDot: { width: 5, height: 5, borderRadius: 3 },
  wsBannerText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },

  // Hero card
  heroCard: { paddingVertical: 16, paddingHorizontal: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStatBlock: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatBig: { fontFamily: 'Lexend-Bold', fontSize: 20, color: tokens.white100 },
  heroStatLabel: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.textTertiary, letterSpacing: 0.3 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: tokens.borderSubtle },

  // Alerts
  alertList: { gap: 6 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle, paddingVertical: 10, paddingHorizontal: 12 },
  alertCardUnread: { borderColor: `${tokens.secondary}25`, backgroundColor: tokens.bgGlass8 },
  alertImg: { width: 28, height: 28, borderRadius: 8 },
  alertIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: tokens.bgGlass8, alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1 },
  alertTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white100 },
  alertMsg: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  alertRight: { alignItems: 'flex-end', gap: 4 },
  alertTime: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white20 },
  riskBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: tokens.radius.xs, borderWidth: 1 },
  riskBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 9 },
  swipeDismiss: { backgroundColor: tokens.bgGlass12, justifyContent: 'center', alignItems: 'center', width: 72, borderRadius: tokens.radius.sm, marginLeft: 6 },
  swipeDismissText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.white60 },
  moreAlerts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, marginTop: 2 },
  moreAlertsText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },

  // Trending
  tokenCardSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
  feedSeeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  feedSeeAllText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
  emptyFeedCard: { alignItems: 'center', paddingVertical: 20, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle },
  emptyFeedText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },

  // Recent scans
  recentList: { gap: 2 },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  recentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: tokens.secondary },
  recentName: { flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60 },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white20, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: `${tokens.secondary}40`, backgroundColor: `${tokens.secondary}08`, marginTop: 4 },
  emptyCtaText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
});
