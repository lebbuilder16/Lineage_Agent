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

// Aurora Background — Solana Mobile inspired teal/mint + violet palette
// Soft drifting blobs on deep dark canvas for premium depth

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const drift1 = useSharedValue(0);
  const drift2 = useSharedValue(0);
  const drift3 = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
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

  // Blob 1: upper-left → drifts right
  const cx1 = useDerivedValue(() => width * 0.2 + drift1.value * (width * 0.25));
  const cy1 = useDerivedValue(() => height * 0.25 + drift1.value * (height * 0.08));

  // Blob 2: lower-right → drifts left
  const cx2 = useDerivedValue(() => width * 0.8 - drift2.value * (width * 0.3));
  const cy2 = useDerivedValue(() => height * 0.65 + drift2.value * (height * 0.1));

  // Blob 3: center drifts slowly
  const cx3 = useDerivedValue(() => width * 0.5 + drift3.value * (width * 0.15));
  const cy3 = useDerivedValue(() => height * 0.45 - drift3.value * (height * 0.1));

  const r1 = width * 0.65;
  const r2 = width * 0.55;
  const r3 = width * 0.4;

  // Solana Mobile palette — mint teal + warm violet for warm/cool contrast
  const mintTeal = 'rgba(207, 230, 228, 0.12)';     // #CFE6E4 — Solana Mobile primary
  const warmViolet = 'rgba(139, 92, 246, 0.09)';     // #8B5CF6 — warm contrast blob
  const lightBlue = 'rgba(149, 210, 230, 0.08)';     // #95D2E6 — Solana Mobile cyan

  return (
    <View style={styles.container} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {/* Blob 1: mint teal upper-left — Solana Mobile primary accent */}
          <Circle cx={cx1} cy={cy1} r={r1} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[mintTeal, 'rgba(0,0,0,0)', mintTeal]}
            />
            <BlurMask blur={80} style="normal" />
          </Circle>

          {/* Blob 2: warm violet lower-right — warm/cool contrast */}
          <Circle cx={cx2} cy={cy2} r={r2} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[warmViolet, 'rgba(0,0,0,0)', warmViolet]}
            />
            <BlurMask blur={90} style="normal" />
          </Circle>

          {/* Blob 3: light blue center — Solana Mobile heading color */}
          <Circle cx={cx3} cy={cy3} r={r3} blendMode="screen">
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[lightBlue, 'rgba(0,0,0,0)', lightBlue]}
            />
            <BlurMask blur={100} style="normal" />
          </Circle>
        </Group>
      </Canvas>
      <View style={styles.noiseOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0F12', // bgMain — dark charcoal
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
