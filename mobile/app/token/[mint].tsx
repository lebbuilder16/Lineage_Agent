import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Skull,
  AlertTriangle,
  Zap,
  Users,
  ArrowUpRight,
  GitBranch,
  MessageCircle,
  TrendingUp,
  HelpCircle,
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// ─── Risk mapping — handles all 6 API values ─────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

const RISK_COLOR: Record<RiskLevel, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
  first_rug: tokens.risk.high,         // first offence — treat as high
  insufficient_data: tokens.white35,   // unknown — neutral grey
};

// Returns 0-1 for gauge, null hides the gauge entirely
function riskLevelToScore(level: RiskLevel | undefined): number | null {
  switch (level) {
    case 'critical':           return 1.0;
    case 'high':               return 0.75;
    case 'first_rug':          return 0.70;
    case 'medium':             return 0.50;
    case 'low':                return 0.25;
    case 'insufficient_data':  return null;
    default:                   return null;
  }
}

// Human-readable label for special values
function riskLevelLabel(level: RiskLevel | undefined): string {
  if (level === 'first_rug') return 'FIRST RUG';
  if (level === 'insufficient_data') return 'NO DATA';
  return level?.toUpperCase() ?? '—';
}

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ─── Hero Image — guards empty string URI + onError fallback ─────────────────

