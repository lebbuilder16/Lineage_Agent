// src/components/ui/TimeSectionHeader.tsx
// Séparateur de groupe temporel : "JUST NOW", "LAST HOUR", "EARLIER TODAY".

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";

interface TimeSectionHeaderProps {
  label: string;
}

export function TimeSectionHeader({ label }: TimeSectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.line, { backgroundColor: colors.glass.border }]} />
      <Text style={[styles.label, { color: colors.text.muted }]}>{label.toUpperCase()}</Text>
      <View style={[styles.line, { backgroundColor: colors.glass.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  line: { flex: 1, height: 1 },
  label: { fontSize: 10, fontWeight: "600", letterSpacing: 1.5 },
});
