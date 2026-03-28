import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { tokens } from '../../theme/tokens';

interface ScreenHeaderProps {
  icon: React.ReactNode;
  /** Glow color behind the icon — defaults to tokens.secondary */
  glowColor?: string;
  title: string;
  subtitle?: string;
  /** Rendered on the right side of the header row */
  rightAction?: React.ReactNode;
  /** When provided renders a live-status dot (true = connected green, false = offline grey) */
  dotConnected?: boolean;
  /** Extra space below the header block */
  paddingBottom?: number;
  /** Override outer row styles (e.g. paddingHorizontal: 0 when parent already pads) */
  style?: ViewStyle;
}

export function ScreenHeader({
  icon,
  glowColor = tokens.secondary,
  title,
  subtitle,
  rightAction,
  dotConnected,
  paddingBottom = 20,
  style,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.row, { paddingBottom }, style]}>
      {/* Left: glow + icon + text */}
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconGlow, { backgroundColor: glowColor }]} />
          {icon}
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      {/* Right: optional custom action + optional dot */}
      <View style={styles.right}>
        {rightAction}
        {dotConnected !== undefined && (
          <View style={styles.dotWrap}>
            <View
              style={[
                styles.dot,
                { backgroundColor: dotConnected ? tokens.success : tokens.white20 },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: tokens.spacing.screenPadding,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    position: 'relative',
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    opacity: 0.20,
    borderRadius: 100,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: 26,
    color: tokens.white100,
    letterSpacing: -0.52,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
