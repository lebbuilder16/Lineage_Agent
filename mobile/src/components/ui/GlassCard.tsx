import React, { useState } from 'react';
import { StyleSheet, StyleProp, View, ViewStyle, LayoutChangeEvent, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, RoundedRect, LinearGradient as SkiaLinearGradient, vec } from '@shopify/react-native-skia';
import { tokens } from '../../theme/tokens';

export type GlassCardVariant = 'default' | 'alert' | 'ai' | 'success' | 'token' | 'briefing';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  noPadding?: boolean;
  variant?: GlassCardVariant;
}

const VARIANT_CONFIG: Record<GlassCardVariant, {
  bg: string;
  highlightColors: [string, string];
  borderColors: string[];
  borderPositions: number[];
  shadowStyle?: object;
}> = {
  default: {
    bg: tokens.bgCard,
    highlightColors: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.00)'],
    borderColors: [
      'rgba(255, 255, 255, 0.45)',
      'rgba(255, 255, 255, 0.05)',
      tokens.primary + '60',
      'rgba(255, 255, 255, 0.0)',
    ],
    borderPositions: [0, 0.3, 0.75, 1],
  },
  alert: {
    bg: 'rgba(255, 51, 102, 0.04)',
    highlightColors: ['rgba(255, 51, 102, 0.08)', 'rgba(255, 51, 102, 0.00)'],
    borderColors: [
      'rgba(255, 51, 102, 0.40)',
      'rgba(255, 51, 102, 0.10)',
      'rgba(255, 153, 51, 0.20)',
      'rgba(255, 51, 102, 0.0)',
    ],
    borderPositions: [0, 0.25, 0.65, 1],
    shadowStyle: tokens.shadow.riskCritical,
  },
  ai: {
    bg: 'rgba(139, 92, 246, 0.05)',
    highlightColors: ['rgba(139, 92, 246, 0.10)', 'rgba(99, 102, 241, 0.00)'],
    borderColors: [
      'rgba(196, 181, 253, 0.40)',
      'rgba(139, 92, 246, 0.15)',
      'rgba(99, 102, 241, 0.25)',
      'rgba(139, 92, 246, 0.0)',
    ],
    borderPositions: [0, 0.3, 0.7, 1],
    shadowStyle: tokens.shadow.violet,
  },
  success: {
    bg: 'rgba(0, 255, 136, 0.03)',
    highlightColors: ['rgba(0, 255, 136, 0.08)', 'rgba(0, 255, 136, 0.00)'],
    borderColors: [
      'rgba(0, 255, 136, 0.35)',
      'rgba(52, 211, 153, 0.10)',
      'rgba(6, 214, 160, 0.20)',
      'rgba(0, 255, 136, 0.0)',
    ],
    borderPositions: [0, 0.3, 0.7, 1],
    shadowStyle: tokens.shadow.riskLow,
  },
  token: {
    bg: 'rgba(173, 200, 255, 0.03)',
    highlightColors: ['rgba(173, 200, 255, 0.06)', 'rgba(173, 200, 255, 0.00)'],
    borderColors: [
      'rgba(173, 200, 255, 0.35)',
      'rgba(173, 200, 255, 0.08)',
      'rgba(99, 102, 241, 0.15)',
      'rgba(173, 200, 255, 0.0)',
    ],
    borderPositions: [0, 0.3, 0.7, 1],
    shadowStyle: tokens.shadow.glow,
  },
  briefing: {
    bg: 'rgba(99, 102, 241, 0.04)',
    highlightColors: ['rgba(99, 102, 241, 0.08)', 'rgba(139, 92, 246, 0.00)'],
    borderColors: [
      'rgba(99, 102, 241, 0.35)',
      'rgba(139, 92, 246, 0.12)',
      'rgba(196, 181, 253, 0.20)',
      'rgba(99, 102, 241, 0.0)',
    ],
    borderPositions: [0, 0.25, 0.65, 1],
    shadowStyle: tokens.shadow.violet,
  },
};

const windowWidth = Dimensions.get('window').width;

export function GlassCard({ children, style, intensity = 24, noPadding, variant = 'default' }: GlassCardProps) {
  const [dimensions, setDimensions] = useState({
    width: windowWidth - (tokens.spacing.screenPadding * 2),
    height: 100,
  });

  const onLayout = (event: LayoutChangeEvent) => {
    setDimensions({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  const config = VARIANT_CONFIG[variant];

  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[
        styles.card,
        { backgroundColor: config.bg },
        config.shadowStyle,
        noPadding ? styles.noPadding : undefined,
        style,
      ]}
      onLayout={onLayout}
    >
      {/* Top highlight gradient — variant-specific color tint */}
      <LinearGradient
        colors={config.highlightColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Skia Animated/Gradient Glowing Border — variant-colored */}
      {dimensions.width > 0 && dimensions.height > 0 && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <RoundedRect
            x={0.5}
            y={0.5}
            width={dimensions.width - 1}
            height={dimensions.height - 1}
            r={tokens.radius.lg}
            style="stroke"
            strokeWidth={1.5}
          >
            <SkiaLinearGradient
              start={vec(0, 0)}
              end={vec(dimensions.width, dimensions.height)}
              colors={config.borderColors}
              positions={config.borderPositions}
            />
          </RoundedRect>
        </Canvas>
      )}

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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 12,
  },
  noPadding: {
    padding: 0,
  }
});
