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
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  ActivitySquare,
  Link2,
  Brain,
  Shield,
  ExternalLink,
} from 'lucide-react-native';
import { FeatureGate } from '../../src/components/ui/FeatureGate';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { useCartel } from '../../src/lib/query';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import {
  startCartelMonitor,
  stopCartelMonitor,
  isCartelMonitored,
} from '../../src/lib/openclaw-cartel-monitor';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Breadcrumbs } from '../../src/components/investigate/Breadcrumbs';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { Dimensions, Linking } from 'react-native';

// ── Signal metadata ──────────────────────────────────────────────────────────

const SIGNAL_META: Record<string, { label: string; color: string }> = {
  dna_match: { label: 'DNA Match', color: tokens.accent },
  sol_transfer: { label: 'SOL Transfer', color: tokens.cyan },
  timing_sync: { label: 'Timing Sync', color: tokens.warning },
  phash_cluster: { label: 'Logo Clone', color: tokens.violet },
  cross_holding: { label: 'Cross Holding', color: tokens.gold },
  funding_link: { label: 'Funding Link', color: tokens.rose },
  shared_lp: { label: 'Shared LP', color: tokens.teal },
  sniper_ring: { label: 'Sniper Ring', color: tokens.peach },
  common_funder: { label: 'Common Funder', color: tokens.accent },
  profit_convergence: { label: 'Profit Convergence', color: tokens.rose },
  capital_recycling: { label: 'Capital Recycling', color: tokens.error },
  temporal_fingerprint: { label: 'Time Pattern', color: tokens.amber },
  compute_budget_fp: { label: 'Script Match', color: tokens.indigo },
};

const CONFIDENCE_MAP: Record<string, 'critical' | 'high' | 'medium'> = {
  high: 'critical',
  medium: 'high',
  low: 'medium',
};

