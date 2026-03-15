// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — Aurora Glass Design System Tokens
// Single source of truth for all colors, radii, shadows, typography
// ─────────────────────────────────────────────────────────────────────────────

export const tokens = {
  // ── Backgrounds (flat) — matched to Figma globals.css ─────────────────────
  bgVoid: '#010410',      // near-void deep navy
  bgMain: '#020617',      // Figma: --bg-main (deep navy-black)
  bgApp:  '#040816',      // Figma: --bg-app
  bgCard: 'rgba(255, 255, 255, 0.04)',  // Figma: bg-card-glass
  bgGlass: 'rgba(255, 255, 255, 0.02)', // Figma: bg-glass
  bgGlass8: 'rgba(255, 255, 255, 0.08)',
  bgGlass12: 'rgba(255, 255, 255, 0.12)',
  bgInputBg: 'rgba(255, 255, 255, 0.05)',
  bgOverlay: 'rgba(0, 0, 0, 0.7)',

  // ── Brand Palette — matched to Figma globals.css ──────────────────────────
  primary: '#091A7A',     // Figma: --color-primary (deep navy indigo)
  secondary: '#ADC8FF',   // Figma: --color-secondary (ice blue accent)
  success: '#00FF88',
  accent: '#FF3366',
  error: '#FF0033',
  warning: '#FF9933',
  neutral: '#6B7280',

  // ── White Opacities (flat) ─────────────────────────────────────────────────
  white100: '#FFFFFF',
  white80: 'rgba(255, 255, 255, 0.80)',
  white60: 'rgba(255, 255, 255, 0.60)',
  white35: 'rgba(255, 255, 255, 0.35)',
  white20: 'rgba(255, 255, 255, 0.20)',
  white10: 'rgba(255, 255, 255, 0.10)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white3: 'rgba(255, 255, 255, 0.03)',

  // ── Risk Colors ────────────────────────────────────────────────────────────
  risk: {
    low: '#00FF88',    // Figma: --color-success
    medium: '#F59E0B', // Figma: Tailwind amber-500 (design DailyStreak)
    high: '#FF9933',   // Figma: --color-warning
    critical: '#FF3366', // Figma: --color-neon-pink
  },

  // ── Border (flat) ──────────────────────────────────────────────────────────
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderMedium: 'rgba(255, 255, 255, 0.15)',
  borderActive: 'rgba(173, 200, 255, 0.40)',  // Figma: secondary (#ADC8FF) at 40%
  borderPrimary: 'rgba(173, 200, 255, 0.15)', // Figma: secondary at 15%

  // ── Radius ─────────────────────────────────────────────────────────────────
  radius: {
    xs: 8,
    sm: 12,
    md: 20,
    lg: 24,
    xl: 32,
    pill: 999,
  },

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadow: {
    glow: {
      shadowColor: '#ADC8FF', // Figma: --color-secondary exact
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 15,
      elevation: 8,
    },
    neonPink: {
      shadowColor: '#FF3366',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 10,
    },
    neonGreen: {
      shadowColor: '#00FF88',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 10,
    },
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  font: {
    hero: 36,
    heading: 28,
    sectionHeader: 20,
    subheading: 16,
    body: 14,
    small: 12,
    tiny: 10,
  },

  // ── Spacing ────────────────────────────────────────────────────────────────
  spacing: {
    screenPadding: 16,
    cardPadding: 16,
    sectionGap: 16,
    itemGap: 8,
  },
} as const;

export type Tokens = typeof tokens;
