// src/components/ui/GlassCard.tsx
// Card glassmorphique de base — Noelle Dark Design System

import React from "react";
import { View, ViewStyle, StyleSheet, StyleProp } from "react-native";
import { BlurView } from "expo-blur";
import { colors } from "@/src/theme/colors";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  noBorder?: boolean;
  borderColor?: string;
  intensity?: number;
}

export function GlassCard({
  children,
  style,
  elevated = false,
  noBorder = false,
  borderColor,
  intensity = 20,
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.container,
        {
          borderColor: noBorder
            ? "transparent"
            : borderColor ?? (elevated ? colors.glass.borderBright : colors.glass.border),
          shadowColor: elevated ? "#622EC3" : "#3B2D8F",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: elevated ? 0.35 : 0.18,
          shadowRadius: elevated ? 16 : 8,
          elevation: elevated ? 8 : 3,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: elevated
              ? colors.glass.bgElevated
              : colors.glass.bg,
            borderRadius: 16,
          },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
