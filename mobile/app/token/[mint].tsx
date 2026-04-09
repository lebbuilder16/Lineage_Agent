import React, { useState, useRef, useEffect } from 'react';
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
import { useLocalSearchParams, router, Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranch,
  GitCompareArrows,
  Bot,
  Settings2,
} from 'lucide-react-native';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { useToast } from '../../src/components/ui/Toast';
import { useLineage } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { useHistoryStore } from '../../src/store/history';
import { addWatch } from '../../src/lib/api';
import { handleTierError } from '../../src/lib/tier-error';
import { tokens } from '../../src/theme/tokens';
import { RISK_COLOR, riskLevelToScore, type RiskLevel } from '../../src/lib/risk';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { HeroSection } from '../../src/components/token-detail/HeroSection';
import { AgentSuggestions } from '../../src/components/token-detail/AgentSuggestions';
import { RiskSummaryCard } from '../../src/components/token-detail/RiskSummaryCard';
import { FullReportSection } from '../../src/components/token-detail/FullReportSection';
import { SweepAlertsBanner } from '../../src/components/token-detail/SweepAlertsBanner';
import { LivePulseCard } from '../../src/components/token-detail/LivePulseCard';
import { OperatorDamageCard } from '../../src/components/token-detail/OperatorDamageCard';
import { DisclaimerFooter } from '../../src/components/ui/DisclaimerFooter';

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
    if (reportExpandMint === mint) { setShowDetails(true); setReportExpandMint(null); }
  }, [reportExpandMint, mint]);

  const apiKey = useAuthStore((s) => s.apiKey);
  const previousInvestigation = useHistoryStore((s) => s.getByMint(mint ?? ''));
  const addWatchFn = useAuthStore((s) => s.addWatch);
  const watches = useAuthStore((s) => s.watches);
  const watching = watches.some((w) => w.value === mint);

  const handleCopy = async (value: string, label = 'Address') => {
    await Clipboard.setStringAsync(value);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${label} copied`);
  };

  const handleWatch = async () => {
    if (!apiKey) { showToast('API key required — go to Settings'); return; }
    if (!mint || watching || submitting.current) return;
    submitting.current = true;
    try {
      const w = await addWatch(apiKey, 'mint', mint);
      addWatchFn(w);
      showToast('Token added to watchlist');
    } catch (err) {
      submitting.current = false;
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409') || msg.includes('already')) return;
      // Tier-limit error → show message + navigate to paywall
      // handleTierError imported at top level
      if (!handleTierError(err, showToast)) {
        showToast('Failed to watch token', 'error');
      }
    }
  };

  // ── derived values ──
  const riskLevel = data?.death_clock?.risk_level as RiskLevel | undefined;
  const displayRiskLevel: RiskLevel = (() => {
    if (riskLevel && riskLevel !== 'insufficient_data') return riskLevel;
    const ins = data?.insider_sell;
    if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) return 'critical';
    if (ins?.verdict === 'insider_dump') return 'high';
    const sf = data?.sol_flow;
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 50) return 'critical';
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 10) return 'high';
    const verdict = data?.bundle_report?.overall_verdict;
    if (verdict === 'confirmed_team_extraction') return 'critical';
    if (verdict === 'suspected_team_extraction' || verdict === 'coordinated_dump_unknown_team') return 'high';
    if (ins?.flags?.includes('PRICE_CRASH') && (ins?.sell_pressure_24h ?? 0) > 0.4) return 'high';
    if (ins?.deployer_exited) return 'high';
    if (ins?.verdict === 'suspicious') return 'medium';
    const rugRate = data?.deployer_profile?.confirmed_rug_rate_pct ?? data?.deployer_profile?.rug_rate_pct;
    if (rugRate != null && rugRate > 70) return 'critical';
    if (rugRate != null && rugRate > 40) return 'high';
    if (rugRate != null && rugRate > 15) return 'medium';
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 0) return 'medium';
    return 'insufficient_data';
  })();

  const riskColor = RISK_COLOR[displayRiskLevel] ?? tokens.textTertiary;
  const riskScore = riskLevelToScore(displayRiskLevel);

  useEffect(() => {
    if (!autoExpandedRef.current && data && (displayRiskLevel === 'critical' || displayRiskLevel === 'high')) {
      autoExpandedRef.current = true; setShowDetails(true);
    }
  }, [data, displayRiskLevel]);

  const riskSummary = (() => {
    const ins = data?.insider_sell; const dp = data?.deployer_profile;
    const br = data?.bundle_report; const dc = data?.death_clock; const sf = data?.sol_flow;
    if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) return `Deployer exited — insider dump confirmed${ins.price_change_24h != null ? ` · ${ins.price_change_24h.toFixed(0)}% 24h` : ''}`;
    if (ins?.verdict === 'insider_dump') return `Insider dump detected · ${((ins.sell_pressure_24h ?? 0) * 100).toFixed(0)}% sell pressure`;
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 10) return `${sf.total_extracted_sol.toFixed(1)} SOL extracted via ${sf.hop_count ?? '?'}-hop chain`;
    if (dp?.rug_rate_pct != null && dp.rug_rate_pct > 30) return `Deployer rugged ${dp.confirmed_rug_count ?? '?'} tokens (${dp.rug_rate_pct.toFixed(0)}% rug rate)`;
    if (br?.overall_verdict && br.overall_verdict !== 'early_buyers_no_link_proven') return br.overall_verdict.replace(/_/g, ' ');
    if (dc?.confidence_note) return dc.confidence_note;
    return null;
  })();

  const verdictColor = (() => {
    const v = data?.bundle_report?.overall_verdict;
    if (!v) return tokens.white60;
    if (v === 'confirmed_team_extraction') return tokens.risk.critical;
    if (v === 'suspected_team_extraction' || v === 'coordinated_dump_unknown_team') return tokens.risk.high;
    return tokens.risk.low;
  })();

  const bundleDetailRows: { label: string; value: string; color?: string }[] = [];
  if (data?.bundle_report) {
    if (data.bundle_report.total_sol_extracted_confirmed != null) bundleDetailRows.push({ label: 'SOL extracted', value: `${data.bundle_report.total_sol_extracted_confirmed.toFixed(2)} SOL` });
    if ((data.bundle_report.factory_sniper_wallets?.length ?? 0) > 0) bundleDetailRows.push({ label: 'Sniper wallets', value: `${data.bundle_report.factory_sniper_wallets?.length ?? 0} detected` });
  }

  const hasDetails = !!data?.death_clock || !!data?.insider_sell || (data?.bundle_report?.evidence_chain?.length ?? 0) > 0 ||
    !!data?.deployer_profile || bundleDetailRows.length > 0 || !!data?.sol_flow || !!data?.cartel_report?.deployer_community?.community_id;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.navbar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={tokens.hitSlop} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={tokens.white100} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>TOKEN REPORT</Text>
        <TouchableOpacity onPress={() => handleCopy(mint ?? '', 'Mint address')} hitSlop={tokens.hitSlop} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Copy mint address">
          <Copy size={18} color={tokens.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 80, 120) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />}
      >
        {isLoading && <GlassCard><SkeletonBlock lines={3} /></GlassCard>}
        {!isLoading && error && <GlassCard><Text style={styles.errorText}>Could not load token. Is the mint address valid?</Text></GlassCard>}

        {data && !isLoading && (
          <Animated.View entering={FadeInDown.duration(350).springify()} style={styles.sections}>
            <HeroSection data={data} mint={mint ?? ''} riskScore={riskScore} riskColor={riskColor} displayRiskLevel={displayRiskLevel} watching={watching} onCopy={handleCopy} onWatch={handleWatch} />

            {previousInvestigation && (
              <TouchableOpacity onPress={() => router.push(`/investigate/${mint}` as any)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View previous investigation">
                <GlassCard style={{ borderColor: `${tokens.secondary}20`, borderWidth: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Bot size={13} color={tokens.secondary} />
                    <Text style={{ fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary, letterSpacing: 1, flex: 1 }}>PREVIOUS INVESTIGATION</Text>
                    <RiskBadge level={previousInvestigation.riskScore >= 75 ? 'critical' : previousInvestigation.riskScore >= 50 ? 'high' : previousInvestigation.riskScore >= 25 ? 'medium' : 'low'} size="sm" />
                  </View>
                  <Text style={{ fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 }} numberOfLines={2}>{previousInvestigation.verdict}</Text>
                  <Text style={{ fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 4 }}>
                    Risk {previousInvestigation.riskScore}/100 · {(() => { const diff = Date.now() - previousInvestigation.timestamp; const mins = Math.floor(diff / 60000); if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; })()}
                  </Text>
                </GlassCard>
              </TouchableOpacity>
            )}

            <AgentSuggestions data={data} mint={mint ?? ''} />
            <SweepAlertsBanner mint={mint ?? ''} />
            <RiskSummaryCard data={data} displayRiskLevel={displayRiskLevel} riskColor={riskColor} riskSummary={riskSummary} />

            {/* Factory Bot Banner */}
            {data.factory_rhythm?.is_factory && (
              <View style={styles.factoryBanner}>
                <Settings2 size={13} color={tokens.risk.medium} />
                <Text style={styles.factoryText}>
                  Bot Deployment Pattern
                  {data.factory_rhythm.tokens_launched != null ? ` · ${data.factory_rhythm.tokens_launched} tokens` : ''}
                  {data.factory_rhythm.median_interval_hours != null ? ` · every ~${data.factory_rhythm.median_interval_hours.toFixed(0)}h` : ''}
                  {data.factory_rhythm.naming_pattern ? ` · ${data.factory_rhythm.naming_pattern}` : ''}
                </Text>
              </View>
            )}

            <LivePulseCard data={data} />
            <OperatorDamageCard data={data} />

            <HapticButton variant="primary" size="lg" fullWidth onPress={() => router.push(`/investigate/${mint}` as any)} accessibilityRole="button" accessibilityLabel="Investigate token">
              <Text style={styles.btnPrimaryText}>INVESTIGATE</Text>
            </HapticButton>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/tree/${mint}` as any)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View family tree">
                <GitBranch size={16} color={tokens.secondary} />
                <Text style={styles.actionBtnText}>Family Tree</Text>
              </TouchableOpacity>
              <View style={styles.actionDivider} />
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/compare' as any)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Compare tokens">
                <GitCompareArrows size={16} color={tokens.secondary} />
                <Text style={styles.actionBtnText}>Compare</Text>
              </TouchableOpacity>
            </View>

            {hasDetails && (
              <TouchableOpacity onPress={() => setShowDetails((v) => !v)} activeOpacity={0.75} style={styles.detailsToggle} accessibilityRole="button" accessibilityLabel={showDetails ? 'Hide full report' : 'Show full report'} accessibilityState={{ expanded: showDetails }}>
                <Text style={styles.detailsToggleText}>{showDetails ? 'Hide full report' : 'Show full report'}</Text>
                {showDetails ? <ChevronUp size={15} color={tokens.textTertiary} strokeWidth={2} /> : <ChevronDown size={15} color={tokens.textTertiary} strokeWidth={2} />}
              </TouchableOpacity>
            )}

            {showDetails && (
              <FullReportSection
                data={data} mint={mint ?? ''} riskColor={riskColor} riskSummary={riskSummary}
                displayRiskLevel={displayRiskLevel} verdictColor={verdictColor} bundleDetailRows={bundleDetailRows}
                onCopy={handleCopy} onClockPress={() => { setPendingClockMint(mint ?? null); router.push('/(tabs)/clock' as any); }}
              />
            )}
          </Animated.View>
        )}
        <DisclaimerFooter />
      </ScrollView>
      {toast}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 12 },
  navBtn: { minWidth: tokens.minTouchSize, minHeight: tokens.minTouchSize, justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.white60, letterSpacing: 1.5 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, gap: 12 },
  sections: { gap: 12 },
  errorText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.accent, textAlign: 'center' },
  btnPrimaryText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100, letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.borderSubtle, backgroundColor: tokens.bgGlass8, overflow: 'hidden' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  actionDivider: { width: 1, backgroundColor: tokens.borderSubtle, alignSelf: 'stretch' },
  actionBtnText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary, letterSpacing: 0.3 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  detailsToggleText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.textTertiary, letterSpacing: 0.4 },
  factoryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${tokens.risk.medium}15`,
    borderRadius: tokens.radius.sm, borderWidth: 1,
    borderColor: `${tokens.risk.medium}35`,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  factoryText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.risk.medium, flex: 1, lineHeight: 18,
  },
});
