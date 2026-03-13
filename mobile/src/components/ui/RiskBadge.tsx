// src/components/ui/RiskBadge.tsx
// Badge coloré affichant le niveau de risque ou un verdict — Noelle Design System

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { riskColor, verdictColor, colors } from "@/src/theme/colors";
import { typography } from "@/src/theme/typography";

interface RiskBadgeProps {
  label: string;
  riskLevel?: string;
  verdict?: string;
  size?: "sm" | "md" | "lg";
}

export function RiskBadge({ label, riskLevel, verdict, size = "md" }: RiskBadgeProps) {
  const color = riskLevel
    ? riskColor(riskLevel)
    : verdict
    ? verdictColor(verdict)
    : colors.text.muted;

  const textSize = size === "sm" ? 10 : size === "lg" ? 14 : 12;
  const paddingH = size === "sm" ? 8 : size === "lg" ? 14 : 10;
  const paddingV = size === "sm" ? 3 : size === "lg" ? 7 : 4;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}1A`,
          borderColor: `${color}55`,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: textSize }]}>
        {(label ?? "").toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    letterSpacing: 0.8,
  },
});
