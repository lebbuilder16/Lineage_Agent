import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

interface RiskSummaryCardProps {
  data: any;
  displayRiskLevel: RiskLevel;
  riskColor: string;
  riskSummary: string | null;
}

export function RiskSummaryCard({ data, displayRiskLevel, riskColor, riskSummary }: RiskSummaryCardProps) {
  if (!displayRiskLevel || displayRiskLevel === 'insufficient_data') return null;

  const RiskIcon = displayRiskLevel === 'low' ? ShieldCheck : ShieldAlert;

  // Quick stats strip
  const stats: { label: string; value: string; color?: string }[] = [];
  const dp = data.deployer_profile;
  const dc = data.death_clock;
  const br = data.bundle_report;
  const la = data.liquidity_arch;
  if (dp?.confirmed_rug_count != null) stats.push({ label: 'Rugs', value: String(dp.confirmed_rug_count), color: tokens.risk.critical });
  if (dp?.rug_rate_pct != null) stats.push({ label: 'Rug rate', value: `${dp.rug_rate_pct.toFixed(0)}%` });
  if (dc?.historical_rug_count != null) stats.push({ label: 'History', value: `${dc.historical_rug_count} rugs` });
  if (br?.total_sol_extracted_confirmed != null) stats.push({ label: 'Extracted', value: `${br.total_sol_extracted_confirmed.toFixed(1)} SOL`, color: tokens.accent });
  if (la?.authenticity_score != null) {
    const pct = Math.round(la.authenticity_score * 100);
    const liqColor = pct >= 80 ? tokens.risk.low : pct >= 50 ? tokens.risk.medium : tokens.risk.critical;
    stats.push({ label: 'Liq. Auth.', value: `${pct}%`, color: liqColor });
  }

  return (
    <GlassCard
      style={[
        styles.summaryCard,
        { borderColor: `${riskColor}30`, borderWidth: 1 },
      ]}
      {...((displayRiskLevel === 'critical' || displayRiskLevel === 'high' || displayRiskLevel === 'first_rug') ? { accessibilityRole: 'alert' as const } : {})}
    >
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

      {stats.length > 0 && (
        <View style={styles.statsStrip}>
          {stats.slice(0, 4).map((s, i) => (
            <View key={i} style={styles.statItem}>
              <Text style={[styles.statValue, s.color ? { color: s.color } : undefined]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
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
  statLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.4 },
});
