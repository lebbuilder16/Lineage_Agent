// src/theme/colors.ts
// Tokens de couleur centraux — "Dark Intel" Design System

export const colors = {
  background: {
    deep: "#0A0A0F",
    mid: "#111118",
    surface: "#16161F",
  },
  glass: {
    bg: "rgba(255, 255, 255, 0.07)",
    bgElevated: "rgba(255, 255, 255, 0.12)",
    border: "rgba(255, 255, 255, 0.08)",
    borderBright: "rgba(255, 255, 255, 0.15)",
  },
  accent: {
    safe: "#00FF9D",
    danger: "#FF3B5C",
    warning: "#FFB547",
    ai: "#9B59F7",
    blue: "#3B82F6",
  },
  text: {
    primary: "#F0F0FF",
    secondary: "#B0B0CC",
    muted: "#6B6B8A",
  },
  risk: {
    low: "#00FF9D",
    medium: "#FFB547",
    high: "#FF7A2F",
    critical: "#FF3B5C",
    insufficient_data: "#6B6B8A",
    first_rug: "#FF3B5C",
  },
  verdict: {
    clean: "#00FF9D",
    suspicious: "#FFB547",
    insider_dump: "#FF3B5C",
    confirmed_team_extraction: "#FF3B5C",
    suspected_team_extraction: "#FF7A2F",
    coordinated_dump_unknown_team: "#FFB547",
    early_buyers_no_link_proven: "#00FF9D",
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
