// src/theme/colors.ts
// Tokens de couleur centraux — Noelle Dark Design System

export const colors = {
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
  accent: {
    safe: "#5BC763",
    gain: "#6EC62F",      // positive % labels (+4.36%, +13%)
    danger: "#DD5656",
    dangerDark: "#D65151", // error shape variant
    warning: "#F2AD4B",  // fixed from #F1AD4B — matches Figma exactly
    amber: "#DDA76E",    // gold arrows & chart circles
    ai: "#622EC3",
    aiLight: "#B370F0",
    cyan: "#53E9F6",
    mint: "#72E4C5",     // teal-mint accent
    pink: "#ED569D",     // hot pink icon accent
    blue: "#4D65DB",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#AAAAAA",
    muted: "#666666",
    dim: "#878787",      // dates & category labels
    label: "#A1A1A1",   // number labels
  },
  ui: {
    grey1: "#BBBBBB",   // base elements
    grey2: "#DDDDDD",   // lines & dividers
    grey3: "#EEEEEE",   // near-white shapes & names
  },
  risk: {
    low: "#5BC763",
    medium: "#F2AD4B",
    high: "#E3A33D",
    critical: "#DD5656",
    insufficient_data: "#666666",
    first_rug: "#DD5656",
  },
  verdict: {
    clean: "#5BC763",
    suspicious: "#F2AD4B",
    insider_dump: "#DD5656",
    confirmed_team_extraction: "#DD5656",
    suspected_team_extraction: "#E3A33D",
    coordinated_dump_unknown_team: "#F1AD4B",
    early_buyers_no_link_proven: "#5BC763",
  },
} as const;

export type RiskLevel = keyof typeof colors.risk;
export type VerdictKey = keyof typeof colors.verdict;

export function riskColor(level: string): string {
  return (colors.risk as Record<string, string>)[level] ?? colors.text.muted;
}

export function verdictColor(verdict: string): string {
  return (colors.verdict as Record<string, string>)[verdict] ?? colors.text.muted;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 0.9) return "critical";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}
