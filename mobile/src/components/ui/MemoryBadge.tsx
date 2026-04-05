import React from 'react';
import { Text, View, StyleSheet, ViewStyle } from 'react-native';
import { Brain } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

type MemoryDepth = 'deep' | 'partial' | 'first_encounter';

const MEMORY_CONFIG: Record<MemoryDepth, { label: string; color: string }> = {
  deep: { label: 'DEEP MEMORY', color: tokens.risk.low },
  partial: { label: 'PARTIAL', color: tokens.risk.medium },
  first_encounter: { label: '1ST ENCOUNTER', color: tokens.textTertiary },
};

interface MemoryBadgeProps {
  depth: MemoryDepth | string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function MemoryBadge({ depth, size = 'sm', style }: MemoryBadgeProps) {
  const config = MEMORY_CONFIG[(depth as MemoryDepth)] ?? MEMORY_CONFIG.first_encounter;
  const isLg = size === 'md';

  return (
    <View
      style={[
        styles.badge,
        isLg ? styles.badgeLg : styles.badgeSm,
        { backgroundColor: `${config.color}12`, borderColor: `${config.color}35` },
        style,
      ]}
    >
      <Brain size={isLg ? 10 : 8} color={config.color} />
      <Text style={[styles.text, isLg ? styles.textLg : styles.textSm, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 2 },
  badgeLg: { paddingHorizontal: 9, paddingVertical: 3 },
  text: {
    fontFamily: 'Lexend-Bold',
    letterSpacing: 0.5,
  },
  textSm: { fontSize: 7 },
  textLg: { fontSize: 9 },
});
