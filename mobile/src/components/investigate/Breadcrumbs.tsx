import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

export interface BreadcrumbsProps {
  trail: Array<{ label: string; route?: string; active?: boolean }>;
}

export function Breadcrumbs({ trail }: BreadcrumbsProps) {
  if (trail.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scrollView}
    >
      {trail.map((crumb, index) => {
        const isActive = crumb.active ?? false;

        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && (
              <ChevronRight
                size={12}
                color={tokens.textTertiary}
                style={styles.chevron}
              />
            )}
            {isActive || !crumb.route ? (
              <View style={[styles.pill, isActive && styles.pillActive]}>
                <Text
                  style={[styles.pillText, isActive && styles.pillTextActive]}
                  numberOfLines={1}
                >
                  {crumb.label}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pill}
                onPress={() => router.push(crumb.route as any)}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Navigate to ${crumb.label}`}
              >
                <Text style={styles.pillText} numberOfLines={1}>
                  {crumb.label}
                </Text>
              </TouchableOpacity>
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  chevron: {
    marginHorizontal: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
  },
  pillActive: {
    backgroundColor: `${tokens.secondary}18`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
    // offset the border so pill size stays consistent
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    maxWidth: 120,
  },
  pillTextActive: {
    fontFamily: 'Lexend-SemiBold',
    color: tokens.secondary,
  },
});
