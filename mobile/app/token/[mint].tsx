import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Skull,
  AlertTriangle,
  Zap,
  Users,
  ArrowUpRight,
  GitBranch,
  TrendingUp,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Bot,
} from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { useToast } from '../../src/components/ui/Toast';
import { useLineage } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { addWatch } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// ─── Risk helpers ─────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

const RISK_COLOR: Record<RiskLevel, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
  first_rug: tokens.risk.high,
  insufficient_data: tokens.white35,
};

function riskLevelToScore(level: RiskLevel | undefined): number | null {
  switch (level) {
    case 'critical':          return 1.0;
    case 'high':              return 0.75;
    case 'first_rug':         return 0.70;
    case 'medium':            return 0.50;
    case 'low':               return 0.25;
    case 'insufficient_data': return null;
    default:                  return null;
  }
}

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ─── Hero Image ───────────────────────────────────────────────────────────────

function HeroImage({ uri, symbol }: { uri?: string; symbol?: string }) {
  const [errored, setErrored] = useState(false);
  const hasUri = !!uri && uri.trim() !== '' && !errored;
  if (hasUri) {
    return <Image source={{ uri }} style={styles.heroImg} onError={() => setErrored(true)} />;
  }
  return (
    <View style={[styles.heroImg, styles.heroImgFallback]}>
      <Text style={styles.heroImgText}>{symbol?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

// ─── Data Row ─────────────────────────────────────────────────────────────────

function DataRow({ label, value, valueColor, isLast }: {
  label: string; value: string; valueColor?: string; isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && { borderBottomWidth: 0 }]}>
      <Text style={styles.key}>{label}</Text>
      <Text style={[styles.val, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

// ─── Agent Suggestions ───────────────────────────────────────────────────────

function AgentSuggestions({ data, mint }: { data: any; mint: string }) {
  const suggestions = useMemo(() => {
    const s: { Icon: any; text: string; route: string; priority: number }[] = [];
    const dp = data?.deployer_profile;
    const br = data?.bundle_report;
    const ins = data?.insider_sell;
    const cr = data?.cartel_report;
    const sf = data?.sol_flow;

    if (ins?.deployer_exited)
      s.push({ Icon: AlertTriangle, text: 'Deployer has fully exited', route: `/investigate/${mint}`, priority: 0 });
    if (dp?.rug_rate_pct != null && dp.rug_rate_pct > 30)
      s.push({ Icon: ShieldAlert, text: `Deployer rugged ${dp.confirmed_rug_count ?? '?'} tokens (${dp.rug_rate_pct.toFixed(0)}%)`, route: `/investigate/${mint}`, priority: 1 });
    if (br?.overall_verdict?.includes('confirmed'))
      s.push({ Icon: Zap, text: 'Bundle extraction confirmed', route: `/sol-trace/${mint}`, priority: 1 });
    if ((cr?.deployer_community?.wallets?.length ?? 0) > 2)
      s.push({ Icon: Users, text: `${cr.deployer_community.wallets.length} linked deployers`, route: `/cartel/${cr.deployer_community?.community_id}`, priority: 2 });
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 10)
      s.push({ Icon: ArrowUpRight, text: `${sf.total_extracted_sol.toFixed(1)} SOL extracted`, route: `/sol-trace/${mint}`, priority: 1 });

    return s.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [data, mint]);

  if (suggestions.length === 0) return null;

  return (
    <GlassCard style={agentStyles.card}>
      <View style={agentStyles.header}>
        <Bot size={13} color={tokens.secondary} />
        <Text style={agentStyles.title}>AGENT SUGGESTS</Text>
      </View>
      {suggestions.map((s, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => router.push(s.route as any)}
          activeOpacity={0.75}
          style={[agentStyles.row, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
        >
          <s.Icon size={14} color={tokens.secondary} />
          <Text style={agentStyles.text} numberOfLines={1}>{s.text}</Text>
          <ChevronRight size={14} color={tokens.white35} />
        </TouchableOpacity>
      ))}
    </GlassCard>
  );
}

const agentStyles = StyleSheet.create({
  card: { borderColor: `${tokens.secondary}25`, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary, letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  text: { flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white80 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TokenScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useLineage(mint ?? '');
  const { showToast, toast } = useToast();
  const submitting = useRef(false);
  const [showDetails, setShowDetails] = useState(false);
  const reportExpandMint = useAuthStore((s) => s.reportExpandMint);
  const setReportExpandMint = useAuthStore((s) => s.setReportExpandMint);
  const setPendingClockMint = useAuthStore((s) => s.setPendingClockMint);
  const autoExpandedRef = useRef(false);

  useEffect(() => {
    if (reportExpandMint === mint) {
      setShowDetails(true);
      setReportExpandMint(null);
    }
  }, [reportExpandMint, mint]);

  const apiKey = useAuthStore((s) => s.apiKey);
  const addWatchFn = useAuthStore((s) => s.addWatch);
  const watches = useAuthStore((s) => s.watches);
  const alreadyWatched = watches.some((w) => w.value === mint);
  const [watching, setWatching] = useState(alreadyWatched);

  const handleCopy = async (value: string, label = 'Address') => {
    await Clipboard.setStringAsync(value);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${label} copied`);
  };

  const handleWatch = async () => {
    if (!apiKey) {
      showToast('API key required — go to Settings');
      return;
    }
    if (!mint || watching || submitting.current) return;
    submitting.current = true;
    setWatching(true);
    try {
      const w = await addWatch(apiKey, 'mint', mint);
      addWatchFn(w);
      showToast('Token added to watchlist');
    } catch (err) {
      setWatching(false);
      submitting.current = false;
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409') || msg.includes('already')) {
        setWatching(true);
      } else {
        showToast('Failed to watch token');
      }
    }
  };

  // ── derived values ──────────────────────────────────────────────────────────

  const riskLevel = data?.death_clock?.risk_level as RiskLevel | undefined;

  // Fallback risk level — cascades through ALL available signals
  const displayRiskLevel: RiskLevel = (() => {
    // 1. death_clock — primary predictive source
    if (riskLevel && riskLevel !== 'insufficient_data') return riskLevel;
    // 2. insider_sell — live market reality (deployer exited = confirmed rug-in-progress)
    const ins = data?.insider_sell;
    if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) return 'critical';
    if (ins?.verdict === 'insider_dump') return 'high';
    if (ins?.flags?.includes('PRICE_CRASH') && (ins?.sell_pressure_24h ?? 0) > 0.4) return 'high';
    if (ins?.verdict === 'suspicious') return 'medium';
    // 3. bundle_report verdict
    const verdict = data?.bundle_report?.overall_verdict;
    if (verdict === 'confirmed_team_extraction') return 'critical';
    if (verdict === 'suspected_team_extraction' || verdict === 'coordinated_dump_unknown_team') return 'high';
    // 4. deployer rug rate
    const rugRate = data?.deployer_profile?.rug_rate_pct;
    if (rugRate != null && rugRate > 70) return 'critical';
    if (rugRate != null && rugRate > 40) return 'high';
    if (rugRate != null && rugRate > 15) return 'medium';
    // 5. final fallback — token exists but no signal data yet
    return 'insufficient_data';
  })();

  const riskColor = displayRiskLevel ? (RISK_COLOR[displayRiskLevel] ?? tokens.white35) : tokens.white35;
  const riskScore = riskLevelToScore(displayRiskLevel);

  // Auto-expand full report for high/critical risk tokens (once, on data load)
  useEffect(() => {
    if (!autoExpandedRef.current && data && (displayRiskLevel === 'critical' || displayRiskLevel === 'high')) {
      autoExpandedRef.current = true;
      setShowDetails(true);
    }
  }, [data, displayRiskLevel]);
  const mcap = data?.query_token?.market_cap_usd;

  // One-line risk summary sentence (Level 2) — strongest signal wins
  const riskSummary = (() => {
    const ins = data?.insider_sell;
    const dp = data?.deployer_profile;
    const br = data?.bundle_report;
    const dc = data?.death_clock;
    const sf = data?.sol_flow;

    // Insider dump is the most urgent real-time signal
    if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) {
      const price = ins.price_change_24h != null ? ` · ${ins.price_change_24h.toFixed(0)}% 24h` : '';
      return `Deployer exited — insider dump confirmed${price}`;
    }
    if (ins?.verdict === 'insider_dump') {
      return `Insider dump detected · ${((ins.sell_pressure_24h ?? 0) * 100).toFixed(0)}% sell pressure`;
    }
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 10) {
      return `${sf.total_extracted_sol.toFixed(1)} SOL extracted via ${sf.hop_count ?? '?'}-hop chain`;
    }
    if (dp?.rug_rate_pct != null && dp.rug_rate_pct > 30) {
      return `Deployer rugged ${dp.confirmed_rug_count ?? '?'} tokens (${dp.rug_rate_pct.toFixed(0)}% rug rate)`;
    }
    if (br?.overall_verdict && br.overall_verdict !== 'early_buyers_no_link_proven') {
      return br.overall_verdict.replace(/_/g, ' ');
    }
    if (dc?.confidence_note) return dc.confidence_note;
    return null;
  })();

  // Verdict color for bundle
  const verdictColor = (() => {
    const v = data?.bundle_report?.overall_verdict;
    if (!v) return tokens.white60;
    if (v === 'confirmed_team_extraction') return tokens.risk.critical;
    if (v === 'suspected_team_extraction' || v === 'coordinated_dump_unknown_team') return tokens.risk.high;
    return tokens.risk.low;
  })();

  // Bundle detail rows (excluding verdict — shown in summary)
  const bundleDetailRows: { label: string; value: string; color?: string }[] = [];
  if (data?.bundle_report) {
    if (data.bundle_report.total_sol_extracted_confirmed != null) {
      bundleDetailRows.push({
        label: 'SOL extracted',
        value: `${data.bundle_report.total_sol_extracted_confirmed.toFixed(2)} SOL`,
      });
    }
    if ((data.bundle_report.factory_sniper_wallets?.length ?? 0) > 0) {
      bundleDetailRows.push({
        label: 'Sniper wallets',
        value: `${data.bundle_report.factory_sniper_wallets?.length ?? 0} detected`,
      });
    }
  }

  // Whether there are any details to show at all
  const hasDetails =
    !!data?.death_clock ||
    !!data?.insider_sell ||
    (data?.bundle_report?.evidence_chain?.length ?? 0) > 0 ||
    !!data?.deployer_profile ||
    bundleDetailRows.length > 0 ||
    !!data?.sol_flow ||
    !!data?.cartel_report?.deployer_community?.community_id;

  // Risk icon for summary card
  const RiskIcon = displayRiskLevel === 'low'
    ? ShieldCheck
    : displayRiskLevel === 'insufficient_data'
    ? Shield
    : ShieldAlert;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Navbar ── */}
      <View style={[styles.navbar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color={tokens.white100} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>TOKEN REPORT</Text>
        <TouchableOpacity
          onPress={() => handleCopy(mint ?? '', 'Mint address')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Copy mint address"
        >
          <Copy size={18} color={tokens.white35} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 80, 120) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />}
      >
        {/* Loading */}
        {isLoading && (
          <GlassCard>
            <SkeletonBlock lines={3} />
          </GlassCard>
        )}

        {/* Error */}
        {!isLoading && error && (
          <GlassCard>
            <Text style={styles.errorText}>Could not load token. Is the mint address valid?</Text>
          </GlassCard>
        )}

        {data && !isLoading && (
          <Animated.View entering={FadeInDown.duration(350).springify()} style={styles.sections}>

            {/* ════════════════════════════════════════
                LEVEL 1 — Hero  (image · name · gauge)
                ════════════════════════════════════════ */}
            <GlassCard style={styles.heroCard}>
              <View style={styles.heroRow}>
                <HeroImage uri={data.query_token?.image_uri} symbol={data.query_token?.symbol} />

                <View style={styles.heroInfo}>
                  <Text style={styles.heroName} numberOfLines={2}>
                    {data.query_token?.name ?? 'Unknown'}
                  </Text>
                  <Text style={styles.heroSymbol}>{data.query_token?.symbol ?? '—'}</Text>

                  <View style={styles.heroMeta}>
                    {mcap != null && mcap > 0 && (
                      <View style={styles.mcapPill}>
                        <TrendingUp size={10} color={tokens.secondary} strokeWidth={2} />
                        <Text style={styles.mcapText}>{fmtMcap(mcap)}</Text>
                      </View>
                    )}
                    {displayRiskLevel !== 'insufficient_data' ? (
                      <RiskBadge
                        level={displayRiskLevel === 'first_rug' ? 'high' : displayRiskLevel as any}
                        size="sm"
                      />
                    ) : (
                      <View style={styles.unverifiedBadge}>
                        <Text style={styles.unverifiedText}>UNVERIFIED</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => handleCopy(mint ?? '', 'Mint address')}
                    style={styles.mintRow}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mintAddr}>{shortAddr(mint ?? '')}</Text>
                    <Copy size={11} color={tokens.white35} />
                  </TouchableOpacity>
                </View>

                {/* Gauge */}
                {riskScore != null ? (
                  <GaugeRing
                    value={riskScore}
                    color={riskColor}
                    size={76}
                    strokeWidth={6}
                    label={(displayRiskLevel === 'first_rug' ? 'FIRST' : displayRiskLevel?.toUpperCase() ?? '—').split(' ')[0]}
                    sublabel="RISK"
                  />
                ) : (
                  <View style={styles.noDataGauge}>
                    <HelpCircle size={22} color={tokens.white35} strokeWidth={1.5} />
                    <Text style={styles.noDataLabel}>NO{'\n'}DATA</Text>
                  </View>
                )}
              </View>

              {/* Watch */}
              {watching ? (
                <View style={styles.watchingBadge}>
                  <Text style={styles.watchingText}>Watching ✓</Text>
                </View>
              ) : (
                <HapticButton
                  variant="secondary"
                  size="sm"
                  onPress={handleWatch}
                  style={{ marginTop: 14 }}
                >
                  <Text style={styles.btnSecondaryText}>Watch Token</Text>
                </HapticButton>
              )}
            </GlassCard>

            {/* ═══════════════════════════════════════════════════
                AGENT SUGGESTIONS — contextual next actions
                ═══════════════════════════════════════════════════ */}
            <AgentSuggestions data={data} mint={mint ?? ''} />

            {/* ═══════════════════════════════════════════════════
                LEVEL 2 — Risk summary  (verdict · key signal · CTA)
                ═══════════════════════════════════════════════════ */}

            {/* Risk summary card — only when we have a meaningful signal */}
            {displayRiskLevel && displayRiskLevel !== 'insufficient_data' && (
              <GlassCard style={[
                styles.summaryCard,
                { borderColor: `${riskColor}30`, borderWidth: 1 },
              ]}>
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryIconWrap, { backgroundColor: `${riskColor}18` }]}>
                    <RiskIcon size={20} color={riskColor} strokeWidth={2} />
                  </View>
                  <View style={styles.summaryInfo}>
                    <Text style={[styles.summaryTitle, { color: riskColor }]}>
                      {displayRiskLevel === 'first_rug' ? 'FIRST RUG DETECTED' : `${displayRiskLevel.toUpperCase()} RISK`}
                    </Text>
                    {riskSummary && (
                      <Text style={styles.summarySubtitle} numberOfLines={2}>{riskSummary}</Text>
                    )}
                  </View>
                </View>

                {/* Quick stats strip */}
                {(() => {
                  const stats: { label: string; value: string; color?: string }[] = [];
                  const dp = data.deployer_profile;
                  const dc = data.death_clock;
                  const br = data.bundle_report;
                  if (dp?.confirmed_rug_count != null) stats.push({ label: 'Rugs', value: String(dp.confirmed_rug_count), color: tokens.risk.critical });
                  if (dp?.rug_rate_pct != null) stats.push({ label: 'Rug rate', value: `${dp.rug_rate_pct.toFixed(0)}%` });
                  if (dc?.historical_rug_count != null) stats.push({ label: 'History', value: `${dc.historical_rug_count} rugs` });
                  if (br?.total_sol_extracted_confirmed != null) stats.push({ label: 'Extracted', value: `${br.total_sol_extracted_confirmed.toFixed(1)} SOL`, color: tokens.accent });
                  return stats.length > 0 ? (
                    <View style={styles.statsStrip}>
                      {stats.slice(0, 3).map((s, i) => (
                        <View key={i} style={styles.statItem}>
                          <Text style={[styles.statValue, s.color ? { color: s.color } : undefined]}>{s.value}</Text>
                          <Text style={styles.statLabel}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null;
                })()}
              </GlassCard>
            )}

            {/* Primary CTA — single unified investigate button */}
            <HapticButton
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => router.push(`/investigate/${mint}` as any)}
            >
              <Text style={styles.btnPrimaryText}>INVESTIGATE</Text>
            </HapticButton>

            {/* Secondary actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/tree/${mint}` as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="View family tree"
              >
                <GitBranch size={16} color={tokens.secondary} />
                <Text style={styles.actionBtnText}>Family Tree</Text>
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════
                LEVEL 3 — Full report  (expandable)
                ══════════════════════════════════════════ */}
            {hasDetails && (
              <TouchableOpacity
                onPress={() => setShowDetails((v) => !v)}
                activeOpacity={0.75}
                style={styles.detailsToggle}
                accessibilityRole="button"
                accessibilityLabel={showDetails ? 'Hide full report' : 'Show full report'}
              >
                <Text style={styles.detailsToggleText}>
                  {showDetails ? 'Hide full report' : 'Show full report'}
                </Text>
                {showDetails
                  ? <ChevronUp size={15} color={tokens.white35} strokeWidth={2} />
                  : <ChevronDown size={15} color={tokens.white35} strokeWidth={2} />
                }
              </TouchableOpacity>
            )}

            {showDetails && (
              <Animated.View entering={FadeIn.duration(250)} style={styles.detailsSection}>

                {/* Death Clock — teaser card linking to dedicated tab */}
                {(data.death_clock || data.insider_sell) && (() => {
                  const dc = data.death_clock;
                  const effectiveLabel = (() => {
                    if (data.insider_sell?.verdict === 'insider_dump' && data.insider_sell?.deployer_exited) return 'CRITICAL';
                    if (data.insider_sell?.verdict === 'insider_dump') return 'HIGH';
                    if (displayRiskLevel === 'insufficient_data') return 'UNVERIFIED';
                    return displayRiskLevel.toUpperCase().replace('_', ' ');
                  })();
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        setPendingClockMint(mint ?? null);
                        router.push('/(tabs)/clock' as any);
                      }}
                      activeOpacity={0.75}
                    >
                      <GlassCard style={[styles.teaserCard, { borderColor: `${riskColor}30`, borderWidth: 1 }]}>
                        <View style={styles.teaserRow}>
                          <View style={[styles.teaserIconWrap, { backgroundColor: `${riskColor}15` }]}>
                            <Skull size={16} color={riskColor} strokeWidth={2} />
                          </View>
                          <View style={styles.teaserInfo}>
                            <View style={styles.teaserTitleRow}>
                              <Text style={styles.teaserLabel}>DEATH CLOCK</Text>
                              <View style={[styles.teaserBadge, { backgroundColor: `${riskColor}18`, borderColor: `${riskColor}35` }]}>
                                <Text style={[styles.teaserBadgeText, { color: riskColor }]}>{effectiveLabel}</Text>
                              </View>
                            </View>
                            {riskSummary && (
                              <Text style={styles.teaserSub} numberOfLines={1}>{riskSummary}</Text>
                            )}
                            {dc?.rug_probability_pct != null && (
                              <Text style={styles.teaserProb}>
                                Rug probability:{' '}
                                <Text style={{ color: riskColor, fontFamily: 'Lexend-Bold' }}>
                                  {dc.rug_probability_pct.toFixed(0)}%
                                </Text>
                              </Text>
                            )}
                          </View>
                          <ChevronRight size={16} color={tokens.white35} />
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  );
                })()}

                {/* Suspicious flags */}
                {(data.bundle_report?.evidence_chain?.length ?? 0) > 0 && (
                  <GlassCard>
                    <Text style={styles.sectionTitle}>SUSPICIOUS FLAGS</Text>
                    <View style={styles.flagsWrap}>
                      {(data.bundle_report?.evidence_chain ?? []).map((flag, i) => (
                        <View key={i} style={styles.flag}>
                          <AlertTriangle size={12} color={tokens.accent} />
                          <Text style={styles.flagText}>{flag}</Text>
                        </View>
                      ))}
                    </View>
                  </GlassCard>
                )}

                {/* Deployer */}
                {data.deployer_profile && (
                  <TouchableOpacity
                    onPress={() => router.push(`/deployer/${data.deployer_profile?.address}` as any)}
                    onLongPress={() => handleCopy(data.deployer_profile?.address ?? '', 'Deployer address')}
                    delayLongPress={400}
                    activeOpacity={0.75}
                  >
                    <GlassCard
                      style={[styles.linkCard, { borderLeftColor: `${tokens.secondary}60`, borderLeftWidth: 3 }]}
                      noPadding
                    >
                      <View style={styles.linkRow}>
                        <Users size={18} color={tokens.secondary} />
                        <View style={styles.linkInfo}>
                          <Text style={styles.linkLabel}>Deployer Profile</Text>
                          <Text style={styles.linkAddr} numberOfLines={1}>
                            {shortAddr(data.deployer_profile.address)}
                          </Text>
                          {data.deployer_profile.rug_rate_pct != null && (
                            <Text style={styles.linkMeta}>
                              Rug rate: {data.deployer_profile.rug_rate_pct.toFixed(0)}%
                              {data.deployer_profile.confirmed_rug_count != null
                                ? ` · ${data.deployer_profile.confirmed_rug_count} confirmed rugs`
                                : ''}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={tokens.white35} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                )}

                {/* Bundle report details */}
                {bundleDetailRows.length > 0 && (
                  <GlassCard>
                    <View style={[styles.verdictBanner, { backgroundColor: `${verdictColor}18`, borderColor: `${verdictColor}35` }]}>
                      <Skull size={13} color={verdictColor} />
                      <Text style={[styles.verdictBannerText, { color: verdictColor }]}>
                        {(data.bundle_report?.overall_verdict ?? '').toUpperCase().replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={[styles.sectionTitle, { marginTop: 12 }]}>BUNDLE REPORT</Text>
                    {bundleDetailRows.map((r, i) => (
                      <DataRow
                        key={r.label}
                        label={r.label}
                        value={r.value}
                        valueColor={r.color}
                        isLast={i === bundleDetailRows.length - 1}
                      />
                    ))}
                  </GlassCard>
                )}

                {/* SOL Flow */}
                {data.sol_flow && (
                  <TouchableOpacity
                    onPress={() => router.push(`/sol-trace/${mint}` as any)}
                    activeOpacity={0.75}
                  >
                    <GlassCard
                      style={[styles.linkCard, { borderLeftColor: `${tokens.secondary}60`, borderLeftWidth: 3 }]}
                      noPadding
                    >
                      <View style={styles.linkRow}>
                        <ArrowUpRight size={18} color={tokens.secondary} />
                        <View style={styles.linkInfo}>
                          <Text style={styles.linkLabel}>SOL Flow Trace</Text>
                          {data.sol_flow.total_extracted_sol != null && (
                            <Text style={styles.linkMeta}>
                              {data.sol_flow.total_extracted_sol.toFixed(2)} SOL extracted
                              {data.sol_flow.hop_count != null ? ` · ${data.sol_flow.hop_count} hops` : ''}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={tokens.white35} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                )}

                {/* Cartel */}
                {data.cartel_report?.deployer_community?.community_id && (
                  <TouchableOpacity
                    onPress={() => router.push(`/cartel/${data.cartel_report?.deployer_community?.community_id}` as any)}
                    activeOpacity={0.75}
                  >
                    <GlassCard
                      style={[styles.linkCard, { borderLeftColor: `${tokens.accent}60`, borderLeftWidth: 3 }]}
                      noPadding
                    >
                      <View style={styles.linkRow}>
                        <Zap size={18} color={tokens.accent} />
                        <View style={styles.linkInfo}>
                          <Text style={styles.linkLabel}>Cartel Network</Text>
                          {data.cartel_report.deployer_community.wallets != null && (
                            <Text style={styles.linkMeta}>
                              {data.cartel_report.deployer_community.wallets.length} deployers
                              {data.cartel_report.deployer_community.estimated_extracted_usd != null
                                ? ` · ${fmtMcap(data.cartel_report.deployer_community.estimated_extracted_usd)}`
                                : ''}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={tokens.white35} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                )}

              </Animated.View>
            )}

          </Animated.View>
        )}
      </ScrollView>

      {toast}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 12,
  },
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },

  content: { paddingHorizontal: tokens.spacing.screenPadding, gap: 12 },
  sections: { gap: 12 },

  // ── Level 1: Hero ────────────────────────────────────────────────────────────
  heroCard: {},
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroImg: { width: 72, height: 72, borderRadius: tokens.radius.md },
  heroImgFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  heroImgText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white60 },
  heroInfo: { flex: 1, gap: 4 },
  heroName: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white100, lineHeight: 22 },
  heroSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  mcapPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${tokens.secondary}15`, borderRadius: tokens.radius.pill,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: `${tokens.secondary}25`,
  },
  mcapText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary },
  mintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  mintAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, letterSpacing: 0.3 },
  noDataGauge: {
    width: 76, height: 76, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: 38, borderWidth: 1.5, borderColor: tokens.borderSubtle, borderStyle: 'dashed',
  },
  noDataLabel: {
    fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white35,
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 11,
  },
  watchingBadge: {
    marginTop: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.success}15`, borderWidth: 1, borderColor: `${tokens.success}35`,
  },
  watchingText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.success },

  // ── Level 2: Summary card ────────────────────────────────────────────────────
  summaryCard: {},
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIconWrap: {
    width: 44, height: 44, borderRadius: tokens.radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryInfo: { flex: 1 },
  summaryTitle: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, letterSpacing: 0.5 },
  summarySubtitle: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, marginTop: 3, lineHeight: 17,
  },
  statsStrip: {
    flexDirection: 'row', marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: tokens.borderSubtle, gap: 0,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100 },
  statLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, letterSpacing: 0.4 },

  // ── Level 2: Actions ─────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row', borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8, overflow: 'hidden',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 14,
  },
  actionBtnText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.secondary, letterSpacing: 0.3,
  },
  actionDivider: { width: 1, backgroundColor: tokens.borderSubtle },

  // ── Level 3: Expandable ──────────────────────────────────────────────────────
  detailsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  detailsToggleText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white35, letterSpacing: 0.4,
  },
  detailsSection: { gap: 12 },

  // Shared detail styles
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, letterSpacing: 1, marginBottom: 10,
  },
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${tokens.accent}15`, borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: `${tokens.accent}30`,
  },
  flagText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.accent },
  verdictBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: tokens.radius.sm,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  verdictBannerText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, letterSpacing: 0.8 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  key: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60 },
  val: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  linkCard: {},
  linkRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: tokens.spacing.cardPadding, gap: 12,
  },
  linkInfo: { flex: 1 },
  linkLabel: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  linkAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white35, marginTop: 2 },
  linkMeta: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60, marginTop: 2 },
  errorText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.accent, textAlign: 'center' },

  btnSecondaryText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.primary },
  btnPrimaryText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100, letterSpacing: 0.5 },

  // Death Clock teaser card
  teaserCard: {},
  teaserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teaserIconWrap: {
    width: 32, height: 32, borderRadius: tokens.radius.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  teaserInfo: { flex: 1, gap: 3 },
  teaserTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teaserLabel: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny,
    color: tokens.white60, letterSpacing: 1,
  },
  teaserBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: tokens.radius.pill, borderWidth: 1,
  },
  teaserBadgeText: {
    fontFamily: 'Lexend-Bold', fontSize: 9, letterSpacing: 0.6,
  },
  teaserSub: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  teaserProb: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  unverifiedBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.white35}12`,
    borderWidth: 1, borderColor: `${tokens.white35}30`,
  },
  unverifiedText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny,
    color: tokens.white35, letterSpacing: 0.8,
  },

});
