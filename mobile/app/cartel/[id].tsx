import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, ChevronRight, Activity, ActivitySquare, Link2 } from 'lucide-react-native';
import { FeatureGate } from '../../src/components/ui/FeatureGate';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { useCartel } from '../../src/lib/query';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import { startCartelMonitor, stopCartelMonitor, isCartelMonitored } from '../../src/lib/openclaw-cartel-monitor';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Breadcrumbs } from '../../src/components/investigate/Breadcrumbs';

export default function CartelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCartel(id ?? '');
  const ocAvailable = isOpenClawAvailable();
  const [monitored, setMonitored] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Check monitoring status on mount
  useEffect(() => {
    if (!id || !ocAvailable) return;
    isCartelMonitored(id).then(setMonitored).catch(() => {});
  }, [id, ocAvailable]);

  const handleMonitorToggle = async () => {
    if (!id || monitorLoading) return;
    setMonitorLoading(true);
    try {
      if (monitored) {
        await stopCartelMonitor(id);
        setMonitored(false);
      } else {
        const label = data?.deployer_community?.wallets?.[0]?.slice(0, 8);
        await startCartelMonitor(id, label);
        setMonitored(true);
      }
    } catch { /* best-effort */ }
    setMonitorLoading(false);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>CARTEL NETWORK</Text>
          {ocAvailable ? (
            <HapticButton
              variant="ghost"
              size="sm"
              loading={monitorLoading}
              onPress={handleMonitorToggle}
              style={monitored ? styles.monitorBtnActive : styles.monitorBtn}
              accessibilityRole="button"
              accessibilityLabel={monitored ? 'Stop monitoring cartel' : 'Monitor this cartel'}
            >
              {monitored
                ? <ActivitySquare size={16} color={tokens.success} />
                : <Activity size={16} color={tokens.white60} />}
            </HapticButton>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        <Breadcrumbs trail={[
          { label: `Cartel ${id?.slice(0, 6) ?? ''}…`, active: true },
        ]} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.primary} />}
        >
          <FeatureGate feature="Cartel Detection" requiredPlan="pro">
          {isLoading && <GlassCard><SkeletonBlock lines={4} /></GlassCard>}

          {!isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Could not load cartel data.</Text>
            </GlassCard>
          )}

          {data && !isLoading && (
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              {/* Overview */}
              <GlassCard>
                <Text style={styles.sectionTitle}>OVERVIEW</Text>
                <View style={styles.statsGrid}>
                  <GridStat label="Deployers" value={String(data.deployer_community?.wallets?.length ?? 0)} />
                  <GridStat label="Tokens" value={String(data.deployer_community?.total_tokens_launched ?? 0)} />
                  <GridStat label="Rugs" value={String(data.deployer_community?.total_rugs ?? 0)} />
                  <GridStat label="Est. Extracted" value={data.deployer_community?.estimated_extracted_usd != null ? `$${(data.deployer_community.estimated_extracted_usd / 1_000).toFixed(0)}K` : '–'} />
                </View>
              </GlassCard>

              {/* Network links — show which wallets are connected and why */}
              {(data.deployer_community?.edges?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>NETWORK LINKS</Text>
                  <View style={{ gap: 10 }}>
                    {(data.deployer_community?.edges ?? []).map((edge, i) => (
                      <EdgeLink key={i} edge={edge} />
                    ))}
                  </View>
                </GlassCard>
              )}

              {/* Connected deployer wallets with their link summary */}
              {(data.deployer_community?.wallets?.length ?? 0) > 0 && (
                <DeployerList
                  wallets={data.deployer_community?.wallets ?? []}
                  edges={data.deployer_community?.edges ?? []}
                />
              )}
            </Animated.View>
          )}
          </FeatureGate>
        </ScrollView>
      </View>
    </View>
  );
}

function GridStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '48%', marginBottom: 12 }}>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>{label}</Text>
      <Text style={{ fontFamily: 'Lexend-Bold', fontSize: 18, color: tokens.white100 }}>{value}</Text>
    </View>
  );
}

const SIGNAL_META: Record<string, { label: string; color: string }> = {
  dna_match:      { label: 'DNA Match',       color: tokens.accent },
  sol_transfer:   { label: 'SOL Transfer',    color: tokens.cyan },
  timing_sync:    { label: 'Timing Sync',     color: tokens.warning },
  phash_cluster:  { label: 'Logo Clone',      color: tokens.violet },
  cross_holding:  { label: 'Cross Holding',   color: tokens.gold },
  funding_link:   { label: 'Funding Link',    color: tokens.rose },
  shared_lp:      { label: 'Shared LP',       color: tokens.teal },
  sniper_ring:    { label: 'Sniper Ring',      color: tokens.peach },
};

function shortAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function strengthPercent(v: number) {
  return `${Math.round(v * 100)}%`;
}

type EdgeLinkProps = {
  edge: { wallet_a: string; wallet_b: string; signal_type: string; signal_strength: number };
};

function EdgeLink({ edge }: EdgeLinkProps) {
  const meta = SIGNAL_META[edge.signal_type] ?? { label: edge.signal_type, color: tokens.white60 };
  return (
    <View style={edgeStyles.container}>
      {/* Wallets row */}
      <View style={edgeStyles.walletsRow}>
        <TouchableOpacity onPress={() => router.push(`/deployer/${edge.wallet_a}` as any)} activeOpacity={0.7}>
          <Text style={edgeStyles.wallet}>{shortAddr(edge.wallet_a)}</Text>
        </TouchableOpacity>
        <View style={edgeStyles.linkLine}>
          <View style={[edgeStyles.dot, { backgroundColor: meta.color }]} />
          <View style={[edgeStyles.line, { backgroundColor: meta.color }]} />
          <Link2 size={12} color={meta.color} />
          <View style={[edgeStyles.line, { backgroundColor: meta.color }]} />
          <View style={[edgeStyles.dot, { backgroundColor: meta.color }]} />
        </View>
        <TouchableOpacity onPress={() => router.push(`/deployer/${edge.wallet_b}` as any)} activeOpacity={0.7}>
          <Text style={edgeStyles.wallet}>{shortAddr(edge.wallet_b)}</Text>
        </TouchableOpacity>
      </View>
      {/* Signal badge */}
      <View style={edgeStyles.badgeRow}>
        <View style={[edgeStyles.badge, { borderColor: `${meta.color}40`, backgroundColor: `${meta.color}12` }]}>
          <Text style={[edgeStyles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={edgeStyles.strength}>{strengthPercent(edge.signal_strength)}</Text>
      </View>
    </View>
  );
}

const edgeStyles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
    gap: 6,
  },
  walletsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wallet: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  linkLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  line: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.5,
  },
  strength: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
});

type DeployerListProps = {
  wallets: string[];
  edges: { wallet_a: string; wallet_b: string; signal_type: string; signal_strength: number }[];
};

function DeployerList({ wallets, edges }: DeployerListProps) {
  // For each wallet, compute its connections
  const connectionMap = useMemo(() => {
    const map = new Map<string, { peer: string; signal: string }[]>();
    for (const w of wallets) map.set(w, []);
    for (const e of edges) {
      map.get(e.wallet_a)?.push({ peer: e.wallet_b, signal: e.signal_type });
      map.get(e.wallet_b)?.push({ peer: e.wallet_a, signal: e.signal_type });
    }
    return map;
  }, [wallets, edges]);

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>CONNECTED DEPLOYERS</Text>
      <View style={{ gap: 0 }}>
        {wallets.map((addr) => {
          const conns = connectionMap.get(addr) ?? [];
          return (
            <TouchableOpacity
              key={addr}
              onPress={() => router.push(`/deployer/${addr}` as any)}
              activeOpacity={0.75}
            >
              <View style={styles.deployerRow}>
                <View style={styles.deployerInfo}>
                  <Text style={styles.deployerAddr} numberOfLines={1}>{addr}</Text>
                  {conns.length > 0 && (
                    <View style={dlStyles.tagsRow}>
                      {conns.map((c, i) => {
                        const meta = SIGNAL_META[c.signal] ?? { label: c.signal, color: tokens.white60 };
                        return (
                          <View key={i} style={dlStyles.tag}>
                            <View style={[dlStyles.tagDot, { backgroundColor: meta.color }]} />
                            <Text style={dlStyles.tagText}>{shortAddr(c.peer)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
                <ChevronRight size={16} color={tokens.textTertiary} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassCard>
  );
}

const dlStyles = StyleSheet.create({
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.bgGlass8,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tagText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
  },
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 48,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 12,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  deployerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  deployerInfo: { flex: 1 },
  deployerAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  deployerMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 2,
  },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
  monitorBtn: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  monitorBtnActive: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: `${tokens.success}50`,
    backgroundColor: `${tokens.success}10`,
  },
});
