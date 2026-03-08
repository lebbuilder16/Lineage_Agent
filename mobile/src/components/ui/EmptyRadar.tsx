// src/components/ui/EmptyRadar.tsx
// État vide animé — cercles concentriques pulsants style radar.

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { colors } from "@/src/theme/colors";

interface EmptyRadarProps {
  message?: string;
}

function PulsingRing({ size, delay }: { size: number; delay: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.25, { duration: 1600 }),
          withTiming(1, { duration: 1600 })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.15, { duration: 1600 }),
          withTiming(0.5, { duration: 1600 })
        ),
        -1,
        false
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.accent.safe,
        },
        animStyle,
      ]}
    />
  );
}

export function EmptyRadar({ message = "Monitoring all mints..." }: EmptyRadarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.radarWrapper}>
        <PulsingRing size={120} delay={400} />
        <PulsingRing size={80} delay={200} />
        <PulsingRing size={40} delay={0} />
        {/* Dot central */}
        <View style={styles.dot} />
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 20,
  },
  radarWrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.safe,
  },
  message: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
