// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — Aurora Glass Design System Tokens
// Single source of truth for all colors, radii, shadows, typography
// Palette inspired by Solana Mobile (teal/mint on deep dark)
// ─────────────────────────────────────────────────────────────────────────────

export const tokens = {
  // ── Backgrounds — deep dark layered surfaces ─────────────────────────────
  bgVoid: '#010101',      // near-black (Solana Mobile root)
  bgMain: '#0A0F12',      // primary background — dark charcoal with cool cast
  bgApp:  '#101618',      // elevated surface — cards, tab bar (Solana Mobile card bg)
  bgCard: 'rgba(255, 255, 255, 0.03)',  // glass card base
  bgGlass: 'rgba(255, 255, 255, 0.05)', // glass surface
  bgGlass8: 'rgba(255, 255, 255, 0.08)',
  bgGlass12: 'rgba(255, 255, 255, 0.12)',
  bgInputBg: 'rgba(255, 255, 255, 0.05)',
  bgOverlay: 'rgba(0, 0, 0, 0.7)',

  // ── Semantic surfaces — contextual glass tints ────────────────────────────
  bgCardAI: 'rgba(139, 92, 246, 0.08)',     // violet tint for AI verdict cards
  bgCardWarn: 'rgba(249, 115, 22, 0.06)',    // warm orange tint for warning cards
  bgCardSuccess: 'rgba(0, 255, 136, 0.05)', // faint green for positive cards
  bgCardDanger: 'rgba(255, 51, 102, 0.05)', // faint pink for critical alerts
  bgCardCyan: 'rgba(6, 182, 212, 0.05)',    // faint cyan for sol_flow cards
  bgCardGold: 'rgba(255, 214, 102, 0.05)',  // faint gold for premium/whale cards

  // ── Brand Palette — Solana Mobile inspired ───────────────────────────────
  primary: '#10282C',     // deep teal dark (Solana Mobile dark section bg)
  secondary: '#CFE6E4',   // mint/teal — primary accent (Solana Mobile CTA, glow)
  success: '#00FF88',
  accent: '#FF3366',
  error: '#FF0033',
  warning: '#FF9933',
  neutral: '#6B7280',

  // ── Extended accents ─────────────────────────────────────────────────────
  lavender: '#C4B5FD',    // warm violet glow — AI/agent indicators
  violet: '#8B5CF6',      // rich purple — verdict, intelligence
  indigo: '#6366F1',      // deep indigo — buttons, links
  cyan: '#95D2E6',        // light blue (Solana Mobile heading color)
  gold: '#FFD666',        // premium amber — whale tier, achievements
  peach: '#FDA4AF',       // soft coral — soft warnings
  rose: '#F43F5E',        // warm rose — hot alerts
  teal: '#61AFBD',        // medium teal (Solana Mobile mid accent)
  amber: '#F59E0B',       // warm amber — warnings, warm contrast

  // ── White Opacities (flat) ─────────────────────────────────────────────────
  white100: '#FFFFFF',
  white80: 'rgba(255, 255, 255, 0.80)',
  white60: 'rgba(255, 255, 255, 0.60)',
  white35: 'rgba(255, 255, 255, 0.35)',
  white20: 'rgba(255, 255, 255, 0.20)',
  white10: 'rgba(255, 255, 255, 0.10)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white3: 'rgba(255, 255, 255, 0.03)',

  // ── Tinted text — Solana Mobile text hierarchy ───────────────────────────
  // WCAG 2.2 AA compliant on bgMain (#0A0F12)
  textPrimary: '#F6F6F5',   // off-white (Solana Mobile primary text) (~16:1)
  textBody: 'rgba(246, 246, 245, 0.85)',  // off-white at 85% for body (~13:1)
  textMuted: '#99B3BE',      // blue-gray muted (Solana Mobile muted text) (~5.5:1)
  textTertiary: 'rgba(153, 179, 190, 0.70)',  // muted blue-gray at 70%
  textDisabled: 'rgba(255, 255, 255, 0.30)',  // decorative only
  textPlaceholder: 'rgba(156, 163, 175, 0.60)', // cool gray placeholder

  // ── Risk Colors ────────────────────────────────────────────────────────────
  risk: {
    low: '#00FF88',
    medium: '#F59E0B',
    high: '#FF9933',
    critical: '#FF3366',
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

  // ── Border — Solana Mobile dark gray borders ──────────────────────────────
  borderSubtle: 'rgba(55, 60, 62, 0.60)',    // #373c3e at 60% (Solana Mobile border)
  borderMedium: 'rgba(55, 60, 62, 0.85)',    // #373c3e at 85%
  borderActive: 'rgba(207, 230, 228, 0.40)', // secondary (#CFE6E4) at 40%
  borderPrimary: 'rgba(207, 230, 228, 0.15)', // secondary at 15%
  borderViolet: 'rgba(139, 92, 246, 0.25)',   // violet glow border for AI cards
  borderSuccess: 'rgba(0, 255, 136, 0.20)',
  borderDanger: 'rgba(255, 51, 102, 0.20)',
  borderGold: 'rgba(255, 214, 102, 0.20)',
  borderCyan: 'rgba(149, 210, 230, 0.20)',    // cyan at 20%

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
      shadowColor: '#CFE6E4', // mint teal glow (Solana Mobile CTA glow)
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
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 8,
    },
    riskHigh: {
      shadowColor: '#FF9933',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 14,
      elevation: 8,
    },
    riskCritical: {
      shadowColor: '#FF3366',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
    },
    cyan: {
      shadowColor: '#95D2E6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 8,
    },
    gold: {
      shadowColor: '#FFD666',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 8,
    },
    mint: {
      shadowColor: '#CFE6E4',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.20,
      shadowRadius: 14,
      elevation: 8,
    },
  },

  // ── Gradients ─────────────────────────────────────────────────────────────
  gradient: {
    primaryCTA: ['#10282C', '#1A4A52', '#CFE6E4'],   // deep teal → mint (Solana Mobile)
    investigate: ['#10282C', '#61AFBD', '#CFE6E4'],   // deep teal → medium teal → mint
    verdict: ['#1E1145', '#4C1D95', '#7C3AED'],       // royal purple mesh
    success: ['#064E3B', '#059669', '#00FF88'],        // emerald depth → neon
    danger: ['#4C0519', '#DC2626', '#FF3366'],         // crimson depth → neon pink
    gold: ['#78350F', '#D97706', '#FFD666'],           // amber depth → gold
    glass: ['rgba(207,230,228,0.06)', 'rgba(207,230,228,0.00)'], // mint glass highlight
    // ── Warm/cool mixed gradients ─────────────────────────────────────────
    purpleAmber: ['#2D1B69', '#8B5CF6', '#F59E0B'],
    cyanRose: ['#10282C', '#95D2E6', '#F43F5E'],      // teal dark → light blue → hot rose
    violetPeach: ['#4C1D95', '#8B5CF6', '#FDA4AF'],
    tealGold: ['#10282C', '#CFE6E4', '#FFD666'],       // deep teal → mint → gold
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
    badge: 11,
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
    instant: 100,
    fast: 150,
    normal: 250,
    slow: 400,
    xSlow: 600,
    verySlow: 1200,
    spring: { damping: 15, stiffness: 400 },
    springBouncy: { damping: 8, stiffness: 300 },
    springSnappy: { damping: 12, stiffness: 300 },
    springGentle: { damping: 20, stiffness: 200 },
    listItem: 30,
    sectionEntry: 80,
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
  minTouchSize: 44,

  // ── Spacing ────────────────────────────────────────────────────────────────
  spacing: {
    screenPadding: 16,
    cardPadding: 16,
    sectionGap: 16,
    itemGap: 8,
    rowPadding: 12,
    compactPadding: 8,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    inlinePadding: 12,
    touchMinSize: 44,
    listItemGap: 6,
    panelGap: 14,
    headerBottom: 20,
  },
} as const;

export type Tokens = typeof tokens;
