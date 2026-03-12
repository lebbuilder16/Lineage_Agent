// src/theme/shadows.ts
// Shadow tokens — Noelle Dark Design System
// Source: Figma file a6PHaT6GaxDYFGRuGNxTGZ (DROP_SHADOW effects)
//
// React Native shadows require separate ios/android properties.
// Usage:
//   import { shadows } from "@/src/theme/shadows";
//   <View style={[styles.card, shadows.card]} />

import { Platform, ViewStyle } from "react-native";

function shadow(
  color: string,
  opacity: number,
  offsetY: number,
  blur: number,
  elevation: number,
): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: blur / 2,
    },
    android: {
      elevation,
    },
    default: {},
  }) as ViewStyle;
}

export const shadows = {
  // Card drop shadow — from Figma: y=30px, blur=50px, #000 alpha=0.25
  card: shadow("#000000", 0.25, 15, 25, 12),

  // Smaller card shadow — from Figma: y=15px, blur=30px, #000 alpha=0.15
  cardSm: shadow("#000000", 0.15, 8, 15, 6),

  // Button primary shadow — from Figma: y=15px, blur=25px, #3B2D8F alpha=0.25
  btnPrimary: shadow("#3B2D8F", 0.25, 8, 12, 8),

  // Button hover/pressed shadow — from Figma: y=10px, blur=20px, #3B2D8F alpha=0.25
  btnHover: shadow("#3B2D8F", 0.25, 5, 10, 5),

  // Subtle card — from Figma: y=10px, blur=10px, #000 alpha=0.15
  subtle: shadow("#000000", 0.15, 5, 5, 3),

  // None — explicit no shadow override
  none: Platform.select({
    ios: { shadowOpacity: 0 },
    android: { elevation: 0 },
    default: {},
  }) as ViewStyle,
} as const;

export type ShadowKey = keyof typeof shadows;
