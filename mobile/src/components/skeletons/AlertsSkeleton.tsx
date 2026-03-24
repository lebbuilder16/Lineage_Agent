import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { tokens } from '../../theme/tokens';

/** Contextual skeleton matching the Alerts screen layout */
export function AlertsSkeleton() {
  return (
    <View style={styles.container}>
      {/* Filter pills row */}
      <View style={styles.pillsRow}>
        {[60, 48, 64, 56].map((w, i) => (
          <SkeletonLoader key={i} width={w} height={30} borderRadius={tokens.radius.pill} />
        ))}
      </View>

      {/* 5 alert cards */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.alertCard}>
          <SkeletonLoader width={22} height={22} borderRadius={11} />
          <View style={{ flex: 1, gap: 5 }}>
            <SkeletonLoader width="65%" height={13} />
            <SkeletonLoader width="40%" height={10} />
          </View>
          <SkeletonLoader width={32} height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingHorizontal: tokens.spacing.screenPadding },
  pillsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
});
