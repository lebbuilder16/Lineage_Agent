// src/components/ui/HapticButton.tsx
// Bouton avec retour haptique — wrapper universel

import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { colors } from "@/theme/colors";

type HapticStyle = "light" | "medium" | "heavy";

interface HapticButtonProps extends TouchableOpacityProps {
  label?: string;
  children?: React.ReactNode;
  hapticStyle?: HapticStyle;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

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

  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <AnimatedTouchable
      style={[styles.base, variantStyle.container, sizeStyle.container, style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={1}
      {...rest}
    >
      {children ?? (
        <Text
          style={[
            styles.text,
            variantStyle.text,
            sizeStyle.text,
            disabled && styles.disabled,
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantStyles = {
  primary: StyleSheet.create({
    container: {
      backgroundColor: colors.accent.safe,
    },
    text: {
      color: colors.background.deep,
    },
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: colors.glass.bg,
      borderWidth: 1,
      borderColor: colors.glass.border,
    },
    text: {
      color: colors.text.primary,
    },
  }),
  ghost: StyleSheet.create({
    container: {
      backgroundColor: "transparent",
    },
    text: {
      color: colors.accent.safe,
    },
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: `${colors.accent.danger}20`,
      borderWidth: 1,
      borderColor: `${colors.accent.danger}60`,
    },
    text: {
      color: colors.accent.danger,
    },
  }),
};

const sizeStyles = {
  sm: StyleSheet.create({
    container: { paddingHorizontal: 12, paddingVertical: 6 },
    text: { fontSize: 13 },
  }),
  md: StyleSheet.create({
    container: { paddingHorizontal: 20, paddingVertical: 12 },
    text: { fontSize: 15 },
  }),
  lg: StyleSheet.create({
    container: { paddingHorizontal: 28, paddingVertical: 16 },
    text: { fontSize: 17 },
  }),
};
