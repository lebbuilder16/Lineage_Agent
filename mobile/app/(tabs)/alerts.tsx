import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bell, CheckCheck, AlertTriangle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { AlertCard } from '../../src/components/alerts';
import { AlertFilterChips } from '../../src/components/alerts';
import { useAlertsStore } from '../../src/store/alerts';
import { useGraduations } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import type { AlertItem } from '../../src/types/api';

type QuickFilter = 'all' | 'critical' | 'unread' | 'live';
const QUICK_FILTERS: { label: string; value: QuickFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'live' },
  { label: 'Critical', value: 'critical' },
  { label: 'Unread', value: 'unread' },
];

const CRITICAL_TYPES = new Set(['rug', 'death_clock', 'bundle', 'insider']);

export default function AlertsScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const markRead = useAlertsStore((s) => s.markRead);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [expandedEnrichments, setExpandedEnrichments] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  // Enrich alerts missing token_name/image_uri from DexScreener search
  const enrichedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    // Detect alerts that need enrichment: no image, or name looks like a truncated address
    const needsEnrich = (a: AlertItem) => {
      if (!a.mint || enrichedRef.current.has(a.id)) return false;
      if (!a.image_uri) return true;
      // Name is just a truncated address (no real token name)
      const name = a.token_name || a.title || '';
      if (name.length <= 12 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(name)) return true;
      return false;
    };
    const missing = alerts.filter(needsEnrich).slice(0, 8);
    if (!missing.length) return;
    const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
    for (const a of missing) {
      enrichedRef.current.add(a.id);
      fetch(`${BASE}/search?q=${a.mint}&limit=1`)
        .then((r) => r.ok ? r.json() : [])
        .then((results: any[]) => {
          if (results.length > 0 && (results[0].name || results[0].image_uri)) {
            const store = useAlertsStore.getState();
            const updated = store.alerts.map((al) =>
              al.id === a.id
                ? {
                    ...al,
                    token_name: results[0].name || al.token_name,
                    image_uri: results[0].image_uri || al.image_uri,
                    title: (al.title && al.title.length <= 12) ? results[0].name || al.title : al.title,
                  }
                : al,
            );
            useAlertsStore.setState({ alerts: updated });
          }
        })
        .catch(() => {});
    }
  }, [alerts]);

  // Poll graduations via REST (doesn't depend on WebSocket)
  const { data: graduations } = useGraduations(20);
  const seenGradRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!graduations?.length) return;
    for (const g of graduations) {
      if (seenGradRef.current.has(g.mint)) continue;
      seenGradRef.current.add(g.mint);
      const displayName = g.name || g.symbol || g.mint.slice(0, 8);
      addAlert({
        id: `grad-${g.mint}-${g.timestamp}`,
        type: 'token_graduated',
        title: `${displayName}`,
        token_name: displayName,
        message: `Graduated to DEX — ${g.deployer?.slice(0, 8) ?? 'unknown'}...`,
        mint: g.mint,
        image_uri: g.image_uri || undefined,
        deployer: g.deployer,
        timestamp: new Date(g.timestamp * 1000).toISOString(),
        read: false,
      } as any);
    }
  }, [graduations, addAlert]);

  const toggleEnrichment = useCallback((id: string) => {
    setExpandedEnrichments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = alerts;
    if (activeFilter === 'critical') list = alerts.filter((a) => CRITICAL_TYPES.has(a.type));
    else if (activeFilter === 'unread') list = alerts.filter((a) => !a.read);
    else if (activeFilter === 'live') list = alerts.filter((a) => a.type === 'token_graduated' || a.type === 'deployer_launch');
    return [...list].sort((a, b) => {
      const ma = a.mint ?? '';
      const mb = b.mint ?? '';
      if (ma && mb && ma !== mb) return ma < mb ? -1 : 1;
      if (!a.read && b.read) return -1;
      if (a.read && !b.read) return 1;
      return (b.risk_score ?? 0) - (a.risk_score ?? 0);
    });
  }, [alerts, activeFilter]);

  const mintCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of filtered) {
      if (a.mint) counts.set(a.mint, (counts.get(a.mint) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  const alertSummary = useMemo(() => {
    const critCount = alerts.filter(a => (a.risk_score ?? 0) >= 75).length;
    const highCount = alerts.filter(a => (a.risk_score ?? 0) >= 50 && (a.risk_score ?? 0) < 75).length;
    if (critCount > 0) return `${critCount} critical · ${highCount} high risk`;
    if (highCount > 0) return `${highCount} high risk alerts`;
    return null;
  }, [alerts]);

  const handlePress = useCallback((alert: AlertItem) => {
    markRead(alert.id);
    if (alert.mint) router.push(`/token/${alert.mint}` as any);
  }, [markRead]);

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader
          icon={<Bell size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Alerts"
          subtitle={unreadCount > 0 ? `${unreadCount} new` : undefined}
          dotConnected={wsConnected}
          style={{ paddingHorizontal: 0 }}
          rightAction={
            unreadCount > 0 ? (
              <HapticButton
                variant="ghost"
                size="sm"
                onPress={markAllRead}
                accessibilityRole="button"
                accessibilityLabel="Mark all alerts as read"
              >
                <CheckCheck size={16} color={tokens.secondary} />
              </HapticButton>
            ) : null
          }
        />

        {alertSummary && wsConnected && (
          <View style={styles.triageBanner}>
            <AlertTriangle size={12} color={tokens.accent} />
            <Text style={styles.triageText}>{alertSummary}</Text>
          </View>
        )}

        {!wsConnected && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Alerts offline — reconnecting...</Text>
          </View>
        )}

        <AlertFilterChips
          filters={QUICK_FILTERS}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        {filtered.length === 0 ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.empty}>
            <GlassCard style={styles.emptyCard} noPadding={false}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: `${tokens.white100}10`, borderColor: `${tokens.white100}20` }]}>
                <Bell size={36} color={tokens.white60} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeFilter === 'critical' ? 'No critical alerts' : activeFilter === 'unread' ? 'All caught up' : activeFilter === 'live' ? 'No live graduations yet' : 'All clear for now'}
              </Text>
              <Text style={styles.emptySubtitle}>
                Your radar is silent. We will notify you when action happens.
              </Text>
            </GlassCard>
          </Animated.View>
        ) : (
          <Animated.FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const mintCount = item.mint ? (mintCounts.get(item.mint) ?? 0) : 0;
              const isFirstOfGroup = item.mint && mintCount > 1 &&
                (index === 0 || filtered[index - 1]?.mint !== item.mint);

              return (
                <Animated.View
                  exiting={FadeInDown}
                  entering={FadeInDown.delay(index * tokens.timing.listItem).springify()}
                  layout={LinearTransition.springify()}
                >
                  <AlertCard
                    item={item}
                    isExpanded={expandedEnrichments.has(item.id)}
                    groupHeader={
                      isFirstOfGroup
                        ? `${mintCount} alerts for ${item.token_name ?? item.mint?.slice(0, 8) ?? 'token'}`
                        : undefined
                    }
                    onPress={handlePress}
                    onToggleEnrichment={toggleEnrichment}
                    onDelete={deleteAlert}
                  />
                </Animated.View>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  triageBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${tokens.accent}12`, borderRadius: tokens.radius.sm,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
  },
  triageText: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny, color: tokens.accent },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${tokens.risk.critical}15`, borderRadius: tokens.radius.sm,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
  },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.risk.critical },
  offlineText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.risk.critical },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyCard: { alignItems: 'center', padding: 32, borderWidth: 1, borderColor: tokens.borderSubtle, width: '100%' },
  emptyIconWrapper: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1,
  },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60 },
  emptySubtitle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center' },
  listContent: { gap: 10 },
});
