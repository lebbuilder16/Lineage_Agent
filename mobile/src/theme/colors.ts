// src/theme/colors.ts
// Tokens de couleur centraux — Noelle Design System (Dark + Light)

// ─── Accent / Risk / Verdict tokens (same in both modes) ─────────────────────
const accent = {
  safe: "#5BC763",
  gain: "#6EC62F",
  danger: "#DD5656",
  dangerDark: "#D65151",
  warning: "#F2AD4B",
  amber: "#DDA76E",
  ai: "#622EC3",
  aiLight: "#B370F0",
  cyan: "#53E9F6",
  mint: "#72E4C5",
  pink: "#ED569D",
  blue: "#4D65DB",
} as const;

const risk = {
  low: "#5BC763",
  medium: "#F2AD4B",
  high: "#E3A33D",
  critical: "#DD5656",
  insufficient_data: "#666666",
  first_rug: "#DD5656",
} as const;

const verdict = {
  clean: "#5BC763",
  suspicious: "#F2AD4B",
  insider_dump: "#DD5656",
  confirmed_team_extraction: "#DD5656",
  suspected_team_extraction: "#E3A33D",
  coordinated_dump_unknown_team: "#F1AD4B",
  early_buyers_no_link_proven: "#5BC763",
} as const;

const ui = {
  grey1: "#BBBBBB",
  grey2: "#DDDDDD",
  grey3: "#EEEEEE",
} as const;

// ─── Dark palette ─────────────────────────────────────────────────────────────
export const darkColors = {
  background: {
    deep: "#000000",
    mid: "#181818",
    surface: "#282828",
  },
  glass: {
    bg: "rgba(59, 45, 143, 0.25)",
    bgElevated: "rgba(59, 45, 143, 0.40)",
    border: "rgba(255, 255, 255, 0.10)",
    borderBright: "rgba(255, 255, 255, 0.25)",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#AAAAAA",
    muted: "#666666",
    dim: "#878787",
    label: "#A1A1A1",
  },
  accent,
  risk,
  verdict,
  ui,
} as const;

// ─── Light palette (derived from Noelle Dark) ─────────────────────────────────
export const lightColors = {
  background: {
    deep: "#FFFFFF",
    mid: "#F5F4FF",
    surface: "#EBEBFF",
  },
  glass: {
    bg: "rgba(98, 46, 195, 0.06)",
    bgElevated: "rgba(98, 46, 195, 0.11)",
    border: "rgba(98, 46, 195, 0.15)",
    borderBright: "rgba(98, 46, 195, 0.30)",
  },
  text: {
    primary: "#0B0B1E",
    secondary: "#4A4A6A",
    muted: "#7A7A9A",
    dim: "#ADADC9",
    label: "#6A6A8A",
  },
  accent,
  risk,
  verdict,
  ui,
} as const;

// ─── Default export (dark — maintained for backward compat) ───────────────────
// NOTE: Components should use useTheme() instead for adaptive colors.
export const colors = darkColors;

// Structural type — not tied to literal values of darkColors
export type NoelleColors = {
  readonly background: { readonly deep: string; readonly mid: string; readonly surface: string };
  readonly glass: { readonly bg: string; readonly bgElevated: string; readonly border: string; readonly borderBright: string };
  readonly text: { readonly primary: string; readonly secondary: string; readonly muted: string; readonly dim: string; readonly label: string };
  readonly accent: typeof accent;
  readonly risk: typeof risk;
  readonly verdict: typeof verdict;
  readonly ui: typeof ui;
};
export type RiskLevel = keyof typeof risk;
export type VerdictKey = keyof typeof verdict;

export function riskColor(level: string): string {
  return (risk as Record<string, string>)[level] ?? darkColors.text.muted;
}

export function verdictColor(v: string): string {
  return (verdict as Record<string, string>)[v] ?? darkColors.text.muted;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 0.9) return "critical";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}
