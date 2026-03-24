import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  Bell,
  AlertTriangle,
  XOctagon,
  Info,
  Zap,
  Settings,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { tokens } from '../../src/theme/tokens';
import { AgentHero, AgentActivityFeed, AgentSettingsPanel } from '../../src/components/agent';
import type { FeedItem } from '../../src/components/agent/AgentActivityFeed';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

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
  const isFocused = useIsFocused();
  const investigations = useHistoryStore((s) => s.investigations);
  const alerts = useAlertsStore((s) => s.alerts);
  const apiKey = useAuthStore((s) => s.apiKey);
  const wsConnected = useAlertsStore((s) => s.wsConnected);
  const watches = useAuthStore((s) => s.watches);
  const [serverStatus, setServerStatus] = useState<AgentStatus | null>(null);
  const [sweepFlags, setSweepFlags] = useState<SweepFlag[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('feed');
  const plan = useSubscriptionStore((s) => s.plan);

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
  }, [apiKey]);

  // Pause polling when screen is not focused
  useEffect(() => {
    if (!apiKey || !isFocused) return;
    const interval = setInterval(() => { fetchStatus(); fetchFlags(); }, 30_000);
    return () => clearInterval(interval);
  }, [apiKey, isFocused]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchFlags()]);
    setRefreshing(false);
  };

  // ── Build unified feed ───────────────────────────────────────────────────────

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

  // ── Derived stats ────────────────────────────────────────────────────────────

  const watchCount = serverStatus?.watching ?? watches.length;
  const todayCount = serverStatus?.investigations_today ?? investigations.filter(
    (i) => Date.now() - i.timestamp < 24 * 3600 * 1000,
  ).length;
  const totalCount = serverStatus?.total_investigations ?? investigations.length;
  const withFeedback = investigations.filter((i) => i.feedback);
  const accuratePct = withFeedback.length > 0
    ? Math.round((withFeedback.filter((i) => i.feedback === 'accurate').length / withFeedback.length) * 100)
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tokens.secondary} />}
        >
          <AgentHero
            wsConnected={wsConnected}
            watchCount={watchCount}
            todayCount={todayCount}
            totalCount={totalCount}
            accuratePct={accuratePct}
            lastSweep={serverStatus?.last_sweep ?? null}
          />

          {/* Tab bar */}
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
                        ? <Zap size={13} color={isActive ? tokens.white100 : tokens.textTertiary} strokeWidth={2.5} />
                        : <Settings size={13} color={isActive ? tokens.white100 : tokens.textTertiary} strokeWidth={2} />
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

          {activeTab === 'feed' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()}>
              <AgentActivityFeed feedItems={feedItems} />
            </Animated.View>
          )}

          {activeTab === 'settings' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()} style={{ gap: 10 }}>
              <AgentSettingsPanel plan={plan} />
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 32, gap: 10 },
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
    color: tokens.textTertiary,
  },
  tabLabelActive: { color: tokens.white100 },
});
