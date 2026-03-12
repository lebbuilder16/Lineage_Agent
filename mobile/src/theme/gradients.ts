// src/theme/gradients.ts
// Gradient tokens — Noelle Dark Design System
// Source: Figma file a6PHaT6GaxDYFGRuGNxTGZ
//
// Usage with expo-linear-gradient:
//   import { LinearGradient } from "expo-linear-gradient";
//   <LinearGradient {...gradients.primary} style={styles.btn} />

export const gradients = {
  // Main CTA gradient — purple → blue → sky → cyan (4 stops from Figma btn)
  primary: {
    colors: ["#622EC3", "#4D65DB", "#379AEE", "#53E9F6"] as const,
    locations: [0, 0.29, 0.69, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Purple accent — header / banner
  purple: {
    colors: ["#622EC3", "#B370F0"] as const,
    locations: [0, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Gold / warm — rewards, premium features
  gold: {
    colors: ["#DC8E1F", "#F0B54F", "#F7E7AC"] as const,
    locations: [0, 0.5, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Chart area fill — cyan to teal (vertical)
  chart: {
    colors: ["#08D0E6", "#0ECEA6"] as const,
    locations: [0, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Glass overlay — used for card backgrounds
  glass: {
    colors: ["rgba(59,45,143,0.40)", "rgba(59,45,143,0.15)"] as const,
    locations: [0, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  // Dark fade — bottom overlay for pages
  fadeDark: {
    colors: ["rgba(0,0,0,0)", "rgba(0,0,0,0.80)"] as const,
    locations: [0, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
} as const;

export type GradientKey = keyof typeof gradients;
