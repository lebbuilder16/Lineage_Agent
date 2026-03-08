// src/components/ui/NewAlertsBanner.tsx
// Bannière sticky "▲ X new alerts" qui slide depuis le haut quand de nouvelles alertes arrivent.

import React, { useEffect } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { colors } from "@/src/theme/colors";

interface NewAlertsBannerProps {
  count: number;
  onPress: () => void;
}

export function NewAlertsBanner({ count, onPress }: NewAlertsBannerProps) {
  const translateY = useSharedValue(-48);

  useEffect(() => {
    translateY.value = withSpring(count > 0 ? 0 : -48, {
      damping: 18,
      stiffness: 200,
    });
  }, [count > 0]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (count === 0) return null;

  return (
    <Animated.View style={[styles.wrapper, animStyle]} pointerEvents="box-none">
      <TouchableOpacity style={styles.pill} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.text}>▲ {count} new alert{count > 1 ? "s" : ""}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  pill: {
    backgroundColor: `${colors.accent.safe}18`,
    borderColor: `${colors.accent.safe}50`,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  text: {
    color: colors.accent.safe,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
