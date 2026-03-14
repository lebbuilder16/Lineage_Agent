import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Bell, CheckCheck, AlertTriangle, Zap, Skull, BookMarked } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { useAlertsStore } from '../../src/store/alerts';
import { tokens } from '../../src/theme/tokens';
import type { AlertItem } from '../../src/types/api';

const ALERT_ICONS: Record<string, React.ReactNode> = {
  rug: <AlertTriangle size={18} color={tokens.risk.critical} />,
  bundle: <Zap size={18} color={tokens.risk.high} />,
  insider: <Zap size={18} color={tokens.risk.medium} />,
  zombie: <Skull size={18} color={tokens.accent} />,
  death_clock: <Skull size={18} color={tokens.risk.critical} />,
  deployer: <BookMarked size={18} color={tokens.secondary} />,
  narrative: <Bell size={18} color={tokens.primary} />,
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AlertsScreen() {
  const alerts = useAlertsStore((s) => s.alerts);
  const markRead = useAlertsStore((s) => s.markRead);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);

  const handlePress = (alert: AlertItem) => {
    markRead(alert.id);
    if (alert.mint) router.push(`/token/${alert.mint}` as any);
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>ALERTS</Text>
            {unreadCount > 0 && (
              <Text style={styles.unreadLabel}>{unreadCount} new</Text>
            )}
          </View>
          {unreadCount > 0 && (
            <HapticButton variant="ghost" size="sm" onPress={markAllRead}>
              <CheckCheck size={16} color={tokens.primary} />
            </HapticButton>
          )}
        </View>

        {alerts.length === 0 ? (
          <View style={styles.empty}>
            <Bell size={48} color={tokens.white20} />
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptySubtitle}>
              Live alerts from the WebSocket connection will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={alerts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handlePress(item)} activeOpacity={0.75}>
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
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
    letterSpacing: 2,
  },
  unreadLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.accent,
    marginTop: 2,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
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

  listContent: { gap: 8, paddingBottom: 120 },
  alertCard: { borderWidth: 1, borderColor: 'transparent' },
  alertCardUnread: { borderColor: `${tokens.primary}30` },
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
    backgroundColor: tokens.primary,
  },
});