const CONFIDENCE_SHADOW: Record<string, object> = {
  high: tokens.shadow.riskCritical,
  medium: tokens.shadow.riskHigh,
  low: tokens.shadow.riskLow,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function openSolscanTx(sig: string) {
  Linking.openURL(`https://solscan.io/tx/${sig}`).catch(() => {});
}

function strengthPercent(v: number) {
  return `${Math.round(v * 100)}%`;
}

function formatDuration(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'Active today';
  if (days === 1) return 'Active 1 day';
  if (days < 30) return `Active ${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Active 1 month' : `Active ${months} months`;
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function CartelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCartel(id ?? '');
  const ocAvailable = isOpenClawAvailable();
  const [monitored, setMonitored] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);

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
    } catch {
      /* best-effort */
    }
    setMonitorLoading(false);
  };

  const community = data?.deployer_community;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        {/* ── Navbar ─────────────────────────────────────────────────────── */}
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
              accessibilityLabel={
                monitored ? 'Stop monitoring cartel' : 'Monitor this cartel'
              }
            >
              {monitored ? (
                <ActivitySquare size={16} color={tokens.success} />
              ) : (
                <Activity size={16} color={tokens.white60} />
              )}
            </HapticButton>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        <Breadcrumbs
          trail={[
            { label: `Cartel ${id?.slice(0, 6) ?? ''}…`, active: true },
          ]}
        />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={tokens.primary}
            />
          }
        >
          <FeatureGate feature="Cartel Detection" requiredPlan="pro">
            {isLoading && (
              <GlassCard>
                <SkeletonBlock lines={4} />
              </GlassCard>
            )}

            {!isLoading && error && (
              <GlassCard>
                <Text style={styles.errorText}>
                  Could not load cartel data.
                </Text>
              </GlassCard>
            )}

            {community && !isLoading && (
              <Animated.View entering={FadeInDown.duration(350).springify()}>
                {/* ── 1. THREAT HERO ────────────────────────────────────── */}
                <ThreatHero
                  confidence={community.confidence}
                  deployerConfidence={(data as any)?.deployer_confidence ?? 'none'}
                  deployerDirectSignals={(data as any)?.deployer_direct_signals ?? []}
                  deployerDirectEdgeCount={(data as any)?.deployer_direct_edge_count ?? 0}
                  activeSince={community.active_since}
                  strongestSignal={community.strongest_signal}
                />

                {/* ── 2. AI NARRATIVE ───────────────────────────────────── */}
                {(community as any).narrative?.length > 0 && (
                  <NarrativeCard narrative={(community as any).narrative} />
                )}

                {/* ── 3. OVERVIEW ───────────────────────────────────────── */}
                <OverviewCard community={community} />

                {/* ── 4. SIGNAL RADAR ──────────────────────────────────── */}
                {(community.edges?.length ?? 0) > 0 && (
                  <SignalRadar edges={community.edges ?? []} />
                )}

                {/* ── 5. EGO GRAPH ──────────────────────────────────────── */}
                {(community.edges?.length ?? 0) > 0 && (
                  <EgoGraph
                    focusWallet={id ?? ''}
                    edges={community.edges ?? []}
                    allWallets={community.wallets ?? []}
                  />
                )}

                {/* ── 6. NETWORK LINKS ─────────────────────────────────── */}
                {(community.edges?.length ?? 0) > 0 && (
                  <NetworkLinks edges={community.edges ?? []} />
                )}

                {/* ── 7. DEPLOYER RANKING ──────────────────────────────── */}
                {(community.wallets?.length ?? 0) > 0 && (
                  <DeployerRanking
                    wallets={community.wallets ?? []}
                    edges={community.edges ?? []}
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

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1 — THREAT HERO
// ═══════════════════════════════════════════════════════════════════════════════

const DEPLOYER_CONF_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'DIRECT PROOF', color: tokens.risk.critical },
  medium: { label: 'LIKELY LINKED', color: tokens.risk.high },
  low: { label: 'WEAK LINK', color: tokens.risk.medium },
  none: { label: 'NO DIRECT LINK', color: tokens.neutral },
};

function ThreatHero({
  confidence,
  deployerConfidence,
  deployerDirectSignals,
  deployerDirectEdgeCount,
  activeSince,
  strongestSignal,
}: {
  confidence: string;
  deployerConfidence: string;
  deployerDirectSignals: string[];
  deployerDirectEdgeCount: number;
  activeSince?: string | null;
  strongestSignal?: string;
}) {
  const riskLevel = CONFIDENCE_MAP[confidence] ?? 'medium';
  const shadow = CONFIDENCE_SHADOW[confidence] ?? {};
  const signalMeta = SIGNAL_META[strongestSignal ?? ''];
  const duration = formatDuration(activeSince);
  const dConf = DEPLOYER_CONF_LABELS[deployerConfidence] ?? DEPLOYER_CONF_LABELS.none;

  return (
    <GlassCard style={shadow}>
      <View style={heroStyles.container}>
        {/* Deployer-specific confidence (primary) */}
        <Shield size={20} color={dConf.color} style={{ marginBottom: 8 }} />
        <View style={[heroStyles.deployerBadge, { borderColor: `${dConf.color}50`, backgroundColor: `${dConf.color}1A` }]}>
          <Text style={[heroStyles.deployerBadgeText, { color: dConf.color }]}>{dConf.label}</Text>
        </View>
        <Text style={heroStyles.confidenceLabel}>DEPLOYER LINK STRENGTH</Text>

        {/* Direct signals summary */}
        {deployerDirectSignals.length > 0 ? (
          <Text style={heroStyles.directSignals}>
            {deployerDirectEdgeCount} direct link{deployerDirectEdgeCount !== 1 ? 's' : ''} via {deployerDirectSignals.map(s => SIGNAL_META[s]?.label ?? s).join(', ')}
          </Text>
        ) : (
          <Text style={heroStyles.directSignals}>
            Linked only through shared third-party wallets
          </Text>
        )}

        {/* Separator */}
        <View style={heroStyles.separator} />

        {/* Network confidence (secondary) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={heroStyles.networkLabel}>NETWORK:</Text>
          <RiskBadge level={riskLevel} size="sm" />
        </View>

        {duration ? (
          <Text style={heroStyles.duration}>{duration}</Text>
        ) : null}
        {signalMeta && (
          <View
            style={[
              heroStyles.signalPill,
              {
                borderColor: `${signalMeta.color}40`,
                backgroundColor: `${signalMeta.color}12`,
              },
            ]}
          >
            <Text style={[heroStyles.signalText, { color: signalMeta.color }]}>
              {signalMeta.label}
            </Text>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

const heroStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 8 },
  deployerBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  deployerBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    letterSpacing: 1,
  },
  confidenceLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  directSignals: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  separator: {
    width: 40,
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 10,
  },
  networkLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1,
  },
  duration: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 4,
  },
  signalPill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  signalText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.5,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2 — AI NARRATIVE
// ═══════════════════════════════════════════════════════════════════════════════

function NarrativeCard({ narrative }: { narrative: string }) {
  return (
    <GlassCard
      style={{ borderColor: tokens.borderViolet, borderWidth: 1 }}
    >
      <View style={narrativeStyles.header}>
        <Brain size={14} color={tokens.lavender} />
        <Text style={narrativeStyles.title}>AI ANALYSIS</Text>
      </View>
      <Text style={narrativeStyles.body}>{narrative}</Text>
    </GlassCard>
  );
}

const narrativeStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.lavender,
    letterSpacing: 1,
  },
  body: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textBody,
    lineHeight: 20,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3 — OVERVIEW (enhanced)
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewCard({ community }: { community: any }) {
  const tokens_launched = community.total_tokens_launched ?? 0;
  const rugs = community.total_rugs ?? 0;
  const rugRate = tokens_launched > 0 ? rugs / tokens_launched : 0;
  const solExtracted = community.total_sol_extracted ?? 0;
  const rugColor =
    rugRate > 0.6
      ? tokens.risk.critical
      : rugRate > 0.3
        ? tokens.risk.high
        : tokens.risk.medium;

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>OVERVIEW</Text>
      <View style={overviewStyles.row}>
        {/* Stats grid */}
        <View style={overviewStyles.statsCol}>
          <View style={overviewStyles.statsGrid}>
            <GridStat
              label="Deployers"
              value={String(community.wallets?.length ?? 0)}
            />
            <GridStat label="Tokens" value={String(tokens_launched)} />
            <GridStat label="Rugs" value={String(rugs)} />
            <GridStat
              label="Est. Extracted"
              value={
                community.estimated_extracted_usd != null
                  ? `$${(community.estimated_extracted_usd / 1_000).toFixed(0)}K`
                  : '–'
              }
            />
            {solExtracted > 0 && (
              <GridStat
                label="SOL Extracted"
                value={
                  solExtracted >= 1000
                    ? `${(solExtracted / 1000).toFixed(1)}K`
                    : solExtracted.toFixed(1)
                }
              />
            )}
            <GridStat
              label="Rug Rate"
              value={`${Math.round(rugRate * 100)}%`}
            />
          </View>
        </View>
        {/* Gauge */}
        <View style={overviewStyles.gaugeCol}>
          <GaugeRing
            value={rugRate}
            color={rugColor}
            size={64}
            strokeWidth={6}
            label={`${Math.round(rugRate * 100)}`}
            sublabel="RUG %"
          />
        </View>
      </View>
    </GlassCard>
  );
}

function GridStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={overviewStyles.stat}>
      <Text style={overviewStyles.statLabel}>{label}</Text>
      <Text style={overviewStyles.statValue}>{value}</Text>
    </View>
  );
}

const overviewStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  statsCol: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gaugeCol: { marginLeft: 12, alignItems: 'center' },
  stat: { width: '50%', marginBottom: 12 },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 18,
    color: tokens.white100,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4 — SIGNAL RADAR
// ═══════════════════════════════════════════════════════════════════════════════

type Edge = {
  wallet_a: string;
  wallet_b: string;
  signal_type: string;
  signal_strength: number;
  evidence?: Record<string, unknown>;
};

function SignalRadar({ edges }: { edges: Edge[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of edges) {
      map[e.signal_type] = (map[e.signal_type] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [edges]);

  const maxCount = counts[0]?.count ?? 1;

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>SIGNAL RADAR</Text>
      <View style={{ gap: 8 }}>
        {counts.map(({ type, count }, i) => {
          const meta = SIGNAL_META[type] ?? {
            label: type,
            color: tokens.white60,
          };
          const pct = Math.max(0.08, count / maxCount);
          return (
            <Animated.View
              key={type}
              entering={FadeInDown.delay(i * 50)
                .duration(250)
                .springify()}
            >
              <View style={radarStyles.row}>
                <Text style={radarStyles.label}>{meta.label}</Text>
                <View style={radarStyles.barTrack}>
                  <View
                    style={[
                      radarStyles.barFill,
                      {
                        width: `${pct * 100}%`,
                        backgroundColor: meta.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[radarStyles.count, { color: meta.color }]}>
                  {count}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const radarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    width: 80,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.white5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    opacity: 0.8,
  },
  count: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    width: 24,
    textAlign: 'right',
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5 — EGO GRAPH (radial network centered on deployer)
// ═══════════════════════════════════════════════════════════════════════════════

const GRAPH_MAX_PEERS = 12;
const GRAPH_HEIGHT = 300;
const NODE_R_CENTER = 18;
const NODE_R_PEER = 10;

function EgoGraph({
  focusWallet,
  edges,
  allWallets,
}: {
  focusWallet: string;
  edges: Edge[];
  allWallets: string[];
}) {
  // Find direct connections from focusWallet
  const { peers, peerEdges, overflow } = useMemo(() => {
    // Collect unique peers with their strongest edge
    const peerMap = new Map<string, { signal: string; strength: number }>();
    for (const e of edges) {
      let peer: string | null = null;
      if (e.wallet_a === focusWallet) peer = e.wallet_b;
      else if (e.wallet_b === focusWallet) peer = e.wallet_a;
      if (!peer) continue;
      const existing = peerMap.get(peer);
      if (!existing || e.signal_strength > existing.strength) {
        peerMap.set(peer, { signal: e.signal_type, strength: e.signal_strength });
      }
    }
    // Sort by strength descending, cap at max
    const sorted = [...peerMap.entries()]
      .sort((a, b) => b[1].strength - a[1].strength);
    const visible = sorted.slice(0, GRAPH_MAX_PEERS);
    return {
      peers: visible.map(([addr, info]) => ({ addr, ...info })),
      peerEdges: visible,
      overflow: Math.max(0, sorted.length - GRAPH_MAX_PEERS),
    };
  }, [focusWallet, edges]);

  const screenW = Dimensions.get('window').width - tokens.spacing.screenPadding * 2 - 32;
  const W = Math.min(screenW, 400);
  const H = GRAPH_HEIGHT;
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) / 2 - 30;

  if (peers.length === 0) return null;

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>NETWORK GRAPH</Text>
      <View style={{ alignItems: 'center' }}>
        <Svg width={W} height={H}>
          {/* Edges — lines from center to peers */}
          {peers.map((p, i) => {
            const angle = (2 * Math.PI * i) / peers.length - Math.PI / 2;
            const px = cx + radius * Math.cos(angle);
            const py = cy + radius * Math.sin(angle);
            const meta = SIGNAL_META[p.signal] ?? { color: tokens.white35 };
            return (
              <Line
                key={`edge-${i}`}
                x1={cx}
                y1={cy}
                x2={px}
                y2={py}
                stroke={meta.color}
                strokeWidth={Math.max(1, p.strength * 2.5)}
                strokeOpacity={0.6}
              />
            );
          })}

          {/* Peer nodes */}
          {peers.map((p, i) => {
            const angle = (2 * Math.PI * i) / peers.length - Math.PI / 2;
            const px = cx + radius * Math.cos(angle);
            const py = cy + radius * Math.sin(angle);
            const meta = SIGNAL_META[p.signal] ?? { color: tokens.white60 };
            return (
              <React.Fragment key={`peer-${i}`}>
                {/* Glow */}
                <Circle
                  cx={px}
                  cy={py}
                  r={NODE_R_PEER + 3}
                  fill={meta.color}
                  opacity={0.15}
                />
                {/* Node */}
                <Circle
                  cx={px}
                  cy={py}
                  r={NODE_R_PEER}
                  fill={tokens.bgApp}
                  stroke={meta.color}
                  strokeWidth={1.5}
                />
                {/* Label */}
                <SvgText
                  x={px}
                  y={py + NODE_R_PEER + 12}
                  fill={tokens.white60}
                  fontSize={8}
                  fontFamily="Lexend-Regular"
                  textAnchor="middle"
                >
                  {shortAddr(p.addr)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Center node — deployer */}
          <Circle
            cx={cx}
            cy={cy}
            r={NODE_R_CENTER + 4}
            fill={tokens.accent}
            opacity={0.15}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={NODE_R_CENTER}
            fill={tokens.bgApp}
            stroke={tokens.accent}
            strokeWidth={2}
          />
          <SvgText
            x={cx}
            y={cy + 3}
            fill={tokens.accent}
            fontSize={8}
            fontFamily="Lexend-Bold"
            textAnchor="middle"
          >
            {shortAddr(focusWallet)}
          </SvgText>
        </Svg>

        {/* Overflow indicator */}
        {overflow > 0 && (
          <Text style={egoStyles.overflow}>
            +{overflow} more connection{overflow !== 1 ? 's' : ''}
          </Text>
        )}

        {/* Legend */}
        <View style={egoStyles.legend}>
          {(() => {
            // Show legend only for signal types actually in visible edges
            const usedSignals = new Set(peers.map((p) => p.signal));
            return [...usedSignals].map((sig) => {
              const meta = SIGNAL_META[sig];
              if (!meta) return null;
              return (
                <View key={sig} style={egoStyles.legendItem}>
                  <View
                    style={[egoStyles.legendDot, { backgroundColor: meta.color }]}
                  />
                  <Text style={egoStyles.legendText}>{meta.label}</Text>
                </View>
              );
            });
          })()}
        </View>
      </View>
    </GlassCard>
  );
}

const egoStyles = StyleSheet.create({
  overflow: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 6 — NETWORK LINKS (expandable evidence)
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_VISIBLE_EDGES = 8;

function NetworkLinks({ edges }: { edges: Edge[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? edges : edges.slice(0, MAX_VISIBLE_EDGES);
  const hasMore = edges.length > MAX_VISIBLE_EDGES;

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>NETWORK LINKS</Text>
      <View style={{ gap: 4 }}>
        {visible.map((edge, i) => (
          <EdgeLink key={i} edge={edge} />
        ))}
      </View>
      {hasMore && !showAll && (
        <TouchableOpacity
          onPress={() => setShowAll(true)}
          style={linkStyles.showAllBtn}
          activeOpacity={0.7}
        >
          <Text style={linkStyles.showAllText}>
            Show all {edges.length} links
          </Text>
        </TouchableOpacity>
      )}
    </GlassCard>
  );
}

function EdgeLink({ edge }: { edge: Edge }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SIGNAL_META[edge.signal_type] ?? {
    label: edge.signal_type,
    color: tokens.white60,
  };
  const txSig = edge.evidence?.signature
    ? String(edge.evidence.signature)
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => setExpanded((p) => !p)}
    >
      <View style={linkStyles.container}>
        {/* Wallets row */}
        <View style={linkStyles.walletsRow}>
          <TouchableOpacity
            onPress={() =>
              router.push(`/deployer/${edge.wallet_a}` as any)
            }
            activeOpacity={0.7}
          >
            <Text style={linkStyles.wallet}>{shortAddr(edge.wallet_a)}</Text>
          </TouchableOpacity>
          <View style={linkStyles.linkLine}>
            <View
              style={[linkStyles.dot, { backgroundColor: meta.color }]}
            />
            <View
              style={[linkStyles.line, { backgroundColor: meta.color }]}
            />
            <Link2 size={12} color={meta.color} />
            <View
              style={[linkStyles.line, { backgroundColor: meta.color }]}
            />
            <View
              style={[linkStyles.dot, { backgroundColor: meta.color }]}
            />
          </View>
          <TouchableOpacity
            onPress={() =>
              router.push(`/deployer/${edge.wallet_b}` as any)
            }
            activeOpacity={0.7}
          >
            <Text style={linkStyles.wallet}>{shortAddr(edge.wallet_b)}</Text>
          </TouchableOpacity>
        </View>
        {/* Badge row */}
        <View style={linkStyles.badgeRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={[
                linkStyles.badge,
                {
                  borderColor: `${meta.color}40`,
                  backgroundColor: `${meta.color}12`,
                },
              ]}
            >
              <Text style={[linkStyles.badgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
            {txSig ? (
              <TouchableOpacity
                onPress={() => openSolscanTx(txSig)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={linkStyles.txBadge}
                activeOpacity={0.7}
              >
                <ExternalLink size={9} color={tokens.cyan} />
                <Text style={linkStyles.txBadgeText}>TX</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={linkStyles.strength}>
              {strengthPercent(edge.signal_strength)}
            </Text>
            <ChevronDown
              size={12}
              color={tokens.white35}
              style={{
                transform: [{ rotate: expanded ? '180deg' : '0deg' }],
              }}
            />
          </View>
        </View>
        {/* Expanded evidence */}
        {expanded && edge.evidence && (
          <Animated.View entering={FadeInDown.duration(200).springify()}>
            <EvidenceDetail
              signalType={edge.signal_type}
              evidence={edge.evidence}
            />
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function EvidenceDetail({
  signalType,
  evidence,
}: {
  signalType: string;
  evidence: Record<string, unknown>;
}) {
  const lines: { label: string; value: string }[] = [];

  switch (signalType) {
    case 'sol_transfer':
      if (evidence.amount_sol != null)
        lines.push({ label: 'Amount', value: `${evidence.amount_sol} SOL` });
      if (evidence.signature)
        lines.push({
          label: 'TX',
          value: shortAddr(String(evidence.signature)),
        });
      if (evidence.hop != null)
        lines.push({ label: 'Hops', value: String(evidence.hop) });
      break;
    case 'timing_sync':
      if (evidence.narrative)
        lines.push({
          label: 'Narrative',
          value: String(evidence.narrative),
        });
      if (evidence.my_ts && evidence.other_ts) {
        const delta = Math.abs(
          new Date(String(evidence.my_ts)).getTime() -
            new Date(String(evidence.other_ts)).getTime(),
        );
        const mins = Math.round(delta / 60_000);
        lines.push({ label: 'Delta', value: `${mins} min apart` });
      }
      break;
    case 'phash_cluster': {
      const hd = Number(evidence.hamming_distance ?? 0);
      const similarity = ((1 - hd / 64) * 100).toFixed(1);
      lines.push({ label: 'Similarity', value: `${similarity}%` });
      lines.push({ label: 'Hamming', value: `${hd}/64 bits` });
      if (evidence.my_mint)
        lines.push({
          label: 'Mint A',
          value: shortAddr(String(evidence.my_mint)),
        });
      if (evidence.other_mint)
        lines.push({
          label: 'Mint B',
          value: shortAddr(String(evidence.other_mint)),
        });
      break;
    }
    case 'funding_link':
      if (evidence.amount_sol != null)
        lines.push({ label: 'Funded', value: `${evidence.amount_sol} SOL` });
      if (evidence.hours_before_deploy != null)
        lines.push({
          label: 'Before deploy',
          value: `${Number(evidence.hours_before_deploy).toFixed(1)}h`,
        });
      if (evidence.signature)
        lines.push({
          label: 'TX',
          value: shortAddr(String(evidence.signature)),
        });
      break;
    case 'sniper_ring':
      if (evidence.shared_count != null)
        lines.push({
          label: 'Shared buyers',
          value: String(evidence.shared_count),
        });
      if (Array.isArray(evidence.shared_buyers)) {
        const buyers = (evidence.shared_buyers as string[]).slice(0, 3);
        buyers.forEach((b, i) =>
          lines.push({ label: `Buyer ${i + 1}`, value: shortAddr(b) }),
        );
      }
      break;
    case 'shared_lp':
      if (evidence.lp_wallet)
        lines.push({
          label: 'LP wallet',
          value: shortAddr(String(evidence.lp_wallet)),
        });
      if (evidence.shared_count != null)
        lines.push({
          label: 'Shared LPs',
          value: String(evidence.shared_count),
        });
      if (evidence.lp_exclusivity != null)
        lines.push({
          label: 'Exclusivity',
          value: `${Math.round(Number(evidence.lp_exclusivity) * 100)}%`,
        });
      if (evidence.lp_delay_sec != null) {
        const sec = Number(evidence.lp_delay_sec);
        lines.push({
          label: 'LP delay',
          value: sec < 60 ? `${sec}s (insider)` : `${Math.round(sec / 60)}min`,
        });
      }
      if (evidence.lp_sol_amount != null)
        lines.push({
          label: 'LP amount',
          value: `${evidence.lp_sol_amount} SOL`,
        });
      break;
    case 'cross_holding':
      if (evidence.held_mint)
        lines.push({
          label: 'Holds mint',
          value: shortAddr(String(evidence.held_mint)),
        });
      break;
    case 'dna_match':
      if (evidence.fingerprint)
        lines.push({
          label: 'Fingerprint',
          value: shortAddr(String(evidence.fingerprint)),
        });
      break;
    case 'factory_cluster':
      if (evidence.factory_wallet)
        lines.push({
          label: 'Factory',
          value: shortAddr(String(evidence.factory_wallet)),
        });
      if (evidence.shared_factory_count != null)
        lines.push({
          label: 'Shared factories',
          value: String(evidence.shared_factory_count),
        });
      break;
    case 'common_funder':
      if (evidence.funder)
        lines.push({ label: 'Funder', value: shortAddr(String(evidence.funder)) });
      if (evidence.funded_wallet_count != null)
        lines.push({ label: 'Wallets funded', value: String(evidence.funded_wallet_count) });
      if (evidence.amount_sol_a != null)
        lines.push({ label: 'Amount', value: `${evidence.amount_sol_a} SOL` });
      break;
    case 'profit_convergence':
      if (evidence.terminal_wallet)
        lines.push({ label: 'Terminal wallet', value: shortAddr(String(evidence.terminal_wallet)) });
      if (evidence.deployer_count != null)
        lines.push({ label: 'Deployers', value: String(evidence.deployer_count) });
      if (evidence.entity_type)
        lines.push({ label: 'Type', value: String(evidence.entity_type) });
      break;
    case 'capital_recycling':
      if (evidence.recycling_wallet)
        lines.push({ label: 'Recycling wallet', value: shortAddr(String(evidence.recycling_wallet)) });
      if (Array.isArray(evidence.funded_deployers))
        lines.push({ label: 'Funded', value: `${evidence.funded_deployers.length} deployers` });
      if (Array.isArray(evidence.received_from_deployers))
        lines.push({ label: 'Received from', value: `${evidence.received_from_deployers.length} deployers` });
      break;
    case 'temporal_fingerprint':
      if (evidence.jsd_score != null)
        lines.push({ label: 'JSD score', value: String(Number(evidence.jsd_score).toFixed(4)) });
      if (evidence.deployer_a_peak_hours)
        lines.push({ label: 'Peak hours A', value: String(evidence.deployer_a_peak_hours) });
      if (evidence.deployer_b_peak_hours)
        lines.push({ label: 'Peak hours B', value: String(evidence.deployer_b_peak_hours) });
      break;
    case 'compute_budget_fp':
      if (evidence.unit_price != null)
        lines.push({ label: 'Unit price', value: String(evidence.unit_price) });
      if (evidence.program_hash)
        lines.push({ label: 'Program hash', value: String(evidence.program_hash) });
      if (evidence.match_fields)
        lines.push({ label: 'Matched', value: String(evidence.match_fields) });
      break;
  }

  // Extract TX signature for clickable link
  const sig = evidence.signature ? String(evidence.signature) : null;

  if (lines.length === 0 && !sig)
    return (
      <Text style={evidenceStyles.empty}>No detailed evidence available</Text>
    );

  return (
    <View style={evidenceStyles.container}>
      {lines.map((l, i) =>
        l.label === 'TX' && sig ? (
          <TouchableOpacity
            key={i}
            onPress={() => openSolscanTx(sig)}
            activeOpacity={0.7}
          >
            <View style={evidenceStyles.row}>
              <Text style={evidenceStyles.label}>{l.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text
                  style={[evidenceStyles.value, { color: tokens.cyan }]}
                  numberOfLines={1}
                >
                  {l.value}
                </Text>
                <ExternalLink size={9} color={tokens.cyan} />
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View key={i} style={evidenceStyles.row}>
            <Text style={evidenceStyles.label}>{l.label}</Text>
            <Text style={evidenceStyles.value} numberOfLines={1}>
              {l.value}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

const linkStyles = StyleSheet.create({
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
  dot: { width: 5, height: 5, borderRadius: 3 },
  line: { flex: 1, height: 1, opacity: 0.5 },
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
  txBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.cyan}40`,
    backgroundColor: `${tokens.cyan}10`,
  },
  txBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 8,
    color: tokens.cyan,
    letterSpacing: 0.5,
  },
  showAllBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
  },
  showAllText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    letterSpacing: 0.5,
  },
});

