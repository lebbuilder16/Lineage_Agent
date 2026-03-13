// src/theme/colors.ts
// Aurora Glass Design System — dark-only

// ─── Aurora palette ────────────────────────────────────────────────────────────
export const aurora = {
  // Brand
  primary:   "#091A7A",   // deep navy
  secondary: "#ADC8FF",  // sky blue — interactive / active
  accent:    "#FF3366",  // neon pink — CTA / highlights
  // Status
  success:   "#00FF88",  // neon green
  warning:   "#FF9933",  // orange
  error:     "#FF0033",  // red
  // Background
  bgMain:    "#020617",  // near-black
  bgApp:     "#040816",  // app shell
  bgCard:    "rgba(255, 255, 255, 0.03)",
  bgGlass:   "rgba(255, 255, 255, 0.05)",
  // Text
  white:     "#FFFFFF",
  white60:   "rgba(255,255,255,0.60)",
  white40:   "rgba(255,255,255,0.40)",
  white20:   "rgba(255,255,255,0.20)",
  // Borders
  border:    "rgba(255, 255, 255, 0.10)",
  borderBright: "rgba(255, 255, 255, 0.20)",
  // Shadows / glows
  glowBlue:  "rgba(173, 200, 255, 0.20)",
  glowPink:  "rgba(255, 51, 102, 0.40)",
  glowGreen: "rgba(0, 255, 136, 0.40)",
} as const;

// ─── Risk / Verdict tokens (unchanged — used across business logic) ───────────
const risk = {
  low:               "#00FF88",
  medium:            "#FF9933",
  high:              "#FF9933",
  critical:          "#FF0033",
  insufficient_data: "#666666",
  first_rug:         "#FF0033",
} as const;

const verdict = {
  clean:                          "#00FF88",
  suspicious:                     "#FF9933",
  insider_dump:                   "#FF0033",
  confirmed_team_extraction:      "#FF0033",
  suspected_team_extraction:      "#FF9933",
  coordinated_dump_unknown_team:  "#FF9933",
  early_buyers_no_link_proven:    "#00FF88",
} as const;

const ui = {
  grey1: "#BBBBBB",
  grey2: "#DDDDDD",
  grey3: "#EEEEEE",
} as const;

// ─── Backward-compat accent object ────────────────────────────────────────────
const accent = {
  safe:      aurora.success,
  gain:      aurora.success,
  danger:    aurora.error,
  dangerDark:aurora.error,
  warning:   aurora.warning,
  amber:     aurora.warning,
  ai:        aurora.primary,
  aiLight:   aurora.secondary,
  cyan:      aurora.secondary,
  mint:      aurora.success,
  pink:      aurora.accent,
  blue:      aurora.secondary,
} as const;

// ─── Dark palette (Aurora Glass) ──────────────────────────────────────────────
export const darkColors = {
  background: {
    deep:    aurora.bgMain,
    mid:     aurora.bgApp,
    surface: aurora.bgCard,
  },
  glass: {
    bg:          aurora.bgGlass,
    bgElevated:  "rgba(255, 255, 255, 0.08)",
    border:      aurora.border,
    borderBright:aurora.borderBright,
  },
  text: {
    primary:   aurora.white,
    secondary: aurora.white60,
    muted:     aurora.white40,
    dim:       aurora.white20,
    label:     aurora.white60,
  },
  aurora,
  accent,
  risk,
  verdict,
  ui,
} as const;

// Light palette kept minimal — app is dark-only
export const lightColors = darkColors;

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
