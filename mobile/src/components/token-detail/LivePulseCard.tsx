import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

interface LivePulseCardProps {
  data: any;
}

export function LivePulseCard({ data }: LivePulseCardProps) {
  const ms = data?.death_clock?.market_signals;
  const ins = data?.insider_sell;

  if (!ms && !ins) return null;

  // Sell pressure — death_clock has pct (0-100), insider_sell is ratio (0-1)
  const sellPct = ms?.sell_pressure_pct != null
    ? ms.sell_pressure_pct
    : ins?.sell_pressure_24h != null
    ? ins.sell_pressure_24h * 100
    : null;

  const sellColor = sellPct == null ? tokens.white60
    : sellPct > 60 ? tokens.risk.critical
    : sellPct > 35 ? tokens.risk.high
    : sellPct > 15 ? tokens.risk.medium
    : tokens.risk.low;

  // Liquidity health
  const liqRatio = ms?.liq_to_mcap_ratio;
  const liqLabel = liqRatio == null ? null
    : liqRatio > 0.10 ? 'Healthy'
    : liqRatio > 0.05 ? 'Thin'
    : 'Critical';
  const liqColor = liqRatio == null ? tokens.white60
    : liqRatio > 0.10 ? tokens.risk.low
    : liqRatio > 0.05 ? tokens.risk.medium
    : tokens.risk.critical;

  // Volume trend
  const trend = ms?.volume_trend as string | null | undefined;
  const trendLabel = trend === 'rising' ? 'Rising'
    : trend === 'falling' ? 'Falling'
    : trend === 'flat' ? 'Flat' : null;
  const trendColor = trend === 'rising' ? tokens.risk.low
    : trend === 'falling' ? tokens.risk.high
    : tokens.white60;
  const TrendIcon = trend === 'rising' ? TrendingUp
    : trend === 'falling' ? TrendingDown
    : Minus;

  if (sellPct == null && liqLabel == null && trendLabel == null) return null;

  return (
    <GlassCard>
      <View style={styles.header}>
        <Activity size={11} color={tokens.secondary} />
        <Text style={styles.headerText}>LIVE RISK PULSE</Text>
      </View>
      <View style={styles.metricsRow}>
        {sellPct != null && (
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: sellColor }]}>
              {sellPct.toFixed(0)}%
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, {
                width: `${Math.min(sellPct, 100)}%` as any,
                backgroundColor: sellColor,
              }]} />
            </View>
            <Text style={styles.metricLabel}>Sell Press.</Text>
          </View>
        )}
        {liqLabel != null && (
          <View style={[styles.metric, styles.metricCenter]}>
            <Text style={[styles.metricValue, { color: liqColor }]}>{liqLabel}</Text>
            <Text style={styles.metricLabel}>Liquidity</Text>
          </View>
        )}
        {trendLabel != null && (
          <View style={[styles.metric, styles.metricRight]}>
            <View style={styles.iconValue}>
              <TrendIcon size={13} color={trendColor} />
              <Text style={[styles.metricValue, { color: trendColor }]}>{trendLabel}</Text>
            </View>
            <Text style={[styles.metricLabel, { textAlign: 'right' }]}>Volume</Text>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12,
  },
  headerText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny,
    color: tokens.secondary, letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: 'row', gap: 8,
  },
  metric: { flex: 1, gap: 4 },
  metricCenter: { alignItems: 'center' },
  metricRight: { alignItems: 'flex-end' },
  metricValue: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100,
  },
  barTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: `${tokens.white100}15`,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },
  metricLabel: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.textTertiary, letterSpacing: 0.4,
  },
  iconValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
