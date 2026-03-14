import React from 'react';
import { Text, View, StyleSheet, ViewStyle } from 'react-native';
import { tokens } from '../../theme/tokens';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const RISK_COLORS: Record<RiskLevel, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

interface RiskBadgeProps {
  level: RiskLevel | string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function RiskBadge({ level, size = 'sm', style }: RiskBadgeProps) {
  const normalizedLevel = (level?.toLowerCase() as RiskLevel) ?? 'medium';
  const color = RISK_COLORS[normalizedLevel] ?? tokens.neutral;
  const label = RISK_LABELS[normalizedLevel] ?? level?.toUpperCase();
  const isLg = size === 'md';

  return (
    <View
      style={[
        styles.badge,
        isLg ? styles.badgeLg : styles.badgeSm,
        {
          backgroundColor: `${color}1A`,
          borderColor: `${color}50`,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          isLg ? styles.textLg : styles.textSm,
          { color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSm: { paddingHorizontal: 8, paddingVertical: 2 },
  badgeLg: { paddingHorizontal: 12, paddingVertical: 4 },
  text: {
    fontFamily: 'Lexend-Bold',
    letterSpacing: 0.8,
  },
  textSm: { fontSize: tokens.font.tiny },
  textLg: { fontSize: tokens.font.small },
});
