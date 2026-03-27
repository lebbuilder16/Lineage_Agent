import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import { tokens } from '../../src/theme/tokens';
import type { AlertItem } from '../../src/types/api';

// ── Filter types ────────────────────────────────────────────────────────────

type QuickFilter = 'all' | 'critical' | 'unread' | 'rug' | 'bundle' | 'insider' | 'deployer' | 'wallet_risk';

const QUICK_FILTERS: { label: string; value: QuickFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Unread', value: 'unread' },
  { label: 'Rug', value: 'rug' },
  { label: 'Bundle', value: 'bundle' },
  { label: 'Insider', value: 'insider' },
  { label: 'Deployer', value: 'deployer' },
  { label: 'Wallet', value: 'wallet_risk' },
];

const CRITICAL_TYPES = new Set(['rug', 'death_clock', 'bundle', 'insider']);
const TYPE_FILTERS = new Set<QuickFilter>(['rug', 'bundle', 'insider', 'deployer', 'wallet_risk']);
const keyExtractor = (item: AlertItem) => item.id;

// ── Time sections ───────────────────────────────────────────────────────────

type TimeSection = 'today' | 'yesterday' | 'earlier';

function getTimeSection(ts: string | undefined): TimeSection {
  if (!ts) return 'earlier';
  const now = new Date();
  const d = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const t = d.getTime();
  if (t >= todayStart) return 'today';
  if (t >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

const SECTION_LABELS: Record<TimeSection, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const markRead = useAlertsStore((s) => s.markRead);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const unreadCount = useAlertsStore((s) => {
    let count = 0;
    for (let i = 0; i < s.alerts.length; i++) if (!s.alerts[i].read) count++;
    return count;
  });
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [expandedEnrichments, setExpandedEnrichments] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const wasConnectedRef = useRef(false);

  // Track if WS was ever connected (to avoid showing offline banner on cold start)
  if (wsConnected) wasConnectedRef.current = true;

  const toggleEnrichment = useCallback((id: string) => {
    setExpandedEnrichments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Filter alerts
  const filtered = useMemo(() => {
    let list = alerts;
    if (activeFilter === 'critical') list = alerts.filter((a) => CRITICAL_TYPES.has(a.type));
    else if (activeFilter === 'unread') list = alerts.filter((a) => !a.read);
    else if (TYPE_FILTERS.has(activeFilter)) list = alerts.filter((a) => a.type === activeFilter);
    // Sort: unread first, then risk score desc
    return [...list].sort((a, b) => {
      if (!a.read && b.read) return -1;
      if (a.read && !b.read) return 1;
      return (b.risk_score ?? 0) - (a.risk_score ?? 0);
    });
  }, [alerts, activeFilter]);

  // Group into time sections
  const sections = useMemo(() => {
    const buckets: Record<TimeSection, AlertItem[]> = { today: [], yesterday: [], earlier: [] };
    for (const a of filtered) {
      buckets[getTimeSection(a.timestamp ?? a.created_at)].push(a);
    }
    const result: { title: string; key: TimeSection; data: AlertItem[] }[] = [];
    const order: TimeSection[] = ['today', 'yesterday', 'earlier'];
    for (const key of order) {
      if (buckets[key].length > 0) {
        result.push({ title: `${SECTION_LABELS[key]} · ${buckets[key].length}`, key, data: buckets[key] });
      }
    }
    return result;
  }, [filtered]);

  // Count alerts per mint for grouping badges
  const mintCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of filtered) {
      if (a.mint) counts.set(a.mint, (counts.get(a.mint) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  // Alert summary for header — based on filtered list
  const alertSummary = useMemo(() => {
    const critCount = filtered.filter(a => (a.risk_score ?? 0) >= 75).length;
    const highCount = filtered.filter(a => (a.risk_score ?? 0) >= 50 && (a.risk_score ?? 0) < 75).length;
    if (critCount > 0) return `${critCount} critical · ${highCount} high risk`;
    if (highCount > 0) return `${highCount} high risk alerts`;
    return null;
  }, [filtered]);

  const handlePress = useCallback((alert: AlertItem) => {
    markRead(alert.id);
    toggleEnrichment(alert.id);
  }, [markRead, toggleEnrichment]);

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

        {/* Risk triage summary */}
        {alertSummary && wsConnected && (
          <View style={styles.triageBanner}>
            <AlertTriangle size={12} color={tokens.accent} />
            <Text style={styles.triageText}>{alertSummary}</Text>
          </View>
        )}

        {/* Offline banner — only if WS was previously connected */}
        {!wsConnected && wasConnectedRef.current && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Alerts offline — reconnecting…</Text>
          </View>
        )}

        {/* Filter chips — scrollable */}
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
                {activeFilter === 'critical' ? 'No critical alerts'
                  : activeFilter === 'unread' ? 'All caught up'
                  : TYPE_FILTERS.has(activeFilter) ? `No ${activeFilter.replace('_', ' ')} alerts`
                  : !wsConnected && alerts.length === 0 ? 'Connecting...'
                  : 'All clear for now'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {!wsConnected && alerts.length === 0
                  ? 'Waiting for live feed connection'
                  : 'Your radar is silent. We will notify you when action happens.'}
              </Text>
            </GlassCard>
          </Animated.View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={keyExtractor}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            maxToRenderPerBatch={12}
            windowSize={7}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item, index }) => {
              const mintCount = item.mint ? (mintCounts.get(item.mint) ?? 0) : 0;

              return (
                <Animated.View
                  entering={index < 15 ? FadeInDown.delay(index * tokens.timing.listItem).springify() : undefined}
                  layout={LinearTransition.springify()}
                >
                  <AlertCard
                    item={item}
                    isExpanded={expandedEnrichments.has(item.id)}
                    groupHeader={undefined}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${tokens.accent}12`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  triageText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${tokens.risk.critical}15`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.risk.critical,
  },
  offlineText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk.critical,
  },

  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  sectionHeaderText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 0.5,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    width: '100%',
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },
  emptySubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textTertiary,
    textAlign: 'center',
  },

  listContent: { gap: 6 },
});
