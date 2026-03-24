import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

/** Contextual skeleton matching the Token Detail screen layout */
export function TokenDetailSkeleton() {
  return (
    <View style={styles.container}>
      {/* Hero card */}
      <GlassCard>
        <View style={styles.heroRow}>
          <SkeletonLoader width={56} height={56} borderRadius={12} />
          <View style={styles.heroInfo}>
            <SkeletonLoader width="50%" height={18} />
            <SkeletonLoader width="30%" height={13} />
            <SkeletonLoader width="70%" height={10} />
          </View>
          <SkeletonLoader width={80} height={80} borderRadius={40} />
        </View>
      </GlassCard>

      {/* Risk summary */}
      <GlassCard>
        <View style={{ gap: 10 }}>
          <SkeletonLoader width="40%" height={14} />
          <SkeletonLoader width="90%" height={12} />
          <SkeletonLoader width="60%" height={12} />
          <View style={styles.statsStrip}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.statBox}>
                <SkeletonLoader width={32} height={16} />
                <SkeletonLoader width={44} height={9} />
              </View>
            ))}
          </View>
          <SkeletonLoader width="100%" height={44} borderRadius={tokens.radius.md} />
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, paddingHorizontal: tokens.spacing.screenPadding },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroInfo: { flex: 1, gap: 6 },
  statsStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statBox: { alignItems: 'center', gap: 4 },
});
