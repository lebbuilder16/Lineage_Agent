import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bot,
  Shield,
  Bell,
  Search,
  Clock,
  Zap,
  AlertTriangle,
  Eye,
  XOctagon,
  Info,
  Settings,
  ChevronRight,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

function timeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface AgentStatus {
  watching: number;
  last_sweep: number | null;
  investigations_today: number;
  total_investigations: number;
}

interface SweepFlag {
  id: number;
  mint: string;
  flagType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: Record<string, unknown>;
  createdAt: number;
  read: boolean;
}

type TabId = 'feed' | 'settings';

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useAgentPrefsStore();
  const investigations = useHistoryStore((s) => s.investigations);
  const alerts = useAlertsStore((s) => s.alerts);
  const apiKey = useAuthStore((s) => s.apiKey);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const watches = useAuthStore((s) => s.watches);
  const [serverStatus, setServerStatus] = useState<AgentStatus | null>(null);
  const [sweepFlags, setSweepFlags] = useState<SweepFlag[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('feed');

  const fetchStatus = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/status`, { headers: { 'X-API-Key': apiKey } });
      if (res.ok) setServerStatus(await res.json());
    } catch { /* best-effort */ }
  };

  const fetchFlags = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/flags?limit=20`, { headers: { 'X-API-Key': apiKey } });
      if (res.ok) {
        const data = await res.json();
        setSweepFlags(data.flags ?? []);
      }
    } catch { /* best-effort */ }
  };

  useEffect(() => {
    useAgentPrefsStore.getState().hydrate();
    useHistoryStore.getState().hydrate();
    fetchStatus();
    fetchFlags();
    const interval = setInterval(() => { fetchStatus(); fetchFlags(); }, 30_000);
    return () => clearInterval(interval);
  }, [apiKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchFlags()]);
    setRefreshing(false);
  };

  // Unified feed: merge investigations + alerts + flags, sort by time
  const feedItems = useMemo(() => {
    const items: { id: string; icon: any; text: string; sub?: string; time: number; color: string; route?: string }[] = [];

    for (const inv of investigations.slice(0, 5)) {
      items.push({
        id: `inv-${inv.mint}`,
        icon: Search,
        text: `${inv.name ?? inv.symbol ?? inv.mint.slice(0, 8)} — ${inv.riskScore}/100`,
        time: inv.timestamp,
        color: inv.riskScore >= 75 ? tokens.risk.critical : inv.riskScore >= 50 ? tokens.risk.high : tokens.secondary,
        route: `/token/${inv.mint}`,
      });
    }

    for (const alert of alerts.slice(0, 3)) {
      const ts = new Date(alert.timestamp ?? alert.created_at ?? '').getTime();
      if (isNaN(ts)) continue;
      items.push({
        id: `alert-${alert.id}`,
        icon: alert.type === 'rug' ? AlertTriangle : Bell,
        text: alert.title ?? alert.message ?? `${alert.type} alert`,
        time: ts,
        color: (alert.risk_score ?? 0) >= 75 ? tokens.risk.critical : tokens.white60,
        route: alert.mint ? `/token/${alert.mint}` : undefined,
      });
    }

    for (const flag of sweepFlags.slice(0, 5)) {
      items.push({
        id: `flag-${flag.id}`,
        icon: flag.severity === 'critical' ? XOctagon : flag.severity === 'warning' ? AlertTriangle : Info,
        text: flag.title,
        sub: `${flag.mint.slice(0, 6)}…${flag.mint.slice(-4)}`,
        time: flag.createdAt * 1000,
        color: flag.severity === 'critical' ? tokens.risk.critical : flag.severity === 'warning' ? tokens.risk.high : tokens.white60,
        route: `/token/${flag.mint}`,
      });
    }

    return items.sort((a, b) => b.time - a.time).slice(0, 10);
  }, [investigations, alerts, sweepFlags]);

  const watchCount = serverStatus?.watching ?? watches.length;
  const todayInvestigations = serverStatus?.investigations_today ?? investigations.filter(
    (i) => Date.now() - i.timestamp < 24 * 3600 * 1000,
  ).length;

  // Accuracy inline
  const withFeedback = investigations.filter((i) => i.feedback);
  const accuratePct = withFeedback.length > 0
    ? Math.round((withFeedback.filter((i) => i.feedback === 'accurate').length / withFeedback.length) * 100)
    : null;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tokens.secondary} />}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <Bot size={22} color={tokens.secondary} strokeWidth={2.5} />
            <Text style={styles.headerTitle}>Agent</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.statusPill, { borderColor: wsConnected ? `${tokens.success}40` : tokens.borderSubtle }]}>
              <View style={[styles.dot, { backgroundColor: wsConnected ? tokens.success : tokens.white35 }]} />
              <Text style={styles.statusPillText}>{wsConnected ? 'Live' : 'Offline'}</Text>
            </View>
          </View>

          {/* ── Stats bar ── */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{watchCount}</Text>
              <Text style={styles.statLabel}>Watching</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{todayInvestigations}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{serverStatus?.total_investigations ?? investigations.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            {accuratePct != null && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: accuratePct >= 70 ? tokens.success : tokens.warning }]}>{accuratePct}%</Text>
                  <Text style={styles.statLabel}>Accuracy</Text>
                </View>
              </>
            )}
          </View>

          {/* ── Tab switcher ── */}
          <View style={styles.tabRow}>
            {(['feed', 'settings'] as TabId[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                activeOpacity={0.7}
              >
                {tab === 'feed'
                  ? <Zap size={14} color={activeTab === tab ? tokens.secondary : tokens.white35} />
                  : <Settings size={14} color={activeTab === tab ? tokens.secondary : tokens.white35} />
                }
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'feed' ? 'Feed' : 'Settings'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── FEED TAB ── */}
          {activeTab === 'feed' && (
            <Animated.View entering={FadeInDown.duration(250)}>
              {feedItems.length === 0 ? (
                <GlassCard>
                  <View style={styles.emptyFeed}>
                    <Eye size={24} color={tokens.white20} />
                    <Text style={styles.emptyTitle}>No activity yet</Text>
                    <Text style={styles.emptySubtitle}>Scan a token or add to watchlist to get started.</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/scan' as any)} style={styles.emptyCta} activeOpacity={0.75}>
                      <Search size={14} color={tokens.secondary} />
                      <Text style={styles.emptyCtaText}>Scan a token</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ) : (
                <GlassCard>
                  {feedItems.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => item.route && router.push(item.route as any)}
                        activeOpacity={item.route ? 0.75 : 1}
                        style={[styles.feedRow, i === feedItems.length - 1 && { borderBottomWidth: 0 }]}
                      >
                        <View style={[styles.feedIconWrap, { backgroundColor: `${item.color}12` }]}>
                          <Icon size={13} color={item.color} strokeWidth={2.5} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.feedText} numberOfLines={1}>{item.text}</Text>
                          {item.sub && <Text style={styles.feedSub} numberOfLines={1}>{item.sub}</Text>}
                        </View>
                        <Text style={styles.feedTime}>{timeAgoShort(item.time)}</Text>
                        <ChevronRight size={12} color={tokens.white20} />
                      </TouchableOpacity>
                    );
                  })}
                </GlassCard>
              )}

              {/* Sweep info */}
              {serverStatus?.last_sweep && (
                <Text style={styles.sweepInfo}>
                  Sweep {new Date(serverStatus.last_sweep).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · next ~'}
                  {new Date(new Date(serverStatus.last_sweep).getTime() + 2 * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </Animated.View>
          )}

          {/* ── SETTINGS TAB ── */}
          {activeTab === 'settings' && (
            <Animated.View entering={FadeInDown.duration(250)}>
              <GlassCard>
                <PrefToggle
                  icon={Bell}
                  label="Alert on deployer launches"
                  value={prefs.alertOnDeployerLaunch}
                  onToggle={() => prefs.toggle('alertOnDeployerLaunch')}
                />
                <PrefToggle
                  icon={Shield}
                  label="Alert when risk > 70"
                  value={prefs.alertOnHighRisk}
                  onToggle={() => prefs.toggle('alertOnHighRisk')}
                />
                <PrefToggle
                  icon={Zap}
                  label="Auto-investigate alerts"
                  value={prefs.autoInvestigate}
                  onToggle={() => prefs.toggle('autoInvestigate')}
                />
                <PrefToggle
                  icon={Clock}
                  label={`Daily briefing at ${prefs.briefingHour}:00`}
                  value={prefs.dailyBriefing}
                  onToggle={() => prefs.toggle('dailyBriefing')}
                  isLast={!prefs.dailyBriefing}
                />
                {prefs.dailyBriefing && (
                  <View style={styles.hourPicker}>
                    {[6, 7, 8, 9, 10, 12].map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.hourChip, prefs.briefingHour === h && styles.hourChipActive]}
                        onPress={() => prefs.setBriefingHour(h)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.hourChipText, prefs.briefingHour === h && styles.hourChipTextActive]}>
                          {h}:00
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </GlassCard>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Preference toggle row ──────────────────────────────────────────────────

function PrefToggle({
  icon: Icon,
  label,
  value,
  onToggle,
  isLast,
}: {
  icon: any;
  label: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.prefRow, isLast && { borderBottomWidth: 0 }]}>
      <Icon size={16} color={value ? tokens.secondary : tokens.white35} />
      <Text style={[styles.prefLabel, !value && { color: tokens.white35 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: tokens.bgGlass12, true: `${tokens.secondary}40` }}
        thumbColor={value ? tokens.secondary : tokens.white35}
        ios_backgroundColor={tokens.bgGlass12}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 32,
    gap: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 14,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white80,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: tokens.borderSubtle,
  },

  // Tab switcher
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  tabActive: {
    backgroundColor: `${tokens.secondary}12`,
    borderColor: `${tokens.secondary}40`,
  },
  tabText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
  tabTextActive: {
    color: tokens.secondary,
  },

  // Feed
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
    minHeight: tokens.minTouchSize,
  },
  feedIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  feedSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 1,
  },
  feedTime: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Empty feed
  emptyFeed: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 28,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  emptySubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
    textAlign: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}10`,
  },
  emptyCtaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },

  // Sweep info
  sweepInfo: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 4,
  },

  // Settings
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  prefLabel: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  hourPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  hourChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
  },
  hourChipActive: {
    borderColor: `${tokens.secondary}60`,
    backgroundColor: `${tokens.secondary}15`,
  },
  hourChipText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  hourChipTextActive: {
    color: tokens.secondary,
  },
});
