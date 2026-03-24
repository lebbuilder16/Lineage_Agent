import { TextStyle } from 'react-native';
import { tokens } from './tokens';

/**
 * Pixel-perfect typography mapped directly from Figma.
 * Fixes the "Android Default" basic gap by enforcing strict line-heights,
 * proper font weights (via our loaded Lexend fonts), and accurate letter spacing.
 */
export const typography = {
  // Hero (Numbers/Big titles)
  hero: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.hero, // 36
    lineHeight: Math.round(tokens.font.hero * 1.2), // 43px
    letterSpacing: -0.5,
    color: tokens.white100,
  } as TextStyle,

  // Page Headers
  heading: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading, // 28
    lineHeight: Math.round(tokens.font.heading * 1.3), // 36px
    letterSpacing: -0.3,
    color: tokens.white100,
  } as TextStyle,

  // Section / Card Headers
  sectionHeader: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.sectionHeader, // 20
    lineHeight: Math.round(tokens.font.sectionHeader * 1.4), // 28px
    letterSpacing: 0,
    color: tokens.white100,
  } as TextStyle,

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
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small, // 12
    lineHeight: Math.round(tokens.font.small * 1.4), // 17px
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.primary,
  } as TextStyle,

  // Tiny details (e.g. timestamps, very small tags)
  tiny: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny, // 10
    lineHeight: Math.round(tokens.font.tiny * 1.4), // 14px
    letterSpacing: 0.5,
    color: tokens.textTertiary,
  } as TextStyle,

  // Values in rows/tables (clean numbers)
  value: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body, // 14
    lineHeight: Math.round(tokens.font.body * 1.5), // 21px
    letterSpacing: 0,
    fontVariant: ['tabular-nums'], 
    color: tokens.white100,
  } as TextStyle,
};
