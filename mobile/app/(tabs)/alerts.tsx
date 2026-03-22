import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bell, CheckCheck, AlertTriangle, Zap, Skull, BookMarked, Trash2, ChevronDown, ChevronUp, Bot, Search, Bookmark } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useAlertsStore } from '../../src/store/alerts';
import { tokens } from '../../src/theme/tokens';
import { timeAgo } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import type { AlertItem } from '../../src/types/api';

const CHANNEL_COLORS: Record<string, string> = {
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  discord: '#5865F2',
  push: tokens.secondary,
};

const ALERT_ICONS: Record<string, React.ReactNode> = {
  rug: <AlertTriangle size={18} color={tokens.risk.critical} />,
  bundle: <Zap size={18} color={tokens.risk.high} />,
  insider: <Zap size={18} color={tokens.risk.medium} />,
  zombie: <Skull size={18} color={tokens.accent} />,
  death_clock: <Skull size={18} color={tokens.risk.critical} />,
  deployer: <BookMarked size={18} color={tokens.secondary} />,
  narrative: <Bell size={18} color={tokens.secondary} />,
};

type QuickFilter = 'all' | 'critical' | 'unread';
const QUICK_FILTERS: { label: string; value: QuickFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Unread', value: 'unread' },
];

export default function AlertsScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const markRead = useAlertsStore((s) => s.markRead);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [expandedEnrichments, setExpandedEnrichments] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  const toggleEnrichment = useCallback((id: string) => {
    setExpandedEnrichments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const CRITICAL_TYPES = new Set(['rug', 'death_clock', 'bundle', 'insider']);
  const filtered = useMemo(() => {
    let list = alerts;
    if (activeFilter === 'critical') list = alerts.filter((a) => CRITICAL_TYPES.has(a.type));
    else if (activeFilter === 'unread') list = alerts.filter((a) => !a.read);
    // Smart triage: sort by risk score descending, unread first
    return [...list].sort((a, b) => {
      if (!a.read && b.read) return -1;
      if (a.read && !b.read) return 1;
      return (b.risk_score ?? 0) - (a.risk_score ?? 0);
    });
  }, [alerts, activeFilter]);

  // Alert summary for header
  const alertSummary = useMemo(() => {
    const critCount = alerts.filter(a => (a.risk_score ?? 0) >= 75).length;
    const highCount = alerts.filter(a => (a.risk_score ?? 0) >= 50 && (a.risk_score ?? 0) < 75).length;
    if (critCount > 0) return `${critCount} critical · ${highCount} high risk`;
    if (highCount > 0) return `${highCount} high risk alerts`;
    return null;
  }, [alerts]);

  const handlePress = (alert: AlertItem) => {
    markRead(alert.id);
    if (alert.mint) router.push(`/token/${alert.mint}` as any);
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
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

        {/* Offline banner */}
        {!wsConnected && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Alerts offline — reconnecting…</Text>
          </View>
        )}

        {/* Quick filter chips */}
        <View style={styles.chipsRow}>
          {QUICK_FILTERS.map((ft) => (
            <TouchableOpacity
              key={ft.value}
              onPress={() => setActiveFilter(ft.value)}
              style={[styles.chip, activeFilter === ft.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, activeFilter === ft.value && styles.chipTextActive]}>{ft.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.empty}>
            <GlassCard style={styles.emptyCard} noPadding={false}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: `${tokens.white100}10`, borderColor: `${tokens.white100}20` }]}>
                <Bell size={36} color={tokens.white60} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeFilter === 'critical' ? 'No critical alerts' : activeFilter === 'unread' ? 'All caught up' : 'All clear for now'}
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
            renderItem={({ item, index }) => (
              <Animated.View exiting={FadeInDown} entering={FadeInDown.delay(index * 50).springify()} layout={LinearTransition.springify()}>
                <Swipeable
                  key={item.id}
                  containerStyle={styles.swipeContainer}
                  renderRightActions={() => (
                    <TouchableOpacity
                      style={styles.deleteAction}
                      onPress={() => {
                        Alert.alert(
                          'Delete alert?',
                          undefined,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => { haptic.heavy(); deleteAlert(item.id); },
                            },
                          ],
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Trash2 color={tokens.white100} size={20} />
                    </TouchableOpacity>
                  )}
                >
                  <TouchableOpacity
                    onPress={() => handlePress(item)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.type} alert: ${item.title ?? item.token_name ?? item.type}. ${item.read ? 'Read' : 'Unread'}`}
                  >
                    <GlassCard
                      style={[styles.alertCard, !item.read && styles.alertCardUnread]}
                      noPadding
                    >
                  {/* Main row */}
                  <View style={styles.alertInner}>
                    <View style={styles.alertIcon}>
                      {ALERT_ICONS[item.type] ?? <Bell size={18} color={tokens.primary} />}
                    </View>
                    <View style={styles.alertBody}>
                      <Text style={styles.alertTitle} numberOfLines={1}>
                        {item.title ?? item.token_name ?? item.type.toUpperCase()}
                      </Text>
                      <Text style={styles.alertMessage} numberOfLines={2}>
                        {item.message}
                      </Text>
                      {/* Delivered channel pills */}
                      {item.deliveredChannels && item.deliveredChannels.length > 0 && (
                        <View style={styles.channelRow}>
                          {item.deliveredChannels.map((ch) => (
                            <View
                              key={ch}
                              style={[styles.channelPill, { borderColor: `${CHANNEL_COLORS[ch] ?? tokens.white35}50` }]}
                            >
                              <Text style={[styles.channelPillText, { color: CHANNEL_COLORS[ch] ?? tokens.white60 }]}>
                                {ch}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={styles.alertMeta}>
                      <Text style={styles.alertTime}>
                        {timeAgo(item.timestamp ?? item.created_at ?? '')}
                      </Text>
                      {!item.read && <View style={styles.unreadDot} />}
                      {/* AI enrichment toggle */}
                      {item.enrichedData && (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); toggleEnrichment(item.id); }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          {expandedEnrichments.has(item.id)
                            ? <ChevronUp size={14} color={tokens.secondary} />
                            : <ChevronDown size={14} color={tokens.secondary} />}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Quick actions — Investigate / Watch */}
                  {item.mint && (
                    <View style={styles.quickActions}>
                      <TouchableOpacity
                        style={styles.quickActionBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/investigate/${item.mint}` as any);
                        }}
                        activeOpacity={0.7}
                      >
                        <Search size={12} color={tokens.secondary} />
                        <Text style={styles.quickActionText}>Investigate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickActionBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/token/${item.mint}` as any);
                        }}
                        activeOpacity={0.7}
                      >
                        <Bookmark size={12} color={tokens.white60} />
                        <Text style={styles.quickActionText}>View Token</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* AI enrichment panel */}
                  {item.enrichedData && expandedEnrichments.has(item.id) && (
                    <View style={styles.enrichPanel}>
                      <View style={styles.enrichHeader}>
                        <Bot size={12} color={tokens.secondary} />
                        <Text style={styles.enrichLabel}>AI Context</Text>
                      </View>
                      <Text style={styles.enrichSummary}>{item.enrichedData.summary}</Text>
                      {item.enrichedData.recommendedAction && (
                        <Text style={styles.enrichAction}>
                          → {item.enrichedData.recommendedAction}
                        </Text>
                      )}
                      {/* Proposed actions from rug auto-response */}
                      {item.actions && item.actions.length > 0 && (
                        <View style={styles.actionsRow}>
                          {item.actions.map((act, i) => (
                            <TouchableOpacity
                              key={i}
                              style={styles.actionBtn}
                              onPress={() => {
                                if (act.action === 'lineage.navigate' && act.params.path) {
                                  router.push(act.params.path as any);
                                } else if (act.action === 'lineage.scan_batch' && act.params.mints) {
                                  const first = act.params.mints.split(',')[0];
                                  if (first) router.push(`/token/${first}` as any);
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.actionBtnText}>{act.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                  </GlassCard>
                  </TouchableOpacity>
                </Swipeable>
              </Animated.View>
            )}
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
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  chipActive: {
    backgroundColor: `${tokens.secondary}20`,
    borderColor: tokens.secondary,
  },
  chipText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  chipTextActive: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
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
  emptyAction: {
    marginTop: 24,
    width: '100%',
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },
  emptySubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    textAlign: 'center',
  },

  listContent: { gap: 10 },
  alertCard: { borderWidth: 1, borderColor: 'transparent' },
  alertCardUnread: { borderColor: `${tokens.secondary}30` },
  alertInner: {
    flexDirection: 'row',
    padding: tokens.spacing.cardPadding,
    gap: 12,
    alignItems: 'flex-start',
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1 },
  alertTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  alertMessage: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 4,
  },
  alertMeta: { alignItems: 'flex-end', gap: 6 },
  alertTime: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.secondary,
  },
  swipeContainer: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    marginBottom: 0,
  },
  deleteAction: {
    backgroundColor: tokens.risk.critical,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderTopRightRadius: tokens.radius.xl,
    borderBottomRightRadius: tokens.radius.xl,
  },

  // Channel delivery pills
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  channelPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  channelPillText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    textTransform: 'capitalize',
  },

  // AI enrichment panel
  enrichPanel: {
    marginHorizontal: tokens.spacing.cardPadding,
    marginBottom: tokens.spacing.cardPadding,
    backgroundColor: `${tokens.secondary}0A`,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
    padding: 10,
    gap: 6,
  },
  enrichHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  enrichLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
    letterSpacing: 0.5,
  },
  enrichSummary: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 18,
  },
  enrichAction: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  actionBtn: {
    backgroundColor: `${tokens.secondary}18`,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
  },
  quickActionText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});
