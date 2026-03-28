import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import {
  Canvas,
  Text as SkiaText,
  LinearGradient,
  useFont,
  vec,
  Group,
} from '@shopify/react-native-skia';
import { tokens } from '../../theme/tokens';

type GradientPreset = 'ice' | 'violet' | 'success' | 'danger' | 'gold' | 'cyan';

const GRADIENT_PRESETS: Record<GradientPreset, string[]> = {
  ice: ['#ADC8FF', '#E0EAFF', '#ADC8FF'],
  violet: ['#C4B5FD', '#8B5CF6', '#6366F1'],
  success: ['#00FF88', '#34D399', '#06D6A0'],
  danger: ['#FF3366', '#FF6B6B', '#FF3366'],
  gold: ['#FFD666', '#FFC107', '#FFB300'],
  cyan: ['#06B6D4', '#22D3EE', '#67E8F9'],
};

interface GradientTextProps {
  children: string;
  fontSize?: number;
  fontFamily?: string;
  gradient?: GradientPreset;
  colors?: string[];
  width?: number;
  height?: number;
  style?: ViewStyle;
}

/**
 * Premium gradient text using Skia canvas rendering.
 * Use for hero numbers, key scores, and important metrics.
 */
export function GradientText({
  children,
  fontSize = 48,
  fontFamily = 'SpaceGrotesk-Bold',
  gradient = 'ice',
  colors,
  width: propWidth,
  height: propHeight,
  style,
}: GradientTextProps) {
  const font = useFont(
    fontFamily === 'SpaceGrotesk-Bold'
      ? require('../../../assets/fonts/SpaceGrotesk-Bold.ttf')
      : fontFamily === 'SpaceGrotesk-SemiBold'
      ? require('../../../assets/fonts/SpaceGrotesk-SemiBold.ttf')
      : fontFamily === 'SpaceGrotesk-Medium'
      ? require('../../../assets/fonts/SpaceGrotesk-Medium.ttf')
      : fontFamily === 'Lexend-Bold'
      ? require('../../../assets/fonts/Lexend-Bold.ttf')
      : require('../../../assets/fonts/SpaceGrotesk-Bold.ttf'),
    fontSize,
  );

  const gradientColors = colors ?? GRADIENT_PRESETS[gradient];

  if (!font) return null;

  const textWidth = font.measureText(children).width;
  const canvasWidth = propWidth ?? Math.ceil(textWidth + 4);
  const canvasHeight = propHeight ?? Math.ceil(fontSize * 1.3);

  return (
    <Canvas style={[{ width: canvasWidth, height: canvasHeight }, style]}>
      <Group>
        <SkiaText
          x={0}
          y={fontSize}
          text={children}
          font={font}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(canvasWidth, 0)}
            colors={gradientColors}
          />
        </SkiaText>
      </Group>
    </Canvas>
  );
}
