import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withTiming(0.35, { duration: tokens.timing.xSlow, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
    scale.value = withRepeat(
      withTiming(1.35, { duration: tokens.timing.xSlow, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, [reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.pulsingDot, { backgroundColor: color }, animStyle]}
      accessibilityElementsHidden
    />
  );
}

const styles = StyleSheet.create({
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