function HeroImage({ uri, symbol }: { uri?: string; symbol?: string }) {
  const [errored, setErrored] = useState(false);
  const hasUri = !!uri && uri.trim() !== '' && !errored;
  if (hasUri) {
    return (
      <Image
        source={{ uri }}
        style={styles.heroImg}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <View style={[styles.heroImg, styles.heroImgFallback]}>
      <Text style={styles.heroImgText}>{symbol?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

// ─── Data Row — no border on last item ───────────────────────────────────────

function DataRow({ label, value, valueColor, isLast }: {
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && { borderBottomWidth: 0 }]}>
      <Text style={styles.key}>{label}</Text>
      <Text style={[styles.val, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TokenScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useLineage(mint ?? '');
  const { showToast, toast } = useToast();
  const submitting = useRef(false);

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
    if (!apiKey || !mint || watching || submitting.current) return;
    submitting.current = true;
    setWatching(true);   // optimistic — immediate guard against double-tap
    try {
      const w = await addWatch(apiKey, 'mint', mint);
      addWatchFn(w);
    } catch (err) {
      setWatching(false);  // revert on error
      submitting.current = false;
      console.error('[handleWatch]', err);
    }
  };

  const riskLevel = data?.death_clock?.risk_level as RiskLevel | undefined;
  const riskColor = riskLevel ? RISK_COLOR[riskLevel] ?? tokens.white35 : tokens.white35;
  const riskScore = riskLevelToScore(riskLevel);

  const mcap = data?.query_token?.market_cap_usd;

  // Bundle verdict color
  const verdictColor = (() => {
    const v = data?.bundle_report?.overall_verdict;
    if (!v) return tokens.white60;
    if (v === 'confirmed_team_extraction') return tokens.risk.critical;
    if (v === 'suspected_team_extraction' || v === 'coordinated_dump_unknown_team') return tokens.risk.high;
    return tokens.risk.low;
  })();

  // Build bundle rows (to know which is last)
  const bundleRows: { label: string; value: string; color?: string }[] = [];
  if (data?.bundle_report) {
    bundleRows.push({
      label: 'Verdict',
      value: data.bundle_report.overall_verdict.toUpperCase().replace(/_/g, ' '),
      color: verdictColor,
    });
    if (data.bundle_report.total_sol_extracted_confirmed != null) {
      bundleRows.push({
        label: 'SOL extracted',
        value: `${data.bundle_report.total_sol_extracted_confirmed.toFixed(2)} SOL`,
      });
    }
    if ((data.bundle_report.factory_sniper_wallets?.length ?? 0) > 0) {
      bundleRows.push({
        label: 'Sniper wallets',
        value: `${data.bundle_report.factory_sniper_wallets!.length} detected`,
      });
    }
  }

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Safe area navbar */}
      <View style={[styles.navbar, { paddingTop: Math.max(insets.top, 16) }]}>
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
        {isLoading && (
          <GlassCard>
            <SkeletonBlock lines={3} />
          </GlassCard>
        )}

        {!isLoading && error && (
          <GlassCard>
            <Text style={styles.errorText}>Could not load token. Is the mint address valid?</Text>
          </GlassCard>
        )}

        {data && !isLoading && (
          <Animated.View entering={FadeInDown.duration(350).springify()} style={styles.sections}>

            {/* ── Hero card ── */}
            <GlassCard style={styles.heroCard}>
              <View style={styles.heroRow}>
                <HeroImage uri={data.query_token?.image_uri} symbol={data.query_token?.symbol} />
                <View style={styles.heroInfo}>
                  <Text style={styles.heroName} numberOfLines={2}>{data.query_token?.name ?? 'Unknown'}</Text>
                  <Text style={styles.heroSymbol}>{data.query_token?.symbol ?? '—'}</Text>
                  <View style={styles.heroMeta}>
                    {mcap != null && mcap > 0 && (
                      <View style={styles.mcapPill}>
                        <TrendingUp size={10} color={tokens.secondary} strokeWidth={2} />
                        <Text style={styles.mcapText}>{fmtMcap(mcap)}</Text>
                      </View>
                    )}
                    {riskLevel && riskLevel !== 'insufficient_data' && (
                      <RiskBadge level={riskLevel === 'first_rug' ? 'high' : riskLevel as any} size="sm" />
                    )}
                  </View>
                  {/* Mint address row */}
                  <TouchableOpacity
                    onPress={() => handleCopy(mint ?? '', 'Mint address')}
                    style={styles.mintRow}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mintAddr}>{shortAddr(mint ?? '')}</Text>
                    <Copy size={11} color={tokens.white35} />
                  </TouchableOpacity>
                </View>

                {/* Gauge — shown for all levels except insufficient_data */}
                {riskScore != null ? (
                  <GaugeRing
                    value={riskScore}
                    color={riskColor}
                    size={76}
                    strokeWidth={6}
                    label={riskLevelLabel(riskLevel).split(' ')[0]}
                    sublabel="RISK"
                  />
                ) : riskLevel === 'insufficient_data' ? (
                  <View style={styles.noDataGauge}>
                    <HelpCircle size={22} color={tokens.white35} strokeWidth={1.5} />
                    <Text style={styles.noDataLabel}>NO{'\n'}DATA</Text>
                  </View>
                ) : null}
              </View>

              {/* Watch button */}
              {apiKey && (
                <HapticButton
                  variant={watching ? 'ghost' : 'secondary'}
                  size="sm"
                  onPress={handleWatch}
                  style={{ marginTop: 14 }}
                >
                  {watching ? 'Watching ✓' : 'Watch Token'}
                </HapticButton>
              )}
            </GlassCard>

            {/* ── RUN AI ANALYSIS — prominent, just below hero ── */}
            <HapticButton
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => router.push(`/analysis/${mint}` as any)}
            >
              RUN AI ANALYSIS
            </HapticButton>

            {/* ── Family Tree + AI Chat ── */}
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
              <View style={styles.actionDivider} />
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/chat/${mint}` as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Open AI chat"
              >
                <MessageCircle size={16} color={tokens.secondary} />
                <Text style={styles.actionBtnText}>AI Chat</Text>
              </TouchableOpacity>
            </View>

            {/* ── Suspicious flags ── */}
            {(data.bundle_report?.evidence_chain?.length ?? 0) > 0 && (
              <GlassCard>
                <Text style={styles.sectionTitle}>SUSPICIOUS FLAGS</Text>
                <View style={styles.flagsWrap}>
                  {data.bundle_report!.evidence_chain!.map((flag, i) => (
                    <View key={i} style={styles.flag}>
                      <AlertTriangle size={12} color={tokens.accent} />
                      <Text style={styles.flagText}>{flag}</Text>
                    </View>
                  ))}
                </View>
              </GlassCard>
            )}

            {/* ── Deployer — accent border left ── */}
            {data.deployer_profile && (
              <TouchableOpacity
                onPress={() => router.push(`/deployer/${data.deployer_profile!.address}` as any)}
                onLongPress={() => handleCopy(data.deployer_profile!.address, 'Deployer address')}
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

            {/* ── Bundle report ── */}
            {data.bundle_report && bundleRows.length > 0 && (
              <GlassCard>
                {/* Verdict banner */}
                <View style={[styles.verdictBanner, { backgroundColor: `${verdictColor}18`, borderColor: `${verdictColor}35` }]}>
                  <Skull size={13} color={verdictColor} />
                  <Text style={[styles.verdictBannerText, { color: verdictColor }]}>
                    {data.bundle_report.overall_verdict.toUpperCase().replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>BUNDLE REPORT</Text>
                {bundleRows.slice(1).map((r, i) => (
                  <DataRow
                    key={r.label}
                    label={r.label}
                    value={r.value}
                    valueColor={r.color}
                    isLast={i === bundleRows.slice(1).length - 1}
                  />
                ))}
              </GlassCard>
            )}

            {/* ── SOL Flow — accent border left ── */}
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

            {/* ── Cartel — accent border left ── */}
            {data.cartel_report?.deployer_community?.community_id && (
              <TouchableOpacity
                onPress={() => router.push(`/cartel/${data.cartel_report!.deployer_community!.community_id}` as any)}
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
      </ScrollView>

      {toast}
    </View>
  );
}

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

  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    gap: 12,
  },
  sections: { gap: 12 },

  // Hero
  heroCard: {},
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroImg: { width: 72, height: 72, borderRadius: tokens.radius.md },
  heroImgFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImgText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },
  heroInfo: { flex: 1, gap: 4 },
  heroName: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    lineHeight: 22,
  },
  heroSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  mcapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${tokens.secondary}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
  },
  mcapText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },
  mintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  mintAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.3,
  },
  noDataGauge: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: tokens.borderSubtle,
    borderStyle: 'dashed',
  },
  noDataLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white35,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 11,
  },

  // Section title
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 10,
  },

  // Flags
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${tokens.accent}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${tokens.accent}30`,
  },
  flagText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
  },

  // Verdict banner
  verdictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  verdictBannerText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    letterSpacing: 0.8,
  },

  // Data rows
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  key: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60 },
  val: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },

  // Link cards
  linkCard: {},
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
  },
  linkInfo: { flex: 1 },
  linkLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  linkAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 2,
  },
  linkMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },

  // Error
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
    overflow: 'hidden',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  actionBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    letterSpacing: 0.3,
  },
  actionDivider: {
    width: 1,
    backgroundColor: tokens.borderSubtle,
  },
});
