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
import { LinearGradient } from 'expo-linear-gradient';
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
  Activity,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { useAgentPrefsStore, ALERT_TYPE_OPTIONS, SWEEP_INTERVAL_OPTIONS, DEPTH_OPTIONS } from '../../src/store/agent-prefs';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

function timeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
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

  type FeedCategory = 'investigation' | 'alert' | 'flag';
  interface FeedItem {
    id: string;
    category: FeedCategory;
    categoryLabel: string;
    icon: any;
    tokenName: string;
    tokenSymbol: string;
    mint: string;
    summary: string;
    detail?: string;
    riskScore?: number;
    time: number;
    color: string;
  }

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];
    for (const inv of investigations.slice(0, 5)) {
      const name = inv.name ?? inv.mint.slice(0, 8);
      const symbol = inv.symbol ?? '';
      items.push({
        id: `inv-${inv.mint}-${inv.timestamp}`,
        category: 'investigation',
        categoryLabel: 'Investigation',
        icon: Search,
        tokenName: name,
        tokenSymbol: symbol,
        mint: inv.mint,
        summary: inv.verdict ?? `Risk score: ${inv.riskScore}/100`,
        detail: inv.keyFindings?.[0] ?? undefined,
        riskScore: inv.riskScore,
        time: inv.timestamp,
        color: inv.riskScore >= 75 ? tokens.risk.critical : inv.riskScore >= 50 ? tokens.risk.high : tokens.secondary,
      });
    }
    for (const alert of alerts.slice(0, 5)) {
      const ts = new Date(alert.timestamp ?? alert.created_at ?? '').getTime();
      if (isNaN(ts)) continue;
      items.push({
        id: `alert-${alert.id}`,
        category: 'alert',
        categoryLabel: 'Alert',
        icon: alert.type === 'rug' ? AlertTriangle : Bell,
        tokenName: alert.token_name ?? alert.mint?.slice(0, 8) ?? 'Unknown',
        tokenSymbol: '',
        mint: alert.mint ?? '',
        summary: alert.message ?? `${alert.type} alert`,
        riskScore: alert.risk_score ?? undefined,
        time: ts,
        color: (alert.risk_score ?? 0) >= 75 ? tokens.risk.critical : tokens.risk.high,
      });
    }
    for (const flag of sweepFlags.slice(0, 5)) {
      items.push({
        id: `flag-${flag.id}`,
        category: 'flag',
        categoryLabel: 'Sweep Flag',
        icon: flag.severity === 'critical' ? XOctagon : flag.severity === 'warning' ? AlertTriangle : Info,
        tokenName: flag.mint.slice(0, 8),
        tokenSymbol: '',
        mint: flag.mint,
        summary: flag.title,
        time: flag.createdAt * 1000,
        color: flag.severity === 'critical' ? tokens.risk.critical : flag.severity === 'warning' ? tokens.risk.high : tokens.white60,
      });
    }
    return items.sort((a, b) => b.time - a.time).slice(0, 12);
  }, [investigations, alerts, sweepFlags]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const watchCount = serverStatus?.watching ?? watches.length;
  const todayCount = serverStatus?.investigations_today ?? investigations.filter(
    (i) => Date.now() - i.timestamp < 24 * 3600 * 1000,
  ).length;
  const totalCount = serverStatus?.total_investigations ?? investigations.length;
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
          {/* ── Hero header with gradient ── */}
          <Animated.View entering={FadeIn.duration(400)}>
            <LinearGradient
              colors={['rgba(139,92,246,0.12)', 'rgba(99,102,241,0.06)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroRow}>
                <View style={styles.heroAvatarWrap}>
                  <LinearGradient
                    colors={[tokens.violet, tokens.indigo]}
                    style={styles.heroAvatar}
                  >
                    <Bot size={24} color={tokens.white100} strokeWidth={2} />
                  </LinearGradient>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Lineage Agent</Text>
                  <View style={styles.heroStatusRow}>
                    <View style={[styles.heroDot, { backgroundColor: wsConnected ? tokens.success : tokens.white35 }]} />
                    <Text style={styles.heroStatusText}>
                      {wsConnected ? 'Monitoring your watchlist' : 'Offline — reconnecting'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Compact stats */}
              <View style={styles.heroStats}>
                <StatPill icon={Eye} value={watchCount} label="Watching" />
                <StatPill icon={Search} value={todayCount} label="Today" />
                <StatPill icon={Activity} value={totalCount} label="Total" />
                {accuratePct != null && (
                  <StatPill icon={Shield} value={`${accuratePct}%`} label="Accuracy" color={accuratePct >= 70 ? tokens.success : tokens.warning} />
                )}
              </View>

              {serverStatus?.last_sweep && (
                <Text style={styles.sweepMeta}>
                  Last sweep {new Date(serverStatus.last_sweep).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · next ~'}
                  {new Date(new Date(serverStatus.last_sweep).getTime() + 2 * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </LinearGradient>
          </Animated.View>

          {/* ── Tab bar ── */}
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <View style={styles.tabBar}>
              {(['feed', 'settings'] as TabId[]).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={styles.tabTouch}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.tabInner, isActive && styles.tabInnerActive]}>
                      {tab === 'feed'
                        ? <Zap size={13} color={isActive ? tokens.white100 : tokens.white35} strokeWidth={2.5} />
                        : <Settings size={13} color={isActive ? tokens.white100 : tokens.white35} strokeWidth={2} />
                      }
                      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                        {tab === 'feed' ? 'Activity' : 'Settings'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          {/* ── FEED ── */}
          {activeTab === 'feed' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()}>
              {feedItems.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIconCircle}>
                    <Eye size={28} color={tokens.white20} />
                  </View>
                  <Text style={styles.emptyTitle}>No activity yet</Text>
                  <Text style={styles.emptySub}>Scan a token or add to watchlist.</Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/scan' as any)}
                    style={styles.emptyCta}
                    activeOpacity={0.75}
                  >
                    <Search size={14} color={tokens.secondary} />
                    <Text style={styles.emptyCtaText}>Scan a token</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                feedItems.map((item, i) => {
                  const Icon = item.icon;
                  const isExpanded = expandedId === item.id;
                  const catColor = item.category === 'investigation' ? tokens.violet
                    : item.category === 'alert' ? tokens.risk.high
                    : tokens.cyan;
                  return (
                    <Animated.View
                      key={item.id}
                      entering={FadeInDown.delay(i * 40).duration(250).springify()}
                    >
                      <TouchableOpacity
                        onPress={() => setExpandedId(isExpanded ? null : item.id)}
                        activeOpacity={0.75}
                        style={[styles.feedCard, isExpanded && { borderColor: `${item.color}30` }]}
                      >
                        <View style={[styles.feedDot, { backgroundColor: item.color }]} />

                        {/* Category tag + time */}
                        <View style={styles.feedHeader}>
                          <View style={[styles.catTag, { backgroundColor: `${catColor}15` }]}>
                            <Icon size={10} color={catColor} strokeWidth={2.5} />
                            <Text style={[styles.catLabel, { color: catColor }]}>{item.categoryLabel}</Text>
                          </View>
                          <Text style={styles.feedTime}>{timeAgoShort(item.time)}</Text>
                        </View>

                        {/* Token identity */}
                        <View style={styles.feedTokenRow}>
                          <Text style={styles.feedTokenName} numberOfLines={1}>
                            {item.tokenName}
                          </Text>
                          {item.tokenSymbol !== '' && (
                            <Text style={styles.feedTokenSymbol}>{item.tokenSymbol}</Text>
                          )}
                          {item.riskScore != null && (
                            <View style={[styles.feedScorePill, {
                              backgroundColor: `${item.color}15`,
                              borderColor: `${item.color}30`,
                            }]}>
                              <Text style={[styles.feedScoreText, { color: item.color }]}>{item.riskScore}</Text>
                            </View>
                          )}
                        </View>

                        {/* Summary */}
                        <Text style={styles.feedSummary} numberOfLines={isExpanded ? 4 : 1}>{item.summary}</Text>

                        {/* Expanded: detail + actions */}
                        {isExpanded && (
                          <View style={styles.feedExpanded}>
                            {item.detail && (
                              <Text style={styles.feedDetail} numberOfLines={2}>{item.detail}</Text>
                            )}
                            <Text style={styles.feedMint}>{item.mint.slice(0, 12)}…{item.mint.slice(-6)}</Text>
                            <View style={styles.feedActions}>
                              {item.mint && (
                                <TouchableOpacity
                                  onPress={() => router.push(`/investigate/${item.mint}` as any)}
                                  style={styles.feedActionBtn}
                                  activeOpacity={0.7}
                                >
                                  <Search size={12} color={tokens.secondary} strokeWidth={2.5} />
                                  <Text style={styles.feedActionText}>Investigate</Text>
                                </TouchableOpacity>
                              )}
                              {item.mint && (
                                <TouchableOpacity
                                  onPress={() => router.push(`/token/${item.mint}` as any)}
                                  style={[styles.feedActionBtn, { borderColor: tokens.borderSubtle, backgroundColor: tokens.bgGlass8 }]}
                                  activeOpacity={0.7}
                                >
                                  <Eye size={12} color={tokens.white60} strokeWidth={2} />
                                  <Text style={[styles.feedActionText, { color: tokens.white60 }]}>View Token</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })
              )}
            </Animated.View>
          )}

          {/* ── SETTINGS ── */}
          {activeTab === 'settings' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()} style={{ gap: 10 }}>
              {/* Section: Alert sensitivity */}
              <GlassCard>
                <Text style={styles.settingsSection}>ALERT SENSITIVITY</Text>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>Risk threshold</Text>
                  <View style={styles.sliderValueWrap}>
                    {[30, 50, 70, 80, 90].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => prefs.setRiskThreshold(v)}
                        style={[styles.hourChip, prefs.riskThreshold === v && styles.hourChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.hourText, prefs.riskThreshold === v && styles.hourTextOn]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Text style={styles.settingsSub}>Alert types</Text>
                <View style={styles.chipWrap}>
                  {ALERT_TYPE_OPTIONS.map((opt) => {
                    const on = prefs.alertTypes.includes(opt.key);
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => prefs.toggleAlertType(opt.key)}
                        style={[styles.alertChip, on && styles.alertChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.alertChipText, on && styles.alertChipTextOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              {/* Section: Automation */}
              <GlassCard>
                <Text style={styles.settingsSection}>AUTOMATION</Text>
                <PrefRow icon={Zap} label="Auto-investigate alerts" value={prefs.autoInvestigate} onToggle={() => prefs.toggle('autoInvestigate')} />
                <Text style={styles.settingsSub}>Investigation depth</Text>
                <View style={styles.chipWrap}>
                  {DEPTH_OPTIONS.map((opt) => {
                    const on = prefs.investigationDepth === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => prefs.setInvestigationDepth(opt.value)}
                        style={[styles.depthChip, on && styles.depthChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.depthLabel, on && styles.depthLabelOn]}>{opt.label}</Text>
                        <Text style={styles.depthDesc}>{opt.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              {/* Section: Monitoring */}
              <GlassCard>
                <Text style={styles.settingsSection}>MONITORING</Text>
                <Text style={styles.settingsSub}>Sweep frequency</Text>
                <View style={styles.chipWrap}>
                  {SWEEP_INTERVAL_OPTIONS.map((opt) => {
                    const on = prefs.sweepInterval === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => prefs.setSweepInterval(opt.value)}
                        style={[styles.hourChip, on && styles.hourChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.hourText, on && styles.hourTextOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <PrefRow icon={Clock} label={`Daily briefing at ${prefs.briefingHour}:00`} value={prefs.dailyBriefing} onToggle={() => prefs.toggle('dailyBriefing')} isLast={!prefs.dailyBriefing} />
                {prefs.dailyBriefing && (
                  <View style={styles.hourRow}>
                    {[6, 7, 8, 9, 10, 12].map((h) => (
                      <TouchableOpacity
                        key={h}
                        onPress={() => prefs.setBriefingHour(h)}
                        style={[styles.hourChip, prefs.briefingHour === h && styles.hourChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.hourText, prefs.briefingHour === h && styles.hourTextOn]}>{h}:00</Text>
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

// ── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ icon: Icon, value, label, color }: { icon: any; value: number | string; label: string; color?: string }) {
  return (
    <View style={styles.statPill}>
      <Icon size={11} color={color ?? tokens.white35} strokeWidth={2} />
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Preference row ───────────────────────────────────────────────────────────

function PrefRow({ icon: Icon, label, value, onToggle, isLast }: { icon: any; label: string; value: boolean; onToggle: () => void; isLast?: boolean }) {
  return (
    <View style={[styles.prefRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={[styles.prefIconWrap, { backgroundColor: value ? `${tokens.secondary}12` : tokens.bgGlass8 }]}>
        <Icon size={14} color={value ? tokens.secondary : tokens.white35} strokeWidth={2} />
      </View>
      <Text style={[styles.prefLabel, !value && { color: tokens.white35 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: tokens.bgGlass12, true: `${tokens.violet}50` }}
        thumbColor={value ? tokens.secondary : tokens.white35}
        ios_backgroundColor={tokens.bgGlass12}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 32, gap: 10 },

  // Hero
  heroGradient: {
    borderRadius: tokens.radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: tokens.borderViolet,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroAvatarWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    ...tokens.shadow.violet,
  },
  heroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    letterSpacing: -0.3,
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  heroDot: { width: 6, height: 6, borderRadius: 3 },
  heroStatusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Hero stats
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 6,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: tokens.radius.sm,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white35,
    letterSpacing: 0.3,
  },
  sweepMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.5,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  tabTouch: { flex: 1 },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: tokens.radius.sm + 2,
  },
  tabInnerActive: {
    backgroundColor: `${tokens.violet}20`,
  },
  tabLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
  tabLabelActive: { color: tokens.white100 },

  // Feed
  feedCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 18,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 6,
    overflow: 'hidden',
  },
  feedDot: {
    width: 3,
    height: '100%',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  catLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  feedTime: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white35,
  },
  feedTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedTokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    flexShrink: 1,
  },
  feedTokenSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
  feedScorePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  feedScoreText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
  },
  feedSummary: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    lineHeight: 17,
  },
  feedExpanded: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    marginTop: 4,
  },
  feedDetail: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    lineHeight: 15,
  },
  feedMint: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    letterSpacing: 0.3,
  },
  feedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  feedActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}08`,
  },
  feedActionText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}08`,
  },
  emptyCtaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },

  // Settings
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  prefIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  settingsSection: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    color: tokens.white35,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  settingsSub: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 12,
    marginBottom: 8,
  },
  sliderRow: {
    gap: 8,
  },
  sliderLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
    marginBottom: 6,
  },
  sliderValueWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  alertChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  alertChipOn: {
    backgroundColor: `${tokens.secondary}12`,
    borderColor: `${tokens.secondary}40`,
  },
  alertChipText: {
    fontFamily: 'Lexend-Medium',
    fontSize: 10,
    color: tokens.white35,
  },
  alertChipTextOn: {
    color: tokens.secondary,
  },
  depthChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
  },
  depthChipOn: {
    backgroundColor: `${tokens.violet}12`,
    borderColor: `${tokens.violet}40`,
  },
  depthLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
  depthLabelOn: {
    color: tokens.lavender,
  },
  depthDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    marginTop: 2,
  },
  hourRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
  },
  hourChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  hourChipOn: {
    backgroundColor: `${tokens.violet}18`,
    borderColor: `${tokens.violet}50`,
  },
  hourText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  hourTextOn: { color: tokens.lavender },
});
