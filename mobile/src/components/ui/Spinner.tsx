import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

export function Spinner({ size = 20, color = tokens.secondary }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));
  const r = size / 2;
  const stroke = size * 0.12;
  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <View style={[styles.spinnerTrack, { width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: `${color}25` }]} />
      <View style={[styles.spinnerArc, { width: size, height: size, borderRadius: r, borderWidth: stroke, borderTopColor: color, borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spinnerTrack: { position: 'absolute' },
  spinnerArc: { position: 'absolute' },
});
