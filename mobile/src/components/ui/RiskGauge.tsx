// src/components/ui/RiskGauge.tsx
// Jauge circulaire animée pour afficher un score de risque (0-100)

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { riskColor, riskLevelFromScore } from "@/theme/colors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RiskGaugeProps {
  score: number; // 0.0 – 1.0
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function RiskGauge({
  score,
  size = 80,
  strokeWidth = 6,
  showLabel = true,
}: RiskGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(score, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const level = riskLevelFromScore(score);
  const color = riskColor(level);
  const label = Math.round(score * 100).toString();

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showLabel && (
        <Text style={[styles.label, { color, fontSize: size * 0.25 }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
