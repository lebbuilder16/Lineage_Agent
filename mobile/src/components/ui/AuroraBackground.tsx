import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

// ─── Aurora blob positions ─────────────────────────────────────────────────────
// Three overlapping radial gradients that slowly drift — GPU-efficient via
// Reanimated worklets on the UI thread.

export function AuroraBackground() {
  const blob1 = useSharedValue(0);
  const blob2 = useSharedValue(0);
  const blob3 = useSharedValue(0);

  React.useEffect(() => {
    blob1.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    blob2.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 11000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    blob3.value = withRepeat(
      withTiming(1, { duration: 13000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [blob1, blob2, blob3]);

  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(blob1.value, [0, 1], [-30, 30]) },
      { translateY: interpolate(blob1.value, [0, 1], [-20, 20]) },
    ],
    opacity: interpolate(blob1.value, [0, 0.5, 1], [0.55, 0.70, 0.55]),
  }));

  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(blob2.value, [0, 1], [20, -20]) },
      { translateY: interpolate(blob2.value, [0, 1], [30, -30]) },
    ],
    opacity: interpolate(blob2.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
  }));

  const blob3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(blob3.value, [0, 1], [10, -15]) },
      { translateY: interpolate(blob3.value, [0, 1], [-10, 25]) },
    ],
    opacity: interpolate(blob3.value, [0, 0.5, 1], [0.12, 0.22, 0.12]),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base dark void */}
      <View style={[StyleSheet.absoluteFill, styles.base]} />

      {/* Blob 1 — Primary purple (#6F6ACF), upper-left */}
      <Animated.View style={[styles.blob, styles.blob1, blob1Style]} />

      {/* Blob 2 — Secondary blue (#ADCEFF), center-right */}
      <Animated.View style={[styles.blob, styles.blob2, blob2Style]} />

      {/* Blob 3 — Accent pink (#FF3366), bottom-left */}
      <Animated.View style={[styles.blob, styles.blob3, blob3Style]} />

      {/* Noise-like texture via radial overlay */}
      <View style={styles.noiseOverlay} />
    </View>
  );
}

const BLOB_SIZE = 420;

const styles = StyleSheet.create({
  base: {
    backgroundColor: tokens.bgMain,
  },
  blob: {
    position: 'absolute',
    width: BLOB_SIZE,
    height: BLOB_SIZE,
    borderRadius: BLOB_SIZE / 2,
  },
  blob1: {
    backgroundColor: tokens.primary,
    top: -120,
    left: -80,
    // React Native doesn't support CSS blur directly — we approximate with opacity
    // For production, use @shopify/react-native-skia MaskFilter for true Gaussian blur
  },
  blob2: {
    backgroundColor: tokens.secondary,
    top: '30%',
    right: -100,
  },
  blob3: {
    backgroundColor: tokens.accent,
    bottom: -100,
    left: -60,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
