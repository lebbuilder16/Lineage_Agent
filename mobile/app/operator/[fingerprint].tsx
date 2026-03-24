import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Clock,
  Shield,
} from 'lucide-react-native';
import { FeatureGate } from '../../src/components/ui/FeatureGate';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useOperatorImpact } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Breadcrumbs } from '../../src/components/investigate/Breadcrumbs';

function riskFromRugRate(rate: number): 'low' | 'medium' | 'high' | 'critical' {
  if (rate >= 60) return 'critical';
  if (rate >= 40) return 'high';
  if (rate >= 15) return 'medium';
  return 'low';
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OperatorScreen() {
  const insets = useSafeAreaInsets();
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const { data, isLoading, error, refetch } = useOperatorImpact(fingerprint ?? '');

  const risk = data ? riskFromRugRate(data.rug_rate_pct) : 'low';
  const riskColor = tokens.risk[risk];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>OPERATOR FINGERPRINT</Text>
          <View style={{ width: 24 }} />
        </View>

        <Breadcrumbs trail={[
          { label: `Operator ${fingerprint?.slice(0, 8) ?? ''}…`, active: true },
        ]} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.primary} />
          }
        >
          <FeatureGate feature="Operator Fingerprint" requiredPlan="pro_plus">
          {isLoading && (
            <GlassCard>
              <SkeletonBlock lines={5} />
            </GlassCard>
          )}

          {!isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Could not load operator data.</Text>
            </GlassCard>
          )}

          {data && !isLoading && (
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              {/* Identity card */}
              <GlassCard>
                <View style={styles.identityRow}>
                  <View style={styles.fpIconWrap}>
                    <Fingerprint size={28} color={tokens.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fpLabel}>DNA Fingerprint</Text>
                    <Text style={styles.fpValue} selectable numberOfLines={1}>
                      {data.fingerprint}
                    </Text>
                  </View>
                </View>
                <View style={styles.confidenceRow}>
                  <RiskBadge level={risk} size="sm" />
                  {data.is_campaign_active && (
                    <View style={styles.campaignBadge}>
                      <View style={styles.campaignDot} />
                      <Text style={styles.campaignText}>ACTIVE CAMPAIGN</Text>
                    </View>
                  )}
                  <Text style={styles.confidenceText}>
                    Confidence: {data.confidence}
                  </Text>
                </View>
              </GlassCard>

              {/* Damage gauge + stats */}
              <GlassCard>
                <Text style={styles.sectionTitle}>DAMAGE LEDGER</Text>
                <View style={styles.gaugeRow}>
                  <GaugeRing
                    value={data.rug_rate_pct / 100}
                    color={riskColor}
                    size={100}
                    label={`${data.rug_rate_pct.toFixed(0)}%`}
                    sublabel="Rug Rate"
                  />
                  <View style={styles.statsCol}>
                    <StatLine icon={TrendingUp} label="Tokens launched" value={String(data.total_tokens_launched)} />
                    <StatLine icon={AlertTriangle} label="Total rugs" value={String(data.total_rug_count)} color={tokens.risk.high} />
                    <StatLine icon={Shield} label="Confirmed rugs" value={String(data.total_confirmed_rug_count)} color={tokens.accent} />
                    <StatLine
                      icon={Wallet}
                      label="Est. extracted"
                      value={fmtUsd(data.estimated_extracted_usd)}
                      color={tokens.risk.critical}
                    />
                  </View>
                </View>
                {data.is_estimated && (
                  <Text style={styles.estimateNote}>
                    Extraction is estimated (15% of rugged mcap heuristic)
                  </Text>
                )}
              </GlassCard>

              {/* Rug mechanisms */}
              {data.rug_mechanism_counts && Object.keys(data.rug_mechanism_counts).length > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>RUG MECHANISMS</Text>
                  {Object.entries(data.rug_mechanism_counts).map(([mech, count]) => (
                    <View key={mech} style={styles.mechRow}>
                      <Text style={styles.mechLabel}>{mech.replace(/_/g, ' ').toUpperCase()}</Text>
                      <Text style={styles.mechCount}>{count}</Text>
                    </View>
                  ))}
                </GlassCard>
              )}

              {/* Narrative sequence */}
              {(data.narrative_sequence?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>NARRATIVE SEQUENCE</Text>
                  <View style={styles.narrativeWrap}>
                    {(data.narrative_sequence ?? []).map((n, i) => (
                      <View key={i} style={styles.narrativePill}>
                        <Text style={styles.narrativeText}>{n}</Text>
                        {i < (data.narrative_sequence?.length ?? 0) - 1 && (
                          <Text style={styles.narrativeArrow}> → </Text>
                        )}
                      </View>
                    ))}
                  </View>
                </GlassCard>
              )}

              {/* Timeline */}
              <GlassCard>
                <Text style={styles.sectionTitle}>TIMELINE</Text>
                <StatLine
                  icon={Clock}
                  label="First activity"
                  value={data.first_activity ? timeSince(data.first_activity) : '–'}
                />
                <StatLine
                  icon={Clock}
                  label="Last activity"
                  value={data.last_activity ? timeSince(data.last_activity) : '–'}
                />
                <StatLine
                  icon={TrendingUp}
                  label="Peak concurrent tokens"
                  value={String(data.peak_concurrent_tokens)}
                />
              </GlassCard>

              {/* Linked wallets */}
              <GlassCard>
                <Text style={styles.sectionTitle}>
                  LINKED WALLETS ({data.linked_wallets.length})
                </Text>
                {data.linked_wallets.map((addr) => (
                  <TouchableOpacity
                    key={addr}
                    onPress={() => router.push(`/deployer/${addr}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.walletRow}>
                      <Wallet size={14} color={tokens.textTertiary} />
                      <Text style={styles.walletAddr} numberOfLines={1}>
                        {addr}
                      </Text>
                      <ChevronRight size={16} color={tokens.textTertiary} />
                    </View>
                  </TouchableOpacity>
                ))}
              </GlassCard>

              {/* Active tokens */}
              {(data.active_tokens?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>
                    ACTIVE TOKENS ({data.active_tokens?.length ?? 0})
                  </Text>
                  {(data.active_tokens ?? []).map((mint) => (
                    <TouchableOpacity
                      key={mint}
                      onPress={() => router.push(`/token/${mint}` as any)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.walletRow}>
                        <TrendingUp size={14} color={tokens.success} />
                        <Text style={styles.walletAddr} numberOfLines={1}>
                          {mint}
                        </Text>
                        <ChevronRight size={16} color={tokens.textTertiary} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </GlassCard>
              )}
            </Animated.View>
          )}
          </FeatureGate>
        </ScrollView>
      </View>
    </View>
  );
}

function StatLine({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.statLine}>
      <Icon size={14} color={tokens.textTertiary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

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
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  fpIconWrap: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.sm,
    backgroundColor: `${tokens.secondary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fpLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60 },
  fpValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confidenceText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginLeft: 'auto' },
  campaignBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.accent}20`,
  },
  campaignDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent },
  campaignText: { fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.accent, letterSpacing: 0.5 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statsCol: { flex: 1, gap: 8 },
  estimateNote: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 8, fontStyle: 'italic' },
  mechRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  mechLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  mechCount: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.white100 },
  narrativeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  narrativePill: { flexDirection: 'row', alignItems: 'center' },
  narrativeText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    backgroundColor: `${tokens.secondary}15`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },
  narrativeArrow: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  walletAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white100,
    flex: 1,
  },
  statLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  statLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60, flex: 1 },
  statValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.white100 },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
