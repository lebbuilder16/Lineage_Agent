import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TrendingUp, AlertTriangle, Bell, Zap, Skull, BookMarked, ChevronRight, User, Shield } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  deployer_launch: <BookMarked size={14} color={tokens.risk.medium} />,
  wallet_risk: <AlertTriangle size={14} color={tokens.risk.high} />,
};

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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats();
  const { data: topTokens, isLoading: topLoading, refetch: refetchTopTokens } = useTopTokens(10);

  const _rawAddAlert = useAlertsStore((s) => s.addAlert);
  const addAlert = useCallback((alert: any) => {
    _rawAddAlert(alert);
    maybeAutoInvestigate(alert);
  }, [_rawAddAlert]);
  const setWsConnected = useAlertsStore((s) => s.setWsConnected);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const markRead = useAlertsStore((s) => s.markRead);
  const allAlerts = useAlertsStore((s) => s.alerts);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const recentAlerts = useMemo(() =>
    allAlerts.filter((a) => !dismissedIds.has(a.id)).slice(0, 3),
    [allAlerts, dismissedIds],
  );
  const handleDismissAlert = (id: string) => {
    markRead(id);
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);
  const [wsStatus, setWsStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const insets = useSafeAreaInsets();

  const briefing = useBriefingStore((s) => s.latest);
  const briefingGeneratedAt = useBriefingStore((s) => s.generatedAt);
  const briefingSections = useBriefingStore((s) => s.sections);
  const briefingUnread = useBriefingStore((s) => s.unread);
  const markBriefingRead = useBriefingStore((s) => s.markRead);

  useEffect(() => {
    const unsubBriefing = startBriefingListener(apiKey ?? undefined);
    return () => { unsubBriefing(); };
  }, [apiKey]);

  const refreshing = statsLoading || topLoading;
  const onRefresh = () => { refetchStats(); refetchTopTokens(); };
  const rugRate = stats?.rug_rate_24h_pct != null ? `${stats.rug_rate_24h_pct.toFixed(1)}%` : null;
  const displayedTokens = (topTokens ?? []).slice(0, 3);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
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
                <View style={[styles.statusDot, { backgroundColor: wsConnected ? tokens.success : tokens.risk.critical }]} />
                <Text style={styles.statusText}>
                  {wsConnected ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/account' as any)} hitSlop={8} style={styles.avatarBtn}>
            <User size={18} color={tokens.white60} strokeWidth={2} />
          </Pressable>
        </View>

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.secondary} />}
        >
          {/* Stats bar */}
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={styles.statsBar}>
              {[
                { val: statsLoading ? '—' : stats?.tokens_scanned_24h ?? 0, label: 'Scanned' },
                { val: statsLoading ? '—' : stats?.tokens_rugged_24h ?? 0, label: 'Rugs', color: (stats?.tokens_rugged_24h ?? 0) > 0 ? tokens.accent : undefined },
                { val: rugRate ?? '0%', label: 'Rate', color: rugRate ? tokens.accent : undefined },
                { val: statsLoading ? '—' : stats?.active_deployers_24h ?? 0, label: 'Deployers', color: stats?.active_deployers_24h ? tokens.secondary : undefined },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, s.color ? { color: s.color } : undefined]}>{s.val}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.statDivider} />}
                </React.Fragment>
              ))}
            </View>
          </Animated.View>

          {/* Briefing */}
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

          {/* Trending tokens */}
          <Animated.View entering={FadeInDown.delay(120).duration(300)}>
            <SectionTitle icon={<TrendingUp size={13} color={tokens.secondary} />} title="TRENDING" badge={!topLoading && displayedTokens.length > 0 ? `${displayedTokens.length}` : undefined} />
            {topLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={styles.tokenCardSkeleton}><SkeletonBlock lines={2} /></View>
                ))
              : displayedTokens.length === 0
                ? <View style={styles.emptyFeedCard}><Text style={styles.emptyFeedText}>No activity yet — pull to refresh</Text></View>
                : <>
                    {displayedTokens.map((token: TopToken, index: number) => (
                      <Animated.View key={token.mint} entering={FadeInDown.delay(index * tokens.timing.listItem).duration(250).springify()}>
                        <RadarTokenCard token={topTokenToSearchResult(token)} apiKey={apiKey} onPress={() => router.push(`/token/${token.mint}` as any)} rank={index + 1} scanCount={token.event_count} />
                      </Animated.View>
                    ))}
                    {displayedTokens.length >= 3 && (
                      <TouchableOpacity onPress={() => router.push('/trending' as any)} style={styles.feedSeeAll} activeOpacity={0.7}>
                        <Text style={styles.feedSeeAllText}>See all</Text>
                        <ChevronRight size={14} color={tokens.secondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </>}
          </Animated.View>

          {/* Latest alerts */}
          {recentAlerts.length > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(300)}>
              <SectionTitle icon={<Bell size={13} color={tokens.secondary} />} title="LATEST ALERTS" liveDot={wsConnected} onSeeAll={() => router.push('/(tabs)/alerts' as any)} />
              <View style={styles.alertList} accessibilityLiveRegion="polite" accessibilityRole="alert">
                {recentAlerts.map((alert, i) => (
                  <Animated.View key={alert.id} entering={FadeInDown.delay(i * 40).duration(250).springify()}>
                    <Swipeable
                      overshootRight={false}
                      renderRightActions={() => (
                        <TouchableOpacity onPress={() => handleDismissAlert(alert.id)} style={styles.swipeDismiss}>
                          <Text style={styles.swipeDismissText}>Dismiss</Text>
                        </TouchableOpacity>
                      )}
                      onSwipeableOpen={() => handleDismissAlert(alert.id)}
                    >
                      <TouchableOpacity onPress={() => { markRead(alert.id); if (alert.mint) router.push(`/token/${alert.mint}` as any); }} activeOpacity={0.75}>
                        <View style={[styles.alertCard, !alert.read && styles.alertCardUnread]}>
                          <View style={styles.alertIconWrap}>{ALERT_ICONS[alert.type] ?? <Bell size={14} color={tokens.secondary} />}</View>
                          <View style={styles.alertBody}>
                            <Text style={styles.alertTitle} numberOfLines={1}>{alert.title ?? alert.token_name ?? alert.type.toUpperCase()}</Text>
                            <Text style={styles.alertMsg} numberOfLines={1}>{alert.message}</Text>
                          </View>
                          <Text style={styles.alertTime}>{timeAgo(alert.timestamp ?? alert.created_at ?? '')}</Text>
                        </View>
                      </TouchableOpacity>
                    </Swipeable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: tokens.spacing.screenPadding, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.screenPadding, paddingVertical: 10, marginBottom: 4 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMark: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${tokens.secondary}12`, borderWidth: 1, borderColor: `${tokens.secondary}20`, alignItems: 'center', justifyContent: 'center' },
  greetingText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white100, marginBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  avatarBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: tokens.bgGlass8, borderWidth: 1, borderColor: tokens.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  statsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.borderSubtle, paddingVertical: 14, paddingHorizontal: 8 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white80 },
  statLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: tokens.borderSubtle },
  wsBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, marginHorizontal: tokens.spacing.screenPadding, marginBottom: 6, borderRadius: tokens.radius.xs, backgroundColor: `${tokens.risk.medium}10`, borderWidth: 1, borderColor: `${tokens.risk.medium}20` },
  wsDot: { width: 5, height: 5, borderRadius: 3 },
  wsBannerText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  feedSeeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  feedSeeAllText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
  alertList: { gap: 6 },
  swipeDismiss: { backgroundColor: tokens.bgGlass12, justifyContent: 'center', alignItems: 'center', width: 72, borderRadius: tokens.radius.sm, marginLeft: 6 },
  swipeDismissText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.white60 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle, paddingVertical: 10, paddingHorizontal: 12 },
  alertCardUnread: { borderColor: `${tokens.secondary}25`, backgroundColor: tokens.bgGlass8 },
  alertIconWrap: { width: 20, alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1 },
  alertTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white100 },
  alertMsg: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  alertTime: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white20 },
  tokenCardSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
  emptyFeedCard: { alignItems: 'center', paddingVertical: 20, backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle },
  emptyFeedText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 16, gap: 12 },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white20, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  briefingCard: { borderWidth: 1, borderColor: `${tokens.secondary}20`, backgroundColor: `${tokens.secondary}06` },
  briefingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  briefingTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary, letterSpacing: 1.2 },
  briefingUnread: { width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.accent },
  briefingPreview: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, lineHeight: 18, marginTop: 8 },
  briefingContent: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white80, lineHeight: 20, marginTop: 8 },
  briefingMeta: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 8, letterSpacing: 0.3 },
});
