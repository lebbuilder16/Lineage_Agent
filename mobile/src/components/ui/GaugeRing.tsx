import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface GaugeRingProps {
  /** 0 to 1 */
  value: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export function GaugeRing({
  value,
  color = tokens.primary,
  size = 120,
  strokeWidth = 8,
  label,
  sublabel,
}: GaugeRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(Math.min(Math.max(value, 0), 1), {
      duration: tokens.timing.xSlow,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const center = size / 2;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityLabel={`${label ?? 'Progress'}: ${Math.round(value * 100)}%`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={tokens.white10}
          strokeWidth={strokeWidth}
          fill="transparent"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Center labels */}
      {(label !== undefined) && (
        <View style={styles.labels}>
          <Text style={[styles.label, { color }]}>{label}</Text>
          {sublabel !== undefined && (
            <Text style={styles.sublabel}>{sublabel}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { alignItems: 'center' },
  label: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    lineHeight: tokens.font.heading * 1.1,
  },
  sublabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
