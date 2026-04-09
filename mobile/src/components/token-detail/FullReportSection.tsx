import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import {
  ChevronRight,
  Skull,
  AlertTriangle,
  Zap,
  Users,
  ArrowUpRight,
} from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

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

interface FullReportSectionProps {
  data: any;
  mint: string;
  riskColor: string;
  riskSummary: string | null;
  displayRiskLevel: RiskLevel;
  verdictColor: string;
  bundleDetailRows: { label: string; value: string; color?: string }[];
  onCopy: (value: string, label?: string) => void;
  onClockPress: () => void;
}

export function FullReportSection({
  data, mint, riskColor, riskSummary, displayRiskLevel,
  verdictColor, bundleDetailRows, onCopy, onClockPress,
}: FullReportSectionProps) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.detailsSection}>
      {/* Risk Timeline teaser */}
      {(data.death_clock || data.insider_sell) && (() => {
        const dc = data.death_clock;
        const effectiveLabel = (() => {
          if (data.insider_sell?.verdict === 'insider_dump' && data.insider_sell?.deployer_exited) return 'CRITICAL';
          if (data.insider_sell?.verdict === 'insider_dump') return 'HIGH';
          if (displayRiskLevel === 'insufficient_data') return 'UNVERIFIED';
          return displayRiskLevel.toUpperCase().replace('_', ' ');
        })();
        return (
          <TouchableOpacity onPress={onClockPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View Risk Timeline details">
            <GlassCard style={[styles.teaserCard, { borderColor: `${riskColor}30`, borderWidth: 1 }]}>
              <View style={styles.teaserRow}>
                <View style={[styles.teaserIconWrap, { backgroundColor: `${riskColor}15` }]}>
                  <Skull size={16} color={riskColor} strokeWidth={2} />
                </View>
                <View style={styles.teaserInfo}>
                  <View style={styles.teaserTitleRow}>
                    <Text style={styles.teaserLabel}>RISK TIMELINE</Text>
                    <View style={[styles.teaserBadge, { backgroundColor: `${riskColor}18`, borderColor: `${riskColor}35` }]}>
                      <Text style={[styles.teaserBadgeText, { color: riskColor }]}>{effectiveLabel}</Text>
                    </View>
                  </View>
                  {riskSummary && <Text style={styles.teaserSub} numberOfLines={1}>{riskSummary}</Text>}
                  {dc?.rug_probability_pct != null && (
                    <Text style={styles.teaserProb}>Lifecycle risk: <Text style={{ color: riskColor, fontFamily: 'Lexend-Bold' }}>{dc.rug_probability_pct.toFixed(0)}%</Text></Text>
                  )}
                </View>
                <ChevronRight size={16} color={tokens.textTertiary} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        );
      })()}

      {/* Insider Sell Timeline */}
      {data.insider_sell && (data.insider_sell.sell_pressure_1h != null || data.insider_sell.sell_pressure_6h != null || data.insider_sell.sell_pressure_24h != null) && (() => {
        const ins = data.insider_sell;
        const columns: { label: string; pressure: number | null; change: number | null }[] = [
          { label: '1H',  pressure: ins.sell_pressure_1h,  change: ins.price_change_1h  },
          { label: '6H',  pressure: ins.sell_pressure_6h,  change: ins.price_change_6h  },
          { label: '24H', pressure: ins.sell_pressure_24h, change: ins.price_change_24h },
        ];
        return (
          <GlassCard>
            <View style={styles.insiderHeader}>
              <Text style={styles.sectionTitle}>INSIDER SELL PRESSURE</Text>
              {ins.deployer_exited && (
                <View style={styles.deployerExitedBadge}>
                  <Text style={styles.deployerExitedText}>DEPLOYER EXITED</Text>
                </View>
              )}
            </View>
            <View style={styles.insiderColumns}>
              {columns.map((col) => {
                if (col.pressure == null) return null;
                const pct = col.pressure * 100;
                const barColor = pct > 60 ? tokens.risk.critical : pct > 35 ? tokens.risk.high : pct > 15 ? tokens.risk.medium : tokens.risk.low;
                const changeColor = col.change == null ? tokens.white60 : col.change < -20 ? tokens.risk.critical : col.change < -5 ? tokens.risk.high : tokens.white80;
                return (
                  <View key={col.label} style={styles.insiderCol}>
                    <Text style={styles.insiderTimeLabel}>{col.label}</Text>
                    <View style={styles.insiderBarTrack}>
                      <View style={[styles.insiderBarFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: barColor }]} />
                    </View>
                    <Text style={[styles.insiderPct, { color: barColor }]}>{pct.toFixed(0)}%</Text>
                    {col.change != null && (
                      <Text style={[styles.insiderChange, { color: changeColor }]}>
                        {col.change > 0 ? '+' : ''}{col.change.toFixed(0)}%
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </GlassCard>
        );
      })()}

      {/* Suspicious flags */}
      {(data.bundle_report?.evidence_chain?.length ?? 0) > 0 && (
        <GlassCard>
          <Text style={styles.sectionTitle}>SUSPICIOUS FLAGS</Text>
          <View style={styles.flagsWrap}>
            {(data.bundle_report?.evidence_chain ?? []).map((flag: string, i: number) => (
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
        <TouchableOpacity onPress={() => router.push(`/deployer/${data.deployer_profile?.address}` as any)} onLongPress={() => onCopy(data.deployer_profile?.address ?? '', 'Deployer address')} delayLongPress={400} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View deployer profile">
          <GlassCard style={[styles.linkCard, { borderLeftColor: `${tokens.secondary}60`, borderLeftWidth: 3 }]} noPadding>
            <View style={styles.linkRow}>
              <Users size={18} color={tokens.secondary} />
              <View style={styles.linkInfo}>
                <Text style={styles.linkLabel}>Deployer Profile</Text>
                <Text style={styles.linkAddr} numberOfLines={1}>{shortAddr(data.deployer_profile.address)}</Text>
                {data.deployer_profile.rug_rate_pct != null && (
                  <Text style={styles.linkMeta}>Rug rate: {data.deployer_profile.rug_rate_pct.toFixed(0)}%{data.deployer_profile.confirmed_rug_count != null ? ` · ${data.deployer_profile.confirmed_rug_count} confirmed rugs` : ''}</Text>
                )}
              </View>
              <ChevronRight size={18} color={tokens.textTertiary} />
            </View>
          </GlassCard>
        </TouchableOpacity>
      )}

      {/* Bundle report details */}
      {bundleDetailRows.length > 0 && (
        <GlassCard>
          <View style={[styles.verdictBanner, { backgroundColor: `${verdictColor}18`, borderColor: `${verdictColor}35` }]}>
            <Skull size={13} color={verdictColor} />
            <Text style={[styles.verdictBannerText, { color: verdictColor }]}>{(data.bundle_report?.overall_verdict ?? '').toUpperCase().replace(/_/g, ' ')}</Text>
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>BUNDLE REPORT</Text>
          {bundleDetailRows.map((r, i) => (
            <DataRow key={r.label} label={r.label} value={r.value} valueColor={r.color} isLast={i === bundleDetailRows.length - 1} />
          ))}
        </GlassCard>
      )}

      {/* SOL Flow */}
      {data.sol_flow && (
        <TouchableOpacity onPress={() => router.push(`/sol-trace/${mint}` as any)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View SOL flow trace">
          <GlassCard style={[styles.linkCard, { borderLeftColor: `${tokens.secondary}60`, borderLeftWidth: 3 }]} noPadding>
            <View style={styles.linkRow}>
              <ArrowUpRight size={18} color={tokens.secondary} />
              <View style={styles.linkInfo}>
                <Text style={styles.linkLabel}>SOL Flow Trace</Text>
                {data.sol_flow.total_extracted_sol != null && (
                  <Text style={styles.linkMeta}>{data.sol_flow.total_extracted_sol.toFixed(2)} SOL extracted{data.sol_flow.hop_count != null ? ` · ${data.sol_flow.hop_count} hops` : ''}</Text>
                )}
              </View>
              <ChevronRight size={18} color={tokens.textTertiary} />
            </View>
          </GlassCard>
        </TouchableOpacity>
      )}

      {/* Cartel — /cartel/[id] needs a base58 wallet, not the 12-char hex
          community_id (which would 400 against /cartel/search). Pick the
          first available wallet from query/root/community.wallets. */}
      {data.cartel_report?.deployer_community?.community_id && (() => {
        const focusWallet =
          data.query_token?.deployer ||
          data.root?.deployer ||
          data.cartel_report?.deployer_community?.wallets?.[0];
        if (!focusWallet) return null;
        return (
          <TouchableOpacity onPress={() => router.push(`/cartel/${focusWallet}` as any)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View cartel network">
            <GlassCard style={[styles.linkCard, { borderLeftColor: `${tokens.accent}60`, borderLeftWidth: 3 }]} noPadding>
              <View style={styles.linkRow}>
                <Zap size={18} color={tokens.accent} />
                <View style={styles.linkInfo}>
                  <Text style={styles.linkLabel}>Cartel Network</Text>
                  {data.cartel_report.deployer_community.wallets != null && (
                    <Text style={styles.linkMeta}>{data.cartel_report.deployer_community.wallets.length} deployers{data.cartel_report.deployer_community.estimated_extracted_usd != null ? ` · ${fmtMcap(data.cartel_report.deployer_community.estimated_extracted_usd)}` : ''}</Text>
                  )}
                </View>
                <ChevronRight size={18} color={tokens.textTertiary} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        );
      })()}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  detailsSection: { gap: 12 },
  sectionTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white60, letterSpacing: 1, marginBottom: 10 },
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${tokens.accent}15`, borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${tokens.accent}30` },
  flagText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.accent },
  verdictBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: tokens.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  verdictBannerText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, letterSpacing: 0.8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle },
  key: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60 },
  val: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  linkCard: {},
  linkRow: { flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.cardPadding, gap: 12 },
  linkInfo: { flex: 1 },
  linkLabel: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  linkAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  linkMeta: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60, marginTop: 2 },
  teaserCard: {},
  teaserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teaserIconWrap: { width: 32, height: 32, borderRadius: tokens.radius.xs, alignItems: 'center', justifyContent: 'center' },
  teaserInfo: { flex: 1, gap: 3 },
  teaserTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teaserLabel: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny, color: tokens.white60, letterSpacing: 1 },
  teaserBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: tokens.radius.pill, borderWidth: 1 },
  teaserBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 9, letterSpacing: 0.6 },
  teaserSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60 },
  teaserProb: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  insiderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  deployerExitedBadge: {
    backgroundColor: `${tokens.risk.critical}20`, borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: `${tokens.risk.critical}50`,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  deployerExitedText: {
    fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.risk.critical, letterSpacing: 0.6,
  },
  insiderColumns: { flexDirection: 'row', gap: 8 },
  insiderCol: { flex: 1, gap: 4, alignItems: 'center' },
  insiderTimeLabel: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.white60, letterSpacing: 0.8 },
  insiderBarTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: `${tokens.white100}12`, overflow: 'hidden' },
  insiderBarFill: { height: 6, borderRadius: 3 },
  insiderPct: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body },
  insiderChange: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny },
});
