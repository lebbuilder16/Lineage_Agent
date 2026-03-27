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
  Wallet,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useHistoryStore } from '../../src/store/history';
import { useAlertsStore } from '../../src/store/alerts';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useAgentPrefsStore } from '../../src/store/agent-prefs';
import { tokens } from '../../src/theme/tokens';
import { AgentHero, AgentActivityFeed, AgentSettingsPanel, WalletHoldingsPanel } from '../../src/components/agent';
import { useWalletMonitorStore } from '../../src/store/wallet-monitor';
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

type TabId = 'feed' | 'wallet' | 'settings';

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

  // Fetch wallet data when wallet tab is active or screen regains focus
  // (e.g. returning from investigate page)
  useEffect(() => {
    if (activeTab === 'wallet' && apiKey && isFocused) {
      useWalletMonitorStore.getState().fetchWallets();
      useWalletMonitorStore.getState().fetchHoldings();
    }
  }, [activeTab, apiKey, isFocused]);

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
    await Promise.all([
      fetchStatus(),
      fetchFlags(),
      useWalletMonitorStore.getState().fetchHoldings(),
    ]);
    setRefreshing(false);
  };

  // ── Build unified feed ───────────────────────────────────────────────────────

  function _deriveEffectiveRisk(
    score: number,
    verdict?: string,
    findings?: string[],
  ): { score: number; color: string } {
    // Check if forensic signals indicate higher risk than the heuristic score
    const text = [verdict ?? '', ...(findings ?? [])].join(' ').toLowerCase();
    const criticalSignals = ['rug', 'insider dump', 'confirmed extraction', 'team extraction', 'critical'];
    const highSignals = ['deployer exited', 'bundle', 'cartel', 'high risk', 'suspicious', 'extraction', 'coordinated'];
    const mediumSignals = ['medium', 'sell pressure', 'insufficient_data'];

    let effectiveScore = score;
    if (criticalSignals.some((s) => text.includes(s)) && effectiveScore < 75) {
      effectiveScore = Math.max(effectiveScore, 75);
    } else if (highSignals.some((s) => text.includes(s)) && effectiveScore < 50) {
      effectiveScore = Math.max(effectiveScore, 55);
    } else if (mediumSignals.some((s) => text.includes(s)) && effectiveScore < 25) {
      effectiveScore = Math.max(effectiveScore, 30);
    }

    const color = effectiveScore >= 75 ? tokens.risk.critical
      : effectiveScore >= 50 ? tokens.risk.high
      : effectiveScore >= 25 ? tokens.risk.medium
      : tokens.secondary;

    return { score: effectiveScore, color };
  }

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];

    for (const inv of investigations.slice(0, 8)) {
      const name = inv.name ?? inv.mint.slice(0, 8);
      const symbol = inv.symbol ?? '';
      // Determine effective risk from score + forensic signals in verdict/findings
      const effectiveRisk = _deriveEffectiveRisk(inv.riskScore, inv.verdict, inv.keyFindings);
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
        riskScore: effectiveRisk.score,
        time: inv.timestamp,
        color: effectiveRisk.color,
        read: true,  // user-initiated — always read
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
        read: false,  // push alerts are unread by default
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
      const summary = _buildFlagSummary(flag);

      // Cross-reference: use investigation score if higher than sweep score
      let flagRiskScore = (flag.detail?.risk_score as number) ?? 0;
      const matchingInv = investigations.find((inv) => inv.mint === flag.mint);
      if (matchingInv && matchingInv.riskScore > flagRiskScore) {
        flagRiskScore = matchingInv.riskScore;
      }
      // Also derive from flag type + title content
      const flagEffective = _deriveEffectiveRisk(flagRiskScore, flag.title, [summary]);

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
        riskScore: flagEffective.score > 0 ? flagEffective.score : undefined,
        time: flag.createdAt * 1000,
        color: flagEffective.score > 0 ? flagEffective.color
          : flag.severity === 'critical' ? tokens.risk.critical
          : flag.severity === 'warning' ? tokens.risk.high
          : tokens.white60,
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
  const walletRisky = useWalletMonitorStore((s) => s.totalRisky);

  // Mark a feed item as read (flags only — investigations/alerts are auto-read)
  const handleMarkRead = useCallback((id: string) => {
    if (id.startsWith('flag-')) {
      const flagId = Number(id.replace('flag-', ''));
      setSweepFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, read: true } : f));
      // Best-effort: persist to backend
      const key = apiKeyRef.current;
      if (key) {
        fetch(`${BASE_URL}/agent/flags/${flagId}/read`, {
          method: 'POST',
          headers: { 'X-API-Key': key },
        }).catch(() => {});
      }
    }
  }, []);

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
            unreadFlags={unreadFlags} // hero shows inline chip if > 0
          />

          {/* Tab bar */}
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <View style={styles.tabBar}>
              {([
                { id: 'feed' as TabId, icon: Zap, label: 'Activity' },
                { id: 'wallet' as TabId, icon: Wallet, label: 'Wallet' },
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
                      {id === 'wallet' && walletRisky > 0 && (
                        <View style={styles.tabBadge}>
                          <Text style={styles.tabBadgeText}>{walletRisky > 9 ? '9+' : walletRisky}</Text>
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
              <AgentActivityFeed feedItems={feedItems} onMarkRead={handleMarkRead} />
            </Animated.View>
          )}

          {activeTab === 'wallet' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()}>
              <WalletHoldingsPanel plan={plan} />
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

  // Correlative forensic × market narratives
  const fc = d.forensic_changes as string[] | undefined;
  const mc = d.market_changes as string[] | undefined;
  if (fc || mc) {
    const parts: string[] = [];
    if (fc && fc.length && fc[0] !== 'none') parts.push(`Forensic: ${fc.join(', ')}`);
    if (mc && mc.length && mc[0] !== 'stable') parts.push(`Market: ${mc.join(', ')}`);
    if (parts.length > 0) return parts.join(' · ');
  }

  // Fallback: standard detail fields
  const fallback: string[] = [];
  if (d.deployer) fallback.push(`Deployer: ${String(d.deployer).slice(0, 8)}…`);
  if (d.risk_score) fallback.push(`Risk: ${d.risk_score}/100`);
  if (d.narrative) fallback.push(`Narrative: ${d.narrative}`);
  if (d.note) fallback.push(String(d.note));
  return fallback.length > 0 ? fallback.join(' · ') : undefined;
}

// ── Styles ──

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
});
