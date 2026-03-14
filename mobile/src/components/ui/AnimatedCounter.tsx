import React, { useEffect } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

const AnimatedText = Animated.createAnimatedComponent(Text);

interface AnimatedCounterProps {
  value: number;
  format?: (n: number) => string;
  style?: TextStyle;
  duration?: number;
}

const defaultFormat = (n: number) => n.toFixed(0);

export function AnimatedCounter({
  value,
  format = defaultFormat,
  style,
  duration = 700,
}: AnimatedCounterProps) {
  const animValue = useSharedValue(0);

  useEffect(() => {
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => ({
    text: format(animValue.value),
  }));

  return (
    // @ts-ignore — Animated text prop
    <AnimatedText animatedProps={animatedProps} style={[styles.text, style]} />
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
  },
});
