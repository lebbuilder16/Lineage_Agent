import React, { useEffect } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { tokens } from '../../theme/tokens';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Animated number counter with Space Grotesk display font.
 * Uses Reanimated animatedProps for UI-thread animation.
 */
export function NumberTicker({ value, color }: { value: number | null; color: string }) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    if (value === null) return;
    animatedValue.value = withTiming(value, {
      duration: tokens.timing.verySlow,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    text: Math.round(animatedValue.value).toLocaleString(),
    defaultValue: '0',
  }));

  if (value === null) {
    return <SkeletonLoader width={52} height={26} style={{ marginVertical: 4 }} />;
  }

  return (
    <AnimatedTextInput
      editable={false}
      style={[styles.statValue, { color }]}
      animatedProps={animatedProps}
      defaultValue="0"
    />
  );
}

const styles = StyleSheet.create({
  statValue: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 18,
    color: tokens.white80,
    padding: 0,
    margin: 0,
    letterSpacing: -0.5,
  },
});
