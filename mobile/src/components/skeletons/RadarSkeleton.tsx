import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { tokens } from '../../theme/tokens';

/** Contextual skeleton matching the Radar screen layout */
export function RadarSkeleton() {
  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.statItem}>
            <SkeletonLoader width={40} height={20} />
            <SkeletonLoader width={52} height={10} />
          </View>
        ))}
      </View>

      {/* Trending section header */}
      <SkeletonLoader width={100} height={10} style={{ marginTop: 16, marginBottom: 8 }} />

      {/* 3 token cards */}
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.tokenCard}>
          <SkeletonLoader width={32} height={32} borderRadius={8} />
          <View style={styles.tokenInfo}>
            <SkeletonLoader width="60%" height={14} />
            <SkeletonLoader width="35%" height={11} />
          </View>
          <SkeletonLoader width={48} height={22} borderRadius={tokens.radius.pill} />
        </View>
      ))}

      {/* Alert section header */}
      <SkeletonLoader width={120} height={10} style={{ marginTop: 16, marginBottom: 8 }} />

      {/* 2 alert cards */}
      {[0, 1].map((i) => (
        <View key={i} style={styles.alertCard}>
          <SkeletonLoader width={20} height={20} borderRadius={10} />
          <View style={{ flex: 1, gap: 4 }}>
            <SkeletonLoader width="70%" height={12} />
            <SkeletonLoader width="45%" height={10} />
          </View>
          <SkeletonLoader width={28} height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, paddingHorizontal: tokens.spacing.screenPadding },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItem: { alignItems: 'center', gap: 6 },
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    padding: 10,
  },
  tokenInfo: { flex: 1, gap: 6 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    padding: 12,
  },
});
