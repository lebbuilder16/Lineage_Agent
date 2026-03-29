import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Zap } from 'lucide-react-native';

import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import { useInvestigateStore } from '../../store/investigate';

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function MarketDataStrip() {
  const marketData = useInvestigateStore((s) => s.marketData);
  if (!marketData) return null;

  const { market_cap_usd, liquidity_usd, volume_24h_usd, price_change_24h, boost_count } = marketData;
  const hasData = market_cap_usd || liquidity_usd || volume_24h_usd;
  if (!hasData) return null;

  const priceUp = (price_change_24h ?? 0) >= 0;
  const TrendIcon = priceUp ? TrendingUp : TrendingDown;
  const trendColor = priceUp ? tokens.success : tokens.risk.critical;

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <Text style={styles.label}>MARKET</Text>
        <View style={styles.strip}>
          {market_cap_usd != null && (
            <View style={styles.stat}>
              <DollarSign size={12} color={tokens.white60} />
              <Text style={styles.statValue}>{formatCompact(market_cap_usd)}</Text>
              <Text style={styles.statLabel}>MCap</Text>
            </View>
          )}
          {liquidity_usd != null && (
            <View style={styles.stat}>
              <BarChart3 size={12} color={tokens.cyan} />
              <Text style={styles.statValue}>{formatCompact(liquidity_usd)}</Text>
              <Text style={styles.statLabel}>Liq</Text>
            </View>
          )}
          {volume_24h_usd != null && (
            <View style={styles.stat}>
              <BarChart3 size={12} color={tokens.lavender} />
              <Text style={styles.statValue}>{formatCompact(volume_24h_usd)}</Text>
              <Text style={styles.statLabel}>Vol 24h</Text>
            </View>
          )}
          {price_change_24h != null && (
            <View style={styles.stat}>
              <TrendIcon size={12} color={trendColor} />
              <Text style={[styles.statValue, { color: trendColor }]}>
                {price_change_24h > 0 ? '+' : ''}{price_change_24h.toFixed(1)}%
              </Text>
              <Text style={styles.statLabel}>24h</Text>
            </View>
          )}
          {boost_count != null && boost_count > 0 && (
            <View style={styles.stat}>
              <Zap size={12} color={tokens.warning} />
              <Text style={[styles.statValue, { color: tokens.warning }]}>{boost_count}</Text>
              <Text style={styles.statLabel}>Boosts</Text>
            </View>
          )}
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
});
