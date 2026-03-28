import { TextStyle } from 'react-native';
import { tokens } from './tokens';

/**
 * Aurora Glass Design System — Typography
 * Dual-font system: Space Grotesk (display) + Lexend (body)
 * Space Grotesk for hero numbers, headings, scores — high personality
 * Lexend for body, labels, meta — clean readability
 */
export const typography = {
  // ── Display font (Space Grotesk) — headings & hero numbers ────────────────

  // Hero numbers / big scores (risk %, accuracy, price)
  hero: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: tokens.font.hero, // 48
    lineHeight: Math.round(tokens.font.hero * 1.1), // 53px — tight
    letterSpacing: -1.5,
    color: tokens.white100,
  } as TextStyle,

  // Page headers
  heading: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: tokens.font.heading, // 32
    lineHeight: Math.round(tokens.font.heading * 1.2), // 38px
    letterSpacing: -0.8,
    color: tokens.white100,
  } as TextStyle,

  // Section / Card Headers
  sectionHeader: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: tokens.font.sectionHeader, // 20
    lineHeight: Math.round(tokens.font.sectionHeader * 1.3), // 26px
    letterSpacing: -0.3,
    color: tokens.white100,
  } as TextStyle,

  // ── Body font (Lexend) — readable content ─────────────────────────────────

  // Emphasized body / subtitles
  subheading: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.subheading, // 16
    lineHeight: Math.round(tokens.font.subheading * 1.4), // 22px
    letterSpacing: 0.1,
    color: tokens.white80,
  } as TextStyle,

  // Standard paragraph text
  body: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body, // 14
    lineHeight: Math.round(tokens.font.body * 1.5), // 21px
    letterSpacing: 0.2,
    color: tokens.white60,
  } as TextStyle,

  // Meta info, tags, small labels
  small: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small, // 12
    lineHeight: Math.round(tokens.font.small * 1.4), // 17px
    letterSpacing: 0.2,
    color: tokens.white60,
  } as TextStyle,

  // Overlines, CAPS locking labels (like "SCAN TOKEN")
  overline: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: tokens.font.small, // 12
    lineHeight: Math.round(tokens.font.small * 1.4), // 17px
    letterSpacing: 2.0,
    textTransform: 'uppercase',
    color: tokens.secondary,
  } as TextStyle,

  // Tiny details (e.g. timestamps, very small tags)
  tiny: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny, // 10
    lineHeight: Math.round(tokens.font.tiny * 1.4), // 14px
    letterSpacing: 0.5,
    color: tokens.textTertiary,
  } as TextStyle,

  // Values in rows/tables (clean numbers — display font for numeric clarity)
  value: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: tokens.font.body, // 14
    lineHeight: Math.round(tokens.font.body * 1.5), // 21px
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
    color: tokens.white100,
  } as TextStyle,

  // Score / metric display (medium size, for stat pills, gauge labels)
  metric: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: tokens.white100,
  } as TextStyle,
};
