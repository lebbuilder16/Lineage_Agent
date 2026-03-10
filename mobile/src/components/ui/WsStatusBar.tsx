// src/components/ui/WsStatusBar.tsx
// Barre de statut WebSocket — slide depuis le haut quand déconnecté.

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import type { WsConnectionState } from "@/src/lib/websocket";
import { colors } from "@/src/theme/colors";

interface WsStatusBarProps {
  state: WsConnectionState;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reconnecting: {
    label: "◌  Reconnecting...",
    color: colors.accent.warning,
    bg: `${colors.accent.warning}15`,
  },
  connecting: {
    label: "◌  Connecting...",
    color: colors.accent.warning,
    bg: `${colors.accent.warning}15`,
  },
  disconnected: {
    label: "⊗  Offline — alerts paused",
    color: colors.text.muted,
    bg: `${colors.text.muted}15`,
  },
};

export function WsStatusBar({ state }: WsStatusBarProps) {
  const height = useSharedValue(0);

  const isVisible = state !== "connected";
  const config = isVisible ? (STATUS_CONFIG[state] ?? null) : null;

  useEffect(() => {
    height.value = withSpring(isVisible ? 28 : 0, { damping: 20, stiffness: 220 });
  }, [isVisible]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    overflow: "hidden",
  }));

  return (
    <Animated.View style={[styles.container, config ? { backgroundColor: config.bg } : undefined, animStyle]}>
      {config && (
        <View style={styles.inner}>
          <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
