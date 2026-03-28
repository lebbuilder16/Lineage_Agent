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
  cancelAnimation,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// High-performance Aurora Background using Skia + Reanimated
// Replaces opaque circles with True Gaussian Blurs + Grain effect

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // Shared values for animation physics (0 to 1)
  const drift1 = useSharedValue(0);
  const drift2 = useSharedValue(0);
  const drift3 = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      // Park blobs at midpoints for a pleasant static composition
      cancelAnimation(drift1);
      cancelAnimation(drift2);
      cancelAnimation(drift3);
      drift1.value = 0.5;
      drift2.value = 0.5;
      drift3.value = 0.5;
      return;
    }

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
  }, [drift1, drift2, drift3, reducedMotion]);

  // Derived positions — match Figma DynamicBackground radial positions
  // Blob 1: upper-left 20%/30% → drifts right
  const cx1 = useDerivedValue(() => width * 0.2 + drift1.value * (width * 0.25));
  const cy1 = useDerivedValue(() => height * 0.25 + drift1.value * (height * 0.08));

  // Blob 2: lower-right 80%/70% → drifts left  
  const cx2 = useDerivedValue(() => width * 0.8 - drift2.value * (width * 0.3));
  const cy2 = useDerivedValue(() => height * 0.65 + drift2.value * (height * 0.1));

  // Blob 3: center drifts slowly
  const cx3 = useDerivedValue(() => width * 0.5 + drift3.value * (width * 0.15));
  const cy3 = useDerivedValue(() => height * 0.45 - drift3.value * (height * 0.1));

  // Radii — large soft halos as in Figma (50% viewport)
  const r1 = width * 0.65;
  const r2 = width * 0.55;
  const r3 = width * 0.4;

  // Figma secondary color (#ADC8FF) as low-opacity blobs on deep navy base
  const icyBlue = 'rgba(173, 200, 255, 0.15)'; // matches Figma: rgba(173,200,255,0.15)
  const icyBlueMid = 'rgba(173, 200, 255, 0.10)';
  const icyBlueFaint = 'rgba(173, 200, 255, 0.08)';

  return (
    <View style={styles.container} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {/* Blob 1: soft ice-blue upper-left — Figma "circle at 20% 30%" */}
          <Circle cx={cx1} cy={cy1} r={r1} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[icyBlue, 'rgba(0,0,0,0)', icyBlue]}
            />
            <BlurMask blur={80} style="normal" />
          </Circle>

          {/* Blob 2: softer ice-blue lower-right — Figma "circle at 80% 70%" */}
          <Circle cx={cx2} cy={cy2} r={r2} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[icyBlueMid, 'rgba(0,0,0,0)', icyBlueMid]}
            />
            <BlurMask blur={90} style="normal" />
          </Circle>

          {/* Blob 3: faint center ellipse — Figma "ellipse at center" */}
          <Circle cx={cx3} cy={cy3} r={r3} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[icyBlueFaint, 'rgba(0,0,0,0)', icyBlueFaint]}
            />
            <BlurMask blur={100} style="normal" />
          </Circle>
        </Group>
      </Canvas>
      {/* Very light overlay — lets the navy base + blue halos shine */}
      <View style={styles.noiseOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617', // Figma: --bg-main deep navy
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)', // lighter mask — halos must breathe
  },
});
