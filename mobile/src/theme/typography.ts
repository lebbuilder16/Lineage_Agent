// src/theme/typography.ts
// Typographie — Aurora Glass Design System
// Font: Lexend (weights 400/500/700/800)

import { TextStyle } from "react-native";

// Font family references (loaded via useFonts in _layout.tsx)
export const fontFamily = {
  regular:   "Lexend_400Regular",
  medium:    "Lexend_500Medium",
  bold:      "Lexend_700Bold",
  extraBold: "Lexend_800ExtraBold",
} as const;

// Typography scale — derived from Figma Avenir usage
// Line-height ratio 1.37 for body, 1.1–1.2 for headings (from Figma lineHeightPx data)
// Letter-spacing: labels use +0.2em (from Figma ls=2.0 at sz=10)
export const typography = {
  // Large hero number / balance display
  display: {
    fontFamily: fontFamily.extraBold,
    fontSize: 36,
    lineHeight: 36,       // tight — ratio 1.0
    letterSpacing: -0.72, // -0.02em
  } satisfies TextStyle,

  // Screen title / card heading
  title: {
    fontFamily: fontFamily.extraBold,
    fontSize: 24,
    lineHeight: 26,       // ratio 1.1
    letterSpacing: -0.24, // -0.01em
  } satisfies TextStyle,

  // Section heading
  heading: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    lineHeight: 22,       // ratio 1.2 (from Figma sz=18 lh=21.09)
    letterSpacing: 0,
  } satisfies TextStyle,

  // Body text — primary
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,       // ratio 1.4 (from Figma sz=14 lh=19.12)
    letterSpacing: 0,
  } satisfies TextStyle,

  // Body text — regular weight
  bodyRegular: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  } satisfies TextStyle,

  // Secondary / subtext
  subtext: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,       // ratio 1.37 (from Figma sz=13 lh=17.76)
    letterSpacing: 0,
  } satisfies TextStyle,

  // Caption / small label
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  } satisfies TextStyle,

  // Uppercase badge label — Avenir 900 equivalent
  // From Figma: sz=10 weight=900 ls=2.0 → letter-spacing = 2/10 = 0.2em
  labelUpper: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 2,     // 0.2em at 10px
    textTransform: "uppercase" as const,
  } satisfies TextStyle,

  // Small uppercase label (12px)
  labelUpperSm: {
    fontFamily: fontFamily.extraBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 3,     // 0.25em — from Figma sz=12 weight=900 ls=3.0
    textTransform: "uppercase" as const,
  } satisfies TextStyle,

  // Numeric values (prices, percentages)
  number: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,       // ratio 1.37
    letterSpacing: -0.16,
  } satisfies TextStyle,

  numberLg: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 36,       // from Figma sz=28 lh=35.99
    letterSpacing: -0.28,
  } satisfies TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
