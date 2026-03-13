// src/components/ui/AnimatedNumber.tsx
// Nombre animé avec effet count-up via Reanimated + TextInput.
// Pattern standard pour animer du texte numérique sans re-render JS sur chaque frame.

import React, { useEffect } from "react";
import { TextInput, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: "400" | "500" | "600" | "700";
}

export function AnimatedNumber({
  value,
  duration = 600,
  color,
  fontSize = 16,
  fontWeight = "600",
}: AnimatedNumberProps) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.text.primary;
  const sv = useSharedValue(0);

  useEffect(() => {
    sv.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.quad),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    "worklet";
    // toLocaleString is not available on the UI thread; format manually
    const n = Math.floor(sv.value);
    const text = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return { text, defaultValue: text };
  });

  return (
    <AnimatedTextInput
      style={[styles.text, { color: resolvedColor, fontSize, fontWeight }]}
      animatedProps={animatedProps}
      editable={false}
      underlineColorAndroid="transparent"
      selectTextOnFocus={false}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  text: {
    padding: 0,
    margin: 0,
  },
});
