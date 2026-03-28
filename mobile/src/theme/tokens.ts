// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — Aurora Glass Design System Tokens
// Single source of truth for all colors, radii, shadows, typography
// ─────────────────────────────────────────────────────────────────────────────

export const tokens = {
  // ── Backgrounds (flat) — matched to Figma globals.css ─────────────────────
  bgVoid: '#010410',      // near-void deep navy
  bgMain: '#020617',      // Figma: --bg-main (deep navy-black)
  bgApp:  '#040816',      // Figma: --bg-app
  bgCard: 'rgba(255, 255, 255, 0.03)',  // Figma: --bg-card exact
  bgGlass: 'rgba(255, 255, 255, 0.05)', // Figma: --bg-glass exact
  bgGlass8: 'rgba(255, 255, 255, 0.08)',
  bgGlass12: 'rgba(255, 255, 255, 0.12)',
  bgInputBg: 'rgba(255, 255, 255, 0.05)',
  bgOverlay: 'rgba(0, 0, 0, 0.7)',

  // ── Semantic surfaces — contextual glass tints ────────────────────────────
  bgCardAI: 'rgba(139, 92, 246, 0.06)',     // violet tint for AI verdict cards
  bgCardWarn: 'rgba(249, 115, 22, 0.05)',    // warm orange tint for warning cards
  bgCardSuccess: 'rgba(0, 255, 136, 0.04)', // faint green for positive cards

  // ── Brand Palette — matched to Figma globals.css ──────────────────────────
  primary: '#091A7A',     // Figma: --color-primary (deep navy indigo)
  secondary: '#ADC8FF',   // Figma: --color-secondary (ice blue accent)
  success: '#00FF88',
  accent: '#FF3366',
  error: '#FF0033',
  warning: '#FF9933',
  neutral: '#6B7280',

  // ── Extended accents — bioluminescent 2026 ────────────────────────────────
  lavender: '#C4B5FD',    // warm violet glow — AI/agent indicators
  violet: '#8B5CF6',      // rich purple — verdict, intelligence
  indigo: '#6366F1',      // deep indigo — buttons, links
  cyan: '#06B6D4',        // electric cyan — sol_flow traces
  gold: '#FFD666',        // premium amber — whale tier, achievements
  peach: '#FDA4AF',       // soft coral — soft warnings

  // ── White Opacities (flat) ─────────────────────────────────────────────────
  white100: '#FFFFFF',
  white80: 'rgba(255, 255, 255, 0.80)',
  white60: 'rgba(255, 255, 255, 0.60)',
  white35: 'rgba(255, 255, 255, 0.35)',
  white20: 'rgba(255, 255, 255, 0.20)',
  white10: 'rgba(255, 255, 255, 0.10)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white3: 'rgba(255, 255, 255, 0.03)',

  // ── Tinted text — softer than pure white, less eye strain ─────────────────
  // WCAG 2.2 AA compliant on bgMain (#020617)
  textPrimary: '#F1F5F9',   // slate-100 — headings (~16:1)
  textBody: 'rgba(203, 213, 225, 0.92)',  // slate-300 — body copy (~13:1)
  textMuted: 'rgba(148, 163, 184, 0.65)', // slate-400 — labels, hints (~5.2:1)
  textTertiary: 'rgba(255, 255, 255, 0.55)',  // ~7.5:1 on bgMain — replaces white35 for text
  textDisabled: 'rgba(255, 255, 255, 0.30)',  // ~3.5:1 — large text (≥18px bold) or decorative only
  textPlaceholder: 'rgba(255, 255, 255, 0.35)', // placeholder text — exempt from WCAG contrast requirements

  // ── Risk Colors ────────────────────────────────────────────────────────────
  risk: {
    low: '#00FF88',    // Figma: --color-success
    medium: '#F59E0B', // Figma: Tailwind amber-500 (design DailyStreak)
    high: '#FF9933',   // Figma: --color-warning
    critical: '#FF3366', // Figma: --color-neon-pink
  },

  // ── Pipeline step colors — unique per analysis type ────────────────────────
  step: {
    identity: '#818CF8',       // indigo-400
    deployer_profile: '#F59E0B', // amber-500
    death_clock: '#EF4444',    // red-500
    bundle: '#8B5CF6',         // violet-500
    sol_flow: '#06B6D4',       // cyan-500
    cartel: '#F97316',         // orange-500
    insider_sell: '#EC4899',   // pink-500
    operator_fingerprint: '#A78BFA', // violet-400
    factory_rhythm: '#34D399', // emerald-400
    operator_impact: '#FB923C', // orange-400
  },

  // ── Border (flat) ──────────────────────────────────────────────────────────
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderMedium: 'rgba(255, 255, 255, 0.15)',
  borderActive: 'rgba(173, 200, 255, 0.40)',  // Figma: secondary (#ADC8FF) at 40%
  borderPrimary: 'rgba(173, 200, 255, 0.15)', // Figma: secondary at 15%
  borderViolet: 'rgba(139, 92, 246, 0.25)',   // violet glow border for AI cards

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
      shadowColor: '#ADC8FF',
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
    violet: {
      shadowColor: '#8B5CF6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.30,
      shadowRadius: 16,
      elevation: 8,
    },
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    // ── Colored content-aware shadows ──────────────────────────────────────
    riskLow: {
      shadowColor: '#00FF88',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 16,
      elevation: 8,
    },
    riskMedium: {
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 16,
      elevation: 8,
    },
    riskHigh: {
      shadowColor: '#FF9933',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    riskCritical: {
      shadowColor: '#FF3366',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius: 18,
      elevation: 10,
    },
    cyan: {
      shadowColor: '#06B6D4',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
      elevation: 8,
    },
    gold: {
      shadowColor: '#FFD666',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
      elevation: 8,
    },
  },

  // ── Gradients (color stops — consumed by LinearGradient components) ───────
  gradient: {
    primaryCTA: ['#2D1B69', '#4F46E5', '#818CF8'],  // violet → indigo → periwinkle
    investigate: ['#1A0B3E', '#4F46E5', '#ADC8FF'],  // deep purple → indigo → ice
    verdict: ['#1E1145', '#4C1D95', '#7C3AED'],      // royal purple mesh
    success: ['#064E3B', '#059669', '#00FF88'],       // emerald depth → neon
    danger: ['#4C0519', '#DC2626', '#FF3366'],        // crimson depth → neon pink
    gold: ['#78350F', '#D97706', '#FFD666'],          // amber depth → gold
    glass: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.00)'], // existing glass highlight
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  font: {
    hero: 48,       // 2026 premium — large display numbers
    heading: 32,
    sectionHeader: 20,
    subheading: 16,
    body: 14,
    small: 12,
    tiny: 10,
    badge: 11,        // badges, pills, chips — never below 11
  },

  // ── Icon sizes ────────────────────────────────────────────────────────────
  icon: {
    xs: 12,
    sm: 14,
    md: 18,
    lg: 24,
    xl: 32,
  },

  // ── Animation timing ──────────────────────────────────────────────────────
  timing: {
    // Durations (ms)
    instant: 100,
    fast: 150,
    normal: 250,
    slow: 400,
    xSlow: 600,       // page transitions, hero reveals
    verySlow: 1200,    // number tickers, gauge fills

    // Spring presets (Reanimated withSpring config)
    spring: { damping: 15, stiffness: 400 },       // general purpose
    springBouncy: { damping: 8, stiffness: 300 },   // tab press, watch toggle
    springSnappy: { damping: 12, stiffness: 300 },  // scale pops, quick bounce
    springGentle: { damping: 20, stiffness: 200 },  // sheets, modals

    // Stagger delays (ms)
    listItem: 30,      // between list items
    sectionEntry: 80,  // between major sections

    // Entry animation durations (ms)
    fadeIn: 200,
    slideIn: 300,
  },

  // ── Z-index scale ─────────────────────────────────────────────────────────
  zIndex: {
    base: 0,
    card: 1,
    sticky: 10,
    dropdown: 50,
    modal: 100,
    toast: 200,
  },

  // ── Touch targets ─────────────────────────────────────────────────────────
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  minTouchSize: 44,  // Apple HIG minimum

  // ── Spacing ────────────────────────────────────────────────────────────────
  spacing: {
    screenPadding: 16,
    cardPadding: 16,
    sectionGap: 16,
    itemGap: 8,
    rowPadding: 12,
    compactPadding: 8,
    // Semantic spacing
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    inlinePadding: 12,    // horizontal padding of inline elements
    touchMinSize: 44,     // minimum interactive element size (Apple HIG)
    listItemGap: 6,       // between list items
    panelGap: 14,         // between panels in detail screens
    headerBottom: 20,     // space below section headers
  },
} as const;

export type Tokens = typeof tokens;
