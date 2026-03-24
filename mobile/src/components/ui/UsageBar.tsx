import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

interface UsageBarProps {
  label: string;
  used: number;
  total: number;
  color?: string;
}

export function UsageBar({ label, used, total, color }: UsageBarProps) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const barColor =
    color ?? (pct > 0.85 ? tokens.error : pct > 0.6 ? tokens.warning : tokens.success);

  const animStyle = useAnimatedStyle(() => ({
    width: withTiming(`${pct * 100}%`, { duration: 600 }),
  }));

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.count}>
          {used}
          <Text style={styles.countDim}> / {total === Infinity ? '∞' : total}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: barColor }, animStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white60 },
  count: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white80 },
  countDim: { color: tokens.textTertiary },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.bgGlass8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
});
