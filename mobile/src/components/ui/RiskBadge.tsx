// src/components/ui/RiskBadge.tsx
// Badge coloré affichant le niveau de risque ou un verdict

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { riskColor, verdictColor } from "@/theme/colors";

interface RiskBadgeProps {
  label: string;
  /** Si fourni, utilise la palette "risk" ; sinon utilise "verdict" */
  riskLevel?: string;
  verdict?: string;
  size?: "sm" | "md" | "lg";
}

export function RiskBadge({ label, riskLevel, verdict, size = "md" }: RiskBadgeProps) {
  const color = riskLevel
    ? riskColor(riskLevel)
    : verdict
    ? verdictColor(verdict)
    : "#6B6B8A";

  const textSize = size === "sm" ? 10 : size === "lg" ? 14 : 12;
  const paddingH = size === "sm" ? 6 : size === "lg" ? 12 : 8;
  const paddingV = size === "sm" ? 2 : size === "lg" ? 6 : 3;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}20`,
          borderColor: `${color}60`,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: textSize }]}>
        {label.toUpperCase()}
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
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
