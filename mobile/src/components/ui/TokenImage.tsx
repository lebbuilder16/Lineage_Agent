// src/components/ui/TokenImage.tsx
// Image de token avec fallback placeholders

import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "@/src/theme/colors";

interface TokenImageProps {
  uri: string;
  size?: number;
  symbol?: string;
  borderRadius?: number;
}

export function TokenImage({ uri, size = 48, symbol, borderRadius }: TokenImageProps) {
  const [error, setError] = useState(false);
  const radius = borderRadius ?? size * 0.25;

  if (!uri || error) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}
      >
        <Text style={[styles.fallbackText, { fontSize: size * 0.35 }]}>
          {(symbol ?? "?").slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      onError={() => setError(true)}
      transition={250}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.glass.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  fallbackText: {
    color: colors.text.muted,
    fontWeight: "700",
  },
});
