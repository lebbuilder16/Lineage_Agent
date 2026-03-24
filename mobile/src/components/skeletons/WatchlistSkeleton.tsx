import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { tokens } from '../../theme/tokens';

/** Contextual skeleton matching the Watchlist screen layout */
export function WatchlistSkeleton() {
  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <SkeletonLoader width={80} height={14} />
        <View style={{ flex: 1 }} />
        <SkeletonLoader width={32} height={32} borderRadius={8} />
        <SkeletonLoader width={32} height={32} borderRadius={8} />
      </View>

      {/* 4 watch item cards */}
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.watchCard}>
          <SkeletonLoader width={40} height={40} borderRadius={10} />
          <View style={styles.watchInfo}>
            <SkeletonLoader width="55%" height={14} />
            <SkeletonLoader width="35%" height={11} />
            <SkeletonLoader width="70%" height={10} />
          </View>
          <SkeletonLoader width={48} height={22} borderRadius={tokens.radius.pill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingHorizontal: tokens.spacing.screenPadding },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  watchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  watchInfo: { flex: 1, gap: 5 },
});
