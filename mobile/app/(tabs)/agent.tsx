import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  Brain,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { tokens } from '../../src/theme/tokens';
import { AgentHero, AgentActivityFeed, AgentSettingsPanel, MemoryLensPanel } from '../../src/components/agent';
import { useAgentMemory } from '../../src/lib/query';
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

type TabId = 'feed' | 'memory' | 'settings';

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

  // Use ref to avoid stale closure in polling interval
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  // Feature 9: Agent Memory — use latest investigation's mint to fetch memory
  const latestMint = investigations[0]?.mint ?? '';
  const { data: memoryData } = useAgentMemory(apiKey, { mint: latestMint }, !!latestMint);

  const fetchStatus = useCallback(async () => {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/status`, { headers: { 'X-API-Key': key } });
      if (res.ok) setServerStatus(await res.json());
    } catch { /* best-effort */ }
  }, []);

  const fetchFlags = useCallback(async () => {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const res = await fetch(`${BASE_URL}/agent/flags?limit=20`, { headers: { 'X-API-Key': key } });
      if (res.ok) {
        const data = await res.json();
        setSweepFlags(data.flags ?? []);
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    useAgentPrefsStore.getState().hydrate();
    useHistoryStore.getState().hydrate();
    fetchStatus();
    fetchFlags();
  }, [apiKey]);

  // Polling — uses refs so no stale closures
  useEffect(() => {
    if (!apiKey || !isFocused) return;
    const interval = setInterval(() => { fetchStatus(); fetchFlags(); }, 30_000);
    return () => clearInterval(interval);
  }, [apiKey, isFocused, fetchStatus, fetchFlags]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchFlags()]);
    setRefreshing(false);
  };

  // ── Build unified feed ───────────────────────────────────────────────────────

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];

    for (const inv of investigations.slice(0, 8)) {
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

    for (const alert of alerts.slice(0, 8)) {
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

    for (const flag of sweepFlags.slice(0, 8)) {
      // Extract token name from flag detail or title
      const flagName =
        (flag.detail?.token_name as string) ??
        (flag.detail?.name as string) ??
        (flag.detail?.symbol as string) ??
        _extractNameFromTitle(flag.title) ??
        flag.mint.slice(0, 6) + '…' + flag.mint.slice(-4);
      const flagSymbol = (flag.detail?.symbol as string) ?? '';
      // Build readable summary from flag detail
      const summary = _buildFlagSummary(flag);
      items.push({
        id: `flag-${flag.id}`,
        category: 'flag',
        categoryLabel: flag.flagType === 'deployer_exit' ? 'Deployer Exit'
          : flag.flagType === 'bundle' ? 'Bundle Detected'
          : flag.flagType === 'sol_extraction' ? 'SOL Extraction'
          : flag.flagType === 'price_crash' ? 'Price Crash'
          : flag.flagType === 'cartel' ? 'Cartel Link'
          : flag.flagType === 'operator_match' ? 'Operator Match'
          : flag.flagType === 'deployer_rug' ? 'New Rug'
          : 'Sweep Flag',
        icon: flag.severity === 'critical' ? XOctagon : flag.severity === 'warning' ? AlertTriangle : Info,
        tokenName: flagName,
        tokenSymbol: flagSymbol,
        mint: flag.mint,
        summary,
        detail: _buildFlagDetail(flag),
        riskScore: (flag.detail?.risk_score as number) ?? undefined,
        time: flag.createdAt * 1000,
        color: flag.severity === 'critical' ? tokens.risk.critical : flag.severity === 'warning' ? tokens.risk.high : tokens.white60,
        read: flag.read,
      });
    }
    return items.sort((a, b) => b.time - a.time).slice(0, 20);
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

  // Count unread flags
  const unreadFlags = sweepFlags.filter((f) => !f.read).length;

  // ── Render ─────────────────────────────────────────────────────────────────

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
            unreadFlags={unreadFlags}
          />

          {/* Tab bar */}
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <View style={styles.tabBar}>
              {([
                { id: 'feed' as TabId, icon: Zap, label: 'Activity' },
                { id: 'memory' as TabId, icon: Brain, label: 'Memory' },
                { id: 'settings' as TabId, icon: Settings, label: 'Settings' },
              ]).map(({ id, icon: TabIcon, label }) => {
                const isActive = activeTab === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setActiveTab(id)}
                    style={styles.tabTouch}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.tabInner, isActive && styles.tabInnerActive]}>
                      <TabIcon size={13} color={isActive ? tokens.white100 : tokens.textTertiary} strokeWidth={2.5} />
                      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                        {label}
                      </Text>
                      {id === 'feed' && unreadFlags > 0 && (
                        <View style={styles.tabBadge}>
                          <Text style={styles.tabBadgeText}>{unreadFlags > 9 ? '9+' : unreadFlags}</Text>
                        </View>
                      )}
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

          {activeTab === 'memory' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()} style={{ gap: 10 }}>
              {memoryData ? (
                <MemoryLensPanel data={memoryData} />
              ) : (
                <View style={styles.memoryEmpty}>
                  <Brain size={28} color={tokens.white20} />
                  <Text style={styles.memoryEmptyTitle}>
                    {latestMint ? 'Loading agent memory…' : 'No intelligence yet'}
                  </Text>
                  <Text style={styles.memoryEmptyText}>
                    {latestMint
                      ? 'Fetching entity profile and learned patterns.'
                      : 'Investigate a token to build the agent\'s memory. Each scan teaches it to recognize patterns.'}
                  </Text>
                </View>
              )}
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

// ── Helpers: Extract readable data from sweep flags ──────────────────────────

function _extractNameFromTitle(title: string): string | null {
  // Titles often look like "Deployer exited on TokenName" or "Price crash on $SYMBOL"
  const match = title.match(/on\s+\$?(\w[\w\s]*)/i);
  return match?.[1]?.trim() ?? null;
}

function _buildFlagSummary(flag: SweepFlag): string {
  const d = flag.detail;
  switch (flag.flagType) {
    case 'deployer_exit':
      return d?.amount_sol
        ? `Deployer withdrew ${Number(d.amount_sol).toFixed(1)} SOL`
        : flag.title;
    case 'sol_extraction': {
      const amt = d?.amount_sol ?? d?.extracted_sol;
      return amt ? `${Number(amt).toFixed(1)} SOL extracted` : flag.title;
    }
    case 'price_crash': {
      const pct = d?.drop_pct ?? d?.change_pct;
      return pct ? `Price dropped ${Math.abs(Number(pct)).toFixed(0)}%` : flag.title;
    }
    case 'bundle':
      return d?.bundle_pct
        ? `${Number(d.bundle_pct).toFixed(0)}% of supply bundled`
        : flag.title;
    case 'cartel':
      return d?.cluster_size
        ? `Linked to cluster of ${d.cluster_size} wallets`
        : flag.title;
    case 'operator_match':
      return d?.match_count
        ? `Matches operator behind ${d.match_count} other tokens`
        : flag.title;
    case 'deployer_rug':
      return d?.rug_count
        ? `Deployer has ${d.rug_count} prior rugs`
        : flag.title;
    default:
      return flag.title;
  }
}

function _buildFlagDetail(flag: SweepFlag): string | undefined {
  const d = flag.detail;
  if (!d) return undefined;
  // Collect extra context from detail fields
  const parts: string[] = [];
  if (d.deployer) parts.push(`Deployer: ${String(d.deployer).slice(0, 8)}…`);
  if (d.risk_score) parts.push(`Risk: ${d.risk_score}/100`);
  if (d.narrative) parts.push(`Narrative: ${d.narrative}`);
  if (d.note) parts.push(String(d.note));
  return parts.length > 0 ? parts.join(' · ') : undefined;
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
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: tokens.risk.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  tabBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.white100,
  },
  memoryEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 8,
  },
  memoryEmptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
    marginTop: 4,
  },
  memoryEmptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
});
