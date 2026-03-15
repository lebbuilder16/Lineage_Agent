import React, { useState } from 'react';
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

const RISK_COLOR: Record<string, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
};

export default function TokenScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useLineage(mint ?? '');
  const { showToast, toast } = useToast();

  const handleCopy = async (value: string, label = 'Address') => {
    await Clipboard.setStringAsync(value);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${label} copied`);
  };
  const apiKey = useAuthStore((s) => s.apiKey);
  const addWatchFn = useAuthStore((s) => s.addWatch);
  const [watching, setWatching] = useState(false);

  const riskLevel = data?.death_clock?.risk_level;
  const riskColor = riskLevel ? RISK_COLOR[riskLevel] ?? tokens.primary : tokens.primary;
  // Derive a 0-1 risk score from risk_level for the gauge
  const riskScore = riskLevel === 'critical' ? 1.0 : riskLevel === 'high' ? 0.75 : riskLevel === 'medium' ? 0.5 : riskLevel === 'low' ? 0.25 : null;

  const handleWatch = async () => {
    if (!apiKey || !mint) return;
    try {
      const w = await addWatch(apiKey, 'mint', mint);
      addWatchFn(w);
      setWatching(true);
    } catch (err) {
      console.error('[handleWatch]', err);
    }
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        {/* Nav bar */}
        <View style={styles.navbar}>
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
          contentContainerStyle={styles.content}
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
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              {/* Hero card */}
              <GlassCard style={styles.heroCard}>
                <View style={styles.heroRow}>
                  {data.query_token?.image_uri ? (
                    <Image source={{ uri: data.query_token.image_uri }} style={styles.heroImg} />
                  ) : (
                    <View style={[styles.heroImg, styles.heroImgFallback]}>
                      <Text style={styles.heroImgText}>{data.query_token?.symbol?.[0] ?? '?'}</Text>
                    </View>
                  )}
                  <View style={styles.heroInfo}>
                    <Text style={styles.heroName}>{data.query_token?.name ?? 'Unknown'}</Text>
                    <Text style={styles.heroSymbol}>{data.query_token?.symbol ?? '—'}</Text>
                    {riskLevel && (
                      <RiskBadge level={riskLevel} size="md" style={{ marginTop: 6 }} />
                    )}
                  </View>
                  {riskScore != null && (
                    <GaugeRing
                      value={riskScore}
                      color={riskColor}
                      size={80}
                      strokeWidth={6}
                      label={`${Math.round(riskScore * 100)}`}
                      sublabel="RISK"
                    />
                  )}
                </View>
                {apiKey && (
                  <HapticButton
                    variant={watching ? 'ghost' : 'secondary'}
                    size="sm"
                    onPress={handleWatch}
                    style={{ marginTop: 12 }}
                  >
                    {watching ? 'Watching ✓' : 'Watch Token'}
                  </HapticButton>
                )}
              </GlassCard>

              {/* Evidence flags from bundle report */}
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

              {/* Deployer */}
              {data.deployer_profile && (
                <TouchableOpacity
                  onPress={() => router.push(`/deployer/${data.deployer_profile!.address}` as any)}
                  onLongPress={() => handleCopy(data.deployer_profile!.address, 'Deployer address')}
                  delayLongPress={400}
                  activeOpacity={0.75}
                >
                  <GlassCard style={styles.linkCard} noPadding>
                    <View style={styles.linkRow}>
                      <Users size={18} color={tokens.secondary} />
                      <View style={styles.linkInfo}>
                        <Text style={styles.linkLabel}>Deployer Profile</Text>
                        <Text style={styles.linkAddr} numberOfLines={1}>
                          {data.deployer_profile.address}
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

              {/* Bundle report */}
              {data.bundle_report && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>BUNDLE REPORT</Text>
                  <View style={styles.row}>
                    <Text style={styles.key}>Verdict</Text>
                    <Text
                      style={[
                        styles.val,
                        {
                          color:
                            data.bundle_report.overall_verdict === 'confirmed_team_extraction'
                              ? tokens.risk.critical
                              : data.bundle_report.overall_verdict === 'suspected_team_extraction' ||
                                data.bundle_report.overall_verdict === 'coordinated_dump_unknown_team'
                              ? tokens.risk.high
                              : tokens.risk.low,
                        },
                      ]}
                    >
                      {data.bundle_report.overall_verdict.toUpperCase().replace(/_/g, ' ')}
                    </Text>
                  </View>
                  {data.bundle_report.total_sol_extracted_confirmed != null && (
                    <View style={styles.row}>
                      <Text style={styles.key}>SOL extracted</Text>
                      <Text style={styles.val}>
                        {data.bundle_report.total_sol_extracted_confirmed.toFixed(2)} SOL
                      </Text>
                    </View>
                  )}
                  {(data.bundle_report.factory_sniper_wallets?.length ?? 0) > 0 && (
                    <View style={styles.row}>
                      <Text style={styles.key}>Sniper wallets</Text>
                      <Text style={styles.val}>
                        {data.bundle_report.factory_sniper_wallets!.length} detected
                      </Text>
                    </View>
                  )}
                </GlassCard>
              )}

              {/* Sol Flow quick link */}
              {data.sol_flow && (
                <TouchableOpacity
                  onPress={() => router.push(`/sol-trace/${mint}` as any)}
                  activeOpacity={0.75}
                >
                  <GlassCard style={styles.linkCard} noPadding>
                    <View style={styles.linkRow}>
                      <ArrowUpRight size={18} color={tokens.primary} />
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

              {/* Cartel link */}
              {data.cartel_report?.deployer_community?.community_id && (
                <TouchableOpacity
                  onPress={() => router.push(`/cartel/${data.cartel_report!.deployer_community!.community_id}` as any)}
                  activeOpacity={0.75}
                >
                  <GlassCard style={styles.linkCard} noPadding>
                    <View style={styles.linkRow}>
                      <Zap size={18} color={tokens.accent} />
                      <View style={styles.linkInfo}>
                        <Text style={styles.linkLabel}>Cartel Network</Text>
                        {data.cartel_report.deployer_community.wallets != null && (
                          <Text style={styles.linkMeta}>
                            {data.cartel_report.deployer_community.wallets.length} deployers
                            {data.cartel_report.deployer_community.estimated_extracted_usd != null
                              ? ` · $${data.cartel_report.deployer_community.estimated_extracted_usd.toFixed(0)}`
                              : ''}
                          </Text>
                        )}
                      </View>
                      <ChevronRight size={18} color={tokens.white35} />
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}

              {/* AI Analysis modal link */}
              <HapticButton
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => router.push(`/analysis/${mint}` as any)}
                style={{ marginTop: 8 }}
              >
                RUN AI ANALYSIS
              </HapticButton>

              {/* Family Tree + AI Chat */}
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
            </Animated.View>
          )}
        </ScrollView>
      </View>
      {toast}
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

  heroCard: {},
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  heroImg: { width: 64, height: 64, borderRadius: tokens.radius.md },
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
  heroInfo: { flex: 1 },
  heroName: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  heroSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },

  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 10,
  },
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

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  key: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60 },
  val: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },

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

  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },

  actionRow: {
    flexDirection: 'row',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
    overflow: 'hidden',
    marginTop: 4,
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
