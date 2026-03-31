import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

interface RefVsNowPanelProps {
  reference: { price_usd: number | null; liq_usd: number | null; risk_score: number } | null;
  current: { price_usd: number | null; liq_usd: number | null; risk_score: number } | null;
  deltas: { price_pct: number | null; liq_pct: number | null; risk_delta: number } | null;
}

function formatPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return '-';
  if (v < 0.0001) return `$${v.toExponential(1)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatLiq(v: number | null | undefined): string {
  if (v == null) return '-';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function DeltaBadge({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null) return <Text style={styles.dash}>-</Text>;
  const isNeg = value < 0;
  const color = isNeg ? tokens.risk.critical : tokens.success;
  return (
    <Text style={[styles.delta, { color }]}>
      {value > 0 ? '+' : ''}{Math.round(value)}{suffix}
    </Text>
  );
}

export function RefVsNowPanel({ reference, current, deltas }: RefVsNowPanelProps) {
  if (!reference && !current) return null;

  const rows = [
    {
      label: 'Price',
      ref: formatPrice(reference?.price_usd),
      now: formatPrice(current?.price_usd),
      delta: deltas?.price_pct ?? null,
    },
    {
      label: 'Risk',
      ref: reference ? `${reference.risk_score}` : '-',
      now: current ? `${current.risk_score}` : '-',
      delta: deltas?.risk_delta ?? null,
      suffix: '',
    },
    {
      label: 'Liquidity',
      ref: formatLiq(reference?.liq_usd),
      now: formatLiq(current?.liq_usd),
      delta: deltas?.liq_pct ?? null,
    },
  ];

  return (
    <View style={styles.container}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.ref}</Text>
          <Text style={styles.arrow}>{'\u2192'}</Text>
          <Text style={styles.value}>{row.now}</Text>
          <DeltaBadge value={row.delta} suffix={row.suffix ?? '%'} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    width: 60, color: tokens.textTertiary,
    fontFamily: 'Lexend-Regular', fontSize: 12,
  },
  value: {
    color: tokens.white80, fontFamily: 'Lexend-Medium', fontSize: 12,
    minWidth: 50,
  },
  arrow: { color: tokens.white35, fontSize: 10 },
  delta: { fontFamily: 'Lexend-SemiBold', fontSize: 11, minWidth: 40 },
  dash: { color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 11 },
});
