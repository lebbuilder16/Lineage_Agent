import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

/** Contextual skeleton matching the Investigate screen layout */
export function InvestigateSkeleton() {
  return (
    <View style={styles.container}>
      {/* Progress ring placeholder */}
      <View style={styles.ringRow}>
        <SkeletonLoader width={100} height={100} borderRadius={50} />
      </View>

      {/* Scan steps */}
      <GlassCard>
        <View style={{ gap: 8 }}>
          <SkeletonLoader width="35%" height={12} />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.stepRow}>
              <SkeletonLoader width={18} height={18} borderRadius={9} />
              <SkeletonLoader width="55%" height={12} />
              <SkeletonLoader width={36} height={10} style={{ marginLeft: 'auto' }} />
            </View>
          ))}
        </View>
      </GlassCard>

      {/* Findings section */}
      <GlassCard>
        <View style={{ gap: 8 }}>
          <SkeletonLoader width="45%" height={12} />
          <SkeletonLoader width="90%" height={11} />
          <SkeletonLoader width="75%" height={11} />
          <SkeletonLoader width="60%" height={11} />
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, paddingHorizontal: tokens.spacing.screenPadding },
  ringRow: { alignItems: 'center', paddingVertical: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
