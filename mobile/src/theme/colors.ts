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
    danger: "#DD5656",
    warning: "#F1AD4B",
    ai: "#622EC3",
    aiLight: "#B370F0",
    cyan: "#53E9F6",
    blue: "#4D65DB",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#AAAAAA",
    muted: "#666666",
  },
  risk: {
    low: "#5BC763",
    medium: "#F1AD4B",
    high: "#E3A33D",
    critical: "#DD5656",
    insufficient_data: "#666666",
    first_rug: "#DD5656",
  },
  verdict: {
    clean: "#5BC763",
    suspicious: "#F1AD4B",
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
