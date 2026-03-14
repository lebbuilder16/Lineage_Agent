import React from 'react';
import { StyleSheet, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  noPadding?: boolean;
}

export function GlassCard({ children, style, intensity = 18, noPadding }: GlassCardProps) {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[styles.card, noPadding ? styles.noPadding : undefined, style]}
    >
      {/* Top highlight gradient — adds depth */}
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.00)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle luminous border — 1px white tint */}
      <View style={styles.border} pointerEvents="none" />
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    padding: tokens.spacing.cardPadding,
    backgroundColor: tokens.bgCard,
  },
  noPadding: {
    padding: 0,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
});
