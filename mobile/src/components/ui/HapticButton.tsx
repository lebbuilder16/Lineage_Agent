// src/components/ui/HapticButton.tsx
// Bouton haptique — variantes Primary (gradient) / Secondary / Ghost / Danger
// Primary: LinearGradient Noelle (#622EC3 → #53E9F6), pill shape

import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";
import { typography } from "@/src/theme/typography";

type HapticFeedback = "light" | "medium" | "heavy";

interface HapticButtonProps extends TouchableOpacityProps {
  label?: string;
  children?: React.ReactNode;
  hapticStyle?: HapticFeedback;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Noelle gradient stops (4-stop, from Figma)
const GRADIENT: [string, string, string, string] = [
  "#622EC3",
  "#4D65DB",
  "#379AEE",
  "#53E9F6",
];
const GRADIENT_LOCATIONS: [number, number, number, number] = [0, 0.29, 0.69, 1];

export function HapticButton({
  label,
  children,
  hapticStyle = "light",
  variant = "primary",
  size = "md",
  style,
  textStyle,
  onPress,
  disabled,
  ...rest
}: HapticButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = async (event: any) => {
    const impact =
      hapticStyle === "heavy"
        ? Haptics.ImpactFeedbackStyle.Heavy
        : hapticStyle === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
    await Haptics.impactAsync(impact);
    onPress?.(event);
  };

  const sizeStyle = sizeStyles[size];

  const inner = children ?? (
    <Text
      style={[
        styles.text,
        sizeStyle.text,
        variant === "primary" ? styles.textPrimary : { color: variant === "danger" ? colors.accent.danger : colors.text.primary },
        disabled && styles.disabled,
        textStyle,
      ]}
    >
      {label}
    </Text>
  );

  if (variant === "primary") {
    return (
      <AnimatedTouchable
        style={[styles.base, sizeStyle.container, style, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={rest.accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!disabled }}
        {...rest}
      >
        <LinearGradient
          colors={GRADIENT}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 100 }]}
        />
        {inner}
      </AnimatedTouchable>
    );
  }

  const containerStyle =
    variant === "secondary"
      ? [styles.base, styles.secondary, { borderColor: colors.glass.border }, sizeStyle.container]
      : variant === "ghost"
      ? [styles.base, styles.ghost, sizeStyle.container]
      : [styles.base, styles.danger, { borderColor: `${colors.accent.danger}50` }, sizeStyle.container];

  return (
    <AnimatedTouchable
      style={[...containerStyle, style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
    >
      {inner}
    </AnimatedTouchable>
  );
}

const sizeStyles = {
  sm: StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
    text: { ...typography.caption, fontFamily: "PlusJakartaSans_700Bold", fontSize: 12 },
  }),
  md: StyleSheet.create({
    container: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 100 },
    text: { ...typography.body, fontFamily: "PlusJakartaSans_700Bold" },
  }),
  lg: StyleSheet.create({
    container: { paddingHorizontal: 32, paddingVertical: 18, borderRadius: 100 },
    text: { ...typography.heading, fontFamily: "PlusJakartaSans_700Bold" },
  }),
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    overflow: "hidden",
  },
  text: {
    letterSpacing: 0.3,
  },
  textPrimary: {
    color: "#FFFFFF",
  },
  secondary: {
    backgroundColor: "rgba(98,46,195,0.12)",
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: "rgba(221,86,86,0.12)",
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.4,
  },
});


