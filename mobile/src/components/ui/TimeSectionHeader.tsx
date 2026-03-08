// src/components/ui/TimeSectionHeader.tsx
// Séparateur de groupe temporel : "JUST NOW", "LAST HOUR", "EARLIER TODAY".

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme/colors";

interface TimeSectionHeaderProps {
  label: string;
}

export function TimeSectionHeader({ label }: TimeSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.line} />
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
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glass.border,
  },
  label: {
    color: colors.text.muted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
});
