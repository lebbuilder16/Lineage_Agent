// src/components/ui/GlassCard.tsx
// Card glassmorphique de base — réutilisée partout dans l'app

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
