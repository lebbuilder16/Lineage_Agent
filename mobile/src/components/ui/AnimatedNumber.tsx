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
import { colors } from "@/src/theme/colors";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: "400" | "500" | "600" | "700";
  formatter?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  duration = 600,
  color = colors.text.primary,
  fontSize = 16,
  fontWeight = "600",
  formatter = (n) => Math.floor(n).toLocaleString(),
}: AnimatedNumberProps) {
  const sv = useSharedValue(0);

  useEffect(() => {
    sv.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.quad),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    text: formatter(sv.value),
    defaultValue: formatter(sv.value),
  }));

  return (
    <AnimatedTextInput
      style={[styles.text, { color, fontSize, fontWeight }]}
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
