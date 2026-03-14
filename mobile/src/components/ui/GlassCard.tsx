import React, { useState } from 'react';
import { StyleSheet, StyleProp, View, ViewStyle, LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, RoundedRect, LinearGradient as SkiaLinearGradient, vec } from '@shopify/react-native-skia';
import { tokens } from '../../theme/tokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  noPadding?: boolean;
}

export function GlassCard({ children, style, intensity = 24, noPadding }: GlassCardProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    setDimensions({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[styles.card, noPadding ? styles.noPadding : undefined, style]}
      onLayout={onLayout}
    >
      {/* Top highlight gradient — Figma bg-card-glass */}
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.00)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Skia Animated/Gradient Glowing Border — Replaces flat CSS border */}
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
              colors={[
                'rgba(255, 255, 255, 0.45)', // Sharp bright edge (top-left reflection)
                'rgba(255, 255, 255, 0.05)', // Fades to translucent
                tokens.primary + '60',       // Hint of neon purple/primary color
                'rgba(255, 255, 255, 0.0)'   // Fades to nothing
              ]}
              positions={[0, 0.3, 0.75, 1]}
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
    backgroundColor: tokens.bgCard, // rgba(255,255,255,0.04)
    // Figma: box-shadow 0 8px 32px rgba(0,0,0,0.4)
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
