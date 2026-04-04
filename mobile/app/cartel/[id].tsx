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

                {/* ── 5. NETWORK LINKS ─────────────────────────────────── */}
                {(community.edges?.length ?? 0) > 0 && (
                  <NetworkLinks edges={community.edges ?? []} />
                )}

                {/* ── 6. DEPLOYER RANKING ──────────────────────────────── */}
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

function ThreatHero({
  confidence,
  activeSince,
  strongestSignal,
}: {
  confidence: string;
  activeSince?: string | null;
  strongestSignal?: string;
}) {
  const riskLevel = CONFIDENCE_MAP[confidence] ?? 'medium';
  const shadow = CONFIDENCE_SHADOW[confidence] ?? {};
  const signalMeta = SIGNAL_META[strongestSignal ?? ''];
  const duration = formatDuration(activeSince);

  return (
    <GlassCard style={shadow}>
      <View style={heroStyles.container}>
        <Shield size={20} color={tokens.white35} style={{ marginBottom: 8 }} />
        <RiskBadge level={riskLevel} size="md" />
        <Text style={heroStyles.confidenceLabel}>THREAT CONFIDENCE</Text>
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
  confidenceLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1.5,
    marginTop: 8,
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
// Section 5 — NETWORK LINKS (expandable evidence)
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
  }

  if (lines.length === 0)
    return (
      <Text style={evidenceStyles.empty}>No detailed evidence available</Text>
    );

  return (
    <View style={evidenceStyles.container}>
      {lines.map((l, i) => (
        <View key={i} style={evidenceStyles.row}>
          <Text style={evidenceStyles.label}>{l.label}</Text>
          <Text style={evidenceStyles.value} numberOfLines={1}>
            {l.value}
          </Text>
        </View>
      ))}
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
