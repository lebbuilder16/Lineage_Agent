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
import { useAgentMemory, useMemoryEntities } from '../../src/lib/query';
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

  // Feature 9: Agent Memory — entities overview + detail drill-down
  const { data: entitiesData } = useMemoryEntities(apiKey);
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string } | null>(null);
  const { data: memoryData } = useAgentMemory(
    apiKey,
    selectedEntity
      ? { entity_type: selectedEntity.type, entity_id: selectedEntity.id }
      : { mint: investigations[0]?.mint ?? '' },
    !!selectedEntity || !!(investigations[0]?.mint),
  );

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
              {selectedEntity && memoryData ? (
                <>
                  <TouchableOpacity
                    onPress={() => setSelectedEntity(null)}
                    style={styles.memoryBackBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.memoryBackText}>← All entities</Text>
                  </TouchableOpacity>
                  <MemoryLensPanel data={memoryData} />
                </>
              ) : (
                <MemoryEntitiesList
                  entities={entitiesData?.entities ?? []}
                  totalEpisodes={entitiesData?.total_episodes ?? 0}
                  activeRules={entitiesData?.active_rules ?? 0}
                  onSelect={(type, id) => setSelectedEntity({ type, id })}
                />
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

// ── MemoryEntitiesList — shows all known entities with drill-down ─────────

import { Activity, Crosshair, Database, Eye, Shield } from 'lucide-react-native';
import type { MemoryEntity } from '../../src/lib/api';

function MemoryEntitiesList({
  entities,
  totalEpisodes,
  activeRules,
  onSelect,
}: {
  entities: MemoryEntity[];
  totalEpisodes: number;
  activeRules: number;
  onSelect: (type: string, id: string) => void;
}) {
  if (entities.length === 0) {
    return (
      <View style={memStyles.emptyWrap}>
        <Brain size={32} color={tokens.white20} />
        <Text style={memStyles.emptyTitle}>No intelligence yet</Text>
        <Text style={memStyles.emptySub}>
          Investigate tokens to build the agent's memory. Each scan teaches it to recognize deployer patterns and rug signals.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Overview stats */}
      <View style={memStyles.overviewRow}>
        <View style={memStyles.overviewPill}>
          <Database size={11} color={tokens.secondary} />
          <Text style={memStyles.overviewValue}>{entities.length}</Text>
          <Text style={memStyles.overviewLabel}>Entities</Text>
        </View>
        <View style={memStyles.overviewPill}>
          <Eye size={11} color={tokens.violet} />
          <Text style={memStyles.overviewValue}>{totalEpisodes}</Text>
          <Text style={memStyles.overviewLabel}>Episodes</Text>
        </View>
        <View style={memStyles.overviewPill}>
          <Shield size={11} color={tokens.success} />
          <Text style={memStyles.overviewValue}>{activeRules}</Text>
          <Text style={memStyles.overviewLabel}>Rules</Text>
        </View>
      </View>

      {/* Entity cards */}
      {entities.map((entity, i) => {
        const rugRate = entity.total_tokens > 0
          ? Math.round((entity.total_rugs / entity.total_tokens) * 100)
          : 0;
        const riskColor = entity.avg_risk_score >= 70
          ? tokens.risk.critical
          : entity.avg_risk_score >= 40
            ? tokens.risk.high
            : tokens.risk.low;
        const isDeployer = entity.entity_type === 'deployer';

        return (
          <Animated.View key={`${entity.entity_type}-${entity.entity_id}`} entering={FadeInDown.delay(i * 40).duration(250)}>
            <TouchableOpacity
              onPress={() => onSelect(entity.entity_type, entity.entity_id)}
              activeOpacity={0.7}
              style={memStyles.entityCard}
            >
              {/* Type badge + ID */}
              <View style={memStyles.entityTopRow}>
                <View style={[memStyles.typeBadge, { backgroundColor: isDeployer ? `${tokens.violet}15` : `${tokens.cyan}15` }]}>
                  <Text style={[memStyles.typeText, { color: isDeployer ? tokens.violet : tokens.cyan }]}>
                    {isDeployer ? 'Deployer' : 'Operator'}
                  </Text>
                </View>
                <Text style={memStyles.entityId}>
                  {entity.entity_id.slice(0, 8)}…{entity.entity_id.slice(-6)}
                </Text>
                <View style={[memStyles.confidenceDot, {
                  backgroundColor: entity.confidence === 'high' ? tokens.success
                    : entity.confidence === 'medium' ? tokens.warning : tokens.white20,
                }]} />
              </View>

              {/* Stats row */}
              <View style={memStyles.entityStatsRow}>
                <View style={memStyles.entityStat}>
                  <Database size={10} color={tokens.textTertiary} />
                  <Text style={memStyles.entityStatValue}>{entity.total_tokens}</Text>
                  <Text style={memStyles.entityStatLabel}>tokens</Text>
                </View>
                <View style={memStyles.entityStat}>
                  <Crosshair size={10} color={tokens.risk.critical} />
                  <Text style={[memStyles.entityStatValue, { color: tokens.risk.critical }]}>{entity.total_rugs}</Text>
                  <Text style={memStyles.entityStatLabel}>rugs</Text>
                </View>
                <View style={memStyles.entityStat}>
                  <Activity size={10} color={riskColor} />
                  <Text style={[memStyles.entityStatValue, { color: riskColor }]}>{entity.avg_risk_score.toFixed(0)}</Text>
                  <Text style={memStyles.entityStatLabel}>avg risk</Text>
                </View>
                {rugRate > 0 && (
                  <View style={[memStyles.rugRatePill, { borderColor: `${tokens.risk.critical}30` }]}>
                    <Text style={memStyles.rugRateText}>{rugRate}% rug</Text>
                  </View>
                )}
              </View>

              {/* Narratives */}
              {entity.preferred_narratives.length > 0 && (
                <View style={memStyles.narrativeRow}>
                  {entity.preferred_narratives.slice(0, 3).map((n) => (
                    <View key={n} style={memStyles.narrativeChip}>
                      <Text style={memStyles.narrativeText}>{n}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Pattern + extraction */}
              <View style={memStyles.entityBottom}>
                {entity.typical_rug_pattern && (
                  <Text style={memStyles.patternText}>
                    {entity.typical_rug_pattern.replace(/_/g, ' ')}
                  </Text>
                )}
                {entity.total_extracted_sol > 0 && (
                  <Text style={memStyles.solText}>
                    {entity.total_extracted_sol.toFixed(1)} SOL extracted
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

const memStyles = StyleSheet.create({
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
    marginTop: 4,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  overviewPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  overviewValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  overviewLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  entityCard: {
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 12,
    gap: 8,
  },
  entityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  typeText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    letterSpacing: 0.3,
  },
  entityId: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    flex: 1,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  entityStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entityStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  entityStatValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  entityStatLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  rugRatePill: {
    marginLeft: 'auto',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    backgroundColor: `${tokens.risk.critical}08`,
  },
  rugRateText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.risk.critical,
  },
  narrativeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  narrativeChip: {
    backgroundColor: `${tokens.accent}10`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.accent}20`,
  },
  narrativeText: {
    fontFamily: 'Lexend-Medium',
    fontSize: 9,
    color: tokens.accent,
    textTransform: 'capitalize',
  },
  entityBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  patternText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textTransform: 'capitalize',
    fontStyle: 'italic',
  },
  solText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.risk.high,
  },
});

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
  memoryBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  memoryBackText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
});
