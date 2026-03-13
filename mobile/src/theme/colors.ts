// src/theme/colors.ts
// Tokens de couleur centraux — Aurora Glass Design System (Dark + Light)

// ─── Accent / Risk / Verdict tokens (same in both modes) ─────────────────────
const accent = {
  safe: "#00FF88",      // Aurora neon green
  gain: "#00E87A",
  danger: "#FF3366",    // Aurora neon pink
  dangerDark: "#E02255",
  warning: "#F2AD4B",
  amber: "#DDA76E",
  ai: "#622EC3",
  aiLight: "#B370F0",
  cyan: "#ADC8FF",      // Aurora light blue
  mint: "#72E4C5",
  pink: "#FF3366",      // Aurora neon pink alias
  blue: "#091A7A",      // Aurora deep blue
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

// ─── Dark palette — Aurora Glass ──────────────────────────────────────────────
export const darkColors = {
  background: {
    deep: "#091A7A",      // Aurora primary deep blue
    mid: "#0F2280",
    surface: "#1A3090",
  },
  glass: {
    bg: "rgba(173, 200, 255, 0.10)",       // ADC8FF glass tint
    bgElevated: "rgba(173, 200, 255, 0.18)",
    border: "rgba(173, 200, 255, 0.20)",
    borderBright: "rgba(173, 200, 255, 0.40)",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#C8D9FF",
    muted: "#7A96CC",
    dim: "#5A78BB",
    label: "#ADC8FF",
  },
  accent,
  risk,
  verdict,
  ui,
} as const;

// ─── Light palette — Aurora Glass ─────────────────────────────────────────────
export const lightColors = {
  background: {
    deep: "#ADC8FF",      // Aurora light blue
    mid: "#C8D9FF",
    surface: "#DDE9FF",
  },
  glass: {
    bg: "rgba(9, 26, 122, 0.08)",
    bgElevated: "rgba(9, 26, 122, 0.13)",
    border: "rgba(9, 26, 122, 0.15)",
    borderBright: "rgba(9, 26, 122, 0.30)",
  },
  text: {
    primary: "#091A7A",
    secondary: "#1A3090",
    muted: "#3A5080",
    dim: "#5A78BB",
    label: "#2A408A",
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
