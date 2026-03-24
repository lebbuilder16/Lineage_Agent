import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

export interface AlertFilterChipsProps<T extends string = string> {
  filters: FilterOption<T>[];
  activeFilter: T;
  onFilterChange: (value: T) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AlertFilterChips<T extends string = string>({
  filters,
  activeFilter,
  onFilterChange,
}: AlertFilterChipsProps<T>) {
  return (
    <View style={styles.chipsRow}>
      {filters.map((ft) => (
        <TouchableOpacity
          key={ft.value}
          onPress={() => onFilterChange(ft.value)}
          style={[styles.chip, activeFilter === ft.value && styles.chipActive]}
        >
          <Text style={[styles.chipText, activeFilter === ft.value && styles.chipTextActive]}>
            {ft.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: tokens.minTouchSize,
    justifyContent: 'center' as const,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  chipActive: {
    backgroundColor: `${tokens.secondary}20`,
    borderColor: tokens.secondary,
  },
  chipText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  chipTextActive: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
});
