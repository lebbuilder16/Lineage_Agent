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
  TextInput,
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
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

function timeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useAgentPrefsStore();
  const investigations = useHistoryStore((s) => s.investigations);
  const alerts = useAlertsStore((s) => s.alerts);
  const apiKey = useAuthStore((s) => s.apiKey);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const [serverStatus, setServerStatus] = useState<AgentStatus | null>(null);
  const [sweepFlags, setSweepFlags] = useState<SweepFlag[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/status`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) setServerStatus(await res.json());
    } catch { /* best-effort */ }
  };

  const fetchFlags = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/flags?limit=20`, {
        headers: { 'X-API-Key': apiKey },
      });
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

  // Recent activity: merge recent investigations + alerts, sort by time
  const recentActivity = React.useMemo(() => {
    const items: { icon: any; text: string; time: number; color: string; route?: string }[] = [];

    // Recent investigations
    for (const inv of investigations.slice(0, 5)) {
      items.push({
        icon: Search,
        text: `Investigated ${inv.name ?? inv.symbol ?? inv.mint.slice(0, 8)} — ${inv.riskScore}/100`,
        time: inv.timestamp,
        color: inv.riskScore >= 75 ? (tokens.risk?.critical ?? tokens.accent) : inv.riskScore >= 50 ? (tokens.risk?.high ?? '#FF6B6B') : tokens.secondary,
        route: `/token/${inv.mint}`,
      });
    }

    // Recent alerts
    for (const alert of alerts.slice(0, 5)) {
      const ts = new Date(alert.timestamp ?? alert.created_at ?? '').getTime();
      if (isNaN(ts)) continue;
      items.push({
        icon: alert.type === 'rug' ? AlertTriangle : Bell,
        text: alert.title ?? alert.message ?? `${alert.type} alert`,
        time: ts,
        color: (alert.risk_score ?? 0) >= 75 ? (tokens.risk?.critical ?? tokens.accent) : tokens.white60,
        route: alert.mint ? `/token/${alert.mint}` : undefined,
      });
    }

    return items.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [investigations, alerts]);

  const [historyQuery, setHistoryQuery] = useState('');
  const historyFiltered = useMemo(() => {
    if (!historyQuery.trim()) return investigations;
    const q = historyQuery.toLowerCase();
    return investigations.filter((inv) =>
      (inv.name ?? '').toLowerCase().includes(q) ||
      (inv.symbol ?? '').toLowerCase().includes(q) ||
      inv.mint.toLowerCase().includes(q)
    );
  }, [investigations, historyQuery]);

  const watches = useAuthStore((s) => s.watches);
  const watchCount = serverStatus?.watching ?? watches.length;
  const todayInvestigations = serverStatus?.investigations_today ?? investigations.filter(
    (i) => Date.now() - i.timestamp < 24 * 3600 * 1000,
  ).length;
  const totalInvestigations = serverStatus?.total_investigations ?? investigations.length;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tokens.secondary} />}
        >
          <ScreenHeader
            icon={<Bot size={26} color={tokens.secondary} strokeWidth={2.5} />}
            title="Agent"
            subtitle="Your autonomous forensic investigator"
            style={{ paddingHorizontal: 0 }}
          />

          {/* ── Status Card ── */}
          <Animated.View entering={FadeInDown.duration(300).springify()}>
            <GlassCard style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <View style={[styles.statusDot, { backgroundColor: wsConnected ? tokens.success : tokens.white35 }]} />
                <Text style={styles.statusTitle}>
                  {wsConnected ? 'AGENT ACTIVE' : 'AGENT OFFLINE'}
                </Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{watchCount}</Text>
                  <Text style={styles.statLabel}>Monitoring</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{todayInvestigations}</Text>
                  <Text style={styles.statLabel}>Today</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{totalInvestigations}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
              </View>
              {serverStatus?.last_sweep && (
                <Text style={styles.sweepInfo}>
                  Last sweep: {new Date(serverStatus.last_sweep).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · Next: ~'}
                  {new Date(new Date(serverStatus.last_sweep).getTime() + 2 * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </GlassCard>
          </Animated.View>

          {/* ── Preferences ── */}
          <Animated.View entering={FadeInDown.delay(80).duration(300).springify()}>
            <GlassCard>
              <Text style={styles.sectionTitle}>PREFERENCES</Text>

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
                label="Auto-investigate new alerts"
                value={prefs.autoInvestigate}
                onToggle={() => prefs.toggle('autoInvestigate')}
              />
              <PrefToggle
                icon={Clock}
                label={`Daily briefing at ${prefs.briefingHour}:00`}
                value={prefs.dailyBriefing}
                onToggle={() => prefs.toggle('dailyBriefing')}
                isLast
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

          {/* ── Recent Activity ── */}
          <Animated.View entering={FadeInDown.delay(160).duration(300).springify()}>
            <GlassCard>
              <View style={styles.activityHeader}>
                <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
                {investigations.length > 0 && (
                  <TouchableOpacity onPress={() => router.push('/history' as any)} activeOpacity={0.75}>
                    <Text style={styles.viewAllText}>View all</Text>
                  </TouchableOpacity>
                )}
              </View>

              {recentActivity.length === 0 ? (
                <View style={styles.emptyActivity}>
                  <Eye size={20} color={tokens.white35} />
                  <Text style={styles.emptyText}>No activity yet. Scan a token to get started.</Text>
                </View>
              ) : (
                recentActivity.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <TouchableOpacity
                      key={`${item.time}-${i}`}
                      onPress={() => item.route && router.push(item.route as any)}
                      activeOpacity={item.route ? 0.75 : 1}
                      style={[styles.activityRow, i === recentActivity.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <Icon size={14} color={item.color} />
                      <Text style={styles.activityText} numberOfLines={1}>{item.text}</Text>
                      <Text style={styles.activityTime}>{timeAgoShort(item.time)}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </GlassCard>
          </Animated.View>

          {/* ── Intelligence Feed (sweep flags) ── */}
          {sweepFlags.length > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(300).springify()}>
              <GlassCard>
                <Text style={styles.sectionTitle}>INTELLIGENCE FEED</Text>
                {sweepFlags.slice(0, 8).map((flag, i) => {
                  const severityColor = flag.severity === 'critical' ? tokens.risk.critical
                    : flag.severity === 'warning' ? tokens.risk.high
                    : tokens.white60;
                  const SeverityIcon = flag.severity === 'critical' ? XOctagon
                    : flag.severity === 'warning' ? AlertTriangle
                    : Info;
                  return (
                    <TouchableOpacity
                      key={flag.id}
                      onPress={() => router.push(`/token/${flag.mint}` as any)}
                      activeOpacity={0.75}
                      style={[
                        styles.flagRow,
                        i === Math.min(sweepFlags.length, 8) - 1 && { borderBottomWidth: 0 },
                        !flag.read && { backgroundColor: `${severityColor}0A` },
                      ]}
                      accessibilityLabel={`${flag.severity} flag: ${flag.title}`}
                    >
                      <View style={[styles.flagIconWrap, { backgroundColor: `${severityColor}15` }]}>
                        <SeverityIcon size={14} color={severityColor} strokeWidth={2.5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.flagTitle, { color: severityColor }]} numberOfLines={1}>
                          {flag.title}
                        </Text>
                        <Text style={styles.flagMint} numberOfLines={1}>
                          {flag.mint.slice(0, 8)}…{flag.mint.slice(-4)}
                        </Text>
                      </View>
                      <Text style={styles.activityTime}>{timeAgoShort(flag.createdAt * 1000)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>
            </Animated.View>
          )}

          {/* ── Feedback Accuracy ── */}
          {investigations.length > 0 && (() => {
            const withFeedback = investigations.filter((i) => i.feedback);
            const accurate = withFeedback.filter((i) => i.feedback === 'accurate').length;
            const total = withFeedback.length;
            if (total === 0) return null;
            const pct = Math.round((accurate / total) * 100);
            return (
              <Animated.View entering={FadeInDown.delay(200).duration(300).springify()}>
                <GlassCard>
                  <Text style={styles.sectionTitle}>AGENT ACCURACY</Text>
                  <View style={styles.accuracyRow}>
                    <Text style={[styles.accuracyPct, { color: pct >= 70 ? tokens.success : pct >= 40 ? tokens.warning : tokens.accent }]}>
                      {pct}%
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accuracyLabel}>
                        {accurate}/{total} investigations rated accurate
                      </Text>
                      <View style={styles.accuracyBar}>
                        <View style={[styles.accuracyFill, { width: `${pct}%`, backgroundColor: pct >= 70 ? tokens.success : pct >= 40 ? tokens.warning : tokens.accent }]} />
                      </View>
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })()}

          {/* ── History Search ── */}
          {investigations.length > 3 && (
            <Animated.View entering={FadeInDown.delay(220).duration(300).springify()}>
              <GlassCard>
                <Text style={styles.sectionTitle}>INVESTIGATION HISTORY</Text>
                <TextInput
                  style={styles.historySearch}
                  placeholder="Search by name or symbol..."
                  placeholderTextColor={tokens.white35}
                  value={historyQuery}
                  onChangeText={setHistoryQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {historyFiltered.slice(0, 5).map((inv, i) => (
                  <TouchableOpacity
                    key={inv.mint}
                    onPress={() => router.push(`/token/${inv.mint}` as any)}
                    activeOpacity={0.75}
                    style={[styles.activityRow, i === Math.min(historyFiltered.length, 5) - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={[styles.historyDot, {
                      backgroundColor: inv.riskScore >= 75 ? tokens.risk.critical : inv.riskScore >= 50 ? tokens.risk.high : inv.riskScore >= 25 ? tokens.risk.medium : tokens.risk.low,
                    }]} />
                    <Text style={styles.activityText} numberOfLines={1}>
                      {inv.name ?? inv.symbol ?? inv.mint.slice(0, 8)} — {inv.riskScore}/100
                    </Text>
                    <Text style={styles.activityTime}>{timeAgoShort(inv.timestamp)}</Text>
                  </TouchableOpacity>
                ))}
                {historyFiltered.length > 5 && (
                  <Text style={styles.historyMore}>+{historyFiltered.length - 5} more results</Text>
                )}
              </GlassCard>
            </Animated.View>
          )}

          {/* ── Quick Actions ── */}
          <Animated.View entering={FadeInDown.delay(240).duration(300).springify()}>
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => router.push('/(tabs)/scan' as any)}
                activeOpacity={0.75}
              >
                <Search size={18} color={tokens.secondary} />
                <Text style={styles.quickBtnText}>Scan Token</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => router.push('/(tabs)/watchlist' as any)}
                activeOpacity={0.75}
              >
                <Eye size={18} color={tokens.secondary} />
                <Text style={styles.quickBtnText}>Watchlist</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => router.push('/(tabs)/clock' as any)}
                activeOpacity={0.75}
              >
                <AlertTriangle size={18} color={tokens.secondary} />
                <Text style={styles.quickBtnText}>Death Clock</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
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

  // Status card
  statusCard: { borderColor: `${tokens.secondary}20`, borderWidth: 1 },
  statusHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny,
    color: tokens.white60, letterSpacing: 1.5,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.heading,
    color: tokens.white100,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, letterSpacing: 0.5,
  },
  statDivider: {
    width: 1, height: 32, backgroundColor: tokens.borderSubtle,
  },
  sweepInfo: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.3,
  },
  hourPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  hourChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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

  // Section
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny,
    color: tokens.white60, letterSpacing: 1, marginBottom: 12,
  },

  // Preferences
  prefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  prefLabel: {
    flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.small,
    color: tokens.white80,
  },

  // Activity
  activityHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  viewAllText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  activityText: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80,
  },
  activityTime: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  emptyActivity: {
    alignItems: 'center', gap: 8, paddingVertical: 20,
  },
  emptyText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white35, textAlign: 'center',
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row', gap: 10,
  },
  quickBtn: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  quickBtnText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny,
    color: tokens.white60,
  },

  // Feedback accuracy
  accuracyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8,
  },
  accuracyPct: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.heading,
  },
  accuracyLabel: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60,
  },
  accuracyBar: {
    height: 6, borderRadius: 3, backgroundColor: tokens.borderMedium, marginTop: 6,
  },
  accuracyFill: {
    height: 6, borderRadius: 3,
  },

  // Intelligence feed flags
  flagRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
    minHeight: tokens.minTouchSize,
  },
  flagIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  flagTitle: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, lineHeight: 18,
  },
  flagMint: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35,
    marginTop: 2,
  },

  // History search
  historySearch: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white100, backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  historyDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  historyMore: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, textAlign: 'center', marginTop: 8,
  },
});
