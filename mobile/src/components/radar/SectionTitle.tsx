import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

export function SectionTitle({
  icon,
  title,
  badge,
  onSeeAll,
  liveDot,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  onSeeAll?: () => void;
  liveDot?: boolean;
}) {
  return (
    <Pressable
      onPress={onSeeAll}
      disabled={!onSeeAll}
      style={styles.sectionHeader}
      accessibilityRole="header"
    >
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
      {liveDot && <View style={styles.liveDot} />}
      {badge && <Text style={styles.feedTag}>{badge}</Text>}
      {onSeeAll && (
        <View style={styles.sectionSeeAll}>
          <Text style={styles.sectionSeeAllText}>See all</Text>
          <ChevronRight size={12} color={`${tokens.secondary}60`} strokeWidth={2.5} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 1.5,
  },
  sectionSeeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionSeeAllText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: `${tokens.secondary}60`, letterSpacing: 0.3 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.success },
  feedTag: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: `${tokens.secondary}60`,
    letterSpacing: 1,
    marginLeft: 'auto',
  },
});
