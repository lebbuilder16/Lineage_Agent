// src/components/ui/Txt.tsx
// Typography presets — Noelle Design System
// Usage: <Txt variant="title">My title</Txt>

import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { typography } from "@/src/theme/typography";
import { useTheme } from "@/src/theme/ThemeContext";

type TxtVariant =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "bodyRegular"
  | "subtext"
  | "caption"
  | "labelUpper"
  | "labelUpperSm"
  | "number"
  | "numberLg";

interface TxtProps extends TextProps {
  variant?: TxtVariant;
  color?: string;
  muted?: boolean;
  secondary?: boolean;
  dim?: boolean;
}

export function Txt({
  variant = "body",
  color,
  muted,
  secondary,
  dim,
  style,
  children,
  ...rest
}: TxtProps) {
  const { colors } = useTheme();

  const textColor = color
    ?? (muted ? colors.text.muted : secondary ? colors.text.secondary : dim ? colors.text.dim : colors.text.primary);

  return (
    <Text
      style={[typography[variant], { color: textColor }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