const evidenceStyles = StyleSheet.create({
  container: {
    marginTop: 6,
    padding: 10,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  value: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white80,
    maxWidth: '60%',
    textAlign: 'right',
  },
  empty: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    fontStyle: 'italic',
    marginTop: 6,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 6 — DEPLOYER RANKING
// ═══════════════════════════════════════════════════════════════════════════════

function DeployerRanking({
  wallets,
  edges,
}: {
  wallets: string[];
  edges: Edge[];
}) {
  const ranked = useMemo(() => {
    const countMap = new Map<string, { peers: { peer: string; signal: string }[] }>();
    for (const w of wallets) countMap.set(w, { peers: [] });
    for (const e of edges) {
      countMap
        .get(e.wallet_a)
        ?.peers.push({ peer: e.wallet_b, signal: e.signal_type });
      countMap
        .get(e.wallet_b)
        ?.peers.push({ peer: e.wallet_a, signal: e.signal_type });
    }
    return [...countMap.entries()]
      .sort((a, b) => b[1].peers.length - a[1].peers.length)
      .map(([addr, { peers }]) => ({ addr, peers }));
  }, [wallets, edges]);

  return (
    <GlassCard>
      <Text style={styles.sectionTitle}>DEPLOYER RANKING</Text>
      <View style={{ gap: 0 }}>
        {ranked.map(({ addr, peers }, idx) => {
          const isHub = idx === 0 && peers.length > 0;
          return (
            <TouchableOpacity
              key={addr}
              onPress={() => router.push(`/deployer/${addr}` as any)}
              activeOpacity={0.75}
            >
              <View style={rankStyles.row}>
                <View style={rankStyles.info}>
                  <View style={rankStyles.nameRow}>
                    <Text style={rankStyles.addr} numberOfLines={1}>
                      {addr}
                    </Text>
                    {isHub && (
                      <View style={rankStyles.hubBadge}>
                        <Text style={rankStyles.hubText}>HUB</Text>
                      </View>
                    )}
                  </View>
                  <View style={rankStyles.meta}>
                    <Text style={rankStyles.linkCount}>
                      {peers.length} link{peers.length !== 1 ? 's' : ''}
                    </Text>
                    {peers.length > 0 && (
                      <View style={rankStyles.tagsRow}>
                        {peers.map((c, i) => {
                          const meta = SIGNAL_META[c.signal] ?? {
                            label: c.signal,
                            color: tokens.white60,
                          };
                          return (
                            <View key={i} style={rankStyles.tag}>
                              <View
                                style={[
                                  rankStyles.tagDot,
                                  { backgroundColor: meta.color },
                                ]}
                              />
                              <Text style={rankStyles.tagText}>
                                {shortAddr(c.peer)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
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

const rankStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  info: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white100,
    flexShrink: 1,
  },
  hubBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.violet}20`,
    borderWidth: 1,
    borderColor: `${tokens.violet}50`,
  },
  hubText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 8,
    color: tokens.violet,
    letterSpacing: 1,
  },
  meta: { marginTop: 4, gap: 4 },
  linkCount: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Shared styles
// ═══════════════════════════════════════════════════════════════════════════════

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
