// src/components/ui/GlassCard.tsx
// Card glassmorphique de base — Noelle Design System (Dark + Light adaptive)

import React from "react";
import { View, ViewStyle, StyleSheet, StyleProp, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/src/theme/ThemeContext";
import { shadows } from "@/src/theme/shadows";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  noBorder?: boolean;
  borderColor?: string;
  intensity?: number;
  /** Override background color */
  bg?: string;
}

export function GlassCard({
  children,
  style,
  elevated = false,
  noBorder = false,
  borderColor,
  intensity = 18,
  bg,
}: GlassCardProps) {
  const { colors, isDark } = useTheme();

  const resolvedBorder = noBorder
    ? "transparent"
    : borderColor ?? (elevated ? colors.glass.borderBright : colors.glass.border);

  const resolvedBg = bg ?? (elevated ? colors.glass.bgElevated : colors.glass.bg);

  return (
    <View
      style={[
        styles.container,
        elevated ? shadows.card : shadows.cardSm,
        { borderColor: resolvedBorder },
        style,
      ]}
    >
      {/* Glass blur — iOS only; on Android we use solid bg */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={intensity}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Tinted overlay (always rendered, ensures color on Android) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: resolvedBg, borderRadius: 25 },
        ]}
      />

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 25,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});

