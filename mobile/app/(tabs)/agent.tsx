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
import { AgentHero, AgentActivityFeed, AgentSettingsPanel, WalletHoldingsPanel, MemoryLensPanel } from '../../src/components/agent';
import { tokenName as fmtName, shortAddr } from '../../src/lib/token-display';
import { useBriefingStore } from '../../src/lib/openclaw-briefing';
import { BriefingActionCard } from '../../src/components/radar/BriefingActionCard';
import { useMemoryEntities, useAgentMemory } from '../../src/lib/query';
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

type TabId = 'feed' | 'intel' | 'wallet' | 'settings';

/* ─── Briefing card (inline — pulls from briefing store) ─── */
function BriefingCard() {
  const latest = useBriefingStore((s) => s.latest);
  const generatedAt = useBriefingStore((s) => s.generatedAt);
  const sections = useBriefingStore((s) => s.sections);
  const unread = useBriefingStore((s) => s.unread);
  const markRead = useBriefingStore((s) => s.markRead);
  if (!latest) return null;
  return (
    <BriefingActionCard
      text={latest}
      generatedAt={generatedAt}
      sections={sections}
      unread={unread}
      onMarkRead={markRead}
    />
  );
}

/* ─── Intel tab (memory entities + selected entity detail) ─── */
function IntelTab() {
  const apiKey = useAuthStore((s) => s.apiKey);
  const { data: entities, isLoading } = useMemoryEntities(apiKey);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);
  // Memoize params to prevent infinite re-render loop —
  // a new object ref each render would make React Query think the key changed.
  const memoryParams = useMemo(() => ({
    entity_type: selected?.type,
    entity_id: selected?.id,
  }), [selected?.type, selected?.id]);
  const { data: memory } = useAgentMemory(apiKey, memoryParams, !!selected);

  if (isLoading) {
    return (
      <View style={{ alignItems: 'center', padding: 32 }}>
        <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 14 }}>Loading intelligence...</Text>
      </View>
    );
  }

  const entityList = entities?.entities ?? [];

  if (entityList.length === 0) {
    return (
      <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
        <Brain size={28} color={tokens.textTertiary} />
        <Text style={{ color: tokens.white60, fontFamily: 'Lexend-Medium', fontSize: 15, textAlign: 'center' }}>No intelligence yet</Text>
        <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 13, textAlign: 'center' }}>
          Investigate tokens to build deployer and operator profiles
        </Text>
      </View>
    );
  }

  if (selected && memory) {
    return (
      <View style={{ gap: 10 }}>
        <TouchableOpacity onPress={() => setSelected(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <Text style={{ color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 13 }}>{'\u2190'} Back to entities</Text>
        </TouchableOpacity>
        <MemoryLensPanel data={memory} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: tokens.white60, fontFamily: 'Lexend-SemiBold', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        KNOWN ENTITIES ({entityList.length})
      </Text>
      {entityList.map((e: any, i: number) => (
        <TouchableOpacity
          key={`${e.entity_type}-${e.entity_id}-${i}`}
          onPress={() => setSelected({ type: e.entity_type, id: e.entity_id })}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 14, borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          }}
          activeOpacity={0.7}
        >
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: e.entity_type === 'deployer' ? 'rgba(207,230,228,0.08)' : 'rgba(149,210,230,0.08)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={16} color={e.entity_type === 'deployer' ? tokens.step.deployer_profile : tokens.lavender} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: tokens.white80, fontFamily: 'Lexend-Medium', fontSize: 14 }} numberOfLines={1}>
              {e.entity_id.slice(0, 8)}...{e.entity_id.slice(-4)}
            </Text>
            <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 12 }}>
              {e.entity_type} · {e.total_tokens ?? 0} tokens · {e.total_rugs ?? 0} rugs
            </Text>
          </View>
          <Text style={{ color: tokens.textTertiary, fontSize: 16 }}>{'\u203A'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

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
      const name = fmtName(inv.name, inv.symbol, inv.mint);
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
        shortAddr(flag.mint);
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
                { id: 'intel' as TabId, icon: Brain, label: 'Intel' },
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
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()} style={{ gap: 10 }}>
              <BriefingCard />
              <AgentActivityFeed feedItems={feedItems} />
            </Animated.View>
          )}

          {activeTab === 'intel' && (
            <Animated.View entering={FadeInDown.delay(150).duration(300).springify()}>
              {/* IntelTab lazy-mounts only when selected to avoid background fetches */}
              <React.Suspense fallback={
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Text style={{ color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 14 }}>Loading...</Text>
                </View>
              }>
                <IntelTab />
              </React.Suspense>
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
