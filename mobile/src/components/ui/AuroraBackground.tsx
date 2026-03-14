import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  BlurMask,
  SweepGradient,
  vec,
  BlendMode,
  ColorMatrix,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

// High-performance Aurora Background using Skia + Reanimated
// Replaces opaque circles with True Gaussian Blurs + Grain effect

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();

  // Shared values for animation physics (0 to 1)
  const drift1 = useSharedValue(0);
  const drift2 = useSharedValue(0);
  const drift3 = useSharedValue(0);

  useEffect(() => {
    drift1.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    drift2.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 14000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    drift3.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [drift1, drift2, drift3]);

  // Derived positions and scales for Skia
  const cx1 = useDerivedValue(() => width * 0.2 + drift1.value * (width * 0.3));
  const cy1 = useDerivedValue(() => height * 0.1 + drift1.value * (height * 0.1));
  
  const cx2 = useDerivedValue(() => width * 0.8 - drift2.value * (width * 0.4));
  const cy2 = useDerivedValue(() => height * 0.4 + drift2.value * (height * 0.2));

  const cx3 = useDerivedValue(() => width * 0.3 + drift3.value * (width * 0.2));
  const cy3 = useDerivedValue(() => height * 0.8 - drift3.value * (height * 0.15));

  // Radii
  const r1 = width * 0.7;
  const r2 = width * 0.6;
  const r3 = width * 0.45;

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Dark void base */}
        <Group>
          {/* Blob 1: Primary Purple */}
          <Circle cx={cx1} cy={cy1} r={r1} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[tokens.primary, tokens.bgMain, tokens.primary]}
            />
            <BlurMask blur={90} style="normal" />
          </Circle>

          {/* Blob 2: Secondary Blue */}
          <Circle cx={cx2} cy={cy2} r={r2} blendMode="screen">
             <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[tokens.secondary, tokens.bgVoid, tokens.secondary]}
            />
            <BlurMask blur={80} style="normal" />
          </Circle>

          {/* Blob 3: Accent Pink */}
          <Circle cx={cx3} cy={cy3} r={r3} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[tokens.accent, tokens.primary, tokens.accent]}
            />
            <BlurMask blur={100} style="normal" />
          </Circle>
        </Group>
      </Canvas>
      {/* CSS overlay to dim and add CSS-based pseudo grain */}
      <View style={styles.noiseOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgMain,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', 
    // Opacity down to 0.5 allows the glowing blobs from canvas to shine through perfectly
  },
});
