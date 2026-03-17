import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bell, CheckCheck, AlertTriangle, Zap, Skull, BookMarked, Trash2 } from 'lucide-react-native';
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

const ALERT_ICONS: Record<string, React.ReactNode> = {
  rug: <AlertTriangle size={18} color={tokens.risk.critical} />,
  bundle: <Zap size={18} color={tokens.risk.high} />,
  insider: <Zap size={18} color={tokens.risk.medium} />,
  zombie: <Skull size={18} color={tokens.accent} />,
  death_clock: <Skull size={18} color={tokens.risk.critical} />,
  deployer: <BookMarked size={18} color={tokens.secondary} />,
  narrative: <Bell size={18} color={tokens.secondary} />,
};

const FILTER_TYPES: { label: string; value: AlertItem['type'] }[] = [
  { label: 'Rug', value: 'rug' },
  { label: 'Bundle', value: 'bundle' },
  { label: 'Insider', value: 'insider' },
  { label: 'Zombie', value: 'zombie' },
  { label: 'Death Clock', value: 'death_clock' },
  { label: 'Deployer', value: 'deployer' },
  { label: 'Narrative', value: 'narrative' },
];

function dateGroup(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Older';
}

export default function AlertsScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const markRead = useAlertsStore((s) => s.markRead);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const deleteAlert = useAlertsStore((s) => s.deleteAlert);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);
  const [activeFilter, setActiveFilter] = useState<AlertItem['type'] | null>(null);
  const insets = useSafeAreaInsets();

  const filtered = activeFilter ? alerts.filter((a) => a.type === activeFilter) : alerts;

  const sections = useMemo(() => {
    const groups: Record<string, AlertItem[]> = { Today: [], Yesterday: [], Older: [] };
    for (const a of filtered) {
      const key = dateGroup(a.timestamp ?? a.created_at ?? '');
      groups[key].push(a);
    }
    return (['Today', 'Yesterday', 'Older'] as const)
      .filter((k) => groups[k].length > 0)
      .map((k) => ({ title: k, data: groups[k] }));
  }, [filtered]);

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

        {/* Type filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ marginBottom: 8 }}
        >
          <TouchableOpacity
            onPress={() => setActiveFilter(null)}
            style={[styles.chip, activeFilter === null && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeFilter === null && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {FILTER_TYPES.map((ft) => (
            <TouchableOpacity
              key={ft.value}
              onPress={() => setActiveFilter(activeFilter === ft.value ? null : ft.value)}
              style={[styles.chip, activeFilter === ft.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, activeFilter === ft.value && styles.chipTextActive]}>{ft.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filtered.length === 0 ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.empty}>
            <GlassCard style={styles.emptyCard} noPadding={false}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: activeFilter ? `${tokens.secondary}15` : `${tokens.white100}10`, borderColor: activeFilter ? `${tokens.secondary}30` : `${tokens.white100}20` }]}>
                <Bell size={36} color={activeFilter ? tokens.secondary : tokens.white60} />
              </View>
              <Text style={styles.emptyTitle}>{activeFilter ? `No ${activeFilter} alerts` : 'All clear for now'}</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter ? 'Try clearing your filters to see more.' : 'Your radar is silent. We will notify you when action happens.'}
              </Text>
              {activeFilter && (
                <View style={styles.emptyAction}>
                  <HapticButton 
                    onPress={() => setActiveFilter(null)} 
                    variant="secondary"
                  >  Clear Filters  </HapticButton>
                </View>
              )}
            </GlassCard>
          </Animated.View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionLabel}>{section.title}</Text>
            )}
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
                    </View>
                    <View style={styles.alertMeta}>
                      <Text style={styles.alertTime}>
                        {timeAgo(item.timestamp ?? item.created_at ?? '')}
                      </Text>
                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                  </View>
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

  chipsRow: {
    paddingHorizontal: tokens.spacing.screenPadding,
    gap: 6,
    paddingBottom: 4,
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

  listContent: { gap: 8 },
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
    letterSpacing: 0.5,
    paddingVertical: 6,
    paddingTop: 12,
  },
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
});
